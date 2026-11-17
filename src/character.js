// Shared state + weapon handling for the player and the bots.

import * as THREE from 'three';
import { CFG } from './config.js';
import { makeLoadout, SWITCH_TIME, GRENADE, DEFAULT_PRIMARY } from './weapons.js';
import { hasHeadroom } from './physics.js';

export class Character {
  constructor(game, id, name, color, isPlayer) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.color = color;
    this.isPlayer = isPlayer; // the person at this keyboard
    this.isHuman = isPlayer; // any human (local or remote), as opposed to a bot

    // physics body
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.radius = CFG.radius;
    this.height = CFG.heightStand;
    this.onGround = false;
    this.hitWall = false;
    this.stepOffset = 0;
    this.extX = 0;
    this.extZ = 0;

    this.yaw = 0;
    this.pitch = 0;
    this.crouching = false;
    this.eyeH = CFG.eyeStand;

    this.health = CFG.maxHealth;
    this.armor = 0;
    this.alive = false;
    this.respawnAt = 0;
    this.protectedUntil = 0;
    this.kills = 0;
    this.deaths = 0;
    this.lastHurtBy = null;
    this.lastHurtT = -99;

    this.primary = DEFAULT_PRIMARY; // loadout choice, applied on (re)spawn
    this.weapons = makeLoadout(this.primary); // [primary, pistol]
    this.weaponIdx = 0;
    this.switchT = 0;
    this.grenades = GRENADE.start;
    this.grenadeT = 0; // throw cooldown
    this.lean = 0; // -1 (left) .. 1 (right)
    this.leanOff = 0; // metres the head is actually shifted sideways
    this.stepDist = 0;
  }

  get weapon() { return this.weapons[this.weaponIdx]; }

  isProtected() { return this.game.time < this.protectedUntil; }

  /** Eye position, including any sideways lean. */
  getEye(out) {
    const o = this.leanOff;
    return out.set(
      this.pos.x + Math.cos(this.yaw) * o,
      this.pos.y + this.eyeH - Math.abs(o) * 0.14,
      this.pos.z - Math.sin(this.yaw) * o,
    );
  }

  aimDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /** World position tracers start from. */
  getMuzzle(out) {
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    return out.set(
      this.pos.x + cy * 0.16 - sy * 0.55,
      this.pos.y + this.eyeH - 0.18,
      this.pos.z - sy * 0.16 - cy * 0.55,
    );
  }

  spawnAt(x, y, z, yaw) {
    this.pos.set(x, y + 0.01, z);
    this.vel.set(0, 0, 0);
    this.extX = this.extZ = 0;
    this.stepOffset = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.crouching = false;
    this.height = CFG.heightStand;
    this.eyeH = CFG.eyeStand;
    this.onGround = false;
    this.health = CFG.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.protectedUntil = this.game.time + CFG.spawnProtection;
    this.weapons = makeLoadout(this.primary);
    this.weaponIdx = 0;
    this.switchT = 0;
    this.grenades = GRENADE.start;
    this.grenadeT = 0;
    this.lean = 0;
    this.leanOff = 0;
    this.lastHurtBy = null;
  }

  setCrouch(want) {
    if (want === this.crouching) return;
    if (want) {
      this.crouching = true;
      this.height = CFG.heightCrouch;
    } else if (hasHeadroom(this.game.world, this, CFG.heightStand)) {
      this.crouching = false;
      this.height = CFG.heightStand;
    }
  }

  /** Current cone half-angle (radians) for a shot. */
  currentSpread(ads = 0) {
    const w = this.weapon, def = w.def;
    let s = def.spreadMin + (def.spreadMax - def.spreadMin) * w.heat;
    if (def.pellets === 1) {
      const speed = Math.hypot(this.vel.x, this.vel.z);
      s *= 1 + Math.min(1, speed / CFG.sprintSpeed) * def.moveSpread;
      if (!this.onGround) s *= 2.2;
      if (this.crouching) s *= 0.7;
    }
    return s * (1 - ads * (1 - def.adsSpread));
  }

  updateWeapons(dt) {
    if (this.switchT > 0) this.switchT = Math.max(0, this.switchT - dt);
    if (this.grenadeT > 0) this.grenadeT -= dt;
    for (let i = 0; i < this.weapons.length; i++) {
      const w = this.weapons[i];
      if (w.cooldown > 0) w.cooldown -= dt;
      w.sinceShot += dt;
      if (w.sinceShot > w.def.interval + 0.08 && w.heat > 0) w.heat = Math.max(0, w.heat - w.def.heatDecay * dt);
      if (w.reloadT > 0) {
        if (i !== this.weaponIdx) { w.reloadT = 0; continue; }
        w.reloadT -= dt;
        if (w.reloadT <= 0) {
          w.reloadT = 0;
          const need = w.def.magSize - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take;
          if (w.reserve !== Infinity) w.reserve -= take;
        }
      }
    }
  }

  canReload() {
    const w = this.weapon;
    return w.reloadT <= 0 && this.switchT <= 0 && w.mag < w.def.magSize && w.reserve > 0;
  }

  startReload() {
    if (!this.canReload()) return false;
    const w = this.weapon;
    w.reloadT = w.def.reload;
    this.onReload(w);
    return true;
  }

  switchWeapon(idx) {
    if (idx === this.weaponIdx || idx < 0 || idx >= this.weapons.length) return false;
    this.weapon.reloadT = 0;
    this.weaponIdx = idx;
    this.switchT = SWITCH_TIME;
    this.onSwitch();
    return true;
  }

  hasAmmo(idx) {
    const w = this.weapons[idx];
    return w.mag > 0 || w.reserve > 0;
  }

  /**
   * Pull the trigger. `held` = trigger is down, `pressed` = it went down this
   * frame (semi-auto weapons only fire on a press). Returns true if a shot left.
   */
  tryFire(held, pressed, ads = 0) {
    const w = this.weapon;
    if (!held || this.switchT > 0 || w.reloadT > 0 || w.cooldown > 0) return false;
    if (!w.def.auto && !pressed) return false;
    if (w.mag <= 0) {
      if (pressed) this.onDryFire();
      this.startReload();
      return false;
    }
    w.mag--;
    w.cooldown = w.def.interval;
    this.game.fireWeapon(this, w, ads);
    w.heat = Math.min(1, w.heat + w.def.heatPerShot);
    w.sinceShot = 0;
    return true;
  }

  /** Throw a grenade along the aim direction (or `dir`, if given). */
  throwGrenade(dir = null) {
    if (!this.alive || this.grenades <= 0 || this.grenadeT > 0) return false;
    this.grenades--;
    this.grenadeT = GRENADE.cooldown;
    this.game.throwGrenade(this, dir);
    this.onThrow();
    return true;
  }

  // hooks
  onThrow() {}
  onReload() {}
  onSwitch() {}
  onDryFire() {}
  onFired() {}
  onDamaged() {}
  onDeath() {}
  onKill() {}
}
