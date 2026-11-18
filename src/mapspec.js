// Custom maps: the compact format the map editor saves, how it becomes a full
// map object (the same shape as the files in src/maps/), validation with the
// real collision world and bot nav grid, share codes, and a registry so
// getMap() can find custom maps by id.
//
// spec = {
//   v: 1, name, w, d,            size in metres (the map is centred on 0,0)
//   theme,                       a built-in map id whose look (materials, sky, set dressing) it borrows
//   s:  [[t, x0,y0,z0, x1,y1,z1, mat, dir, steps], ...]   t: 'b' box | 'r' ramp | 's' stairs
//   sp: [[x,y,z], ...]           spawns (they face the middle)
//   pk: [[type, x,y,z], ...]     pickups: health | armor | ammo | crate
//   fl: [[x,y,z], [x,y,z]] or [] flag bases (Cobalt, Crimson) for Capture the Flag
//   hl: [[x,y,z,r], ...]         King of the Hill zones
// }

import { World } from './world.js';
import { NavGrid } from './navgrid.js';

// (the types pickups.js knows; listed here so this file stays free of three.js for the map checker)
export const PICKUP_KINDS = ['health', 'armor', 'ammo', 'crate'];

export const SPEC_LIMITS = { minSize: 30, maxSize: 140, maxSolids: 400, maxSpawns: 24, maxPickups: 24, maxHills: 6, wallH: 9 };
export const EDITOR_MATS = ['concrete', 'wall', 'metal', 'metalDark', 'crate', 'ramp', 'blue', 'orange', 'green'];
const DEFAULT_MATS = {
  floor: { color: '#8a8f94', tex: 'tiles', scale: 4 },
  wall: { color: '#6a7480', tex: 'concrete', scale: 5 },
  concrete: { color: '#a9afb6', tex: 'concrete', scale: 4 },
  metal: { color: '#8a96a3', tex: 'plates', scale: 2 },
  metalDark: { color: '#4f5864', tex: 'plates', scale: 2 },
  crate: { color: '#b98a4e', tex: 'crate' },
  ramp: { color: '#7f8894', tex: 'plates', scale: 2 },
  blue: { color: '#4f7fb8', tex: 'plates', scale: 3 },
  orange: { color: '#c9742f', tex: 'plates', scale: 3 },
  green: { color: '#5d8a5a', tex: 'plates', scale: 3 },
};

let builtins = [];
/** Called once by maps/index.js with the built-in maps (themes come from them). */
export function setBuiltinMaps(list) { builtins = list; }
export function themes() { return builtins.map((m) => ({ id: m.id, name: m.name })); }

const r2 = (v) => Math.round(v * 100) / 100;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} _.\-'!?#&]/gu, '').trim().slice(0, n);

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** A blank map to start from. */
export function blankSpec() {
  return {
    v: 1, name: 'Untitled yard', w: 60, d: 60, theme: 'foundry',
    s: [
      ['b', -2, 0, -2, 2, 1, 2, 'concrete'],
      ['s', -1, 0, 2, 1, 1, 4, 'ramp', '-z', 2], ['s', -1, 0, -4, 1, 1, -2, 'ramp', '+z', 2],
      ['b', -16, 0, -4, -14, 1.5, 4, 'metalDark'], ['b', 14, 0, -4, 16, 1.5, 4, 'metalDark'],
      ['b', -4, 0, -16, 4, 1.5, -14, 'metalDark'], ['b', -4, 0, 14, 4, 1.5, 16, 'metalDark'],
    ],
    sp: [[-24.5, 0, -24.5], [24.5, 0, 24.5], [-24.5, 0, 24.5], [24.5, 0, -24.5], [0.5, 0, -25.5], [0.5, 0, 25.5], [-25.5, 0, 0.5], [25.5, 0, 0.5]],
    pk: [['health', -10.5, 0, 0.5], ['health', 10.5, 0, 0.5], ['ammo', 0.5, 0, -10.5], ['armor', 0.5, 1, 0.5]],
    fl: [[-22.5, 0, 0.5], [22.5, 0, 0.5]],
    hl: [[0.5, 1, 0.5, 4]],
  };
}

/** Make a spec safe and in range (anything that came from a code or the network). */
export function cleanSpec(raw) {
  if (!raw || typeof raw !== 'object' || raw.v !== 1) throw new Error("That isn't a Foundry Arena map.");
  const L = SPEC_LIMITS;
  const size = (v) => Math.max(L.minSize, Math.min(L.maxSize, Math.round(num(v) ? v : 60)));
  const w = size(raw.w), d = size(raw.d), hw = w / 2, hd = d / 2;
  const cx = (v) => r2(Math.max(-hw, Math.min(hw, num(v) ? v : 0)));
  const cz = (v) => r2(Math.max(-hd, Math.min(hd, num(v) ? v : 0)));
  const cy = (v) => r2(Math.max(0, Math.min(30, num(v) ? v : 0)));
  const spec = { v: 1, name: clean(raw.name, 28) || 'Untitled yard', w, d, theme: builtins.some((m) => m.id === raw.theme) ? raw.theme : (builtins[0] && builtins[0].id) || 'foundry', s: [], sp: [], pk: [], fl: [], hl: [] };
  if (raw.author) spec.author = clean(raw.author, 18);
  for (const e of (Array.isArray(raw.s) ? raw.s : []).slice(0, L.maxSolids)) {
    if (!Array.isArray(e) || !['b', 'r', 's'].includes(e[0])) continue;
    let [x0, y0, z0, x1, y1, z1] = [cx(e[1]), cy(e[2]), cz(e[3]), cx(e[4]), cy(e[5]), cz(e[6])];
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    if (x1 - x0 < 0.1 || y1 - y0 < 0.05 || z1 - z0 < 0.1) continue;
    const mat = EDITOR_MATS.includes(e[7]) ? e[7] : 'concrete';
    const item = [e[0], x0, y0, z0, x1, y1, z1, mat];
    if (e[0] !== 'b') item.push(['+x', '-x', '+z', '-z'].includes(e[8]) ? e[8] : '+z');
    if (e[0] === 's') item.push(Math.max(1, Math.min(40, Math.round(num(e[9]) ? e[9] : 4))));
    spec.s.push(item);
  }
  for (const p of (Array.isArray(raw.sp) ? raw.sp : []).slice(0, L.maxSpawns)) if (Array.isArray(p)) spec.sp.push([cx(p[0]), cy(p[1]), cz(p[2])]);
  for (const p of (Array.isArray(raw.pk) ? raw.pk : []).slice(0, L.maxPickups)) if (Array.isArray(p) && PICKUP_KINDS.includes(p[0])) spec.pk.push([p[0], cx(p[1]), cy(p[2]), cz(p[3])]);
  if (Array.isArray(raw.fl) && raw.fl.length === 2 && raw.fl.every(Array.isArray)) spec.fl = raw.fl.map((p) => [cx(p[0]), cy(p[1]), cz(p[2])]);
  for (const h of (Array.isArray(raw.hl) ? raw.hl : []).slice(0, L.maxHills)) if (Array.isArray(h)) spec.hl.push([cx(h[0]), cy(h[1]), cz(h[2]), Math.max(2, Math.min(8, num(h[3]) ? h[3] : 4))]);
  return spec;
}

/** The full map object the game runs, from a (clean) spec. */
export function buildMap(spec) {
  const theme = builtins.find((m) => m.id === spec.theme) || builtins[0] || {};
  const hw = spec.w / 2, hd = spec.d / 2, H = SPEC_LIMITS.wallH;
  const box = (min, max, mat) => ({ type: 'box', min, max, mat });
  const solids = [
    box([-hw, -1, -hd], [hw, 0, hd], 'floor'),
    box([-hw - 1, 0, -hd - 1], [hw + 1, H, -hd], 'wall'), box([-hw - 1, 0, hd], [hw + 1, H, hd + 1], 'wall'),
    box([-hw - 1, 0, -hd], [-hw, H, hd], 'wall'), box([hw, 0, -hd], [hw + 1, H, hd], 'wall'),
  ];
  for (const e of spec.s) {
    const [t, x0, y0, z0, x1, y1, z1, mat, dir, steps] = e;
    if (t === 'b') solids.push(box([x0, y0, z0], [x1, y1, z1], mat));
    else if (t === 'r') solids.push({ type: 'ramp', min: [x0, y0, z0], max: [x1, y1, z1], dir, mat });
    else solids.push({ type: 'stairs', min: [x0, y0, z0], max: [x1, y1, z1], dir, steps, mat });
  }
  const yaw = (x, z) => Math.round((Math.atan2(x, z) * 180) / Math.PI);
  const materials = { ...DEFAULT_MATS };
  for (const k of Object.keys(DEFAULT_MATS)) if (theme.materials && theme.materials[k]) materials[k] = theme.materials[k];
  const code = JSON.stringify(spec);
  const pickups = spec.pk.map(([type, x, y, z]) => ({ type, pos: [x, y, z] }));
  return {
    id: 'c-' + hash(code),
    custom: true,
    spec,
    name: spec.name,
    blurb: spec.author ? `Community map by ${spec.author}` : 'Custom map',
    bounds: { minX: -hw, maxX: hw, minZ: -hd, maxZ: hd },
    materials,
    sky: theme.sky,
    lights: [],
    decor: theme.decor ? { ...theme.decor, barrels: Math.min(6, theme.decor.barrels || 0) } : undefined,
    solids,
    spawns: spec.sp.map(([x, y, z]) => [x, y, z, yaw(x, z)]),
    pickups,
    flags: spec.fl.length === 2 ? spec.fl : null,
    hills: spec.hl,
    pois: [...spec.sp, ...pickups.map((p) => p.pos), ...spec.hl.map((h) => [h[0], h[1], h[2]])],
  };
}

/** Check a map with the real collision world and bot nav grid: { errors, warnings, nav }. */
export function validateMap(map) {
  const errors = [], warnings = [];
  const spec = map.spec;
  if (spec.sp.length < 2) errors.push('Add at least 2 spawns (8 or more plays best).');
  else if (spec.sp.length < 6) warnings.push(`Only ${spec.sp.length} spawns: 8 or more plays better with bots and friends.`);
  if (!spec.fl.length) warnings.push('No flags: Capture the Flag will be swapped for Team Deathmatch on this map.');
  if (!spec.hl.length) warnings.push('No hill: King of the Hill will be swapped for Team Deathmatch on this map.');
  for (const e of spec.s) {
    const [t, x0, y0, z0, x1, y1, z1, , dir, steps] = e;
    const run = dir === '+x' || dir === '-x' ? x1 - x0 : z1 - z0;
    if (t === 'r' && (y1 - y0) / Math.max(0.1, run) > 0.6) { errors.push('A ramp is too steep to walk up (keep it at most 1 m up for every 2 m along).'); break; }
    if (t === 's' && (y1 - y0) / steps > 0.55) { errors.push('A staircase has steps over 0.5 m high: add more steps.'); break; }
    if (t === 's' && run / steps < 0.95) { errors.push("A staircase's steps are too shallow to stand on: make it longer or use fewer steps (about 1 m each)."); break; }
  }
  let nav = null;
  if (!errors.length && spec.sp.length) {
    try {
      const world = new World(map);
      nav = new NavGrid(world);
      const s0 = map.spawns[0];
      nav.markReachable(s0[0], s0[1], s0[2]);
      const reach = (p) => { const id = nav.nodeAt(p[0], p[2], p[1], 0.3); return id >= 0 && nav.reach[id]; };
      const badSpawns = map.spawns.filter((s) => !reach(s)).length;
      if (badSpawns) errors.push(`${badSpawns} spawn${badSpawns > 1 ? 's' : ''} can't be reached from the first one (walled in, inside something, or on a ledge with no way down).`);
      const badPk = map.pickups.filter((p) => !reach(p.pos)).length;
      if (badPk) errors.push(`${badPk} pickup${badPk > 1 ? 's are' : ' is'} unreachable.`);
      if (map.flags && map.flags.some((f) => !reach(f))) errors.push("A flag base can't be reached.");
    } catch (e) {
      errors.push('The map could not be built: ' + e.message);
    }
  }
  return { errors, warnings, nav };
}

// ---------------------------------------------------------------- share codes

const toB64 = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64 = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** A text code for a map: FAM1.<base64url JSON> */
export function specToCode(spec) { return 'FAM1.' + toB64(JSON.stringify(spec)); }

/** Read a map code (throws an Error with a message for the player). */
export function codeToSpec(code) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!c.startsWith('FAM1.')) throw new Error('Map codes start with FAM1. Copy the whole code.');
  let raw;
  try { raw = JSON.parse(fromB64(c.slice(5))); } catch (e) { throw new Error('That map code is damaged or incomplete.'); }
  return cleanSpec(raw);
}

// ---------------------------------------------------------------- registry

const custom = new Map();
/** Make a custom map findable by getMap(id). Returns the map. */
export function registerMap(map) { custom.set(map.id, map); return map; }
export function customMap(id) { return custom.get(id) || null; }
export function customMaps() { return [...custom.values()]; }

/** The mode to actually play on `map`: objective modes need their flags / hills. */
export function fitMode(modeId, map) {
  if (modeId === 'ctf' && !map.flags) return 'tdm';
  if (modeId === 'koth' && !(map.hills && map.hills.length)) return 'tdm';
  if (modeId === 'dom' && !(map.hills && map.hills.length >= 3)) return 'tdm';
  if (modeId === 'sd' && !(map.flags && map.hills && map.hills.length >= 2)) return 'tdm';
  return modeId;
}
