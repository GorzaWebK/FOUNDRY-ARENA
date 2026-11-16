// Health / armour / ammo / weapon pickups that respawn on a timer.

import * as THREE from 'three';
import { CFG } from './config.js';
import { glowTexture } from './textures.js';

export const PICKUP_TYPES = {
  health: { label: '+50 Health', color: 0x4dff88, respawn: 30, tone: 520 },
  armor: { label: '+50 Armour', color: 0x4db8ff, respawn: 30, tone: 440 },
  ammo: { label: 'Ammo', color: 0xffd24d, respawn: 20, tone: 620 },
  rifle: { label: 'Rifle ammo crate', color: 0xff9a3d, respawn: 30, tone: 660 },
  shotgun: { label: 'Shotgun shells', color: 0xff5f5f, respawn: 30, tone: 580 },
};

function mat(color, emissive = 0) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.6 });
}
function bx(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

function buildModel(type) {
  const g = new THREE.Group();
  const c = PICKUP_TYPES[type].color;
  if (type === 'health') {
    g.add(bx(0.5, 0.36, 0.5, mat(0xf2f5f7, 0x333333)));
    const green = mat(0x1fbf5a, 0x1fbf5a);
    g.add(bx(0.34, 0.1, 0.1, green, 0, 0, 0.26), bx(0.1, 0.3, 0.1, green, 0, 0, 0.26));
    g.add(bx(0.34, 0.1, 0.1, green, 0, 0, -0.26), bx(0.1, 0.3, 0.1, green, 0, 0, -0.26));
    g.add(bx(0.34, 0.06, 0.1, green, 0, 0.19, 0), bx(0.1, 0.06, 0.34, green, 0, 0.19, 0));
  } else if (type === 'armor') {
    const blue = mat(0x2f8fe0, 0x1a5fa8);
    g.add(bx(0.5, 0.42, 0.12, blue, 0, 0.04, 0));
    g.add(bx(0.34, 0.2, 0.12, blue, 0, -0.24, 0));
    g.add(bx(0.16, 0.12, 0.12, blue, 0, -0.38, 0));
    g.add(bx(0.2, 0.2, 0.16, mat(0xe8f4ff, 0x88bbee), 0, 0.04, 0));
  } else if (type === 'ammo') {
    g.add(bx(0.5, 0.3, 0.32, mat(0x5a6b3a, 0x1c2410)));
    g.add(bx(0.52, 0.06, 0.34, mat(0xffd24d, 0xaa8a20), 0, 0.08, 0));
    g.add(bx(0.2, 0.05, 0.08, mat(0x222222), 0, 0.18, 0));
  } else {
    // weapon silhouette
    const dark = mat(0x2a2d33, 0x111111);
    const acc = mat(c, c);
    if (type === 'rifle') {
      g.add(bx(0.07, 0.11, 0.5, dark), bx(0.04, 0.04, 0.3, dark, 0, 0.01, -0.38), bx(0.05, 0.2, 0.08, acc, 0, -0.14, -0.05));
      g.add(bx(0.06, 0.1, 0.24, dark, 0, -0.02, 0.36), bx(0.05, 0.12, 0.06, dark, 0, -0.1, 0.16));
    } else {
      g.add(bx(0.07, 0.1, 0.36, dark), bx(0.05, 0.05, 0.5, dark, 0, 0.02, -0.42), bx(0.08, 0.07, 0.2, acc, 0, -0.04, -0.34));
      g.add(bx(0.06, 0.1, 0.3, mat(0x7a5230, 0x2a1a0c), 0, -0.04, 0.32));
    }
    g.rotation.z = 0.25;
  }
  return g;
}

export class Pickup {
  constructor(def, scene) {
    this.type = def.type;
    this.info = PICKUP_TYPES[def.type];
    this.pos = new THREE.Vector3(def.pos[0], def.pos[1], def.pos[2]);
    this.active = true;
    this.respawnT = 0;
    this.phase = Math.random() * 6;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.model = buildModel(this.type);
    this.model.position.y = 0.75;
    this.group.add(this.model);
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.62, 0.06, 20),
      new THREE.MeshLambertMaterial({ color: 0x2b3038, emissive: this.info.color, emissiveIntensity: 0.25 }),
    );
    pad.position.y = 0.03;
    pad.receiveShadow = true;
    this.pad = pad;
    this.group.add(pad);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: this.info.color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }));
    this.halo.position.y = 0.75;
    this.halo.scale.setScalar(1.5);
    this.group.add(this.halo);
    scene.add(this.group);
  }

  reset() {
    this.active = true;
    this.respawnT = 0;
    this.model.visible = true;
    this.halo.visible = true;
  }

  /** Would this pickup do anything for the character? */
  usefulTo(c) {
    switch (this.type) {
      case 'health': return c.health < CFG.maxHealth;
      case 'armor': return c.armor < CFG.maxArmor;
      case 'rifle': return c.weapons[1].reserve < c.weapons[1].def.reserveMax;
      case 'shotgun': return c.weapons[2].reserve < c.weapons[2].def.reserveMax;
      case 'ammo':
        return c.weapons[1].reserve < c.weapons[1].def.reserveMax || c.weapons[2].reserve < c.weapons[2].def.reserveMax;
      default: return false;
    }
  }

  apply(c) {
    const add = (i, n) => { const w = c.weapons[i]; w.reserve = Math.min(w.def.reserveMax, w.reserve + n); };
    switch (this.type) {
      case 'health': c.health = Math.min(CFG.maxHealth, c.health + 50); break;
      case 'armor': c.armor = Math.min(CFG.maxArmor, c.armor + 50); break;
      case 'rifle': add(1, 60); break;
      case 'shotgun': add(2, 12); break;
      case 'ammo': add(1, 30); add(2, 6); break;
      default: break;
    }
  }

  take() {
    this.active = false;
    this.respawnT = this.info.respawn;
    this.model.visible = false;
    this.halo.visible = false;
  }

  update(dt, time) {
    if (!this.active) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.reset();
      this.pad.material.emissiveIntensity = 0.05;
      return;
    }
    const t = time * 2 + this.phase;
    this.model.rotation.y = t * 0.9;
    this.model.position.y = 0.75 + Math.sin(t) * 0.08;
    this.pad.material.emissiveIntensity = 0.3 + Math.sin(t * 1.5) * 0.12;
  }
}
