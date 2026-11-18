// Medals (earned in a match for how you did something) and achievements
// (lifetime goals). Both count only for the player at this keyboard, and only in
// matches that count for the career (not the range or the menu background).
// Counts live in Progress (so in the account code too).

/** Medal: id, name, what it's for, XP, badge colour, a short glyph for the badge. */
export const MEDALS = [
  // how the kill was made
  { id: 'head', name: 'Headshot', desc: 'A headshot kill', xp: 0, col: '#ffd24d', g: 'HS' },
  { id: 'long', name: 'Longshot', desc: 'A gun kill from 40 m or more', xp: 0, col: '#8fd3ff', g: 'LS' },
  { id: 'blank', name: 'Point Blank', desc: 'A gun kill from under 3 m', xp: 20, col: '#ff8a2a', g: 'PB' },
  { id: 'back', name: 'Backstab', desc: 'A knife kill from behind', xp: 40, col: '#c9343c', g: 'BS' },
  { id: 'blade', name: 'Cutthroat', desc: 'A knife kill', xp: 0, col: '#e8e4da', g: 'KN' },
  { id: 'boom', name: 'Demolition', desc: 'A grenade kill', xp: 0, col: '#ff6b1a', g: 'GR' },
  { id: 'blind', name: 'Lights Out', desc: 'Kill someone you blinded or who is blinded', xp: 30, col: '#f4f1ea', g: 'LO' },
  { id: 'after', name: 'Afterlife', desc: 'A kill after you died', xp: 50, col: '#9aa6b2', g: 'AL' },
  // who it was
  { id: 'first', name: 'First Blood', desc: 'The first kill of the match', xp: 50, col: '#c9343c', g: 'FB' },
  { id: 'revenge', name: 'Payback', desc: 'Kill whoever killed you last', xp: 30, col: '#ff6b5a', g: 'PB' },
  { id: 'avenge', name: 'Avenger', desc: 'Kill an enemy within 5 s of them killing a teammate', xp: 30, col: '#3f7fd0', g: 'AV' },
  { id: 'shut', name: 'Buzzkill', desc: "End someone's streak of 3 or more", xp: 40, col: '#b07cff', g: 'BK' },
  { id: 'comeback', name: 'Comeback', desc: 'A kill after 3 or more deaths in a row', xp: 30, col: '#7fdc9a', g: 'CB' },
  // multi-kills (within 4 s of each other)
  { id: 'double', name: 'Double Kill', desc: 'Two kills in quick succession', xp: 50, col: '#ffd24d', g: '×2' },
  { id: 'triple', name: 'Triple Kill', desc: 'Three kills in quick succession', xp: 100, col: '#ffb02a', g: '×3' },
  { id: 'quad', name: 'Quad Kill', desc: 'Four kills in quick succession', xp: 150, col: '#ff8a2a', g: '×4' },
  { id: 'mega', name: 'Mega Kill', desc: 'Five or more kills in quick succession', xp: 250, col: '#ff6b1a', g: '×5' },
  // streaks (kills without dying)
  { id: 's3', name: 'Killing Spree', desc: '3 kills without dying', xp: 50, col: '#e8e4da', g: '3' },
  { id: 's5', name: 'Rampage', desc: '5 kills without dying', xp: 100, col: '#ffd24d', g: '5' },
  { id: 's7', name: 'Dominating', desc: '7 kills without dying', xp: 150, col: '#ffb02a', g: '7' },
  { id: 's10', name: 'Unstoppable', desc: '10 kills without dying', xp: 250, col: '#ff8a2a', g: '10' },
  { id: 's15', name: 'Godlike', desc: '15 kills without dying', xp: 400, col: '#ff6b1a', g: '15' },
  { id: 's20', name: 'Legendary', desc: '20 kills without dying', xp: 600, col: '#ff3020', g: '20' },
  // objectives
  { id: 'flag', name: 'Flag Runner', desc: 'Capture the enemy flag', xp: 0, col: '#3f7fd0', g: 'FL' },
  { id: 'ret', name: 'Defender', desc: 'Return your flag', xp: 0, col: '#7fb2ff', g: 'DF' },
  { id: 'hill', name: 'King', desc: 'Take the hill for your team', xp: 30, col: '#ffd24d', g: 'KH' },
  { id: 'zone', name: 'Secured', desc: 'Capture a Domination zone', xp: 0, col: '#e8e4da', g: 'ZN' },
  { id: 'plant', name: 'Bomb Planted', desc: 'Plant the bomb', xp: 0, col: '#ff8a2a', g: 'BP' },
  { id: 'defuse', name: 'Defused', desc: 'Defuse the bomb', xp: 0, col: '#7fdc9a', g: 'DF' },
  { id: 'clutch', name: 'Clutch', desc: 'Win a Search & Destroy round as the last one alive', xp: 200, col: '#ffd24d', g: 'CL' },
  { id: 'infect', name: 'Infector', desc: 'Kill a survivor as the infected', xp: 30, col: '#7ac74f', g: 'IN' },
  { id: 'survive', name: 'Survivor', desc: 'Survive to the end of an Infected match', xp: 300, col: '#7fdc9a', g: 'SV' },
  { id: 'win', name: 'Victory', desc: 'Win a match', xp: 0, col: '#ff8a2a', g: 'W' },
  { id: 'mvp', name: 'MVP', desc: 'Top of the scoreboard at the end of a match', xp: 150, col: '#ffd24d', g: 'MVP' },
];
export const MEDAL_BY_ID = Object.fromEntries(MEDALS.map((m) => [m.id, m]));

export const STREAK_MEDALS = { 3: 's3', 5: 's5', 7: 's7', 10: 's10', 15: 's15', 20: 's20' };
export const MULTI_MEDALS = { 2: 'double', 3: 'triple', 4: 'quad' }; // 5+: mega

// ---------------------------------------------------------------- achievements

/**
 * Achievements: lifetime goals. `val(s)` reads the current value from
 * s = { career, medals, level, prestige, rankPeak, weeks, modes }; done at `goal`.
 * Some unlock a calling card (`card`, see cosmetics.js); all pay `xp` once.
 */
const med = (id) => (s) => s.medals[id] || 0;
const car = (k) => (s) => s.career[k] || 0;
export const ACHIEVEMENTS = [
  // playing
  { id: 'm1', name: 'Clocked In', desc: 'Play a match', goal: 1, val: car('matches'), xp: 250 },
  { id: 'm25', name: 'Regular', desc: 'Play 25 matches', goal: 25, val: car('matches'), xp: 1000 },
  { id: 'm100', name: 'Lifer', desc: 'Play 100 matches', goal: 100, val: car('matches'), xp: 3000, card: 'ach-lifer' },
  { id: 'w1', name: 'First Win', desc: 'Win a match', goal: 1, val: car('wins'), xp: 500 },
  { id: 'w25', name: 'Winning Habit', desc: 'Win 25 matches', goal: 25, val: car('wins'), xp: 2000 },
  { id: 'w100', name: 'Champion', desc: 'Win 100 matches', goal: 100, val: car('wins'), xp: 5000, card: 'ach-champion' },
  { id: 'modes', name: 'Tourist', desc: 'Play every mode', goal: 1, val: (s) => (s.modes.every((m) => (s.career.modes || {})[m]) ? 1 : 0), prog: (s) => `${s.modes.filter((m) => (s.career.modes || {})[m]).length}/${s.modes.length}`, xp: 1500 },
  // fighting
  { id: 'k100', name: 'Hundred', desc: 'Get 100 kills', goal: 100, val: car('kills'), xp: 1000 },
  { id: 'k1000', name: 'Thousand', desc: 'Get 1,000 kills', goal: 1000, val: car('kills'), xp: 4000, card: 'ach-thousand' },
  { id: 'k5000', name: 'Foundry Legend', desc: 'Get 5,000 kills', goal: 5000, val: car('kills'), xp: 10000, card: 'ach-legend' },
  { id: 'hs250', name: 'Sharpshooter', desc: 'Get 250 headshot kills', goal: 250, val: car('heads'), xp: 2500, card: 'ach-sharp' },
  { id: 'kn50', name: 'Cold Steel', desc: 'Get 50 knife kills', goal: 50, val: car('knives'), xp: 2000, card: 'ach-steel' },
  { id: 'gr50', name: 'Grenadier', desc: 'Get 50 grenade kills', goal: 50, val: car('nades'), xp: 2000 },
  { id: 'long60', name: 'Over the Horizon', desc: 'Get a kill from 60 m', goal: 60, val: car('longest'), unit: 'm', xp: 1500 },
  { id: 'st10', name: 'Unstoppable', desc: 'Get a 10-kill streak', goal: 10, val: car('bestStreak'), xp: 2000 },
  { id: 'st20', name: 'Legendary', desc: 'Get a 20-kill streak', goal: 20, val: car('bestStreak'), xp: 5000, card: 'ach-legendary' },
  { id: 'mega', name: 'Mega', desc: 'Earn a Mega Kill', goal: 1, val: med('mega'), xp: 2500 },
  { id: 'rev25', name: 'Grudge', desc: 'Earn 25 Payback medals', goal: 25, val: med('revenge'), xp: 1500 },
  { id: 'back25', name: 'Shadow', desc: 'Earn 25 Backstab medals', goal: 25, val: med('back'), xp: 2000 },
  // objectives
  { id: 'flag10', name: 'Flag Bearer', desc: 'Capture 10 flags', goal: 10, val: car('caps'), xp: 2000 },
  { id: 'zone50', name: 'Area Denial', desc: 'Capture 50 Domination zones', goal: 50, val: med('zone'), xp: 2000 },
  { id: 'plant10', name: 'Demolitions', desc: 'Plant the bomb 10 times', goal: 10, val: med('plant'), xp: 1500 },
  { id: 'defuse10', name: 'Bomb Squad', desc: 'Defuse the bomb 10 times', goal: 10, val: med('defuse'), xp: 2000, card: 'ach-squad' },
  { id: 'clutch5', name: 'Ice Cold', desc: 'Earn 5 Clutch medals', goal: 5, val: med('clutch'), xp: 2500 },
  { id: 'surv5', name: 'Patient Zero Proof', desc: 'Survive 5 Infected matches', goal: 5, val: med('survive'), xp: 2000 },
  { id: 'mvp10', name: 'Most Valuable', desc: 'Finish top of the scoreboard 10 times', goal: 10, val: med('mvp'), xp: 2000 },
  { id: 'medals', name: 'Decorated', desc: 'Earn 20 different medals', goal: 20, val: (s) => Object.keys(s.medals).filter((k) => s.medals[k] > 0 && MEDAL_BY_ID[k]).length, xp: 3000, card: 'ach-decorated' },
  // progress
  { id: 'lv25', name: 'Halfway', desc: 'Reach level 25', goal: 25, val: (s) => (s.prestige ? 50 : s.level), xp: 0 },
  { id: 'lv50', name: 'Top of the Ladder', desc: 'Reach level 50', goal: 50, val: (s) => (s.prestige ? 50 : s.level), xp: 0 },
  { id: 'pr1', name: 'Recast', desc: 'Prestige once', goal: 1, val: (s) => s.prestige, xp: 0 },
  { id: 'pr10', name: 'Tenfold', desc: 'Reach prestige 10', goal: 10, val: (s) => s.prestige, xp: 0 },
  { id: 'wk4', name: 'Shift Worker', desc: 'Finish every weekly challenge in 4 weeks', goal: 4, val: (s) => s.weeks, xp: 3000 },
  { id: 'gold', name: 'Going Gold', desc: 'Reach Gold in ranked', goal: 1, val: (s) => (s.rankPeak >= 6 ? 1 : 0), xp: 3000 },
];
export const ACH_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
