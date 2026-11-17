// Shared state + weapon handling for the player and the bots.

import * as THREE from 'three';
import { CFG } from './config.js';
import { makeLoadout, SWITCH_TIME, GRENADE, KNIFE, DEFAULT_PRIMARY, DEFAULT_TACTICAL, TACTICAL_BY_ID } from './weapons.js';
import { gunLevel } from './modes.js';
import { hasHeadroom } from './physics.js';

export class Character {
  constructor(game, id, name, color, isPlayer) {
    this.game = game;
    this.id = id;
    this.name = name;
    this.color = color;
    this.baseColor = color; // own colour (team modes paint characters in team colours)
    this.team = -1;
    this.lives = 0;
    this.streak = 0; // kills since last death
    this.multi = 0; // kills in quick succession
    this.lastKillT = -99;
    this.gunLevel = 0;
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
    this.tacId = DEFAULT_TACTICAL; // loadout choice: flashbang or smoke
    this.tacDef = TACTICAL_BY_ID[this.tacId];
    this.tactical = this.tacDef.start;
    this.skins = {}; // weapon id -> skin id (cosmetic)
    this.cook = null; // { def, t }: a grenade in hand with its pin pulled
    this.blindUntil = 0; // flashbanged until this game time
    this.grenadeT = 0; // throw cooldown
    this.knifeT = 0; // knife cooldown
    this.meleeT = 0; // swing in progress: can't shoot
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
    this.health = this.game.maxHealth;
    this.armor = 0;
    this.alive = true;
    this.protectedUntil = this.game.time + CFG.spawnProtection;
    this.gunLevel = gunLevel(this.kills);
    this.weapons = this.game.loadoutFor(this);
    this.weaponIdx = 0;
    this.switchT = 0;
    this.grenades = GRENADE.start;
    this.tacDef = TACTICAL_BY_ID[this.tacId] || TACTICAL_BY_ID[DEFAULT_TACTICAL];
    this.tactical = this.tacDef.start;
    this.cook = null;
    this.blindUntil = 0;
    this.grenadeT = 0;
    this.knifeT = 0;
    this.meleeT = 0;
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
    if (this.knifeT > 0) this.knifeT -= dt;
    if (this.meleeT > 0) this.meleeT -= dt;
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
    return !!w && (w.mag > 0 || w.reserve > 0);
  }

  /** The skin this character's `weaponId` wears. */
  skinOf(weaponId) { return (this.skins && this.skins[weaponId]) || 'none'; }

  /** What a third-person model should show: [in hand, stowed, 'hip' | 'back', hand skin, stowed skin]. */
  gear() {
    const ws = this.weapons, held = this.weapon.def.id;
    if (ws.length < 2) return [held, null, null, this.skinOf(held), 'none'];
    const stowed = this.weaponIdx === 0 ? ws[1].def.id : ws[0].def.id;
    return [held, stowed, this.weaponIdx === 0 ? 'hip' : 'back', this.skinOf(held), this.skinOf(stowed)];
  }

  /** Gun game: hand out the gun this kill count has earned. */
  applyGunLevel() {
    if (!this.game.rules.gunGame || !this.alive) return;
    const lvl = gunLevel(this.kills);
    if (lvl === this.gunLevel) return;
    this.gunLevel = lvl;
    this.weapons = this.game.loadoutFor(this);
    this.weaponIdx = 0;
    this.switchT = SWITCH_TIME;
    this.onSwitch();
    this.onGunLevel(lvl);
  }

  /**
   * Pull the trigger. `held` = trigger is down, `pressed` = it went down this
   * frame (semi-auto weapons only fire on a press). Returns true if a shot left.
   */
  tryFire(held, pressed, ads = 0) {
    const w = this.weapon;
    if (!held || this.switchT > 0 || w.reloadT > 0 || w.cooldown > 0 || this.meleeT > 0 || this.cook) return false;
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

  /** Quick knife attack. Cancels a reload; the gun is back in your hands right after. */
  knife() {
    if (!this.alive || this.knifeT > 0 || this.cook) return false;
    this.knifeT = KNIFE.cooldown;
    this.meleeT = KNIFE.busy;
    this.weapon.reloadT = 0;
    this.protectedUntil = 0; // attacking ends spawn protection
    this.game.knifeAttack(this);
    this.onKnife();
    return true;
  }

  /** How many of this kind of grenade are left. */
  nadesOf(def) { return def === GRENADE ? this.grenades : def === this.tacDef ? this.tactical : 0; }

  /**
   * Throw a grenade along the aim direction (or `dir`, if given). `fuse` is what's
   * left of it (less when cooked); `drop` lets go of it instead of throwing.
   */
  throwGrenade(dir = null, def = GRENADE, fuse = def.fuse, drop = false) {
    if (!this.alive && !drop) return false;
    if (this.nadesOf(def) <= 0 || (this.grenadeT > 0 && !drop)) return false;
    if (def === GRENADE) this.grenades--;
    else this.tactical--;
    this.grenadeT = def.cooldown;
    this.protectedUntil = 0;
    this.game.throwGrenade(this, dir, def, fuse, drop);
    if (!drop) this.onThrow();
    return true;
  }

  isBlind() { return this.game.time < this.blindUntil; }

  // hooks
  onKnife() {}
  onGunLevel() {}
  onThrow() {}
  onReload() {}
  onSwitch() {}
  onDryFire() {}
  onFired() {}
  onDamaged() {}
  onDeath() {}
  onKill() {}
}
