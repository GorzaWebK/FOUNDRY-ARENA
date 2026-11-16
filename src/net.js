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
//   end               match over
// Client -> host messages
//   hello, u (my state), f (I fired)

import { CFG, HUMAN_COLORS, MAX_HUMANS } from './config.js';
import { WEAPONS, damageAtDistance } from './weapons.js';
import { NetChar } from './netChar.js';
import { getTransport, makeRoomCode, cleanRoomCode } from './transport.js';

const SNAP_INTERVAL = 1 / 20;
const SEND_INTERVAL = 1 / 30;
const TIMEOUT_MS = 10000; // silence for this long means the other side is gone

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function cleanName(s) {
  // eslint-disable-next-line no-control-regex
  return String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16);
}

export class Net {
  /** hooks: { onRoster(), onLeft(reason), onMatchStart() } */
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
  }

  get active() { return this.role !== null; }

  get humanCount() {
    return this.role ? 1 + this.game.remotes.filter((r) => r.isHuman).length : 0;
  }

  // ======================================================================
  // session
  // ======================================================================

  async host(name) {
    const room = await getTransport().host(makeRoomCode());
    const g = this.game;
    this.role = 'host';
    this.room = room;
    this.code = room.code;
    g.net = this;
    g.player.id = 0;
    g.player.name = cleanName(name) || 'Host';
    g.player.color = HUMAN_COLORS[0];
    room.onConnection = (conn) => this._accept(conn);
    return room.code;
  }

  async join(code, name) {
    code = cleanRoomCode(code);
    if (!code) throw new Error('Enter a room code.');
    const conn = await getTransport().join(code);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { conn.onClose = null; conn.close(); reject(new Error('The host did not respond.')); }, 8000);
      conn.onClose = () => { clearTimeout(timer); reject(new Error('The connection was closed.')); };
      conn.onMessage = (m) => {
        if (!m) return;
        if (m.t === 'full') {
          clearTimeout(timer);
          conn.onClose = null;
          conn.close();
          reject(new Error('That room is full.'));
          return;
        }
        if (m.t !== 'welcome') return;
        clearTimeout(timer);
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
      conn.send({ t: 'hello', name: cleanName(name) });
    });
  }

  leave() {
    if (!this.role) return;
    if (this.role === 'host') {
      for (const r of this.game.remotes) if (r.conn) { r.conn.onClose = null; r.conn.close(); }
      this.room.close();
    } else if (this.conn) {
      this.conn.onClose = null;
      this.conn.close();
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
    g.player.color = HUMAN_COLORS[0];
  }

  _lost(reason = 'The host left the game.') {
    if (!this.role) return;
    if (this.conn) { this.conn.onClose = null; this.conn.close(); }
    this._reset();
    this.hooks.onLeft(reason);
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
          this._drop(r);
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
      char = this._admit(conn, m);
    };
    conn.onClose = () => {
      clearTimeout(timer);
      if (char && this.role === 'host') this._drop(char);
    };
  }

  _admit(conn, m) {
    const g = this.game;
    // the same browser connecting again replaces its old self
    for (const r of [...g.remotes]) if (r.conn && r.conn.id === conn.id) { r.conn.onClose = null; this._drop(r); }
    const humans = g.remotes.filter((r) => r.isHuman);
    if (humans.length + 1 >= MAX_HUMANS) {
      conn.send({ t: 'full' });
      setTimeout(() => conn.close(), 300);
      return null;
    }
    const used = new Set([g.player.color, ...humans.map((h) => h.color)]);
    const color = HUMAN_COLORS.find((c) => !used.has(c)) || HUMAN_COLORS[humans.length % HUMAN_COLORS.length];
    let name = cleanName(m.name) || 'Player';
    const names = new Set(g.chars.map((c) => c.name.toLowerCase()));
    for (let i = 2; names.has(name.toLowerCase()); i++) name = `${cleanName(m.name) || 'Player'} ${i}`.slice(0, 18);

    const c = new NetChar(g, this.nextId++, name, color, false);
    c.conn = conn;
    c.lastSeen = performance.now();
    c.alive = false;
    c.respawnAt = Infinity;
    g.addRemote(c);
    conn.send({ t: 'welcome', you: c.id, mt: r2(g.matchTime), over: g.over, r: this._roster() });
    if (!g.over) g.respawn(c, true);
    this.broadcast({ t: 'roster', r: this._roster() }, conn);
    g.hud.toast(`${name} joined`, '#9fd8ff');
    this.hooks.onRoster();
    return c;
  }

  _drop(c) {
    const g = this.game;
    if (!g.remotes.includes(c)) return;
    g.removeRemote(c);
    this.broadcast({ t: 'roster', r: this._roster() });
    g.hud.toast(`${c.name} left`, '#9aa6b2');
    this.hooks.onRoster();
  }

  _roster() {
    return this.game.chars.map((c) => [c.id, c.name, c.color, c.isHuman ? 0 : 1]);
  }

  _hostMsg(c, m) {
    c.lastSeen = performance.now();
    if (m.t === 'u') this._hostState(c, m.d);
    else if (m.t === 'f') this._hostFire(c, m);
  }

  _hostState(c, d) {
    if (!Array.isArray(d) || d.length < 10) return;
    for (let i = 0; i < 10; i++) if (!num(d[i])) return;
    // ignore anything sent before the player knew about their latest (re)spawn
    if (!c.alive || d[9] !== c.spawnSeq) return;
    const b = this.game.world.bounds;
    c.push(clamp(d[0], b.minX, b.maxX), clamp(d[1], -2, 40), clamp(d[2], b.minZ, b.maxZ), d[3], clamp(d[4], -1.6, 1.6));
    c.netCrouch = !!(d[5] & 2);
    c.netGround = !!(d[5] & 8);
    c.weaponIdx = clamp(d[6] | 0, 0, WEAPONS.length - 1);
    // mirrored only so pickups know whether this player could use more ammo
    c.weapons[1].reserve = clamp(d[7] | 0, 0, WEAPONS[1].reserveMax);
    c.weapons[2].reserve = clamp(d[8] | 0, 0, WEAPONS[2].reserveMax);
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
    c.weaponIdx = def.slot;
    c.protectedUntil = 0;

    const ends = [];
    for (const e of Array.isArray(m.e) ? m.e.slice(0, def.pellets) : []) {
      if (Array.isArray(e) && e.length >= 4 && e.every(num)) ends.push(e.slice(0, 7));
    }
    const shot = { t: 'shot', id: c.id, w: def.slot, m: m.m.slice(0, 3), e: ends };
    this.showShot(shot);
    this.broadcast(shot, c.conn);
    g.emitNoise(c.pos.x, c.pos.y, c.pos.z, def.noise, c, 'shot');

    const world = g.world;
    const ex = c.pos.x, ey = c.pos.y + c.eyeH, ez = c.pos.z;
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
    for (const [v, t] of totals) g.damage(v, t.dmg, c, t.head, def);
  }

  _sendSnapshot() {
    const g = this.game;
    if (!g.remotes.some((r) => r.conn)) return;
    const c = g.chars.map((ch) => [
      ch.id, r2(ch.pos.x), r2(ch.pos.y), r2(ch.pos.z), r3(ch.yaw), r3(ch.pitch),
      (ch.alive ? 1 : 0) | (ch.crouching ? 2 : 0) | (ch.isProtected() ? 4 : 0) | (ch.onGround ? 8 : 0),
      Math.max(0, Math.round(ch.health * 10) / 10), Math.round(ch.armor * 10) / 10,
      ch.kills, ch.deaths, ch.weaponIdx,
    ]);
    let p = '';
    for (const pk of g.pickups) p += pk.active ? '1' : '0';
    this.broadcast({ t: 's', mt: r2(g.matchTime), c, p });
  }

  // hooks called by Game on the host ---------------------------------------

  onStart() {
    const g = this.game;
    this.broadcast({ t: 'start', mt: r2(g.matchTime), r: this._roster() });
  }

  onSpawn(c) {
    if (c.conn) c.conn.send({ t: 'spawn', x: r2(c.pos.x), y: r2(c.pos.y), z: r2(c.pos.z), yaw: r3(c.yaw), sq: c.spawnSeq });
  }

  onShot(shooter, def, muz, ends) {
    if (!this.game.remotes.some((r) => r.conn)) return;
    this.broadcast({ t: 'shot', id: shooter.id, w: def.slot, m: [r2(muz.x), r2(muz.y), r2(muz.z)], e: ends });
  }

  onKill(victim, attacker, head, weapon) {
    this.broadcast({ t: 'kill', v: victim.id, k: attacker.id, h: head ? 1 : 0, w: weapon });
  }

  onPickup(i, c) {
    this.broadcast({ t: 'pick', i, id: c.id });
  }

  onEnd() {
    this._sendSnapshot(); // final scores
    this.broadcast({ t: 'end' });
  }

  // ======================================================================
  // client side
  // ======================================================================

  _begin(m) {
    const g = this.game;
    g.clearRemotes();
    if (num(m.you)) g.player.id = m.you;
    g.startClient(num(m.mt) ? m.mt : CFG.timeLimit);
    this._applyRoster(m.r);
    if (m.over) g.over = true;
  }

  _applyRoster(list) {
    const g = this.game;
    if (!Array.isArray(list)) return;
    const seen = new Set();
    for (const e of list) {
      if (!Array.isArray(e) || !num(e[0])) continue;
      const [id, name, color, bot] = e;
      seen.add(id);
      if (id === g.player.id) {
        g.player.name = cleanName(name) || 'You';
        if (num(color)) g.player.color = color;
        continue;
      }
      if (!g.remotes.some((r) => r.id === id)) {
        const c = new NetChar(g, id, cleanName(name) || 'Player', num(color) ? color : 0xffffff, !!bot);
        c.alive = false;
        g.addRemote(c);
      }
    }
    for (const r of [...g.remotes]) if (!seen.has(r.id)) g.removeRemote(r);
    this.hooks.onRoster();
  }

  _clientMsg(m) {
    if (!m || typeof m !== 'object') return;
    this.lastHeard = performance.now();
    const g = this.game, p = g.player;
    switch (m.t) {
      case 's': this._applySnapshot(m); break;
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
      case 'end':
        if (g.over) break;
        g.over = true;
        g.winner = g.ranking()[0];
        if (g.onMatchEnd) g.onMatchEnd(g.winner, g.ranking());
        break;
      case 'start':
        g.startClient(num(m.mt) ? m.mt : CFG.timeLimit);
        this._applyRoster(m.r);
        this.hooks.onMatchStart();
        break;
      default: break;
    }
  }

  _applySnapshot(m) {
    const g = this.game, p = g.player;
    if (num(m.mt)) g.matchTime = m.mt;
    if (Array.isArray(m.c)) {
      for (const e of m.c) {
        if (!Array.isArray(e) || e.length < 12) continue;
        const [id, x, y, z, yaw, pitch, fl, hp, ar, k, d, w] = e;
        if (id === p.id) {
          p.kills = k; p.deaths = d;
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
        c.health = hp; c.armor = ar; c.kills = k; c.deaths = d;
        c.weaponIdx = clamp(w | 0, 0, WEAPONS.length - 1);
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
        p.weaponIdx, p.weapons[1].reserve, p.weapons[2].reserve, this.mySeq],
    });
  }

  /** Client: tell the host about a shot we just fired. */
  sendFire(def, muz, ends, claims) {
    if (!this.conn) return;
    this.conn.send({ t: 'f', w: def.slot, m: [r2(muz.x), r2(muz.y), r2(muz.z)], e: ends, h: claims });
  }

  // ======================================================================
  // shared
  // ======================================================================

  /** Draw / play a shot that somebody else fired. */
  showShot(m) {
    const g = this.game, fx = g.effects;
    const def = WEAPONS[m.w];
    if (!def || !Array.isArray(m.m) || !Array.isArray(m.e)) return;
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
      if (def.pellets === 1 || i % 2 === 0) fx.tracer(mx, my, mz, e[0], e[1], e[2]);
    }
    g.audio.play(def.id, shooter ? shooter.pos : { x: mx, y: my, z: mz });
    if (shooter && shooter.model) shooter.model.muzzleFlash();
  }
}
