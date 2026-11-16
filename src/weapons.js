// Weapon definitions and per-character weapon state.

export const WEAPONS = [
  {
    id: 'pistol', name: 'Pistol', slot: 0,
    damage: 25, pellets: 1,
    magSize: 12, reserveStart: Infinity, reserveMax: Infinity,
    auto: false, interval: 0.15, reload: 1.3,
    spreadMin: 0.004, spreadMax: 0.035, heatPerShot: 0.28, heatDecay: 3.0,
    adsSpread: 0.4, adsFov: 0.78,
    falloffStart: 22, falloffEnd: 60, falloffMin: 0.5,
    range: 200, recoil: 0.02, kick: 0.05,
    noise: 38,
    botRange: 12, botMaxRange: 45,
  },
  {
    id: 'rifle', name: 'Assault Rifle', slot: 1,
    damage: 15, pellets: 1,
    magSize: 30, reserveStart: 60, reserveMax: 150,
    auto: true, interval: 0.095, reload: 2.0,
    spreadMin: 0.005, spreadMax: 0.055, heatPerShot: 0.075, heatDecay: 2.4,
    adsSpread: 0.45, adsFov: 0.62,
    falloffStart: 30, falloffEnd: 75, falloffMin: 0.6,
    range: 200, recoil: 0.0105, kick: 0.035,
    noise: 45,
    botRange: 16, botMaxRange: 60,
  },
  {
    id: 'shotgun', name: 'Shotgun', slot: 2,
    damage: 10, pellets: 8,
    magSize: 6, reserveStart: 12, reserveMax: 36,
    auto: false, interval: 0.8, reload: 2.3,
    spreadMin: 0.075, spreadMax: 0.085, heatPerShot: 0, heatDecay: 3.0,
    adsSpread: 0.85, adsFov: 0.86,
    falloffStart: 7, falloffEnd: 26, falloffMin: 0.2,
    range: 80, recoil: 0.055, kick: 0.11,
    noise: 50,
    botRange: 5, botMaxRange: 18,
  },
];

export const SWITCH_TIME = 0.35;

export function makeWeaponStates() {
  return WEAPONS.map((def) => ({
    def,
    mag: def.magSize,
    reserve: def.reserveStart,
    cooldown: 0,
    reloadT: 0, // seconds remaining, 0 = not reloading
    heat: 0, // 0..1 sustained-fire bloom
    sinceShot: 9,
  }));
}

export function damageAtDistance(def, dist) {
  if (dist <= def.falloffStart) return def.damage;
  if (dist >= def.falloffEnd) return def.damage * def.falloffMin;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return def.damage * (1 - t * (1 - def.falloffMin));
}
