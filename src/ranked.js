// Ranked: skill rating (SR), tiers, monthly seasons.
//
// Everyone starts a season at 1000 SR. After a ranked match your SR moves by how
// the result compares with what was expected against the other players' average
// rating (an Elo-style calculation), plus a little for how you did on your team.
// The first 5 matches of a season move further, to place you quickly. A new
// season resets everyone halfway back towards 1000.
//
// Ranked rooms are public rooms with fixed rules: standard team modes on the
// built-in arena maps, no custom rules, and the host can't change them. A match
// counts when at least two players are in it and you were there for most of it.

export const START_SR = 1000;
export const RANKED_MODES = ['tdm', 'koth', 'ctf', 'dom', 'sd'];
export const RANKED_MAPS = ['foundry', 'span', 'cloister', 'depot', 'skyline', 'dockyard'];
export const PLACEMENT_GAMES = 5;
export const MAX_SR_STEP = 45; // (the server refuses bigger jumps)

/** [name, from SR, group] lowest first. Index = tier number (0..15). */
export const TIERS = [
  ['Bronze III', 0, 'bronze'], ['Bronze II', 1000, 'bronze'], ['Bronze I', 1050, 'bronze'],
  ['Silver III', 1100, 'silver'], ['Silver II', 1167, 'silver'], ['Silver I', 1233, 'silver'],
  ['Gold III', 1300, 'gold'], ['Gold II', 1367, 'gold'], ['Gold I', 1433, 'gold'],
  ['Platinum III', 1500, 'platinum'], ['Platinum II', 1567, 'platinum'], ['Platinum I', 1633, 'platinum'],
  ['Diamond III', 1700, 'diamond'], ['Diamond II', 1767, 'diamond'], ['Diamond I', 1833, 'diamond'],
  ['Foundry Master', 1900, 'master'],
];
export const TIER_COLORS = { bronze: '#c9844a', silver: '#c9d1d9', gold: '#f2c14e', platinum: '#5fd3c4', diamond: '#7fb2ff', master: '#ff6b1a' };

export function tierIndex(sr) {
  let i = 0;
  for (let k = 0; k < TIERS.length; k++) if (sr >= TIERS[k][1]) i = k;
  return i;
}
export const tierName = (sr) => TIERS[tierIndex(sr)][0];
export const tierColor = (sr) => TIER_COLORS[TIERS[tierIndex(sr)][2]];
/** Short label for scoreboards: B3, S1, G2, P3, D1, FM. */
export function tierShort(sr) {
  const [name, , group] = TIERS[tierIndex(sr)];
  if (group === 'master') return 'FM';
  return group[0].toUpperCase() + ({ III: 3, II: 2, I: 1 }[name.split(' ')[1]] || '');
}

/** This season's id (calendar month, UTC): S2026-11 */
export function seasonId(d = new Date()) {
  return `S${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function seasonName(id = seasonId()) {
  const [y, m] = id.slice(1).split('-').map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })} ${y} season`;
}
export function msToSeasonEnd(d = new Date()) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - d.getTime();
}

/** Where a player starts a new season, from last season's SR. */
export const seasonReset = (sr) => Math.round(START_SR + (sr - START_SR) * 0.5);

/**
 * SR change after a match.
 *   me:       { sr, games }   (games this season, before this one)
 *   lobbySr:  the other players' average SR
 *   result:   1 win, 0.5 draw, 0 loss
 *   perf:     -1 (bottom of your team) .. 1 (top)
 */
export function srChange(me, lobbySr, result, perf = 0) {
  const expected = 1 / (1 + 10 ** ((lobbySr - me.sr) / 400));
  const k = me.games < PLACEMENT_GAMES ? 48 : 26;
  const d = k * (result - expected) + 5 * Math.max(-1, Math.min(1, perf));
  return Math.max(-MAX_SR_STEP + 5, Math.min(MAX_SR_STEP - 5, Math.round(d)));
}
