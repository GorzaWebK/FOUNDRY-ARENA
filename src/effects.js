// Pooled visual effects: spark/hit particles, bullet-hole decals, tracers.

import * as THREE from 'three';
import { holeTexture, glowTexture } from './textures.js';

const MAX_PARTICLES = 600;
const MAX_DECALS = 160;
const MAX_TRACERS = 40;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _c = new THREE.Color();

export class Effects {
  constructor(scene) {
    this.scene = scene;

    // particles ------------------------------------------------------------
    this.pMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_PARTICLES,
    );
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.setColorAt(0, _c.set(0xffffff));
    this.pMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.count = 0;
    this.pMesh.frustumCulled = false;
    scene.add(this.pMesh);
    this.parts = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.parts.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.05, r: 1, g: 1, b: 1, grav: 1 });
    }
    this.pCount = 0;

    // decals ---------------------------------------------------------------
    this.dMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: holeTexture(), transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      }),
      MAX_DECALS,
    );
    this.dMesh.count = 0;
    this.dMesh.frustumCulled = false;
    scene.add(this.dMesh);
    this.dNext = 0;

    // tracers --------------------------------------------------------------
    const tGeo = new THREE.BoxGeometry(1, 1, 1);
    this.tracers = [];
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
        depthWrite: false, toneMapped: false, fog: false,
      });
      const mesh = new THREE.Mesh(tGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, life: 0, max: 0.08 });
    }
    this.tNext = 0;

    // world-space flash light (player muzzle) -------------------------------
    this.flash = new THREE.PointLight(0xffc46b, 0, 14, 2);
    scene.add(this.flash);
    this.flashT = 0;

    // glow sprites for impacts
    this.glows = [];
    for (let i = 0; i < 12; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xffd08a, blending: THREE.AdditiveBlending,
        depthWrite: false, transparent: true, toneMapped: false, fog: false,
      }));
      sp.visible = false;
      scene.add(sp);
      this.glows.push({ sp, life: 0 });
    }
    this.gNext = 0;
  }

  clear() {
    this.pCount = 0;
    this.pMesh.count = 0;
    this.dMesh.count = 0;
    this.dNext = 0;
    for (const t of this.tracers) { t.life = 0; t.mesh.visible = false; }
    for (const g of this.glows) { g.life = 0; g.sp.visible = false; }
  }

  _spawn(x, y, z, vx, vy, vz, life, size, color, grav) {
    if (this.pCount >= MAX_PARTICLES) return;
    const p = this.parts[this.pCount++];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = p.max = life; p.size = size; p.grav = grav;
    _c.set(color);
    p.r = _c.r; p.g = _c.g; p.b = _c.b;
  }

  /** Sparks + dust where a bullet meets the world. */
  impact(x, y, z, nx, ny, nz, light = true) {
    for (let i = 0; i < 6; i++) {
      const sp = 1.5 + Math.random() * 4.5;
      this._spawn(x, y, z,
        nx * sp + (Math.random() - 0.5) * 3.5, ny * sp + (Math.random() - 0.5) * 3.5 + 1, nz * sp + (Math.random() - 0.5) * 3.5,
        0.18 + Math.random() * 0.25, 0.03 + Math.random() * 0.03,
        Math.random() < 0.5 ? 0xffc65a : 0xfff0b0, 1);
    }
    for (let i = 0; i < 3; i++) {
      const sp = 0.4 + Math.random() * 1.2;
      this._spawn(x, y, z, nx * sp + (Math.random() - 0.5), ny * sp + Math.random() * 0.8, nz * sp + (Math.random() - 0.5),
        0.35 + Math.random() * 0.3, 0.07 + Math.random() * 0.06, 0x8a8a86, 0.25);
    }
    this.decal(x, y, z, nx, ny, nz);
    if (light) this.glow(x + nx * 0.05, y + ny * 0.05, z + nz * 0.05, 0.5, 0xffd08a);
  }

  /** Non-graphic "hit" burst in the victim's colour. */
  hitBurst(x, y, z, dx, dy, dz, color, big) {
    const n = big ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const sp = 1 + Math.random() * 3.5;
      this._spawn(x, y, z,
        -dx * sp * 0.5 + (Math.random() - 0.5) * 4, Math.random() * 3 + 0.5, -dz * sp * 0.5 + (Math.random() - 0.5) * 4,
        0.3 + Math.random() * 0.3, 0.05 + Math.random() * 0.04, i % 3 === 0 ? 0xffffff : color, 1);
    }
    this.glow(x, y, z, big ? 0.9 : 0.55, color);
  }

  /** Burst when a character is eliminated. */
  deathBurst(x, y, z, color) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 5;
      this._spawn(x, y + Math.random() * 1.2, z, Math.cos(a) * sp, 1 + Math.random() * 5, Math.sin(a) * sp,
        0.5 + Math.random() * 0.6, 0.06 + Math.random() * 0.07, i % 4 === 0 ? 0xffffff : color, 1);
    }
    this.glow(x, y + 1, z, 2.2, color);
  }

  pickupBurst(x, y, z, color) {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      this._spawn(x + Math.cos(a) * 0.3, y + 0.3 + Math.random() * 0.5, z + Math.sin(a) * 0.3, Math.cos(a) * 1.2, 1.5 + Math.random() * 2.5, Math.sin(a) * 1.2,
        0.4 + Math.random() * 0.4, 0.05, color, 0.2);
    }
  }

  glow(x, y, z, size, color) {
    const g = this.glows[this.gNext];
    this.gNext = (this.gNext + 1) % this.glows.length;
    g.sp.position.set(x, y, z);
    g.sp.scale.setScalar(size);
    g.sp.material.color.set(color);
    g.sp.material.opacity = 1;
    g.sp.visible = true;
    g.life = 0.08;
  }

  decal(x, y, z, nx, ny, nz, size = 0.14 + Math.random() * 0.08) {
    _n.set(nx, ny, nz);
    _q.setFromUnitVectors(_z, _n);
    _s.set(size, size, 1);
    _p.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    _m.compose(_p, _q, _s);
    this.dMesh.setMatrixAt(this.dNext, _m);
    this.dNext = (this.dNext + 1) % MAX_DECALS;
    if (this.dMesh.count < MAX_DECALS) this.dMesh.count++;
    this.dMesh.instanceMatrix.needsUpdate = true;
  }

  tracer(ax, ay, az, bx, by, bz, color = 0xffe2a0) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1.5) return;
    const t = this.tracers[this.tNext];
    this.tNext = (this.tNext + 1) % MAX_TRACERS;
    const m = t.mesh;
    m.position.set(ax + dx * 0.5, ay + dy * 0.5, az + dz * 0.5);
    _n.set(dx / len, dy / len, dz / len);
    m.quaternion.setFromUnitVectors(_z, _n);
    m.scale.set(0.022, 0.022, len);
    m.material.color.set(color);
    m.material.opacity = 0.7;
    m.visible = true;
    t.life = t.max;
  }

  /** Grenade blast: fireball, sparks, smoke, a flash of light and a scorch mark. */
  explosion(x, y, z, groundY) {
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      const sp = 4 + Math.random() * 13;
      this._spawn(x, y + 0.1, z, Math.cos(a) * sp * (1 - up * 0.6), 2 + up * sp * 0.8, Math.sin(a) * sp * (1 - up * 0.6),
        0.25 + Math.random() * 0.45, 0.07 + Math.random() * 0.09,
        i % 3 === 0 ? 0xfff2b0 : i % 3 === 1 ? 0xffa436 : 0xff6a1a, 0.9);
    }
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.6 + Math.random() * 3;
      this._spawn(x + Math.cos(a) * 0.6, y + 0.2 + Math.random() * 0.8, z + Math.sin(a) * 0.6, Math.cos(a) * sp, 1.2 + Math.random() * 2.6, Math.sin(a) * sp,
        0.9 + Math.random() * 0.9, 0.22 + Math.random() * 0.22, i % 2 ? 0x5a5a58 : 0x3a3a3a, -0.05);
    }
    this.glow(x, y + 0.4, z, 9, 0xffc070);
    this.glows[(this.gNext + this.glows.length - 1) % this.glows.length].life = 0.16;
    this.flash.position.set(x, y + 0.6, z);
    this.flash.color.set(0xffc46b);
    this.flash.intensity = 160;
    this.flashT = 0.12;
    if (groundY !== undefined) this.decal(x, groundY, z, 0, 1, 0, 3.2);
  }

  /** Unlockable kill effects, on top of the usual burst. */
  killFx(kind, x, y, z) {
    const n = this.lowDetail ? 14 : 30;
    if (kind === 'sparks') {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 3 + Math.random() * 7;
        this._spawn(x, y + 1, z, Math.cos(a) * sp, 2 + Math.random() * 5, Math.sin(a) * sp, 0.25 + Math.random() * 0.3, 0.03 + Math.random() * 0.03, i % 2 ? 0xfff0b0 : 0xffffff, 1);
      }
      this.glow(x, y + 1, z, 3, 0xffe2a0);
    } else if (kind === 'pixels') {
      const cols = [0x4fe3ff, 0xff5cf0, 0x5dff9a, 0xffd24d];
      for (let i = 0; i < n * 0.6; i++) {
        const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 2;
        this._spawn(x + Math.cos(a) * 0.3, y + 0.4 + Math.random() * 1.4, z + Math.sin(a) * 0.3, Math.cos(a) * sp, 0.5 + Math.random() * 1.5, Math.sin(a) * sp, 0.6 + Math.random() * 0.5, 0.09 + Math.random() * 0.06, cols[i % cols.length], 0.15);
      }
    } else if (kind === 'confetti') {
      const cols = [0xff4d4d, 0xffd24d, 0x4fc3f7, 0x5dff9a, 0xff5cf0, 0xffffff];
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 3;
        this._spawn(x, y + 1.6, z, Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp, 1.2 + Math.random() * 0.8, 0.04 + Math.random() * 0.03, cols[i % cols.length], 0.25);
      }
    }
  }

  /** Flashbang: a white burst and a blinding light, no fire. */
  flashBang(x, y, z) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, up = Math.random();
      const sp = 3 + Math.random() * 9;
      this._spawn(x, y + 0.1, z, Math.cos(a) * sp * (1 - up * 0.5), 1 + up * sp * 0.7, Math.sin(a) * sp * (1 - up * 0.5),
        0.15 + Math.random() * 0.3, 0.04 + Math.random() * 0.05, i % 2 ? 0xffffff : 0xe8f4ff, 0.8);
    }
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 1.5;
      this._spawn(x, y + 0.2, z, Math.cos(a) * sp, 0.8 + Math.random() * 1.4, Math.sin(a) * sp,
        0.8 + Math.random() * 0.6, 0.14 + Math.random() * 0.12, 0x9a9a9a, -0.04);
    }
    this.glow(x, y + 0.3, z, 12, 0xffffff);
    this.glows[(this.gNext + this.glows.length - 1) % this.glows.length].life = 0.2;
    this.flash.position.set(x, y + 0.5, z);
    this.flash.color.set(0xeef6ff);
    this.flash.intensity = 260;
    this.flashT = 0.16;
  }

  muzzleLight(x, y, z) {
    this.flash.position.set(x, y, z);
    this.flash.color.set(0xffc46b);
    this.flash.intensity = 40;
    this.flashT = 0.05;
  }

  update(dt) {
    // particles (swap-remove)
    let n = this.pCount;
    const parts = this.parts;
    for (let i = 0; i < n;) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        n--;
        parts[i] = parts[n];
        parts[n] = p;
        continue;
      }
      p.vy -= 14 * p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const s = p.size * Math.min(1, (p.life / p.max) * 2);
      _m.makeScale(s, s, s);
      _m.setPosition(p.x, p.y, p.z);
      this.pMesh.setMatrixAt(i, _m);
      this.pMesh.setColorAt(i, _c.setRGB(p.r, p.g, p.b));
      i++;
    }
    this.pCount = n;
    this.pMesh.count = n;
    if (n > 0) {
      this.pMesh.instanceMatrix.needsUpdate = true;
      this.pMesh.instanceColor.needsUpdate = true;
    }

    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
      else t.mesh.material.opacity = 0.7 * (t.life / t.max);
    }
    for (const g of this.glows) {
      if (g.life <= 0) continue;
      g.life -= dt;
      if (g.life <= 0) g.sp.visible = false;
      else g.sp.material.opacity = Math.min(1, g.life / 0.08);
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.intensity = 0;
    }
  }
}
