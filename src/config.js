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
// (radians) before tracking tightens it.
export const DIFFICULTY = {
  easy: {
    label: 'Easy', reactMin: 0.45, reactMax: 0.9, aimError: 0.085, turnRate: 5.0,
    dmgVsPlayer: 0.6, trackTime: 3.0, headBias: 0.0,
  },
  normal: {
    label: 'Normal', reactMin: 0.2, reactMax: 0.6, aimError: 0.055, turnRate: 7.0,
    dmgVsPlayer: 0.8, trackTime: 2.2, headBias: 0.25,
  },
  hard: {
    label: 'Hard', reactMin: 0.18, reactMax: 0.4, aimError: 0.032, turnRate: 9.5,
    dmgVsPlayer: 1.0, trackTime: 1.5, headBias: 0.5,
  },
};

// Colours handed to human players in multiplayer, in join order (host first).
export const HUMAN_COLORS = [0x4fc3f7, 0x9cff57, 0xff8fd8, 0xffffff, 0xffb86b, 0xa7a2ff, 0x5dffd9, 0xfff275];
export const MAX_HUMANS = 8;

export const BOT_ROSTER = [
  { name: 'Viper', color: 0xe5484d },
  { name: 'Rook', color: 0xf5a524 },
  { name: 'Nova', color: 0xb44dff },
  { name: 'Ghost', color: 0xe8e8ee },
  { name: 'Blitz', color: 0xffe14d },
  { name: 'Echo', color: 0x2ecc71 },
  { name: 'Tank', color: 0xff7a1a },
  { name: 'Jinx', color: 0xff5fa8 },
  { name: 'Raze', color: 0x1fd1c1 },
  { name: 'Onyx', color: 0x6b7cff },
];
