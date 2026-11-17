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
import { damageAtDistance, GRENADE, KNIFE, makeLoadout, makeSingle } from './weapons.js';
import { getMode, TEAM_COLORS, GUN_LADDER, gunLevel } from './modes.js';
import { Announcer } from './announcer.js';

const MULTI_WINDOW = 4; // seconds between kills that still count as a multi-kill
const MULTI_NAMES = { 2: 'Double Kill', 3: 'Triple Kill', 4: 'Quad Kill' }; // 5+: Mega Kill
const STREAK_NAMES = { 3: 'Killing Spree', 5: 'Rampage', 7: 'Dominating', 10: 'Unstoppable', 15: 'Godlike', 20: 'Legendary' };

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
  const lo = c.leanOff; // leaning moves the head sideways
  const hx = ox - (c.pos.x + Math.cos(c.yaw) * lo), hy = oy - (c.pos.y + c.height - 0.2 - Math.abs(lo) * 0.14), hz = oz - (c.pos.z - Math.sin(c.yaw) * lo);
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

const GRENADE_GEO = new THREE.IcosahedronGeometry(0.11, 0);
function makeGrenadeMesh() {
  const m = new THREE.Mesh(GRENADE_GEO, new THREE.MeshLambertMaterial({ color: 0x3f4a2c, emissive: 0xff2200, emissiveIntensity: 0 }));
  m.castShadow = true;
  return m;
}

export class Game {
  constructor({ canvas, settings, audio, hud, input, map }) {
    this.settings = settings;
    this.audio = audio;
    this.hud = hud;
    this.input = input;
    this.map = null;

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

    this.effects = new Effects(this.scene);
    this.viewmodel = new ViewModel();
    this.announcer = new Announcer(settings, audio, hud);
    this.rules = getMode('ffa');
    this.teamScore = [0, 0];
    this.firstBlood = false;
    this.pickups = [];
    this.worldObjs = [];
    this.grenades = [];
    this.grenadePool = [];
    this.nextGrenadeId = 1;
    this.botsOn = true;
    this.loadMap(map);

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

  /** (Re)build the world from map data: collision, nav grid, meshes, sky, lights, pickups. */
  loadMap(map) {
    if (this.map === map) return;
    for (const o of this.worldObjs) {
      this.scene.remove(o);
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    }
    for (const p of this.pickups) p.dispose();
    this.map = map;
    this.world = new World(map);
    this.nav = new NavGrid(this.world);
    const s0 = map.spawns[0];
    this.nav.markReachable(s0[0], s0[1], s0[2]);
    const meshes = buildWorldMeshes(this.world, this.scene);
    const sky = buildSky(this.scene, map.sky);
    this.lights = buildLights(this.scene, map, true);
    this.worldObjs = [...meshes, sky, ...this.lights.all];
    this.pickups = map.pickups.map((p) => new Pickup(p, this.scene));
    this.spawns = map.spawns.map((s) => ({ x: s[0], y: s[1], z: s[2], yaw: ((s[3] || 0) * Math.PI) / 180, lastUsed: -99 }));
    const b = map.bounds;
    this.orbitR = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.72;
    this.effects.clear();
    this.clearGrenades();
    this.applySettings('quality');
  }

  applySettings(key) {
    if (!key || key === 'quality') {
      // High: shadows, full resolution, fill lights. Low: none of those, 75% resolution.
      const high = this.settings.quality !== 'low';
      const dpr = window.devicePixelRatio || 1;
      this.renderer.setPixelRatio(high ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * 0.75);
      this.lights.sun.castShadow = high;
      this.renderer.shadowMap.needsUpdate = true;
      for (const p of this.lights.points) p.visible = high;
      this.effects.lowDetail = !high;
      this.resize();
    }
    if (!key || key === 'volume') this.audio.setVolume(this.settings.volume);
  }

  // ======================================================================
  // match flow
  // ======================================================================

  newMatch({ botCount, bots = true, difficulty, attract = false, map = null, rules = null }) {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    if (map) this.loadMap(map);
    this.clearGrenades();
    this.botCount = Math.max(1, Math.min(10, botCount | 0));
    this.botsOn = bots;
    this.mode = this.net && !attract ? 'host' : 'sp';
    if (this.mode !== 'host') this.clearRemotes();
    this.skill = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    this.difficulty = difficulty;
    this.attract = attract;
    this.rules = attract ? getMode('ffa') : rules || getMode('ffa');
    this.teamScore = [0, 0];
    this.firstBlood = false;
    this.time = 0;
    this.matchTime = CFG.timeLimit;
    this.over = false;
    this.winner = null;
    this.stats = { stuck: 0, shots: 0, kills: 0 };
    this.effects.clear();
    this.hud.reset();
    for (const p of this.pickups) p.reset();
    for (const s of this.spawns) s.lastUsed = -99;

    const n = bots ? this.botCount : 0;
    for (let i = 0; i < n; i++) this.bots.push(new Bot(this, i + 1, BOT_ROSTER[i % BOT_ROSTER.length]));
    const p = this.player;
    p.kills = 0; p.deaths = 0; p.alive = false;
    this.chars = attract ? [...this.bots] : [p, ...this.remotes, ...this.bots];
    for (const c of this.chars) this.resetScore(c);
    this.assignTeams();
    if (this.mode === 'host') this.net.onStart(); // tell clients before anyone spawns
    for (const c of this.chars) this.respawn(c, true);
    if (!attract) this.hud.centerMessage(this.rules.name.toUpperCase(), this.rules.blurb, 3.2, '#ff8a2a');
  }

  /** Add or remove the bots mid-match (host / solo only). */
  setBots(on) {
    if (this.attract || this.mode === 'client' || on === this.botsOn) return;
    this.botsOn = on;
    if (!on) {
      for (const b of this.bots) { b.alive = false; b.dispose(); }
      this.chars = this.chars.filter((c) => !this.bots.includes(c));
      this.bots = [];
    } else {
      for (let i = 0; i < this.botCount; i++) {
        const b = new Bot(this, i + 1, BOT_ROSTER[i % BOT_ROSTER.length]);
        this.bots.push(b);
        this.chars.push(b);
        this.resetScore(b);
        this.joinTeam(b);
        if (!this.over) this.respawn(b, true);
      }
    }
    if (this.mode === 'host') this.net.onRosterChanged();
  }

  /** Multiplayer client: reset to a clean slate; the host drives everything else. */
  startClient(matchTime, rules) {
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.mode = 'client';
    this.rules = rules;
    this.teamScore = [0, 0];
    this.firstBlood = false;
    this.attract = false;
    this.time = 0;
    this.matchTime = matchTime;
    this.over = false;
    this.winner = null;
    this.effects.clear();
    this.clearGrenades();
    this.hud.reset();
    for (const p of this.pickups) p.reset();
    const p = this.player;
    p.alive = false;
    p.respawnAt = Infinity; // wait for the host to place us
    this.chars = [p, ...this.remotes];
    for (const c of this.chars) this.resetScore(c);
  }

  /** Fresh scores, streaks and lives for a new match. */
  resetScore(c) {
    c.kills = 0; c.deaths = 0; c.alive = false;
    c.streak = 0; c.multi = 0; c.lastKillT = -99;
    c.gunLevel = 0;
    c.lives = this.rules.lives || 0;
  }

  /** The weapons a character gets on spawning, under the current rules. */
  loadoutFor(c) {
    const r = this.rules;
    if (r.gunGame) return makeSingle(GUN_LADDER[gunLevel(c.kills)]);
    return makeLoadout(r.forcePrimary || c.primary);
  }

  /** Out of lives (Last One Standing)? */
  isOut(c) { return !!this.rules.lives && c.lives <= 0; }

  /** Team colours in team modes, everyone's own colour otherwise. */
  paint(c) {
    const color = this.rules.teams && c.team >= 0 ? TEAM_COLORS[c.team] : c.baseColor;
    c.color = color;
    if (c.model) c.model.setColor(color, c.name);
  }

  /** Split everyone into alternating teams (humans first, so they spread out too). */
  assignTeams() {
    let i = 0;
    for (const c of this.chars) { c.team = this.rules.teams ? i++ % 2 : -1; this.paint(c); }
  }

  /** A late arrival joins the smaller team. */
  joinTeam(c) {
    if (!this.rules.teams) { c.team = -1; this.paint(c); return; }
    const n = [0, 0], humans = [0, 0];
    for (const o of this.chars) {
      if (o === c || o.team < 0) continue;
      n[o.team]++;
      if (o.isHuman) humans[o.team]++;
    }
    // smaller team first; on a tie, spread the humans out
    if (n[0] !== n[1]) c.team = n[0] < n[1] ? 0 : 1;
    else if (c.isHuman && humans[0] !== humans[1]) c.team = humans[0] < humans[1] ? 0 : 1;
    else c.team = 0;
    this.paint(c);
  }

  sameTeam(a, b) { return this.rules.teams && a !== b && a.team >= 0 && a.team === b.team; }

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
    return this.rules.rank(this.chars);
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
        if (c === who || !c.alive || this.sameTeam(c, who)) continue; // teammates are not a threat
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
        if (v.c.isProtected() || this.sameTeam(v.c, shooter)) continue;
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
    if (this.sameTeam(victim, attacker)) return; // no friendly fire
    if (!attacker.isHuman && victim.isHuman) amount *= this.skill.dmgVsPlayer;
    const absorbed = Math.min(victim.armor, amount * CFG.armorAbsorb);
    victim.armor -= absorbed;
    victim.health -= amount - absorbed;
    victim.lastHurtBy = attacker;
    victim.lastHurtT = this.time;
    const killed = victim.health <= 0;
    if (attacker.isPlayer && attacker !== victim) {
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
    if (this.rules.lives) {
      victim.lives = Math.max(0, victim.lives - 1);
      if (victim.lives === 0) victim.respawnAt = Infinity; // out for the rest of the match
    }
    if (attacker !== victim) {
      attacker.kills++;
      if (this.rules.teams && attacker.team >= 0) this.teamScore[attacker.team]++;
    }
    this.stats.kills++;
    const weapon = def ? def.name : '?';
    this.presentKill(victim, attacker, head, weapon);
    if (this.mode === 'host') this.net.onKill(victim, attacker, head, weapon);
    if (attacker !== victim) attacker.applyGunLevel();
    if (!this.over && this.rules.won(this)) {
      if (this.attract) { for (const c of this.chars) { c.kills = 0; c.deaths = 0; } } // menu background loops forever
      else this.endMatch();
    }
  }

  /** Everything a kill looks and sounds like (also used by multiplayer clients). */
  presentKill(victim, attacker, head, weapon) {
    victim.onDeath(attacker);
    this.effects.deathBurst(victim.pos.x, victim.pos.y, victim.pos.z, victim.color);
    this.audio.play('death', victim.isPlayer ? null : victim.pos);

    // Streaks and multi-kills, tracked on every machine from the kills it sees.
    const ended = victim.streak;
    victim.streak = 0;
    victim.multi = 0;
    let first = false;
    if (attacker !== victim) {
      attacker.multi = this.time - attacker.lastKillT <= MULTI_WINDOW ? attacker.multi + 1 : 1;
      attacker.lastKillT = this.time;
      attacker.streak++;
      if (!this.firstBlood) { this.firstBlood = true; first = true; }
    }
    if (this.attract) return;

    this.hud.addKill(attacker, victim, weapon, head);
    if (attacker.isPlayer && attacker !== victim) {
      this.audio.play('kill');
      const limit = this.rules.scoreLimit && !this.rules.teams && this.mode !== 'client';
      const sub = head ? (weapon === 'Knife' ? 'Backstab' : 'Headshot') : limit ? `${attacker.kills} / ${this.rules.scoreLimit}` : '';
      this.hud.centerMessage(`ELIMINATED ${victim.name.toUpperCase()}`, sub, 1.6, '#' + victim.color.toString(16).padStart(6, '0'));
    }
    this.announceKill(victim, attacker, first, ended);
  }

  /** Killstreak announcer: big call-outs for you, kill-feed notes for everyone else. */
  announceKill(victim, attacker, first, ended) {
    const me = this.player;
    const streakName = STREAK_NAMES[attacker.streak];
    if (attacker === me && victim !== me) {
      let text = null, sub = '';
      if (me.multi >= 2) text = me.multi >= 5 ? 'Mega Kill' : MULTI_NAMES[me.multi];
      if (streakName) { if (text) sub = streakName; else text = streakName; }
      if (!text && first) text = 'First Blood';
      if (!text && ended >= 3) { text = 'Shutdown'; sub = `Ended ${victim.name}'s ${ended}-kill streak`; }
      if (text) this.announcer.announce(text, sub);
    } else if (attacker !== victim) {
      if (first) this.hud.feedNote(`${attacker.name} drew first blood`, attacker.color);
      else if (streakName && attacker.streak >= 5) this.hud.feedNote(`${attacker.name} is on a ${streakName.toLowerCase()}`, attacker.color);
      if (ended >= 5 && victim !== me) this.hud.feedNote(`${attacker.name} ended ${victim.name}'s ${ended}-kill streak`, attacker.color);
    }
    if (victim === me && ended >= 3 && attacker !== me) this.hud.feedNote(`Your ${ended}-kill streak is over`, 0x9aa6b2);
  }

  // ======================================================================
  // knife
  // ======================================================================

  /** Closest enemy in front of `a` within `range` that the knife can reach, or null. */
  meleeTarget(a, range) {
    a.getEye(_o);
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    let best = null, bd = Infinity;
    for (const c of this.chars) {
      if (c === a || !c.alive || this.sameTeam(c, a)) continue;
      if (Math.abs(c.pos.y - a.pos.y) > 1.6) continue;
      const dx = c.pos.x - a.pos.x, dz = c.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz) - c.radius;
      if (d > range || d >= bd) continue;
      if (d > 0.3 && (dx * fx + dz * fz) / (d + c.radius) < KNIFE.cone) continue;
      if (this.world.segmentBlocked(_o.x, _o.y, _o.z, c.pos.x, c.pos.y + c.height * 0.55, c.pos.z)) continue;
      best = c; bd = d;
    }
    return best;
  }

  /** Is `a` behind `v` (for a backstab)? `slack` loosens the test for network lag. */
  isBehind(a, v, slack = 0) {
    const dx = a.pos.x - v.pos.x, dz = a.pos.z - v.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    return (dx * -Math.sin(v.yaw) + dz * -Math.cos(v.yaw)) / l < -0.25 + slack;
  }

  knifeAttack(a) {
    this.audio.play('knife', a.isPlayer ? null : a.pos);
    const v = this.meleeTarget(a, KNIFE.lunge);
    if (v) {
      // just out of reach: lunge in (the move is collision-checked like any other)
      const dx = v.pos.x - a.pos.x, dz = v.pos.z - a.pos.z, l = Math.hypot(dx, dz) || 1;
      const gap = l - v.radius - KNIFE.range * 0.55;
      if (gap > 0) { a.extX += (dx / l) * gap; a.extZ += (dz / l) * gap; }
    }
    if (this.mode === 'client') {
      // the host decides the damage; show the hit right away
      const back = !!v && this.isBehind(a, v);
      this.net.sendKnife(v ? v.id : -1, back);
      if (v && !v.isProtected()) {
        this.hud.hitmarker(back, false);
        this.audio.play('stab');
      }
      return;
    }
    if (this.mode === 'host') this.net.onKnife(a);
    this.emitNoise(a.pos.x, a.pos.y, a.pos.z, KNIFE.noise, a, 'step');
    if (v) this.knifeHit(a, v, this.isBehind(a, v));
  }

  /** Authoritative knife damage. */
  knifeHit(a, v, back) {
    _d.set(v.pos.x, v.pos.y + v.height * 0.6, v.pos.z);
    this.effects.hitBurst(_d.x, _d.y, _d.z, v.pos.x - a.pos.x, 0, v.pos.z - a.pos.z, v.isProtected() ? 0x8fd3ff : v.color, back);
    this.audio.play('stab', a.isPlayer ? null : _d);
    this.damage(v, back ? KNIFE.backstab : KNIFE.damage, a, back, KNIFE);
  }

  // ======================================================================
  // grenades
  // ======================================================================

  throwGrenade(char, dir) {
    char.getEye(_o);
    if (dir) _dir.copy(dir);
    else { char.aimDir(_dir); _dir.y += 0.1; _dir.normalize(); } // a little loft
    const sp = GRENADE.speed;
    const o = [r2(_o.x + _dir.x * 0.25), r2(_o.y + _dir.y * 0.25 - 0.1), r2(_o.z + _dir.z * 0.25)];
    const v = [r2(_dir.x * sp + char.vel.x * 0.4), r2(_dir.y * sp + Math.max(0, char.vel.y) * 0.3), r2(_dir.z * sp + char.vel.z * 0.4)];
    if (this.mode === 'client') { this.net.sendGrenade(o, v); return; } // the host spawns it for everyone
    this.spawnGrenade(this.nextGrenadeId++, char, o, v);
  }

  spawnGrenade(id, owner, o, v) {
    const mesh = this.grenadePool.pop() || makeGrenadeMesh();
    mesh.visible = true;
    this.scene.add(mesh);
    const g = { id, owner, x: o[0], y: o[1], z: o[2], vx: v[0], vy: v[1], vz: v[2], fuse: GRENADE.fuse, mesh, resting: false, bounceT: 0 };
    this.grenades.push(g);
    _d.set(g.x, g.y, g.z);
    this.audio.play('throw', owner && owner.isPlayer ? null : _d);
    if (this.mode === 'host') this.net.onGrenade(g);
    return g;
  }

  removeGrenade(i) {
    const g = this.grenades[i];
    this.scene.remove(g.mesh);
    this.grenadePool.push(g.mesh);
    this.grenades.splice(i, 1);
  }

  clearGrenades() {
    for (let i = this.grenades.length - 1; i >= 0; i--) this.removeGrenade(i);
  }

  updateGrenades(dt) {
    const R = 0.12, world = this.world;
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.bounceT -= dt;
      if (!g.resting) {
        g.vy -= GRENADE.gravity * dt;
        let remaining = dt;
        for (let iter = 0; iter < 3 && remaining > 1e-5; iter++) {
          const sp = Math.hypot(g.vx, g.vy, g.vz);
          if (sp < 1e-3) break;
          const dx = g.vx / sp, dy = g.vy / sp, dz = g.vz / sp;
          const dist = sp * remaining;
          if (!world.raycast(g.x, g.y, g.z, dx, dy, dz, dist + R, _hit)) {
            g.x += dx * dist; g.y += dy * dist; g.z += dz * dist;
            break;
          }
          const travel = Math.max(0, _hit.t - R);
          g.x += dx * travel; g.y += dy * travel; g.z += dz * travel;
          remaining -= travel / sp;
          const vn = g.vx * _hit.nx + g.vy * _hit.ny + g.vz * _hit.nz;
          if (vn >= 0) break; // already heading away from the surface
          // bounce: lose energy along the normal, scrub some along the surface
          const k = 1.42 * vn;
          g.vx = (g.vx - k * _hit.nx) * 0.8;
          g.vy = (g.vy - k * _hit.ny) * 0.9;
          g.vz = (g.vz - k * _hit.nz) * 0.8;
          if (-vn > 2.5 && g.bounceT <= 0) {
            g.bounceT = 0.12;
            _d.set(g.x, g.y, g.z);
            this.audio.play('bounce', _d);
          }
          if (_hit.ny > 0.6 && Math.hypot(g.vx, g.vy, g.vz) < 1.3) {
            g.resting = true;
            g.vx = g.vy = g.vz = 0;
            break;
          }
        }
        if (g.y < -5) g.fuse = Math.min(g.fuse, 0);
        g.mesh.rotation.x += dt * 9;
        g.mesh.rotation.z += dt * 6;
      }
      g.mesh.position.set(g.x, g.y, g.z);
      // blink faster as the fuse runs down
      g.mesh.material.emissiveIntensity = Math.sin(g.fuse * (g.fuse < 0.8 ? 40 : 14)) > 0 ? 1.6 : 0;
      if (g.fuse <= 0) {
        if (this.mode === 'client') {
          if (g.fuse < -1.5) this.removeGrenade(i); // the host's "boom" never arrived
        } else {
          this.removeGrenade(i);
          this.explode(g.x, g.y, g.z, g.owner, g.id);
        }
      }
    }
  }

  /** Authoritative detonation: effects + damage to everyone in range and in sight. */
  explode(x, y, z, owner, id) {
    this.showExplosion(x, y, z);
    if (this.mode === 'host') this.net.onExplode(id, x, y, z);
    this.emitNoise(x, y, z, GRENADE.noise, owner, 'shot');
    const sy = y + 0.3;
    for (const c of [...this.chars]) {
      if (!c.alive) continue;
      const cy = c.pos.y + c.height * 0.5;
      const d = Math.hypot(c.pos.x - x, cy - y, c.pos.z - z);
      if (d >= GRENADE.radius) continue;
      // walls stop the blast
      if (this.world.segmentBlocked(x, sy, z, c.pos.x, cy, c.pos.z)
        && this.world.segmentBlocked(x, sy, z, c.pos.x, c.pos.y + c.eyeH, c.pos.z)) continue;
      let dmg = GRENADE.damage * (1 - d / GRENADE.radius);
      if (c === owner) dmg *= GRENADE.selfScale;
      this.damage(c, dmg, owner || c, false, GRENADE);
    }
  }

  /** What an explosion looks and sounds like (also used by multiplayer clients). */
  showExplosion(x, y, z) {
    let groundY;
    if (this.world.raycast(x, y + 0.3, z, 0, -1, 0, 3, _hit)) groundY = y + 0.3 - _hit.t;
    this.effects.explosion(x, y, z, groundY);
    _d.set(x, y, z);
    this.audio.play('explosion', _d);
    const p = this.player;
    if (!this.attract && p.alive) {
      const d = Math.hypot(p.pos.x - x, p.pos.y - y, p.pos.z - z);
      if (d < 22) p.shake = Math.min(0.1, p.shake + 0.1 * (1 - d / 22));
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
    this.updateGrenades(dt);
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
    this.updateGrenades(dt);
    this.effects.update(dt);
    const cam = this.camera;
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.player.yaw);
    this.hud.update(this, dt);
  }

  orbitCamera(dt, speed) {
    this.orbit = (this.orbit || 0.6) + dt * speed;
    const cam = this.camera;
    const R = this.orbitR;
    cam.position.set(Math.cos(this.orbit) * R, R * 0.56, Math.sin(this.orbit) * R);
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
