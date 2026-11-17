// XP, levels and prestige for the player at this keyboard. Saved locally (and in
// the account code). XP is earned in matches (not the training range): each
// event adds to a per-match tally that the end screen shows, and to the total.

import { DEFAULT_EQUIPPED, ITEMS, SLOTS, itemOf, itemUnlocked } from './cosmetics.js';

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
  return { v: 1, xp: 0, prestige: 0, equipped: { ...DEFAULT_EQUIPPED } };
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
      if (raw.equipped && typeof raw.equipped === 'object') {
        for (const s of SLOTS) if (ITEMS[s.id].some((i) => i.id === raw.equipped[s.id])) this.p.equipped[s.id] = raw.equipped[s.id];
      }
    } catch (e) { /* fresh start */ }
    this.match = []; // [label, xp] earned this match
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
  }

  matchTotal() { return this.match.reduce((a, r) => a + r[1], 0); }
  newMatch() { this.match = []; this.startXp = this.p.xp; }

  /** Is `slot`'s `item` usable now? */
  has(slot, id) { return itemUnlocked(itemOf(slot, id), this.level, this.prestige); }

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
