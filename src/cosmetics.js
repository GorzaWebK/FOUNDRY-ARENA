// Unlockable cosmetics: everything you earn by levelling up. None of it changes
// how the game plays. Each slot lists its items with the level that unlocks them
// (`prestige` items need a prestige instead).
//
// In multiplayer a player's equipped cosmetics travel as a short array of item
// indices (see packCosmetics / unpackCosmetics), so others see your name tag,
// title, calling card, gear, tracers and kill effects.

export const SLOTS = [
  { id: 'title', name: 'Title', shared: true },
  { id: 'tag', name: 'Name tag', shared: true },
  { id: 'card', name: 'Calling card', shared: true },
  { id: 'helmet', name: 'Helmet', shared: true },
  { id: 'armour', name: 'Armour', shared: true },
  { id: 'shoulders', name: 'Shoulder pads', shared: true },
  { id: 'tracer', name: 'Tracers', shared: true },
  { id: 'killfx', name: 'Kill effect', shared: true },
  { id: 'nade', name: 'Grenade', shared: true },
  { id: 'knife', name: 'Knife', shared: false },
  { id: 'charm', name: 'Weapon charm', shared: false },
  { id: 'xhShape', name: 'Crosshair shape', shared: false },
];

export const ITEMS = {
  title: [
    { id: 'recruit', name: 'Apprentice', level: 1 },
    { id: 'scrapper', name: 'Stoker', level: 4 },
    { id: 'gunner', name: 'Riveter', level: 7 },
    { id: 'veteran', name: 'Smith', level: 10 },
    { id: 'marksman', name: 'Gunsmith', level: 14 },
    { id: 'hunter', name: 'Forgehand', level: 18 },
    { id: 'breacher', name: 'Foreman', level: 22 },
    { id: 'specialist', name: 'Steelheart', level: 27 },
    { id: 'elite', name: 'Ironclad', level: 32 },
    { id: 'warlord', name: 'Yard Boss', level: 38 },
    { id: 'ace', name: 'Blast Furnace', level: 41 },
    { id: 'legend', name: 'Master Smith', level: 45 },
    { id: 'master', name: 'Foundry Master', level: 50 },
    { id: 'reborn', name: 'Reforged', prestige: 1 },
    { id: 'immortal', name: 'Tempered', prestige: 3 },
  ],
  tag: [
    { id: 'plain', name: 'Plain', level: 1 },
    { id: 'colour', name: 'Coloured', level: 3 },
    { id: 'frame', name: 'Framed', level: 8 },
    { id: 'stripe', name: 'Striped', level: 15 },
    { id: 'glow', name: 'Glow', level: 25 },
    { id: 'gold', name: 'Gold', level: 40 },
    { id: 'prestige', name: 'Prestige', prestige: 1 },
  ],
  card: [
    { id: 'steel', name: 'Plate', level: 1, css: 'radial-gradient(circle at 12px 12px,#59616a 0 2px,transparent 3px),radial-gradient(circle at calc(100% - 12px) 12px,#59616a 0 2px,transparent 3px),linear-gradient(180deg,#323a42,#1c2227)' },
    { id: 'ember', name: 'Ember', level: 2, css: 'radial-gradient(ellipse at 80% 120%,#ff6b1a 0,#8a2a06 35%,transparent 70%),#1a0f0a' },
    { id: 'blueprint', name: 'Schematic', level: 5, css: 'repeating-linear-gradient(0deg,transparent 0 13px,rgba(220,232,240,.14) 13px 14px),repeating-linear-gradient(90deg,transparent 0 13px,rgba(220,232,240,.14) 13px 14px),#1d3a52' },
    { id: 'hazard', name: 'Hazard', level: 9, css: 'repeating-linear-gradient(-45deg,#f2b417 0 14px,#161616 14px 28px)' },
    { id: 'circuit', name: 'Copper', level: 12, css: 'linear-gradient(90deg,transparent 18%,#c87533 18% 20%,transparent 20% 62%,#c87533 62% 64%,transparent 64%),linear-gradient(0deg,transparent 45%,#c87533 45% 50%,transparent 50%),#1b1714' },
    { id: 'camo', name: 'Field', level: 16, css: 'radial-gradient(ellipse at 20% 30%,#6f7a46 0 18%,transparent 19%),radial-gradient(ellipse at 65% 70%,#2c2c22 0 20%,transparent 21%),radial-gradient(ellipse at 85% 20%,#7a6440 0 14%,transparent 15%),#4c5634' },
    { id: 'sunset', name: 'Pour', level: 20, css: 'linear-gradient(100deg,#120c08 30%,#ff6b1a 55%,#ffd27a 62%,#ff6b1a 70%,#120c08 92%)' },
    { id: 'carbon', name: 'Carbon', level: 24, css: 'repeating-linear-gradient(45deg,#1a1a1a 0 4px,#262626 4px 8px)' },
    { id: 'aurora', name: 'Temper', level: 29, css: 'linear-gradient(90deg,#d8c27a,#b8844a 25%,#8a4a6a 50%,#3a4a8a 75%,#5a7aa8)' },
    { id: 'lava', name: 'Slag', level: 34, css: 'radial-gradient(circle at 30% 70%,#ffd27a 0 6%,#ff6b1a 16%,transparent 34%),radial-gradient(circle at 75% 35%,#ff6b1a 0 8%,transparent 28%),#231612' },
    { id: 'royal', name: 'Brass', level: 42, css: 'linear-gradient(180deg,#e2c27a,#a8803a 50%,#6a4a1a)' },
    { id: 'void', name: 'Blackened', level: 48, css: 'linear-gradient(135deg,#050505,#1c1f22 45%,#3a3f44 50%,#1c1f22 55%,#050505)' },
    { id: 'overtime', name: 'Overtime', weekly: 1, css: 'repeating-linear-gradient(90deg,transparent 0 22px,rgba(242,180,23,.22) 22px 24px),linear-gradient(180deg,#2a1a08,#0f0b07)' },
    { id: 'nightshift', name: 'Night Shift', weekly: 5, css: 'radial-gradient(circle at 78% 28%,#e9e4da 0 7%,transparent 8%),radial-gradient(circle at 70% 24%,#0b1020 0 8%,transparent 9%),linear-gradient(180deg,#0b1020,#1a2440 60%,#ff6b1a 140%)' },
    // ranked: reach the tier (any season) to unlock (rank = tier number, see ranked.js)
    { id: 'r-gold', name: 'Ranked Gold', rank: 6, css: 'radial-gradient(circle at 82% 50%,#f2c14e 0 14%,transparent 15%),repeating-linear-gradient(115deg,rgba(242,193,78,.18) 0 10px,transparent 10px 20px),linear-gradient(90deg,#2a2112,#4a3a18)' },
    { id: 'r-diamond', name: 'Ranked Diamond', rank: 12, css: 'conic-gradient(from 45deg at 82% 50%,#cfe4ff,#7fb2ff,#2d5aa8,#7fb2ff,#cfe4ff),linear-gradient(90deg,#0d1a2e,#1d3560)' },
    { id: 'r-master', name: 'Foundry Master', rank: 15, css: 'radial-gradient(ellipse at 82% 120%,#ffd27a 0,#ff6b1a 25%,transparent 55%),repeating-linear-gradient(90deg,rgba(255,107,26,.25) 0 2px,transparent 2px 18px),linear-gradient(90deg,#1a0d06,#3a1606)' },
    { id: 'gilded', name: 'Gilded', prestige: 1, css: 'linear-gradient(135deg,#7a5a10,#ffe08a 45%,#b8860b 70%,#ffe08a)' },
  ],
  helmet: [
    { id: 'none', name: 'None', level: 1 },
    { id: 'cap', name: 'Cap', level: 6 },
    { id: 'combat', name: 'Combat helmet', level: 11 },
    { id: 'visor', name: 'Visor helmet', level: 19 },
    { id: 'tactical', name: 'Tactical helmet', level: 30 },
    { id: 'crown', name: 'Crown', level: 50 },
  ],
  armour: [
    { id: 'none', name: 'Team colours', level: 1 },
    { id: 'olive', name: 'Olive', level: 13, color: 0x4f5a34 },
    { id: 'desert', name: 'Desert', level: 21, color: 0xa88b5c },
    { id: 'urban', name: 'Urban', level: 28, color: 0x5a6068 },
    { id: 'crimson', name: 'Crimson', level: 36, color: 0x7a1c1c },
    { id: 'gold', name: 'Gold', level: 47, color: 0xc9a227 },
  ],
  shoulders: [
    { id: 'none', name: 'None', level: 1 },
    { id: 'pads', name: 'Pads', level: 17 },
    { id: 'plates', name: 'Plates', level: 33 },
  ],
  tracer: [
    { id: 'default', name: 'Standard', level: 1, color: 0xffe2a0 },
    { id: 'blue', name: 'Blue', level: 11, color: 0x6ec8ff },
    { id: 'green', name: 'Green', level: 23, color: 0x7dff8a },
    { id: 'red', name: 'Red', level: 31, color: 0xff5a5a },
    { id: 'purple', name: 'Purple', level: 39, color: 0xc77dff },
    { id: 'gold', name: 'Gold', level: 46, color: 0xffd24d },
  ],
  killfx: [
    { id: 'default', name: 'Standard', level: 1 },
    { id: 'sparks', name: 'Sparks', level: 12 },
    { id: 'pixels', name: 'Pixels', level: 26 },
    { id: 'confetti', name: 'Confetti', level: 37 },
  ],
  nade: [
    { id: 'default', name: 'Standard', level: 1, color: 0x3f4a2c },
    { id: 'camo', name: 'Camo', level: 15, color: 0x5b6a36 },
    { id: 'hazard', name: 'Hazard', level: 26, color: 0xd9b400 },
    { id: 'chrome', name: 'Chrome', level: 39, color: 0xc8d0d8 },
  ],
  knife: [
    { id: 'steel', name: 'Steel', level: 1, blade: 0xc8cdd2, handle: 0x2a2a2a },
    { id: 'blackout', name: 'Blackout', level: 10, blade: 0x2a2d31, handle: 0x111111 },
    { id: 'bronze', name: 'Bronze', level: 23, blade: 0xb07a3a, handle: 0x4a2a12 },
    { id: 'neon', name: 'Arc', level: 35, blade: 0x4fe3ff, handle: 0x1a1a2a, glow: true },
    { id: 'damascus', name: 'Damascus', level: 43, blade: 0x8a929c, handle: 0x3a1f10 },
    { id: 'gold', name: 'Gold', level: 49, blade: 0xffd24d, handle: 0x5a3a08 },
  ],
  charm: [
    { id: 'none', name: 'None', level: 1 },
    { id: 'dice', name: 'Dice', level: 8 },
    { id: 'dogtag', name: 'Dog tag', level: 16 },
    { id: 'star', name: 'Star', level: 24 },
    { id: 'duck', name: 'Duck', level: 33 },
    { id: 'crown', name: 'Crown', level: 44 },
  ],
  xhShape: [
    { id: 'cross', name: 'Cross', level: 1 },
    { id: 'dot', name: 'Dot', level: 5 },
    { id: 'circle', name: 'Circle', level: 9 },
    { id: 'tee', name: 'T-shape', level: 20 },
    { id: 'chevron', name: 'Chevron', level: 31 },
  ],
};

export const DEFAULT_EQUIPPED = Object.fromEntries(SLOTS.map((s) => [s.id, ITEMS[s.id][0].id]));

export function itemOf(slot, id) {
  const list = ITEMS[slot] || [];
  return list.find((i) => i.id === id) || list[0];
}

/** Can someone at `level` / `prestige` use this item? */
export function itemUnlocked(item, level, prestige, weeks = 0, rankPeak = -1) {
  if (item.rank !== undefined) return rankPeak >= item.rank;
  if (item.weekly) return weeks >= item.weekly;
  if (item.prestige) return prestige >= item.prestige;
  return level >= (item.level || 1);
}

/** Every item unlocked exactly at `level` (for the level-up call-out). */
export function unlocksAt(level) {
  const out = [];
  for (const s of SLOTS) for (const i of ITEMS[s.id]) if (!i.prestige && i.level === level && level > 1) out.push({ slot: s, item: i });
  return out;
}

// ---------------------------------------------------------------- network form

const SHARED = SLOTS.filter((s) => s.shared).map((s) => s.id);

/** What others need to see of you: [level, prestige, ...item indices of the shared slots]. */
export function packCosmetics(equipped, level, prestige) {
  return [level | 0, prestige | 0, ...SHARED.map((slot) => Math.max(0, ITEMS[slot].findIndex((i) => i.id === equipped[slot])))];
}

/** Back from the wire, checked (a bad value just falls back to the default). */
export function unpackCosmetics(arr) {
  const out = { level: 1, prestige: 0, equipped: { ...DEFAULT_EQUIPPED } };
  if (!Array.isArray(arr)) return out;
  const n = (v, max) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v | 0)) : 0);
  out.level = Math.max(1, n(arr[0], 50));
  out.prestige = n(arr[1], 10);
  SHARED.forEach((slot, i) => { const it = ITEMS[slot][n(arr[2 + i], ITEMS[slot].length - 1)]; if (it) out.equipped[slot] = it.id; });
  return out;
}

/** A plausible random look for a bot. */
export function randomCosmetics() {
  const level = 1 + ((Math.random() * 45) | 0);
  const equipped = { ...DEFAULT_EQUIPPED };
  for (const slot of SHARED) {
    const ok = ITEMS[slot].filter((i) => itemUnlocked(i, level, 0));
    if (Math.random() < 0.6) equipped[slot] = ok[(Math.random() * ok.length) | 0].id;
  }
  return { level, prestige: 0, equipped };
}
