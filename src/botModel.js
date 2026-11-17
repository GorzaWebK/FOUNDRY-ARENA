// Low-poly humanoid made of boxes, with a name tag and simple procedural animation.

import * as THREE from 'three';
import { nameTexture, flashTexture } from './textures.js';
import { worldGun } from './gunModels.js';

const GUN_SCALE = 0.95;
const HAND = new THREE.Vector3(0.14, 0.4, -0.38); // right hand, in upper-body space

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SHIELD = new THREE.SphereGeometry(1, 24, 16);

function part(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export class BotModel {
  constructor(name, color) {
    const c = new THREE.Color(color);
    const body = new THREE.MeshLambertMaterial({ color: c });
    const dark = new THREE.MeshLambertMaterial({ color: c.clone().multiplyScalar(0.45) });
    const skin = new THREE.MeshLambertMaterial({ color: 0x9aa3ad });
    const visor = new THREE.MeshLambertMaterial({ color: 0x101418, emissive: c, emissiveIntensity: 0.9 });
    const gun = new THREE.MeshLambertMaterial({ color: 0x23262b });
    this.mats = [body, dark, skin, visor, gun];
    this.name = name;
    this.color = color;

    this.group = new THREE.Group();
    this.tilt = new THREE.Group(); // falls over on death
    this.group.add(this.tilt);

    // legs (pivot at the hip)
    this.legL = new THREE.Group(); this.legL.position.set(-0.12, 0.88, 0);
    this.legR = new THREE.Group(); this.legR.position.set(0.12, 0.88, 0);
    part(this.legL, 0.17, 0.88, 0.2, dark, 0, -0.44, 0);
    part(this.legR, 0.17, 0.88, 0.2, dark, 0, -0.44, 0);
    this.tilt.add(this.legL, this.legR);

    // upper body (pivot at the waist so it can pitch with the aim)
    this.upper = new THREE.Group();
    this.upper.position.y = 0.9;
    this.tilt.add(this.upper);
    part(this.upper, 0.48, 0.6, 0.27, body, 0, 0.3, 0);
    part(this.upper, 0.5, 0.14, 0.29, dark, 0, 0.02, 0);
    part(this.upper, 0.3, 0.3, 0.16, dark, 0, 0.36, 0.2); // backpack
    this.head = part(this.upper, 0.27, 0.27, 0.27, skin, 0, 0.76, 0);
    part(this.upper, 0.29, 0.1, 0.06, visor, 0, 0.78, -0.13);
    part(this.upper, 0.29, 0.08, 0.29, body, 0, 0.9, 0); // helmet top
    // arms reaching forward to the gun
    const armR = part(this.upper, 0.13, 0.13, 0.5, body, 0.27, 0.42, -0.2);
    armR.rotation.y = 0.25;
    const armL = part(this.upper, 0.13, 0.13, 0.55, body, -0.2, 0.4, -0.28);
    armL.rotation.y = -0.55;
    // weapons: one in the hands, the other stowed (pistol on the hip, or primary on the back)
    this.heldMount = new THREE.Group();
    this.heldMount.position.copy(HAND);
    this.heldMount.scale.setScalar(GUN_SCALE);
    this.upper.add(this.heldMount);
    this.hips = new THREE.Group(); // follows the waist when crouching, but not the aim pitch
    this.tilt.add(this.hips);
    this.holster = part(this.hips, 0.055, 0.15, 0.085, gun, 0.285, -0.12, 0.02);
    this.hipMount = new THREE.Group();
    this.hipMount.position.set(0.29, -0.04, 0.02);
    this.hipMount.rotation.x = -Math.PI / 2 + 0.12; // muzzle down, grip up and back
    this.hipMount.scale.setScalar(GUN_SCALE);
    this.hips.add(this.hipMount);
    this.backMount = new THREE.Group(); // slung diagonally across the backpack
    this.backMount.position.set(0, 0.34, 0.31);
    this.backMount.rotation.z = 0.62;
    this.backMount.scale.setScalar(GUN_SCALE);
    const backUp = new THREE.Group();
    backUp.rotation.x = Math.PI / 2; // barrel up
    this.backInner = new THREE.Group();
    this.backInner.rotation.z = Math.PI / 2; // side flat against the back
    backUp.add(this.backInner);
    this.backMount.add(backUp);
    this.upper.add(this.backMount);
    this.gearKey = '';

    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture(), color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, fog: false,
    }));
    this.flash.position.set(0.14, 0.42, -0.9);
    this.flash.scale.setScalar(0.55);
    this.flash.visible = false;
    this.upper.add(this.flash);
    this.flashT = 0;

    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name, color), transparent: true, depthWrite: false, fog: false }));
    this.tag.position.y = 2.2;
    this.tag.scale.set(1.5, 0.375, 1);
    this.group.add(this.tag);

    this.shield = new THREE.Mesh(SHIELD, new THREE.MeshBasicMaterial({
      color: 0x3aa0ff, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.shield.scale.set(0.75, 1.05, 0.75);
    this.shield.position.y = 0.95;
    this.shield.visible = false;
    this.group.add(this.shield);

    this.walk = 0;
    this.meleeT = 0;
    this.deadT = 0;
    this.crouchT = 0;
  }

  /** Repaint the body and name tag (team colours). */
  setColor(color, name = this.name) {
    if (color === this.color && name === this.name) return;
    this.color = color;
    this.name = name;
    const c = new THREE.Color(color);
    this.mats[0].color.copy(c);
    this.mats[1].color.copy(c).multiplyScalar(0.45);
    this.mats[3].emissive.copy(c);
    this.tag.material.map.dispose();
    this.tag.material.map = nameTexture(name, color);
    this.tag.material.needsUpdate = true;
  }

  /** Knife jab: the upper body twists into it. */
  melee() { this.meleeT = 0.32; }

  /** Show `held` in the hands and `stowed` on the hip or back (`slot`). */
  setGear(held, stowed, slot) {
    const key = `${held}|${stowed}|${slot}`;
    if (key === this.gearKey) return;
    this.gearKey = key;
    this.heldMount.clear();
    this.hipMount.clear();
    this.backInner.clear();
    if (held) {
      const g = worldGun(held);
      const pt = g.userData.points;
      g.position.copy(pt.grip).negate(); // grip in the hand
      this.heldMount.add(g);
      this.flash.position.set(
        HAND.x + (pt.muzzle.x - pt.grip.x) * GUN_SCALE,
        HAND.y + (pt.muzzle.y - pt.grip.y) * GUN_SCALE,
        HAND.z + (pt.muzzle.z - pt.grip.z) * GUN_SCALE - 0.05,
      );
    }
    this.holster.visible = !!stowed && slot === 'hip';
    if (stowed) {
      const g = worldGun(stowed);
      const pt = g.userData.points;
      if (slot === 'hip') {
        g.position.set(0, 0.02, 0);
        this.hipMount.add(g);
      } else {
        g.position.copy(pt.center).negate();
        this.backInner.add(g);
      }
    }
  }

  muzzleFlash() {
    this.flashT = 0.06;
    this.flash.material.rotation = Math.random() * 6.28;
  }

  reset() {
    this.group.visible = true;
    this.tilt.rotation.set(0, 0, 0);
    this.tilt.position.y = 0;
    this.tag.visible = true;
    this.deadT = 0;
  }

  /** s = { x,y,z, yaw, pitch, speed, onGround, crouch, protected, alive, time } */
  update(dt, s) {
    const g = this.group;
    if (!s.alive) {
      if (!g.visible) return;
      this.deadT += dt;
      const t = Math.min(1, this.deadT / 0.45);
      this.tilt.rotation.x = t * t * (Math.PI / 2) * 0.96;
      this.tilt.position.y = t * 0.12;
      this.tag.visible = false;
      this.shield.visible = false;
      this.flash.visible = false;
      if (this.deadT > 2.2) g.visible = false;
      return;
    }
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.yaw;
    if (s.gear) this.setGear(s.gear[0], s.gear[1], s.gear[2]);

    this.crouchT += ((s.crouch ? 1 : 0) - this.crouchT) * Math.min(1, dt * 10);
    const cr = this.crouchT;
    const legScale = 1 - cr * 0.42;
    this.legL.scale.y = this.legR.scale.y = legScale;
    this.legL.position.y = this.legR.position.y = 0.88 * legScale + 0.0;
    this.upper.position.y = 0.9 - cr * 0.52;
    this.hips.position.y = this.upper.position.y;
    this.tag.position.y = 2.2 - cr * 0.5;

    if (s.onGround && s.speed > 0.4) this.walk += dt * (3 + s.speed * 1.5);
    const swing = s.onGround ? Math.sin(this.walk) * Math.min(0.75, s.speed * 0.13) : 0.35;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = s.onGround ? -swing : -0.25;
    this.upper.rotation.x = s.pitch * 0.75;
    const lean = s.lean || 0; // Q/E lean: tip the torso sideways
    this.upper.rotation.z = -lean * 0.4;
    this.upper.position.x = lean * 0.22;
    if (this.meleeT > 0) {
      this.meleeT -= dt;
      const jab = Math.sin(Math.max(0, this.meleeT / 0.32) * Math.PI);
      this.upper.rotation.y = jab * 0.7;
      this.upper.rotation.x += jab * 0.35;
    } else {
      this.upper.rotation.y = 0;
    }
    this.upper.position.y += s.onGround ? Math.abs(Math.cos(this.walk)) * Math.min(0.04, s.speed * 0.008) : 0;

    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = true; } else this.flash.visible = false;

    this.shield.visible = s.protected;
    if (s.protected) this.shield.material.opacity = 0.13 + Math.sin(s.time * 12) * 0.06;
  }

  dispose(scene) {
    scene.remove(this.group);
    for (const m of this.mats) m.dispose();
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.flash.material.dispose();
    this.shield.material.dispose();
  }
}
