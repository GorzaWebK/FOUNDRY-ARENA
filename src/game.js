// The match: owns the scene, the world, all characters and the rules.

import * as THREE from 'three';
import { CFG, DIFFICULTY, BOT_ROSTER } from './config.js';
import { World } from './world.js';
import { NavGrid } from './navgrid.js';
import { buildWorldMeshes, buildSky, buildLights } from './worldMesh.js';
import { Effects } from './effects.js';
import { Pickup } from './pickups.js';
import { ViewModel } from './viewmodel.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { damageAtDistance } from './weapons.js';

const r2 = (v) => Math.round(v * 100) / 100;

const UP = new THREE.Vector3(0, 1, 0);
const _o = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _d = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _muz = new THREE.Vector3();
const _hit = { t: 0, nx: 0, ny: 0, nz: 0 };
const _ch = { t: 0, head: false };

/** Ray vs. a character's hit volumes (head sphere + body box). */
function rayChar(ox, oy, oz, dx, dy, dz, c, tMax, out) {
  let best = tMax, head = false, found = false;
  // head
  const hx = ox - c.pos.x, hy = oy - (c.pos.y + c.height - 0.2), hz = oz - c.pos.z;
  const b = hx * dx + hy * dy + hz * dz;
  const cc = hx * hx + hy * hy + hz * hz - 0.24 * 0.24;
  const disc = b * b - cc;
  if (disc >= 0) {
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < best) { best = t; head = true; found = true; }
  }
  // body
  const r = 0.33;
  const x0 = c.pos.x - r, x1 = c.pos.x + r, z0 = c.pos.z - r, z1 = c.pos.z + r;
  const y0 = c.pos.y, y1 = c.pos.y + c.height - 0.42;
  let tmin = 0, tmax = best, ok = true;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) ok = false; }
  else { let t1 = (x0 - ox) / dx, t2 = (x1 - ox) / dx; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) ok = false; }
  if (ok) {
    if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) ok = false; }
    else { let t1 = (y0 - oy) / dy, t2 = (y1 - oy) / dy; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) ok = false; }
  }
  if (ok) {
    if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) ok = false; }
    else { let t1 = (z0 - oz) / dz, t2 = (z1 - oz) / dz; if (t1 > t2) { const t = t1; t1 = t2; t2 = t; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) ok = false; }
  }
  if (ok && tmin < best) { best = tmin; head = false; found = true; }
  if (!found) return false;
  out.t = best; out.head = head;
  return true;
}

export class Game {
  constructor({ canvas, settings, audio, hud, input, map }) {
    this.settings = settings;
    this.audio = audio;
    this.hud = hud;
    this.input = input;
    this.map = map;

    // ---- renderer
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.autoClear = false;
    this.renderer = r;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.08, 500);
    this.camera.rotation.order = 'YXZ';

    // ---- world
    this.world = new World(map);
    this.nav = new NavGrid(this.world);
    const s0 = map.spawns[0];
    this.nav.markReachable(s0[0], s0[1], s0[2]);
    buildWorldMeshes(this.world, this.scene);
    buildSky(this.scene, map.sky);
    this.lights = buildLights(this.scene, map, settings.shadows);

    this.effects = new Effects(this.scene);
    this.viewmodel = new ViewModel();
    this.pickups = map.pickups.map((p) => new Pickup(p, this.scene));
    this.spawns = map.spawns.map((s) => ({ x: s[0], y: s[1], z: s[2], yaw: ((s[3] || 0) * Math.PI) / 180, lastUsed: -99 }));

    this.player = new Player(this);
    this.bots = [];
    this.remotes = []; // multiplayer: characters driven over the network
    this.chars = [];
    this.mode = 'sp'; // 'sp' | 'host' | 'client'
    this.net = null; // set by Net while a multiplayer session is active
    this.skill = DIFFICULTY.normal;
    this.time = 0;
    this.matchTime = CFG.timeLimit;
    this.over = false;
    this.attract = true;
    this.winner = null;
    this.onMatchEnd = null;
    this.stats = { stuck: 0, shots: 0, kills: 0 };

    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.viewmodel.setAspect(w / h);
  }

  applySettings(key) {
    if (!key || key === 'shadows') {
      this.lights.sun.castShadow = this.settings.shadows;
      this.renderer.shadowMap.needsUpdate = true;
    }
    if (!key || key === 'volume') this.audio.setVolume(this.settings.volume);
  }

  // ======================================================================
  // match flow
  // ======================================================================

  newMatch({ botCount, difficulty, attract = false }) {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.mode = this.net && !attract ? 'host' : 'sp';
    if (this.mode !== 'host') this.clearRemotes();
    this.skill = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficulty = difficulty;
    this.attract = attract;
    this.time = 0;
    this.matchTime = CFG.timeLimit;
    this.over = false;
    this.winner = null;
    this.stats = { stuck: 0, shots: 0, kills: 0 };
    this.effects.clear();
    this.hud.reset();
    for (const p of this.pickups) p.reset();
    for (const s of this.spawns) s.lastUsed = -99;

    const n = Math.max(1, Math.min(10, botCount | 0));
    for (let i = 0; i < n; i++) this.bots.push(new Bot(this, i + 1, BOT_ROSTER[i % BOT_ROSTER.length]));
    const p = this.player;
    p.kills = 0; p.deaths = 0; p.alive = false;
    this.chars = attract ? [...this.bots] : [p, ...this.remotes, ...this.bots];
    for (const c of this.chars) { c.kills = 0; c.deaths = 0; c.alive = false; }
    if (this.mode === 'host') this.net.onStart(); // tell clients before anyone spawns
    for (const c of this.chars) this.respawn(c, true);
    if (!attract) this.hud.centerMessage('FIGHT', `First to ${CFG.killLimit} kills`, 2.2, '#ff8a2a');
  }

  /** Multiplayer client: reset to a clean slate; the host drives everything else. */
  startClient(matchTime) {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.mode = 'client';
    this.attract = false;
    this.time = 0;
    this.matchTime = matchTime;
    this.over = false;
    this.winner = null;
    this.effects.clear();
    this.hud.reset();
    for (const p of this.pickups) p.reset();
    const p = this.player;
    p.kills = 0; p.deaths = 0; p.alive = false;
    p.respawnAt = Infinity; // wait for the host to place us
    this.chars = [p, ...this.remotes];
  }

  charById(id) {
    for (const c of this.chars) if (c.id === id) return c;
    return null;
  }

  addRemote(c) {
    this.remotes.push(c);
    if (!this.attract) this.chars.push(c);
  }

  removeRemote(c) {
    c.alive = false;
    c.dispose();
    this.remotes = this.remotes.filter((r) => r !== c);
    this.chars = this.chars.filter((r) => r !== c);
  }

  clearRemotes() {
    for (const r of this.remotes) r.dispose();
    this.remotes = [];
  }

  ranking() {
    return [...this.chars].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id);
  }

  endMatch() {
    if (this.over) return;
    this.over = true;
    const rank = this.ranking();
    this.winner = rank[0];
    if (this.mode === 'host') this.net.onEnd();
    if (this.onMatchEnd) this.onMatchEnd(this.winner, rank);
  }

  /** Spawn point far from (and ideally out of sight of) every enemy. */
  pickSpawn(who) {
    let best = this.spawns[0], bestScore = -Infinity;
    for (const s of this.spawns) {
      let minD = 60, seen = false;
      for (const c of this.chars) {
        if (c === who || !c.alive) continue;
        const d = Math.hypot(c.pos.x - s.x, c.pos.y - s.y, c.pos.z - s.z);
        if (d < minD) minD = d;
        if (!seen && d < 45 && !this.world.segmentBlocked(s.x, s.y + 1.6, s.z, c.pos.x, c.pos.y + c.eyeH, c.pos.z)) seen = true;
      }
      let score = Math.min(minD, 32) + Math.random() * 7;
      if (seen) score -= 9;
      if (minD < 9) score -= 30;
      if (this.time - s.lastUsed < 4) score -= 40;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    best.lastUsed = this.time;
    return best;
  }

  respawn(c, first = false) {
    const s = this.pickSpawn(c);
    c.spawnAt(s.x, s.y, s.z, s.yaw);
    if (this.mode === 'host') this.net.onSpawn(c);
    if (c.isPlayer && !first) this.audio.play('respawn');
  }

  // ======================================================================
  // combat
  // ======================================================================

  fireWeapon(shooter, w, ads) {
    const def = w.def;
    const fx = this.effects, world = this.world;
    shooter.getEye(_o);
    shooter.aimDir(_dir);
    const spread = shooter.currentSpread(ads);
    shooter.getMuzzle(_muz);
    _right.crossVectors(_dir, UP);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _dir);
    this.stats.shots++;

    const client = this.mode === 'client';
    const ends = this.net ? [] : null; // what everyone else needs to draw this shot
    const claims = client ? [] : null; // "I hit X" reports for the host to check
    const victims = this._victims || (this._victims = []);
    victims.length = 0;
    for (let i = 0; i < def.pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = spread * Math.sqrt(Math.random());
      _d.copy(_dir).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
      let tBest = def.range;
      const hitWorld = world.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, def.range, _hit);
      if (hitWorld) tBest = _hit.t;
      let victim = null, head = false;
      for (const c of this.chars) {
        if (c === shooter || !c.alive) continue;
        if (rayChar(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, c, tBest, _ch)) { tBest = _ch.t; victim = c; head = _ch.head; }
      }
      const ex = _o.x + _d.x * tBest, ey = _o.y + _d.y * tBest, ez = _o.z + _d.z * tBest;
      if (victim) {
        const dmg = damageAtDistance(def, tBest) * (head ? CFG.headshotMult : 1);
        let v = victims.find((e) => e.c === victim);
        if (!v) { v = { c: victim, dmg: 0, head: false, x: ex, y: ey, z: ez }; victims.push(v); }
        v.dmg += dmg;
        v.head = v.head || head;
        if (i < 4) fx.hitBurst(ex, ey, ez, _d.x, _d.y, _d.z, victim.isProtected() ? 0x8fd3ff : victim.color, head);
        if (ends) ends.push([r2(ex), r2(ey), r2(ez), 2, victim.id, head ? 1 : 0]);
        if (claims) claims.push([victim.id, head ? 1 : 0, r2(tBest)]);
      } else if (hitWorld) {
        fx.impact(ex, ey, ez, _hit.nx, _hit.ny, _hit.nz, i < 3);
        if (i === 0) { _d.set(ex, ey, ez); this.audio.play('impact', _d); }
        if (ends) ends.push([r2(ex), r2(ey), r2(ez), 1, r2(_hit.nx), r2(_hit.ny), r2(_hit.nz)]);
      } else if (ends) {
        ends.push([r2(ex), r2(ey), r2(ez), 0]);
      }
      if (def.pellets === 1 || i % 2 === 0) fx.tracer(_muz.x, _muz.y, _muz.z, ex, ey, ez);
    }

    shooter.protectedUntil = 0; // attacking ends spawn protection
    if (shooter.isPlayer) {
      this.audio.play(def.id);
      fx.muzzleLight(_muz.x, _muz.y, _muz.z);
    } else {
      this.audio.play(def.id, shooter.pos);
    }
    shooter.onFired(def);

    if (client) {
      // The host owns health. Report what we hit; show the hit marker right away.
      this.net.sendFire(def, _muz, ends, claims);
      for (const v of victims) {
        if (v.c.isProtected()) continue;
        this.hud.hitmarker(v.head, false);
        this.audio.play(v.head ? 'headshot' : 'hit');
      }
      return;
    }
    if (this.mode === 'host') this.net.onShot(shooter, def, _muz, ends);
    this.emitNoise(shooter.pos.x, shooter.pos.y, shooter.pos.z, def.noise, shooter, 'shot');
    for (const v of victims) this.damage(v.c, v.dmg, shooter, v.head, def);
  }

  damage(victim, amount, attacker, head, def) {
    if (!victim.alive || this.over) return;
    if (victim.isProtected()) return;
    if (!attacker.isHuman && victim.isHuman) amount *= this.skill.dmgVsPlayer;
    const absorbed = Math.min(victim.armor, amount * CFG.armorAbsorb);
    victim.armor -= absorbed;
    victim.health -= amount - absorbed;
    victim.lastHurtBy = attacker;
    victim.lastHurtT = this.time;
    const killed = victim.health <= 0;
    if (attacker.isPlayer) {
      this.hud.hitmarker(head, killed);
      this.audio.play(head ? 'headshot' : 'hit');
    }
    victim.onDamaged(attacker, amount);
    if (killed) this.kill(victim, attacker, head, def);
  }

  kill(victim, attacker, head, def) {
    victim.health = 0;
    victim.alive = false;
    victim.deaths++;
    victim.respawnAt = this.time + CFG.respawnDelay;
    if (attacker !== victim) attacker.kills++;
    this.stats.kills++;
    const weapon = def ? def.name : '?';
    this.presentKill(victim, attacker, head, weapon);
    if (this.mode === 'host') this.net.onKill(victim, attacker, head, weapon);
    if (attacker.kills >= CFG.killLimit) {
      if (this.attract) { for (const c of this.chars) { c.kills = 0; c.deaths = 0; } }
      else this.endMatch();
    }
  }

  /** Everything a kill looks and sounds like (also used by multiplayer clients). */
  presentKill(victim, attacker, head, weapon) {
    victim.onDeath(attacker);
    this.effects.deathBurst(victim.pos.x, victim.pos.y, victim.pos.z, victim.color);
    this.audio.play('death', victim.isPlayer ? null : victim.pos);
    if (this.attract) return;
    this.hud.addKill(attacker, victim, weapon, head);
    if (attacker.isPlayer) {
      this.audio.play('kill');
      const sub = head ? 'Headshot' : this.mode === 'client' ? '' : `${attacker.kills} / ${CFG.killLimit}`;
      this.hud.centerMessage(`ELIMINATED ${victim.name.toUpperCase()}`, sub, 1.6, '#' + victim.color.toString(16).padStart(6, '0'));
    }
  }

  /** Let bots within `radius` hear a sound. */
  emitNoise(x, y, z, radius, src, kind) {
    for (const b of this.bots) {
      if (b === src || !b.alive) continue;
      const d = Math.hypot(b.pos.x - x, b.pos.y - y, b.pos.z - z);
      if (d < radius) b.hear(x, y, z, src, kind, d / radius);
    }
  }

  /** Keep characters from standing inside each other. */
  separate() {
    const cs = this.chars;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        if (!b.alive) continue;
        if (a.pos.y > b.pos.y + b.height || b.pos.y > a.pos.y + a.height) continue;
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius + 0.04;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-4) { const ang = Math.random() * 6.283; dx = Math.cos(ang); dz = Math.sin(ang); d = 1; }
        const push = (min - d) * 0.5;
        dx /= d; dz /= d;
        a.extX -= dx * push; a.extZ -= dz * push;
        b.extX += dx * push; b.extZ += dz * push;
      }
    }
  }

  updatePickups(dt) {
    for (let i = 0; i < this.pickups.length; i++) {
      const p = this.pickups[i];
      p.update(dt, this.time);
      if (!p.active) continue;
      for (const c of this.chars) {
        if (!c.alive) continue;
        const dx = c.pos.x - p.pos.x, dz = c.pos.z - p.pos.z;
        if (dx * dx + dz * dz > 1.0 || Math.abs(c.pos.y - p.pos.y) > 1.5) continue;
        if (!p.usefulTo(c)) continue;
        p.apply(c);
        p.take();
        this.effects.pickupBurst(p.pos.x, p.pos.y, p.pos.z, p.info.color);
        this.audio.play('pickup', c.isPlayer ? null : p.pos, 1, p.info.tone);
        if (c.isPlayer) this.hud.toast(p.info.label, '#' + p.info.color.toString(16).padStart(6, '0'));
        if (this.mode === 'host') this.net.onPickup(i, c);
        break;
      }
    }
  }

  // ======================================================================
  // frame
  // ======================================================================

  update(dt) {
    if (this.over) {
      this.effects.update(dt);
      for (const r of this.remotes) r.update(dt);
      this.orbitCamera(dt, 0.05);
      return;
    }
    if (this.mode === 'client') { this.updateClient(dt); return; }
    this.time += dt;
    if (!this.attract) {
      this.matchTime -= dt;
      if (this.matchTime <= 0) { this.matchTime = 0; this.endMatch(); return; }
    }
    for (const c of this.chars) if (!c.alive && this.time >= c.respawnAt) this.respawn(c);

    this.separate();
    if (this.attract) this.orbitCamera(dt, 0.045);
    else this.player.update(dt, this.input);
    for (const r of this.remotes) r.update(dt);
    for (const b of this.bots) b.update(dt);
    this.updatePickups(dt);
    this.effects.update(dt);

    const cam = this.camera;
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.attract ? 0 : this.player.yaw);
    if (!this.attract) this.hud.update(this, dt);
  }

  /** Multiplayer client frame: simulate only ourselves; the host sends the rest. */
  updateClient(dt) {
    this.time += dt;
    this.matchTime = Math.max(0, this.matchTime - dt); // re-synced by every snapshot
    this.separate();
    this.player.update(dt, this.input);
    for (const r of this.remotes) r.update(dt);
    for (const p of this.pickups) p.update(dt, this.time, false);
    this.effects.update(dt);
    const cam = this.camera;
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.player.yaw);
    this.hud.update(this, dt);
  }

  orbitCamera(dt, speed) {
    this.orbit = (this.orbit || 0.6) + dt * speed;
    const cam = this.camera;
    cam.position.set(Math.cos(this.orbit) * 60, 34, Math.sin(this.orbit) * 60);
    cam.rotation.set(0, 0, 0);
    cam.lookAt(0, -4, 0);
    if (Math.abs(cam.fov - 55) > 0.01) { cam.fov = 55; cam.updateProjectionMatrix(); }
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (!this.attract && !this.over && this.player.alive) {
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }
  }
}
