// Weapon definitions, loadouts and per-character weapon state.
//
// Everyone carries a primary (their choice) plus the pistol, and a few grenades.

const DEFS = [
  {
    id: 'pistol', name: 'Pistol', blurb: 'Sidearm. Never runs dry.',
    damage: 25, pellets: 1,
    magSize: 12, reserveStart: Infinity, reserveMax: Infinity, ammoBox: 0,
    auto: false, interval: 0.15, reload: 1.3,
    spreadMin: 0.004, spreadMax: 0.035, heatPerShot: 0.28, heatDecay: 3.0,
    adsSpread: 0.4, adsFov: 0.78, moveSpread: 1.2,
    falloffStart: 22, falloffEnd: 60, falloffMin: 0.5,
    range: 200, recoil: 0.02, kick: 0.05, speedMult: 1.04,
    noise: 38, botRange: 12, botMaxRange: 45,
  },
  {
    id: 'rifle', name: 'Assault Rifle', blurb: 'All-rounder. Full auto, good at any range.',
    damage: 15, pellets: 1,
    magSize: 30, reserveStart: 90, reserveMax: 180, ammoBox: 30,
    auto: true, interval: 0.095, reload: 2.0,
    spreadMin: 0.005, spreadMax: 0.055, heatPerShot: 0.075, heatDecay: 2.4,
    adsSpread: 0.45, adsFov: 0.62, moveSpread: 1.2,
    falloffStart: 30, falloffEnd: 75, falloffMin: 0.6,
    range: 200, recoil: 0.0105, kick: 0.035, speedMult: 1,
    noise: 45, botRange: 16, botMaxRange: 60,
  },
  {
    id: 'smg', name: 'SMG', blurb: 'Fast and mobile. Shreds up close, fades at range.',
    damage: 12, pellets: 1,
    magSize: 32, reserveStart: 128, reserveMax: 224, ammoBox: 32,
    auto: true, interval: 0.066, reload: 1.6,
    spreadMin: 0.009, spreadMax: 0.06, heatPerShot: 0.05, heatDecay: 2.8,
    adsSpread: 0.6, adsFov: 0.74, moveSpread: 0.45,
    falloffStart: 12, falloffEnd: 38, falloffMin: 0.42,
    range: 150, recoil: 0.0075, kick: 0.025, speedMult: 1.06,
    noise: 40, botRange: 9, botMaxRange: 30,
  },
  {
    id: 'shotgun', name: 'Shotgun', blurb: '8 pellets a shell. Devastating within a few metres.',
    damage: 10, pellets: 8,
    magSize: 6, reserveStart: 24, reserveMax: 42, ammoBox: 6,
    auto: false, interval: 0.8, reload: 2.3,
    spreadMin: 0.075, spreadMax: 0.085, heatPerShot: 0, heatDecay: 3.0,
    adsSpread: 0.85, adsFov: 0.86, moveSpread: 0,
    falloffStart: 7, falloffEnd: 26, falloffMin: 0.2,
    range: 80, recoil: 0.055, kick: 0.11, speedMult: 1,
    noise: 50, botRange: 5, botMaxRange: 18,
  },
  {
    id: 'sniper', name: 'Sniper Rifle', blurb: 'Bolt action with a scope. One headshot is enough.',
    damage: 80, pellets: 1,
    magSize: 2, reserveStart: 20, reserveMax: 36, ammoBox: 6,
    auto: false, interval: 1.15, reload: 2.4,
    spreadMin: 0.05, spreadMax: 0.06, heatPerShot: 0.5, heatDecay: 1.5,
    adsSpread: 0.012, adsFov: 0.24, moveSpread: 1.6, scope: true,
    falloffStart: 200, falloffEnd: 400, falloffMin: 1,
    range: 400, recoil: 0.065, kick: 0.13, speedMult: 0.94,
    noise: 60, botRange: 34, botMaxRange: 90,
  },
  {
    id: 'lmg', name: 'LMG', blurb: '60-round belt. Heavy and slow, hits hard.',
    damage: 17, pellets: 1,
    magSize: 60, reserveStart: 120, reserveMax: 180, ammoBox: 30,
    auto: true, interval: 0.105, reload: 3.6,
    spreadMin: 0.011, spreadMax: 0.07, heatPerShot: 0.045, heatDecay: 2.0,
    adsSpread: 0.4, adsFov: 0.7, moveSpread: 1.7,
    falloffStart: 30, falloffEnd: 80, falloffMin: 0.6,
    range: 200, recoil: 0.012, kick: 0.04, speedMult: 0.86,
    noise: 50, botRange: 18, botMaxRange: 60,
  },
];

/** All weapons. `index` is the weapon's number on the wire in multiplayer. */
export const WEAPONS = DEFS.map((d, i) => ({ ...d, index: i }));
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const PISTOL = WEAPON_BY_ID.pistol;
export const PRIMARIES = ['rifle', 'smg', 'shotgun', 'sniper', 'lmg'];
export const DEFAULT_PRIMARY = 'rifle';

export function isPrimary(id) { return PRIMARIES.includes(id); }

// Hold the throw key to "cook" any grenade: the fuse burns while you hold it,
// and one held too long goes off in your hand.
export const GRENADE = {
  kind: 'frag', index: 0, name: 'Grenade', color: 0x3f4a2c,
  start: 2, max: 3,
  fuse: 2.3, speed: 17, gravity: 20,
  radius: 7.5, damage: 130, selfScale: 0.6,
  cooldown: 0.9, noise: 70,
};

/** Blinds and deafens anyone looking towards it (yourself included). No damage. */
export const FLASH = {
  kind: 'flash', index: 1, name: 'Flashbang', short: 'Flash', color: 0xc9ccd0,
  start: 2, max: 2,
  fuse: 1.6, speed: 17, gravity: 20,
  radius: 22, // blinds out to this distance (with line of sight)
  maxBlind: 3.6, // seconds of white-out, facing it up close
  cooldown: 0.9, noise: 45,
  blurb: 'Blinds anyone looking at it',
};

/** A thick cloud that blocks sight for a while. No damage. */
export const SMOKE = {
  kind: 'smoke', index: 2, name: 'Smoke', short: 'Smoke', color: 0x55606a,
  start: 2, max: 2,
  fuse: 1.2, speed: 15, gravity: 20,
  radius: 4.6, // cloud radius once it has spread
  life: 15, // seconds the cloud lasts
  cooldown: 0.9, noise: 10,
  blurb: 'A cloud nobody can see through',
};

export const NADES = [GRENADE, FLASH, SMOKE];
export const TACTICALS = ['flash', 'smoke'];
export const DEFAULT_TACTICAL = 'flash';
export const TACTICAL_BY_ID = { flash: FLASH, smoke: SMOKE };
export const isTactical = (id) => TACTICALS.includes(id);

/** Quick melee (V). Usable at any time, whatever gun is in your hands. */
export const KNIFE = {
  id: 'knife', name: 'Knife',
  range: 2.3, // metres from you to a target that can be hit
  lunge: 3.0, // a target this close (but out of reach) pulls you in
  cone: 0.55, // cos of the half-angle in front of you that counts
  damage: 55, // two from the front
  backstab: 150, // one from behind
  cooldown: 0.65, busy: 0.4, // busy = no shooting while the swing plays
  noise: 6,
};

export const SWITCH_TIME = 0.35;

function makeState(def) {
  return {
    def,
    mag: def.magSize,
    reserve: def.reserveStart,
    cooldown: 0,
    reloadT: 0, // seconds remaining, 0 = not reloading
    heat: 0, // 0..1 sustained-fire bloom
    sinceShot: 9,
  };
}

/** [primary, pistol] */
export function makeLoadout(primaryId) {
  const prim = WEAPON_BY_ID[isPrimary(primaryId) ? primaryId : DEFAULT_PRIMARY];
  return [makeState(prim), makeState(PISTOL)];
}

/** Gun game: just the one gun, with bottomless reserve ammo. */
export function makeSingle(id) {
  const s = makeState(WEAPON_BY_ID[id]);
  s.reserve = Infinity;
  return [s];
}

export function damageAtDistance(def, dist) {
  if (dist <= def.falloffStart) return def.damage;
  if (dist >= def.falloffEnd) return def.damage * def.falloffMin;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return def.damage * (1 - t * (1 - def.falloffMin));
}
