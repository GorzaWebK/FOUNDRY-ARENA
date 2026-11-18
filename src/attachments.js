// Weapon attachments (the Gunsmith). Every gun has four slots: muzzle,
// underbarrel, magazine and stock, each empty or holding one of two
// attachments. An attachment unlocks after enough kills with that gun (career
// stats) and changes the gun's numbers; most also show on the model.
//
// A gun's set travels as one small number (`code`, 2 bits a slot) in settings,
// over the network and in models' cache keys. withAttachments(def, code) gives
// the modified weapon definition (same id and wire index as the base gun).

export const ATT_SLOTS = [
  { id: 'muzzle', name: 'Muzzle' },
  { id: 'under', name: 'Underbarrel' },
  { id: 'mag', name: 'Magazine' },
  { id: 'stock', name: 'Stock' },
];

const SIDEARMS = ['pistol', 'revolver'];

/** Per slot: index 0 is always "none". `not` = guns it doesn't fit. */
export const ATTACHMENTS = {
  muzzle: [
    { id: 'none', name: 'None' },
    {
      id: 'supp', name: 'Suppressor', kills: 10, not: ['shotgun'],
      desc: 'Quiet shots that others only hear from close by, and a small flash. Damage falls off sooner.',
      mods: (d) => ({ noise: Math.round(d.noise * 0.35), falloffStart: d.falloffStart * 0.85, falloffEnd: d.falloffEnd * 0.85, suppressed: true }),
    },
    {
      id: 'comp', name: 'Compensator', kills: 30,
      desc: 'Tames the muzzle: 30% less recoil and kick.',
      mods: (d) => ({ recoil: d.recoil * 0.7, kick: d.kick * 0.75 }),
    },
  ],
  under: [
    { id: 'none', name: 'None' },
    {
      id: 'grip', name: 'Foregrip', kills: 20, not: SIDEARMS,
      desc: 'Less bloom from holding the trigger and from moving.',
      mods: (d) => ({ heatPerShot: d.heatPerShot * 0.78, moveSpread: d.moveSpread * 0.85 }),
    },
    {
      id: 'laser', name: 'Laser', kills: 45,
      desc: 'A tighter cone from the hip.',
      mods: (d) => ({ spreadMin: d.spreadMin * 0.75, spreadMax: d.spreadMax * 0.8, laser: true }),
    },
  ],
  mag: [
    { id: 'none', name: 'None' },
    {
      id: 'ext', name: 'Extended mag', kills: 25,
      desc: 'Half as many rounds again, but a slower reload.',
      mods: (d) => ({ magSize: Math.max(d.magSize + 1, Math.round(d.magSize * 1.5)), reload: d.reload * 1.12 }),
    },
    {
      id: 'fast', name: 'Fast mag', kills: 60,
      desc: 'Reloads a quarter faster.',
      mods: (d) => ({ reload: d.reload * 0.75 }),
    },
  ],
  stock: [
    { id: 'none', name: 'None' },
    {
      id: 'light', name: 'Light stock', kills: 35, not: SIDEARMS,
      desc: 'Up to the sights faster, and a little quicker on your feet.',
      mods: (d) => ({ adsRate: (d.adsRate || 14) * 1.4, speedMult: d.speedMult + 0.03 }),
    },
    {
      id: 'heavy', name: 'Heavy stock', kills: 80, not: SIDEARMS,
      desc: 'Steadier aiming: less recoil and a tighter aimed cone, but a little slower.',
      mods: (d) => ({ recoil: d.recoil * 0.82, adsSpread: d.adsSpread * 0.8, speedMult: d.speedMult - 0.03 }),
    },
  ],
};

/** Does attachment `a` fit gun `gunId`? */
export const fits = (a, gunId) => a.id === 'none' || !(a.not && a.not.includes(gunId));

/** { muzzle: 'supp', ... } <-> code */
export function attCode(set) {
  let code = 0;
  ATT_SLOTS.forEach((s, i) => {
    const k = ATTACHMENTS[s.id].findIndex((a) => a.id === (set && set[s.id]));
    if (k > 0) code |= k << (i * 2);
  });
  return code;
}
export function attSet(code) {
  const out = {};
  ATT_SLOTS.forEach((s, i) => { out[s.id] = (ATTACHMENTS[s.id][(code >> (i * 2)) & 3] || ATTACHMENTS[s.id][0]).id; });
  return out;
}
/** The attachments in a code, as objects (skipping empty slots and ones that don't fit). */
export function attList(code, gunId) {
  const out = [];
  ATT_SLOTS.forEach((s, i) => {
    const a = ATTACHMENTS[s.id][(code >> (i * 2)) & 3];
    if (a && a.id !== 'none' && fits(a, gunId)) out.push({ slot: s.id, ...a });
  });
  return out;
}

/** A code with anything that doesn't fit `gunId` taken out. */
export function cleanCode(code, gunId) {
  let out = 0;
  ATT_SLOTS.forEach((s, i) => {
    const k = (code >> (i * 2)) & 3;
    const a = ATTACHMENTS[s.id][k];
    if (k > 0 && a && fits(a, gunId)) out |= k << (i * 2);
  });
  return out;
}

const cache = new Map();
/** The gun's definition with this set of attachments (cached; `att` holds the code). */
export function withAttachments(def, code) {
  code = cleanCode(code | 0, def.id);
  if (!code) return def;
  const key = `${def.id}|${code}`;
  let d = cache.get(key);
  if (!d) {
    d = { ...def };
    for (const a of attList(code, def.id)) Object.assign(d, a.mods(d));
    d.att = code;
    cache.set(key, d);
  }
  return d;
}

/** Unlocked? (kills with that gun, from career stats) */
export function attUnlocked(a, kills) { return a.id === 'none' || kills >= a.kills; }

/** A random, plausible set for a bot. */
export function randomCode(gunId) {
  let code = 0;
  ATT_SLOTS.forEach((s, i) => {
    if (Math.random() < 0.45) {
      const k = 1 + ((Math.random() * 2) | 0);
      if (fits(ATTACHMENTS[s.id][k], gunId)) code |= k << (i * 2);
    }
  });
  return code;
}
