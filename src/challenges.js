// Daily challenges: three a day, picked from the pool by the local date (so
// everyone gets the same three on the same day), worth bonus XP. Progress is
// counted in matches that count for your career (not the training range).
//
// ev       the event that moves it: kill, head, knife, nade, long, streak, win, match, cap, return, hill
// weapon   only kills with this weapon count
// mode     only this mode counts
// max      progress is the best single value (e.g. a streak), not a running total

export const DAILY_COUNT = 3;

export const POOL = [
  { id: 'kills', text: 'Get 30 kills', goal: 30, ev: 'kill', xp: 600 },
  { id: 'k-rifle', text: 'Get 15 kills with the Assault Rifle', goal: 15, ev: 'kill', weapon: 'rifle', xp: 600 },
  { id: 'k-smg', text: 'Get 15 kills with the SMG', goal: 15, ev: 'kill', weapon: 'smg', xp: 600 },
  { id: 'k-shotgun', text: 'Get 10 kills with the Shotgun', goal: 10, ev: 'kill', weapon: 'shotgun', xp: 650 },
  { id: 'k-sniper', text: 'Get 8 kills with the Sniper Rifle', goal: 8, ev: 'kill', weapon: 'sniper', xp: 700 },
  { id: 'k-lmg', text: 'Get 15 kills with the LMG', goal: 15, ev: 'kill', weapon: 'lmg', xp: 600 },
  { id: 'k-pistol', text: 'Get 8 kills with the Pistol', goal: 8, ev: 'kill', weapon: 'pistol', xp: 700 },
  { id: 'heads', text: 'Get 8 headshot kills', goal: 8, ev: 'head', xp: 700 },
  { id: 'knife', text: 'Get 3 knife kills', goal: 3, ev: 'knife', xp: 750 },
  { id: 'nades', text: 'Get 3 grenade kills', goal: 3, ev: 'nade', xp: 750 },
  { id: 'long', text: 'Get 5 kills from 40 m or further', goal: 5, ev: 'long', xp: 700 },
  { id: 'streak', text: 'Go on a 5-kill streak', goal: 5, ev: 'streak', max: true, xp: 800 },
  { id: 'wins', text: 'Win 2 matches', goal: 2, ev: 'win', xp: 800 },
  { id: 'matches', text: 'Finish 3 matches', goal: 3, ev: 'match', xp: 500 },
  { id: 'caps', text: 'Capture 2 flags', goal: 2, ev: 'cap', xp: 900 },
  { id: 'returns', text: 'Return 3 flags', goal: 3, ev: 'return', xp: 600 },
  { id: 'hill', text: 'Hold the hill for 90 seconds', goal: 90, ev: 'hill', xp: 700 },
  { id: 'm-ctf', text: 'Finish a Capture the Flag match', goal: 1, ev: 'match', mode: 'ctf', xp: 500 },
  { id: 'm-gungame', text: 'Finish a Gun Game match', goal: 1, ev: 'match', mode: 'gungame', xp: 500 },
  { id: 'w-tdm', text: 'Win a Team Deathmatch match', goal: 1, ev: 'win', mode: 'tdm', xp: 800 },
];

/** Today's date in the player's own time zone, as YYYY-MM-DD. */
export function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Milliseconds until the next set (local midnight). */
export function msToReset(d = new Date()) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return next - d;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The day's challenges: DAILY_COUNT from the pool, no two of the same kind of event. */
export function dailyFor(day) {
  let seed = hash('foundry:' + day);
  const rand = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  const picks = [];
  for (let tries = 0; picks.length < DAILY_COUNT && tries < 200; tries++) {
    const c = POOL[(rand() * POOL.length) | 0];
    if (picks.includes(c) || picks.some((p) => p.ev === c.ev)) continue;
    picks.push(c);
  }
  return picks;
}

// ---------------------------------------------------------------- weekly

export const WEEKLY_POOL = [
  { id: 'w-kills', text: 'Get 150 kills', goal: 150, ev: 'kill', xp: 2500 },
  { id: 'w-heads', text: 'Get 40 headshot kills', goal: 40, ev: 'head', xp: 2500 },
  { id: 'w-wins', text: 'Win 8 matches', goal: 8, ev: 'win', xp: 2500 },
  { id: 'w-matches', text: 'Finish 15 matches', goal: 15, ev: 'match', xp: 2500 },
  { id: 'w-caps', text: 'Capture 8 flags', goal: 8, ev: 'cap', xp: 2500 },
  { id: 'w-hill', text: 'Hold the hill for 6 minutes', goal: 360, ev: 'hill', xp: 2500 },
  { id: 'w-knife', text: 'Get 12 knife kills', goal: 12, ev: 'knife', xp: 2500 },
  { id: 'w-nades', text: 'Get 12 grenade kills', goal: 12, ev: 'nade', xp: 2500 },
  { id: 'w-long', text: 'Get 25 kills from 40 m or further', goal: 25, ev: 'long', xp: 2500 },
  { id: 'w-streak', text: 'Go on a 10-kill streak', goal: 10, ev: 'streak', max: true, xp: 2500 },
  { id: 'w-sniper', text: 'Get 40 kills with the Sniper Rifle', goal: 40, ev: 'kill', weapon: 'sniper', xp: 2500 },
  { id: 'w-shotgun', text: 'Get 50 kills with the Shotgun', goal: 50, ev: 'kill', weapon: 'shotgun', xp: 2500 },
];

/** This week's key (weeks start on Monday, local time): the date of that Monday. */
export function weekKey(d = new Date()) {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return 'W' + today(monday);
}

/** Milliseconds until next Monday, midnight. */
export function msToWeekReset(d = new Date()) {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + 7);
  return next - d;
}

function pick(pool, key, count) {
  let seed = hash('foundry:' + key);
  const rand = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  const picks = [];
  for (let tries = 0; picks.length < count && tries < 200; tries++) {
    const c = pool[(rand() * pool.length) | 0];
    if (picks.includes(c) || picks.some((p) => p.ev === c.ev)) continue;
    picks.push(c);
  }
  return picks;
}

/** The week's three. */
export function weeklyFor(week) { return pick(WEEKLY_POOL, week, 3); }

export const CHALLENGE_BY_ID = Object.fromEntries([...POOL, ...WEEKLY_POOL].map((c) => [c.id, c]));
