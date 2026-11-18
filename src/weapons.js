// Weapon definitions, loadouts and per-character weapon state.
//
// Everyone carries a primary and a sidearm (their choice of each) and a few grenades.
//
// Special weapon fields:
//   burst, burstGap   one trigger pull fires `burst` rounds, `burstGap` s apart
//                     (`interval` is the pause after a whole burst)
//   projectile        fires a bolt that flies and drops (speed m/s, gravity m/s²)
//                     instead of a hitscan bullet; see bolts.js

import { withAttachments } from './attachments.js';

const DEFS = [
  {
    id: 'pistol', name: 'Pistol', blurb: 'Twelve in the mag. Never runs dry.',
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
    id: 'rifle', name: 'Assault Rifle', blurb: 'Full auto. Holds steady at range.',
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
    id: 'smg', name: 'SMG', blurb: 'Fastest trigger here. Quits past twenty metres.',
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
    id: 'shotgun', name: 'Shotgun', blurb: 'Eight pellets. Built for doorways.',
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
    id: 'sniper', name: 'Sniper Rifle', blurb: 'Bolt action. One clean headshot.',
    damage: 80, pellets: 1,
    magSize: 3, reserveStart: 21, reserveMax: 36, ammoBox: 6,
    auto: false, interval: 1.15, reload: 2.4,
    spreadMin: 0.05, spreadMax: 0.06, heatPerShot: 0.5, heatDecay: 1.5,
    adsSpread: 0.012, adsFov: 0.24, moveSpread: 1.6, scope: true,
    falloffStart: 200, falloffEnd: 400, falloffMin: 1,
    range: 400, recoil: 0.065, kick: 0.13, speedMult: 0.94,
    noise: 60, botRange: 34, botMaxRange: 90,
  },
  {
    id: 'lmg', name: 'LMG', blurb: 'Sixty-round belt. Slow to move, slow to stop.',
    damage: 17, pellets: 1,
    magSize: 60, reserveStart: 120, reserveMax: 180, ammoBox: 30,
    auto: true, interval: 0.105, reload: 3.6,
    spreadMin: 0.011, spreadMax: 0.07, heatPerShot: 0.045, heatDecay: 2.0,
    adsSpread: 0.4, adsFov: 0.7, moveSpread: 1.7,
    falloffStart: 30, falloffEnd: 80, falloffMin: 0.6,
    range: 200, recoil: 0.012, kick: 0.04, speedMult: 0.86,
    noise: 50, botRange: 18, botMaxRange: 60,
  },
  // ---- added later: new entries go on the end (the index is the wire number)
  {
    id: 'burst', name: 'Burst Rifle', blurb: 'Three rounds a pull. Land five and they drop.',
    damage: 20, pellets: 1, burst: 3, burstGap: 0.064,
    magSize: 30, reserveStart: 90, reserveMax: 180, ammoBox: 30,
    auto: false, interval: 0.3, reload: 2.1,
    spreadMin: 0.004, spreadMax: 0.04, heatPerShot: 0.09, heatDecay: 2.6,
    adsSpread: 0.4, adsFov: 0.6, moveSpread: 1.2,
    falloffStart: 32, falloffEnd: 80, falloffMin: 0.62,
    range: 200, recoil: 0.0125, kick: 0.04, speedMult: 1,
    noise: 45, botRange: 18, botMaxRange: 60,
  },
  {
    id: 'dmr', name: 'Marksman Rifle', blurb: 'Semi-auto, low zoom. Three to the body, two with a head.',
    damage: 42, pellets: 1,
    magSize: 12, reserveStart: 48, reserveMax: 72, ammoBox: 12,
    auto: false, interval: 0.27, reload: 2.3,
    spreadMin: 0.012, spreadMax: 0.06, heatPerShot: 0.22, heatDecay: 2.2,
    adsSpread: 0.1, adsFov: 0.45, moveSpread: 1.4, scope: 'low', short: 'Marksman',
    falloffStart: 55, falloffEnd: 130, falloffMin: 0.8,
    range: 300, recoil: 0.03, kick: 0.07, speedMult: 0.96,
    noise: 52, botRange: 26, botMaxRange: 80,
  },
  {
    id: 'crossbow', name: 'Crossbow', blurb: 'Silent. One bolt kills. Lead your target; it drops.',
    damage: 110, pellets: 1, projectile: { speed: 85, gravity: 7 },
    magSize: 1, reserveStart: 14, reserveMax: 24, ammoBox: 5,
    auto: false, interval: 0.25, reload: 1.45,
    spreadMin: 0.006, spreadMax: 0.03, heatPerShot: 0, heatDecay: 2,
    adsSpread: 0.15, adsFov: 0.55, moveSpread: 1.4,
    falloffStart: 400, falloffEnd: 500, falloffMin: 1,
    range: 300, recoil: 0.03, kick: 0.06, speedMult: 1,
    noise: 7, botRange: 18, botMaxRange: 45,
  },
  {
    id: 'revolver', name: 'Revolver', blurb: 'Six heavy rounds. Two to the body up close.',
    damage: 52, pellets: 1, sidearm: true,
    magSize: 6, reserveStart: Infinity, reserveMax: Infinity, ammoBox: 0,
    auto: false, interval: 0.42, reload: 2.2,
    spreadMin: 0.006, spreadMax: 0.05, heatPerShot: 0.5, heatDecay: 2.2,
    adsSpread: 0.35, adsFov: 0.75, moveSpread: 1.2,
    falloffStart: 16, falloffEnd: 45, falloffMin: 0.5,
    range: 200, recoil: 0.045, kick: 0.1, speedMult: 1.03,
    noise: 48, botRange: 12, botMaxRange: 40,
  },
];

/** All weapons. `index` is the weapon's number on the wire in multiplayer. */
export const WEAPONS = DEFS.map((d, i) => ({ ...d, index: i }));
export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));
export const PISTOL = WEAPON_BY_ID.pistol;
export const PRIMARIES = ['rifle', 'burst', 'smg', 'shotgun', 'dmr', 'sniper', 'lmg', 'crossbow'];
export const DEFAULT_PRIMARY = 'rifle';
export const SECONDARIES = ['pistol', 'revolver'];
export const DEFAULT_SECONDARY = 'pistol';

export function isPrimary(id) { return PRIMARIES.includes(id); }
export function isSecondary(id) { return SECONDARIES.includes(id); }

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
  blurb: 'Whites out anyone facing it',
};

/** A thick cloud that blocks sight for a while. No damage. */
export const SMOKE = {
  kind: 'smoke', index: 2, name: 'Smoke', short: 'Smoke', color: 0x55606a,
  start: 2, max: 2,
  fuse: 1.2, speed: 15, gravity: 20,
  radius: 4.6, // cloud radius once it has spread
  life: 15, // seconds the cloud lasts
  cooldown: 0.9, noise: 10,
  blurb: 'A wall nobody sees through',
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
    burstLeft: 0, // burst weapons: rounds still to come from this trigger pull
  };
}

/** [primary, sidearm]; `att` = { gunId: attachment code } (see attachments.js) */
export function makeLoadout(primaryId, secondaryId = DEFAULT_SECONDARY, att = null) {
  const prim = WEAPON_BY_ID[isPrimary(primaryId) ? primaryId : DEFAULT_PRIMARY];
  const side = WEAPON_BY_ID[isSecondary(secondaryId) ? secondaryId : DEFAULT_SECONDARY];
  const a = att || {};
  return [makeState(withAttachments(prim, a[prim.id])), makeState(withAttachments(side, a[side.id]))];
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
