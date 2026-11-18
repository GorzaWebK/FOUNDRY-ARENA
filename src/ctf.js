// Capture the Flag: two flags, one at each team's base (map.flags[team]).
//
//   - Touch the enemy flag (at its base, or wherever it was dropped) to take it.
//   - Carry it to your own base while your own flag is at home to capture it.
//   - A carrier who dies drops the flag; it goes home by itself after a while,
//     or straight away when one of its own team touches it.
//
// The match authority (solo game / host) runs the rules; multiplayer clients
// copy flag states from snapshots and present the events the host sends.

import * as THREE from 'three';
import { TEAM_COLORS, TEAM_NAMES } from './modes.js';

export const FLAG_RETURN_TIME = 20; // seconds a dropped flag lies there before going home
const TOUCH_R = 1.4;
const HOME = 0, CARRIED = 1, DROPPED = 2;
export const FLAG_STATE = { HOME, CARRIED, DROPPED };

const _hit = { t: 0, nx: 0, ny: 0, nz: 0 };

function makeFlagMesh(color) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 0.6, roughness: 0.35 }));
  pole.position.y = 1.15;
  pole.castShadow = true;
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.8 }));
  cloth.position.set(0, 1.98, -0.42);
  cloth.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), pole.material);
  knob.position.y = 2.32;
  g.add(pole, cloth, knob);
  return { group: g, cloth };
}

function makeBaseMesh(color) {
  const g = new THREE.Group();
  const mat = (o) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.45, 40), mat(0.9));
  ring.rotation.x = -Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), mat(0.12));
  disc.rotation.x = -Math.PI / 2;
  g.add(ring, disc);
  g.position.y = 0.03;
  return g;
}

export class Ctf {
  constructor(game) {
    this.game = game;
    const spots = game.map.flags;
    this.flags = [0, 1].map((team) => {
      const home = spots[team];
      const mesh = makeFlagMesh(TEAM_COLORS[team]);
      const base = makeBaseMesh(TEAM_COLORS[team]);
      base.position.set(home[0], home[1] + 0.03, home[2]);
      game.scene.add(mesh.group, base);
      return { team, home, x: home[0], y: home[1], z: home[2], state: HOME, carrier: null, returnT: 0, mesh, base };
    });
  }

  dispose() {
    for (const f of this.flags) {
      this.game.scene.remove(f.mesh.group, f.base);
      f.mesh.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      f.base.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    }
  }

  /** The flag `c` is carrying, or null. */
  carrying(c) {
    for (const f of this.flags) if (f.state === CARRIED && f.carrier === c) return f;
    return null;
  }

  sendHome(f) {
    f.state = HOME; f.carrier = null; f.returnT = 0;
    f.x = f.home[0]; f.y = f.home[1]; f.z = f.home[2];
  }

  /** Drop a flag where its carrier fell (on the floor below them). */
  drop(f) {
    const c = f.carrier;
    f.state = DROPPED; f.carrier = null; f.returnT = FLAG_RETURN_TIME;
    if (!c) return;
    f.x = c.pos.x; f.z = c.pos.z; f.y = c.pos.y;
    const w = this.game.world;
    if (w.raycast(c.pos.x, c.pos.y + 0.5, c.pos.z, 0, -1, 0, 40, _hit)) f.y = c.pos.y + 0.5 - _hit.t;
  }

  near(c, f) {
    return Math.hypot(c.pos.x - f.x, c.pos.z - f.z) < TOUCH_R && Math.abs(c.pos.y - f.y) < 1.8;
  }

  /** Authority: pick-ups, returns, captures, drops. */
  update(dt) {
    const g = this.game;
    if (g.over) return;
    for (const f of this.flags) {
      if (f.state === CARRIED && (!f.carrier || !f.carrier.alive || !g.chars.includes(f.carrier))) {
        const who = f.carrier;
        this.drop(f);
        this.event('drop', f.team, who);
      }
      if (f.state === DROPPED) {
        f.returnT -= dt;
        if (f.returnT <= 0) { this.sendHome(f); this.event('home', f.team, null); }
      }
    }
    for (const c of g.chars) {
      if (!c.alive || c.team < 0) continue;
      for (const f of this.flags) {
        if (f.state === CARRIED || !this.near(c, f)) continue;
        if (c.team !== f.team) {
          if (this.carrying(c)) continue;
          f.state = CARRIED; f.carrier = c; f.returnT = 0;
          c.protectedUntil = 0;
          this.event('take', f.team, c);
        } else if (f.state === DROPPED) {
          this.sendHome(f);
          if (c.st) c.st.returns = (c.st.returns || 0) + 1;
          this.event('return', f.team, c);
        } else {
          // at your own base, with your flag home: capture whatever you carry
          const carried = this.carrying(c);
          if (!carried) continue;
          this.sendHome(carried);
          g.teamScore[c.team]++;
          c.caps = (c.caps || 0) + 1;
          this.event('cap', carried.team, c);
          if (g.rules.won(g)) { g.endMatch(); return; }
        }
      }
    }
  }

  /** Something happened to team `team`'s flag. Shown here and sent to clients. */
  event(kind, team, who) {
    const g = this.game;
    if (g.mode === 'host') g.net.onFlag(kind, team, who);
    this.present(kind, team, who);
  }

  /** Feed lines, call-outs and sounds for a flag event (every machine). */
  present(kind, team, who) {
    const g = this.game, me = g.player;
    if (g.attract) return;
    const mine = team === me.team; // our flag
    const name = TEAM_NAMES[team];
    const col = TEAM_COLORS[team];
    const by = who ? who.name : '';
    const byMe = who === me;
    if (kind === 'take') {
      g.hud.feedNote(`${by} took the ${name} flag`, who ? who.color : col);
      if (byMe) { g.announcer.announce('You have the flag', 'Bring it back to your base'); g.xp(75, 'Flags'); }
      else if (mine) g.announcer.announce('Flag taken', `${by} has your flag`);
      g.audio.play('pickup', null, 0.8, mine ? 300 : 900);
    } else if (kind === 'drop') {
      g.hud.feedNote(`The ${name} flag was dropped`, col);
      if (mine) g.announcer.announce('Flag dropped', 'Touch it to send it home');
    } else if (kind === 'return') {
      g.hud.feedNote(`${by} returned the ${name} flag`, who ? who.color : col);
      if (mine) g.announcer.announce('Flag returned');
      if (byMe) { g.xp(100, 'Flags'); g.ch('return'); g.medal('ret'); }
      g.audio.play('pickup', null, 0.6, 500);
    } else if (kind === 'home') {
      g.hud.feedNote(`The ${name} flag went home`, col);
    } else if (kind === 'cap') {
      g.hud.feedNote(`${by} captured the ${name} flag`, who ? who.color : col);
      g.announcer.announce(mine ? 'Enemy captured' : byMe ? 'Flag captured!' : 'Team captured', mine ? `${by} took your flag home` : '+1 capture');
      g.audio.play(mine ? 'lose' : 'win', null, 0.6);
      if (byMe && g.forCareer) { g.career.cap(); g.xp(400, 'Captures'); g.ch('cap'); g.medal('flag'); g.checkAchievements(); }
    }
  }

  /** Multiplayer client: copy flag states from a snapshot. */
  applySnapshot(list) {
    const g = this.game;
    if (!Array.isArray(list)) return;
    for (let i = 0; i < 2; i++) {
      const e = list[i], f = this.flags[i];
      if (!Array.isArray(e) || e.length < 6) continue;
      f.state = e[0] === CARRIED || e[0] === DROPPED ? e[0] : HOME;
      f.carrier = f.state === CARRIED ? g.charById(e[1]) : null;
      if (f.state !== CARRIED) { f.x = e[2]; f.y = e[3]; f.z = e[4]; }
      f.returnT = e[5];
    }
  }

  /** Host: flag states for a snapshot. */
  snapshot() {
    const r2 = (v) => Math.round(v * 100) / 100;
    return this.flags.map((f) => [f.state, f.carrier ? f.carrier.id : -1, r2(f.x), r2(f.y), r2(f.z), Math.ceil(f.returnT)]);
  }

  /** Every frame, everywhere: put the flag models where they belong. */
  updateVisuals(dt, time) {
    const g = this.game;
    for (const f of this.flags) {
      const m = f.mesh.group;
      if (f.state === CARRIED && f.carrier) {
        const c = f.carrier;
        if (f.state === CARRIED && c !== g.player && !c.alive) { m.visible = false; continue; }
        // on the carrier's back, a little behind them
        const bx = Math.sin(c.yaw) * 0.32, bz = Math.cos(c.yaw) * 0.32;
        m.position.set(c.pos.x + bx, c.pos.y + 0.55, c.pos.z + bz);
        m.rotation.set(0.12, c.yaw, 0);
        m.scale.setScalar(0.75);
        // you don't see the flag on your own back (it would sit inside the camera)
        m.visible = !(c === g.player && !g.killcam.active);
        f.x = c.pos.x; f.y = c.pos.y; f.z = c.pos.z;
      } else {
        m.visible = true;
        m.position.set(f.x, f.y, f.z);
        m.rotation.set(0, time * (f.state === DROPPED ? 1.5 : 0.4), 0);
        m.scale.setScalar(1);
      }
      f.mesh.cloth.material.emissiveIntensity = 0.3 + 0.2 * Math.sin(time * 4 + f.team);
      f.base.children[0].material.opacity = f.state === HOME ? 0.9 : 0.35 + 0.25 * Math.sin(time * 6);
    }
  }
}
