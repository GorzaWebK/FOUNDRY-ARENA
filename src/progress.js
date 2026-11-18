// XP, levels and prestige for the player at this keyboard. Saved locally (and in
// the account code). XP is earned in matches (not the training range): each
// event adds to a per-match tally that the end screen shows, and to the total.

import { DEFAULT_EQUIPPED, ITEMS, SLOTS, itemOf, itemUnlocked } from './cosmetics.js';
import { dailyFor, today, weeklyFor, weekKey } from './challenges.js';
import { MEDAL_BY_ID, ACHIEVEMENTS } from './medals.js';
import { seasonId, track, tierOf, PASS_TIERS } from './seasonpass.js';

export const PROGRESS_KEY = 'foundry-arena-progress';
export const MAX_LEVEL = 50;
export const MAX_PRESTIGE = 10;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level) => 400 + (level - 1) * 60;

/** What things are worth. */
export const XP = {
  kill: 100, headshot: 30, knife: 40, grenade: 30, longshot: 30, // longshot: 40 m or more
  streak: 25, // per kill while on a streak of 3+
  capture: 400, flagTake: 75, flagReturn: 100,
  hillSecond: 4,
  award: 150,
  matchPlayed: 200, matchWon: 300,
};

function blank() {
  return { v: 1, xp: 0, prestige: 0, equipped: { ...DEFAULT_EQUIPPED }, daily: { day: '', prog: {}, done: {} }, weekly: { week: '', prog: {}, done: {}, full: false }, weeksDone: 0, rankPeak: -1, medals: {}, achs: {}, pass: { season: '', xp: 0 }, owned: {} };
}

/** Level (1..50) and progress into it, from total XP this prestige. */
export function levelFromXp(xp) {
  let level = 1, left = Math.max(0, xp);
  while (level < MAX_LEVEL && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, into: left, need: level < MAX_LEVEL ? xpToNext(level) : 0 };
}

export class Progress {
  constructor() {
    this.p = blank();
    try {
      const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      if (typeof raw.xp === 'number' && raw.xp >= 0) this.p.xp = Math.floor(raw.xp);
      if (typeof raw.prestige === 'number') this.p.prestige = Math.max(0, Math.min(MAX_PRESTIGE, raw.prestige | 0));
      if (raw.daily && typeof raw.daily === 'object' && typeof raw.daily.day === 'string') {
        const num = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => typeof v === 'number' || v === true));
        this.p.daily = { day: raw.daily.day, prog: num(raw.daily.prog), done: num(raw.daily.done) };
      }
      if (raw.weekly && typeof raw.weekly === 'object' && typeof raw.weekly.week === 'string') {
        const num = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([, v]) => typeof v === 'number' || v === true));
        this.p.weekly = { week: raw.weekly.week, prog: num(raw.weekly.prog), done: num(raw.weekly.done), full: !!raw.weekly.full };
      }
      if (typeof raw.weeksDone === 'number') this.p.weeksDone = Math.max(0, raw.weeksDone | 0);
      if (typeof raw.rankPeak === 'number') this.p.rankPeak = Math.max(-1, Math.min(15, raw.rankPeak | 0));
      if (raw.medals && typeof raw.medals === 'object') {
        for (const [k, v] of Object.entries(raw.medals)) if (MEDAL_BY_ID[k] && typeof v === 'number' && v > 0) this.p.medals[k] = Math.floor(v);
      }
      if (raw.achs && typeof raw.achs === 'object') {
        for (const a of ACHIEVEMENTS) if (raw.achs[a.id]) this.p.achs[a.id] = typeof raw.achs[a.id] === 'string' ? raw.achs[a.id].slice(0, 10) : '1';
      }
      if (raw.pass && typeof raw.pass === 'object' && typeof raw.pass.season === 'string' && typeof raw.pass.xp === 'number') {
        this.p.pass = { season: raw.pass.season.slice(0, 10), xp: Math.max(0, Math.floor(raw.pass.xp)) };
      }
      if (raw.owned && typeof raw.owned === 'object') {
        for (const k of Object.keys(raw.owned)) if (k.startsWith('sp-') && k.length < 40) this.p.owned[k] = 1;
      }
      if (raw.equipped && typeof raw.equipped === 'object') {
        for (const s of SLOTS) if (ITEMS[s.id].some((i) => i.id === raw.equipped[s.id])) this.p.equipped[s.id] = raw.equipped[s.id];
      }
    } catch (e) { /* fresh start */ }
    this.match = []; // [label, xp] earned this match
    this.matchMedals = {}; // medal id -> count this match
    this.onLevelUp = null; // (newLevel) => void
    this.onXp = null; // (amount, label) => void
  }

  get xp() { return this.p.xp; }
  get prestige() { return this.p.prestige; }
  get level() { return levelFromXp(this.p.xp).level; }
  get info() { return levelFromXp(this.p.xp); }

  /** Add XP for something (label shows in the end-screen breakdown). */
  add(amount, label) {
    if (this.frozen || amount <= 0) return;
    const before = this.level;
    this.p.xp += amount;
    const row = this.match.find((r) => r[0] === label);
    if (row) row[1] += amount; else this.match.push([label, amount]);
    if (this.onXp) this.onXp(amount, label);
    const after = this.level;
    if (after > before && this.onLevelUp) for (let l = before + 1; l <= after; l++) this.onLevelUp(l);
    this.dirty = true;
    if (label !== 'Season pass') this.passXp(amount); // (the pass's own bonus XP doesn't feed it)
  }

  // ---------------------------------------------------------------- season pass

  /** This season's pass: { season, xp, tier } (a new month starts it over). */
  get pass() {
    const s = seasonId();
    if (this.p.pass.season !== s) this.p.pass = { season: s, xp: 0 };
    return { ...this.p.pass, tier: tierOf(this.p.pass.xp) };
  }

  /** XP into the pass; hands out each tier's reward as it's reached. */
  passXp(amount) {
    if (this.frozen || amount <= 0) return;
    const before = this.pass.tier;
    this.p.pass.xp += amount;
    const after = tierOf(this.p.pass.xp);
    if (after <= before) return;
    const tr = track(this.p.pass.season);
    for (let t = before + 1; t <= after && t <= PASS_TIERS; t++) {
      const r = tr[t - 1];
      if (r.id) this.p.owned[r.id] = 1;
      if (this.onPassTier) this.onPassTier(t, r);
      if (r.xp) this.add(r.xp, 'Season pass');
    }
    this.save();
  }

  matchTotal() { return this.match.reduce((a, r) => a + r[1], 0); }
  newMatch() { this.match = []; this.matchMedals = {}; this.startXp = this.p.xp; }

  // ---------------------------------------------------------------- medals + achievements

  get medals() { return this.p.medals; }
  get achs() { return this.p.achs; }

  /** A medal was earned: count it (lifetime and this match). */
  medal(id) {
    if (this.frozen || !MEDAL_BY_ID[id]) return false;
    this.p.medals[id] = (this.p.medals[id] || 0) + 1;
    this.matchMedals[id] = (this.matchMedals[id] || 0) + 1;
    this.dirty = true;
    return true;
  }

  /**
   * Look for newly finished achievements. `career` = career stats, `modes` = every
   * mode id. Pays their XP, saves, and returns the new ones.
   */
  checkAchievements(career, modes) {
    if (this.frozen) return [];
    const out = [];
    for (let pass = 0; pass < 2; pass++) { // an achievement's XP can level you into another
      const s = this.achState(career, modes);
      for (const a of ACHIEVEMENTS) {
        if (this.p.achs[a.id] || a.val(s) < a.goal) continue;
        this.p.achs[a.id] = new Date().toISOString().slice(0, 10);
        out.push(a);
        if (a.xp) this.add(a.xp, 'Achievements');
      }
    }
    if (out.length) this.save();
    return out;
  }

  achState(career, modes) {
    return { career, medals: this.p.medals, level: this.level, prestige: this.prestige, rankPeak: this.p.rankPeak, weeks: this.p.weeksDone, modes };
  }

  /** Is `slot`'s `item` usable now? */
  has(slot, id) { return this.unlocked(itemOf(slot, id)); }

  /** Is this cosmetic item unlocked? */
  unlocked(item) { return itemUnlocked(item, this.level, this.prestige, this.p.weeksDone, this.p.rankPeak, this.p.achs, this.p.owned); }
  get owned() { return this.p.owned; }

  /** Equipped items, falling back to the default for anything not (or no longer) unlocked. */
  equipped() {
    const out = {};
    for (const s of SLOTS) out[s.id] = this.has(s.id, this.p.equipped[s.id]) ? this.p.equipped[s.id] : ITEMS[s.id][0].id;
    return out;
  }

  equip(slot, id) {
    if (!this.has(slot, id)) return false;
    this.p.equipped[slot] = id;
    this.save();
    return true;
  }

  // ---------------------------------------------------------------- daily challenges

  /** Today's challenges with progress: [{ c, n, done }]. A new day starts a new set. */
  dailies() {
    const d = this.p.daily, day = today();
    if (d.day !== day) { d.day = day; d.prog = {}; d.done = {}; }
    return dailyFor(day).map((c) => ({ c, n: Math.min(c.goal, d.prog[c.id] || 0), done: !!d.done[c.id] }));
  }

  /** This week's challenges with progress. A new week starts a new set. */
  weeklies() {
    const w = this.p.weekly, week = weekKey();
    if (w.week !== week) { w.week = week; w.prog = {}; w.done = {}; w.full = false; }
    return weeklyFor(week).map((c) => ({ c, n: Math.min(c.goal, w.prog[c.id] || 0), done: !!w.done[c.id] }));
  }

  get weeksDone() { return this.p.weeksDone; }

  /** Highest ranked tier ever reached (unlocks the ranked calling cards). */
  get rankPeak() { return this.p.rankPeak; }
  setRankPeak(t) { if (t > this.p.rankPeak) { this.p.rankPeak = t; this.save(); return true; } return false; }

  /** Something that might move a challenge happened. meta: { weapon, mode }. */
  challenge(ev, amount = 1, meta = {}) {
    if (this.frozen) return;
    this._advance(this.dailies(), this.p.daily, ev, amount, meta, false);
    this._advance(this.weeklies(), this.p.weekly, ev, amount, meta, true);
  }

  _advance(list, d, ev, amount, meta, weekly) {
    for (const { c, done } of list) {
      if (done || c.ev !== ev) continue;
      if (c.weapon && c.weapon !== meta.weapon) continue;
      if (c.mode && c.mode !== meta.mode) continue;
      d.prog[c.id] = c.max ? Math.max(d.prog[c.id] || 0, amount) : (d.prog[c.id] || 0) + amount;
      this.dirty = true;
      if (d.prog[c.id] >= c.goal) {
        d.done[c.id] = true;
        this.add(c.xp, weekly ? 'Weekly' : 'Challenges');
        if (this.onChallenge) this.onChallenge(c, weekly);
        // all three weeklies: a full week, which counts towards exclusive cards
        if (weekly && !d.full && list.every((x) => x.c === c || d.done[x.c.id])) {
          d.full = true;
          this.p.weeksDone++;
          if (this.onWeekDone) this.onWeekDone(this.p.weeksDone);
        }
        this.save();
      }
    }
  }

  canPrestige() { return this.level >= MAX_LEVEL && this.prestige < MAX_PRESTIGE; }

  /** Back to level 1 with a prestige badge. Skins and career stats are untouched. */
  doPrestige() {
    if (!this.canPrestige()) return false;
    this.p.prestige++;
    this.p.xp = 0;
    this.save();
    return true;
  }

  save() {
    if (this.frozen) return;
    this.dirty = false;
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.p)); } catch (e) { /* no storage */ }
  }

  flush() { if (this.dirty) this.save(); }
}
