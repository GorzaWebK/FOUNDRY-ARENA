// Bot AI.
//
// Each bot runs a finite state machine on top of three shared layers:
//   perception  - FOV cone + line-of-sight raycasts, hearing (gunshots,
//                 footsteps) and a per-enemy memory of last known positions
//   navigation  - A* over the nav grid, runtime path smoothing, local
//                 avoidance and stuck recovery
//   combat      - reaction delay, imperfect aim that tightens while tracking,
//                 target leading, burst fire, weapon choice, use of cover
//
// States: PATROL, CHASE, ATTACK, RETREAT, SEARCH, COLLECT.

import * as THREE from 'three';
import { Character } from './character.js';
import { CFG } from './config.js';
import { moveBody } from './physics.js';
import { BotModel } from './botModel.js';
import { GRENADE } from './weapons.js';

export const STATE = {
  PATROL: 'patrol',
  CHASE: 'chase',
  ATTACK: 'attack',
  RETREAT: 'retreat',
  SEARCH: 'search',
  COLLECT: 'collect',
};

const _eye = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e2 = new THREE.Vector3();

// what bots like to carry (weights)
const PRIMARY_WEIGHTS = [['rifle', 34], ['smg', 24], ['shotgun', 16], ['lmg', 14], ['sniper', 12]];
function rollPrimary() {
  let r = Math.random() * 100;
  for (const [id, w] of PRIMARY_WEIGHTS) { r -= w; if (r <= 0) return id; }
  return 'rifle';
}

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const gauss = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) * 1.732;
function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Bot extends Character {
  constructor(game, id, roster) {
    super(game, id, roster.name, roster.color, false);
    this.model = new BotModel(roster.name, roster.color);
    game.scene.add(this.model.group);
    this.mem = new Map();
    // personality makes the bots play differently from each other
    this.pers = {
      aggression: rand(0.45, 1.0),
      aim: rand(0.85, 1.2),
      react: rand(0.85, 1.2),
      headBias: rand(0.5, 1.2),
      favorite: rollPrimary(), // each bot has a go-to gun, but mixes it up
    };
    this.goal = new THREE.Vector3();
    this.spot = new THREE.Vector3();
    this.lookPos = new THREE.Vector3();
    this.lastStuckPos = new THREE.Vector3();
    this.thinkT = Math.random() * 0.12;
    this.resetAI();
  }

  resetAI() {
    this.state = STATE.PATROL;
    this.stateT = 0;
    this.stateUntil = 0;
    this.done = true;
    this.target = null;
    this.enemy = null;
    this.alert = null;
    this.path = null;
    this.pathIdx = 0;
    this.steerDirty = true;
    this.wishX = 0; this.wishZ = 0; this.wishSpeed = 0;
    this.lookMode = 'move';
    this.lookUntil = 0;
    this.glanceYaw = 0; this.glanceT = 0;
    this.scanYaw = 0; this.scanT = 0;
    this.errYaw = 0; this.errPitch = 0;
    this.aimOff = 9;
    this.trackTime = 0;
    this.reactT = 0;
    this.burstLeft = 6; this.burstPause = 0; this.semiT = 0;
    this.hasSpot = false; this.spotCovered = false; this.wantCover = false;
    this.repositionT = 0;
    this.strafeSign = Math.random() < 0.5 ? 1 : -1;
    this.waitT = 0;
    this.searchPts = []; this.searchIdx = 0;
    this.pickup = null;
    this.retreatKind = null; this.retreatUntil = 0; this.noRetreatUntil = 0;
    this.stuckT = 0; this.stuckCount = 0; this.wantMoveT = 0;
    this.atSpot = false; this.chaseKind = null;
    this.jumpQueued = false;
    this.nudgeT = 0; this.nudgeX = 0; this.nudgeZ = 0;
    this.nextNeedCheck = 0; this.nextSwitchOk = 0; this.repathT = 0;
    this.lastCombatT = -99;
    this.nextGrenadeT = this.game.time + rand(2, 6);
    this.lastPoi = null;
    for (const m of this.mem.values()) { m.visible = false; m.lastSeenT = -99; m.hurtT = -99; }
  }

  spawnAt(x, y, z, yaw) {
    this.primary = Math.random() < 0.7 ? this.pers.favorite : rollPrimary();
    super.spawnAt(x, y, z, yaw);
    this.resetAI();
    this.lastStuckPos.copy(this.pos);
    this.model.reset();
  }

  memOf(c) {
    let m = this.mem.get(c.id);
    if (!m) {
      m = { visible: false, lastSeenT: -99, hurtT: -99, lastPos: new THREE.Vector3(), lastVel: new THREE.Vector3() };
      this.mem.set(c.id, m);
    }
    return m;
  }

  // ======================================================================
  // per-frame update
  // ======================================================================

  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this.model.update(dt, { alive: false });
      return;
    }
    this.eyeH += ((this.crouching ? CFG.eyeCrouch : CFG.eyeStand) - this.eyeH) * Math.min(1, dt * 12);
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.1 + Math.random() * 0.04;
      this.think();
      this.steerDirty = true;
    }
    this.updateState(dt);
    this.updateAim(dt);
    this.updateCombat(dt);
    this.updateMovement(dt);
    this.updateWeapons(dt);

    this.stepOffset *= Math.exp(-dt * 14);
    this.model.update(dt, {
      alive: true,
      x: this.pos.x, y: this.pos.y + this.stepOffset, z: this.pos.z,
      yaw: this.yaw, pitch: this.pitch,
      speed: Math.hypot(this.vel.x, this.vel.z),
      onGround: this.onGround, crouch: this.crouching,
      protected: this.isProtected(), time: g.time,
    });
  }

  // ======================================================================
  // perception
  // ======================================================================

  canSee(c, m) {
    const w = this.game.world;
    const dx = c.pos.x - this.pos.x, dz = c.pos.z - this.pos.z;
    const dy = c.pos.y - this.pos.y;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 65 * 65) return false;
    const flat = Math.hypot(dx, dz);
    if (flat > 3.5 && this.game.time - m.hurtT > 1.2) {
      // field of view: ~125 degrees, a little wider for a target already being tracked
      const dot = (dx * -Math.sin(this.yaw) + dz * -Math.cos(this.yaw)) / flat;
      if (dot < (m.visible ? 0.2 : 0.46)) return false;
    }
    c.getEye(_e2); // a leaning head pokes out from cover
    if (!w.segmentBlocked(_eye.x, _eye.y, _eye.z, _e2.x, _e2.y, _e2.z)) return true;
    return !w.segmentBlocked(_eye.x, _eye.y, _eye.z, c.pos.x, c.pos.y + c.height * 0.5, c.pos.z);
  }

  think() {
    const g = this.game, now = g.time;
    this.getEye(_eye);
    let best = null, bestScore = Infinity;
    for (const c of g.chars) {
      if (c === this || g.sameTeam(c, this)) continue;
      const m = this.memOf(c);
      if (!c.alive) { m.visible = false; m.lastSeenT = -99; continue; }
      if (this.canSee(c, m)) {
        m.visible = true;
        m.lastSeenT = now;
        m.lastPos.copy(c.pos);
        m.lastVel.copy(c.vel);
        let score = this.pos.distanceTo(c.pos);
        if (c === this.target) score -= 6; // stick with the current target
        if (now - m.hurtT < 3) score -= 10; // whoever is shooting me matters most
        if (c.isProtected()) score += 25;
        score -= (100 - c.health) * 0.05; // finish off the weak
        if (score < bestScore) { bestScore = score; best = c; }
      } else {
        m.visible = false;
      }
    }
    if (best !== this.target) {
      if (best) {
        const s = g.skill;
        let r = rand(s.reactMin, s.reactMax) * this.pers.react;
        // already on alert (hunting / just fought): reacts faster
        if (this.state === STATE.CHASE || this.state === STATE.SEARCH || now - this.lastCombatT < 2) r *= 0.7;
        this.reactT = r;
        this.trackTime *= 0.25;
        this.burstPause = 0;
      }
      this.target = best;
    }
    if (best) this.chooseWeapon(this.pos.distanceTo(best.pos));
    this.decide();
  }

  /** Something made a noise nearby. kind = 'shot' | 'step'. */
  hear(x, y, z, src, kind, frac) {
    if (!this.alive || this.target) return;
    if (src && this.game.sameTeam(src, this)) return; // a teammate's noise is nothing to investigate
    const now = this.game.time;
    if (kind === 'shot') {
      // busy saving my skin, or already hunting a specific enemy: ignore
      if (this.state === STATE.RETREAT || this.state === STATE.SEARCH) return;
      if (this.state === STATE.CHASE && this.chaseKind === 'enemy') return;
      if (this.alert && this.alert.urgent && now - this.alert.t < 1) return;
      const following = this.state === STATE.CHASE;
      // already heading for that fight: no need to re-plan on every shot
      if (following && Math.hypot(this.goal.x - x, this.goal.z - z) < 10) return;
      if (!following && Math.random() > this.pers.aggression * 0.12) {
        // not interested enough to go there (rolled per shot), but look that way
        if (now > this.lookUntil) { this.lookPos.set(x, y + 1.4, z); this.lookUntil = now + 1.0; }
        return;
      }
      const err = 1.5 + frac * 6; // far-away sounds are harder to pinpoint
      if (!this.alert) this.alert = { pos: new THREE.Vector3(), t: 0, src: null };
      this.alert.pos.set(x + rand(-err, err), y, z + rand(-err, err));
      this.alert.t = now;
      this.alert.src = src;
      this.alert.urgent = false;
    } else if (now > this.lookUntil) {
      this.lookPos.set(x, y + 1.4, z);
      this.lookUntil = now + 1.3;
    }
  }

  onDamaged(attacker) {
    if (!attacker || attacker === this) return;
    const now = this.game.time;
    const m = this.memOf(attacker);
    m.hurtT = now;
    if (this.target !== attacker) {
      // I know roughly where that came from
      m.lastPos.copy(attacker.pos);
      this.lookPos.set(attacker.pos.x, attacker.pos.y + 1.4, attacker.pos.z);
      this.lookUntil = now + 1.5;
      if (!this.target) {
        if (!this.alert) this.alert = { pos: new THREE.Vector3(), t: 0, src: null };
        this.alert.pos.copy(attacker.pos);
        this.alert.t = now;
        this.alert.src = attacker;
        this.alert.urgent = true;
      }
    }
  }

  // ======================================================================
  // decision making (10 Hz)
  // ======================================================================

  decide() {
    const now = this.game.time;
    const t = this.target;
    if (t) {
      this.enemy = t;
      this.lastCombatT = now;
      this.alert = null;
      if (this.state === STATE.RETREAT) {
        if (this.health > 55 || now > this.retreatUntil || this.done) {
          this.noRetreatUntil = now + 10;
          this.enterAttack();
        }
      } else if (this.shouldRetreat(t) && this.enterRetreat(t)) {
        // retreating
      } else if (this.state !== STATE.ATTACK) {
        this.enterAttack();
      }
      return;
    }

    // nobody in sight ------------------------------------------------------
    if (this.state === STATE.ATTACK) {
      const e = this.enemy;
      if (e && e.alive) {
        const m = this.memOf(e);
        // head for where they were going, not just where they were
        _t.copy(m.lastPos).addScaledVector(m.lastVel, 0.6);
        if (Math.random() < 0.5 * this.pers.aggression) this.tryGrenadeAt(m.lastPos.x, m.lastPos.y, m.lastPos.z); // flush them out
        this.enterChase(_t, e, 'enemy');
      } else {
        this.pickNext();
      }
      return;
    }
    if (this.state === STATE.RETREAT) {
      if (this.health > 55 || now > this.retreatUntil || this.done) {
        this.noRetreatUntil = now + 8;
        this.pickNext();
      }
      return;
    }
    if (this.alert) {
      const a = this.alert;
      this.alert = null;
      if (now - a.t < 2.5) {
        if (!(this.state === STATE.CHASE && this.goal.distanceTo(a.pos) < 5)) {
          this.enterChase(a.pos, a.src, a.urgent ? 'enemy' : 'noise');
        }
        return;
      }
    }
    if (this.done) {
      if (this.state === STATE.CHASE) this.enterSearch(this.goal);
      else this.pickNext();
      return;
    }
    if ((this.state === STATE.PATROL || this.state === STATE.SEARCH) && now > this.nextNeedCheck) {
      this.nextNeedCheck = now + 1;
      const p = this.choosePickup(this.state === STATE.SEARCH ? 10 : Infinity);
      if (p) this.enterCollect(p);
    }
  }

  pickNext() {
    const p = this.choosePickup(Infinity);
    if (p) this.enterCollect(p);
    else this.enterPatrol();
  }

  setState(s) {
    this.state = s;
    this.stateT = 0;
    this.done = false;
    this.hasSpot = false;
    this.waitT = 0;
    this.pickup = null;
    if (this.crouching) this.setCrouch(false);
  }

  enterPatrol() {
    this.setState(STATE.PATROL);
    const pois = this.game.map.pois;
    let pick = null;
    for (let i = 0; i < 8 && !pick; i++) {
      const p = pois[(Math.random() * pois.length) | 0];
      if (p === this.lastPoi) continue;
      if (Math.hypot(p[0] - this.pos.x, p[2] - this.pos.z) > 14) pick = p;
    }
    if (!pick) pick = pois[(Math.random() * pois.length) | 0];
    this.lastPoi = pick;
    if (!this.setGoal(pick[0], pick[1], pick[2])) this.done = true;
    this.waitT = rand(0.5, 1.6);
  }

  enterChase(pos, src, kind) {
    this.setState(STATE.CHASE);
    this.chaseSrc = src;
    this.chaseKind = kind;
    this.stateUntil = this.game.time + 9;
    if (!this.setGoal(pos.x, pos.y, pos.z)) this.done = true;
  }

  enterSearch(center) {
    const nav = this.game.nav;
    const cx = center.x, cy = center.y, cz = center.z;
    this.setState(STATE.SEARCH);
    this.searchPts.length = 0;
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(3, 9);
      const n = nav.nearest(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
      if (n >= 0) this.searchPts.push(n);
    }
    this.searchIdx = 0;
    this.stateUntil = this.game.time + 8;
    if (!this.searchPts.length) { this.done = true; return; }
    const n = this.searchPts[0];
    this.setGoal(nav.px[n], nav.py[n], nav.pz[n]);
  }

  enterCollect(p) {
    this.setState(STATE.COLLECT);
    this.pickup = p;
    this.stateUntil = this.game.time + 25;
    if (!this.setGoal(p.pos.x, p.pos.y, p.pos.z)) this.done = true;
  }

  enterAttack() {
    this.setState(STATE.ATTACK);
    this.repositionT = 0;
    this.path = null;
  }

  shouldRetreat(t) {
    const now = this.game.time;
    if (now < this.noRetreatUntil) return false;
    const limit = this.pers.aggression > 0.88 ? 22 : 35;
    if (this.health > limit) return false;
    // they're nearly dead and close: finish the fight instead
    if (t.health <= 25 && this.pos.distanceTo(t.pos) < 15) return false;
    return true;
  }

  /** Low on health: run for a health pack, or failing that, break line of sight. */
  enterRetreat(threat) {
    const g = this.game, nav = g.nav, now = g.time;
    const avoid = { x: threat.pos.x, z: threat.pos.z, r: 12, w: 6 };
    let best = null, bestCost = Infinity;
    for (const p of g.pickups) {
      if (p.type !== 'health') continue;
      if (!p.active && p.respawnT > 4) continue;
      const dMe = this.pos.distanceTo(p.pos), dTh = threat.pos.distanceTo(p.pos);
      if (dMe > 60 || dTh < dMe * 0.7) continue; // they'd get there first
      const cost = dMe - dTh * 0.35;
      if (cost < bestCost) { bestCost = cost; best = p; }
    }
    if (best) {
      this.setState(STATE.RETREAT);
      this.retreatKind = 'health';
      this.pickup = best;
      this.retreatUntil = now + 14;
      this.setGoal(best.pos.x, best.pos.y, best.pos.z, { avoid });
      return true;
    }
    // no health available: find the nearest spot the threat can't see
    threat.getEye(_t);
    let bestN = -1, bestS = -Infinity;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(4, 16);
      const n = nav.nearest(this.pos.x + Math.cos(a) * r, this.pos.y, this.pos.z + Math.sin(a) * r);
      if (n < 0) continue;
      const nx = nav.px[n], ny = nav.py[n], nz = nav.pz[n];
      if (!g.world.segmentBlocked(nx, ny + 1.1, nz, _t.x, _t.y, _t.z)) continue;
      const dMe = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      const dTh = Math.hypot(nx - threat.pos.x, nz - threat.pos.z);
      const s = dTh * 0.5 - dMe + Math.random() * 2;
      if (s > bestS) { bestS = s; bestN = n; }
    }
    if (bestN >= 0) {
      this.setState(STATE.RETREAT);
      this.retreatKind = 'cover';
      this.retreatUntil = now + 7;
      this.setGoal(nav.px[bestN], nav.py[bestN], nav.pz[bestN], { avoid });
      return true;
    }
    this.noRetreatUntil = now + 3;
    return false;
  }

  /** Most valuable pickup worth walking to right now, or null. */
  choosePickup(maxDist) {
    let best = null, bestScore = 0;
    const prim = this.weapons[0];
    const need = Math.max(0, 1 - (prim.mag + prim.reserve) / (prim.def.magSize + prim.def.reserveStart));
    const gNeed = (GRENADE.max - this.grenades) / GRENADE.max;
    for (const p of this.game.pickups) {
      if (!p.active && p.respawnT > 3) continue;
      if (!p.usefulTo(this)) continue;
      let u = 0;
      switch (p.type) {
        case 'health': u = this.health >= 85 ? 0 : ((100 - this.health) / 100) * 1.8; break;
        case 'armor': u = this.armor >= 60 ? 0 : ((100 - this.armor) / 100) * 0.8; break;
        case 'ammo': u = (need > 0.25 ? need * 0.7 : 0) + gNeed * 0.12; break;
        case 'crate': u = (need > 0.25 ? need * 0.95 : 0) + gNeed * 0.2; break;
        default: break;
      }
      if (u <= 0.05) continue;
      const d = this.pos.distanceTo(p.pos);
      if (d > maxDist) continue;
      const score = u * 40 - d;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best;
  }

  // ======================================================================
  // state behaviours (every frame)
  // ======================================================================

  updateState(dt) {
    const now = this.game.time;
    this.stateT += dt;
    switch (this.state) {
      case STATE.PATROL: {
        this.lookMode = 'move';
        if (this.followPath(CFG.botWalk)) {
          this.lookMode = 'scan';
          this.waitT -= dt;
          if (this.waitT <= 0) this.done = true;
        }
        break;
      }
      case STATE.CHASE: {
        this.lookMode = 'move';
        const arrived = this.followPath(CFG.botSprint);
        const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z;
        if (dx * dx + dz * dz < 81 && Math.abs(this.goal.y - this.pos.y) < 2.5) {
          // close to where the enemy should be: weapon up, eyes on the spot
          this.lookMode = 'point';
          this.lookPos.set(this.goal.x, this.goal.y + 1.4, this.goal.z);
          this.lookUntil = now + 0.2;
        }
        if (arrived || now > this.stateUntil) this.done = true;
        break;
      }
      case STATE.SEARCH: {
        const arrived = this.followPath(CFG.botRun);
        this.lookMode = arrived ? 'scan' : 'move';
        if (arrived) {
          this.waitT += dt;
          if (this.waitT > 1.2) {
            this.waitT = 0;
            this.searchIdx++;
            if (this.searchIdx >= this.searchPts.length) this.done = true;
            else {
              const nav = this.game.nav, n = this.searchPts[this.searchIdx];
              this.setGoal(nav.px[n], nav.py[n], nav.pz[n]);
            }
          }
        }
        if (now > this.stateUntil) this.done = true;
        break;
      }
      case STATE.COLLECT: {
        const p = this.pickup;
        this.lookMode = 'move';
        if (!p || (!p.active && p.respawnT > 3) || !p.usefulTo(this) || now > this.stateUntil) {
          this.done = true;
          this.wishSpeed = 0;
          break;
        }
        if (this.followPath(CFG.botRun)) {
          this.lookMode = 'scan'; // waiting for it to respawn
          if (p.active) this.setGoal(p.pos.x, p.pos.y, p.pos.z);
        }
        break;
      }
      case STATE.RETREAT: this.updateRetreat(dt); break;
      case STATE.ATTACK: this.updateAttack(dt); break;
      default: break;
    }
  }

  updateRetreat(dt) {
    const t = this.target;
    // fight back if the threat is on top of us, otherwise just run
    this.lookMode = t && this.pos.distanceTo(t.pos) < 14 ? 'target' : 'move';
    if (this.retreatKind === 'health') {
      const p = this.pickup;
      if (!p || (!p.active && p.respawnT > 4)) { this.done = true; return; }
      if (this.followPath(CFG.botSprint) && p.active) this.setGoal(p.pos.x, p.pos.y, p.pos.z);
    } else if (this.followPath(CFG.botSprint)) {
      // in cover: get small, top up the magazine, watch where they'll come from
      this.setCrouch(true);
      this.startReload();
      const e = this.enemy;
      if (e && !t) {
        const m = this.memOf(e);
        this.lookMode = 'point';
        this.lookPos.set(m.lastPos.x, m.lastPos.y + 1.4, m.lastPos.z);
        this.lookUntil = this.game.time + 0.2;
      }
      this.waitT += dt;
      if (this.waitT > 2.8) this.done = true;
    }
  }

  updateAttack(dt) {
    const g = this.game, now = g.time;
    const t = this.target;
    this.lookMode = 'target';
    if (!t) { this.wishSpeed = 0; return; }
    const w = this.weapon;
    const d = this.pos.distanceTo(t.pos);

    // out of useful range: close the distance along a path (still shooting)
    if (d > w.def.botMaxRange) {
      if (!this.path || now > this.repathT) {
        this.repathT = now + 1.2;
        this.setGoal(t.pos.x, t.pos.y, t.pos.z);
      }
      this.followPath(CFG.botRun);
      this.hasSpot = false;
      return;
    }

    // reloading or empty: prefer a spot the target can't see
    const wantCover = w.reloadT > 0 || w.mag === 0;
    if (wantCover !== this.wantCover) { this.wantCover = wantCover; this.repositionT = 0; }
    this.repositionT -= dt;
    if (this.hitWall && this.hasSpot) this.repositionT = Math.min(this.repositionT, 0.12); // bumped into something
    if (this.repositionT <= 0) {
      this.pickCombatSpot(t, wantCover, d);
      this.repositionT = wantCover ? 1.4 : 1.6; // travel budget; hold time is set on arrival
      this.atSpot = false;
    }

    if (this.hasSpot) {
      const dx = this.spot.x - this.pos.x, dz = this.spot.z - this.pos.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.3) {
        this.wishX = dx / dd; this.wishZ = dz / dd;
        this.wishSpeed = CFG.botRun;
      } else {
        this.wishSpeed = 0;
        if (!this.atSpot) {
          // Arrived: plant feet and shoot. Up close keep dancing instead;
          // at range a steady stance is what makes rifle bursts land.
          this.atSpot = true;
          if (!wantCover) this.repositionT = d < 9 ? rand(0.05, 0.35) : rand(0.55, 1.3);
        }
      }
    } else {
      // fallback: plain strafe, never off a ledge
      const tx = t.pos.x - this.pos.x, tz = t.pos.z - this.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      let sx = (-tz / tl) * this.strafeSign, sz = (tx / tl) * this.strafeSign;
      const h = g.nav.heightAt(this.pos.x + sx * 1.2, this.pos.z + sz * 1.2, this.pos.y);
      if (h !== h) { this.strafeSign = -this.strafeSign; sx = -sx; sz = -sz; }
      this.wishX = sx; this.wishZ = sz;
      this.wishSpeed = CFG.botRun * 0.75;
    }
    this.setCrouch(wantCover && this.spotCovered && this.hasSpot && this.wishSpeed === 0);
  }

  /**
   * Sample nearby standable spots and pick the best one to fight from:
   * right range for the weapon, sideways movement (strafing), a little
   * height advantage, with line of sight - or without it when reloading.
   */
  pickCombatSpot(t, wantCover, dist) {
    const g = this.game, nav = g.nav, world = g.world;
    const pref = wantCover ? dist : Math.min(this.weapon.def.botRange, dist + 4);
    t.getEye(_t);
    const tx = t.pos.x - this.pos.x, tz = t.pos.z - this.pos.z;
    const tl = Math.hypot(tx, tz) || 1;
    let best = -1, bestS = -Infinity, bestCov = false;
    for (let i = 0; i < 11; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(1.8, 6.5);
      const x = this.pos.x + Math.cos(a) * r, z = this.pos.z + Math.sin(a) * r;
      const n = nav.nodeAt(x, z, this.pos.y, 1.0);
      if (n < 0) continue;
      const nx = nav.px[n], ny = nav.py[n], nz = nav.pz[n];
      if (!nav.lineClear(this.pos.x, this.pos.y, this.pos.z, nx, nz)) continue;
      const d = Math.hypot(nx - t.pos.x, ny - t.pos.y, nz - t.pos.z);
      const los = !world.segmentBlocked(nx, ny + 1.5, nz, _t.x, _t.y, _t.z);
      let s = -Math.abs(d - pref) * 0.6 + Math.random() * 2.5;
      s += wantCover ? (los ? -6 : 7) : (los ? 5 : -7);
      const lateral = Math.abs((nx - this.pos.x) * (-tz / tl) + (nz - this.pos.z) * (tx / tl));
      s += Math.min(lateral, 4) * 0.55;
      s += clamp(ny - t.pos.y, -2, 2) * 0.4;
      for (const c of g.chars) {
        if (c === this || c === t || !c.alive) continue;
        if (Math.abs(c.pos.x - nx) < 1.5 && Math.abs(c.pos.z - nz) < 1.5) s -= 3;
      }
      if (s > bestS) { bestS = s; best = n; bestCov = !los; }
    }
    if (best >= 0) {
      this.spot.set(nav.px[best], nav.py[best], nav.pz[best]);
      this.hasSpot = true;
      this.spotCovered = bestCov;
    } else {
      this.hasSpot = false;
      this.spotCovered = false;
      if (Math.random() < 0.5) this.strafeSign = -this.strafeSign;
    }
  }

  // ======================================================================
  // navigation
  // ======================================================================

  setGoal(x, y, z, opts) {
    const res = this.game.nav.findPath(this.pos.x, this.pos.y, this.pos.z, x, y, z, opts);
    this.goal.set(x, y, z);
    if (!res || !res.points.length) { this.path = null; return false; }
    this.path = res.points;
    this.pathIdx = Math.min(1, this.path.length - 1);
    this.steerDirty = true;
    return true;
  }

  /** Steer along the current path. Returns true once the end is reached. */
  followPath(speed) {
    const p = this.path;
    if (!p) { this.wishSpeed = 0; return true; }
    const pos = this.pos;
    const last = p.length - 1;
    let idx = this.pathIdx;
    while (idx < last) {
      const w = p[idx];
      const dx = w.x - pos.x, dz = w.z - pos.z;
      if (dx * dx + dz * dz < 0.4 && Math.abs(w.y - pos.y) < 1.0) idx++;
      else break;
    }
    // string-pull: skip ahead to the furthest waypoint we can walk straight to
    if (this.steerDirty) {
      this.steerDirty = false;
      if (this.onGround && !p[idx].drop) {
        let lim = Math.min(last, idx + 7);
        for (let k = idx + 1; k <= lim; k++) if (p[k].drop) { lim = k - 1; break; }
        for (let k = lim; k > idx; k--) {
          if (Math.abs(p[k].y - pos.y) < 2.5 && this.game.nav.lineClear(pos.x, pos.y, pos.z, p[k].x, p[k].z)) { idx = k; break; }
        }
      }
    }
    this.pathIdx = idx;
    const w = p[idx];
    const dx = w.x - pos.x, dz = w.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (idx === last && d < 0.45 && Math.abs(w.y - pos.y) < 1.3) {
      this.wishSpeed = 0;
      return true;
    }
    if (d > 0.001) { this.wishX = dx / d; this.wishZ = dz / d; }
    // ease off for the last step so we don't overshoot
    this.wishSpeed = idx === last ? Math.min(speed, 2 + d * 5) : speed;
    return false;
  }

  updateMovement(dt) {
    const g = this.game;
    let wx = this.wishX * this.wishSpeed, wz = this.wishZ * this.wishSpeed;

    // local avoidance: steer around other characters (pass on the right)
    let pushed = false;
    for (const c of g.chars) {
      if (c === this || !c.alive) continue;
      const dx = this.pos.x - c.pos.x, dz = this.pos.z - c.pos.z;
      if (Math.abs(this.pos.y - c.pos.y) > 1.6) continue;
      const d2 = dx * dx + dz * dz;
      if (d2 > 2.89 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const k = (1.7 - d) / 1.7;
      wx += (dx / d) * k * 4.5 + (-dz / d) * k * 2.0;
      wz += (dz / d) * k * 4.5 + (dx / d) * k * 2.0;
      pushed = true;
    }
    if (this.nudgeT > 0) {
      this.nudgeT -= dt;
      wx += this.nudgeX; wz += this.nudgeZ;
    }
    // a live grenade nearby trumps everything: get away from it
    let flee = false;
    for (const gr of g.grenades) {
      if (gr.fuse > 1.7) continue; // takes a moment to notice it
      const dx = this.pos.x - gr.x, dz = this.pos.z - gr.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > 56 || Math.abs(this.pos.y - gr.y) > 3) continue;
      const d = Math.sqrt(d2) || 0.01;
      wx = (dx / d) * CFG.botSprint;
      wz = (dz / d) * CFG.botSprint;
      flee = true;
      break;
    }
    const maxSp = Math.max(this.wishSpeed, pushed ? 2.5 : 0, flee ? CFG.botSprint : 0);
    const wl = Math.hypot(wx, wz);
    if (wl > maxSp && wl > 0) { wx *= maxSp / wl; wz *= maxSp / wl; }

    const acc = (this.onGround ? 42 : 5) * dt;
    const ax = wx - this.vel.x, az = wz - this.vel.z;
    const al = Math.hypot(ax, az);
    if (al <= acc) { this.vel.x = wx; this.vel.z = wz; }
    else { this.vel.x += (ax / al) * acc; this.vel.z += (az / al) * acc; }

    this.vel.y = Math.max(-CFG.terminalVel, this.vel.y - CFG.gravity * dt);
    if (this.jumpQueued && this.onGround) {
      this.vel.y = CFG.jumpSpeed;
      this.onGround = false;
    }
    this.jumpQueued = false;

    const px = this.pos.x, pz = this.pos.z;
    moveBody(g.world, this, dt);

    // footsteps (audible to the player and to other bots)
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (this.onGround) {
      this.stepDist += moved;
      if (this.stepDist > 2.3) {
        this.stepDist = 0;
        g.audio.play('step', this.pos, 0.9);
        if (this.wishSpeed > 5) g.emitNoise(this.pos.x, this.pos.y, this.pos.z, 7, this, 'step');
      }
    }

    // stuck detection: wanting to move (for the whole window) but going nowhere
    this.stuckT += dt;
    if (this.wishSpeed > 1.5) this.wantMoveT += dt;
    if (this.stuckT >= 0.5) {
      const dist = Math.hypot(this.pos.x - this.lastStuckPos.x, this.pos.z - this.lastStuckPos.z);
      const wanted = this.wantMoveT;
      this.lastStuckPos.copy(this.pos);
      this.stuckT = 0;
      this.wantMoveT = 0;
      if (wanted > 0.42 && dist < 0.3) {
        this.stuckCount++;
        g.stats.stuck++;
        if (this.stuckCount === 2) {
          // hop + sidestep + fresh path
          this.jumpQueued = true;
          const a = Math.random() * Math.PI * 2;
          this.nudgeX = Math.cos(a) * 4; this.nudgeZ = Math.sin(a) * 4;
          this.nudgeT = 0.35;
          if (this.path) this.setGoal(this.goal.x, this.goal.y, this.goal.z);
          this.hasSpot = false;
          this.repositionT = 0;
        } else if (this.stuckCount >= 4) {
          // give up on this goal entirely
          this.stuckCount = 0;
          this.path = null;
          this.hasSpot = false;
          if (this.state !== STATE.ATTACK) this.done = true;
        }
      } else {
        this.stuckCount = 0;
      }
    }
  }

  // ======================================================================
  // aiming + shooting
  // ======================================================================

  updateAim(dt) {
    const g = this.game, now = g.time, skill = g.skill;
    let wantYaw = this.yaw, wantPitch = 0;
    let rate = 4.5;
    this.getEye(_eye);
    const t = this.target;
    let mode = this.lookMode;
    if (mode === 'target' && !t) mode = 'move';
    if (mode !== 'target' && mode !== 'point' && now < this.lookUntil) mode = 'point';

    if (mode === 'target') {
      const track = Math.min(1, this.trackTime / skill.trackTime);
      // aim centre drifts from chest towards the head as the bot settles in
      const hb = clamp(skill.headBias * this.pers.headBias * track, 0, 1);
      const lead = 0.14; // seconds of target motion to lead by (incl. our own tracking lag)
      _t.set(
        t.pos.x + t.vel.x * lead,
        t.pos.y + t.height * (0.6 + 0.3 * hb) + t.vel.y * lead * 0.4,
        t.pos.z + t.vel.z * lead,
      );
      _d.subVectors(_t, _eye);
      const flat = Math.hypot(_d.x, _d.z) || 0.001;
      // error grows with the target's sideways speed and our own movement
      const lat = Math.abs(t.vel.x * (-_d.z / flat) + t.vel.z * (_d.x / flat));
      const own = Math.hypot(this.vel.x, this.vel.z);
      const scale = skill.aimError * this.pers.aim * (1 - 0.78 * track)
        * (1 + lat * 0.14 + own * 0.05) * (this.crouching ? 0.75 : 1);
      const k = Math.exp(-dt * 3.5);
      const sd = scale * Math.sqrt(1 - k * k);
      this.errYaw = this.errYaw * k + gauss() * sd;
      this.errPitch = this.errPitch * k + gauss() * sd * 0.6;
      wantYaw = Math.atan2(-_d.x, -_d.z) + this.errYaw;
      wantPitch = Math.atan2(_d.y, flat) + this.errPitch;
      rate = skill.turnRate;
    } else if (mode === 'point') {
      _d.subVectors(this.lookPos, _eye);
      wantYaw = Math.atan2(-_d.x, -_d.z);
      wantPitch = clamp(Math.atan2(_d.y, Math.hypot(_d.x, _d.z) || 0.001), -0.9, 0.9);
      rate = skill.turnRate * 0.8;
    } else if (mode === 'scan') {
      this.scanT -= dt;
      if (this.scanT <= 0) {
        this.scanT = rand(0.5, 1.0);
        this.scanYaw = this.yaw + rand(0.8, 2.2) * (Math.random() < 0.5 ? -1 : 1);
      }
      wantYaw = this.scanYaw;
      rate = 3.2;
    } else {
      if (this.wishSpeed > 0.5) wantYaw = Math.atan2(-this.wishX, -this.wishZ);
      if (this.state === STATE.PATROL || this.state === STATE.COLLECT) {
        // look around while walking instead of staring straight ahead
        this.glanceT -= dt;
        if (this.glanceT <= 0) {
          this.glanceT = rand(1.0, 2.6);
          this.glanceYaw = Math.random() < 0.5 ? 0 : rand(-1.2, 1.2);
        }
        wantYaw += this.glanceYaw;
      }
    }

    const f = 1 - Math.exp(-dt * 14);
    const maxStep = rate * dt;
    const dy = wrap(wantYaw - this.yaw);
    const dp = wantPitch - this.pitch;
    this.yaw = wrap(this.yaw + clamp(dy * f, -maxStep, maxStep));
    this.pitch = clamp(this.pitch + clamp(dp * f, -maxStep, maxStep), -1.3, 1.3);
    this.aimOff = mode === 'target' ? Math.max(Math.abs(dy), Math.abs(dp)) : 9;
  }

  /** Primary or pistol? (slot 0 / slot 1) */
  chooseWeapon(d) {
    const now = this.game.time;
    if (this.switchT > 0 || now < this.nextSwitchOk || this.weapons.length < 2) return;
    const prim = this.weapons[0], side = this.weapons[1];
    const cur = this.weaponIdx;
    let want = 0;
    if (!this.hasAmmo(0)) want = 1; // primary is dry
    else if (prim.def.pellets > 1 && d > prim.def.botMaxRange * (cur === 1 ? 0.9 : 1.2)) want = 1; // shotgun can't reach
    else if (prim.def.scope && d < (cur === 1 ? 9 : 6)) want = 1; // too close for a scope
    else if (prim.mag === 0 && d < 12 && side.mag > 0) want = 1; // drawing the pistol beats reloading under fire
    if (want !== cur) {
      this.switchWeapon(want);
      this.nextSwitchOk = now + 1.4;
    }
  }

  /** Lob a grenade at a spot, if the throw is makeable. */
  tryGrenadeAt(x, y, z) {
    const g = this.game;
    if (this.grenades <= 0 || this.grenadeT > 0 || g.time < this.nextGrenadeT) return false;
    this.getEye(_eye);
    const dx = x - _eye.x, dz = z - _eye.z, dy = y + 0.3 - _eye.y;
    const dh = Math.hypot(dx, dz);
    if (dh < 8 || dh > 26) return false; // too close hurts us, too far won't reach
    const v = GRENADE.speed, gr = GRENADE.gravity;
    const disc = v * v * v * v - gr * (gr * dh * dh + 2 * dy * v * v);
    if (disc < 0) return false;
    const ang = Math.atan2(v * v - Math.sqrt(disc), gr * dh); // the flatter of the two arcs
    const c = Math.cos(ang);
    _d.set((dx / dh) * c, Math.sin(ang), (dz / dh) * c);
    if (g.world.raycast(_eye.x, _eye.y, _eye.z, _d.x, _d.y, _d.z, 3.5, null)) return false; // wall in the way
    this.nextGrenadeT = g.time + rand(5, 10);
    return this.throwGrenade(_d);
  }

  updateCombat(dt) {
    const g = this.game, now = g.time;
    const t = this.target;
    const w = this.weapon;
    if (this.burstPause > 0) this.burstPause -= dt;
    if (this.semiT > 0) this.semiT -= dt;

    if (t && t.alive) {
      this.trackTime += dt;
      this.reactT -= dt;
      const facing = this.lookMode === 'target';
      if (facing && this.reactT <= 0 && !t.isProtected()) {
        const d = this.pos.distanceTo(t.pos);
        const tol = 0.05 + Math.atan2(0.4, d) + (w.def.pellets > 1 ? 0.05 : 0);
        // would the shot have a chance? (moving + sustained fire bloom the cone)
        // scoped rifles are only steady when standing still
        const ads = w.def.scope && Math.hypot(this.vel.x, this.vel.z) < 2 ? 1 : 0;
        const cone = w.def.pellets > 1 ? 0 : this.currentSpread(ads) * d;
        // a settled fight at mid range is a good moment for a grenade
        if (d > 9 && d < 24 && this.trackTime > 0.8 && Math.random() < dt * 0.6 * this.pers.aggression) {
          this.tryGrenadeAt(t.pos.x + t.vel.x * 0.8, t.pos.y, t.pos.z + t.vel.z * 0.8);
        }
        if (this.aimOff < tol && d < w.def.botMaxRange * 1.4 && cone < 0.95) {
          if (w.def.auto) {
            if (this.burstPause <= 0 && this.tryFire(true, true, ads)) {
              if (--this.burstLeft <= 0) {
                // short controlled bursts at range, longer sprays up close
                this.burstPause = rand(0.12, 0.4) * clamp(d / 18, 0.4, 1.6);
                this.burstLeft = d < 8 ? 14 : 3 + ((Math.random() * 6) | 0);
              }
            }
          } else if (this.semiT <= 0 && this.tryFire(true, true, ads)) {
            this.semiT = w.def.pellets > 1 ? 0 : rand(0.2, 0.36);
          }
        }
      }
      // in your face: the knife is faster than any gun
      if (this.reactT <= 0 && this.knifeT <= 0 && !t.isProtected() && this.aimOff < 0.6) {
        const d = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
        if (d < 2.6 && Math.abs(t.pos.y - this.pos.y) < 1.5 && Math.random() < dt * 6) this.knife();
      }
      if (w.mag === 0) this.startReload();
    } else {
      this.trackTime = Math.max(0, this.trackTime - dt * 2);
      // quiet moment: top up and get the best gun ready
      if (now - this.lastCombatT > 1.2 && w.reloadT <= 0 && this.switchT <= 0) {
        if (w.mag < w.def.magSize * 0.6 && this.canReload()) this.startReload();
        else if (now > this.nextSwitchOk) {
          const want = this.hasAmmo(0) ? 0 : 1;
          if (want !== this.weaponIdx) { this.switchWeapon(want); this.nextSwitchOk = now + 2; }
        }
      }
    }
  }

  // ======================================================================
  // hooks
  // ======================================================================

  onFired() { this.model.muzzleFlash(); }
  onKnife() { this.model.melee(); }

  onReload(w) { this.game.audio.play('reload', this.pos, 0.6, w.def.reload); }

  onDeath() {
    this.target = null;
    this.path = null;
    this.wishSpeed = 0;
    this.model.deadT = 0;
  }

  dispose() { this.model.dispose(this.game.scene); }
}
