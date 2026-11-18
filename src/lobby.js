// The lobby: a shared meeting point for every open copy of the game, with no
// server of our own. It carries two things:
//
//   public rooms   hosts list their room here; anyone can browse and join
//   leaderboard    every player's career stats, ranked
//
// How: one well-known address (LOBBY_CODE) on the same PeerJS signalling
// network the rooms use. The first player online takes it and becomes the
// "hub"; everyone else connects to the hub. If the hub leaves, the others race
// to take the address and reconnect, a second or two later. The hub holds the
// list of rooms (hosts re-announce every few seconds, so a new hub fills up by
// itself) and the merged leaderboard. Every player keeps a copy of the board in
// localStorage and hands it to whichever hub they meet, so the board lives on
// while nobody is online and grows back when someone returns.
//
// Each player's own entry comes from their own browser and is keyed by a hash
// of their player ID, newest wins. Like the rest of a peer-to-peer game, this
// trusts players: numbers are sanity-capped, but a determined cheat could fake
// them. A real server could replace the hub without changing the messages.
//
// member -> hub   hi, room (announce), unroom, me (my board entry), seed (board copy), rq (send rooms)
// hub -> member   rooms (full list), board (entries: all on connect, changes after), pg

import { getTransport } from './transport.js';
import { BUILD } from './version.js';

const LOBBY_CODE = 'LOBBY01';
const BOARD_KEY = 'foundry-arena-board';
const BOARD_MAX = 500;
const ROOM_TTL = 25000; // a room not re-announced for this long is gone
const ANNOUNCE_MS = 8000;
const TIMEOUT_MS = 15000;

const clean = (s, n = 18) => String(s || '').replace(/[^\p{L}\p{N} _.\-'!?#]/gu, '').trim().slice(0, n);
const int = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);

/** The stats a board entry carries, with sanity caps. */
export const BOARD_FIELDS = {
  level: 50, prestige: 10, xp: 1e9, matches: 1e6, wins: 1e6, kills: 1e7, deaths: 1e7, heads: 1e7,
  bestStreak: 500, longest: 500, knives: 1e6, nades: 1e6, caps: 1e6, shots: 1e9, hits: 1e9, time: 1e8,
};

/** Tidy an entry that came from someone else. Returns null if it's no good. */
export function cleanEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || !/^[A-Za-z0-9]{8,40}$/.test(e.id)) return null;
  const out = { id: e.id, name: clean(e.name) || 'Player', at: int(e.at, 4e12) };
  if (typeof e.bid === 'string' && /^[0-9a-f]{16}$/.test(e.bid)) out.bid = e.bid;
  // profile extras: packed cosmetics (see cosmetics.js) and favourite gun
  if (typeof e.cos === 'string' && /^[0-9,]{1,64}$/.test(e.cos)) out.cos = e.cos;
  if (typeof e.fav === 'string' && /^[a-z]{1,12}$/.test(e.fav)) { out.fav = e.fav; out.favK = int(e.favK, 1e7); }
  for (const [k, max] of Object.entries(BOARD_FIELDS)) out[k] = int(e[k], max);
  // impossible combinations
  out.wins = Math.min(out.wins, out.matches);
  out.hits = Math.min(out.hits, out.shots);
  out.heads = Math.min(out.heads, out.kills);
  if (out.at > Date.now() + 86400000) return null;
  return out;
}

function cleanRoom(r) {
  if (!r || typeof r !== 'object') return null;
  const code = String(r.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (code.length < 4) return null;
  return {
    code,
    host: clean(r.host) || 'Player',
    mode: clean(r.mode, 24),
    map: clean(r.map, 24),
    n: int(r.n, 64),
    max: int(r.max, 64) || 8,
    bots: !!r.bots,
    locked: !!r.locked,
    rk: !!r.rk,
    v: String(r.v || '').slice(0, 40),
  };
}

export class Lobby {
  /** hooks: { onRooms(list), onBoard(), onStatus(text) } */
  constructor(hooks) {
    this.hooks = hooks;
    this.role = null; // null | 'hub' | 'member'
    this.room = null; // hub: the held address
    this.conns = []; // hub: [{ conn, seen, rooms:Set }]
    this.conn = null; // member: to the hub
    this.rooms = new Map(); // hub: code -> room (+ seen)
    this.roomList = []; // what we show: joinable public rooms
    this.board = new Map(); // id -> entry
    this.changed = new Set(); // hub: ids changed since the last broadcast
    this.myRoom = null; // a room we host and list
    this.me = null; // our own board entry
    this.token = 0;
    this._loadBoard();
    this.tick = setInterval(() => this._beat(), 1000);
    this.announceT = 0;
  }

  get online() { return this.role !== null; }
  get myId() { return this.me ? this.me.id : null; }

  // ---------------------------------------------------------------- connecting

  /** Join the lobby: take the hub address if it's free, else connect to whoever has it. */
  async connect() {
    if (this.role || this.connecting) return;
    this.connecting = true;
    const token = ++this.token;
    try {
      const room = await getTransport().host(LOBBY_CODE, () => LOBBY_CODE, 0);
      if (token !== this.token) { room.close(); return; }
      this._becomeHub(room);
    } catch (e) {
      if (token !== this.token) return;
      if (/reserve/.test(e.message)) {
        // taken: someone else is the hub
        try {
          const conn = await getTransport().join(LOBBY_CODE);
          if (token !== this.token) { conn.close(); return; }
          this._becomeMember(conn);
        } catch (e2) { this._retry(token); }
      } else this._retry(token); // can't reach the signalling server: try again later
    } finally {
      if (token === this.token) this.connecting = false;
    }
  }

  _retry(token, ms = 4000 + Math.random() * 4000) {
    this.connecting = false;
    if (this.hooks.onStatus) this.hooks.onStatus('offline');
    setTimeout(() => { if (token === this.token && !this.role) this.connect(); }, ms);
  }

  /** The hub went away (or we lost it): race the others for the address. */
  _lost() {
    const token = ++this.token;
    this.role = null;
    this.conn = null;
    this.connecting = false;
    if (this.hooks.onStatus) this.hooks.onStatus('reconnecting');
    setTimeout(() => { if (token === this.token && !this.role) this.connect(); }, 300 + Math.random() * 1700);
  }

  _becomeHub(room) {
    this.role = 'hub';
    this.room = room;
    this.rooms.clear();
    room.onConnection = (conn) => this._accept(conn);
    if (this.myRoom) this._putRoom(this.myRoom, null);
    if (this.me) this._merge([this.me], true);
    this._publishRooms();
    if (this.hooks.onStatus) this.hooks.onStatus('hub');
    if (this.hooks.onBoard) this.hooks.onBoard();
  }

  _becomeMember(conn) {
    this.role = 'member';
    this.conn = conn;
    this.seen = performance.now();
    conn.onMessage = (m) => this._memberMsg(m);
    conn.onClose = () => { if (this.conn === conn) this._lost(); };
    conn.send({ t: 'hi', v: BUILD });
    // hand over our copy of the board (the newest entries), then our own entry and room
    const seed = [...this.board.values()].sort((a, b) => b.at - a.at).slice(0, 300);
    if (seed.length) conn.send({ t: 'seed', e: seed });
    if (this.me) conn.send({ t: 'me', e: this.me });
    if (this.myRoom) conn.send({ t: 'room', r: this.myRoom });
    conn.send({ t: 'rq' });
    if (this.hooks.onStatus) this.hooks.onStatus('member');
  }

  // ---------------------------------------------------------------- hub

  _accept(conn) {
    const c = { conn, seen: performance.now(), rooms: new Set() };
    this.conns.push(c);
    conn.onMessage = (m) => this._hubMsg(c, m);
    conn.onClose = () => {
      const i = this.conns.indexOf(c);
      if (i >= 0) this.conns.splice(i, 1);
      // their rooms go with them
      let gone = false;
      for (const code of c.rooms) if (this.rooms.delete(code)) gone = true;
      if (gone) this._publishRooms();
    };
    conn.send({ t: 'board', all: true, e: [...this.board.values()] });
    conn.send({ t: 'rooms', r: this.roomList });
  }

  _hubMsg(c, m) {
    if (!m || typeof m !== 'object') return;
    c.seen = performance.now();
    if (m.t === 'room') { const r = this._putRoom(m.r, c); if (r) this._publishRooms(); }
    else if (m.t === 'unroom') { const code = String(m.code || ''); if (c.rooms.has(code)) { c.rooms.delete(code); this.rooms.delete(code); this._publishRooms(); } }
    else if (m.t === 'me') this._merge([m.e]);
    else if (m.t === 'seed' && Array.isArray(m.e)) this._merge(m.e.slice(0, 300));
    else if (m.t === 'rq') c.conn.send({ t: 'rooms', r: this.roomList });
  }

  _putRoom(raw, c) {
    const r = cleanRoom(raw);
    if (!r) return null;
    const old = this.rooms.get(r.code);
    if (old && old.owner !== c) return null; // someone else's code
    r.seen = performance.now();
    r.owner = c;
    this.rooms.set(r.code, r);
    if (c) c.rooms.add(r.code);
    return r;
  }

  /** Hub: rebuild the visible list and send it to everyone. */
  _publishRooms() {
    const now = performance.now();
    for (const [code, r] of this.rooms) if (now - r.seen > ROOM_TTL) this.rooms.delete(code);
    const list = [...this.rooms.values()].map(({ seen, owner, ...r }) => r); // eslint-disable-line no-unused-vars
    this.roomList = list;
    for (const c of this.conns) c.conn.send({ t: 'rooms', r: list });
    this._showRooms(list);
  }

  // ---------------------------------------------------------------- member

  _memberMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.seen = performance.now();
    if (m.t === 'rooms' && Array.isArray(m.r)) this._showRooms(m.r.map(cleanRoom).filter(Boolean));
    else if (m.t === 'board' && Array.isArray(m.e)) this._merge(m.e, false, true);
  }

  // ---------------------------------------------------------------- shared

  _showRooms(list) {
    this.allRooms = list;
    this.roomList = list;
    if (this.hooks.onRooms) this.hooks.onRooms(list);
  }

  /** Public rooms we could join (same version of the game), not counting our own. */
  joinable() {
    return (this.allRooms || []).filter((r) => r.v === BUILD && (!this.myRoom || r.code !== this.myRoom.code));
  }

  /** Merge entries into the board, newest per player wins. */
  _merge(list, quiet = false, fromHub = false) {
    let any = false;
    for (const raw of list) {
      const e = cleanEntry(raw);
      if (!e) continue;
      const old = this.board.get(e.id);
      if (old && old.at >= e.at) continue;
      this.board.set(e.id, e);
      if (this.role === 'hub') this.changed.add(e.id);
      any = true;
    }
    if (!any) return;
    this._trim();
    this.boardDirty = true;
    if (!quiet || fromHub) { if (this.hooks.onBoard) this.hooks.onBoard(); }
  }

  _trim() {
    if (this.board.size <= BOARD_MAX) return;
    // keep the players who matter most: by XP, then most recently seen
    const keep = [...this.board.values()].sort((a, b) => (b.prestige * 1e9 + b.xp) - (a.prestige * 1e9 + a.xp) || b.at - a.at).slice(0, BOARD_MAX);
    this.board = new Map(keep.map((e) => [e.id, e]));
  }

  _loadBoard() {
    try {
      const raw = JSON.parse(localStorage.getItem(BOARD_KEY) || '[]');
      if (Array.isArray(raw)) for (const r of raw.slice(0, BOARD_MAX)) { const e = cleanEntry(r); if (e) this.board.set(e.id, e); }
    } catch (e) { /* none */ }
  }

  _saveBoard() {
    this.boardDirty = false;
    try { localStorage.setItem(BOARD_KEY, JSON.stringify([...this.board.values()])); } catch (e) { /* full / no storage */ }
  }

  /** Our own stats changed: update our entry (sent to the hub). */
  setMe(entry) {
    const e = cleanEntry({ ...entry, at: Date.now() });
    if (!e) return;
    const prev = this.me;
    this.me = e;
    if (prev && Object.keys(BOARD_FIELDS).every((k) => prev[k] === e[k]) && prev.name === e.name && prev.cos === e.cos && prev.fav === e.fav) return;
    this._merge([e], this.role !== 'hub');
    if (this.role === 'member' && this.conn) this.conn.send({ t: 'me', e });
  }

  /** A player's profile extras ({ cos, fav, favK }), from their board entry. */
  async getProfile(id) {
    const e = this.board.get(id);
    return e && (e.cos || e.fav) ? { cos: e.cos || '', fav: e.fav || '', favK: e.favK || 0 } : null;
  }

  /** We're hosting a public room (or null: not any more). `info` is re-sent as it changes. */
  setRoom(info) {
    const r = info ? cleanRoom({ ...info, v: BUILD }) : null;
    const old = this.myRoom;
    this.myRoom = r;
    if (old && (!r || old.code !== r.code)) this._unroom(old.code);
    if (r) this._announce();
  }

  _announce() {
    const r = this.myRoom;
    if (!r) return;
    if (this.role === 'hub') { this._putRoom(r, null); this._publishRooms(); }
    else if (this.role === 'member' && this.conn) this.conn.send({ t: 'room', r });
  }

  _unroom(code) {
    if (this.role === 'hub') { this.rooms.delete(code); this._publishRooms(); }
    else if (this.role === 'member' && this.conn) this.conn.send({ t: 'unroom', code });
  }

  /** Ask the hub for the room list again (the browser's Refresh). */
  refresh() {
    if (this.role === 'member' && this.conn) this.conn.send({ t: 'rq' });
    else if (this.role === 'hub') this._publishRooms();
    else this.connect();
  }

  _beat() {
    if (!this.role) return;
    const now = performance.now();
    this.announceT += 1000;
    if (this.announceT >= ANNOUNCE_MS) { this.announceT = 0; this._announce(); }
    if (this.boardDirty && Math.random() < 0.2) this._saveBoard();
    if (this.role === 'hub') {
      for (const c of [...this.conns]) {
        if (now - c.seen > TIMEOUT_MS) { c.conn.close(); if (c.conn.onClose) c.conn.onClose(); }
        else c.conn.send({ t: 'pg' });
      }
      // send board changes, a few times a minute at most
      if (this.changed.size && (this.boardT = (this.boardT || 0) + 1) >= 5) {
        this.boardT = 0;
        const e = [...this.changed].map((id) => this.board.get(id)).filter(Boolean);
        this.changed.clear();
        for (const c of this.conns) c.conn.send({ t: 'board', e });
        if (this.hooks.onBoard) this.hooks.onBoard();
      }
      // drop rooms that stopped announcing
      if ([...this.rooms.values()].some((r) => now - r.seen > ROOM_TTL)) this._publishRooms();
    } else if (this.conn) {
      if (now - this.seen > TIMEOUT_MS) { const c = this.conn; c.onClose = null; c.close(); this._lost(); }
      else if ((this.pingT = (this.pingT || 0) + 1) % 3 === 0) this.conn.send({ t: 'pg' });
    }
  }

  /** The page is closing: let go (the others take over within a couple of seconds). */
  close() {
    if (this.boardDirty) this._saveBoard();
    this.token++;
    if (this.role === 'hub') { for (const c of this.conns) { c.conn.onClose = null; c.conn.close(); } if (this.room) this.room.close(); }
    else if (this.conn) { this.conn.onClose = null; this.conn.close(); }
    this.role = null;
  }
}

/** A short public id for a player ID (the real one stays private: it's what rejoin trusts). */
export function boardId(pid) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const s = 'board:' + pid;
  for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193); h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x5bd1e995); }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}
