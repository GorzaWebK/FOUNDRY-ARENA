// Weapon skins (camos). A gun's camos unlock one at a time, every SKIN_KILLS
// kills with that gun (counted in career stats): the first at 50, the next at
// 100, and so on. A skin repaints the gun's body parts (stock,
// grip, furniture, receiver covers); barrels, sights and accents stay as they are.

import * as THREE from 'three';

export const SKIN_KILLS = 50; // kills between one camo and the next
export const GOLD_KILLS = 300; // plus level 20 (or any prestige)
export const GOLD_LEVEL = 20;
export const SKIN_GUNS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'lmg', 'burst', 'dmr', 'revolver'];
/** Diamond needs Gold on these (the six original guns, so adding guns never takes Diamond away). */
export const DIAMOND_GUNS = ['pistol', 'rifle', 'smg', 'shotgun', 'sniper', 'lmg'];

export const SKINS = [
  { id: 'none', name: 'Factory' },
  { id: 'woodland', name: 'Woodland', colors: ['#45602e', '#6f8240', '#2a2a1c', '#7c5f36'] },
  { id: 'desert', name: 'Desert', colors: ['#c9ad7c', '#a6875a', '#e3cfa6', '#8a6c48'] },
  { id: 'arctic', name: 'Arctic', colors: ['#e8eef2', '#b6c2ca', '#8995a0', '#ffffff'] },
  { id: 'crimson', name: 'Crimson', colors: ['#7c1616', '#b42b2b', '#2a0b0b', '#dc4c3c'] },
  { id: 'tiger', name: 'Tiger', colors: ['#e07c18', '#1b1b1b', '#f0a040', '#2b2b2b'], stripes: true },
  // mastery camos: these cover the metal too, and shine
  { id: 'gold', name: 'Gold', colors: ['#d4a52a', '#f5d66e', '#8a6510', '#ffe9a0'], special: 'gold' },
  { id: 'diamond', name: 'Diamond', colors: ['#bfe9ff', '#ffffff', '#6fb8e6', '#e6f7ff'], special: 'diamond' },
];
export const COMMON_SKINS = SKINS.filter((s) => s.colors && !s.special);
export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const skinIndex = (id) => Math.max(0, SKINS.findIndex((s) => s.id === id));

/** Kills with a gun that unlock this common camo: 50 for the first, 50 more for each after. */
export function camoKills(id) {
  const i = COMMON_SKINS.findIndex((s) => s.id === id);
  return i < 0 ? 0 : (i + 1) * SKIN_KILLS;
}
/** The next camo still to unlock on a gun with `kills` kills, or null. */
export function nextCamo(kills) {
  return COMMON_SKINS.find((s) => kills < camoKills(s.id)) || null;
}

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
  if (skin.special === 'gold') {
    // brushed gold with soft highlights
    const g = ctx.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#b8860b'); g.addColorStop(0.3, '#f5d66e'); g.addColorStop(0.55, '#c9971c'); g.addColorStop(0.8, '#ffe9a0'); g.addColorStop(1, '#a87a10');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.08})`;
      ctx.fillRect(0, Math.random() * s, s, 1);
    }
  } else if (skin.special === 'diamond') {
    // faceted: a grid of triangles in icy blues and whites
    const n = 6, w = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = skin.colors[(i * 3 + j * 5 + k * 2 + ((Math.random() * 2) | 0)) % skin.colors.length];
        ctx.beginPath();
        if (k === 0) { ctx.moveTo(i * w, j * w); ctx.lineTo((i + 1) * w, j * w); ctx.lineTo(i * w, (j + 1) * w); }
        else { ctx.moveTo((i + 1) * w, j * w); ctx.lineTo((i + 1) * w, (j + 1) * w); ctx.lineTo(i * w, (j + 1) * w); }
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * w, 0); ctx.lineTo(0, i * w); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s, i * w); ctx.lineTo(i * w, s); ctx.stroke(); }
  } else if (skin.stripes) {
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
  if (skin.special === 'gold') return 'linear-gradient(135deg, #b8860b, #f5d66e 40%, #c9971c 65%, #ffe9a0)';
  if (skin.special === 'diamond') return 'linear-gradient(135deg, #6fb8e6 0 25%, #ffffff 25% 40%, #bfe9ff 40% 70%, #e6f7ff 70%)';
  return skin.stripes
    ? `repeating-linear-gradient(60deg, ${a} 0 7px, ${b} 7px 11px)`
    : `radial-gradient(circle at 25% 30%, ${b} 0 22%, transparent 23%), radial-gradient(circle at 70% 65%, ${c} 0 20%, transparent 21%), radial-gradient(circle at 80% 20%, ${b} 0 12%, transparent 13%), ${a}`;
}

/** The skin colour standing in for the pattern on a palette key (third-person guns). */
export function skinColor(id, key) {
  const skin = SKIN_BY_ID[id];
  if (!skin || !skin.colors) return null;
  if (skin.special && (key === 'metal' || key === 'metalLight')) return skin.colors[key === 'metal' ? 0 : 1];
  if (!SKINNED.includes(key)) return null;
  const i = { polymer: 0, polymerLight: 1, olive: 0, tan: 2, wood: 0, woodDark: 1, metalLight: 3 }[key] || 0;
  return skin.colors[skin.stripes && key === 'polymer' ? 0 : i];
}

/** Gold on `weaponId`: level 20 (or any prestige) and 300 kills with it. */
export function goldUnlocked(career, progress, weaponId) {
  return (progress.level >= GOLD_LEVEL || progress.prestige > 0) && career.weaponKills(weaponId) >= GOLD_KILLS;
}

/** Is skin `id` usable on `weaponId` with this career (and level)? */
export function skinUnlocked(career, weaponId, id, progress = null) {
  if (id === 'none') return true;
  if (id === 'gold') return !!progress && goldUnlocked(career, progress, weaponId);
  if (id === 'diamond') return !!progress && DIAMOND_GUNS.every((w) => goldUnlocked(career, progress, w));
  return career.weaponKills(weaponId) >= camoKills(id);
}

/** Why a skin is locked, for tooltips. */
export function skinLockText(career, weaponId, id, progress, gunName) {
  if (id === 'gold') return `Gold: level ${GOLD_LEVEL} and ${GOLD_KILLS} ${gunName} kills (${career.weaponKills(weaponId)}/${GOLD_KILLS})`;
  if (id === 'diamond') return 'Diamond: Gold on the pistol, rifle, SMG, shotgun, sniper and LMG';
  const need = camoKills(id), have = career.weaponKills(weaponId);
  return `${SKIN_BY_ID[id].name}: ${need} ${gunName} kills (${Math.min(have, need)}/${need}, ${Math.max(0, need - have)} to go)`;
}
