// Kill cam: when you die, replay the last couple of seconds from your killer's
// eyes while you wait to respawn.
//
// Every machine keeps a short rolling recording of what it sees: each
// character's position, aim, stance and weapons (30 times a second), plus the
// shots and explosions that happened. The replay moves the character models
// to the recorded poses just before rendering; the next frame's normal update
// puts them back, so the live game keeps running underneath.

import * as THREE from 'three';
import { BotModel } from './botModel.js';
import { WEAPONS } from './weapons.js';
import { verticalFov } from './settings.js';

const REC_HZ = 30;
const KEEP = 5; // seconds of history
const WINDOW = 2.4; // seconds replayed
const DELAY = 0.6; // watch yourself fall first

const _e = new THREE.Vector3();

export class KillCam {
  constructor(game) {
    this.game = game;
    this.frames = [];
    this.events = [];
    this.acc = 0;
    this.active = false;
    this.pending = false;
    this.playerModel = null;
  }

  reset() {
    this.stop();
    this.frames.length = 0;
    this.events.length = 0;
  }

  // ---------------------------------------------------------------- recording

  record(dt) {
    this.acc += dt;
    if (this.acc < 1 / REC_HZ) return;
    this.acc = 0;
    const g = this.game, t = g.time;
    const chars = [];
    for (const c of g.chars) {
      chars.push({
        id: c.id, x: c.pos.x, y: c.pos.y, z: c.pos.z, yaw: c.yaw, pitch: c.pitch,
        eye: c.eyeH, lean: c.lean || 0, leanOff: c.leanOff || 0, crouch: c.crouching, alive: c.alive,
        gear: c.alive ? c.gear() : null,
      });
    }
    this.frames.push({ t, chars });
    while (this.frames.length && this.frames[0].t < t - KEEP) this.frames.shift();
    while (this.events.length && this.events[0].t < t - KEEP) this.events.shift();
  }

  /** A shot to replay: muzzle [x,y,z] and the same `ends` format the network uses. */
  shot(shooterId, weaponIndex, muzzle, ends) {
    if (this.active) return;
    this.events.push({ t: this.game.time, kind: 'shot', id: shooterId, w: weaponIndex, m: [muzzle[0], muzzle[1], muzzle[2]], e: ends ? ends.map((x) => x.slice()) : [] });
  }

  boom(x, y, z) {
    if (this.active) return;
    this.events.push({ t: this.game.time, kind: 'boom', x, y, z });
  }

  // ---------------------------------------------------------------- playback

  /** The local player was just killed by `killer`. */
  begin(killer, victim) {
    const g = this.game;
    if (!g.settings.killcam || !killer || killer === victim || this.frames.length < 15) return;
    if (!killer.model && !killer.isPlayer) return;
    this.killerId = killer.id;
    this.killerName = killer.name;
    this.killerColor = killer.color;
    this.victimId = victim.id;
    this.tEnd = g.time;
    this.tStart = Math.max(this.frames[0].t, g.time - WINDOW);
    // freeze a copy of the window so live recording can't disturb it
    this.clip = this.frames.filter((f) => f.t >= this.tStart - 0.1 && f.t <= this.tEnd + 0.05);
    this.clipEvents = this.events.filter((e) => e.t >= this.tStart && e.t <= this.tEnd + 0.05);
    this.nextEvent = 0;
    this.wait = DELAY;
    this.t = 0;
    this.pending = true;
    this.active = false;
    if (!this.playerModel) {
      this.playerModel = new BotModel(victim.name, victim.color);
      g.scene.add(this.playerModel.group);
    }
    this.playerModel.setColor(victim.color, victim.name);
    this.playerModel.group.visible = false;
  }

  stop() {
    const was = this.active;
    this.active = false;
    this.pending = false;
    if (this.playerModel) this.playerModel.group.visible = false;
    if (!was) return;
    // put the live world back the way the next update expects it
    for (const c of this.game.chars) {
      if (c.model) {
        if (c.alive) c.model.group.visible = true;
        c.model.tag.visible = c.alive;
      }
    }
    const g = this.game;
    if (Math.abs(g.camera.fov - verticalFov(g.settings.fov)) > 0.01) { g.camera.fov = verticalFov(g.settings.fov); g.camera.updateProjectionMatrix(); }
  }

  /** Advance the clock. Returns true while the replay owns the camera. */
  update(dt) {
    if (this.pending) {
      this.wait -= dt;
      if (this.wait <= 0) { this.pending = false; this.active = true; this.t = 0; }
    }
    if (!this.active) return false;
    this.t += dt;
    // hold on the last frame for a moment, then stop if we're still dead
    if (this.t > this.tEnd - this.tStart + 1.2) this.stop();
    return this.active;
  }

  /** Pose everything for the current replay moment. Call after the game update, before rendering. */
  apply(dt) {
    if (!this.active) return;
    const g = this.game;
    const rt = Math.min(this.tStart + this.t, this.tEnd);
    const clip = this.clip;
    let i = 0;
    while (i < clip.length - 2 && clip[i + 1].t < rt) i++;
    const a = clip[i], b = clip[Math.min(i + 1, clip.length - 1)];
    const f = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 0;
    const killerHere = g.charById(this.killerId);
    if (!killerHere && this.killerId !== g.player.id) { this.stop(); return; }

    for (const ca of a.chars) {
      const cb = b.chars.find((c) => c.id === ca.id) || ca;
      const model = ca.id === g.player.id ? this.playerModel : g.charById(ca.id)?.model;
      if (!model) continue;
      const g0 = model.group;
      const alive = ca.alive && cb.alive;
      if (!alive || ca.id === this.killerId) { g0.visible = false; continue; }
      g0.visible = true;
      model.tilt.rotation.set(0, 0, 0);
      model.tilt.position.y = 0;
      model.tag.visible = true;
      let dyaw = cb.yaw - ca.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const span = Math.max(1e-3, b.t - a.t);
      model.update(dt, {
        alive: true,
        x: ca.x + (cb.x - ca.x) * f, y: ca.y + (cb.y - ca.y) * f, z: ca.z + (cb.z - ca.z) * f,
        yaw: ca.yaw + dyaw * f, pitch: ca.pitch + (cb.pitch - ca.pitch) * f,
        speed: Math.hypot(cb.x - ca.x, cb.z - ca.z) / span, onGround: true, crouch: ca.crouch,
        lean: ca.lean, protected: false, time: g.time, gear: ca.gear,
      });
    }

    // the camera sits in the killer's head
    const ka = a.chars.find((c) => c.id === this.killerId);
    const kb = b.chars.find((c) => c.id === this.killerId) || ka;
    if (ka) {
      const yaw = ka.yaw + (((kb.yaw - ka.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * f;
      const pitch = ka.pitch + (kb.pitch - ka.pitch) * f;
      const lo = ka.leanOff + (kb.leanOff - ka.leanOff) * f;
      _e.set(ka.x + (kb.x - ka.x) * f, ka.y + (kb.y - ka.y) * f + ka.eye, ka.z + (kb.z - ka.z) * f);
      _e.x += Math.cos(yaw) * lo;
      _e.z -= Math.sin(yaw) * lo;
      g.camera.position.copy(_e);
      g.camera.rotation.set(pitch, yaw, -ka.lean * 0.17);
      const vf = verticalFov(g.settings.fov);
      if (Math.abs(g.camera.fov - vf) > 0.01) { g.camera.fov = vf; g.camera.updateProjectionMatrix(); }
    }

    // shots and explosions that happened by now
    const ev = this.clipEvents;
    while (this.nextEvent < ev.length && ev[this.nextEvent].t <= rt) {
      const e = ev[this.nextEvent++];
      if (e.kind === 'boom') { g.effects.explosion(e.x, e.y, e.z); continue; }
      const def = WEAPONS[e.w];
      for (let k = 0; k < e.e.length; k++) {
        const end = e.e[k];
        let sx = e.m[0], sy = e.m[1], sz = e.m[2];
        if (e.id === this.killerId) {
          // the killer's own tracers would start inside the camera: begin them a little way out
          const dx = end[0] - sx, dy = end[1] - sy, dz = end[2] - sz, l = Math.hypot(dx, dy, dz) || 1;
          const off = Math.min(2.5, l * 0.5);
          sx += (dx / l) * off; sy += (dy / l) * off; sz += (dz / l) * off;
        }
        g.effects.tracer(sx, sy, sz, end[0], end[1], end[2]);
        if (end[3] === 1) g.effects.impact(end[0], end[1], end[2], end[4] || 0, end[5] || 0, end[6] || 0, k < 2);
        else if (end[3] === 2) {
          const v = end[4] === g.player.id ? g.player : g.charById(end[4]);
          g.effects.hitBurst(end[0], end[1], end[2], 0, 0, 0, v ? v.color : 0xffffff, !!end[5]);
        }
      }
      const shooter = e.id === g.player.id ? this.playerModel : g.charById(e.id)?.model;
      if (shooter && e.id !== this.killerId) shooter.muzzleFlash();
      if (def && e.id === this.killerId) g.audio.play(def.id, null, 0.55);
    }
  }
}
