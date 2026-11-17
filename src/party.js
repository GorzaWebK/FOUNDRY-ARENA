// Party: friends who stay together between matches and rooms.
//
// One player leads; up to three friends join with the party code (or invite
// link). Whenever the leader hosts or joins a room, everyone in the party is
// sent there too, and the room's host keeps a party on the same team.
//
// The party has its own little connection, separate from game rooms: the
// leader holds it open (like hosting a room) and members dial in. It survives
// page reloads in the same tab (the code is kept in sessionStorage), so a
// refresh, say for a new version, puts you straight back in your party.
//
// Leader -> member   pm (members), go (join this room), out (left the room), end (party closed), no (refused), pg
// Member -> leader   hi (name), nm (new name), bye, pg

import { getTransport, makeRoomCode, cleanRoomCode } from './transport.js';
import { BUILD } from './version.js';

export const PARTY_MAX = 4;
const KEY = 'foundry-arena-party';
const PREFIX = 'PTY'; // party connections live apart from room codes
const TIMEOUT_MS = 12000;
const RETRY_MS = 4000;

export const cleanPartyCode = (s) => { const c = cleanRoomCode(s); return (c.length > 5 && c.startsWith(PREFIX) ? c.slice(PREFIX.length) : c).slice(0, 5); };

export class Party {
  /** hooks: { onChange(), onGo(code, pw), onOut(), onNote(text, isError) } */
  constructor(hooks) {
    this.hooks = hooks;
    this._clear();
    this.where = null; // leader: { c, pw } the room we're in, for members to follow
    this.tick = setInterval(() => this._beat(), 1000); // keep-alive, both ways
  }

  _clear() {
    this.code = '';
    this.leader = false;
    this.members = []; // [{ name, lead }] for show
    this.room = null; // leader
    this.conns = []; // leader: [{ conn, name, seen }]
    this.conn = null; // member
    this.seen = 0;
    this.status = ''; // '', 'connecting', 'waiting' (lost the leader, trying again)
    this.token = (this.token || 0) + 1;
  }

  get active() { return !!this.code; }
  /** Members, not counting the leader. */
  get size() { return this.leader ? 1 + this.conns.length : this.members.length; }

  _save() {
    try {
      if (this.code) sessionStorage.setItem(KEY, JSON.stringify({ code: this.code, lead: this.leader }));
      else sessionStorage.removeItem(KEY);
    } catch (e) { /* no storage */ }
  }

  /** The party this tab was in before a reload: { code, lead } or null. */
  saved() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { /* none */ }
    return s && typeof s.code === 'string' && cleanPartyCode(s.code).length === 5 ? { code: cleanPartyCode(s.code), lead: !!s.lead } : null;
  }

  /** After a page load: back into the party this tab was in. */
  restore(name) {
    const s = this.saved();
    if (!s) return false;
    if (s.lead) this.start(name, cleanPartyCode(s.code)).catch(() => {});
    else this.join(s.code, name, true).catch(() => {});
    return true;
  }

  // ---------------------------------------------------------------- leader

  /** Start a party (or re-open ours after a reload, with the same code). */
  async start(name, code = '') {
    this.leave(false);
    const token = this.token;
    this.name = name;
    this.leader = true;
    this.code = code || makeRoomCode();
    this.status = 'connecting';
    this._members();
    this._save();
    for (let tries = 0; ; tries++) {
      try {
        // a reload can find our old code still held for a few seconds: keep trying it
        const room = await getTransport().host(PREFIX + this.code, () => PREFIX + (code || makeRoomCode()));
        if (token !== this.token) { room.close(); return; }
        this.room = room;
        this.code = room.code.slice(PREFIX.length);
        this.status = '';
        this._save();
        room.onConnection = (conn) => this._accept(conn);
        this._members();
        return this.code;
      } catch (e) {
        if (token !== this.token) return;
        if (!code || tries >= 8) { this._clear(); this._save(); this.hooks.onChange(); throw new Error("Couldn't start a party. Check your connection and try again."); }
        await new Promise((r) => setTimeout(r, RETRY_MS));
        if (token !== this.token) return;
      }
    }
  }

  _accept(conn) {
    let m8 = null;
    const timer = setTimeout(() => { if (!m8) conn.close(); }, 8000);
    conn.onMessage = (m) => {
      if (!m || typeof m !== 'object') return;
      if (m8) { this._leadMsg(m8, m); return; }
      if (m.t !== 'hi') return;
      clearTimeout(timer);
      if (m.v !== BUILD) { conn.send({ t: 'no', why: 'version' }); setTimeout(() => conn.close(), 400); return; }
      // the same tab coming back (after a reload) replaces its old self
      const again = this.conns.find((c) => c.tab && c.tab === m.tab);
      if (again) this._kick(again, true);
      if (this.size >= PARTY_MAX) { conn.send({ t: 'no', why: 'full' }); setTimeout(() => conn.close(), 400); return; }
      m8 = { conn, name: clean(m.name) || 'Player', tab: typeof m.tab === 'string' ? m.tab.slice(0, 16) : '', seen: performance.now() };
      this.conns.push(m8);
      this._members();
      if (!again) this.hooks.onNote(`${m8.name} joined your party.`);
      if (this.where) conn.send({ t: 'go', ...this.where });
    };
    conn.onClose = () => { clearTimeout(timer); if (m8) this._kick(m8, false, true); };
  }

  _leadMsg(c, m) {
    c.seen = performance.now();
    if (m.t === 'nm') { c.name = clean(m.name) || c.name; this._members(); }
    else if (m.t === 'bye') { this._kick(c); this.hooks.onNote(`${c.name} left your party.`); }
  }

  _kick(c, quiet = true, lost = false) {
    const i = this.conns.indexOf(c);
    if (i < 0) return;
    this.conns.splice(i, 1);
    c.conn.onClose = null;
    c.conn.close();
    if (lost && !quiet) this.hooks.onNote(`${c.name} dropped out of the party.`);
    this._members();
  }

  /** Leader: tell members who's here (and refresh our own list). */
  _members() {
    if (!this.leader) return;
    this.members = [{ name: this.name, lead: true }, ...this.conns.map((c) => ({ name: c.name, lead: false }))];
    for (const c of this.conns) c.conn.send({ t: 'pm', code: this.code, list: this.members });
    this.hooks.onChange();
  }

  /** Leader: we're now in room `code` (hosting or joined). Members follow. */
  enteredRoom(code, pw = '') {
    if (!this.leader) return;
    this.where = { c: code, pw: pw || '' };
    for (const c of this.conns) c.conn.send({ t: 'go', ...this.where });
  }

  /** Leader: we left the room. Members come back to the menu with us. */
  leftRoom() {
    if (!this.leader || !this.where) return;
    this.where = null;
    for (const c of this.conns) c.conn.send({ t: 'out' });
  }

  // ---------------------------------------------------------------- member

  /** Join a friend's party. `quietRetry`: keep trying (after a reload / lost leader). */
  async join(code, name, quietRetry = false) {
    code = cleanPartyCode(code);
    if (code.length < 5) throw new Error('Enter the 5-letter party code.');
    if (!quietRetry || this.code !== code) this.leave(false);
    const token = this.token;
    this.name = name;
    this.code = code;
    this.leader = false;
    this.status = 'connecting';
    if (!this.tab) this.tab = Math.random().toString(36).slice(2, 10);
    this._save();
    this.hooks.onChange();
    try {
      const conn = await getTransport().join(PREFIX + code);
      if (token !== this.token) { conn.close(); return; }
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The party leader did not answer.')), 8000);
        conn.onClose = () => { clearTimeout(timer); reject(new Error('The party closed.')); };
        conn.onMessage = (m) => {
          if (!m || typeof m !== 'object') return;
          if (m.t === 'no') {
            clearTimeout(timer);
            conn.onClose = null;
            conn.close();
            const e = new Error(m.why === 'full' ? `That party is full (${PARTY_MAX} players).` : 'You and the party leader are on different versions of the game. Both refresh the page.');
            e.final = true;
            reject(e);
            return;
          }
          if (m.t !== 'pm') return;
          clearTimeout(timer);
          this.conn = conn;
          this.seen = performance.now();
          this.status = '';
          conn.onMessage = (mm) => this._memberMsg(mm);
          conn.onClose = () => this._lostLeader();
          this._memberMsg(m);
          resolve();
        };
        conn.send({ t: 'hi', name: this.name, v: BUILD, tab: this.tab });
      });
    } catch (e) {
      if (token !== this.token) return;
      if (quietRetry && !e.final) { this._retry(token); return; }
      this._clear();
      this._save();
      this.hooks.onChange();
      throw new Error(e.final ? e.message : /not found/i.test(e.message) ? `No party with the code ${code}. Check it with your friend.` : e.message);
    }
  }

  _memberMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.seen = performance.now();
    if (m.t === 'pm' && Array.isArray(m.list)) {
      this.members = m.list.slice(0, PARTY_MAX).map((x) => ({ name: clean(x && x.name) || 'Player', lead: !!(x && x.lead) }));
      this.hooks.onChange();
    } else if (m.t === 'go') {
      const c = cleanRoomCode(m.c);
      if (c) this.hooks.onGo(c, typeof m.pw === 'string' ? m.pw.slice(0, 32) : '');
    } else if (m.t === 'out') {
      this.hooks.onOut();
    } else if (m.t === 'end') {
      const c = this.conn;
      this._clear();
      this._save();
      if (c) { c.onClose = null; c.close(); }
      this.hooks.onNote('The party leader closed the party.');
      this.hooks.onChange();
    }
  }

  _lostLeader() {
    if (!this.conn) return;
    this.conn = null;
    this._retry(this.token);
  }

  /** Lost the leader (or they're reloading): keep dialling quietly. */
  _retry(token) {
    if (token !== this.token) return;
    this.status = 'waiting';
    this.hooks.onChange();
    setTimeout(() => { if (token === this.token && !this.conn) this.join(this.code, this.name, true).catch(() => {}); }, RETRY_MS);
  }

  // ---------------------------------------------------------------- both

  setName(name) {
    this.name = name;
    if (this.leader) this._members();
    else if (this.conn) this.conn.send({ t: 'nm', name });
  }

  /** Leave the party (a leader closes it for everyone). `say`: tell the others. */
  leave(say = true) {
    if (!this.code) return;
    if (this.leader) {
      for (const c of this.conns) { c.conn.send({ t: 'end' }); c.conn.onClose = null; }
      const conns = this.conns.map((c) => c.conn), room = this.room;
      setTimeout(() => { conns.forEach((c) => c.close()); if (room) room.close(); }, 200);
    } else if (this.conn) {
      const c = this.conn;
      if (say) c.send({ t: 'bye' });
      c.onClose = null;
      setTimeout(() => c.close(), 150);
    }
    this._clear();
    this.where = null;
    this._save();
    this.hooks.onChange();
  }

  /** Page closing: drop the connections without goodbyes, so a reload finds the party again. */
  suspend() {
    if (this.leader) { for (const c of this.conns) c.conn.onClose = null; if (this.room) this.room.close(); }
    else if (this.conn) { this.conn.onClose = null; this.conn.close(); }
  }

  _beat() {
    if (!this.code) return;
    const now = performance.now();
    if (this.leader) {
      for (const c of [...this.conns]) {
        if (now - c.seen > TIMEOUT_MS) this._kick(c, false, true);
        else c.conn.send({ t: 'pg' });
      }
    } else if (this.conn) {
      if (now - this.seen > TIMEOUT_MS) {
        const c = this.conn;
        c.onClose = null;
        c.close();
        this._lostLeader();
      } else this.conn.send({ t: 'pg' });
    }
  }
}

function clean(s) { return String(s || '').replace(/[^\p{L}\p{N} _.\-']/gu, '').trim().slice(0, 18); }
