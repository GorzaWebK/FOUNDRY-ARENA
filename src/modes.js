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
//   forcePrimary   everyone gets this primary regardless of their loadout

import { WEAPON_BY_ID } from './weapons.js';

export const TEAM_COLORS = [0x3d8bff, 0xff4d4d];
export const TEAM_NAMES = ['Blue', 'Red'];
export const GUN_LADDER = ['lmg', 'rifle', 'smg', 'shotgun', 'sniper', 'pistol'];
export const KILLS_PER_GUN = 2;
const GUN_WIN = (GUN_LADDER.length - 1) * KILLS_PER_GUN + 1; // one kill with the last gun wins

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const byKills = (a, b) => b.kills - a.kills || a.deaths - b.deaths || a.id - b.id;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Gun-game weapon index for a kill count. */
export function gunLevel(kills) {
  return Math.min(GUN_LADDER.length - 1, Math.floor(kills / KILLS_PER_GUN));
}

function bestOther(game) {
  let lead = null;
  for (const c of game.chars) if (c !== game.player && (!lead || byKills(c, lead) < 0)) lead = c;
  return lead;
}

/** Free-for-all to a kill limit (Deathmatch, Snipers Only). */
function killLimitMode(base) {
  return {
    ...base,
    rank: (chars) => [...chars].sort(byKills),
    won: (game) => game.chars.some((c) => c.kills >= base.scoreLimit),
    hud(game) {
      const lead = bestOther(game);
      return {
        left: ['YOU', game.player.kills], right: [lead ? lead.name.toUpperCase() : '—', lead ? lead.kills : 0],
        sub: `first to ${base.scoreLimit}`,
      };
    },
    column: null,
    result(game) {
      const rank = game.ranking(), w = rank[0], me = game.player;
      const why = w.kills >= base.scoreLimit ? `reached ${base.scoreLimit} kills` : `led with ${plural(w.kills, 'kill')} when time ran out`;
      if (w === me) return { won: true, sub: `You ${why}.` };
      return { won: false, sub: `${w.name} ${why}. You placed #${rank.indexOf(me) + 1} of ${rank.length}.` };
    },
  };
}

export const MODES = [
  killLimitMode({
    id: 'ffa', name: 'Deathmatch', scoreLimit: 20,
    blurb: 'Free-for-all. First to 20 kills, or the most kills after 10 minutes.',
  }),

  {
    id: 'tdm', name: 'Team Deathmatch', scoreLimit: 40, teams: true,
    blurb: 'Blue vs Red. First team to 40 kills wins. No friendly fire.',
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || byKills(a, b)),
    won: (game) => game.teamScore[0] >= 40 || game.teamScore[1] >= 40,
    hud(game) {
      const mine = Math.max(0, game.player.team), other = 1 - mine;
      return {
        left: [TEAM_NAMES[mine].toUpperCase(), game.teamScore[mine], hex(TEAM_COLORS[mine])],
        right: [TEAM_NAMES[other].toUpperCase(), game.teamScore[other], hex(TEAM_COLORS[other])],
        sub: 'first team to 40',
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
    blurb: 'Blue vs Red fight over a zone that moves every minute. Hold it with no enemies inside to score. First to 100.',
    rank: (chars) => [...chars].sort((a, b) => a.team - b.team || b.hillTime - a.hillTime || byKills(a, b)),
    won: (game) => game.teamScore[0] >= 100 || game.teamScore[1] >= 100,
    hud(game) {
      const mine = Math.max(0, game.player.team), other = 1 - mine;
      return {
        left: [TEAM_NAMES[mine].toUpperCase(), game.teamScore[mine], hex(TEAM_COLORS[mine])],
        right: [TEAM_NAMES[other].toUpperCase(), game.teamScore[other], hex(TEAM_COLORS[other])],
        sub: 'king of the hill · 100',
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
    id: 'gungame', name: 'Gun Game', gunGame: true,
    blurb: `Every ${KILLS_PER_GUN} kills swap you to the next gun: LMG, rifle, SMG, shotgun, sniper, pistol. One pistol kill wins.`,
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
    blurb: '5 lives each. Lose them all and you are out. The last player alive wins.',
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

  killLimitMode({
    id: 'snipers', name: 'Snipers Only', scoreLimit: 15, forcePrimary: 'sniper',
    blurb: 'Free-for-all with sniper rifles and pistols only. First to 15 kills.',
  }),
];

export const DEFAULT_MODE = 'ffa';

export function getMode(id) {
  return MODES.find((m) => m.id === id) || MODES[0];
}
