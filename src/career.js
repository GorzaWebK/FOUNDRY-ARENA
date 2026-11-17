// Career stats for the player at this keyboard, kept in localStorage (and so in
// the account code). Counted on whichever machine you play on, host or client.
// The training range and the menu background don't count.

import { WEAPONS } from './weapons.js';

export const CAREER_KEY = 'foundry-arena-career';

const blank = () => ({
  v: 1, matches: 0, wins: 0, kills: 0, deaths: 0, shots: 0, hits: 0, heads: 0,
  bestStreak: 0, longest: 0, knives: 0, nades: 0, caps: 0, time: 0,
  weapons: {}, // weapon id -> kills with it
  modes: {}, // mode id -> matches played
});

const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function load() {
  const c = blank();
  try {
    const raw = JSON.parse(localStorage.getItem(CAREER_KEY) || '{}');
    for (const k of Object.keys(c)) {
      if (k === 'weapons' || k === 'modes') {
        if (raw[k] && typeof raw[k] === 'object') for (const [id, n] of Object.entries(raw[k])) if (num(n) && id.length < 20) c[k][id] = Math.floor(n);
      } else if (num(raw[k])) c[k] = raw[k];
    }
  } catch (e) { /* corrupt or no storage: start fresh */ }
  return c;
}

/** The weapon id a kill-feed weapon name belongs to ('knife', 'grenade' or a gun id). */
export function weaponIdOf(name) {
  if (name === 'Knife') return 'knife';
  if (name === 'Grenade') return 'grenade';
  const w = WEAPONS.find((d) => d.name === name);
  return w ? w.id : null;
}

export class Career {
  constructor() {
    this.c = load();
    this.dirty = false;
    this.saveT = 0;
  }

  get stats() { return this.c; }

  kill(weaponName, head, dist) {
    const c = this.c;
    c.kills++;
    const id = weaponIdOf(weaponName);
    if (id) c.weapons[id] = (c.weapons[id] || 0) + 1;
    if (id === 'knife') c.knives++;
    else if (id === 'grenade') c.nades++;
    else {
      if (head) c.heads++;
      if (num(dist)) c.longest = Math.max(c.longest, Math.round(dist));
    }
    this.save();
  }

  death() { this.c.deaths++; this.save(); }

  cap() { this.c.caps++; this.save(); }

  shot(hit) {
    this.c.shots++;
    if (hit) this.c.hits++;
    this.dirty = true;
  }

  streak(n) { if (n > this.c.bestStreak) { this.c.bestStreak = n; this.dirty = true; } }

  /** A match finished (you were in it). */
  match(modeId, won) {
    const c = this.c;
    c.matches++;
    if (won) c.wins++;
    c.modes[modeId] = (c.modes[modeId] || 0) + 1;
    this.save();
  }

  /** Time in matches; saved every so often. */
  tick(dt) {
    this.c.time += dt;
    this.dirty = true;
    this.saveT += dt;
    if (this.saveT > 10) this.save();
  }

  /** Kills with one weapon (for skin unlocks). */
  weaponKills(id) { return this.c.weapons[id] || 0; }

  save() {
    if (this.frozen) return; // an imported account is about to replace us
    this.saveT = 0;
    this.dirty = false;
    try { localStorage.setItem(CAREER_KEY, JSON.stringify(this.c)); } catch (e) { /* no storage */ }
  }

  flush() { if (this.dirty) this.save(); }

  reset() { this.c = blank(); this.save(); }
}
