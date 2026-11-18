// The match: owns the scene, the world, all characters and the rules.

import * as THREE from 'three';
import { CFG, DIFFICULTY, BOT_ROSTER } from './config.js';
import { World } from './world.js';
import { NavGrid } from './navgrid.js';
import { buildWorldMeshes, buildSky, buildLights } from './worldMesh.js';
import { buildDecor } from './decor.js';
import { Tutorial } from './tutorial.js';
import { RANKED_MAPS, RANKED_MODES } from './ranked.js';
import { Effects } from './effects.js';
import { Pickup } from './pickups.js';
import { ViewModel } from './viewmodel.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { damageAtDistance, GRENADE, FLASH, KNIFE, makeLoadout, makeSingle } from './weapons.js';
import { SmokeClouds } from './smoke.js';
import { Bolts } from './bolts.js';
import { ATT_SLOTS, ATTACHMENTS, fits, attUnlocked } from './attachments.js';
import { applyCrosshair } from './settings.js';
import { Career } from './career.js';
import { Ctf } from './ctf.js';
import { OBJECTIVES, INFECTED_SPEED } from './objectives.js';
import { Progress, XP } from './progress.js';
import { itemOf } from './cosmetics.js';
import { weaponIdOf } from './career.js';
import { SKIN_GUNS, SKIN_BY_ID, skinUnlocked } from './skins.js';
import { getMode, makeRules, MODES, TEAM_COLORS, TEAM_NAMES, GUN_LADDER, gunLevel, setTeamPalette } from './modes.js';
import { MAPS, getMap } from './maps/index.js';
import { Announcer } from './announcer.js';
import { MEDAL_BY_ID, STREAK_MEDALS, MULTI_MEDALS } from './medals.js';
import { KillCam } from './killcam.js';
import { Range } from './training.js';

export const HILL_TIME = 60; // seconds before the hill moves

/** A shooter's tracer colour (an unlockable). */
export const tracerColor = (c) => itemOf('tracer', c && c.cos ? c.cos.equipped.tracer : 'default').color;
export const VOTE_TIME = 30; // multiplayer: seconds to vote before the next match starts by itself
const HILL_COLORS = { [-1]: 0xffffff, 0: TEAM_COLORS[0], 1: TEAM_COLORS[1], 2: 0xffd24d };
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
export function rayChar(ox, oy, oz, dx, dy, dz, c, tMax, out) {
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
const FLASH_GEO = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8);
function makeGrenadeMesh(kind) {
  const m = new THREE.Mesh(kind === 'frag' ? GRENADE_GEO : FLASH_GEO, new THREE.MeshLambertMaterial({ color: 0x3f4a2c, emissive: 0xff2200, emissiveIntensity: 0 }));
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
    this.smokes = new SmokeClouds(this.scene);
    this.bolts = new Bolts(this);
    this.rayCharHit = rayChar;
    this.viewmodel = new ViewModel();
    this.announcer = new Announcer(settings, audio, hud);
    this.killcam = new KillCam(this);
    this.career = new Career(); // the player at this keyboard
    this.progress = new Progress(); // XP, level, prestige and equipped cosmetics
    this.hillXpT = 0;
    this.matchPlayT = 0; // seconds you've actually played this match (career: did you take part?)
    this.range = null; // training range state, only on the range map
    this.lastDt = 1 / 60;
    this.rules = getMode('ffa');
    this.teamScore = [0, 0];
    this.firstBlood = false;
    this.hill = { idx: 0, t: HILL_TIME, holder: -1, acc: 0 };
    this.hillFx = null;
    this.pickups = [];
    this.worldObjs = [];
    this.grenades = [];
    this.grenadePool = { frag: [], flash: [], smoke: [] };
    this.nextGrenadeId = 1;
    this.botsOn = true;
    this.ctf = null; // Capture the Flag state, when that's the mode
    this.loadMap(map);

    this.player = new Player(this);
    this.player.cos = this.ownCosmetics();
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
    this.awards = [];
    this.voteOptions = null;
    this.votes = new Map(); // character id -> option index
    this.voteDeadline = 0;
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
    const meshes = [...buildWorldMeshes(this.world, this.scene), ...buildDecor(this.world, this.scene)];
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
    if (!key || key === 'teamPalette') {
      setTeamPalette(this.settings.teamPalette);
      for (const c of new Set([...this.chars, ...this.bots, ...this.remotes])) this.paint(c);
      if (this.ctf) for (const f of this.ctf.flags) { f.mesh.cloth.material.color.setHex(TEAM_COLORS[f.team]); f.mesh.cloth.material.emissive.setHex(TEAM_COLORS[f.team]); for (const o of f.base.children) o.material.color.setHex(TEAM_COLORS[f.team]); }
      if (this.hillFx && this.hillFx.recolor) this.hillFx.recolor();
    }
    if (!key || key === 'softFlash') { document.body.classList.toggle('soft-flash', !!this.settings.softFlash); this.hud.softFlash = !!this.settings.softFlash; }
    if (!key || key === 'quality') {
      // High: shadows, full resolution, fill lights. Low: none of those, 75% resolution.
      const high = this.settings.quality !== 'low';
      const dpr = window.devicePixelRatio || 1;
      this.renderer.setPixelRatio(high ? Math.min(dpr, 1.5) : Math.min(dpr, 1) * 0.75);
      this.lights.sun.castShadow = high;
      this.renderer.shadowMap.needsUpdate = true;
      for (const p of this.lights.points) p.visible = high;
      this.effects.lowDetail = !high;
      this.smokes.lowDetail = !high;
      this.resize();
    }
    if (!key || key === 'volume') this.audio.setVolume(this.settings.volume);
    if (!key || key.startsWith('xh')) applyCrosshair(this.settings);
  }

  // ======================================================================
  // match flow
  // ======================================================================

  newMatch({ botCount, bots = true, difficulty, attract = false, map = null, rules = null }) {
    this.clearCtf();
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
    this.rules = attract || !rules ? makeRules('ffa') : rules; // rules come from makeRules (or the training range)
    this.teamScore = [0, 0];
    this.firstBlood = false;
    this.time = 0;
    this.matchTime = this.rules.training ? Infinity : this.rules.timeLimit || CFG.timeLimit;
    this.minuteDone = false;
    this.over = false;
    this.winner = null;
    this.awards = []; this.voteOptions = null; this.votes = new Map(); this.voteDeadline = 0;
    this.matchPlayT = 0; this.careerCounted = false;
    if (!attract) { this.progress.newMatch(); this.hillXpT = 0; }
    this.stats = { stuck: 0, shots: 0, kills: 0 };
    if (this.range) { this.range.dispose(); this.range = null; }
    if (this.rules.training) this.range = new Range(this);
    if (this.tutorial) { this.tutorial.dispose(); this.tutorial = null; }
    this.playerThrows = [];
    if (this.rules.tutorial && !attract) this.tutorial = new Tutorial(this, () => { if (this.onTutorialDone) this.onTutorialDone(); });
    this.effects.clear();
    this.hud.reset();
    this.resetPickups();
    for (const s of this.spawns) s.lastUsed = -99;

    const n = bots ? this.botCount : 0;
    for (let i = 0; i < n; i++) this.bots.push(new Bot(this, i + 1, BOT_ROSTER[i % BOT_ROSTER.length]));
    const p = this.player;
    p.kills = 0; p.deaths = 0; p.alive = false;
    this.chars = attract ? [...this.bots] : [p, ...this.remotes, ...this.bots];
    for (const c of this.chars) this.resetScore(c);
    this.assignTeams();
    if (this.rules.hill) this.resetHill();
    if (this.rules.ctf && this.map.flags) this.ctf = new Ctf(this);
    this.makeObj();
    this.killcam.reset();
    if (this.mode === 'host') this.net.onStart(); // tell clients before anyone spawns
    for (const c of this.chars) this.respawn(c, true);
    if (!attract && !this.rules.tutorial) this.hud.centerMessage(this.rules.name.toUpperCase(), this.rules.blurb, 3.2, '#ff8a2a');
    if (!attract && !this.rules.training) this.sting('sting-start');
  }

  /** A music sting (a beat later, so a just-resumed audio context is running). */
  sting(name) {
    clearTimeout(this.stingT);
    this.stingT = setTimeout(() => this.audio.play(name), 200);
  }

  /** Every frame: the last minute of the clock gets a sting (once a match). */
  clockTick() {
    if (this.attract || this.over || this.minuteDone || !Number.isFinite(this.matchTime)) return;
    if (this.matchTime <= 60 && this.matchTime > 55 && (this.rules.timeLimit || CFG.timeLimit) > 90) {
      this.minuteDone = true;
      this.audio.play('sting-minute');
      this.hud.centerMessage('ONE MINUTE', 'Last minute of the match', 2.4, '#ff8a2a');
    }
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
    this.clearCtf();
    for (const b of this.bots) b.dispose();
    this.bots = [];
    this.mode = 'client';
    this.rules = rules;
    if (this.range) { this.range.dispose(); this.range = null; }
    this.teamScore = [0, 0];
    this.firstBlood = false;
    this.attract = false;
    this.time = 0;
    this.matchTime = matchTime;
    this.minuteDone = matchTime <= 60; // joined inside the last minute: no sting
    this.sting('sting-start');
    this.over = false;
    this.winner = null;
    this.awards = []; this.voteOptions = null; this.votes = new Map(); this.voteDeadline = 0; this.voteCounts = [];
    this.matchPlayT = 0; this.careerCounted = false;
    this.progress.newMatch(); this.hillXpT = 0;
    this.effects.clear();
    this.clearGrenades();
    this.hud.reset();
    this.resetPickups();
    this.killcam.reset();
    const p = this.player;
    p.alive = false;
    p.respawnAt = Infinity; // wait for the host to place us
    this.chars = [p, ...this.remotes];
    for (const c of this.chars) this.resetScore(c);
    if (this.rules.ctf && this.map.flags) this.ctf = new Ctf(this);
    this.makeObj();
  }

  clearCtf() {
    if (this.ctf) { this.ctf.dispose(); this.ctf = null; }
    if (this.obj) { this.obj.dispose(); this.obj = null; }
  }

  /** Domination, Search & Destroy, Infected: the mode's objective (see objectives.js). */
  makeObj() {
    const O = !this.attract && this.rules.objective && OBJECTIVES[this.rules.objective];
    this.obj = O ? new O(this) : null;
  }

  /** Fresh scores, streaks and lives for a new match. */
  resetScore(c) {
    c.kills = 0; c.deaths = 0; c.alive = false;
    c.streak = 0; c.multi = 0; c.lastKillT = -99;
    c.gunLevel = 0;
    c.lives = this.rules.lives || 0;
    c.hillTime = 0;
    c.caps = 0;
    c.speedMul = 1;
    c.lastKiller = null; c.lastVictim = null; c.deathRun = 0; // (medals)
    // for the end-of-match awards (kept by whoever runs the match)
    c.st = { shots: 0, hits: 0, heads: 0, knives: 0, nades: 0, bestStreak: 0, longest: 0, returns: 0 };
  }

  /** A shot left `c`'s gun; `hit` = it hurt an enemy. Called by the match authority. */
  countShot(c, hit) {
    if (!c.st || this.range || this.attract) return;
    c.st.shots++;
    if (hit) c.st.hits++;
  }

  /**
   * End-of-match awards: [title, name, colour, detail] for whoever did best at
   * each thing. Ties go to the higher-placed player.
   */
  computeAwards() {
    const rank = this.ranking().filter((c) => c.st);
    const best = (score, min) => {
      let top = null, v = -Infinity;
      for (const c of rank) { const s = score(c); if (s > v) { v = s; top = c; } }
      return top && v >= min ? [top, v] : null;
    };
    const out = [];
    const add = (title, r, text) => { if (r) out.push([title, r[0].name, r[0].color, text(r[1])]); };
    add('Sharpshooter', best((c) => (c.st.shots >= 15 ? c.st.hits / c.st.shots : -1), 0.2), (v) => `${Math.round(v * 100)}% accuracy`);
    add('Headhunter', best((c) => c.st.heads, 2), (v) => `${v} headshot kills`);
    add('Unstoppable', best((c) => c.st.bestStreak, 3), (v) => `${v}-kill streak`);
    add('Long Shot', best((c) => c.st.longest, 30), (v) => `${Math.round(v)} m kill`);
    add('Demolitions', best((c) => c.st.nades, 1), (v) => `${v} grenade kill${v === 1 ? '' : 's'}`);
    add('Butcher', best((c) => c.st.knives, 1), (v) => `${v} knife kill${v === 1 ? '' : 's'}`);
    if (this.rules.hill) add('Hill Keeper', best((c) => c.hillTime || 0, 10), (v) => `${Math.round(v)} s on the hill`);
    if (this.rules.objective === 'dom') add('Zone Captain', best((c) => c.caps || 0, 1), (v) => `${v} zone capture${v === 1 ? '' : 's'}`);
    if (this.rules.objective === 'sd') add('Demolitions Expert', best((c) => c.caps || 0, 1), (v) => `${v} plant${v === 1 ? '' : 's'} and defuse${v === 1 ? '' : 's'}`);
    if (this.rules.objective === 'infected') add('Patient Zero', best((c) => c.st.knives, 2), (v) => `${v} infection${v === 1 ? '' : 's'}`);
    if (this.rules.ctf) {
      add('Flag Runner', best((c) => c.caps || 0, 1), (v) => `${v} capture${v === 1 ? '' : 's'}`);
      add('Defender', best((c) => c.st.returns || 0, 1), (v) => `${v} flag return${v === 1 ? '' : 's'}`);
    }
    add('Punching Bag', best((c) => c.deaths, 6), (v) => `${v} deaths`);
    return out.slice(0, 6);
  }

  /** Three [mapId, modeId] choices for the next match: the current pick plus two others. */
  makeVoteOptions() {
    const s = this.settings;
    const ranked = !!this.rules.ranked;
    // ranked rooms only offer the ranked maps and modes
    const opts = [ranked ? [this.map.id, this.rules.id] : [getMap(s.map).id, getMode(s.mode).id]];
    const combos = [];
    for (const m of MAPS) for (const r of MODES) if (!ranked || (RANKED_MAPS.includes(m.id) && RANKED_MODES.includes(r.id))) combos.push([m.id, r.id]);
    for (let tries = 0; opts.length < 3 && tries < 300; tries++) {
      const c = combos[(Math.random() * combos.length) | 0];
      if (opts.some((o) => o[0] === c[0] && o[1] === c[1])) continue;
      // a real choice: different maps and different modes while there are enough to go round
      if (tries < 100 && opts.some((o) => o[0] === c[0] || o[1] === c[1])) continue;
      if (tries < 200 && opts.some((o) => o[1] === c[1])) continue;
      opts.push(c);
    }
    return opts;
  }

  /** Votes per option. */
  voteTally() {
    const n = this.voteOptions ? this.voteOptions.map(() => 0) : [];
    for (const i of this.votes.values()) if (i >= 0 && i < n.length) n[i]++;
    return n;
  }

  /** Most votes wins; a tie goes to the host's pick if it's one of them, else the first. */
  voteWinner() {
    const n = this.voteTally();
    if (!n.length) return -1;
    const top = Math.max(...n);
    const mine = this.votes.get(this.player.id);
    if (mine !== undefined && n[mine] === top) return mine;
    return n.indexOf(top);
  }

  /** The weapons a character gets on spawning, under the current rules. */
  loadoutFor(c) {
    const r = this.rules;
    if (r.gunGame) return makeSingle(GUN_LADDER[gunLevel(c.kills)]);
    return r.forcePrimary ? makeLoadout(r.forcePrimary, 'pistol', c.attach) : makeLoadout(c.primary, c.secondary, c.attach);
  }

  /** Out of lives (Last One Standing)? */
  isOut(c) { return !!this.rules.lives && c.lives <= 0; }

  /** Team colours in team modes, everyone's own colour otherwise. */
  paint(c) {
    const color = this.rules.teams && c.team >= 0 ? (this.obj && this.obj.teamColor ? this.obj.teamColor(c.team) : TEAM_COLORS[c.team]) : c.baseColor;
    c.color = color;
    if (c.model) c.model.setColor(color, c.name);
  }

  /**
   * Split everyone into teams: players who picked a team get it, other players
   * are spread across both, and bots fill in so the sides come out even.
   */
  assignTeams() {
    if (!this.rules.teams) { for (const c of this.chars) { c.team = -1; this.paint(c); } return; }
    if (this.rules.objective === 'infected') { for (const c of this.chars) { c.team = 0; this.paint(c); } return; }
    const n = [0, 0];
    const put = (c, t) => { c.team = t; n[t]++; };
    for (const c of this.chars) c.team = -1;
    // parties stay together: the whole group goes where one of them asked to, else to the smaller side
    const parties = new Map();
    for (const c of this.chars) if (c.isHuman && c.party) parties.set(c.party, [...(parties.get(c.party) || []), c]);
    const prefOf = (c) => (c.teamPref === 0 || c.teamPref === 1 ? c.teamPref : -1);
    for (const group of parties.values()) {
      const asked = group.map(prefOf).find((t) => t >= 0);
      if (asked !== undefined) for (const c of group) put(c, asked);
    }
    for (const c of this.chars) if (c.isHuman && c.team < 0 && !c.party && prefOf(c) >= 0) put(c, c.teamPref);
    for (const group of parties.values()) {
      if (group[0].team >= 0) continue;
      const t = n[0] <= n[1] ? 0 : 1;
      for (const c of group) put(c, t);
    }
    for (const c of this.chars) if (c.isHuman && c.team < 0) put(c, n[0] <= n[1] ? 0 : 1);
    for (const c of this.chars) if (!c.isHuman) put(c, n[0] <= n[1] ? 0 : 1);
    for (const c of this.chars) this.paint(c);
  }

  /** Move bots across until neither team has more than one extra player. */
  balanceBots() {
    if (!this.rules.teams) return;
    for (let guard = 0; guard < 12; guard++) {
      const n = [0, 0];
      for (const c of this.chars) if (c.team >= 0) n[c.team]++;
      if (Math.abs(n[0] - n[1]) <= 1) return;
      const big = n[0] > n[1] ? 0 : 1;
      // a dead bot moves first (no one sees it swap sides)
      const bot = this.bots.filter((b) => b.team === big).sort((a, b) => (a.alive ? 1 : 0) - (b.alive ? 1 : 0))[0];
      if (!bot) return;
      this.setTeam(bot, 1 - big, false);
    }
  }

  /** Put `c` on team `t`. `respawn`: send them to their new side now. */
  setTeam(c, t, respawn = true) {
    if (!this.rules.teams || (t !== 0 && t !== 1) || c.team === t) return false;
    if (this.ctf) { const f = this.ctf.carrying(c); if (f) { this.ctf.drop(f); this.ctf.event('drop', f.team, c); } }
    c.team = t;
    this.paint(c);
    if (c.target !== undefined) c.target = null;
    if (respawn && c.alive && !this.over) this.respawn(c);
    return true;
  }

  /** A player asked to switch sides mid-match (host / solo). */
  switchTeam(c, t) {
    if (this.over || this.attract || !this.rules.teams || this.rules.noSwitch) return false;
    c.teamPref = t;
    if (!this.setTeam(c, t)) return false;
    // the rest of their party comes along
    for (const m of this.partyMates(c)) { m.teamPref = t; this.setTeam(m, t); }
    this.balanceBots();
    if (this.mode === 'host') { this.net.onRosterChanged(); this.net.system(`${c.name} switched to ${TEAM_NAMES[t]}`); }
    else this.hud.feedNote(`${c.name} switched to ${TEAM_NAMES[t]}`, TEAM_COLORS[t]);
    return true;
  }

  /** A late arrival joins the team they picked, or else the smaller one. */
  joinTeam(c) {
    if (!this.rules.teams) { c.team = -1; this.paint(c); return; }
    if (this.obj && this.obj.joinTeam) { c.team = this.obj.joinTeam(c); c.speedMul = c.team === 1 && this.obj.noGuns && this.obj.noGuns(c) ? INFECTED_SPEED : 1; this.paint(c); return; }
    const mate = this.partyMates(c).find((m) => m.team >= 0);
    if (mate) { c.team = mate.team; this.paint(c); this.balanceBots(); return; }
    if (c.isHuman && (c.teamPref === 0 || c.teamPref === 1)) { c.team = c.teamPref; this.paint(c); this.balanceBots(); return; }
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

  /** Other players in `c`'s party who are in this game. */
  partyMates(c) {
    if (!c.party) return [];
    return this.chars.filter((o) => o !== c && o.isHuman && o.party === c.party);
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

  /** Your level + equipped cosmetics, as others should see them. */
  ownCosmetics() {
    const pr = this.progress;
    return { level: pr.level, prestige: pr.prestige, equipped: pr.equipped() };
  }

  /** Apply your own local-only cosmetics (crosshair shape, knife, charm...). */
  applyCosmetics() {
    if (this.onCosmetics) this.onCosmetics(this.progress.equipped());
  }

  /** A daily-challenge event, if this match counts. */
  ch(ev, amount = 1, meta = {}) {
    if (this.forCareer && !this.over) this.progress.challenge(ev, amount, { mode: this.rules.id, ...meta });
  }

  /** XP for something you did in a match that counts. */
  xp(amount, label) {
    if (this.forCareer && !this.over) this.progress.add(amount, label);
  }

  /** The skins you've picked that you've also unlocked. */
  ownSkins() {
    const out = {}, picked = this.settings.skins || {};
    for (const id of SKIN_GUNS) {
      const k = picked[id];
      if (k && SKIN_BY_ID[k] && skinUnlocked(this.career, id, k, this.progress)) out[id] = k;
    }
    return out;
  }

  /** Your attachments: { gunId: code }, only what you've unlocked (see attachments.js). */
  ownAttach() {
    const out = {}, picked = this.settings.attach || {};
    for (const id of SKIN_GUNS) {
      const code = picked[id] | 0;
      if (!code) continue;
      const kills = (this.career.stats.weapons || {})[id] || 0;
      let ok = 0;
      ATT_SLOTS.forEach((s, i) => { const k = (code >> (i * 2)) & 3; const a = ATTACHMENTS[s.id][k]; if (k && a && fits(a, id) && attUnlocked(a, kills)) ok |= k << (i * 2); });
      if (ok) out[id] = ok;
    }
    return out;
  }

  /** Put your skins (and attachments) on your guns (first person and your character). */
  applyOwnSkins() {
    this.player.attach = this.ownAttach();
    for (const id of SKIN_GUNS) this.viewmodel.setAttachments(id, this.player.attach[id] || 0);
    this.player.skins = this.ownSkins();
    for (const id of SKIN_GUNS) this.viewmodel.setSkin(id, this.player.skins[id] || 'none');
  }

  /** King of the Hill: XP for every second you spend holding the hill. */
  hillXp() {
    if (!this.rules.hill || this.attract) return;
    const t = Math.floor(this.player.hillTime || 0);
    if (t > this.hillXpT) { this.xp((t - this.hillXpT) * XP.hillSecond, 'Hill time'); this.ch('hill', t - this.hillXpT); }
    this.hillXpT = t;
  }

  /** Does what happens now count towards your career stats? */
  get forCareer() { return !this.attract && !this.range && !this.rules.training; }

  ranking() {
    return this.rules.rank(this.chars);
  }

  endMatch() {
    if (this.over) return;
    this.over = true;
    const rank = this.ranking();
    this.winner = rank[0];
    this.awards = this.computeAwards();
    this.voteOptions = this.makeVoteOptions();
    this.votes = new Map();
    this.voteDeadline = this.mode === 'host' ? performance.now() + VOTE_TIME * 1000 : 0;
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
      // Capture the Flag: spawn on your own side of the map
      if (this.ctf && who.team >= 0) { const h = this.map.flags[who.team]; score -= Math.hypot(s.x - h[0], s.z - h[2]) * 0.45; }
      // Search & Destroy (and other objective modes with a home side)
      const home = this.obj && this.obj.spawnHome && who.team >= 0 ? this.obj.spawnHome(who.team) : null;
      if (home) score -= Math.hypot(s.x - home[0], s.z - home[2]) * 0.6;
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
    if (this.obj && this.obj.onSpawn) this.obj.onSpawn(c);
    if (this.mode === 'host') this.net.onSpawn(c);
    if (c.isPlayer && !first) this.audio.play('respawn');
  }

  // ======================================================================
  // combat
  // ======================================================================

  fireWeapon(shooter, w, ads) {
    const def = w.def;
    if (def.projectile) { this.fireBolt(shooter, w, ads); return; }
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
    const ends = []; // what everyone else (and the kill cam) needs to draw this shot
    const claims = client ? [] : null; // "I hit X" reports for the host to check
    const victims = this._victims || (this._victims = []);
    victims.length = 0;
    let rangeHit = false, rangeHead = false;
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
      // training range targets
      const th = this.range && this.range.raycast(_o.x, _o.y, _o.z, _d.x, _d.y, _d.z, tBest, rayChar, _ch);
      const ex = _o.x + _d.x * tBest, ey = _o.y + _d.y * tBest, ez = _o.z + _d.z * tBest;
      if (th) {
        const tx = _o.x + _d.x * th.t, ty = _o.y + _d.y * th.t, tz = _o.z + _d.z * th.t;
        this.range.damage(th.target, damageAtDistance(def, th.t) * (th.head ? CFG.headshotMult : 1), th.head, tx, ty, tz);
        if (i < 4) fx.hitBurst(tx, ty, tz, _d.x, _d.y, _d.z, th.head ? 0xffd24d : 0xf4f1ea, th.head);
        fx.tracer(_muz.x, _muz.y, _muz.z, tx, ty, tz);
        rangeHit = true; rangeHead = rangeHead || th.head;
        continue;
      }
      if (victim) {
        const dmg = damageAtDistance(def, tBest) * (head ? CFG.headshotMult : 1);
        let v = victims.find((e) => e.c === victim);
        if (!v) { v = { c: victim, dmg: 0, head: false, x: ex, y: ey, z: ez }; victims.push(v); }
        v.dmg += dmg;
        v.head = v.head || head;
        if (i < 4) fx.hitBurst(ex, ey, ez, _d.x, _d.y, _d.z, victim.isProtected() ? 0x8fd3ff : victim.color, head);
        ends.push([r2(ex), r2(ey), r2(ez), 2, victim.id, head ? 1 : 0]);
        if (claims) claims.push([victim.id, head ? 1 : 0, r2(tBest)]);
      } else if (hitWorld) {
        fx.impact(ex, ey, ez, _hit.nx, _hit.ny, _hit.nz, i < 3);
        if (i === 0) { _d.set(ex, ey, ez); this.audio.play('impact', _d); }
        ends.push([r2(ex), r2(ey), r2(ez), 1, r2(_hit.nx), r2(_hit.ny), r2(_hit.nz)]);
      } else {
        ends.push([r2(ex), r2(ey), r2(ez), 0]);
      }
      if (def.pellets === 1 || i % 2 === 0) fx.tracer(_muz.x, _muz.y, _muz.z, ex, ey, ez, tracerColor(shooter));
    }

    shooter.protectedUntil = 0; // attacking ends spawn protection
    if (shooter.isPlayer) {
      this.audio.play(def.id);
      fx.muzzleLight(_muz.x, _muz.y, _muz.z);
    } else {
      this.audio.play(def.id, shooter.pos);
    }
    shooter.onFired(def);
    if (this.range && shooter.isPlayer) this.range.onShot(rangeHit, rangeHead);
    if (shooter.isPlayer && this.forCareer) this.career.shot(victims.some((v) => !v.c.isProtected() && !this.sameTeam(v.c, shooter)));
    this.killcam.shot(shooter.id, def.index, [_muz.x, _muz.y, _muz.z], ends);

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
    this.countShot(shooter, victims.some((v) => !v.c.isProtected() && !this.sameTeam(v.c, shooter)));
    this.emitNoise(shooter.pos.x, shooter.pos.y, shooter.pos.z, def.noise, shooter, 'shot');
    for (const v of victims) this.damage(v.c, v.dmg, shooter, v.head, def);
  }

  /** Crossbow: loose a bolt (a real projectile; see bolts.js). */
  fireBolt(shooter, w, ads) {
    const def = w.def;
    shooter.getEye(_o);
    shooter.aimDir(_dir);
    const spread = shooter.currentSpread(ads);
    shooter.getMuzzle(_muz);
    _right.crossVectors(_dir, UP);
    if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
    _right.normalize();
    _up.crossVectors(_right, _dir);
    const a = Math.random() * Math.PI * 2, r = spread * Math.sqrt(Math.random());
    _d.copy(_dir).addScaledVector(_right, Math.cos(a) * r).addScaledVector(_up, Math.sin(a) * r).normalize();
    const client = this.mode === 'client';
    this.bolts.fire(shooter, def, _o.x, _o.y, _o.z, _d.x, _d.y, _d.z, !client, _muz);
    shooter.protectedUntil = 0;
    this.audio.play(def.id, shooter.isPlayer ? null : shooter.pos);
    shooter.onFired(def);
    this.stats.shots++;
    if (client) { this.net.sendBolt(def, _o, _d); return; }
    if (this.mode === 'host') this.net.onBolt(shooter, def, _o, _d);
    this.emitNoise(shooter.pos.x, shooter.pos.y, shooter.pos.z, def.noise, shooter, 'shot');
  }

  /** Authority: a bolt hit someone. */
  boltHit(b, victim, head) {
    const s = b.shooter;
    if (!this.chars.includes(s)) return;
    const hurt = !victim.isProtected() && !this.sameTeam(victim, s);
    this.countShot(s, hurt);
    if (s.isPlayer && this.forCareer) this.career.shot(hurt);
    this.damage(victim, b.def.damage * (head ? CFG.headshotMult : 1), s, head, b.def);
  }

  /** Authority: a bolt hit a wall. */
  boltMissed(b) {
    this.countShot(b.shooter, false);
    if (b.shooter.isPlayer && this.forCareer) this.career.shot(false);
  }

  damage(victim, amount, attacker, head, def) {
    if (!victim.alive || this.over) return;
    if (victim.isProtected()) return;
    if (this.sameTeam(victim, attacker) && !this.rules.friendlyFire) return; // no friendly fire (unless the host turned it on)
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
    victim.diedAt = performance.now();
    victim.deaths++;
    victim.respawnAt = this.time + CFG.respawnDelay;
    if (this.rules.lives) {
      victim.lives = Math.max(0, victim.lives - 1);
      if (victim.lives === 0) victim.respawnAt = Infinity; // out for the rest of the match
    }
    const teamKill = this.sameTeam(victim, attacker);
    if (attacker !== victim && !teamKill) { // a team kill earns nothing
      attacker.kills++;
      if (this.rules.teams && !this.rules.hill && !this.rules.ctf && !this.rules.objective && attacker.team >= 0) this.teamScore[attacker.team]++; // objective modes score otherwise
      const st = attacker.st;
      if (st) {
        if (def === KNIFE) st.knives++;
        else if (def === GRENADE) st.nades++;
        else {
          if (head) st.heads++;
          st.longest = Math.max(st.longest, attacker.pos.distanceTo(victim.pos));
        }
      }
    }
    this.stats.kills++;
    const weapon = def ? def.name : '?';
    this.presentKill(victim, attacker, head, weapon);
    if (this.mode === 'host') this.net.onKill(victim, attacker, head, weapon);
    if (this.obj && this.obj.onKill) this.obj.onKill(victim, attacker);
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
    const kfx = attacker !== victim && attacker.cos ? attacker.cos.equipped.killfx : 'default';
    if (kfx !== 'default') this.effects.killFx(kfx, victim.pos.x, victim.pos.y, victim.pos.z);
    this.audio.play('death', victim.isPlayer ? null : victim.pos);

    // Streaks and multi-kills, tracked on every machine from the kills it sees.
    const ended = victim.streak;
    const avenged = victim.lastVictim && this.time - victim.lastKillT < 5 ? victim.lastVictim : null; // (for the Avenger medal)
    victim.streak = 0;
    victim.multi = 0;
    let first = false;
    if (attacker !== victim) {
      attacker.multi = this.time - attacker.lastKillT <= MULTI_WINDOW ? attacker.multi + 1 : 1;
      attacker.lastKillT = this.time;
      attacker.streak++;
      if (attacker.st) attacker.st.bestStreak = Math.max(attacker.st.bestStreak, attacker.streak);
      if (!this.firstBlood) { this.firstBlood = true; first = true; }
      attacker.lastVictim = victim;
    }
    if (this.attract) return;
    this.killMedals(victim, attacker, head, weapon, first, ended, avenged);

    if (this.forCareer) {
      const me = this.player;
      if (attacker === me && victim !== me) {
        const dist = me.pos.distanceTo(victim.pos);
        this.career.kill(weapon, head, dist);
        this.career.streak(me.streak);
        if (!this.sameTeam(victim, me)) {
          // XP for the kill and how it was done
          const wid = weaponIdOf(weapon);
          this.xp(XP.kill, 'Kills');
          this.ch('kill', 1, { weapon: wid });
          if (wid === 'knife') { this.xp(XP.knife, 'Knife kills'); this.ch('knife'); }
          else if (wid === 'grenade') { this.xp(XP.grenade, 'Grenade kills'); this.ch('nade'); }
          else {
            if (head) { this.xp(XP.headshot, 'Headshots'); this.ch('head'); }
            if (dist >= 40) { this.xp(XP.longshot, 'Long shots'); this.ch('long'); }
          }
          if (me.streak >= 3) this.xp(XP.streak, 'Streaks');
          this.ch('streak', me.streak);
        }
      }
      if (victim === me) this.career.death();
    }

    this.hud.addKill(attacker, victim, weapon, head);
    if (attacker.isPlayer && attacker !== victim) {
      this.audio.play('kill');
      const limit = this.rules.scoreLimit && !this.rules.teams && this.mode !== 'client';
      const sub = head ? (weapon === 'Knife' ? 'Backstab' : 'Headshot') : limit ? `${attacker.kills} / ${this.rules.scoreLimit}` : '';
      this.hud.centerMessage(`ELIMINATED ${victim.name.toUpperCase()}`, sub, 1.6, '#' + victim.color.toString(16).padStart(6, '0'));
    }
    this.announceKill(victim, attacker, first, ended);
  }

  /** Medals for a kill you made (and the bookkeeping some of them need when you die). */
  killMedals(victim, attacker, head, weapon, first, ended, avenged) {
    const me = this.player;
    if (!this.forCareer || this.over) return;
    if (victim === me && attacker !== me) { me.lastKiller = attacker; me.deathRun = (me.deathRun || 0) + 1; }
    if (attacker !== me || victim === me || this.sameTeam(victim, me)) return;
    const wid = weaponIdOf(weapon);
    const dist = me.pos.distanceTo(victim.pos);
    const m = (id) => this.medal(id);
    if (wid === 'knife') m(this.obj && this.obj.noGuns && this.obj.noGuns(me) ? 'infect' : head ? 'back' : 'blade');
    else if (wid === 'grenade') m('boom');
    else {
      if (head) m('head');
      if (dist >= 40) m('long');
      else if (dist < 3) m('blank');
    }
    if (victim.isBlind()) m('blind');
    if (!me.alive) m('after');
    if (first) m('first');
    if (victim === me.lastKiller) { m('revenge'); me.lastKiller = null; }
    if (avenged && avenged !== me && this.sameTeam(avenged, me)) m('avenge');
    if (ended >= 3) m('shut');
    if ((me.deathRun || 0) >= 3) m('comeback');
    me.deathRun = 0;
    if (me.multi >= 2) m(me.multi >= 5 ? 'mega' : MULTI_MEDALS[me.multi]);
    if (STREAK_MEDALS[me.streak]) m(STREAK_MEDALS[me.streak]);
    this.checkAchievements();
  }

  /** You earned a medal: count it, pay its XP, show it. */
  medal(id) {
    if (!this.forCareer || this.over) return;
    const m = MEDAL_BY_ID[id];
    if (!m || !this.progress.medal(id)) return;
    if (m.xp) this.xp(m.xp, 'Medals');
    this.hud.medal(m);
  }

  /** Any achievements just finished? (main.js shows them) */
  checkAchievements() {
    if (this.attract || this.range) return [];
    const done = this.progress.checkAchievements(this.career.stats, MODES.map((m) => m.id));
    if (done.length && this.onAchievement) for (const a of done) this.onAchievement(a);
    return done;
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
    if (this.range) {
      const t = this.range.meleeTarget(a, KNIFE.range);
      if (t) { this.audio.play('stab'); this.range.damage(t, KNIFE.damage, false, t.pos.x, t.pos.y + 1.2, t.pos.z); }
      this.range.onShot(!!t, false);
      return;
    }
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
    // the infected hit harder: two swings from the front, one from behind (a lone infected: always one)
    const claws = this.obj && this.obj.noGuns && this.obj.noGuns(a);
    const alpha = claws && this.obj.alone && this.obj.alone();
    this.damage(v, back || alpha ? KNIFE.backstab : claws ? 70 : KNIFE.damage, a, back, KNIFE);
  }

  // ======================================================================
  // grenades
  // ======================================================================

  /** `fuse` = seconds left on it (cooking burns some); `drop` = let go of it, no throw. */
  throwGrenade(char, dir, def = GRENADE, fuse = def.fuse, drop = false) {
    if (char === this.player && this.playerThrows) this.playerThrows.push(def); // (the tutorial watches these)
    char.getEye(_o);
    if (dir) _dir.copy(dir);
    else { char.aimDir(_dir); _dir.y += 0.1; _dir.normalize(); } // a little loft
    const sp = drop ? 0.6 : def.speed;
    const o = drop ? [r2(char.pos.x), r2(char.pos.y + 1.0), r2(char.pos.z)]
      : [r2(_o.x + _dir.x * 0.25), r2(_o.y + _dir.y * 0.25 - 0.1), r2(_o.z + _dir.z * 0.25)];
    const k = drop ? 0.3 : 0.4;
    const v = [r2(_dir.x * sp + char.vel.x * k), r2(_dir.y * sp + Math.max(0, char.vel.y) * 0.3), r2(_dir.z * sp + char.vel.z * k)];
    fuse = r2(Math.max(0, fuse));
    if (this.mode === 'client') { this.net.sendGrenade(o, v, def.index, fuse); return; } // the host spawns it for everyone
    this.spawnGrenade(this.nextGrenadeId++, char, o, v, def, fuse);
  }

  spawnGrenade(id, owner, o, v, def = GRENADE, fuse = def.fuse) {
    const mesh = this.grenadePool[def.kind].pop() || makeGrenadeMesh(def.kind);
    mesh.visible = true;
    mesh.material.color.set(def.color);
    mesh.material.emissive.set(def.kind === 'frag' ? 0xff2200 : def.kind === 'flash' ? 0xffffff : 0x66ff99);
    if (def.kind === 'frag' && owner && owner.cos) mesh.material.color.set(itemOf('nade', owner.cos.equipped.nade).color);
    this.scene.add(mesh);
    const g = { id, owner, def, x: o[0], y: o[1], z: o[2], vx: v[0], vy: v[1], vz: v[2], fuse, mesh, resting: false, bounceT: 0 };
    this.grenades.push(g);
    _d.set(g.x, g.y, g.z);
    this.audio.play('throw', owner && owner.isPlayer ? null : _d);
    if (this.mode === 'host') this.net.onGrenade(g);
    return g;
  }

  removeGrenade(i) {
    const g = this.grenades[i];
    this.scene.remove(g.mesh);
    this.grenadePool[g.def.kind].push(g.mesh);
    this.grenades.splice(i, 1);
  }

  clearGrenades() {
    if (this.bolts) this.bolts.clear();
    for (let i = this.grenades.length - 1; i >= 0; i--) this.removeGrenade(i);
    if (this.smokes) this.smokes.clear();
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
          this.detonate(g);
        }
      }
    }
  }

  /** A grenade's fuse ran out (host / solo). */
  detonate(g) {
    const k = g.def.kind;
    if (k === 'frag') { this.explode(g.x, g.y, g.z, g.owner, g.id); return; }
    if (this.mode === 'host') this.net.onExplode(g.id, g.x, g.y, g.z, g.def.index);
    if (k === 'flash') {
      this.emitNoise(g.x, g.y, g.z, FLASH.noise, g.owner, 'shot');
      this.showFlash(g.x, g.y, g.z, true, g.owner);
    } else {
      this.showSmoke(g.x, g.y, g.z);
    }
  }

  /**
   * How hard a flashbang at (x, y, z) hits someone: 0..1. Full strength up close
   * and looking at it, much less looking away, nothing behind a wall.
   */
  flashAmount(c, x, y, z) {
    c.getEye(_o);
    const dx = x - _o.x, dy = y - _o.y, dz = z - _o.z;
    const d = Math.hypot(dx, dy, dz);
    if (d >= FLASH.radius) return 0;
    if (this.world.segmentBlocked(x, y + 0.15, z, _o.x, _o.y, _o.z)) return 0;
    if (this.smokes.blocks(x, y + 0.15, z, _o.x, _o.y, _o.z)) return 0;
    c.aimDir(_dir);
    const dot = d > 0.5 ? (dx * _dir.x + dy * _dir.y + dz * _dir.z) / d : 1;
    const face = dot > 0.55 ? 1 : dot > -0.2 ? 0.3 + 0.7 * ((dot + 0.2) / 0.75) : 0.22;
    const near = 1 - Math.pow(d / FLASH.radius, 1.6);
    return Math.min(1, face * near * 1.15);
  }

  /** A flashbang went off: the bang for everyone, blindness for whoever saw it. */
  showFlash(x, y, z, authority, owner = null) {
    this.effects.flashBang(x, y, z);
    _d.set(x, y, z);
    this.audio.play('flashbang', _d);
    if (this.attract) return;
    // the player at this keyboard works out their own blindness, wherever the match runs
    const p = this.player;
    if (p.alive) {
      const a = this.flashAmount(p, x, y, z);
      if (a > 0.05) {
        const dur = FLASH.maxBlind * a;
        p.blindUntil = Math.max(p.blindUntil, this.time + dur);
        this.hud.flashed(a, dur);
        this.audio.deafen(a, dur, this.settings.softFlash);
      }
    }
    if (!authority) return;
    for (const b of this.bots) {
      if (!b.alive) continue;
      // a bot that threw it knows to look away
      const a = this.flashAmount(b, x, y, z) * (b === owner ? 0.25 : 1);
      if (a > 0.12) b.flashed(FLASH.maxBlind * a);
    }
  }

  /** A smoke grenade popped: the cloud settles on the floor below it. */
  showSmoke(x, y, z) {
    let gy = y;
    if (this.world.raycast(x, y + 0.3, z, 0, -1, 0, 6, _hit)) gy = y + 0.3 - _hit.t;
    this.smokes.add(x, gy, z);
    _d.set(x, y, z);
    this.audio.play('smoke', _d);
  }

  /** Authoritative detonation: effects + damage to everyone in range and in sight. */
  explode(x, y, z, owner, id) {
    this.showExplosion(x, y, z);
    if (this.range) this.range.explode(x, y, z, GRENADE.radius, GRENADE.damage);
    if (this.mode === 'host') this.net.onExplode(id, x, y, z, 0);
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
    this.killcam.boom(x, y, z);
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

  // ======================================================================
  // King of the Hill
  // ======================================================================

  /** The active hill as [x, y, z, r], or null outside King of the Hill. */
  hillZone() {
    const hs = this.map.hills;
    return this.rules.hill && hs && hs.length ? hs[this.hill.idx % hs.length] : null;
  }

  inHill(c, h = this.hillZone()) {
    if (!h || !c.alive) return false;
    return Math.hypot(c.pos.x - h[0], c.pos.z - h[2]) <= h[3] && Math.abs(c.pos.y - h[1]) <= 2.2;
  }

  resetHill() {
    const n = this.map.hills.length;
    this.hill = { idx: (Math.random() * n) | 0, t: HILL_TIME, holder: -1, acc: 0 };
  }

  moveHill() {
    const n = this.map.hills.length;
    let idx = this.hill.idx;
    while (n > 1 && idx === this.hill.idx) idx = (Math.random() * n) | 0;
    this.hill.idx = idx;
    this.hill.t = HILL_TIME;
    this.hill.holder = -1;
    this.hill.acc = 0;
    this.announcer.announce('Hill moved', 'Get to the new zone');
  }

  /** Authoritative hill logic: who holds it, points, moving it on. */
  updateHill(dt) {
    const h = this.hillZone();
    if (!h || this.over) return;
    const n = [0, 0];
    for (const c of this.chars) if (c.team >= 0 && this.inHill(c, h)) n[c.team]++;
    const holder = n[0] && n[1] ? 2 : n[0] ? 0 : n[1] ? 1 : -1;
    if (holder !== this.hill.holder) {
      this.hill.acc = 0;
      if (holder === 0 || holder === 1) this.hillTaken(holder);
      this.hill.holder = holder;
    }
    if (holder === 0 || holder === 1) {
      for (const c of this.chars) if (c.team === holder && this.inHill(c, h)) c.hillTime += dt;
      this.hill.acc += dt;
      while (this.hill.acc >= 1) { this.hill.acc -= 1; this.teamScore[holder]++; }
      if (this.rules.won(this)) { this.endMatch(); return; }
    }
    this.hill.t -= dt;
    if (this.hill.t <= 0) this.moveHill();
  }

  /** A team just took the hill (also called on clients from snapshots). */
  hillTaken(team) {
    this.hud.feedNote(`${TEAM_NAMES[team]} team took the hill`, TEAM_COLORS[team]);
    if (team === this.player.team) this.audio.play('pickup', null, 0.7, 700);
    const h = this.hillZone();
    if (team === this.player.team && h && this.inHill(this.player, h)) this.medal('hill');
  }

  /** The glowing ring + light pillar marking the hill. */
  updateHillFx(time) {
    const h = !this.attract && this.hillZone();
    if (!h) { if (this.hillFx) this.hillFx.group.visible = false; return; }
    if (!this.hillFx) {
      const group = new THREE.Group();
      const add = (geo, opacity) => {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
        }));
        group.add(m);
        return m;
      };
      const ring = add(new THREE.RingGeometry(0.93, 1, 48), 0.85);
      ring.rotation.x = -Math.PI / 2;
      const disc = add(new THREE.CircleGeometry(1, 48), 0.1);
      disc.rotation.x = -Math.PI / 2;
      const pillar = add(new THREE.CylinderGeometry(0.35, 0.35, 1, 16, 1, true), 0.22);
      this.scene.add(group);
      this.hillFx = { group, ring, disc, pillar };
    }
    const fx = this.hillFx;
    fx.group.visible = true;
    fx.group.position.set(h[0], h[1] + 0.04, h[2]);
    fx.ring.scale.setScalar(h[3]);
    fx.disc.scale.setScalar(h[3]);
    fx.pillar.scale.set(1, 40, 1);
    fx.pillar.position.y = 20;
    const holder = this.hill.holder;
    const col = HILL_COLORS[holder] ?? 0xffffff;
    for (const m of [fx.ring, fx.disc, fx.pillar]) m.material.color.set(col);
    const pulse = holder === 2 ? 0.5 + 0.5 * Math.sin(time * 10) : 0.8 + 0.2 * Math.sin(time * 3);
    fx.ring.material.opacity = 0.85 * pulse;
    fx.pillar.material.opacity = 0.22 * pulse;
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

  /** Pickups back to the start of a match (or gone, if the rules say no pickups). */
  resetPickups() {
    const on = this.rules.pickups !== false;
    for (const p of this.pickups) {
      p.reset();
      p.group.visible = on;
      if (!on) p.take();
    }
  }

  /** Most health a character can have under these rules. */
  get maxHealth() { return this.rules.maxHealth || CFG.maxHealth; }

  updatePickups(dt) {
    if (this.rules.pickups === false) return;
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
      this.smokes.update(dt);
      for (const r of this.remotes) r.update(dt);
      this.orbitCamera(dt, 0.05);
      return;
    }
    if (this.mode === 'client') { this.updateClient(dt); return; }
    this.time += dt;
    if (!this.attract) {
      this.matchTime -= dt;
      if (this.matchTime <= 0) { this.matchTime = 0; this.endMatch(); return; }
      this.clockTick();
    }
    for (const c of this.chars) if (!c.alive && this.time >= c.respawnAt) this.respawn(c);

    this.separate();
    if (this.attract) this.orbitCamera(dt, 0.045);
    else this.player.update(dt, this.input);
    if (this.range) this.range.update(dt);
    if (this.tutorial) this.tutorial.update(dt);
    for (const r of this.remotes) r.update(dt);
    for (const b of this.bots) b.update(dt);
    this.updateGrenades(dt);
    this.bolts.update(dt);
    this.updatePickups(dt);
    if (this.rules.hill && !this.attract) this.updateHill(dt);
    if (this.ctf && !this.attract) this.ctf.update(dt);
    if (this.ctf) this.ctf.updateVisuals(dt, this.time);
    if (this.obj) { this.obj.update(dt); if (this.obj) this.obj.updateVisuals(dt, this.time); }
    this.hillXp();
    this.updateHillFx(this.time);
    this.effects.update(dt);
    this.smokes.update(dt);
    if (!this.attract) { this.killcam.record(dt); this.killcam.update(dt); }
    this.lastDt = dt;

    const cam = this.camera;
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.attract ? 0 : this.player.yaw);
    if (!this.attract) this.hud.update(this, dt);
  }

  /** Multiplayer client frame: simulate only ourselves; the host sends the rest. */
  updateClient(dt) {
    this.time += dt;
    this.matchTime = Math.max(0, this.matchTime - dt); // re-synced by every snapshot
    this.clockTick();
    this.separate();
    this.player.update(dt, this.input);
    for (const r of this.remotes) r.update(dt);
    for (const p of this.pickups) p.update(dt, this.time, false);
    this.updateGrenades(dt);
    this.bolts.update(dt);
    if (this.rules.hill) this.hill.t = Math.max(0, this.hill.t - dt); // re-synced by snapshots
    if (this.ctf) this.ctf.updateVisuals(dt, this.time);
    if (this.obj) this.obj.updateVisuals(dt, this.time);
    this.hillXp();
    this.updateHillFx(this.time);
    this.effects.update(dt);
    this.smokes.update(dt);
    this.killcam.record(dt);
    this.killcam.update(dt);
    this.lastDt = dt;
    const cam = this.camera;
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, this.player.yaw);
    this.hud.update(this, dt);
  }

  orbitCamera(dt, speed) {
    this.orbit = (this.orbit || 0.6) + dt * speed;
    const cam = this.camera;
    // a map can set its own path (e.g. under a roof): { r, h, lookY }
    const o = this.map.orbit;
    const R = o ? o.r : this.orbitR;
    cam.position.set(Math.cos(this.orbit) * R, o ? o.h : R * 0.56, Math.sin(this.orbit) * R);
    cam.rotation.set(0, 0, 0);
    cam.lookAt(0, o ? o.lookY : -4, 0);
    if (Math.abs(cam.fov - 55) > 0.01) { cam.fov = 55; cam.updateProjectionMatrix(); }
  }

  render() {
    const r = this.renderer;
    if (this.killcam.active) this.killcam.apply(this.lastDt);
    r.clear();
    r.render(this.scene, this.camera);
    if (!this.attract && !this.over && this.player.alive) {
      r.clearDepth();
      r.render(this.viewmodel.scene, this.viewmodel.camera);
    }
  }
}
