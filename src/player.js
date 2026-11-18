// The human player: movement (sprint, crouch, slide, lean), camera, weapon input.

import * as THREE from 'three';
import { Character } from './character.js';
import { CFG } from './config.js';
import { moveBody } from './physics.js';
import { verticalFov } from './settings.js';
import { GUN_LADDER } from './modes.js';
import { GRENADE } from './weapons.js';

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
    this.leanLatch = 0; // toggle-lean state: -1 left, 0 none, 1 right
  }

  spawnAt(x, y, z, yaw) {
    this.primary = this.game.settings.primary; // loadout choices apply on (re)spawn
    this.secondary = this.game.settings.secondary;
    this.tacId = this.game.settings.tactical;
    this.game.applyOwnSkins();
    super.spawnAt(x, y, z, yaw);
    const g = this.game;
    g.killcam.stop();
    if (g.rules.lives && !g.rules.objective && this.lives === 1 && this.deaths > 0) g.announcer.announce('Last Life');
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
    this.leanLatch = 0;
    this.specTarget = null;
    this.specCamOn = false;
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
    if (!this.alive) { this.updateDeathCam(dt, input); return; }
    const settings = g.settings;
    const w = this.weapon;

    // ---- look
    // aiming always wins over sprinting (the sprint picks up again when you let go)
    const wantAds = input.act('aim') && w.reloadT <= 0 && this.switchT <= 0;
    this.ads += ((wantAds ? 1 : 0) - this.ads) * Math.min(1, dt * (w.def.adsRate || 14));
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
    if (input.act('forward')) mf += 1;
    if (input.act('back')) mf -= 1;
    if (input.act('right')) ms += 1;
    if (input.act('left')) ms -= 1;
    const ml = Math.hypot(mf, ms);
    if (ml > 0) { mf /= ml; ms /= ml; }
    const shift = input.act('sprint');
    const crouchKey = input.act('crouch');
    const crouchHit = input.actHit('crouch');
    const speedNow = Math.hypot(this.vel.x, this.vel.z);

    // ---- slide: crouch while sprinting
    this.slideCd -= dt;
    let slideStarted = false;
    if (!this.sliding && crouchHit && this.onGround && this.slideCd <= 0 && speedNow > CFG.walkSpeed + 0.8) {
      slideStarted = true;
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
      // ends when it runs out, hits something, or you jump or press crouch again
      const cancel = (crouchHit && !slideStarted) || input.actHit('jump');
      if (this.slideT <= 0 || this.slideSpeed < CFG.crouchSpeed + 0.4 || this.hitWall || cancel) {
        this.sliding = false;
        this.slideCd = 0.45;
      }
    } else {
      this.setCrouch(crouchKey);
      // Firing or aiming pauses the sprint for as long as you keep doing it. The short
      // window after each shot stops tap-firing a semi-auto from flickering back to a sprint.
      const busy = input.act('fire') || input.act('aim') || w.sinceShot < 0.3 || this.meleeT > 0;
      this.sprinting = shift && mf > 0.5 && !this.crouching && !busy && this.ads < 0.3 && this.onGround;
      let speed = CFG.walkSpeed;
      if (this.crouching) speed = CFG.crouchSpeed;
      else if (this.ads > 0.5) speed = CFG.adsSpeed;
      else if (this.sprinting) speed = CFG.sprintSpeed;
      speed *= w.def.speedMult * (this.speedMul || 1);
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
    let leanIn;
    if (g.settings.leanToggle) {
      // tap to lean, tap the same key again to stand straight, tap the other key to switch sides
      if (input.actHit('leanLeft')) this.leanLatch = this.leanLatch === -1 ? 0 : -1;
      if (input.actHit('leanRight')) this.leanLatch = this.leanLatch === 1 ? 0 : 1;
      if (this.sprinting || this.sliding) this.leanLatch = 0;
      leanIn = this.leanLatch;
    } else {
      leanIn = (input.act('leanRight') ? 1 : 0) - (input.act('leanLeft') ? 1 : 0);
    }
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
    this.jumpBuffer = input.actHit('jump') ? 0.12 : this.jumpBuffer - dt;
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
      g.audio.play('land', null, Math.min(1, -fallV / 14), g.world.surfaceAt(this.pos.x, this.pos.y, this.pos.z));
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
        g.audio.play('step', null, this.crouching ? 0.35 : this.sprinting ? 1 : 0.7, g.world.surfaceAt(this.pos.x, this.pos.y, this.pos.z));
        if (!this.crouching) g.emitNoise(this.pos.x, this.pos.y, this.pos.z, this.sprinting ? 10 : 6, this, 'step');
      }
    }

    // ---- weapons: 1 = primary, 2 = pistol, wheel swaps, F = grenade
    if (input.actHit('primary')) this.switchWeapon(0);
    if (input.actHit('pistol')) this.switchWeapon(1);
    if (input.wheel !== 0 && this.switchT <= 0) this.switchWeapon(this.weaponIdx === 0 ? 1 : 0);
    if (input.actHit('reload')) this.startReload();
    this.updateCook(dt, input);
    if (input.actHit('knife')) this.knife();
    if (input.actHit('inspect')) this.game.viewmodel.inspect();
    this.tryFire(input.act('fire'), input.actHit('fire'), this.ads);
    const aw = this.weapon;
    if (aw.mag === 0 && aw.cooldown <= 0 && this.canReload()) this.startReload(); // empty: reload by itself
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
      // anything that needs the gun cancels an inspect
      busy: input.act('fire') || input.act('aim') || this.sprinting || this.sliding || this.weapon.reloadT > 0
        || this.switchT > 0 || this.meleeT > 0 || !!this.cook,
      cooking: !!this.cook,
      unarmed: !!(g.obj && g.obj.noGuns && g.obj.noGuns(this)),
      mag: this.weapon.mag,
    });
  }

  /**
   * Grenades: press to pull the pin, hold to cook, let go to throw. The fuse
   * burns while you hold it, so a cooked grenade goes off sooner after landing,
   * and one held for its whole fuse goes off in your hand.
   */
  updateCook(dt, input) {
    const g = this.game;
    if (!this.cook) {
      for (const [act, def] of [['grenade', GRENADE], ['tactical', this.tacDef]]) {
        if (!input.actHit(act) || this.nadesOf(def) <= 0 || this.grenadeT > 0 || this.meleeT > 0) continue;
        this.cook = { def, t: 0, act };
        this.weapon.reloadT = 0;
        g.audio.play('pin');
        break;
      }
      return;
    }
    const c = this.cook;
    c.t += dt;
    const left = c.def.fuse - c.t;
    if (left <= 0) {
      this.cook = null;
      this.throwGrenade(null, c.def, 0, true); // held too long
    } else if (!input.act(c.act)) {
      this.cook = null;
      this.throwGrenade(null, c.def, left);
    }
  }

  updateCamera(dt, hs) {
    const g = this.game, cam = g.camera;
    const calm = g.settings.reduceMotion ? 0.25 : 1; // Settings → Reduce camera motion
    const bobAmt = (this.onGround && !this.sliding ? Math.min(1, hs / CFG.sprintSpeed) * (1 - this.ads * 0.8) : 0) * calm;
    const bobY = Math.sin(this.bobPhase * 2) * 0.035 * bobAmt;
    const bobX = Math.cos(this.bobPhase) * 0.02 * bobAmt;
    const sh = this.shake * calm;
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

  updateDeathCam(dt, input) {
    const g = this.game, cam = g.camera;
    this.deathT += dt;
    if (g.killcam.active) return; // the kill cam has the camera
    // out of lives (or joined mid-round): follow the players still in it
    if (g.isOut(this) && (this.deathT > 2.5 || !this.killer)) { this.updateSpectate(dt, input); return; }
    this.specTarget = null;
    this.specCamOn = false;
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

  /**
   * Spectating: an over-the-shoulder camera on someone still alive. Fire / aim
   * cycle forwards / backwards, jump switches to the overhead view.
   */
  updateSpectate(dt, input) {
    const g = this.game, cam = g.camera;
    const live = g.chars.filter((c) => c !== this && c.alive);
    if (input && input.actHit('jump')) this.specOverhead = !this.specOverhead;
    if (!live.length || this.specOverhead) {
      this.specTarget = null;
      this.specCamOn = false;
      g.orbitCamera(dt, 0.05);
      return;
    }
    let i = live.indexOf(this.specTarget);
    let snap = false;
    if (i < 0) {
      // start on whoever got us, if they're still going
      i = Math.max(0, live.indexOf(this.killer));
      snap = true;
    }
    if (input && input.actHit('fire')) { i = (i + 1) % live.length; snap = true; }
    if (input && input.actHit('aim')) { i = (i - 1 + live.length) % live.length; snap = true; }
    const t = live[i];
    this.specTarget = t;
    this.yaw = t.yaw; // so sounds pan the way the camera faces
    // camera: behind and a little above their shoulder, pulled in if a wall is in the way
    t.getEye(_v);
    const ex = _v.x, ey = _v.y + 0.25, ez = _v.z;
    const pitch = Math.max(-0.7, Math.min(0.6, t.pitch));
    const cp = Math.cos(pitch);
    const fx = -Math.sin(t.yaw) * cp, fy = Math.sin(pitch), fz = -Math.cos(t.yaw) * cp;
    const rx = Math.cos(t.yaw), rz = -Math.sin(t.yaw);
    let bx = -fx * 3.2 + rx * 0.55, by = -fy * 3.2 + 0.35, bz = -fz * 3.2 + rz * 0.55;
    const bl = Math.hypot(bx, by, bz);
    bx /= bl; by /= bl; bz /= bl;
    let dist = bl;
    if (g.world.raycast(ex, ey, ez, bx, by, bz, bl + 0.3, _hit)) dist = Math.max(0.3, _hit.t - 0.3);
    const tx = ex + bx * dist, ty = ey + by * dist, tz = ez + bz * dist;
    const k = snap || !this.specCamOn ? 1 : 1 - Math.exp(-dt * 14);
    this.specCamOn = true;
    cam.position.set(
      cam.position.x + (tx - cam.position.x) * k,
      cam.position.y + (ty - cam.position.y) * k,
      cam.position.z + (tz - cam.position.z) * k,
    );
    cam.lookAt(ex + fx * 10, ey + fy * 10 - 0.4, ez + fz * 10);
    const vf = verticalFov(g.settings.fov);
    if (Math.abs(cam.fov - vf) > 0.01) { cam.fov = vf; cam.updateProjectionMatrix(); }
  }

  // ---- hooks
  onFired(def) {
    const ads = 1 - this.ads * 0.35;
    this.recoilP += def.recoil * ads * (this.crouching ? 0.8 : 1);
    this.recoilY += (Math.random() - 0.5) * def.recoil * 0.7 * ads;
    this.recoilP = Math.min(this.recoilP, 0.16);
    this.game.viewmodel.fire(def, Math.min(1, this.weapon.heat + def.heatPerShot));
  }

  onThrow() { this.game.viewmodel.throwAnim(); }
  onKnife() { this.game.viewmodel.knifeAnim(); }

  onGunLevel(lvl) {
    const def = this.weapon.def;
    this.game.announcer.announce(lvl === GUN_LADDER.length - 1 ? 'Final Weapon' : 'Level Up', def.name);
  }
  onReload(w) { this.game.audio.play('reload', null, 1, w.def.reload); }
  onSwitch() { this.game.audio.play('switch'); }
  onDryFire() { this.game.audio.play('dry'); }

  onDamaged(attacker, amount) {
    this.shake = Math.min(0.05, this.shake + amount * 0.0012);
    this.game.audio.play('hurt', null, Math.min(1, 0.5 + amount / 40));
    this.game.hud.damageFrom(attacker, amount);
  }

  onDeath(killer) {
    if (this.cook) {
      // a grenade in your hand when you die drops at your feet
      const c = this.cook;
      this.cook = null;
      this.throwGrenade(null, c.def, Math.max(0, c.def.fuse - c.t), true);
    }
    if (this.game.hud.flashT > 0.4) this.game.hud.flashT = 0.4; // don't watch the kill cam in a white-out
    this.killer = killer;
    this.deathT = 0;
    this.game.killcam.begin(killer, this);
    this.ads = 0;
    this.sliding = false;
  }
}
