// Game modes. Each mode is plain data plus a few small functions the game,
// the HUD and the end screen call:
//
//   rank(chars)        scoreboard order (first = winner, for free-for-all modes)
//   won(game)          has somebody / some team won? (checked after every kill)
//   hud(game)          what the top bar shows
//   column             an extra scoreboard column, or null
//   result(game)       end-screen title + line for the local player
//
// Mode options the game itself reads:
//   teams          two teams, no friendly fire, team score
//   gunGame        weapons are handed out by kill count (see GUN_LADDER)
//   lives          limited lives; nobody respawns after their last
//   hill           King of the Hill: a scoring zone that moves (see map.hills)
//   ctf            Capture the Flag: a flag at each team's base (see map.flags, ctf.js)
//   objective      'dom' | 'sd' | 'infected': the mode's rules live in objectives.js
//   noSwitch       players can't change team mid-match
//   forcePrimary   everyone gets this primary regardless of their loadout
//
// A match plays with makeRules(id, custom): the mode plus the host's custom rules
// (score limit / lives, time limit, friendly fire, pickups, hardcore). Mode
// functions read limits from game.rules, never from the mode itself.

import { WEAPON_BY_ID } from './weapons.js';
import { CFG } from './config.js';

// the two crews: Cobalt (blue) and Crimson (red)
export const TEAM_COLORS = [0x3f7fd0, 0xc9343c];

/**
 * Team colour sets (Settings → Team colours). The team names stay Cobalt and
 * Crimson; only what they look like changes, on this screen only.
 */
export const TEAM_PALETTES = {
  standard: [0x3f7fd0, 0xc9343c], // blue / red
  deutan: [0x2f7fe8, 0xf0a020], // red-green colour blindness: blue / orange
  tritan: [0x18b8c8, 0xe0306a], // blue-yellow colour blindness: cyan / pink-red
  contrast: [0x2a62ff, 0xffd400], // high contrast: deep blue / yellow
};

/** Switch palette in place (everything that reads TEAM_COLORS picks it up). */
export function setTeamPalette(id) {
  const p = TEAM_PALETTES[id] || TEAM_PALETTES.standard;
  TEAM_COLORS[0] = p[0];
  TEAM_COLORS[1] = p[1];
}
export const TEAM_NAMES = ['Cobalt', 'Crimson'];
export const GUN_LADDER = ['lmg', 'rifle', 'smg', 'shotgun', 'sniper', 'pistol'];
export const KILLS_PER_GUN = 2;
const GUN_WIN = (GUN_LADDER.length - 1) * KILLS_PER_GUN + 1; // one kill with the last gun wins

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const byKills = (a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const mins = (r) => `${Math.round((r.timeLimit || CFG.timeLimit) / 60)} minutes`;

/** Gun-game weapon index for a kill count. */
export function gunLevel(kills) {
  return Math.min(GUN_LADDER.length - 1, Math.floor(kills / KILLS_PER_GUN));
}

function bestOther(game) {
  let lead = null;
  for (const c of game.chars) if (c !== game.player && (!lead || byKills(c, lead) < 0)) lead = c;
  return lead;
}

/** Two teams racing to a team score (Domination, Search & Destroy). */
function teamScoreMode(base) {
  return {
    teams: true,
    ...base,
    won: (game) => game.teamScore[0] >= game.rules.scoreLimit || game.teamScore[1] >= game.rules.scoreLimit,
    hud(game) {
      const mine = Math.max(0, game.player.team), other = 1 - mine;
      return {
        left: [TEAM_NAMES[mine].toUpperCase(), game.teamScore[mine], hex(TEAM_COLORS[mine])],
        right: [TEAM_NAMES[other].toUpperCase(), game.teamScore[other], hex(TEAM_COLORS[other])],
        sub: base.sub(game.rules),
      };
    },
    result(game) {
      const [b, r] = game.teamScore;
      if (b === r) return { won: false, draw: true, sub: `Both teams finished on ${b}.` };
      const w = b > r ? 0 : 1;
      return { won: game.player.team === w, sub: base.line(w, b, r) };
    },
  };
}

/** Free-for-all to a kill limit (Deathmatch, Snipers Only). */
function killLimitMode(base) {
  return {
    ...base,
    rank: (chars) => [...chars].sort(byKills),
    limit: { key: 'scoreLimit', label: 'Kill limit', unit: 'kills', options: [5, 10, 15, 20, 25, 30, 40, 50] },
    won: (game) => game.chars.some((c) => c.kills >= game.rules.scoreLimit),
    hud(game) {
      const lead = bestOther(game);
      return {
        left: ['YOU', game.player.kills], right: [lead ? lead.name.toUpperCase() : '—', lead ? lead.kills : 0],
        sub: `first to ${game.rules.scoreLimit}`,
      };
    },
    column: null,
    result(game) {
      const rank = game.ranking(), w = rank[0], me = game.player, lim = game.rules.scoreLimit;
      const why = w.kills >= lim ? `reached ${lim} kills` : `led with ${plural(w.kills, 'kill')} when time ran out`;
      if (w === me) return { won: true, sub: `You ${why}.` };
      return { won: false, sub: `${w.name} ${why}. You placed #${rank.indexOf(me) + 1} of ${rank.length}.` };
    },
  };
}

export const MODES = [
  killLimitMode({
    id: 'ffa', name: 'Deathmatch', scoreLimit: 20,
    desc: (r) => `Everyone for themselves. First to ${r.scoreLimit} kills, or most kills after ${mins(r)}.`,
  }),

  {
    id: 'tdm', name: 'Team Deathmatch', scoreLimit: 40, teams: true,
    desc: (r) => `Cobalt against Crimson. First crew to ${r.scoreLimit} kills.${r.friendlyFire ? ' Friendly fire is on.' : ''}`,
    limit: { key: 'scoreLimit', label: 'Team kill limit', unit: 'kills', options: [10, 20, 30, 40, 50, 75, 100] },
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || byKills(a, b)),
    won: (game) => game.teamScore[0] >= game.rules.scoreLimit || game.teamScore[1] >= game.rules.scoreLimit,
    hud(game) {
      const mine = Math.max(0, game.player.team), other = 1 - mine;
      return {
        left: [TEAM_NAMES[mine].toUpperCase(), game.teamScore[mine], hex(TEAM_COLORS[mine])],
        right: [TEAM_NAMES[other].toUpperCase(), game.teamScore[other], hex(TEAM_COLORS[other])],
        sub: `first team to ${game.rules.scoreLimit}`,
      };
    },
    column: { title: 'Team', value: (c) => (c.team >= 0 ? TEAM_NAMES[c.team] : '—') },
    result(game) {
      const [b, r] = game.teamScore;
      const score = `${Math.max(b, r)}–${Math.min(b, r)}`;
      if (b === r) return { won: false, draw: true, sub: `Both teams finished on ${b}.` };
      const w = b > r ? 0 : 1;
      const won = game.player.team === w;
      return { won, sub: `${TEAM_NAMES[w]} team won ${score}.${won ? ' Nice work.' : ''}` };
    },
  },

  {
    id: 'koth', name: 'King of the Hill', teams: true, hill: true, scoreLimit: 100,
    desc: (r) => `Hold the marked ground with nobody else on it. It moves every minute. First to ${r.scoreLimit}.`,
    limit: { key: 'scoreLimit', label: 'Points to win', unit: 'points', options: [50, 75, 100, 150, 200, 300] },
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || b.hillTime - a.hillTime || byKills(a, b)),
    won: (game) => game.teamScore[0] >= game.rules.scoreLimit || game.teamScore[1] >= game.rules.scoreLimit,
    hud(game) {
      const mine = Math.max(0, game.player.team), other = 1 - mine;
      return {
        left: [TEAM_NAMES[mine].toUpperCase(), game.teamScore[mine], hex(TEAM_COLORS[mine])],
        right: [TEAM_NAMES[other].toUpperCase(), game.teamScore[other], hex(TEAM_COLORS[other])],
        sub: `first to ${game.rules.scoreLimit}`,
      };
    },
    column: { title: 'Hill', value: (c) => `${Math.round(c.hillTime || 0)}s` },
    result(game) {
      const [b, r] = game.teamScore;
      if (b === r) return { won: false, draw: true, sub: `Both teams finished on ${b} points.` };
      const w = b > r ? 0 : 1;
      const won = game.player.team === w;
      return { won, sub: `${TEAM_NAMES[w]} team held the hill, ${Math.max(b, r)}–${Math.min(b, r)}.` };
    },
  },

  {
    id: 'ctf', name: 'Capture the Flag', teams: true, ctf: true, scoreLimit: 3,
    desc: (r) => `Take their flag home while yours is still on its stand. First to ${r.scoreLimit}.`,
    limit: { key: 'scoreLimit', label: 'Captures to win', unit: 'captures', options: [1, 2, 3, 5, 7, 10] },
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || (b.caps || 0) - (a.caps || 0) || byKills(a, b)),
    won: (game) => game.teamScore[0] >= game.rules.scoreLimit || game.teamScore[1] >= game.rules.scoreLimit,
    hud(game) {
      const mine = Math.max(0, game.player.team), other = 1 - mine;
      return {
        left: [TEAM_NAMES[mine].toUpperCase(), game.teamScore[mine], hex(TEAM_COLORS[mine])],
        right: [TEAM_NAMES[other].toUpperCase(), game.teamScore[other], hex(TEAM_COLORS[other])],
        sub: `first to ${game.rules.scoreLimit} caps`,
      };
    },
    column: { title: 'Caps', value: (c) => c.caps || 0 },
    result(game) {
      const [b, r] = game.teamScore;
      if (b === r) return { won: false, draw: true, sub: `Both teams finished on ${plural(b, 'capture')}.` };
      const w = b > r ? 0 : 1;
      const won = game.player.team === w;
      return { won, sub: `${TEAM_NAMES[w]} team won ${Math.max(b, r)}–${Math.min(b, r)} on captures.` };
    },
  },

  {
    id: 'gungame', name: 'Gun Game', gunGame: true,
    desc: () => `A new gun every ${KILLS_PER_GUN} kills, all the way down to the pistol. One pistol kill wins.`,
    rank: (chars) => [...chars].sort(byKills),
    won: (game) => game.chars.some((c) => c.kills >= GUN_WIN),
    hud(game) {
      const p = game.player, lead = bestOther(game);
      const lvl = (c) => gunLevel(c.kills) + 1;
      return {
        left: ['YOU', `${lvl(p)}/${GUN_LADDER.length}`],
        right: [lead ? lead.name.toUpperCase() : '—', lead ? `${lvl(lead)}/${GUN_LADDER.length}` : '—'],
        sub: 'gun game',
      };
    },
    column: { title: 'Gun', value: (c) => WEAPON_BY_ID[GUN_LADDER[gunLevel(c.kills)]].name },
    result(game) {
      const rank = game.ranking(), w = rank[0], me = game.player;
      const why = w.kills >= GUN_WIN ? 'got the final pistol kill' : `was furthest up the ladder when time ran out`;
      if (w === me) return { won: true, sub: `You ${why}.` };
      return { won: false, sub: `${w.name} ${why}. You placed #${rank.indexOf(me) + 1} of ${rank.length}.` };
    },
  },

  {
    id: 'lms', name: 'Last One Standing', lives: 5,
    desc: (r) => `${r.lives === 1 ? 'One life' : `${r.lives} lives`} each. Last one standing takes it.`,
    limit: { key: 'lives', label: 'Lives', unit: 'lives', options: [1, 2, 3, 5, 7, 10] },
    rank: (chars) => [...chars].sort((a, b) => b.lives - a.lives || byKills(a, b)),
    // only ends early when somebody was actually eliminated down to one survivor
    won: (game) => game.chars.length >= 2 && game.chars.filter((c) => c.lives > 0).length <= 1,
    hud(game) {
      const alive = game.chars.filter((c) => c.lives > 0).length;
      return { left: ['LIVES', game.player.lives], right: ['STILL IN', alive], sub: 'last one standing' };
    },
    column: { title: 'Lives', value: (c) => (c.lives > 0 ? c.lives : 'out') },
    result(game) {
      const rank = game.ranking(), w = rank[0], me = game.player;
      const last = game.chars.filter((c) => c.lives > 0).length <= 1;
      const why = last ? 'was the last one standing' : `had the most lives left when time ran out`;
      if (w === me) return { won: true, sub: `You ${why}.` };
      return { won: false, sub: `${w.name} ${why}. You placed #${rank.indexOf(me) + 1} of ${rank.length}.` };
    },
  },

  teamScoreMode({
    id: 'dom', name: 'Domination', objective: 'dom', scoreLimit: 200,
    desc: (r) => `Three zones, A, B and C. Stand in one to capture it; every zone your crew holds scores a point a second. First to ${r.scoreLimit}.`,
    limit: { key: 'scoreLimit', label: 'Points to win', unit: 'points', options: [100, 150, 200, 300, 400] },
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || (b.caps || 0) - (a.caps || 0) || byKills(a, b)),
    sub: (r) => `first to ${r.scoreLimit}`,
    column: { title: 'Caps', value: (c) => c.caps || 0 },
    line: (w, b, r) => `${TEAM_NAMES[w]} team won ${Math.max(b, r)}–${Math.min(b, r)} on points.`,
  }),

  teamScoreMode({
    id: 'sd', name: 'Search & Destroy', objective: 'sd', lives: 1, scoreLimit: 4, timeLimit: 1800,
    desc: (r) => `Rounds, one life each. Attackers plant a bomb at A or B; defenders stop them or defuse it. Sides swap every round. First to ${r.scoreLimit} rounds.`,
    limit: { key: 'scoreLimit', label: 'Rounds to win', unit: 'rounds', options: [2, 3, 4, 5, 6] },
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || byKills(a, b)),
    sub: (r) => `first to ${r.scoreLimit} rounds`,
    column: { title: 'Plants', value: (c) => c.caps || 0 },
    line: (w, b, r) => `${TEAM_NAMES[w]} team won ${Math.max(b, r)}–${Math.min(b, r)} on rounds.`,
  }),

  {
    id: 'infected', name: 'Infected', teams: true, objective: 'infected', noSwitch: true, timeLimit: 300,
    desc: (r) => `One player turns. The infected have knives and speed; everyone they kill joins them. Survive ${mins(r)} to win.`,
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || byKills(a, b)),
    // over once the infection has started and every survivor has turned
    won: (game) => !!(game.obj && game.obj.started) && game.chars.length >= 2 && !game.chars.some((c) => c.team === 0),
    hud(game) {
      const s = game.chars.filter((c) => c.team === 0).length, inf = game.chars.length - s;
      return { left: ['SURVIVORS', s, '#e8e8e8'], right: ['INFECTED', inf, '#7ac74f'], sub: game.player.team === 1 ? 'infect them all' : 'stay alive' };
    },
    column: { title: 'Side', value: (c) => (c.team === 1 ? 'Infected' : 'Survivor') },
    result(game) {
      const left = game.chars.filter((c) => c.team === 0);
      const me = game.player;
      if (left.length) {
        const won = me.team === 0;
        return { won, sub: `${plural(left.length, 'survivor')} made it to the end.${won ? ' You survived.' : ''}` };
      }
      return { won: me.team === 1, sub: 'Everyone was infected.' };
    },
  },

  killLimitMode({
    id: 'snipers', name: 'Snipers Only', scoreLimit: 15, forcePrimary: 'sniper',
    desc: (r) => `Sniper rifles and pistols only. First to ${r.scoreLimit} kills.`,
  }),
];

// every mode's standard description (used in the mode pickers)
for (const m of MODES) m.blurb = m.desc({ ...m, timeLimit: m.timeLimit || CFG.timeLimit });

export const DEFAULT_MODE = 'ffa';

export function getMode(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}

export const TIME_OPTIONS = [5, 10, 15, 20, 30]; // minutes
export const HARDCORE_HEALTH = 50;

/** Custom rules, cleaned (from settings, or from the host over the network). */
export function cleanCustom(id, cr) {
  const m = getMode(id);
  const c = cr && typeof cr === 'object' ? cr : {};
  return {
    limit: m.limit && m.limit.options.includes(c.limit) ? c.limit : 0, // 0 = the mode's standard
    time: TIME_OPTIONS.includes(c.time) ? c.time : 0, // 0 = standard (10 minutes)
    ff: !!(m.teams && c.ff),
    pickups: c.pickups !== false,
    hardcore: !!c.hardcore,
  };
}

/** The rules a match plays by: mode `id` plus custom rules. */
export function makeRules(id, cr) {
  const m = getMode(id);
  const custom = cleanCustom(id, cr);
  const r = { ...m, custom };
  if (custom.limit) r[m.limit.key] = custom.limit;
  r.timeLimit = custom.time ? custom.time * 60 : m.timeLimit || CFG.timeLimit;
  r.friendlyFire = custom.ff;
  r.pickups = custom.pickups;
  r.hardcore = custom.hardcore;
  r.maxHealth = custom.hardcore ? HARDCORE_HEALTH : CFG.maxHealth;
  r.blurb = m.desc(r);
  r.isCustom = !!(custom.limit || custom.time || custom.ff || !custom.pickups || custom.hardcore);
  return r;
}

/** One line listing what's custom about these rules ('' when nothing is). */
export function customSummary(r) {
  if (!r.isCustom) return '';
  const c = r.custom, out = [];
  if (c.limit) out.push(`${c.limit} ${r.limit.unit}`);
  if (c.time) out.push(`${c.time} min`);
  if (c.ff) out.push('friendly fire');
  if (!c.pickups) out.push('no pickups');
  if (c.hardcore) out.push('hardcore');
  return 'Custom: ' + out.join(', ');
}
