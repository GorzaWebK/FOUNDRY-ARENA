// Global gameplay tuning. Everything a designer might want to tweak lives here.

export const CFG = {
  // match rules
  killLimit: 20,
  timeLimit: 600, // seconds
  respawnDelay: 3,
  spawnProtection: 2,

  // vitals
  maxHealth: 100,
  maxArmor: 100,
  armorAbsorb: 0.5,
  headshotMult: 2,

  // movement
  gravity: 24,
  jumpSpeed: 8.2,
  terminalVel: 30,
  walkSpeed: 5.6,
  sprintSpeed: 8.6,
  crouchSpeed: 2.8,
  adsSpeed: 3.4,
  groundAccel: 55,
  airAccel: 14,

  // body
  radius: 0.35,
  heightStand: 1.8,
  heightCrouch: 1.2,
  eyeStand: 1.62,
  eyeCrouch: 1.02,
  stepUp: 0.6,
  stepDown: 0.55,

  // bots
  botWalk: 4.4,
  botRun: 6.4,
  botSprint: 7.6,
};

// Bot skill presets. `reactMin/Max` is the delay between first seeing a target
// and being allowed to pull the trigger. `aimError` is the base angular error
// (radians) before tracking tightens it. The rest is tactics:
//   grenades  how readily they throw (x the base rate)
//   flank     chance to circle round to your side when you break line of sight
//   callout   metres within which they tell teammates where you are (0 = never)
//   peek      pop up from low cover to shoot, duck between bursts
//   preaim    metres out from where they last saw you that they aim at it while closing in
export const DIFFICULTY = {
  easy: {
    label: 'Easy', reactMin: 0.45, reactMax: 0.9, aimError: 0.085, turnRate: 5.0,
    dmgVsPlayer: 0.6, trackTime: 3.0, headBias: 0.0,
    grenades: 0.25, flank: 0, callout: 0, peek: false, preaim: 0,
  },
  normal: {
    label: 'Normal', reactMin: 0.2, reactMax: 0.6, aimError: 0.055, turnRate: 7.0,
    dmgVsPlayer: 0.8, trackTime: 2.2, headBias: 0.25,
    grenades: 0.7, flank: 0.25, callout: 18, peek: false, preaim: 9,
  },
  hard: {
    label: 'Hard', reactMin: 0.18, reactMax: 0.4, aimError: 0.032, turnRate: 9.5,
    dmgVsPlayer: 1.0, trackTime: 1.5, headBias: 0.5,
    grenades: 1, flank: 0.5, callout: 30, peek: true, preaim: 14,
  },
  veteran: {
    label: 'Veteran', reactMin: 0.12, reactMax: 0.28, aimError: 0.022, turnRate: 12,
    dmgVsPlayer: 1.0, trackTime: 1.1, headBias: 0.65,
    grenades: 1.3, flank: 0.7, callout: 40, peek: true, preaim: 20,
  },
};

// Colours handed to human players in multiplayer, in join order (host first).
// paint codes: everyone wears a yard colour, so no two look alike and none look out of place
export const HUMAN_COLORS = [0x4a90b8, 0x8fb04a, 0xe9e4da, 0xd9a21b, 0x3f9a8a, 0xc96f4a, 0x8a7ac0, 0xb8b0a0];
export const MAX_HUMANS = 8;

export const BOT_ROSTER = [
  // the night shift
  { name: 'Slag', color: 0xd9622b },
  { name: 'Rivet', color: 0xc9c2b6 },
  { name: 'Cinder', color: 0xb33a32 },
  { name: 'Anvil', color: 0x5b7fa6 },
  { name: 'Flux', color: 0xd9a21b },
  { name: 'Ingot', color: 0x8a9a5b },
  { name: 'Bellows', color: 0x3f9a8a },
  { name: 'Tongs', color: 0x9a7a5a },
  { name: 'Kiln', color: 0xe0855a },
  { name: 'Quench', color: 0x4a90b8 },
];
