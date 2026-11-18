// Health / armour / ammo / supply-crate pickups that respawn on a timer.

import * as THREE from 'three';
import { CFG } from './config.js';
import { GRENADE } from './weapons.js';
import { glowTexture } from './textures.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PICKUP_TYPES = {
  health: { label: '+50 Health', color: 0x4dff88, respawn: 30, tone: 520 },
  armor: { label: '+50 Armour', color: 0x4db8ff, respawn: 30, tone: 440 },
  ammo: { label: 'Ammo + grenade', color: 0xffd24d, respawn: 20, tone: 620 },
  crate: { label: 'Supply crate: full ammo + grenades', color: 0xff9a3d, respawn: 30, tone: 660 },
};

/** Older map files used per-weapon crates. */
const ALIAS = { rifle: 'crate', shotgun: 'crate' };

function mat(color, emissive = 0) {
  return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.6 });
}
function bx(w, h, d, m, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  return mesh;
}

/** One mesh per material (fewer draw calls); the models are built once per type and shared. */
const modelCache = new Map();
function buildModel(type) {
  if (!modelCache.has(type)) {
    const src = buildParts(type), parts = [];
    const byMat = new Map();
    for (const m of src.children) { if (!byMat.has(m.material)) byMat.set(m.material, []); byMat.get(m.material).push(m); }
    for (const [mat, list] of byMat) {
      const geos = list.map((m) => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); });
      parts.push([mergeGeometries(geos, false), mat]);
      for (const m of list) m.geometry.dispose();
      for (const gg of geos) gg.dispose();
    }
    modelCache.set(type, parts);
  }
  const g = new THREE.Group();
  for (const [geo, mat] of modelCache.get(type)) g.add(new THREE.Mesh(geo, mat));
  return g;
}

function buildParts(type) {
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
    // supply crate
    const body = mat(0x3d4652, 0x14181d);
    const acc = mat(c, c);
    g.add(bx(0.62, 0.4, 0.44, body));
    g.add(bx(0.64, 0.07, 0.46, acc, 0, 0.1, 0), bx(0.64, 0.07, 0.46, acc, 0, -0.1, 0));
    g.add(bx(0.16, 0.12, 0.48, mat(0x1c2026), 0, 0, 0));
    g.add(bx(0.3, 0.06, 0.1, mat(0x1c2026), 0, 0.23, 0));
  }
  return g;
}

export class Pickup {
  constructor(def, scene) {
    this.type = ALIAS[def.type] || def.type;
    this.info = PICKUP_TYPES[this.type];
    this.scene = scene;
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
    const prim = c.weapons[0];
    switch (this.type) {
      case 'health': return c.health < c.game.maxHealth;
      case 'armor': return c.armor < CFG.maxArmor;
      case 'ammo':
      case 'crate':
        return prim.reserve < prim.def.reserveMax || c.grenades < GRENADE.max;
      default: return false;
    }
  }

  apply(c) {
    const prim = c.weapons[0];
    switch (this.type) {
      case 'health': c.health = Math.min(c.game.maxHealth, c.health + 50); break;
      case 'armor': c.armor = Math.min(CFG.maxArmor, c.armor + 50); break;
      case 'ammo':
        prim.reserve = Math.min(prim.def.reserveMax, prim.reserve + prim.def.ammoBox);
        c.grenades = Math.min(GRENADE.max, c.grenades + 1);
        break;
      case 'crate':
        prim.reserve = prim.def.reserveMax;
        c.grenades = GRENADE.max;
        if (c.tacDef) c.tactical = c.tacDef.max;
        break;
      default: break;
    }
  }

  take() {
    this.active = false;
    this.respawnT = this.info.respawn;
    this.model.visible = false;
    this.halo.visible = false;
  }

  /** Multiplayer clients: follow the host's word on whether this is available. */
  setActive(v) {
    if (v && !this.active) this.reset();
    else if (!v && this.active) this.take();
  }

  /** `authoritative` is false on multiplayer clients (the host runs the respawn timers). */
  update(dt, time, authoritative = true) {
    if (!this.active) {
      if (authoritative) {
        this.respawnT -= dt;
        if (this.respawnT <= 0) this.reset();
      }
      this.pad.material.emissiveIntensity = 0.05;
      return;
    }
    const t = time * 2 + this.phase;
    this.model.rotation.y = t * 0.9;
    this.model.position.y = 0.75 + Math.sin(t) * 0.08;
    this.pad.material.emissiveIntensity = 0.3 + Math.sin(t * 1.5) * 0.12;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.parent === this.model) return; // the model is shared by every pickup of its type
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
}
