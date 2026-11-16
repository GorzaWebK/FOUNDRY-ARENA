// Procedural canvas textures. All are near-white so the material colour tints them.

import * as THREE from 'three';

function make(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(ctx, s, n, alpha) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    const r = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}

function blotches(ctx, s, n, alpha) {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 60;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.random() < 0.5 ? 0 : 255;
    g.addColorStop(0, `rgba(${v},${v},${v},${alpha})`);
    g.addColorStop(1, `rgba(${v},${v},${v},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

const builders = {
  tiles(ctx, s) {
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 14, 0.07);
    speckle(ctx, s, 5000, 0.07);
    const h = s / 2;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      if ((i + j) % 2) { ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(i * h, j * h, h, h); }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.42)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath(); ctx.moveTo(i * h, 0); ctx.lineTo(i * h, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * h); ctx.lineTo(s, i * h); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 2; i++) {
      ctx.strokeRect(i * h + 4, 4, h - 8, h - 8);
      ctx.strokeRect(i * h + 4, h + 4, h - 8, h - 8);
    }
  },
  concrete(ctx, s) {
    ctx.fillStyle = '#d0d0d0';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 26, 0.08);
    speckle(ctx, s, 9000, 0.09);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(1, s); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    for (const [x, y] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.62], [0.88, 0.62]]) {
      ctx.beginPath(); ctx.arc(x * s, y * s, 4, 0, 7); ctx.fill();
    }
  },
  plates(ctx, s) {
    ctx.fillStyle = '#cfcfcf';
    ctx.fillRect(0, 0, s, s);
    blotches(ctx, s, 10, 0.06);
    speckle(ctx, s, 2500, 0.06);
    // brushed streaks
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
      ctx.fillRect(0, Math.random() * s, s, 1);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, s - 10, s - 10);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    const m = 18;
    for (const [x, y] of [[m, m], [s - m, m], [m, s - m], [s - m, s - m]]) {
      ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 7); ctx.fill();
    }
  },
  crate(ctx, s) {
    ctx.fillStyle = '#d2d2d2';
    ctx.fillRect(0, 0, s, s);
    // planks
    const n = 5;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.08})`;
      ctx.fillRect(0, (i * s) / n, s, s / n);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, (i * s) / n, s, 2);
    }
    speckle(ctx, s, 3000, 0.07);
    // frame + brace
    const f = s * 0.11;
    ctx.fillStyle = 'rgba(70,45,20,0.55)';
    ctx.fillRect(0, 0, s, f); ctx.fillRect(0, s - f, s, f);
    ctx.fillRect(0, 0, f, s); ctx.fillRect(s - f, 0, f, s);
    ctx.save();
    ctx.translate(s / 2, s / 2); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s * 0.62, -f / 2, s * 1.24, f);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.strokeRect(f, f, s - 2 * f, s - 2 * f);
  },
};

const cache = new Map();

export function getTexture(name) {
  if (!builders[name]) return null;
  if (!cache.has(name)) cache.set(name, make(256, builders[name]));
  return cache.get(name);
}

/** Soft round blob (used for muzzle flashes, glows, pickup halos). */
export function glowTexture() {
  if (!cache.has('__glow')) {
    cache.set('__glow', make(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, false));
  }
  return cache.get('__glow');
}

/** Star-shaped muzzle flash. */
export function flashTexture() {
  if (!cache.has('__flash')) {
    cache.set('__flash', make(128, (ctx, s) => {
      ctx.translate(s / 2, s / 2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.3, 'rgba(255,230,150,0.9)');
      g.addColorStop(1, 'rgba(255,140,30,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      const spikes = 7;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 ? s * 0.16 : s * (0.34 + Math.random() * 0.14);
        const a = (i / (spikes * 2)) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }, false));
  }
  return cache.get('__flash');
}

/** Bullet hole decal. */
export function holeTexture() {
  if (!cache.has('__hole')) {
    cache.set('__hole', make(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(0,0,0,0.95)');
      g.addColorStop(0.3, 'rgba(10,10,10,0.85)');
      g.addColorStop(0.55, 'rgba(40,40,40,0.35)');
      g.addColorStop(1, 'rgba(60,60,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    }, false));
  }
  return cache.get('__hole');
}

/** Name tag sprite texture. */
export function nameTexture(name, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = '700 34px system-ui, "Segoe UI", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(240, ctx.measureText(name).width + 34);
  ctx.fillStyle = 'rgba(10,14,20,0.6)';
  ctx.beginPath();
  ctx.roundRect(128 - w / 2, 10, w, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#' + new THREE.Color(color).getHexString();
  ctx.fillRect(128 - w / 2, 48, w, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 128, 31);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
