// Multiplayer session: one player hosts, everyone else connects to them.
//
// Who decides what
//   host    health, armour, kills, respawns, pickups, the match clock, all bots
//   client  its own movement and aim (sent ~30x/s), its own ammo, and which
//           shots it landed ("claims", which the host sanity-checks)
//
// Host -> client messages
//   welcome / start   roster + clock; resets the client's match
//   roster            who is in the game
//   s                 snapshot of every character + pickup availability (20x/s)
//   spawn             "you are now alive, here"
//   shot              someone fired: where the tracers / impacts go
//   kill, hurt, pick  events
//   gr, ex            a grenade was thrown / went off
//   kn                someone swung a knife
//   c                 chat line
//   end               match over
// Client -> host messages
//   hello, u (my state), f (I fired), g (I threw a grenade), k (I knifed), c (chat)

import { CFG, HUMAN_COLORS, MAX_HUMANS } from './config.js';
import * as THREE from 'three';
import { WEAPONS, WEAPON_BY_ID, KNIFE, GRENADE, NADES, TACTICALS, TACTICAL_BY_ID, isPrimary, damageAtDistance } from './weapons.js';
import { getMap } from './maps/index.js';
import { getMode, makeRules } from './modes.js';
import { tracerColor } from './game.js';
import { NetChar } from './netChar.js';
import { getTransport, makeRoomCode, cleanRoomCode } from './transport.js';
import { BUILD, BUILD_TIME, OLD_CLIENT_MSG, OLD_HOST_MSG } from './version.js';
import { getAccount, isPlayerId } from './account.js';
import { SKINS, skinIndex } from './skins.js';
import { packCosmetics, unpackCosmetics } from './cosmetics.js';

const SNAP_INTERVAL = 1 / 20;
const SEND_INTERVAL = 1 / 30;
const TIMEOUT_MS = 10000; // silence for this long means the other side is gone
const REJOIN_MS = 3 * 60 * 1000; // a dropped player's score is kept this long for them to come back to

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const vec3 = (a) => Array.isArray(a) && a.length >= 3 && num(a[0]) && num(a[1]) && num(a[2]);
const _eye = new THREE.Vector3();

export function cleanChat(s) {
  // eslint-disable-next-line no-control-regex
  return String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140);
}

export function cleanName(s) {
  // eslint-disable-next-line no-control-regex
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

export class Net {
  /** hooks: { onRoster(), onLeft(reason), onMatchStart(), onChat(name, color, text) } */
  constructor(game, hooks) {
    this.game = game;
    this.hooks = hooks;
    this.role = null; // null | 'host' | 'client'
    this.code = '';
    this.room = null; // host
    this.conn = null; // client
    this.nextId = 100;
    this.acc = 0;
    this.mySeq = 0;
    this.lastHeard = 0; // client: when the host last spoke
    this.checkT = 0;
    this.pingT = 0;
    this.version = BUILD; // must match exactly to share a room
    this.versionTime = BUILD_TIME;
    this.pid = getAccount().id; // who we are, so a host can give us our place back after a drop
    this.parked = new Map(); // host: player id -> what a dropped player had (see _drop)
    this.lastCode = ''; // client: the room we were last in (for rejoining)
  }

  get active() { return this.role !== null; }

  get humanCount() {
    return this.role ? 1 + this.game.remotes.filter((r) => r.isHuman).length : 0;
  }

  // ======================================================================
  // session
  // ======================================================================

  /** Open a room. `password`: optional; joiners must give the same one. */
  async host(name, password = '') {
    this.password = String(password || '').slice(0, 32);
    const room = await getTransport().host(makeRoomCode());
    const g = this.game;
    this.role = 'host';
    this.room = room;
    this.code = room.code;
    g.net = this;
    g.player.id = 0;
    g.player.name = cleanName(name) || 'Host';
    g.player.color = g.player.baseColor = HUMAN_COLORS[0];
    room.onConnection = (conn) => this._accept(conn);
    return room.code;
  }

  async join(code, name, password = this.lastPw || '') {
    this.lastPw = String(password || '').slice(0, 32);
    code = cleanRoomCode(code);
    if (!code) throw new Error('Enter a room code.');
    const conn = await getTransport().join(code);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { conn.onClose = null; conn.close(); reject(new Error('The host did not respond.')); }, 8000);
      conn.onClose = () => { clearTimeout(timer); reject(new Error('The connection was closed.')); };
      conn.onMessage = (m) => {
        if (!m) return;
        if (m.t === 'denied') {
          clearTimeout(timer);
          conn.onClose = null;
          conn.close();
          reject(new Error(this.lastPw ? 'Wrong password for that room.' : 'That room is private. Enter its password and join again.'));
          return;
        }
        if (m.t === 'full') {
          clearTimeout(timer);
          conn.onClose = null;
          conn.close();
          reject(new Error('That room is full.'));
          return;
        }
        if (m.t === 'version') {
          // the host turned us away: we're on different builds
          clearTimeout(timer);
          conn.onClose = null;
          conn.close();
          const hostNewer = typeof m.vt === 'string' && m.vt > this.versionTime;
          reject(new Error(hostNewer ? OLD_CLIENT_MSG : OLD_HOST_MSG));
          return;
        }
        if (m.t !== 'welcome') return;
        clearTimeout(timer);
        if (m.v !== this.version) {
          // a host from before version checks existed, or a mismatched one
          conn.onClose = null;
          conn.close();
          const hostNewer = typeof m.vt === 'string' && m.vt > this.versionTime;
          reject(new Error(hostNewer ? OLD_CLIENT_MSG : OLD_HOST_MSG));
          return;
        }
        this.role = 'client';
        this.conn = conn;
        this.code = code;
        this.lastHeard = performance.now();
        this.game.net = this;
        conn.onMessage = (mm) => this._clientMsg(mm);
        conn.onClose = () => this._lost();
        this._begin(m);
        resolve();
      };
      conn.send({ t: 'hello', name: cleanName(name), v: this.version, vt: this.versionTime, pid: this.pid, cos: this._myCos(), tp: this.game.player.teamPref, pw: this.lastPw || undefined });
    });
  }

  /**
   * Leave the session. `onPurpose` = false for a tab closing / reloading: a client
   * then doesn't say goodbye, so the host keeps their place in case they come back.
   */
  leave(onPurpose = true) {
    if (!this.role) return;
    if (this.role === 'host') {
      // tell everyone the room is closing on purpose, so they don't try to rejoin
      for (const r of this.game.remotes) if (r.conn) { r.conn.send({ t: 'bye' }); }
      const conns = this.game.remotes.filter((r) => r.conn).map((r) => r.conn);
      for (const c of conns) c.onClose = null;
      setTimeout(() => conns.forEach((c) => c.close()), 150);
      const room = this.room;
      this.room = null;
      setTimeout(() => room.close(), 200);
      this.parked.clear();
    } else if (this.conn) {
      if (onPurpose) this.conn.send({ t: 'bye' }); // leaving on purpose: no need to keep our place
      const c = this.conn;
      c.onClose = null;
      setTimeout(() => c.close(), 150);
    }
    this._reset();
  }

  _reset() {
    const g = this.game;
    this.role = null;
    this.room = null;
    this.conn = null;
    this.code = '';
    g.net = null;
    g.player.id = 0;
    g.player.name = 'You';
    g.player.color = g.player.baseColor = HUMAN_COLORS[0];
  }

  /** Client: the connection to the host is gone. `retry` = worth trying to rejoin. */
  _lost(reason = 'Lost connection to the host.', retry = true) {
    if (!this.role) return;
    const code = this.code;
    if (this.conn) { this.conn.onClose = null; this.conn.close(); }
    this._reset();
    this.lastCode = code;
    this.hooks.onLeft(reason, retry ? code : '');
  }

  /** Call once per frame after game.update(). */
  update(dt) {
    if (!this.role) return;
    this.acc += dt;
    if (this.role === 'host') {
      if (this.acc >= SNAP_INTERVAL) { this.acc = 0; this._sendSnapshot(); }
    } else if (this.acc >= SEND_INTERVAL) {
      this.acc = 0;
      this._sendState();
    }
    // host: time a round trip to every player every couple of seconds
    if (this.role === 'host') {
      this.pingSendT = (this.pingSendT || 0) + dt;
      if (this.pingSendT >= 2) {
        this.pingSendT = 0;
        const ts = Math.round(performance.now());
        for (const r of this.game.remotes) if (r.conn) r.conn.send({ t: 'pg', ts });
      }
    }
    // A dropped connection doesn't always announce itself: watch for silence.
    this.checkT += dt;
    if (this.checkT < 1) return;
    this.checkT = 0;
    const now = performance.now();
    if (this.role === 'host') {
      for (const r of [...this.game.remotes]) {
        if (r.conn && now - r.lastSeen > TIMEOUT_MS) {
          r.conn.onClose = null;
          r.conn.close();
          this._drop(r, true);
        }
      }
    } else if (now - this.lastHeard > TIMEOUT_MS) {
      this._lost('Lost connection to the host.');
    }
  }

  broadcast(msg, except) {
    for (const r of this.game.remotes) if (r.conn && r.conn !== except) r.conn.send(msg);
  }

  // ======================================================================
  // host side
  // ======================================================================

  _accept(conn) {
    let char = null;
    const timer = setTimeout(() => { if (!char) conn.close(); }, 8000);
    conn.onMessage = (m) => {
      if (!m || typeof m !== 'object') return;
      if (char) { this._hostMsg(char, m); return; }
      if (m.t !== 'hello') return;
      clearTimeout(timer);
      if (m.v !== this.version) {
        // different build: tell them which side needs to refresh, then hang up
        conn.send({ t: 'version', v: this.version, vt: this.versionTime });
        setTimeout(() => conn.close(), 600);
        const theyOlder = !(typeof m.vt === 'string' && m.vt > this.versionTime);
        this.hooks.onChat('', 0, theyOlder
          ? 'Someone tried to join on an older version of the game. They need to refresh their page.'
          : 'Someone tried to join on a newer version of the game. Refresh your page and host a new room.');
        return;
      }
      // private room: the password has to match
      if (this.password && m.pw !== this.password) {
        conn.send({ t: 'denied', why: 'password' });
        setTimeout(() => conn.close(), 400);
        return;
      }
      char = this._admit(conn, m);
    };
    conn.onClose = () => {
      clearTimeout(timer);
      if (char && this.role === 'host') this._drop(char, !char.leftOnPurpose);
    };
  }

  _admit(conn, m) {
    const g = this.game;
    const now = performance.now();
    // the same player connecting again replaces their old self: same connection, or the
    // same player ID on a connection that has gone quiet (a dropped player coming back)
    const pid = isPlayerId(m.pid) && m.pid !== this.pid ? m.pid : null;
    for (const r of [...g.remotes]) {
      if (!r.conn) continue;
      const stale = pid && r.pid === pid && now - r.lastSeen > 1500;
      if (r.conn.id === conn.id || stale) { r.conn.onClose = null; r.conn.close(); this._drop(r, true, true); }
    }
    const humans = g.remotes.filter((r) => r.isHuman);
    if (humans.length + 1 >= MAX_HUMANS) {
      conn.send({ t: 'full' });
      setTimeout(() => conn.close(), 300);
      return null;
    }
    // personal colours (not the team colours they may be wearing right now)
    const used = new Set([g.player.baseColor, ...humans.map((h) => h.baseColor)]);
    const color = HUMAN_COLORS.find((c) => !used.has(c)) || HUMAN_COLORS[humans.length % HUMAN_COLORS.length];
    let name = cleanName(m.name) || 'Player';
    const names = new Set(g.chars.map((c) => c.name.toLowerCase()));
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${cleanName(m.name) || 'Player'} ${i}`.slice(0, 18);

    // back after a drop? pick up where they left off
    let saved = null;
    for (const [k, p] of this.parked) if (now > p.until) this.parked.delete(k);
    if (pid && this.parked.has(pid) && !g.over) {
      saved = this.parked.get(pid);
      this.parked.delete(pid);
      if (!names.has(saved.name.toLowerCase())) name = saved.name;
    }

    const c = new NetChar(g, this.nextId++, name, saved && !used.has(saved.color) ? saved.color : color, false);
    c.conn = conn;
    c.pid = pid;
    c.teamPref = m.tp === 0 || m.tp === 1 ? m.tp : -1;
    c.setCosmetics(unpackCosmetics(m.cos));
    c.lastSeen = now;
    c.alive = false;
    c.respawnAt = Infinity;
    g.addRemote(c);
    g.resetScore(c);
    if (saved) {
      c.kills = saved.kills; c.deaths = saved.deaths; c.lives = saved.lives;
      c.hillTime = saved.hillTime; c.st = saved.st; c.caps = saved.caps || 0;
      c.gunLevel = saved.gunLevel;
      if (g.rules.teams && (saved.team === 0 || saved.team === 1)) { c.team = saved.team; g.paint(c); } else g.joinTeam(c);
    } else {
      g.joinTeam(c);
    }
    // Last One Standing: a round in progress can't be joined, so watch until the next one
    // (someone coming back keeps whatever lives they had left)
    const spectate = !!g.rules.lives && (!saved || c.lives <= 0);
    if (spectate) c.lives = 0;
    const welcome = { t: 'welcome', v: this.version, vt: this.versionTime, you: c.id, map: g.map.id, mode: g.rules.id, cr: g.rules.custom, mt: r2(g.matchTime), over: g.over, r: this._roster(), ts: g.teamScore };
    if (g.over) Object.assign(welcome, { aw: g.awards, vo: g.voteOptions, vn: g.voteTally(), vl: Math.round((g.voteDeadline - performance.now()) / 1000) });
    conn.send(welcome);
    if (!g.over && !spectate) g.respawn(c, true);
    this.broadcast({ t: 'roster', r: this._roster() }, conn);
    if (saved) this.system(`${name} rejoined with their score`);
    else this.system(spectate ? `${name} joined. They play from the next round.` : `${name} joined`);
    this.hooks.onRoster();
    return c;
  }

  /**
   * A player is gone. `keep`: they didn't leave on purpose (dropped / timed out),
   * so hold on to their score in case they come back. `quiet`: no chat line.
   */
  _drop(c, keep = false, quiet = false) {
    const g = this.game;
    if (!g.remotes.includes(c)) return;
    const kept = keep && c.pid && !g.over;
    if (kept) {
      this.parked.set(c.pid, {
        name: c.name, color: c.baseColor, team: c.team, kills: c.kills, deaths: c.deaths, lives: c.lives, caps: c.caps || 0,
        hillTime: c.hillTime || 0, gunLevel: c.gunLevel, st: c.st, until: performance.now() + REJOIN_MS,
      });
    }
    g.removeRemote(c);
    this.broadcast({ t: 'roster', r: this._roster() });
    if (!quiet) this.system(kept ? `${c.name} dropped. Their score holds for 3 minutes.` : `${c.name} left`);
    this.hooks.onRoster();
  }

  _roster() {
    return this.game.chars.map((c) => [c.id, c.name, c.color, c.isHuman ? 0 : 1, c.team, packCosmetics(c.cos.equipped, c.cos.level, c.cos.prestige)]);
  }

  /** Our own level + cosmetics, packed for the wire. */
  _myCos() {
    const g = this.game, cos = g.ownCosmetics();
    return packCosmetics(cos.equipped, cos.level, cos.prestige);
  }

  /** Ask to switch team (client), or switch (host). */
  requestTeam(t) {
    const g = this.game;
    g.player.teamPref = t;
    if (this.role === 'host') g.switchTeam(g.player, t);
    else if (this.conn) this.conn.send({ t: 'team', tm: t });
  }

  /** Our cosmetics or level changed: let everyone know. */
  cosmeticsChanged() {
    const g = this.game;
    g.player.cos = g.ownCosmetics();
    if (this.role === 'host') this.onRosterChanged();
    else if (this.conn) this.conn.send({ t: 'cos', c: this._myCos() });
  }

  _hostMsg(c, m) {
    const g0 = this.game;
    c.lastSeen = performance.now();
    if (m.t === 'u') this._hostState(c, m.d);
    else if (m.t === 'f') this._hostFire(c, m);
    else if (m.t === 'g') this._hostGrenade(c, m);
    else if (m.t === 'k') this._hostKnife(c, m);
    else if (m.t === 'vote') this._vote(c.id, m.i);
    else if (m.t === 'bye') c.leftOnPurpose = true;
    else if (m.t === 'po' && num(m.ts)) {
      const rtt = Math.max(0, performance.now() - m.ts);
      if (rtt < 10000) c.ping = c.ping ? Math.round(c.ping * 0.6 + rtt * 0.4) : Math.round(rtt);
    }
    else if (m.t === 'team') {
      const now = performance.now();
      if ((m.tm === 0 || m.tm === 1) && now - (c.lastTeamT || 0) > 1000) { c.lastTeamT = now; g0.switchTeam(c, m.tm); }
    }
    else if (m.t === 'cos') {
      const now = performance.now();
      if (now - (c.lastCosT || 0) < 300) return;
      c.lastCosT = now;
      c.setCosmetics(unpackCosmetics(m.c));
      this.onRosterChanged();
    }
    else if (m.t === 'c') {
      const now = performance.now();
      const text = cleanChat(m.m);
      if (!text || now - (c.lastChatT || 0) < 400) return; // no flooding
      c.lastChatT = now;
      this._chat(c.name, c.color, text);
    }
  }

  /** Host: show a chat line here and send it to everyone. */
  _chat(name, color, text) {
    this.broadcast({ t: 'c', n: name, col: color, m: text });
    this.hooks.onChat(name, color, text);
  }

  /** Host: a grey "so-and-so joined" style line for everyone. */
  system(text) { this._chat('', 0, text); }

  /** Say something (host or client). */
  sendChat(text) {
    text = cleanChat(text);
    if (!text || !this.role) return;
    if (this.role === 'host') this._chat(this.game.player.name, this.game.player.color, text);
    else if (this.conn) this.conn.send({ t: 'c', m: text });
  }

  /** A remote player swung their knife: show it, and check the hit they claim. */
  _hostKnife(c, m) {
    const g = this.game;
    if (!c.alive || g.over) return;
    const now = performance.now() / 1000;
    if (now - (c.lastKnifeT || 0) < KNIFE.cooldown * 0.6) return; // faster than a knife can swing
    c.lastKnifeT = now;
    c.protectedUntil = 0;
    g.audio.play('knife', c.pos);
    c.model.melee();
    this.broadcast({ t: 'kn', id: c.id }, c.conn);
    g.emitNoise(c.pos.x, c.pos.y, c.pos.z, KNIFE.noise, c, 'step');
    const v = num(m.v) ? g.charById(m.v) : null;
    if (!v || v === c || !v.alive || g.sameTeam(v, c)) return;
    // plausible reach (with slack for lag), same floor, nothing solid in between
    const d = Math.hypot(v.pos.x - c.pos.x, v.pos.z - c.pos.z) - v.radius;
    if (d > KNIFE.range + 1.2 || Math.abs(v.pos.y - c.pos.y) > 1.8) return;
    c.getEye(_eye);
    if (g.world.segmentBlocked(_eye.x, _eye.y, _eye.z, v.pos.x, v.pos.y + v.height * 0.55, v.pos.z)) return;
    g.knifeHit(c, v, !!m.b && g.isBehind(c, v, 0.45));
  }

  /** Client: tell the host we swung, and who (if anyone) we think we hit. */
  sendKnife(victimId, back) {
    if (this.conn) this.conn.send({ t: 'k', v: victimId, b: back ? 1 : 0 });
  }

  /** A remote player threw a grenade: the host owns it from here. */
  _hostGrenade(c, m) {
    const g = this.game;
    const def = NADES[m.k | 0] || GRENADE;
    if (g.over || !vec3(m.o) || !vec3(m.v)) return;
    if (def !== GRENADE && def !== c.tacDef) return; // not what they carry
    if (c.nadesOf(def) <= 0) return;
    // a grenade dropped as they died can still arrive just after the kill
    const justDied = !c.alive && performance.now() - (c.diedAt || 0) < 700;
    if (!c.alive && !justDied) return;
    const now = performance.now();
    if (now - (c.lastNadeT || 0) < 500) return;
    c.getEye(_eye);
    if (Math.hypot(m.o[0] - _eye.x, m.o[1] - _eye.y, m.o[2] - _eye.z) > 3.5) return; // not from where they are
    if (Math.hypot(m.v[0], m.v[1], m.v[2]) > 32) return; // nobody throws that hard
    c.lastNadeT = now;
    if (def === GRENADE) c.grenades--;
    else c.tactical--;
    c.protectedUntil = 0;
    const fuse = clamp(num(m.f) ? m.f : def.fuse, 0, def.fuse);
    g.spawnGrenade(g.nextGrenadeId++, c, m.o.slice(0, 3), m.v.slice(0, 3), def, fuse);
  }

  _hostState(c, d) {
    if (!Array.isArray(d) || d.length < 11) return;
    for (let i = 0; i < 11; i++) if (!num(d[i])) return;
    // ignore anything sent before the player knew about their latest (re)spawn
    if (!c.alive || d[8] !== c.spawnSeq) return;
    const b = this.game.world.bounds;
    c.push(clamp(d[0], b.minX, b.maxX), clamp(d[1], -2, 40), clamp(d[2], b.minZ, b.maxZ), d[3], clamp(d[4], -1.6, 1.6));
    c.netCrouch = !!(d[5] & 2);
    c.netGround = !!(d[5] & 8);
    c.netLean = clamp(d[9], -1, 1);
    // their loadout: mirrored so pickups know what this player could use
    const prim = WEAPONS[d[10] | 0];
    const g = this.game;
    if (prim && isPrimary(prim.id) && prim.id !== c.primary) {
      c.primary = prim.id;
      if (!g.rules.gunGame) c.weapons = g.loadoutFor(c);
    }
    c.weaponIdx = Math.min(c.weapons.length - 1, (d[6] | 0) === c.weapons[0].def.index ? 0 : 1);
    if (!g.rules.gunGame) c.weapons[0].reserve = clamp(d[7] | 0, 0, c.weapons[0].def.reserveMax);
    // their weapon skins (cosmetic, so taken at their word)
    if (num(d[12]) && num(d[13]) && SKINS[d[12] | 0] && SKINS[d[13] | 0]) {
      c.skins = { [c.weapons[0].def.id]: SKINS[d[12] | 0].id, pistol: SKINS[d[13] | 0].id };
    }
    const tac = TACTICALS[d[11] | 0];
    if (num(d[11]) && tac && tac !== c.tacId) {
      c.tacId = tac;
      c.tacDef = TACTICAL_BY_ID[tac];
    }
  }

  /** A remote player fired. Relay the visuals and check their hit claims. */
  _hostFire(c, m) {
    const g = this.game;
    if (!c.alive || g.over) return;
    const def = WEAPONS[m.w];
    if (!def || !Array.isArray(m.m) || !m.m.every(num)) return;
    const now = performance.now() / 1000;
    if (now - c.lastFireT < def.interval * 0.6) return; // faster than the gun can shoot
    c.lastFireT = now;
    c.weaponIdx = def.id === 'pistol' ? 1 : 0;
    c.protectedUntil = 0;

    const ends = [];
    for (const e of Array.isArray(m.e) ? m.e.slice(0, def.pellets) : []) {
      if (Array.isArray(e) && e.length >= 4 && e.every(num)) ends.push(e.slice(0, 7));
    }
    const shot = { t: 'shot', id: c.id, w: def.index, m: m.m.slice(0, 3), e: ends };
    this.showShot(shot);
    this.broadcast(shot, c.conn);
    g.emitNoise(c.pos.x, c.pos.y, c.pos.z, def.noise, c, 'shot');

    const world = g.world;
    c.getEye(_eye); // includes their lean, so shots around a corner check out
    const ex = _eye.x, ey = _eye.y, ez = _eye.z;
    const totals = new Map();
    for (const h of Array.isArray(m.h) ? m.h.slice(0, def.pellets) : []) {
      if (!Array.isArray(h) || !num(h[0]) || !num(h[2])) continue;
      const v = g.charById(h[0]);
      if (!v || v === c || !v.alive) continue;
      // plausibility: roughly the distance they say, and not through a wall
      const actual = Math.hypot(v.pos.x - ex, v.pos.y + v.height * 0.5 - ey, v.pos.z - ez);
      if (Math.abs(actual - h[2]) > 8 || actual > def.range) continue;
      const blocked = world.segmentBlocked(ex, ey, ez, v.pos.x, v.pos.y + v.eyeH, v.pos.z)
        && world.segmentBlocked(ex, ey, ez, v.pos.x, v.pos.y + v.height * 0.5, v.pos.z)
        && world.segmentBlocked(ex, ey, ez, v.pos.x, v.pos.y + 0.2, v.pos.z);
      if (blocked) continue;
      const head = !!h[1];
      const t = totals.get(v) || { dmg: 0, head: false };
      t.dmg += damageAtDistance(def, actual) * (head ? CFG.headshotMult : 1);
      t.head = t.head || head;
      totals.set(v, t);
    }
    let hit = false;
    for (const [v] of totals) if (!v.isProtected() && !g.sameTeam(v, c)) hit = true;
    g.countShot(c, hit);
    for (const [v, t] of totals) g.damage(v, t.dmg, c, t.head, def);
  }

  _sendSnapshot() {
    const g = this.game;
    if (!g.remotes.some((r) => r.conn)) return;
    const c = g.chars.map((ch) => [
      ch.id, r2(ch.pos.x), r2(ch.pos.y), r2(ch.pos.z), r3(ch.yaw), r3(ch.pitch),
      (ch.alive ? 1 : 0) | (ch.crouching ? 2 : 0) | (ch.isProtected() ? 4 : 0) | (ch.onGround ? 8 : 0),
      Math.max(0, Math.round(ch.health * 10) / 10), Math.round(ch.armor * 10) / 10,
      ch.kills, ch.deaths, ch.weapon.def.index, r2(ch.lean), ch.lives,
      ch.weapons[0].def.index, ch.weapons.length > 1 ? 1 : 0, Math.round(ch.hillTime || 0), ch.caps || 0,
      skinIndex(ch.skinOf(ch.weapons[0].def.id)), skinIndex(ch.skinOf('pistol')),
      ch === g.player ? 0 : ch.isHuman ? (ch.ping ?? -2) : -1, // -2: not measured yet
    ]);
    let p = '';
    for (const pk of g.pickups) p += pk.active ? '1' : '0';
    const snap = { t: 's', mt: r2(g.matchTime), c, p, ts: g.teamScore };
    if (g.rules.hill) snap.hl = [g.hill.idx, r2(g.hill.t), g.hill.holder];
    if (g.ctf) snap.fl = g.ctf.snapshot();
    this.broadcast(snap);
  }

  // hooks called by Game on the host ---------------------------------------

  onStart() {
    const g = this.game;
    this.parked.clear(); // scores belong to the match that just ended
    this.broadcast({ t: 'start', map: g.map.id, mode: g.rules.id, cr: g.rules.custom, mt: r2(g.matchTime), r: this._roster() });
  }

  onSpawn(c) {
    if (c.conn) c.conn.send({ t: 'spawn', x: r2(c.pos.x), y: r2(c.pos.y), z: r2(c.pos.z), yaw: r3(c.yaw), sq: c.spawnSeq });
  }

  onShot(shooter, def, muz, ends) {
    if (!this.game.remotes.some((r) => r.conn)) return;
    this.broadcast({ t: 'shot', id: shooter.id, w: def.index, m: [r2(muz.x), r2(muz.y), r2(muz.z)], e: ends });
  }

  onKill(victim, attacker, head, weapon) {
    this.broadcast({ t: 'kill', v: victim.id, k: attacker.id, h: head ? 1 : 0, w: weapon });
  }

  /** A flag event (take / drop / return / home / cap) for team `team`'s flag. */
  onFlag(kind, team, who) {
    this.broadcast({ t: 'fl', k: kind, tm: team, id: who ? who.id : -1 });
  }

  onPickup(i, c) {
    this.broadcast({ t: 'pick', i, id: c.id });
  }

  onKnife(a) {
    this.broadcast({ t: 'kn', id: a.id });
  }

  onGrenade(gr) {
    this.broadcast({ t: 'gr', id: gr.id, own: gr.owner ? gr.owner.id : -1, o: [gr.x, gr.y, gr.z], v: [gr.vx, gr.vy, gr.vz], k: gr.def.index, f: r2(gr.fuse) });
  }

  /** k: 0 frag, 1 flashbang, 2 smoke */
  onExplode(id, x, y, z, k = 0) {
    this.broadcast({ t: 'ex', id, x: r2(x), y: r2(y), z: r2(z), k });
  }

  /** Bots were switched on or off. */
  onRosterChanged() {
    this.broadcast({ t: 'roster', r: this._roster() });
    this.hooks.onRoster();
  }

  onEnd() {
    const g = this.game;
    this._sendSnapshot(); // final scores
    this.broadcast({ t: 'end', aw: g.awards, vo: g.voteOptions, vl: Math.round((g.voteDeadline - performance.now()) / 1000) });
  }

  /** Host: someone voted for the next map / mode. */
  _vote(id, i) {
    const g = this.game;
    if (!g.over || !g.voteOptions || !num(i)) return;
    i |= 0;
    if (i < 0 || i >= g.voteOptions.length) return;
    g.votes.set(id, i);
    this.broadcast({ t: 'votes', n: g.voteTally() });
    if (this.hooks.onVotes) this.hooks.onVotes();
  }

  /** Vote for option i (host or client). */
  vote(i) {
    const g = this.game;
    if (this.role === 'host') this._vote(g.player.id, i);
    else if (this.conn) {
      g.votes.set(g.player.id, i); // remembered locally to highlight our pick
      this.conn.send({ t: 'vote', i });
    }
  }

  // ======================================================================
  // client side
  // ======================================================================

  _begin(m) {
    const g = this.game;
    g.clearRemotes();
    if (num(m.you)) g.player.id = m.you;
    g.loadMap(getMap(m.map));
    g.startClient(num(m.mt) ? m.mt : CFG.timeLimit, makeRules(getMode(m.mode).id, m.cr));
    this._applyRoster(m.r);
    if (Array.isArray(m.ts)) g.teamScore = [m.ts[0] | 0, m.ts[1] | 0];
    if (m.over) { this._readEnd(m); g.over = true; }
  }

  /** Client: awards + next-match choices from the host, checked before they reach the page. */
  _readEnd(m) {
    const g = this.game;
    g.awards = (Array.isArray(m.aw) ? m.aw : []).slice(0, 8)
      .filter((a) => Array.isArray(a) && a.length >= 4 && num(a[2]))
      .map((a) => [cleanChat(a[0]).slice(0, 24), cleanName(a[1]), a[2], cleanChat(a[3]).slice(0, 40)]);
    g.voteOptions = (Array.isArray(m.vo) ? m.vo : []).slice(0, 3)
      .filter((o) => Array.isArray(o) && typeof o[0] === 'string' && typeof o[1] === 'string')
      .map((o) => [getMap(o[0]).id, getMode(o[1]).id]);
    g.votes = new Map();
    g.voteCounts = Array.isArray(m.vn) && m.vn.every(num) ? m.vn.slice(0, 3) : g.voteOptions.map(() => 0);
    g.voteDeadline = num(m.vl) ? performance.now() + clamp(m.vl, 0, 120) * 1000 : 0;
  }

  _applyRoster(list) {
    const g = this.game;
    if (!Array.isArray(list)) return;
    const seen = new Set();
    for (const e of list) {
      if (!Array.isArray(e) || !num(e[0])) continue;
      const [id, name, color, bot, team, cos] = e;
      seen.add(id);
      const col = num(color) ? color : 0xffffff;
      if (id === g.player.id) {
        g.player.name = cleanName(name) || 'You';
        g.player.color = col;
        g.player.team = num(team) ? team : -1;
        continue;
      }
      let c = g.remotes.find((r) => r.id === id);
      if (!c) {
        c = new NetChar(g, id, cleanName(name) || 'Player', col, !!bot);
        c.alive = false;
        g.addRemote(c);
      }
      c.team = num(team) ? team : -1;
      c.color = col;
      c.model.setColor(col, c.name);
      if (Array.isArray(cos)) c.setCosmetics(unpackCosmetics(cos));
    }
    for (const r of [...g.remotes]) if (!seen.has(r.id)) g.removeRemote(r);
    this.hooks.onRoster();
  }

  _clientMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.lastHeard = performance.now();
    const g = this.game, p = g.player;
    switch (m.t) {
      case 's': this.lastSnapT = performance.now(); this._applySnapshot(m); break;
      case 'pg': if (this.conn && num(m.ts)) this.conn.send({ t: 'po', ts: m.ts }); break;
      case 'roster': this._applyRoster(m.r); break;
      case 'spawn':
        p.spawnAt(m.x, m.y, m.z, m.yaw);
        this.mySeq = m.sq;
        if (g.time > 1) g.audio.play('respawn');
        break;
      case 'shot':
        if (m.id !== p.id) this.showShot(m);
        break;
      case 'kill': {
        const victim = g.charById(m.v);
        if (!victim || !victim.alive) break;
        const killer = g.charById(m.k) || victim;
        victim.alive = false;
        victim.health = 0;
        victim.respawnAt = g.time + CFG.respawnDelay;
        if (g.rules.lives) victim.lives = Math.max(0, victim.lives - 1); // the next snapshot confirms
        g.presentKill(victim, killer, !!m.h, String(m.w || '?'));
        break;
      }
      case 'hurt':
        if (!p.alive) break;
        if (num(m.hp)) p.health = m.hp;
        if (num(m.ar)) p.armor = m.ar;
        p.onDamaged(g.charById(m.a), num(m.d) ? m.d : 10);
        break;
      case 'pick': {
        const pk = g.pickups[m.i];
        if (!pk) break;
        const who = g.charById(m.id);
        if (pk.active) pk.take();
        g.effects.pickupBurst(pk.pos.x, pk.pos.y, pk.pos.z, pk.info.color);
        g.audio.play('pickup', who === p ? null : pk.pos, 1, pk.info.tone);
        if (who === p) {
          pk.apply(p); // ammo is ours to track; health/armour is confirmed by the next snapshot
          g.hud.toast(pk.info.label, '#' + pk.info.color.toString(16).padStart(6, '0'));
        }
        break;
      }
      case 'kn': {
        const c = m.id !== p.id && g.charById(m.id);
        if (c && c.alive) {
          g.audio.play('knife', c.pos);
          if (c.model) c.model.melee();
        }
        break;
      }
      case 'gr':
        if (vec3(m.o) && vec3(m.v)) {
          const def = NADES[m.k | 0] || GRENADE;
          g.spawnGrenade(m.id, g.charById(m.own), m.o, m.v, def, num(m.f) ? clamp(m.f, 0, def.fuse) : def.fuse);
        }
        break;
      case 'ex': {
        const i = g.grenades.findIndex((gr) => gr.id === m.id);
        if (i >= 0) g.removeGrenade(i);
        if (num(m.x) && num(m.y) && num(m.z)) {
          if (m.k === 1) g.showFlash(m.x, m.y, m.z, false);
          else if (m.k === 2) g.showSmoke(m.x, m.y, m.z);
          else g.showExplosion(m.x, m.y, m.z);
        }
        break;
      }
      case 'c':
        this.hooks.onChat(cleanName(m.n), num(m.col) ? m.col : 0, cleanChat(m.m));
        break;
      case 'fl':
        if (g.ctf && ['take', 'drop', 'return', 'home', 'cap'].includes(m.k) && (m.tm === 0 || m.tm === 1)) {
          g.ctf.present(m.k, m.tm, num(m.id) ? g.charById(m.id) : null);
        }
        break;
      case 'bye':
        this._lost('The host closed the room.', false);
        break;
      case 'votes':
        if (Array.isArray(m.n) && m.n.every(num)) {
          g.voteCounts = m.n.slice(0, 3);
          if (this.hooks.onVotes) this.hooks.onVotes();
        }
        break;
      case 'end':
        if (g.over) break;
        this._readEnd(m);
        g.over = true;
        g.winner = g.ranking()[0];
        if (g.onMatchEnd) g.onMatchEnd(g.winner, g.ranking());
        break;
      case 'start':
        g.loadMap(getMap(m.map));
        g.startClient(num(m.mt) ? m.mt : CFG.timeLimit, makeRules(getMode(m.mode).id, m.cr));
        this._applyRoster(m.r);
        this.hooks.onMatchStart();
        break;
      default: break;
    }
  }

  _applySnapshot(m) {
    const g = this.game, p = g.player;
    if (num(m.mt)) g.matchTime = m.mt;
    if (Array.isArray(m.ts)) g.teamScore = [m.ts[0] | 0, m.ts[1] | 0];
    if (Array.isArray(m.hl) && g.rules.hill && m.hl.every(num)) {
      const [idx, t, holder] = m.hl;
      if (idx !== g.hill.idx && g.time > 1) g.announcer.announce('Hill moved', 'Get to the new zone');
      if (holder !== g.hill.holder && (holder === 0 || holder === 1)) g.hillTaken(holder);
      g.hill.idx = idx; g.hill.t = t; g.hill.holder = holder;
    }
    if (g.ctf && Array.isArray(m.fl)) g.ctf.applySnapshot(m.fl);
    if (Array.isArray(m.c)) {
      for (const e of m.c) {
        if (!Array.isArray(e) || e.length < 12) continue;
        const [id, x, y, z, yaw, pitch, fl, hp, ar, k, d, held, lean, lives, prim, side, hillT, caps, skinP, skinS, ping] = e;
        if (id === p.id) {
          p.kills = k; p.deaths = d;
          if (num(caps)) p.caps = caps;
          if (num(ping)) p.ping = ping;
          if (num(lives)) p.lives = lives;
          if (num(hillT)) p.hillTime = hillT;
          p.applyGunLevel(); // gun game: a kill may have earned the next gun
          if (p.alive) { p.health = hp; p.armor = ar; }
          if (!(fl & 4)) p.protectedUntil = 0;
          continue;
        }
        const c = g.charById(id);
        if (!c || !c.isRemote) continue;
        const alive = !!(fl & 1);
        if (alive && !c.alive) { c.alive = true; c.place(x, y, z, yaw); }
        else if (!alive && c.alive) { c.alive = false; c.model.deadT = 0; }
        if (alive) c.push(x, y, z, yaw, pitch);
        c.netCrouch = !!(fl & 2);
        c.netProtected = !!(fl & 4);
        c.netGround = !!(fl & 8);
        c.netLean = num(lean) ? clamp(lean, -1, 1) : 0;
        c.health = hp; c.armor = ar; c.kills = k; c.deaths = d;
        if (num(lives)) c.lives = lives;
        if (num(hillT)) c.hillTime = hillT;
        if (num(caps)) c.caps = caps;
        if (num(ping)) c.ping = ping;
        if (num(skinP)) c.netSkinP = skinP | 0;
        if (num(skinS)) c.netSkinS = skinS | 0;
        if (num(held)) c.netHeld = held | 0;
        if (num(prim)) c.netPrim = prim | 0;
        if (num(side)) c.netSide = !!side;
      }
    }
    if (typeof m.p === 'string') {
      const n = Math.min(m.p.length, g.pickups.length);
      for (let i = 0; i < n; i++) g.pickups[i].setActive(m.p.charCodeAt(i) === 49);
    }
  }

  _sendState() {
    const p = this.game.player;
    if (!this.conn) return;
    if (!p.alive) {
      // nothing to report while dead, but let the host know we're still here
      if (++this.pingT >= 30) { this.pingT = 0; this.conn.send({ t: 'p' }); }
      return;
    }
    this.conn.send({
      t: 'u',
      d: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r3(p.yaw), r3(p.pitch),
        (p.crouching ? 2 : 0) | (p.onGround ? 8 : 0),
        p.weapon.def.index, p.weapons[0].reserve === Infinity ? 0 : p.weapons[0].reserve, this.mySeq,
        r2(p.lean), WEAPON_BY_ID[p.primary].index, Math.max(0, TACTICALS.indexOf(p.tacId)),
        skinIndex(p.skinOf(p.weapons[0].def.id)), skinIndex(p.skinOf('pistol'))],
    });
  }

  /** Client: tell the host about a shot we just fired. */
  sendFire(def, muz, ends, claims) {
    if (!this.conn) return;
    this.conn.send({ t: 'f', w: def.index, m: [r2(muz.x), r2(muz.y), r2(muz.z)], e: ends, h: claims });
  }

  /** Client: ask the host to spawn a grenade we just threw. */
  sendGrenade(o, v, k = 0, f = GRENADE.fuse) {
    if (this.conn) this.conn.send({ t: 'g', o, v, k, f });
  }

  // ======================================================================
  // shared
  // ======================================================================

  /** Draw / play a shot that somebody else fired. */
  showShot(m) {
    const g = this.game, fx = g.effects;
    const def = WEAPONS[m.w];
    if (!def || !Array.isArray(m.m) || !Array.isArray(m.e)) return;
    g.killcam.shot(m.id, m.w, m.m, m.e);
    const [mx, my, mz] = m.m;
    const shooter = g.charById(m.id);
    for (let i = 0; i < m.e.length && i < def.pellets; i++) {
      const e = m.e[i];
      if (e[3] === 1) {
        fx.impact(e[0], e[1], e[2], e[4] || 0, e[5] || 0, e[6] || 0, i < 3);
        if (i === 0) g.audio.play('impact', { x: e[0], y: e[1], z: e[2] });
      } else if (e[3] === 2) {
        const v = g.charById(e[4]);
        const dx = e[0] - mx, dy = e[1] - my, dz = e[2] - mz;
        const l = Math.hypot(dx, dy, dz) || 1;
        if (i < 4) fx.hitBurst(e[0], e[1], e[2], dx / l, dy / l, dz / l, v ? (v.isProtected() ? 0x8fd3ff : v.color) : 0xffffff, !!e[5]);
      }
      if (def.pellets === 1 || i % 2 === 0) fx.tracer(mx, my, mz, e[0], e[1], e[2], tracerColor(shooter));
    }
    g.audio.play(def.id, shooter ? shooter.pos : { x: mx, y: my, z: mz });
    if (shooter && shooter.model) shooter.model.muzzleFlash();
  }
}
