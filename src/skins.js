// Weapon skins (camos). A gun's skins unlock after SKIN_KILLS kills with that
// gun (counted in career stats). A skin repaints the gun's body parts (stock,
// grip, furniture, receiver covers); barrels, sights and accents stay as they are.

import * as THREE from 'three';

export const SKIN_KILLS = 50;
export const SKIN_GUNS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'lmg'];

export const SKINS = [
  { id: 'none', name: 'Factory' },
  { id: 'woodland', name: 'Woodland', colors: ['#45602e', '#6f8240', '#2a2a1c', '#7c5f36'] },
  { id: 'desert', name: 'Desert', colors: ['#c9ad7c', '#a6875a', '#e3cfa6', '#8a6c48'] },
  { id: 'arctic', name: 'Arctic', colors: ['#e8eef2', '#b6c2ca', '#8995a0', '#ffffff'] },
  { id: 'crimson', name: 'Crimson', colors: ['#7c1616', '#b42b2b', '#2a0b0b', '#dc4c3c'] },
  { id: 'tiger', name: 'Tiger', colors: ['#e07c18', '#1b1b1b', '#f0a040', '#2b2b2b'], stripes: true },
];
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const skinIndex = (id) => Math.max(0, SKINS.findIndex((s) => s.id === id));

// palette keys a skin paints over (see gunModels.js PALETTE)
export const SKINNED = ['polymer', 'polymerLight', 'olive', 'tan', 'wood', 'woodDark', 'metalLight'];

const texCache = new Map();

/** The camo pattern as a repeating canvas texture. */
export function camoTexture(id) {
  if (texCache.has(id)) return texCache.get(id);
  const skin = SKIN_BY_ID[id];
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const [base, ...rest] = skin.colors;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, s, s);
  if (skin.stripes) {
    // tiger: ragged diagonal stripes
    ctx.fillStyle = skin.colors[1];
    for (let i = -4; i < 12; i++) {
      ctx.beginPath();
      const x0 = i * 26 + Math.random() * 8;
      ctx.moveTo(x0, 0);
      for (let y = 0; y <= s; y += 16) ctx.lineTo(x0 + y * 0.45 + Math.random() * 10, y);
      for (let y = s; y >= 0; y -= 16) ctx.lineTo(x0 + y * 0.45 + 7 + Math.random() * 6, y);
      ctx.fill();
    }
  } else {
    // blotches, drawn in a few passes with wrap-around so the pattern tiles
    for (let pass = 0; pass < 3; pass++) {
      ctx.fillStyle = rest[pass % rest.length];
      for (let i = 0; i < 9; i++) {
        const x = Math.random() * s, y = Math.random() * s, r = 18 + Math.random() * 30;
        for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
          ctx.beginPath();
          for (let a = 0; a < Math.PI * 2; a += 0.6) {
            const rr = r * (0.6 + Math.random() * 0.6);
            ctx.lineTo(x + ox + Math.cos(a) * rr * 1.4, y + oy + Math.sin(a) * rr);
          }
          ctx.fill();
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(id, t);
  return t;
}

/** A CSS background for a skin swatch (for menus). */
export function skinSwatchCss(id) {
  const skin = SKIN_BY_ID[id];
  if (!skin || !skin.colors) return 'linear-gradient(135deg, #272b30 0%, #454b53 60%, #3a3f47 100%)';
  const [a, b, c] = skin.colors;
  return skin.stripes
    ? `repeating-linear-gradient(60deg, ${a} 0 7px, ${b} 7px 11px)`
    : `radial-gradient(circle at 25% 30%, ${b} 0 22%, transparent 23%), radial-gradient(circle at 70% 65%, ${c} 0 20%, transparent 21%), radial-gradient(circle at 80% 20%, ${b} 0 12%, transparent 13%), ${a}`;
}

/** The skin colour standing in for the pattern on a palette key (third-person guns). */
export function skinColor(id, key) {
  const skin = SKIN_BY_ID[id];
  if (!skin || !skin.colors || !SKINNED.includes(key)) return null;
  const i = { polymer: 0, polymerLight: 1, olive: 0, tan: 2, wood: 0, woodDark: 1, metalLight: 3 }[key] || 0;
  return skin.colors[skin.stripes && key === 'polymer' ? 0 : i];
}

/** Is skin `id` usable on `weaponId` with this career? */
export function skinUnlocked(career, weaponId, id) {
  return id === 'none' || career.weaponKills(weaponId) >= SKIN_KILLS;
}
