// Smoke grenade clouds: soft billboard puffs that grow, drift and fade, and a
// sphere test so bots can't see through them.

import * as THREE from 'three';
import { SMOKE } from './weapons.js';

let tex = null;
function smokeTexture() {
  if (tex) return tex;
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  // a lumpy soft blob: a few overlapping radial gradients
  for (let i = 0; i < 7; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.3, y = s / 2 + (Math.random() - 0.5) * s * 0.3;
    const r = s * (0.28 + Math.random() * 0.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const GROW = 1.6; // seconds to spread out
const FADE = 2.5; // seconds to thin out at the end

export class SmokeClouds {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.lowDetail = false;
  }

  /** A cloud pops at (x, groundY, z). */
  add(x, y, z) {
    const n = this.lowDetail ? 14 : 26;
    const group = new THREE.Group();
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({
        map: smokeTexture(), color: new THREE.Color().setHSL(0.58, 0.05, 0.5 + Math.random() * 0.12),
        transparent: true, depthWrite: false, opacity: 0, rotation: Math.random() * 6.28,
      });
      const sp = new THREE.Sprite(mat);
      // spread through a squashed dome
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.85;
      const h = Math.random();
      puffs.push({
        sp, ox: Math.cos(a) * r, oz: Math.sin(a) * r, oy: 0.25 + h * 0.75,
        size: 2.6 + Math.random() * 1.8, spin: (Math.random() - 0.5) * 0.3, drift: Math.random() * 6.28,
      });
      group.add(sp);
    }
    group.position.set(x, y, z);
    this.scene.add(group);
    this.list.push({ x, y, z, t: 0, group, puffs });
  }

  /** Current radius of a cloud's blocking sphere (0 while it hasn't spread yet / has gone). */
  radius(c) {
    const grow = Math.min(1, c.t / GROW);
    const fade = Math.min(1, (SMOKE.life - c.t) / FADE);
    return SMOKE.radius * grow * Math.max(0, fade) * 0.9;
  }

  /** Does the segment a→b pass through a cloud? */
  blocks(ax, ay, az, bx, by, bz) {
    for (const c of this.list) {
      const r = this.radius(c);
      if (r < 0.8) continue;
      const cx = c.x, cy = c.y + r * 0.45, cz = c.z;
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len2 = dx * dx + dy * dy + dz * dz || 1e-6;
      let t = ((cx - ax) * dx + (cy - ay) * dy + (cz - az) * dz) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + dx * t - cx, py = ay + dy * t - cy, pz = az + dz * t - cz;
      if (px * px + py * py + pz * pz < r * r) return true;
    }
    return false;
  }

  /** 0..1: how deep inside a cloud a point is (for the screen haze). */
  density(x, y, z) {
    let best = 0;
    for (const c of this.list) {
      const r = this.radius(c);
      if (r < 0.5) continue;
      const d = Math.hypot(x - c.x, y - (c.y + r * 0.45), z - c.z);
      if (d < r) best = Math.max(best, Math.min(1, (1 - d / r) * 1.6));
    }
    return best;
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.t += dt;
      if (c.t >= SMOKE.life) { this.remove(i); continue; }
      const grow = 1 - Math.pow(1 - Math.min(1, c.t / GROW), 3);
      const fade = Math.max(0, Math.min(1, (SMOKE.life - c.t) / FADE));
      const R = SMOKE.radius * (0.25 + 0.75 * grow);
      for (const p of c.puffs) {
        const sway = Math.sin(c.t * 0.4 + p.drift) * 0.25;
        p.sp.position.set(p.ox * R + sway, p.oy * R * 0.75, p.oz * R + Math.cos(c.t * 0.35 + p.drift) * 0.25);
        p.sp.scale.setScalar(p.size * (0.4 + 0.6 * grow) * (1 + c.t * 0.015));
        p.sp.material.rotation += p.spin * dt;
        p.sp.material.opacity = 0.9 * fade * Math.min(1, c.t * 3);
      }
    }
  }

  remove(i) {
    const c = this.list[i];
    this.scene.remove(c.group);
    for (const p of c.puffs) p.sp.material.dispose();
    this.list.splice(i, 1);
  }

  clear() {
    for (let i = this.list.length - 1; i >= 0; i--) this.remove(i);
  }
}
