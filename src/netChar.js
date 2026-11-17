// A character driven over the network: another human, or (on clients) a bot
// that the host is simulating. Positions arrive ~20-30 times a second and are
// played back slightly in the past so movement between updates is smooth.

import { Character } from './character.js';
import { CFG } from './config.js';
import { BotModel } from './botModel.js';

const DELAY = 0.1; // seconds of interpolation buffer
const TWO_PI = Math.PI * 2;

function lerpAngle(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return a + d * f;
}

export class NetChar extends Character {
  constructor(game, id, name, color, isBot) {
    super(game, id, name, color, false);
    this.isHuman = !isBot;
    this.isRemote = true;
    this.model = new BotModel(name, color);
    game.scene.add(this.model.group);
    this.buf = [];
    this.conn = null; // host only: the link to this player's browser
    this.spawnSeq = 0; // host only: bumped on every spawn so stale updates can be dropped
    this.lastFireT = -9;
    this.netCrouch = false;
    this.netGround = true;
    this.netProtected = false;
    this.netLean = 0;
  }

  /** Host: (re)spawn this remote player. */
  spawnAt(x, y, z, yaw) {
    super.spawnAt(x, y, z, yaw);
    this.spawnSeq++;
    this.place(x, y, z, yaw);
  }

  /** Snap to a position with no interpolation from wherever we were. */
  place(x, y, z, yaw) {
    this.buf.length = 0;
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.push(x, y, z, yaw, 0);
    this.model.reset();
  }

  /** Queue a received transform. */
  push(x, y, z, yaw, pitch) {
    const b = this.buf;
    const last = b[b.length - 1];
    // a jump this big is a respawn, not movement: don't slide across the map
    if (last && Math.abs(x - last.x) + Math.abs(z - last.z) + Math.abs(y - last.y) > 12) b.length = 0;
    b.push({ t: performance.now() / 1000, x, y, z, yaw, pitch });
    if (b.length > 20) b.shift();
  }

  isProtected() {
    return this.game.mode === 'client' ? this.netProtected : super.isProtected();
  }

  update(dt) {
    const g = this.game;
    if (!this.alive) {
      this.model.update(dt, { alive: false });
      return;
    }
    const b = this.buf;
    const px = this.pos.x, pz = this.pos.z;
    if (b.length) {
      const rt = performance.now() / 1000 - DELAY;
      let j = -1;
      for (let i = b.length - 1; i >= 0; i--) if (b[i].t <= rt) { j = i; break; }
      if (j < 0) {
        const s = b[0];
        this.pos.set(s.x, s.y, s.z); this.yaw = s.yaw; this.pitch = s.pitch;
        this.vel.set(0, 0, 0);
      } else if (j === b.length - 1) {
        const s = b[j];
        this.pos.set(s.x, s.y, s.z); this.yaw = s.yaw; this.pitch = s.pitch;
        this.vel.set(0, 0, 0);
      } else {
        const a = b[j], c = b[j + 1];
        const span = Math.max(1e-3, c.t - a.t);
        const f = Math.min(1, (rt - a.t) / span);
        this.pos.set(a.x + (c.x - a.x) * f, a.y + (c.y - a.y) * f, a.z + (c.z - a.z) * f);
        this.yaw = lerpAngle(a.yaw, c.yaw, f);
        this.pitch = a.pitch + (c.pitch - a.pitch) * f;
        // velocity lets bots lead this player and drives the walk animation
        this.vel.set((c.x - a.x) / span, (c.y - a.y) / span, (c.z - a.z) / span);
      }
    }
    this.lean += (this.netLean - this.lean) * Math.min(1, dt * 12);
    this.leanOff = this.lean * 0.5;
    this.crouching = this.netCrouch;
    this.onGround = this.netGround;
    this.height = this.crouching ? CFG.heightCrouch : CFG.heightStand;
    this.eyeH += ((this.crouching ? CFG.eyeCrouch : CFG.eyeStand) - this.eyeH) * Math.min(1, dt * 12);

    // footsteps: audible to the local player, and (on the host) to the bots
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && moved < 2) {
      this.stepDist += moved;
      if (this.stepDist > 2.3) {
        this.stepDist = 0;
        if (!this.crouching) {
          g.audio.play('step', this.pos, 0.9);
          if (this.isHuman && speed > 5) g.emitNoise(this.pos.x, this.pos.y, this.pos.z, 8, this, 'step');
        }
      }
    }

    this.model.update(dt, {
      alive: true,
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      yaw: this.yaw, pitch: this.pitch,
      speed, onGround: this.onGround, crouch: this.crouching, lean: this.lean,
      protected: this.isProtected(), time: g.time,
    });
  }

  // host: tell the remote player's own screen that they were hit
  onDamaged(attacker, amount) {
    if (this.conn) this.conn.send({ t: 'hurt', a: attacker ? attacker.id : -1, d: Math.round(amount * 10) / 10, hp: this.health, ar: this.armor });
  }

  onDeath() { this.model.deadT = 0; }
  onKnife() { this.model.melee(); }

  dispose() {
    this.model.dispose(this.game.scene);
    this.buf.length = 0;
  }
}
