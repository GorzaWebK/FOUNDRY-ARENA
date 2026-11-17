// The human player: movement (sprint, crouch, slide, lean), camera, weapon input.

import * as THREE from 'three';
import { Character } from './character.js';
import { CFG } from './config.js';
import { moveBody } from './physics.js';
import { verticalFov } from './settings.js';

const _v = new THREE.Vector3();
const _hit = { t: 0, nx: 0, ny: 0, nz: 0 };

const LEAN_DIST = 0.5; // metres the head moves at full lean
const SLIDE_TIME = 0.9;
const SLIDE_FRICTION = 7.5;

export class Player extends Character {
  constructor(game) {
    super(game, 0, 'You', 0x4fc3f7, true);
    this.ads = 0; // 0 hip .. 1 aiming down sights
    this.scoped = false;
    this.recoilP = 0; this.recoilY = 0; // view kick, recovers over time
    this.bobPhase = 0;
    this.camDip = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.sprinting = false;
    this.sliding = false;
    this.slideT = 0; this.slideSpeed = 0; this.slideX = 0; this.slideZ = 0; this.slideCd = 0;
    this.shake = 0;
    this.deathT = 0;
    this.killer = null;
    this.roll = 0;
  }

  spawnAt(x, y, z, yaw) {
    this.primary = this.game.settings.primary; // loadout choices apply on (re)spawn
    super.spawnAt(x, y, z, yaw);
    this.ads = 0;
    this.scoped = false;
    this.recoilP = this.recoilY = 0;
    this.camDip = 0;
    this.deathT = 0;
    this.killer = null;
    this.roll = 0;
    this.shake = 0;
    this.sliding = false;
    this.slideT = 0; this.slideCd = 0;
  }

  aimDir(out) {
    const p = this.pitch + this.recoilP, y = this.yaw + this.recoilY;
    const cp = Math.cos(p);
    return out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp);
  }

  getMuzzle(out) {
    // roughly where the view-model's muzzle is in world space
    const y = this.yaw, sy = Math.sin(y), cy = Math.cos(y);
    const side = 0.16 * (1 - this.ads) + this.leanOff, fwd = 0.7;
    return out.set(
      this.pos.x + cy * side - sy * fwd,
      this.pos.y + this.eyeH - 0.12 * (1 - this.ads * 0.5) + Math.sin(this.pitch) * fwd,
      this.pos.z - sy * side - cy * fwd,
    );
  }

  update(dt, input) {
    const g = this.game;
    if (!this.alive) { this.updateDeathCam(dt); return; }
    const settings = g.settings;
    const w = this.weapon;

    // ---- look
    const wantAds = input.right && w.reloadT <= 0 && this.switchT <= 0 && !this.sprinting;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, dt * 14);
    if (this.ads < 0.002) this.ads = 0;
    this.scoped = !!w.def.scope && this.ads > 0.8;
    const zoom = 1 - this.ads * (1 - w.def.adsFov);
    const sens = settings.sensitivity * 0.0022 * zoom;
    this.yaw -= input.mdx * sens;
    this.pitch -= input.mdy * sens * (settings.invertY ? -1 : 1);
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    // ---- movement input
    let mf = 0, ms = 0;
    if (input.down('KeyW')) mf += 1;
    if (input.down('KeyS')) mf -= 1;
    if (input.down('KeyD')) ms += 1;
    if (input.down('KeyA')) ms -= 1;
    const ml = Math.hypot(mf, ms);
    if (ml > 0) { mf /= ml; ms /= ml; }
    const shift = input.down('ShiftLeft') || input.down('ShiftRight');
    const crouchKey = input.down('KeyC') || input.down('ControlLeft') || input.down('ControlRight');
    const crouchHit = input.hit('KeyC') || input.hit('ControlLeft') || input.hit('ControlRight');
    const speedNow = Math.hypot(this.vel.x, this.vel.z);

    // ---- slide: crouch while sprinting
    this.slideCd -= dt;
    if (!this.sliding && crouchHit && this.onGround && this.slideCd <= 0 && speedNow > CFG.walkSpeed + 0.8) {
      this.sliding = true;
      this.slideT = SLIDE_TIME;
      this.slideSpeed = Math.max(speedNow, CFG.sprintSpeed) * 1.22;
      this.slideX = this.vel.x / speedNow;
      this.slideZ = this.vel.z / speedNow;
      g.audio.play('slide');
      g.emitNoise(this.pos.x, this.pos.y, this.pos.z, 9, this, 'step');
    }
    if (this.sliding) {
      this.setCrouch(true);
      this.sprinting = false;
      this.slideT -= dt;
      this.slideSpeed = Math.max(0, this.slideSpeed - SLIDE_FRICTION * dt);
      if (this.onGround) {
        this.vel.x = this.slideX * this.slideSpeed;
        this.vel.z = this.slideZ * this.slideSpeed;
      }
      // ends when it runs out of time or speed, hits something, or you jump out of it
      if (this.slideT <= 0 || this.slideSpeed < CFG.crouchSpeed + 0.4 || this.hitWall || input.hit('Space')) {
        this.sliding = false;
        this.slideCd = 0.45;
      }
    } else {
      this.setCrouch(crouchKey);
      this.sprinting = shift && mf > 0.5 && !this.crouching && this.ads < 0.3 && this.onGround;
      let speed = CFG.walkSpeed;
      if (this.crouching) speed = CFG.crouchSpeed;
      else if (this.ads > 0.5) speed = CFG.adsSpeed;
      else if (this.sprinting) speed = CFG.sprintSpeed;
      speed *= w.def.speedMult;
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      const wx = (-sy * mf + cy * ms) * speed;
      const wz = (-cy * mf - sy * ms) * speed;
      const acc = (this.onGround ? CFG.groundAccel : CFG.airAccel) * dt;
      const ax = wx - this.vel.x, az = wz - this.vel.z;
      const al = Math.hypot(ax, az);
      if (al <= acc) { this.vel.x = wx; this.vel.z = wz; }
      else { this.vel.x += (ax / al) * acc; this.vel.z += (az / al) * acc; }
    }
    const eyeTarget = this.sliding ? CFG.eyeCrouch - 0.2 : this.crouching ? CFG.eyeCrouch : CFG.eyeStand;
    this.eyeH += (eyeTarget - this.eyeH) * Math.min(1, dt * 12);

    // ---- lean (Q / E): shifts the head sideways, not through walls
    const leanIn = (input.down('KeyE') ? 1 : 0) - (input.down('KeyQ') ? 1 : 0);
    const wantLean = this.sprinting || this.sliding ? 0 : leanIn;
    this.lean += (wantLean - this.lean) * Math.min(1, dt * 11);
    if (Math.abs(this.lean) < 0.002) this.lean = 0;
    let off = this.lean * LEAN_DIST;
    if (off !== 0) {
      const sgn = off > 0 ? 1 : -1;
      const rx = Math.cos(this.yaw) * sgn, rz = -Math.sin(this.yaw) * sgn;
      if (g.world.raycast(this.pos.x, this.pos.y + this.eyeH, this.pos.z, rx, 0, rz, Math.abs(off) + 0.22, _hit)) {
        off = sgn * Math.max(0, _hit.t - 0.22);
      }
    }
    this.leanOff = off;

    // ---- jump (with a little coyote time and input buffering)
    this.coyote = this.onGround ? 0.1 : this.coyote - dt;
    this.jumpBuffer = input.hit('Space') ? 0.12 : this.jumpBuffer - dt;
    const fallV = this.vel.y;
    this.vel.y = Math.max(-CFG.terminalVel, this.vel.y - CFG.gravity * dt);
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vel.y = CFG.jumpSpeed;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      g.audio.play('jump');
    }
    const wasGround = this.onGround;
    const px = this.pos.x, pz = this.pos.z;
    moveBody(g.world, this, dt);
    if (this.onGround && !wasGround && fallV < -6) {
      this.camDip = Math.min(0.28, -fallV * 0.014);
      g.viewmodel.land(-fallV);
      g.audio.play('land', null, Math.min(1, -fallV / 14));
      g.emitNoise(this.pos.x, this.pos.y, this.pos.z, 9, this, 'step');
    }

    // footsteps
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    const hs = moved / Math.max(dt, 1e-4);
    if (this.onGround && hs > 1 && !this.sliding) {
      this.stepDist += moved;
      this.bobPhase += moved * 1.45;
      if (this.stepDist > (this.sprinting ? 2.5 : 2.1)) {
        this.stepDist = 0;
        g.audio.play('step', null, this.crouching ? 0.35 : this.sprinting ? 1 : 0.7);
        if (!this.crouching) g.emitNoise(this.pos.x, this.pos.y, this.pos.z, this.sprinting ? 10 : 6, this, 'step');
      }
    }

    // ---- weapons: 1 = primary, 2 = pistol, wheel swaps, F = grenade
    if (input.hit('Digit1')) this.switchWeapon(0);
    if (input.hit('Digit2')) this.switchWeapon(1);
    if (input.wheel !== 0 && this.switchT <= 0) this.switchWeapon(this.weaponIdx === 0 ? 1 : 0);
    if (input.hit('KeyR')) this.startReload();
    if (input.hit('KeyF')) this.throwGrenade();
    this.tryFire(input.left, input.leftPressed, this.ads);
    // primary completely dry: fall back to the pistol
    const cw = this.weapon;
    if (cw.mag === 0 && cw.reserve === 0 && cw.reloadT <= 0 && this.switchT <= 0 && this.weaponIdx === 0) this.switchWeapon(1);
    this.updateWeapons(dt);

    // ---- recoil recovery
    const rk = Math.exp(-dt * 7);
    this.recoilP *= rk; this.recoilY *= rk;
    this.camDip *= Math.exp(-dt * 9);
    this.stepOffset *= Math.exp(-dt * 16);
    this.shake *= Math.exp(-dt * 8);

    this.updateCamera(dt, hs);

    g.viewmodel.update(dt, {
      weaponId: this.weapon.def.id,
      ads: this.ads,
      hidden: this.scoped,
      speed: this.onGround && !this.sliding ? hs : 0,
      onGround: this.onGround,
      sprinting: this.sprinting && hs > 6,
      sliding: this.sliding,
      reloadFrac: this.weapon.reloadT > 0 ? 1 - this.weapon.reloadT / this.weapon.def.reload : -1,
      switchT: this.switchT,
      mdx: input.mdx, mdy: input.mdy,
    });
  }

  updateCamera(dt, hs) {
    const g = this.game, cam = g.camera;
    const bobAmt = this.onGround && !this.sliding ? Math.min(1, hs / CFG.sprintSpeed) * (1 - this.ads * 0.8) : 0;
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.02 * bobAmt;
    const sh = this.shake;
    this.getEye(_v); // includes lean
    cam.position.set(
      _v.x + Math.cos(this.yaw) * bobX,
      _v.y + this.stepOffset + bobY - this.camDip,
      _v.z - Math.sin(this.yaw) * bobX,
    );
    // roll: strafe lean + Q/E lean + a tilt while sliding
    const side = this.vel.x * Math.cos(this.yaw) - this.vel.z * Math.sin(this.yaw);
    const rollTarget = -side * 0.004 - this.lean * 0.17 + (this.sliding ? 0.07 : 0);
    this.roll += (rollTarget - this.roll) * Math.min(1, dt * 10);
    cam.rotation.set(
      this.pitch + this.recoilP + (Math.random() - 0.5) * sh,
      this.yaw + this.recoilY + (Math.random() - 0.5) * sh,
      this.roll,
    );
    const base = verticalFov(g.settings.fov);
    const fast = (this.sprinting && hs > 6) || this.sliding;
    const target = base * (1 - this.ads * (1 - this.weapon.def.adsFov)) + (fast ? 5 : 0);
    const f = cam.fov + (target - cam.fov) * Math.min(1, dt * 12);
    if (Math.abs(f - cam.fov) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); }
  }

  updateDeathCam(dt) {
    const g = this.game, cam = g.camera;
    this.deathT += dt;
    this.scoped = false;
    this.leanOff = 0; this.lean = 0;
    const t = Math.min(1, this.deathT / 0.6);
    // slump to the floor, then turn to face whoever did it
    this.vel.x *= Math.exp(-dt * 5); this.vel.z *= Math.exp(-dt * 5);
    this.vel.y = Math.max(-CFG.terminalVel, this.vel.y - CFG.gravity * dt);
    this.height = CFG.heightCrouch;
    moveBody(g.world, this, dt);
    const eye = this.eyeH + (0.35 - this.eyeH) * (t * t * (3 - 2 * t));
    cam.position.set(this.pos.x, this.pos.y + eye, this.pos.z);
    let yaw = this.yaw, pitch = this.pitch * (1 - t);
    const k = this.killer;
    if (k && k !== this) {
      _v.set(k.pos.x - this.pos.x, k.pos.y + 1.2 - (this.pos.y + eye), k.pos.z - this.pos.z);
      const want = Math.atan2(-_v.x, -_v.z);
      let d = want - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 3);
      yaw = this.yaw;
      pitch = Math.atan2(_v.y, Math.hypot(_v.x, _v.z)) * t;
    }
    cam.rotation.set(pitch, yaw, t * 0.35);
    const vf = verticalFov(g.settings.fov);
    if (Math.abs(cam.fov - vf) > 0.01) { cam.fov = vf; cam.updateProjectionMatrix(); }
  }

  // ---- hooks
  onFired(def) {
    const ads = 1 - this.ads * 0.35;
    this.recoilP += def.recoil * ads * (this.crouching ? 0.8 : 1);
    this.recoilY += (Math.random() - 0.5) * def.recoil * 0.7 * ads;
    this.recoilP = Math.min(this.recoilP, 0.16);
    this.game.viewmodel.fire(def);
  }

  onThrow() { this.game.viewmodel.throwAnim(); }
  onReload(w) { this.game.audio.play('reload', null, 1, w.def.reload); }
  onSwitch() { this.game.audio.play('switch'); }
  onDryFire() { this.game.audio.play('dry'); }

  onDamaged(attacker, amount) {
    this.shake = Math.min(0.05, this.shake + amount * 0.0012);
    this.game.audio.play('hurt', null, Math.min(1, 0.5 + amount / 40));
    this.game.hud.damageFrom(attacker, amount);
  }

  onDeath(killer) {
    this.killer = killer;
    this.deathT = 0;
    this.ads = 0;
    this.sliding = false;
  }
}
