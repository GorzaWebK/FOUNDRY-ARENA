// The season pass: free for everyone. A season is a calendar month (the same
// seasons as ranked, see ranked.js). Every point of XP you earn in a match also
// fills the pass; each PASS_TIER_XP is a tier, and there are PASS_TIERS. Ten of
// the tiers hand out a cosmetic from the season's theme, the rest a little bonus
// XP. Themes take turns month by month, so a theme's items come round again in
// four months for anyone who missed them. Items you unlock are yours for good.

import { seasonId, seasonName, msToSeasonEnd } from './ranked.js';

export const PASS_TIERS = 30;
export const PASS_TIER_XP = 1000;
export const PASS_BONUS_XP = 250; // tiers without an item

/** Which tiers hand out which kind of item (the rest give bonus XP). */
const LAYOUT = [
  [2, 'title', 0], [4, 'card', 0], [6, 'tracer', 0], [9, 'nade', 0], [12, 'armour', 0],
  [15, 'knife', 0], [18, 'title', 1], [21, 'card', 1], [25, 'tracer', 1], [30, 'card', 2],
];

export const THEMES = [
  {
    id: 'molten', name: 'Molten', color: '#ff6b1a',
    title: ['Slagborn', 'Molten Core'],
    card: [
      'radial-gradient(ellipse at 20% 130%,#ffd27a 0,#ff6b1a 30%,transparent 60%),linear-gradient(90deg,#1a0b05,#3a1206)',
      'repeating-linear-gradient(170deg,rgba(255,107,26,.35) 0 3px,transparent 3px 14px),radial-gradient(circle at 85% 50%,#ffb04a 0 12%,#c43a0a 30%,#1a0806 60%)',
      'conic-gradient(from 0deg at 82% 55%,#ffd27a,#ff6b1a,#7a1606,#ff6b1a,#ffd27a),radial-gradient(circle at 82% 55%,#fff3c4 0 6%,transparent 7%),linear-gradient(90deg,#140604,#2a0c06)',
    ],
    tracer: [0xff8a2a, 0xffd27a], nade: 0x8a2a0a, armour: 0x6a2410,
    knife: { blade: 0xff8a2a, handle: 0x2a0c06, glow: true },
  },
  {
    id: 'ironclad', name: 'Ironclad', color: '#8fa7bd',
    title: ['Rivet Gun', 'Iron Will'],
    card: [
      'radial-gradient(circle at 10px 10px,#9aa8b6 0 2px,transparent 3px),radial-gradient(circle at calc(100% - 10px) calc(100% - 10px),#9aa8b6 0 2px,transparent 3px),linear-gradient(180deg,#46525e,#232a31)',
      'repeating-linear-gradient(90deg,#2d353d 0 18px,#3a444e 18px 20px),linear-gradient(0deg,rgba(143,167,189,.3),transparent)',
      'linear-gradient(135deg,transparent 40%,#c8d4e0 48%,#8fa7bd 52%,transparent 60%),repeating-linear-gradient(45deg,#1c2228 0 6px,#232a31 6px 12px)',
    ],
    tracer: [0xbfd4ea, 0x8fa7bd], nade: 0x5a6672, armour: 0x3e4a56,
    knife: { blade: 0xdfe8f0, handle: 0x3e4a56 },
  },
  {
    id: 'graveyard', name: 'Graveyard', color: '#9b7dff',
    title: ['Night Crew', 'Lights Out'],
    card: [
      'radial-gradient(circle at 80% 30%,#e9e4da 0 6%,transparent 7%),linear-gradient(180deg,#120c24,#2a1a4a 70%,#4a2a6a)',
      'repeating-linear-gradient(0deg,rgba(155,125,255,.15) 0 2px,transparent 2px 8px),linear-gradient(90deg,#0c0818,#2a1a4a)',
      'radial-gradient(ellipse at 50% 120%,#9b7dff 0,#4a2a8a 30%,transparent 60%),radial-gradient(circle at 20% 30%,#7affc4 0 3%,transparent 4%),linear-gradient(180deg,#05040c,#1a1030)',
    ],
    tracer: [0x9b7dff, 0x7affc4], nade: 0x2a1a4a, armour: 0x2c2046,
    knife: { blade: 0x9b7dff, handle: 0x120c24, glow: true },
  },
  {
    id: 'arc', name: 'Arc Light', color: '#4fe3ff',
    title: ['Live Wire', 'High Voltage'],
    card: [
      'linear-gradient(115deg,transparent 46%,#4fe3ff 48%,#e8fbff 50%,#4fe3ff 52%,transparent 54%),linear-gradient(90deg,#06121a,#0d2a3a)',
      'repeating-linear-gradient(90deg,transparent 0 22px,rgba(79,227,255,.25) 22px 24px),repeating-linear-gradient(0deg,transparent 0 22px,rgba(79,227,255,.25) 22px 24px),#071820',
      'radial-gradient(circle at 82% 50%,#e8fbff 0 5%,#4fe3ff 12%,rgba(79,227,255,.2) 30%,transparent 50%),linear-gradient(90deg,#030a10,#0a2030)',
    ],
    tracer: [0x4fe3ff, 0xe8fbff], nade: 0x1a6a80, armour: 0x14485a,
    knife: { blade: 0x4fe3ff, handle: 0x06121a, glow: true },
  },
];

/** The theme of a season ('SYYYY-MM'): they take turns month by month. */
export function themeOf(id = seasonId()) {
  const [y, m] = id.slice(1).split('-').map(Number);
  return THEMES[((y * 12 + (m - 1)) % THEMES.length + THEMES.length) % THEMES.length];
}

const itemId = (theme, slot, n) => `sp-${theme.id}-${slot}${n}`;

/** Every pass item, per cosmetic slot, for cosmetics.js to add to its lists. */
export function passItems() {
  const out = { title: [], card: [], tracer: [], nade: [], armour: [], knife: [] };
  for (const t of THEMES) {
    for (const [tier, slot, n] of LAYOUT) {
      const base = { id: itemId(t, slot, n), pass: t.id, tier };
      if (slot === 'title') out.title.push({ ...base, name: t.title[n] });
      else if (slot === 'card') out.card.push({ ...base, name: `${t.name}${n ? ` ${['', 'II', 'III'][n]}` : ''}`, css: t.card[n] });
      else if (slot === 'tracer') out.tracer.push({ ...base, name: `${t.name}${n ? ' II' : ''}`, color: t.tracer[n] });
      else if (slot === 'nade') out.nade.push({ ...base, name: t.name, color: t.nade });
      else if (slot === 'armour') out.armour.push({ ...base, name: t.name, color: t.armour });
      else if (slot === 'knife') out.knife.push({ ...base, name: t.name, ...t.knife });
    }
  }
  return out;
}

/** The reward track of a season: [{ tier, slot, id } | { tier, xp }] for tiers 1..PASS_TIERS. */
export function track(id = seasonId()) {
  const t = themeOf(id), out = [];
  for (let tier = 1; tier <= PASS_TIERS; tier++) {
    const r = LAYOUT.find((l) => l[0] === tier);
    out.push(r ? { tier, slot: r[1], id: itemId(t, r[1], r[2]) } : { tier, xp: PASS_BONUS_XP });
  }
  return out;
}

export const tierOf = (xp) => Math.min(PASS_TIERS, Math.floor(Math.max(0, xp) / PASS_TIER_XP));
export { seasonId, seasonName, msToSeasonEnd };
