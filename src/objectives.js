// Objective modes that plug into the game the same way: Domination, Search &
// Destroy and Infected. Each is a class with the same small surface:
//
//   update(dt)               match authority (solo game / host): the rules
//   updateVisuals(dt, time)  every machine: zone rings, the bomb, etc.
//   snapshot() / applySnapshot(a)   host -> clients, inside the 's' message
//   present(kind, data)      feed lines, banners, sounds for an event (every machine)
//   status(p)                the HUD status line for the local player
//   markers(p)               up to 4 on-screen markers [{ x, y, z, label, color }]
//   botJob(bot)              where a bot should go for the objective, or null
//   optional hooks: onKill(victim, attacker), onSpawn(c), joinTeam(c),
//                   teamColor(t), noGuns(c), spawnHome(team)
//
// The rules decide; clients copy state from snapshots and present events the
// host sends ('ob' messages), like Capture the Flag does.

import * as THREE from 'three';
import { TEAM_COLORS, TEAM_NAMES } from './modes.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);
const rand = (a, b) => a + Math.random() * (b - a);
const NEUTRAL = 0xe8e4da;
export const INFECTED_COLOR = 0x7ac74f;

// ---------------------------------------------------------------- shared pieces

function labelSprite(text, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.font = '800 92px "Barlow Condensed", "Arial Narrow", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 10; x.strokeStyle = 'rgba(0,0,0,0.65)';
  x.strokeText(text, 64, 70);
  x.fillStyle = color; x.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(1.6, 1.6, 1);
  return sp;
}

/** A capture ring on the ground with a light pillar and a letter above it. */
function makeZone(x, y, z, r, letter) {
  const g = new THREE.Group();
  const mat = (o) => new THREE.MeshBasicMaterial({ color: NEUTRAL, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.22, r, 56), mat(0.85));
  ring.rotation.x = -Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(r - 0.22, 56), mat(0.08));
  disc.rotation.x = -Math.PI / 2;
  // a second ring that fills as the zone is captured
  const prog = new THREE.Mesh(new THREE.RingGeometry(r - 0.6, r - 0.3, 56, 1, 0, 0.0001), mat(0.9));
  prog.rotation.x = -Math.PI / 2;
  prog.position.y = 0.01;
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 7, 8, 1, true), mat(0.18));
  pillar.position.y = 3.5;
  const label = letter ? labelSprite(letter) : null;
  if (label) label.position.y = 4.4;
  g.add(ring, disc, prog, pillar);
  if (label) g.add(label);
  g.position.set(x, y + 0.04, z);
  return { group: g, ring, disc, prog, pillar, label, r };
}

function setZoneColor(fx, color, fill = 0, fillColor = color) {
  fx.ring.material.color.setHex(color);
  fx.disc.material.color.setHex(color);
  fx.pillar.material.color.setHex(color);
  fx.prog.material.color.setHex(fillColor);
  // rebuild the progress arc only when it changes noticeably
  const a = Math.max(0.0001, Math.min(1, fill)) * Math.PI * 2;
  if (Math.abs((fx.progA || 0) - a) > 0.05) {
    fx.progA = a;
    fx.prog.geometry.dispose();
    fx.prog.geometry = new THREE.RingGeometry(fx.r - 0.6, fx.r - 0.3, 56, 1, Math.PI / 2, a);
  }
  fx.prog.visible = fill > 0.01;
}

class Objective {
  constructor(game) {
    this.game = game;
    this.fx = new THREE.Group();
    game.scene.add(this.fx);
  }

  dispose() {
    this.game.scene.remove(this.fx);
    this.fx.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }

  /** Something happened: present it here and tell clients. */
  event(kind, data = {}) {
    const g = this.game;
    if (g.mode === 'host') g.net.onObjective(kind, data);
    this.present(kind, data);
  }

  present() {}
  status() { return null; }
  markers() { return []; }
  botJob() { return null; }
  snapshot() { return []; }
  applySnapshot() {}
  update() {}
  updateVisuals() {}

  inZone(c, z) {
    return c.alive && Math.hypot(c.pos.x - z.x, c.pos.z - z.z) <= z.r && Math.abs(c.pos.y - z.y) < 2.4;
  }

  /** Map hill zones, spread out: `n` of them as far apart from each other as possible. */
  spreadHills(n, from = null) {
    const hs = (this.game.map.hills || []).map((h) => ({ x: h[0], y: h[1], z: h[2], r: Math.max(3, Math.min(5, h[3])) }));
    if (hs.length <= n) return hs;
    const pick = [];
    // start from the one nearest `from` (or the first)
    let first = hs[0];
    if (from) first = hs.reduce((a, h) => (Math.hypot(h.x - from[0], h.z - from[2]) < Math.hypot(a.x - from[0], a.z - from[2]) ? h : a), hs[0]);
    pick.push(first);
    while (pick.length < n) {
      let best = null, bestD = -1;
      for (const h of hs) {
        if (pick.includes(h)) continue;
        const d = Math.min(...pick.map((p) => Math.hypot(p.x - h.x, p.z - h.z)));
        if (d > bestD) { bestD = d; best = h; }
      }
      pick.push(best);
    }
    return pick;
  }
}

// ======================================================================
// Domination: three zones, A B C. Capture by standing in one with no enemy
// in it; every zone your team holds scores a point a second.
// ======================================================================

const DOM_CAP_RATE = 0.25; // a full capture from neutral alone takes 4 s

export class Domination extends Objective {
  constructor(game) {
    super(game);
    const base = game.map.flags ? game.map.flags[0] : null;
    let zs = this.spreadHills(3, base);
    // A is nearest Cobalt's side, C nearest Crimson's
    if (base) zs = zs.sort((a, b) => Math.hypot(a.x - base[0], a.z - base[2]) - Math.hypot(b.x - base[0], b.z - base[2]));
    this.zones = zs.map((z, i) => {
      const letter = 'ABC'[i];
      const fx = makeZone(z.x, z.y, z.z, z.r, letter);
      this.fx.add(fx.group);
      return { ...z, letter, v: 0, owner: -1, fx, contested: false };
    });
    this.acc = 0;
  }

  update(dt) {
    const g = this.game;
    if (g.over) return;
    for (const z of this.zones) {
      const n = [0, 0];
      const inside = [[], []];
      for (const c of g.chars) if (c.team >= 0 && this.inZone(c, z)) { n[c.team]++; inside[c.team].push(c); }
      z.contested = n[0] > 0 && n[1] > 0;
      if (z.contested || (n[0] === 0 && n[1] === 0)) continue;
      const t = n[0] > 0 ? 0 : 1, dir = t === 0 ? -1 : 1;
      if (z.owner === t && Math.abs(z.v) >= 1) continue;
      const before = z.v;
      z.v = Math.max(-1, Math.min(1, z.v + dir * DOM_CAP_RATE * Math.min(2, 0.75 + n[t] * 0.25) * dt));
      for (const c of inside[t]) c.hillTime = (c.hillTime || 0) + dt;
      // lost it: back to neutral when the bar passes the middle
      if (z.owner >= 0 && z.owner !== t && Math.sign(before) !== Math.sign(z.v || dir)) { z.owner = -1; this.event('neutral', { i: this.zones.indexOf(z) }); }
      if (Math.abs(z.v) >= 1 && z.owner !== t) {
        z.owner = t;
        for (const c of inside[t]) c.caps = (c.caps || 0) + 1;
        this.event('cap', { i: this.zones.indexOf(z), team: t, by: inside[t].map((c) => c.id) });
      }
    }
    // a point a second for every zone held
    this.acc += dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      for (const z of this.zones) if (z.owner >= 0) g.teamScore[z.owner]++;
      if (g.rules.won(g)) { g.endMatch(); return; }
    }
  }

  present(kind, d) {
    const g = this.game, me = g.player, z = this.zones[d.i];
    if (!z || g.attract) return;
    if (kind === 'cap') {
      const ours = d.team === me.team;
      g.hud.feedNote(`${TEAM_NAMES[d.team]} captured ${z.letter}`, TEAM_COLORS[d.team]);
      g.audio.play('pickup', null, 0.7, ours ? 820 : 360);
      if ((d.by || []).includes(me.id)) { g.announcer.announce(`${z.letter} captured`, '+150 XP'); g.xp(150, 'Captures'); g.medal('zone'); g.checkAchievements(); }
    } else if (kind === 'neutral') {
      g.hud.feedNote(`${z.letter} is neutral`, NEUTRAL);
    }
  }

  snapshot() { return this.zones.map((z) => [Math.round(z.v * 100), z.owner, z.contested ? 1 : 0]); }
  applySnapshot(a) {
    if (!Array.isArray(a)) return;
    a.forEach((e, i) => { const z = this.zones[i]; if (z && Array.isArray(e)) { z.v = (e[0] | 0) / 100; z.owner = e[1] === 0 || e[1] === 1 ? e[1] : -1; z.contested = !!e[2]; } });
  }

  updateVisuals(dt, time) {
    for (const z of this.zones) {
      const col = z.owner >= 0 ? TEAM_COLORS[z.owner] : NEUTRAL;
      const toward = z.v < 0 ? 0 : 1;
      const fill = z.owner >= 0 && Math.abs(z.v) >= 1 ? 0 : Math.abs(z.v);
      setZoneColor(z.fx, col, fill, TEAM_COLORS[toward]);
      z.fx.ring.material.opacity = z.contested ? 0.45 + 0.4 * Math.sin(time * 10) : 0.85;
    }
  }

  status(p) {
    const own = (t) => this.zones.filter((z) => z.owner === t).length;
    const mine = Math.max(0, p.team);
    const parts = this.zones.map((z) => `${z.letter} ${z.owner < 0 ? '—' : z.owner === mine ? 'OURS' : 'THEIRS'}`);
    const at = this.zones.find((z) => this.inZone(p, z));
    let text = parts.join('     ');
    if (at) {
      const pct = Math.round(Math.abs(at.v) * 100);
      text = at.contested ? `CONTESTED ${at.letter}` : at.owner === mine ? `HOLDING ${at.letter}` : `CAPTURING ${at.letter} ${pct}%`;
    }
    const lead = own(mine) - own(1 - mine);
    return { text, color: at && at.contested ? '#ffd24d' : lead > 0 ? hex(TEAM_COLORS[mine]) : lead < 0 ? '#ff6b6b' : '#e8e8e8', on: !!at };
  }

  markers(p) {
    return this.zones.filter((z) => !this.inZone(p, z)).map((z) => ({
      x: z.x, y: z.y + 1.4, z: z.z, label: `${z.letter} ${Math.round(Math.hypot(p.pos.x - z.x, p.pos.z - z.z))}m`,
      color: z.owner >= 0 ? hex(TEAM_COLORS[z.owner]) : '#e8e4da',
    }));
  }

  botJob(bot) {
    if (bot.team < 0) return null;
    const d = (z) => Math.hypot(z.x - bot.pos.x, z.z - bot.pos.z);
    const notOurs = this.zones.filter((z) => z.owner !== bot.team);
    const ours = this.zones.filter((z) => z.owner === bot.team);
    // a third of each team holds what it has; the rest take what it hasn't
    let z;
    if (ours.length && (bot.id % 3 === 0 || !notOurs.length)) z = ours.reduce((a, b) => (d(a) < d(b) ? a : b));
    else if (notOurs.length) z = notOurs.reduce((a, b) => (d(a) + (a.contested ? -8 : 0) < d(b) + (b.contested ? -8 : 0) ? a : b));
    else return null;
    const a = Math.random() * Math.PI * 2, r = Math.random() * z.r * 0.6;
    return { x: z.x + Math.cos(a) * r, y: z.y, z: z.z + Math.sin(a) * r, stay: rand(3, 6) };
  }
}

// ======================================================================
// Search & Destroy: rounds, one life each. The attackers carry a bomb to one
// of two sites and plant it (stand still on the site); the defenders stop
// them, or defuse it (stand still on the bomb). Sides swap every round.
// ======================================================================

const ROUND_T = 100;
const FUSE_T = 40;
const PLANT_T = 3.5;
const DEFUSE_T = 6;
const BOMB_R = 11; // the blast: deadly inside this

export class SearchDestroy extends Objective {
  constructor(game) {
    super(game);
    this.round = 0;
    this.att = 0;
    this.phase = 'wait'; // wait (before the first round) | play | planted | over
    this.roundT = ROUND_T;
    this.nextT = game.time + 0.5;
    this.bomb = { state: 'carried', carrier: null, x: 0, y: 0, z: 0, fuse: 0, plant: 0, defuse: 0, site: -1, by: null };
    this.siteFx = [];
    this.sites = [];
    // the bomb: a small case with a blinking light
    const bomb = new THREE.Group();
    const caseM = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6, metalness: 0.4 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.3), caseM);
    box.position.y = 0.12;
    this.light = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false }));
    this.light.position.set(0.12, 0.26, 0);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.32), new THREE.MeshStandardMaterial({ color: 0xf2b417, roughness: 0.6 }));
    strip.position.y = 0.2;
    bomb.add(box, strip, this.light);
    this.bombFx = bomb;
    this.fx.add(bomb);
    this.setSites(1);
  }

  /** The defending team's two sites: the two hill zones nearest their base, well apart. */
  sitesFor(def) {
    const g = this.game, base = g.map.flags ? g.map.flags[def] : [0, 0, 0];
    const hs = (g.map.hills || []).map((h) => ({ x: h[0], y: h[1], z: h[2], r: 3.5 }))
      .sort((a, b) => Math.hypot(a.x - base[0], a.z - base[2]) - Math.hypot(b.x - base[0], b.z - base[2]));
    const out = [];
    for (const h of hs) {
      if (out.length >= 2) break;
      if (out.every((o) => Math.hypot(o.x - h.x, o.z - h.z) > 14)) out.push(h);
    }
    while (out.length < 2 && hs[out.length]) out.push(hs[out.length]);
    return out.map((s, i) => ({ ...s, letter: 'AB'[i] }));
  }

  setSites(def) {
    for (const f of this.siteFx) { this.fx.remove(f.group); f.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
    this.sites = this.sitesFor(def);
    this.siteFx = this.sites.map((s) => { const fx = makeZone(s.x, s.y, s.z, s.r, s.letter); this.fx.add(fx.group); return fx; });
  }

  spawnHome(team) { return this.game.map.flags ? this.game.map.flags[team] : null; }

  attackers() { return this.game.chars.filter((c) => c.team === this.att); }
  defenders() { return this.game.chars.filter((c) => c.team === 1 - this.att); }

  startRound() {
    const g = this.game;
    this.round++;
    this.att = (this.round - 1) % 2; // sides swap every round
    this.setSites(1 - this.att);
    this.phase = 'play';
    this.roundT = ROUND_T;
    const b = this.bomb;
    b.state = 'carried'; b.fuse = 0; b.plant = 0; b.defuse = 0; b.site = -1; b.by = null;
    g.clearGrenades();
    for (const c of g.chars) { c.lives = 1; g.respawn(c, true); }
    const att = this.attackers();
    b.carrier = att.length ? att[(Math.random() * att.length) | 0] : null;
    this.targetSite = Math.random() < 0.5 ? 0 : 1; // where the attacking bots go this round
    this.event('round', { n: this.round, att: this.att, carrier: b.carrier ? b.carrier.id : -1 });
  }

  endRound(win, why) {
    const g = this.game;
    if (this.phase === 'over') return;
    this.phase = 'over';
    g.teamScore[win]++;
    this.nextT = g.time + 5;
    this.event('end', { win, why });
    if (g.rules.won(g)) g.endMatch();
  }

  update(dt) {
    const g = this.game, b = this.bomb;
    if (g.over) return;
    if (this.phase === 'wait' || this.phase === 'over') {
      if (g.time >= this.nextT) this.startRound();
      return;
    }
    const attAlive = this.attackers().filter((c) => c.alive).length;
    const defAlive = this.defenders().filter((c) => c.alive).length;
    // the bomb: dropped when its carrier goes down, picked up by any attacker
    if (b.state === 'carried' && (!b.carrier || !b.carrier.alive || !g.chars.includes(b.carrier) || b.carrier.team !== this.att)) {
      const c = b.carrier;
      b.state = 'dropped'; b.carrier = null; b.plant = 0;
      if (c) { b.x = c.pos.x; b.y = c.pos.y; b.z = c.pos.z; } else { const h = this.spawnHome(this.att) || [0, 0, 0]; b.x = h[0]; b.y = h[1]; b.z = h[2]; }
      this.event('drop', {});
    }
    if (b.state === 'dropped') {
      for (const c of this.attackers()) {
        if (c.alive && Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < 1.4 && Math.abs(c.pos.y - b.y) < 2) { b.state = 'carried'; b.carrier = c; this.event('take', { id: c.id }); break; }
      }
    }
    if (this.phase === 'play') {
      // planting: the carrier stands still on a site
      const c = b.state === 'carried' ? b.carrier : null;
      const site = c ? this.sites.findIndex((s) => this.inZone(c, s)) : -1;
      if (c && site >= 0 && Math.hypot(c.vel.x, c.vel.z) < 1.2) {
        b.plant += dt / PLANT_T;
        if (b.plant >= 1) {
          this.phase = 'planted';
          b.state = 'planted'; b.carrier = null; b.by = c;
          b.x = c.pos.x; b.y = c.pos.y; b.z = c.pos.z; b.fuse = FUSE_T; b.site = site; b.defuse = 0;
          c.caps = (c.caps || 0) + 1;
          this.event('plant', { id: c.id, site, x: b.x, y: b.y, z: b.z });
          return;
        }
      } else b.plant = Math.max(0, b.plant - dt * 2);
      this.roundT -= dt;
      if (attAlive === 0) { this.endRound(1 - this.att, 'elim'); return; }
      if (defAlive === 0) { this.endRound(this.att, 'elim'); return; }
      if (this.roundT <= 0) { this.endRound(1 - this.att, 'time'); return; }
    } else if (this.phase === 'planted') {
      b.fuse -= dt;
      // defusing: the nearest defender stands still on the bomb
      let best = null, bd = 1.9;
      for (const c of this.defenders()) {
        if (!c.alive) continue;
        const d = Math.hypot(c.pos.x - b.x, c.pos.z - b.z);
        if (d < bd && Math.abs(c.pos.y - b.y) < 2) { bd = d; best = c; }
      }
      if (best && Math.hypot(best.vel.x, best.vel.z) < 1.2) {
        b.defuse += dt / DEFUSE_T;
        b.defuser = best;
        if (b.defuse >= 1) { best.caps = (best.caps || 0) + 1; this.event('defuse', { id: best.id }); this.endRound(1 - this.att, 'defuse'); return; }
      } else { b.defuse = Math.max(0, b.defuse - dt * 0.5); b.defuser = null; }
      if (defAlive === 0) { this.endRound(this.att, 'elim'); return; }
      if (b.fuse <= 0) {
        // the blast
        for (const c of g.chars) {
          if (!c.alive) continue;
          const d = Math.hypot(c.pos.x - b.x, c.pos.y - b.y, c.pos.z - b.z);
          if (d < BOMB_R) g.damage(c, 400 * (1 - d / (BOMB_R * 1.3)), b.by && g.chars.includes(b.by) ? b.by : c, false, null);
        }
        this.event('boom', { x: b.x, y: b.y, z: b.z });
        this.endRound(this.att, 'boom');
      }
    }
  }

  present(kind, d) {
    const g = this.game, me = g.player;
    if (g.attract) return;
    const attacking = me.team === this.att;
    if (kind === 'round') {
      this.round = d.n; this.att = d.att;
      if (g.mode === 'client') this.setSites(1 - this.att);
      const mine = me.team === d.att;
      g.announcer.announce(`Round ${d.n}`, mine ? (d.carrier === me.id ? 'You have the bomb: plant it at A or B' : 'Attack: get the bomb to A or B') : 'Defend A and B');
      g.audio.play('sting-start');
    } else if (kind === 'take') {
      const c = g.charById(d.id);
      g.hud.feedNote(`${c ? c.name : '?'} picked up the bomb`, TEAM_COLORS[this.att]);
      if (c === me) g.announcer.announce('You have the bomb', 'Plant it at A or B');
    } else if (kind === 'drop') {
      g.hud.feedNote('The bomb was dropped', 0xffd24d);
    } else if (kind === 'plant') {
      const c = g.charById(d.id);
      g.hud.feedNote(`${c ? c.name : '?'} planted the bomb at ${'AB'[d.site] || '?'}`, 0xff6b1a);
      g.announcer.announce('Bomb planted', attacking ? `Defend it for ${FUSE_T} seconds` : 'Defuse it: stand on it');
      g.audio.play('sting-minute');
      if (c === me && g.forCareer) { g.xp(300, 'Bomb plants'); g.medal('plant'); g.checkAchievements(); }
    } else if (kind === 'defuse') {
      const c = g.charById(d.id);
      g.hud.feedNote(`${c ? c.name : '?'} defused the bomb`, 0x7fdc9a);
      if (c === me && g.forCareer) { g.xp(300, 'Bomb defuses'); g.medal('defuse'); g.checkAchievements(); }
    } else if (kind === 'boom') {
      g.effects.explosion(d.x, d.y + 0.3, d.z, d.y);
      g.audio.play('explosion', { x: d.x, y: d.y, z: d.z }, 1.6);
    } else if (kind === 'end') {
      const won = me.team === d.win;
      const why = { elim: 'Last one standing', time: 'Time ran out', defuse: 'Bomb defused', boom: 'The bomb went off' }[d.why] || '';
      g.announcer.announce(won ? 'Round won' : 'Round lost', why);
      g.audio.play(won ? 'win' : 'lose', null, 0.6);
      if (won && g.forCareer) g.xp(100, 'Rounds won');
      // the last one standing on the winning side
      if (won && me.alive && g.chars.filter((c) => c.team === me.team && c.alive).length === 1 && g.chars.filter((c) => c.team === me.team).length > 1) { g.medal('clutch'); g.checkAchievements(); }
    }
  }

  snapshot() {
    const b = this.bomb, r2 = (v) => Math.round(v * 100) / 100;
    const ph = { wait: 0, play: 1, planted: 2, over: 3 }[this.phase];
    const bs = { carried: 0, dropped: 1, planted: 2 }[b.state];
    return [this.round, this.att, ph, Math.ceil(this.roundT), bs, b.carrier ? b.carrier.id : -1, r2(b.x), r2(b.y), r2(b.z), Math.ceil(b.fuse * 10) / 10, Math.round(b.plant * 100), Math.round(b.defuse * 100), b.site, b.defuser ? b.defuser.id : -1];
  }

  applySnapshot(a) {
    if (!Array.isArray(a) || a.length < 14) return;
    const g = this.game, b = this.bomb;
    if ((a[1] === 0 || a[1] === 1) && (a[1] !== this.att || !this.sites.length)) { this.att = a[1]; this.setSites(1 - this.att); }
    this.round = a[0] | 0;
    this.phase = ['wait', 'play', 'planted', 'over'][a[2]] || 'play';
    this.roundT = +a[3] || 0;
    b.state = ['carried', 'dropped', 'planted'][a[4]] || 'carried';
    b.carrier = b.state === 'carried' ? g.charById(a[5]) : null;
    if (b.state !== 'carried') { b.x = +a[6] || 0; b.y = +a[7] || 0; b.z = +a[8] || 0; }
    b.fuse = +a[9] || 0; b.plant = (a[10] | 0) / 100; b.defuse = (a[11] | 0) / 100; b.site = a[12] | 0;
    b.defuser = a[13] >= 0 ? g.charById(a[13]) : null;
  }

  updateVisuals(dt, time) {
    const b = this.bomb, me = this.game.player;
    this.siteFx.forEach((fx, i) => {
      const planted = b.state === 'planted' && b.site === i;
      setZoneColor(fx, planted ? 0xff3020 : 0xff8a2a, 0);
      fx.ring.material.opacity = planted ? 0.5 + 0.4 * Math.sin(time * 8) : 0.75;
    });
    const m = this.bombFx;
    if (b.state === 'carried' && b.carrier) {
      const c = b.carrier;
      m.visible = c !== me && c.alive;
      m.position.set(c.pos.x + Math.sin(c.yaw) * 0.3, c.pos.y + 1.0, c.pos.z + Math.cos(c.yaw) * 0.3);
      m.rotation.set(0, c.yaw, 0);
    } else {
      m.visible = this.phase !== 'wait' && b.state !== 'carried';
      m.position.set(b.x, b.y, b.z);
      m.rotation.set(0, time * (b.state === 'dropped' ? 1.4 : 0), 0);
    }
    // the light blinks faster as the fuse runs down
    const rate = b.state === 'planted' ? 2 + (1 - Math.max(0, b.fuse) / FUSE_T) * 10 : 1;
    this.light.visible = Math.sin(time * Math.PI * rate) > 0;
  }

  status(p) {
    const b = this.bomb, attacking = p.team === this.att, t = Math.max(0, Math.ceil(this.roundT));
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    if (this.phase === 'wait') return { text: 'SEARCH & DESTROY: GET READY', color: '#e8e8e8' };
    if (this.phase === 'over') return { text: `ROUND ${this.round} OVER: NEXT ROUND SOON`, color: '#e8e8e8' };
    if (this.phase === 'planted') {
      const f = Math.max(0, Math.ceil(b.fuse));
      if (b.defuser === p) return { text: `DEFUSING ${Math.round(b.defuse * 100)}%   ${f}s`, color: '#7fdc9a', on: true };
      return { text: `BOMB PLANTED AT ${'AB'[b.site]}   ${f}s${attacking ? '   PROTECT IT' : '   DEFUSE IT'}`, color: '#ff6b5a', on: f <= 10 };
    }
    if (b.carrier === p) {
      if (b.plant > 0) return { text: `PLANTING ${Math.round(b.plant * 100)}%`, color: '#ffd24d', on: true };
      return { text: `ROUND ${this.round}   YOU HAVE THE BOMB: STAND STILL ON A OR B   ${clock}`, color: '#ffd24d', on: true };
    }
    return { text: `ROUND ${this.round}   ${attacking ? 'ATTACK: PLANT AT A OR B' : 'DEFEND A AND B'}   ${clock}`, color: attacking ? '#ff8a2a' : hex(TEAM_COLORS[Math.max(0, p.team)]) };
  }

  markers(p) {
    const b = this.bomb, out = [];
    const attacking = p.team === this.att;
    if (this.phase === 'wait') return out;
    const dist = (x, z) => Math.round(Math.hypot(p.pos.x - x, p.pos.z - z));
    if (b.state !== 'planted') {
      this.sites.forEach((s) => { if (!this.inZone(p, s)) out.push({ x: s.x, y: s.y + 1.4, z: s.z, label: `${attacking ? 'PLANT' : 'DEFEND'} ${s.letter} ${dist(s.x, s.z)}m`, color: '#ff8a2a' }); });
    }
    if (b.state === 'dropped' && attacking) out.push({ x: b.x, y: b.y + 1, z: b.z, label: `BOMB ${dist(b.x, b.z)}m`, color: '#ffd24d' });
    if (b.state === 'planted') out.push({ x: b.x, y: b.y + 1, z: b.z, label: `${attacking ? 'PROTECT' : 'DEFUSE'} ${dist(b.x, b.z)}m`, color: '#ff3020' });
    return out;
  }

  botJob(bot) {
    const b = this.bomb, attacking = bot.team === this.att;
    if (this.phase !== 'play' && this.phase !== 'planted') return null;
    const near = (x, y, z, r) => { const a = Math.random() * Math.PI * 2, d = Math.random() * r; return { x: x + Math.cos(a) * d, y, z: z + Math.sin(a) * d }; };
    if (attacking) {
      if (this.phase === 'planted') return { ...near(b.x, b.y, b.z, 6), stay: rand(2, 4) };
      if (b.state === 'dropped') return { x: b.x, y: b.y, z: b.z, stay: 0, sprint: true };
      const s = this.sites[this.targetSite] || this.sites[0];
      if (!s) return null;
      if (b.carrier === bot) return { x: s.x, y: s.y, z: s.z, stay: PLANT_T + 1, stand: true, sprint: true };
      return { ...near(s.x, s.y, s.z, 7), stay: rand(2, 4) };
    }
    if (this.phase === 'planted') {
      // the nearest defender goes for the defuse, the rest cover
      const defs = this.defenders().filter((c) => c.alive);
      const closest = defs.reduce((a, c) => (!a || Math.hypot(c.pos.x - b.x, c.pos.z - b.z) < Math.hypot(a.pos.x - b.x, a.pos.z - b.z) ? c : a), null);
      if (closest === bot) return { x: b.x, y: b.y, z: b.z, stay: DEFUSE_T + 1, stand: true, sprint: true };
      return { ...near(b.x, b.y, b.z, 7), stay: rand(2, 4), sprint: true };
    }
    const s = this.sites[bot.id % 2] || this.sites[0];
    return s ? { ...near(s.x, s.y, s.z, s.r + 2), stay: rand(3, 6) } : null;
  }
}

// ======================================================================
// Infected: everyone starts a survivor; one player turns. Infected fight with
// knives only, run faster, and come back quickly. Every survivor they kill
// joins them. Survivors win if any of them last until time runs out.
// ======================================================================

const INFECT_DELAY = 8;
export const INFECTED_SPEED = 1.2;

export class Infected extends Objective {
  constructor(game) {
    super(game);
    this.started = false;
    this.startT = game.time + INFECT_DELAY;
    if (game.mode !== 'client') for (const c of game.chars) { c.team = 0; c.speedMul = 1; game.paint(c); }
  }

  teamColor(t) { return t === 1 ? INFECTED_COLOR : TEAM_COLORS[0]; }
  joinTeam() { return this.started ? 1 : 0; }
  /** Only one infected so far: they kill in one swing until they have company. */
  alone() { return this.started && this.game.chars.filter((c) => c.team === 1).length === 1; }
  noGuns(c) { return this.started && c.team === 1; }

  infect(c, by) {
    const g = this.game;
    if (c.team === 1) return;
    c.team = 1;
    c.teamPref = -1;
    c.speedMul = INFECTED_SPEED;
    c.grenades = 0; c.tactical = 0;
    g.paint(c);
    this.event('infect', { id: c.id, by: by ? by.id : -1 });
    if (g.mode === 'host') g.net.onRosterChanged();
  }

  onSpawn(c) {
    if (this.noGuns(c)) { c.grenades = 0; c.tactical = 0; c.speedMul = INFECTED_SPEED; }
  }

  onKill(victim, attacker) {
    if (!this.started) return;
    if (victim.team === 0) this.infect(victim, attacker !== victim ? attacker : null);
    if (victim.team === 1) victim.respawnAt = Math.min(victim.respawnAt, this.game.time + 2);
  }

  update() {
    const g = this.game;
    if (g.over) return;
    if (!this.started && g.time >= this.startT) {
      const pool = g.chars.filter((c) => c.alive);
      if (pool.length >= 2) {
        this.started = true;
        const first = pool[(Math.random() * pool.length) | 0];
        this.infect(first, null);
        this.event('start', { id: first.id });
      } else this.startT = g.time + 2;
    }
    // the last infected left: someone else turns
    if (this.started && !g.chars.some((c) => c.team === 1) && g.chars.length >= 2) {
      const pool = g.chars.filter((c) => c.alive);
      if (pool.length) this.infect(pool[(Math.random() * pool.length) | 0], null);
    }
    if (this.started && g.rules.won(g)) g.endMatch();
  }

  present(kind, d) {
    const g = this.game, me = g.player;
    if (g.attract) return;
    if (kind === 'start') {
      this.started = true;
      const c = g.charById(d.id);
      g.announcer.announce(c === me ? "You're infected" : 'Infection!', c === me ? 'Knife the survivors. Everyone you get joins you.' : `${c ? c.name : 'Someone'} has turned`);
      g.audio.play('sting-minute');
    } else if (kind === 'infect') {
      const c = g.charById(d.id);
      if (c && g.mode === 'client') c.team = 1;
      if (c && c !== me && d.by >= 0) g.hud.feedNote(`${c.name} was infected`, INFECTED_COLOR);
      if (c === me && d.by >= 0) g.announcer.announce("You're infected", 'Hunt down the survivors');
      const left = g.chars.filter((x) => x.team === 0).length;
      if (me.team === 0 && left > 0 && left <= 2 && d.by >= 0) g.hud.centerMessage(left === 1 ? 'LAST SURVIVOR' : 'TWO SURVIVORS LEFT', left === 1 ? 'Stay alive' : '', 2.5, '#7fdc9a');
    }
  }

  snapshot() { return [this.started ? 1 : 0, Math.max(0, Math.ceil(this.startT - this.game.time))]; }
  applySnapshot(a) {
    if (!Array.isArray(a)) return;
    this.started = !!a[0];
    if (!this.started) this.startT = this.game.time + (+a[1] || 0);
  }

  status(p) {
    const g = this.game;
    const s = g.chars.filter((c) => c.team === 0).length, inf = g.chars.filter((c) => c.team === 1).length;
    if (!this.started) return { text: `INFECTION IN ${Math.max(0, Math.ceil(this.startT - g.time))}`, color: '#7fdc9a' };
    if (p.team === 1 && this.alone()) return { text: `ALPHA: ONE SWING KILLS     ${s} SURVIVORS LEFT`, color: hex(INFECTED_COLOR), on: true };
    if (p.team === 1) return { text: `INFECTED: KNIFE THEM     ${s} SURVIVOR${s === 1 ? '' : 'S'} LEFT`, color: hex(INFECTED_COLOR), on: true };
    return { text: `SURVIVE     ${s} SURVIVOR${s === 1 ? '' : 'S'}     ${inf} INFECTED`, color: '#e8e8e8' };
  }

  markers(p) {
    // the infected can sense the nearest survivor
    if (!this.started || p.team !== 1) return [];
    let best = null, bd = Infinity;
    for (const c of this.game.chars) {
      if (c.team !== 0 || !c.alive) continue;
      const d = Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best && bd > 18 ? [{ x: best.pos.x, y: best.pos.y + 2.2, z: best.pos.z, label: `SURVIVOR ${Math.round(bd)}m`, color: hex(INFECTED_COLOR) }] : [];
  }

  botJob(bot) {
    if (!this.noGuns(bot)) return null; // survivors play it like Team Deathmatch
    let best = null, bd = Infinity;
    for (const c of this.game.chars) {
      if (c.team !== 0 || !c.alive) continue;
      const d = Math.hypot(c.pos.x - bot.pos.x, c.pos.z - bot.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best ? { x: best.pos.x, y: best.pos.y, z: best.pos.z, stay: 0, sprint: true } : null;
  }
}

export const OBJECTIVES = { dom: Domination, sd: SearchDestroy, infected: Infected };
