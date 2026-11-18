// Crossbow bolts: real projectiles that fly and drop, unlike every other gun's
// hitscan bullet. The match authority (solo game / host) runs bolts that hurt;
// everyone else runs look-alike bolts for the visuals (`auth` false). A bolt
// that hits a wall sticks in it for a while.

import * as THREE from 'three';
import { CFG } from './config.js';

const STUCK_LIFE = 8;
const MAX_LIFE = 4;

const _hit = { t: 0, nx: 0, ny: 0, nz: 0 };
const _ch = { t: 0, head: false };
const _q = new THREE.Quaternion();
const _f = new THREE.Vector3(0, 0, -1);
const _v = new THREE.Vector3();

function boltMesh() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.42, 5).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x454b53, roughness: 0.6 }));
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.045, 5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb8bec6, roughness: 0.3, metalness: 0.8 }));
  tip.position.z = -0.23;
  const finM = new THREE.MeshStandardMaterial({ color: 0xff8a2a, roughness: 0.6, side: THREE.DoubleSide });
  const f1 = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.06), finM); f1.rotation.x = -Math.PI / 2; f1.position.z = 0.17;
  const f2 = f1.clone(); f2.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  g.add(shaft, tip, f1, f2);
  return g;
}

export class Bolts {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.template = boltMesh();
  }

  /**
   * Loose a bolt from (ox, oy, oz) along unit (dx, dy, dz). `from` = where it
   * appears to leave the gun (the muzzle): the visual starts there and joins the
   * real path within a moment. `auth` = this one can hurt.
   */
  fire(shooter, def, ox, oy, oz, dx, dy, dz, auth, from = null) {
    const pj = def.projectile;
    const mesh = this.template.clone();
    this.game.scene.add(mesh);
    const b = {
      shooter, def, auth, mesh, x: ox, y: oy, z: oz,
      vx: dx * pj.speed, vy: dy * pj.speed, vz: dz * pj.speed,
      age: 0, stuck: 0, gravity: pj.gravity,
      off: from ? [from.x - ox, from.y - oy, from.z - oz] : [0, 0, 0],
    };
    this.list.push(b);
    this._place(b);
    return b;
  }

  _place(b) {
    const k = Math.max(0, 1 - b.age / 0.12);
    b.mesh.position.set(b.x + b.off[0] * k, b.y + b.off[1] * k, b.z + b.off[2] * k);
    if (!b.stuck) {
      _v.set(b.vx, b.vy, b.vz).normalize();
      _q.setFromUnitVectors(_f, _v);
      b.mesh.quaternion.copy(_q);
    }
  }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.age += dt;
      if (b.stuck) {
        b.stuck -= dt;
        if (b.stuck <= 0 || b.age > MAX_LIFE + STUCK_LIFE) this._remove(i);
        continue;
      }
      if (b.age > MAX_LIFE) { this._remove(i); continue; }
      b.vy -= b.gravity * dt;
      const sx = b.vx * dt, sy = b.vy * dt, sz = b.vz * dt;
      const len = Math.hypot(sx, sy, sz);
      if (len < 1e-6) continue;
      const dx = sx / len, dy = sy / len, dz = sz / len;
      let tBest = len, victim = null, head = false, wall = false;
      if (g.world.raycast(b.x, b.y, b.z, dx, dy, dz, len, _hit)) { tBest = _hit.t; wall = true; }
      for (const c of g.chars) {
        if (c === b.shooter || !c.alive) continue;
        if (g.rayCharHit(b.x, b.y, b.z, dx, dy, dz, c, tBest, _ch)) { tBest = _ch.t; victim = c; head = _ch.head; wall = false; }
      }
      // training range targets
      const th = g.range && g.range.raycast(b.x, b.y, b.z, dx, dy, dz, tBest, g.rayCharHit, _ch);
      const hx = b.x + dx * tBest, hy = b.y + dy * tBest, hz = b.z + dz * tBest;
      if (th) {
        const tx = b.x + dx * th.t, ty = b.y + dy * th.t, tz = b.z + dz * th.t;
        if (b.auth) g.range.damage(th.target, b.def.damage * (th.head ? CFG.headshotMult : 1), th.head, tx, ty, tz);
        g.effects.hitBurst(tx, ty, tz, dx, dy, dz, th.head ? 0xffd24d : 0xf4f1ea, th.head);
        if (b.shooter === g.player) g.range.onShot(true, th.head);
        this._remove(i);
        continue;
      }
      if (victim) {
        g.effects.hitBurst(hx, hy, hz, dx, dy, dz, victim.isProtected() ? 0x8fd3ff : victim.color, head);
        g.audio.play('stab', { x: hx, y: hy, z: hz }, 0.8);
        if (b.auth) g.boltHit(b, victim, head);
        this._remove(i);
        continue;
      }
      b.x = hx; b.y = hy; b.z = hz;
      if (wall) {
        // stick in the wall, nose first
        g.effects.impact(hx, hy, hz, _hit.nx, _hit.ny, _hit.nz, false);
        g.audio.play('impact', { x: hx, y: hy, z: hz }, 0.7);
        b.stuck = STUCK_LIFE;
        if (b.auth) g.boltMissed(b);
      }
      this._place(b);
    }
  }

  _remove(i) {
    const b = this.list[i];
    this.game.scene.remove(b.mesh);
    this.list.splice(i, 1);
  }

  clear() {
    for (const b of this.list) this.game.scene.remove(b.mesh);
    this.list.length = 0;
  }
}
