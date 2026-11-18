// The cloud lobby: the leaderboard and the public room list on Firebase
// (Realtime Database + anonymous sign-in), used when src/online-config.js has a
// project in it. Same interface as the peer-to-peer Lobby in lobby.js, which
// remains the fallback when there's no project or it can't be reached.
//
// Why it's harder to cheat than the peer-to-peer board: the database rules
// (firebase/database.rules.json) run on Firebase's servers, not in the game.
// Each player can only write their own row; a row only ever moves forward, at
// most once every 15 seconds; play time can't grow faster than real time; kills,
// matches, captures and XP are capped against play time. A modified game can
// still report made-up matches inside those limits (with no game server, nothing
// can watch the matches themselves), but it can't post absurd numbers or touch
// anyone else's row.
//
// Rooms: a host's room is written to rooms/<code> with an onDisconnect removal,
// so a room vanishes the moment its host's tab closes, and it's re-stamped every
// 20 seconds; entries older than a minute are ignored as stale.

import { BUILD } from './version.js';
import { cleanEntry, BOARD_FIELDS } from './lobby.js';

const ROOM_BEAT_MS = 20000;
const ROOM_STALE_MS = 60000;
const BOARD_EVERY_MS = 20000; // rules allow one write per 15 s
const BOARD_LIMIT = 1000; // most recently active players

const clean = (s, n = 18) => String(s || '').replace(/[^\p{L}\p{N} _.\-'!?#]/gu, '').trim().slice(0, n);

export class CloudLobby {
  /** hooks: { onRooms, onBoard, onStatus, onFail(err) } */
  constructor(hooks, config, emulatorHost = '') {
    this.hooks = hooks;
    this.config = config;
    this.emulator = emulatorHost;
    this.role = null; // 'cloud' while connected
    this.board = new Map();
    this.allRooms = [];
    this.myRoom = null;
    this.me = null;
    this.uid = null;
    this.offset = 0; // server clock - our clock
    this.connecting = false;
  }

  get online() { return this.role === 'cloud'; }
  get myId() { return this.uid; }

  async connect() {
    if (this.started) return;
    this.started = this.connecting = true;
    try {
      // loaded only when a project is configured, so the game stays small otherwise
      const [appMod, A, D] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/database')]);
      this.D = D;
      const app = appMod.initializeApp(this.config, 'foundry-arena');
      const auth = A.getAuth(app);
      const db = D.getDatabase(app);
      if (this.emulator) {
        A.connectAuthEmulator(auth, `http://${this.emulator}:9099`, { disableWarnings: true });
        D.connectDatabaseEmulator(db, this.emulator, 9000);
      }
      this.db = db;
      const cred = await Promise.race([
        A.signInAnonymously(auth),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Timed out signing in')), 12000)),
      ]);
      this.uid = cred.user.uid;
      D.onValue(D.ref(db, '.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; });
      D.onValue(D.ref(db, '.info/connected'), (s) => {
        this.role = s.val() ? 'cloud' : null;
        if (this.role && this.myRoom) this._putRoom(); // back online: list our room again
        if (this.hooks.onStatus) this.hooks.onStatus(this.role || 'offline');
      });
      D.onValue(D.ref(db, 'rooms'), (s) => {
        const list = [];
        s.forEach((c) => { const r = this._room(c.key, c.val()); if (r) list.push(r); });
        this.allRooms = list;
        if (this.hooks.onRooms) this.hooks.onRooms(list);
      });
      D.onValue(D.query(D.ref(db, 'board'), D.orderByChild('at'), D.limitToLast(BOARD_LIMIT)), (s) => {
        const next = new Map();
        s.forEach((c) => { const e = cleanEntry({ ...c.val(), id: c.key }); if (e) next.set(e.id, e); });
        this.board = next;
        if (this.hooks.onBoard) this.hooks.onBoard();
      });
      this.role = 'cloud';
      this.connecting = false;
      if (this.me) this._writeMe(true);
      this._writeProfile();
      if (this.myRoom) this._putRoom();
      this.beat = setInterval(() => this._beat(), 5000);
    } catch (e) {
      this.connecting = false;
      this.failed = true;
      console.warn('Cloud lobby unavailable, using the peer-to-peer lobby:', e && e.message);
      if (this.hooks.onFail) this.hooks.onFail(e);
    }
  }

  now() { return Date.now() + this.offset; }

  _room(code, v) {
    if (!v || typeof v !== 'object' || !/^[A-Z0-9]{4,8}$/.test(code)) return null;
    if (typeof v.at !== 'number' || this.now() - v.at > ROOM_STALE_MS) return null;
    const n = (x, max) => (typeof x === 'number' && x >= 0 ? Math.min(max, Math.floor(x)) : 0);
    return { code, host: clean(v.host) || 'Player', mode: clean(v.mode, 24), map: clean(v.map, 24), n: n(v.n, 64), max: n(v.max, 64) || 8, bots: !!v.bots, locked: !!v.locked, v: String(v.v || '').slice(0, 40), mine: v.uid === this.uid };
  }

  joinable() {
    return this.allRooms.filter((r) => r.v === BUILD && !r.mine);
  }

  refresh() { if (!this.started) this.connect(); }

  // ---------------------------------------------------------------- leaderboard

  setMe(entry) {
    // profile extras live in profiles/<uid> (written less often)
    const prof = {
      cos: typeof entry.cos === 'string' && /^[0-9,]{1,64}$/.test(entry.cos) ? entry.cos : '1,0',
      fav: typeof entry.fav === 'string' && /^[a-z]{1,12}$/.test(entry.fav) ? entry.fav : 'none',
      favK: typeof entry.favK === 'number' && entry.favK >= 0 ? Math.min(1e7, Math.floor(entry.favK)) : 0,
    };
    if (!this.prof || this.prof.cos !== prof.cos || this.prof.fav !== prof.fav || this.prof.favK !== prof.favK) { this.prof = prof; this.profDirty = true; }
    const e = { name: clean(entry.name) || 'Player' };
    for (const k of Object.keys(BOARD_FIELDS)) e[k] = typeof entry[k] === 'number' && entry[k] >= 0 ? Math.floor(entry[k]) : 0;
    e.level = Math.max(1, e.level);
    // which account this is (the same player on a new browser gets a new sign-in, so the
    // board shows one row per account: the one with the most play)
    if (typeof entry.id === 'string' && /^[0-9a-f]{16}$/.test(entry.id)) e.bid = entry.id;
    const same = this.me && Object.keys(e).every((k) => this.me[k] === e[k]);
    this.me = e;
    if (!same) this.meDirty = true;
    if (this.online) this._writeMe();
  }

  /** Write our profile extras (at most every 30 s). */
  async _writeProfile() {
    if (!this.prof || !this.profDirty || !this.uid || Date.now() - (this.profAt || 0) < 30000) return;
    this.profDirty = false;
    this.profAt = Date.now();
    try { await this.D.set(this.D.ref(this.db, `profiles/${this.uid}`), { ...this.prof, at: this.D.serverTimestamp() }); }
    catch (e) { this.profDirty = true; }
  }

  /** Someone's profile extras ({ cos, fav, favK }), or null. Cached for a minute. */
  async getProfile(id) {
    if (!this.D || !/^[A-Za-z0-9]{8,40}$/.test(id)) return null;
    this.profCache = this.profCache || new Map();
    const hit = this.profCache.get(id);
    if (hit && Date.now() - hit.t < 60000) return hit.v;
    let v = null;
    try {
      const s = await this.D.get(this.D.ref(this.db, `profiles/${id}`));
      const p = s.val();
      if (p && typeof p.cos === 'string' && /^[0-9,]{1,64}$/.test(p.cos)) v = { cos: p.cos, fav: /^[a-z]{1,12}$/.test(p.fav || '') ? p.fav : '', favK: typeof p.favK === 'number' ? p.favK : 0 };
    } catch (e) { /* not readable (rules not updated yet) or offline */ }
    this.profCache.set(id, { t: Date.now(), v });
    return v;
  }

  /** Write our row (throttled to the rules' pace). */
  async _writeMe(force = false) {
    if (!this.me || !this.uid || this.writing) return;
    if (!force && (!this.meDirty || Date.now() - (this.lastWrite || 0) < BOARD_EVERY_MS)) return;
    const D = this.D, ref = D.ref(this.db, `board/${this.uid}`);
    this.writing = true;
    this.meDirty = false;
    this.prevWrite = this.lastWrite || 0;
    this.lastWrite = Date.now();
    const row = { ...this.me, at: D.serverTimestamp() };
    try {
      await D.set(ref, row);
      this.refused = false;
    } catch (err) {
      // refused: too soon (try again later), or our career went backwards (a reset),
      // which an existing row can't do: start our row afresh
      const cur = this.board.get(this.uid);
      if (cur && (this.me.kills < cur.kills || this.me.time < cur.time || this.me.matches < cur.matches)) {
        try { await D.remove(ref); await D.set(ref, row); this.refused = false; } catch (e2) { this.meDirty = true; this.refused = true; }
      } else {
        this.meDirty = true;
        // refused outright (not just too soon): the numbers don't add up
        if (Date.now() - (this.prevWrite || 0) >= 15000) this.refused = true;
      }
    } finally {
      this.writing = false;
    }
  }

  // ---------------------------------------------------------------- rooms

  setRoom(info) {
    const old = this.myRoom;
    const r = info ? {
      code: String(info.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8),
      host: clean(info.host) || 'Player', mode: clean(info.mode, 24), map: clean(info.map, 24),
      n: Math.min(64, info.n | 0), max: Math.max(1, Math.min(64, info.max | 0)), bots: !!info.bots, locked: !!info.locked, v: BUILD,
    } : null;
    this.myRoom = r && r.code.length >= 4 ? r : null;
    if (old && (!this.myRoom || old.code !== this.myRoom.code)) this._removeRoom(old.code);
    if (!this.myRoom || !this.online) return;
    // only write when something people see changed (the heartbeat keeps it fresh)
    const key = JSON.stringify(this.myRoom);
    if (key !== this.roomKey) this._putRoom();
  }

  async _putRoom() {
    const r = this.myRoom;
    if (!r || !this.uid) return;
    const D = this.D, ref = D.ref(this.db, `rooms/${r.code}`);
    this.roomKey = JSON.stringify(r);
    this.roomAt = Date.now();
    try {
      const { code, ...rest } = r; // eslint-disable-line no-unused-vars
      await D.set(ref, { ...rest, uid: this.uid, at: D.serverTimestamp() });
      // once it exists (the rules only let us remove our own room): gone when our tab is
      if (this.disconnectFor !== r.code) { await D.onDisconnect(ref).remove(); this.disconnectFor = r.code; }
    } catch (e) { this.roomKey = ''; }
  }

  _removeRoom(code) {
    if (!this.D || !this.uid) return;
    const ref = this.D.ref(this.db, `rooms/${code}`);
    this.D.remove(ref).catch(() => {});
    this.D.onDisconnect(ref).cancel().catch(() => {});
    if (this.disconnectFor === code) this.disconnectFor = '';
    this.roomKey = '';
  }

  _beat() {
    if (!this.online) return;
    this._writeMe();
    this._writeProfile();
    if (this.myRoom && Date.now() - (this.roomAt || 0) > ROOM_BEAT_MS) this._putRoom();
  }

  // ---------------------------------------------------------------- community maps

  get canShareMaps() { return !!this.uid; }

  /** Publish (or update our own) map. Returns its id. */
  async publishMap(spec, code, id = null) {
    if (!this.uid) throw new Error('Not connected to the online service yet. Try again in a moment.');
    const D = this.D;
    const ref = id ? D.ref(this.db, `maps/${id}`) : D.push(D.ref(this.db, 'maps'));
    try {
      await D.set(ref, { uid: this.uid, name: spec.name, author: clean(spec.author) || 'Player', w: spec.w, d: spec.d, theme: spec.theme, code, at: D.serverTimestamp() });
    } catch (e) {
      if (id) return this.publishMap(spec, code, null); // not ours any more (or gone): publish as new
      throw new Error("The server didn't accept the map. If you just published, wait 30 seconds and try again.");
    }
    return ref.key;
  }

  /** Community maps, newest first, with vote counts: [{ id, name, author, w, d, theme, code, at, votes, mine, voted }] */
  async listMaps() {
    if (!this.D) throw new Error('Not connected to the online service.');
    const D = this.D;
    const [ms, vs] = await Promise.all([
      D.get(D.query(D.ref(this.db, 'maps'), D.orderByChild('at'), D.limitToLast(200))),
      D.get(D.ref(this.db, 'mapVotes')).catch(() => null),
    ]);
    const votes = (vs && vs.val()) || {};
    const out = [];
    ms.forEach((c) => {
      const v = c.val();
      if (!v || typeof v.code !== 'string' || !v.code.startsWith('FAM1.')) return;
      const vv = votes[c.key] && typeof votes[c.key] === 'object' ? votes[c.key] : {};
      out.push({ id: c.key, name: clean(v.name, 28) || 'Untitled', author: clean(v.author) || 'Player', w: v.w | 0, d: v.d | 0, theme: String(v.theme || ''), code: v.code, at: v.at || 0, votes: Object.keys(vv).length, voted: !!vv[this.uid], mine: v.uid === this.uid });
    });
    return out.sort((a, b) => b.at - a.at);
  }

  async voteMap(id, on) {
    if (!this.uid) return;
    const ref = this.D.ref(this.db, `mapVotes/${id}/${this.uid}`);
    if (on) await this.D.set(ref, true); else await this.D.remove(ref);
  }

  async deleteMap(id) {
    if (!this.uid) return;
    await this.D.remove(this.D.ref(this.db, `maps/${id}`));
    await this.D.remove(this.D.ref(this.db, `mapVotes/${id}/${this.uid}`)).catch(() => {});
  }

  close() {
    if (this.myRoom) this._removeRoom(this.myRoom.code);
    clearInterval(this.beat);
  }
}
