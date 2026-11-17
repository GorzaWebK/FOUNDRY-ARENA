// DOM heads-up display. Only touches the DOM when a value actually changes.

import * as THREE from 'three';
import { TEAM_COLORS, TEAM_NAMES } from './modes.js';
import { FLAG_STATE } from './ctf.js';
import { itemOf } from './cosmetics.js';

const _hv = new THREE.Vector3();
const HILL_TEXT_COL = { [-1]: '#e8e8e8', 0: '#' + TEAM_COLORS[0].toString(16).padStart(6, '0'), 1: '#' + TEAM_COLORS[1].toString(16).padStart(6, '0'), 2: '#ffd24d' };


const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
/** Small level badge for the scoreboard (★ = prestige). */
const lvBadge = (c) => (c.cos ? `<span class="lv${c.cos.prestige ? ' pr' : ''}">${c.cos.prestige ? '★' : ''}${c.cos.level}</span>` : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

export class Hud {
  constructor() {
    this.root = $('hud');
    this.el = {
      hpNum: $('hp-num'), hpBar: $('hp-bar'), arNum: $('ar-num'), arBar: $('ar-bar'),
      mag: $('ammo-mag'), res: $('ammo-res'), wname: $('ammo-name'), reload: $('reload-hint'),
      time: $('tb-time'), you: $('tb-you'), lead: $('tb-lead'), leadName: $('tb-leadname'), limit: $('tb-limit'),
      cross: $('crosshair'), hit: $('hitmarker'), dmg: $('dmg'), vig: $('vignette'), low: $('lowhp'),
      feed: $('killfeed'), toast: $('toast'), cm: $('center-msg'), cmMain: $('cm-main'), cmSub: $('cm-sub'),
      protect: $('protect-label'), protectFrame: $('protect-frame'),
      death: $('death'), deathName: $('death-name'), deathCount: $('death-count'),
      sb: $('scoreboard'), sbBody: $('sb-body'), fps: $('fps'), lockHint: $('lock-hint'),
      slotPrim: $('slot-prim'), nade: $('slot-nade'), nadeCount: $('nade-count'), scope: $('scope'),
      tac: $('slot-tac'), tacName: $('tac-name'), tacCount: $('tac-count'),
      flash: $('flashbang'), haze: $('smokehaze'), cook: $('cook'), cookArc: $('cook-arc'), cookT: $('cook-t'),
      chat: $('chat'), chatLog: $('chat-log'), chatHint: $('chat-hint'),
      hillStatus: $('hill-status'), hillMarker: $('hill-marker'),
      youLabel: $('tb-youlabel'), announce: $('announce'), anMain: $('an-main'), anSub: $('an-sub'),
    };
    this.anT = 0;
    this.chatLines = [];
    this.reloadKey = 'R';
    this.slots = [...document.querySelectorAll('#slots .slot[data-i]')];
    this.cache = {};
    this.hitT = 0;
    this.vigT = 0;
    this.toastT = 0;
    this.cmT = 0;
    this.arcs = [];
    this.feedItems = [];
    this.sbVisible = false;
    this.sbTimer = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.flashT = 0; this.flashDur = 1; this.flashPeak = 1;
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  reset() {
    this.anT = 0;
    this.el.announce.style.opacity = 0;
    this.el.feed.innerHTML = '';
    this.feedItems.length = 0;
    for (const a of this.arcs) a.el.remove();
    this.arcs.length = 0;
    this.hitT = this.vigT = this.toastT = this.cmT = 0;
    this.flashT = 0;
    this.el.flash.style.opacity = 0;
    this.el.toast.style.opacity = 0;
    this.el.cm.style.opacity = 0;
    this.el.hit.style.opacity = 0;
    this.el.vig.style.opacity = 0;
    this.cache = {};
  }

  _set(key, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(value);
  }

  setLockHint(v) { this.el.lockHint.classList.toggle('hidden', !v); }

  update(game, dt) {
    const p = game.player, e = this.el;
    const w = p.weapon;

    const hp = Math.max(0, Math.ceil(p.health));
    this._set('hc', !!game.rules.hardcore, (v) => this.root.classList.toggle('hardcore', v));
    this._set('hp', hp, (v) => {
      e.hpNum.textContent = v;
      e.hpBar.style.width = Math.min(100, (v / game.maxHealth) * 100) + '%';
      e.hpNum.classList.toggle('low', v <= 30);
      e.hpBar.style.background = v <= 30 ? '#ff6b1a' : '#e9e4da';
    });
    this._set('ar', Math.ceil(p.armor), (v) => { e.arNum.textContent = v; e.arBar.style.width = v + '%'; });
    this._set('mag', w.mag, (v) => { e.mag.textContent = v; });
    this._set('magLow', w.mag <= w.def.magSize * 0.25, (v) => e.mag.classList.toggle('low', v));
    this._set('res', w.reserve, (v) => { e.res.textContent = v === Infinity ? '∞' : v; });
    this._set('wname', w.def.name, (v) => { e.wname.textContent = v; });
    const rl = w.reloadT > 0 ? 'RELOADING' : w.mag === 0 ? (w.reserve > 0 ? `PRESS ${this.reloadKey} TO RELOAD` : 'NO AMMO') : '';
    this._set('rl', rl, (v) => { e.reload.textContent = v; });
    this._set('slot', p.weaponIdx, (v) => this.slots.forEach((s, i) => s.classList.toggle('on', i === v)));
    for (let i = 0; i < this.slots.length; i++) {
      this._set('se' + i, !p.hasAmmo(i), (v) => this.slots[i].classList.toggle('empty', v));
    }
    this._set('prim', p.weapons[0].def.name, (v) => { e.slotPrim.textContent = v; });
    this._set('side', p.weapons[1] ? p.weapons[1].def.name : '', (v) => { $('slot-side').textContent = v; });
    this._set('nades', p.grenades, (v) => { e.nadeCount.textContent = v; e.nade.classList.toggle('empty', v === 0); });
    this._set('tacN', p.tacDef.short, (v) => { e.tacName.textContent = v; });
    this._set('tacs', p.tactical, (v) => { e.tacCount.textContent = v; e.tac.classList.toggle('empty', v === 0); });

    // a cooking grenade: ring + seconds left on the fuse
    const ck = p.alive && p.cook;
    this._set('cookOn', !!ck, (v) => e.cook.classList.toggle('hidden', !v));
    if (ck) {
      const left = Math.max(0, ck.def.fuse - ck.t);
      this._set('cookT', left.toFixed(1), (v) => { e.cookT.textContent = v; });
      this._set('cookA', Math.round((1 - left / ck.def.fuse) * 100), (v) => { e.cookArc.style.strokeDashoffset = (v / 100) * 100.5; });
      this._set('cookHot', left < 0.8, (v) => e.cook.classList.toggle('hot', v));
    }

    // flashbanged: a white-out that holds, then fades
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = Math.max(0, Math.min(1, this.flashT / (this.flashDur * 0.55)));
      e.flash.style.opacity = (f * this.flashPeak).toFixed(3);
      if (this.flashT <= 0) e.flash.style.opacity = 0;
    }
    this._set('flashed', this.flashT > 0, (v) => this.root.classList.toggle('flashed', v));
    // standing in smoke
    const cam = game.camera.position;
    const haze = game.smokes.density(cam.x, cam.y, cam.z);
    this._set('haze', Math.round(haze * 40), (v) => { e.haze.style.opacity = (v / 40) * 0.88; });
    this._set('scope', p.alive && p.scoped, (v) => e.scope.classList.toggle('hidden', !v));
    this._set('knife', p.knifeT > 0, (v) => { $('slot-knife').classList.toggle('empty', v); });

    // match info
    const t = Math.max(0, Math.ceil(game.matchTime));
    this._set('time', t, (v) => {
      e.time.textContent = Number.isFinite(v) ? `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}` : '∞';
      e.time.classList.toggle('hurry', v <= 30);
    });
    // the top bar's two scores depend on the mode
    const tb = game.rules.hud(game);
    this._set('youL', tb.left[0], (v) => { e.youLabel.textContent = v; });
    this._set('you', tb.left[1], (v) => { e.you.textContent = v; });
    this._set('youC', tb.left[2] || '', (v) => { e.you.style.color = v; });
    this._set('leadName', tb.right[0], (v) => { e.leadName.textContent = v; });
    this._set('lead', tb.right[1], (v) => { e.lead.textContent = v; });
    this._set('leadC', tb.right[2] || '', (v) => { e.lead.style.color = v; });
    this._set('sub', tb.sub, (v) => { e.limit.textContent = v; });
    this._set('slot2', !!p.weapons[1], (v) => { this.slots[1].style.display = v ? '' : 'none'; });

    // crosshair spread
    const spread = p.currentSpread(p.ads);
    const fovRad = (game.camera.fov * Math.PI) / 180;
    const gap = Math.max(3, (Math.tan(spread) / Math.tan(fovRad / 2)) * (window.innerHeight / 2));
    this._set('gap', Math.round(gap), (v) => e.cross.style.setProperty('--gap', v + 'px'));
    // iron sights replace the crosshair when aiming (the shotgun keeps its spread ring)
    const showCross = p.alive && !(p.ads > 0.6 && w.def.id !== 'shotgun') && !p.scoped;
    this._set('cross', showCross, (v) => { e.cross.style.opacity = v ? 1 : 0; });

    // hit marker / vignettes
    if (this.hitT > 0) { this.hitT -= dt; e.hit.style.opacity = Math.max(0, this.hitT / 0.18); }
    if (this.vigT > 0) { this.vigT -= dt; e.vig.style.opacity = Math.max(0, Math.min(1, this.vigT * 2)); }
    const low = p.alive && p.health <= 30 ? 0.35 + 0.25 * Math.sin(game.time * 5) + (30 - p.health) / 60 : 0;
    this._set('low', Math.round(low * 20), (v) => { e.low.style.opacity = v / 20; });

    // spawn protection
    const prot = p.alive && p.isProtected();
    this._set('prot', prot, (v) => { e.protect.style.opacity = v ? 1 : 0; e.protectFrame.style.opacity = v ? 1 : 0; });

    // death overlay
    const kc = game.killcam.active;
    const spec = !p.alive && !kc && game.isOut(p) && (p.specTarget || p.specOverhead);
    this._set('dead', !p.alive && !kc && !spec, (v) => e.death.classList.toggle('hidden', !v));
    this._set('spec', !!spec, (v) => { $('spectate').classList.toggle('hidden', !v); this.root.classList.toggle('spectating', v); });
    if (spec) {
      const t = p.specTarget;
      const who = t ? `${t.id}|${t.name}|${t.color}|${Math.max(0, Math.ceil(t.health))}|${t.lives}` : 'overhead';
      this._set('specWho', who, () => {
        $('spec-who').innerHTML = t
          ? `Watching <b style="color:${hex(t.color)}">${esc(t.name)}</b><small>${Math.max(0, Math.ceil(t.health))} HP, ${t.lives} ${t.lives === 1 ? 'life' : 'lives'} left</small>`
          : 'Overhead view';
      });
      this._set('specKeys', this.specKeys, (v) => { $('spec-keys').textContent = v; });
    }
    this._set('kc', kc, (v) => $('killcam').classList.toggle('hidden', !v));
    if (kc) {
      this._set('kcWho', game.killcam.killerName, (v) => {
        const k = game.charById(game.killcam.killerId);
        const cos = k && k.cos;
        const card = itemOf('card', cos ? cos.equipped.card : 'steel');
        const el = $('kc-who');
        el.style.background = card.css;
        el.innerHTML = `<span class="kc-plate">Killed by <b style="color:${hex(game.killcam.killerColor)}">${esc(v)}</b>`
          + (cos ? `<small>${cos.prestige ? '★' + cos.prestige + ' ' : ''}Lv ${cos.level} ${esc(itemOf('title', cos.equipped.title).name)}</small>` : '') + '</span>';
      });
      const left = p.respawnAt - game.time;
      this._set('kcCount', Number.isFinite(left) ? Math.max(0, Math.ceil(left)) : -1, (v) => { $('kc-count').textContent = v >= 0 ? `Respawning in ${v}` : ''; });
    }
    if (!p.alive) {
      const left = Math.max(0, p.respawnAt - game.time);
      const out = game.isOut(p);
      this._set('dc', out ? 'out' : Math.ceil(left), (v) => {
        e.deathCount.textContent = v === 'out' ? 'Out of lives. Watching until the next round.'
          : Number.isFinite(v) ? `Respawning in ${v}` : 'Waiting for the host…';
      });
      this._set('dn', p.killer ? p.killer.name : '', (v) => { e.deathName.textContent = v; e.deathName.style.color = p.killer ? hex(p.killer.color) : ''; });
      this._set('dby', !!p.killer, (v) => { $('death-by').style.visibility = v ? 'visible' : 'hidden'; });
    }

    // damage direction arcs follow the attacker as you turn
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      const a = this.arcs[i];
      a.life -= dt;
      if (a.life <= 0) { a.el.remove(); this.arcs.splice(i, 1); continue; }
      const dx = a.x - p.pos.x, dz = a.z - p.pos.z;
      const right = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
      const fwd = -dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw);
      a.el.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`;
      a.el.style.opacity = Math.min(1, a.life * 1.6);
    }

    // timed text
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) e.toast.style.opacity = 0; }
    if (this.cmT > 0) { this.cmT -= dt; if (this.cmT <= 0) e.cm.style.opacity = 0; }
    for (let i = this.feedItems.length - 1; i >= 0; i--) {
      const f = this.feedItems[i];
      f.life -= dt;
      if (f.life < 0.4) f.el.style.opacity = 0;
      if (f.life <= 0) { f.el.remove(); this.feedItems.splice(i, 1); }
    }

    if (this.anT > 0) { this.anT -= dt; if (this.anT <= 0) e.announce.style.opacity = 0; }
    if (this.xpT > 0) { this.xpT -= dt; if (this.xpT <= 0) $('xp-pop').style.opacity = 0; }
    // client: warn about a bad connection to the host
    const net = game.net;
    let warn = '';
    if (net && net.role === 'client') {
      const quiet = performance.now() - (net.lastSnapT || performance.now());
      if (quiet > 800) warn = 'HOST NOT RESPONDING';
      else if ((p.ping || 0) > 220) warn = `HIGH PING ${p.ping} MS`;
    }
    this._set('netWarn', warn, (v) => { const el = $('net-warn'); el.textContent = v; el.classList.toggle('hidden', !v); });

    // Capture the Flag: status line + a marker on each flag
    const ctf = game.ctf;
    for (let i = 0; i < 2; i++) {
      const el = $('flag-marker-' + i);
      const f = ctf && ctf.flags[i];
      const show = !!f && p.alive && f.carrier !== p;
      el.classList.toggle('hidden', !show);
      if (!show) continue;
      this._set('fmC' + i, f.team, (v) => { el.style.color = hex(TEAM_COLORS[v]); });
      const d = Math.round(Math.hypot(p.pos.x - f.x, p.pos.z - f.z));
      const what = f.team === p.team
        ? (f.state === FLAG_STATE.HOME ? 'BASE' : f.state === FLAG_STATE.CARRIED ? 'STOLEN' : 'RETURN')
        : (f.state === FLAG_STATE.HOME ? 'TAKE' : f.state === FLAG_STATE.CARRIED ? 'ESCORT' : 'TAKE');
      this._set('fmT' + i, `${what} ${d}m`, (v) => { el.lastChild.textContent = v; });
      this.placeMarker(el, f.x, f.y + 2.6, f.z, game.camera);
    }
    const h = game.hillZone();
    if (ctf) {
      const st = (f) => (f.state === FLAG_STATE.HOME ? 'HOME'
        : f.state === FLAG_STATE.CARRIED ? `TAKEN BY ${(f.carrier ? f.carrier.name : '?').toUpperCase()}`
          : `DOWN, BACK IN ${Math.max(0, Math.ceil(f.returnT))}s`);
      const mine = ctf.flags[Math.max(0, p.team)], theirs = ctf.flags[1 - Math.max(0, p.team)];
      const carrying = theirs.carrier === p;
      const text = carrying
        ? (mine.state === FLAG_STATE.HOME ? 'FLAG IN HAND. GET IT HOME.' : 'FLAG IN HAND. YOURS HAS TO BE HOME TO SCORE.')
        : `OURS ${st(mine)}     THEIRS ${st(theirs)}`;
      e.hillStatus.classList.remove('hidden');
      this._set('hillText', text, (v) => { e.hillStatus.textContent = v; });
      this._set('hillCol', carrying ? 'c' : mine.state === FLAG_STATE.HOME ? 'h' : 'x', (v) => { e.hillStatus.style.color = v === 'c' ? '#ffd24d' : v === 'h' ? '#e8e8e8' : '#ff6b6b'; });
      this._set('hillIn', carrying, (v) => e.hillStatus.classList.toggle('on', v));
      this._set('hillOn', 'ctf', () => {});
    }
    // King of the Hill: status line + a marker pointing at the zone
    if (!ctf) this._set('hillOn', !!h, (v) => { e.hillStatus.classList.toggle('hidden', !v); });
    if (h) {
      const holder = game.hill.holder;
      const left = Math.max(0, Math.ceil(game.hill.t));
      const inside = game.inHill(p, h);
      const what = holder === 2 ? 'CONTESTED' : holder >= 0 ? `${TEAM_NAMES[holder].toUpperCase()} HOLDING` : 'HILL NEUTRAL';
      const text = `${inside ? 'ON THE HILL     ' : ''}${what}     MOVES ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      this._set('hillText', text, (v) => { e.hillStatus.textContent = v; });
      this._set('hillCol', holder, (v) => { e.hillStatus.style.color = HILL_TEXT_COL[v]; e.hillMarker.style.color = HILL_TEXT_COL[v]; });
      this._set('hillIn', inside, (v) => e.hillStatus.classList.toggle('on', v));
      // marker: on screen where the hill is, or pinned to the edge pointing at it
      const showMarker = p.alive && !inside;
      e.hillMarker.classList.toggle('hidden', !showMarker);
      if (showMarker) {
        this.placeMarker(e.hillMarker, h[0], h[1] + 1.2, h[2], game.camera);
        const d = Math.round(Math.hypot(p.pos.x - h[0], p.pos.z - h[2]));
        this._set('hillD', d, (v) => { e.hillMarker.lastChild.textContent = `${v}m`; });
      }
    } else {
      e.hillMarker.classList.add('hidden');
    }

    // chat lines fade out after a while (they come back while the chat box is open)
    for (const c of this.chatLines) {
      if (c.life > 0) { c.life -= dt; if (c.life <= 0) c.el.classList.add('old'); }
    }

    if (this.sbVisible) {
      this.sbTimer -= dt;
      if (this.sbTimer <= 0) { this.sbTimer = 0.25; this.renderScores(game, e.sbBody); }
    }

    if (game.settings.showFps) {
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc >= 0.5) {
        e.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps`;
        this.fpsAcc = 0; this.fpsN = 0;
      }
    }
    this._set('fpsOn', game.settings.showFps, (v) => e.fps.classList.toggle('hidden', !v));
  }

  /** Put a HUD marker over a world point, or pinned to the screen edge pointing at it. */
  placeMarker(el, wx, wy, wz, camera) {
    _hv.set(wx, wy, wz).project(camera);
    let x = _hv.x, y = _hv.y;
    if (_hv.z > 1) { x = -x; y = -y; } // behind us: flip, then push to the edge
    const m = Math.max(Math.abs(x), Math.abs(y));
    if (_hv.z > 1 || m > 0.92) { x = (x / (m || 1)) * 0.92; y = (y / (m || 1)) * 0.92; }
    const W = window.innerWidth, H = window.innerHeight;
    el.style.transform = `translate(${((x + 1) / 2) * W}px, ${((1 - y) / 2) * H}px) translate(-50%, -50%)`;
  }

  hitmarker(head, kill) {
    const h = this.el.hit;
    h.className = kill ? 'kill' : head ? 'head' : '';
    h.style.opacity = 1;
    this.hitT = kill ? 0.3 : 0.18;
  }

  /** "+120 XP" by the crosshair; quick gains add up into one number. */
  xpPop(amount) {
    const el = $('xp-pop');
    this.xpSum = (this.xpT > 0 ? this.xpSum || 0 : 0) + amount;
    this.xpT = 1.6;
    el.textContent = `+${this.xpSum} XP`;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    el.style.opacity = 1;
  }

  /** Flashbanged: `amount` 0..1, for `dur` seconds. */
  flashed(amount, dur) {
    if (this.flashT > 0 && this.flashT > dur) return;
    this.flashT = dur;
    this.flashDur = dur;
    this.flashPeak = Math.min(1, 0.45 + amount * 0.7);
    this.el.flash.style.opacity = this.flashPeak;
  }

  damageFrom(attacker, amount) {
    this.vigT = Math.min(0.7, 0.3 + amount / 60);
    this.el.vig.style.opacity = 1;
    if (!attacker) return;
    let arc = this.arcs.find((a) => a.src === attacker);
    if (!arc) {
      const el = document.createElement('div');
      el.className = 'dmg-arc';
      this.el.dmg.append(el);
      arc = { el, src: attacker, x: 0, z: 0, life: 0 };
      this.arcs.push(arc);
    }
    arc.x = attacker.pos.x; arc.z = attacker.pos.z;
    arc.life = 1.2;
  }

  addKill(killer, victim, weapon, head) {
    const el = document.createElement('div');
    el.className = 'kf' + (killer.isPlayer || victim.isPlayer ? ' mine' : '');
    el.innerHTML = `<b style="color:${hex(killer.color)}">${esc(killer.name)}</b><span class="w">${esc(weapon)}</span>`
      + `<b style="color:${hex(victim.color)}">${esc(victim.name)}</b>${head ? '<span class="hs">◎</span>' : ''}`;
    this.el.feed.append(el);
    this.feedItems.push({ el, life: 6 });
    while (this.feedItems.length > 6) this.feedItems.shift().el.remove();
  }

  /** Show the player's own key bindings in HUD hints. */
  setBindHints(label) {
    this.reloadKey = label('reload').toUpperCase();
    this.specKeys = `${label('fire')} next     ${label('aim')} previous     ${label('jump')} overhead`;
    const b = (sel) => document.querySelector(sel);
    b('#slots .slot[data-i="0"] b').textContent = label('primary');
    b('#slots .slot[data-i="1"] b').textContent = label('pistol');
    b('#slot-nade b').textContent = label('grenade');
    b('#slot-tac b').textContent = label('tactical');
    b('#slot-knife b').textContent = label('knife');
    this.el.chatHint.textContent = `${label('chat')} to chat`;
    this.cache.rl = null;
  }

  /** Killstreak call-out banner. */
  announce(text, sub = '') {
    const e = this.el;
    e.anMain.textContent = text;
    e.anSub.textContent = sub;
    e.announce.classList.remove('pop');
    void e.announce.offsetWidth; // restart the pop animation
    e.announce.classList.add('pop');
    e.announce.style.opacity = 1;
    this.anT = 2.4;
  }

  /** A line of text in the kill feed (streaks, first blood…). */
  feedNote(text, color) {
    const el = document.createElement('div');
    el.className = 'kf note';
    el.style.borderLeft = `3px solid ${hex(color)}`;
    el.textContent = text;
    this.el.feed.append(el);
    this.feedItems.push({ el, life: 5 });
    while (this.feedItems.length > 6) this.feedItems.shift().el.remove();
  }

  /** Add a chat line. An empty name means a system message. */
  chatAdd(name, color, text) {
    const el = document.createElement('div');
    el.className = 'chat-line' + (name ? '' : ' sys');
    if (name) {
      const b = document.createElement('b');
      b.textContent = name + ': ';
      b.style.color = hex(color);
      el.append(b);
    }
    el.append(document.createTextNode(text));
    this.el.chatLog.append(el);
    this.chatLines.push({ el, life: 9 });
    while (this.chatLines.length > 8) this.chatLines.shift().el.remove();
  }

  chatClear() {
    for (const c of this.chatLines) c.el.remove();
    this.chatLines.length = 0;
  }

  /** While the chat box is open, show the recent history too. */
  chatOpen(v) { this.el.chat.classList.toggle('open', v); }
  chatHint(v) { this.el.chatHint.classList.toggle('hidden', !v); }

  toast(text, color = '#fff') {
    const t = this.el.toast;
    t.textContent = text;
    t.style.color = color;
    t.style.opacity = 1;
    this.toastT = 1.6;
  }

  centerMessage(main, sub = '', dur = 2, color = '#fff') {
    this.el.cmMain.textContent = main;
    this.el.cmMain.style.color = color;
    this.el.cmSub.textContent = sub;
    this.el.cm.style.opacity = 1;
    this.cmT = dur;
  }

  setScoreboard(v, game) {
    if (v === this.sbVisible) return;
    this.sbVisible = v;
    this.el.sb.classList.toggle('hidden', !v);
    if (v) { this.sbTimer = 0.25; this.renderScores(game, this.el.sbBody); }
  }

  renderScores(game, tbody) {
    const rows = game.ranking();
    const col = game.rules.column;
    const head = tbody.parentElement.tHead;
    const mp = !!game.net && game.net.active;
    const headHtml = `<tr><th>#</th><th class="l">Player</th>${col ? `<th>${col.title}</th>` : ''}<th>Kills</th><th>Deaths</th>${mp ? '<th>Ping</th>' : ''}</tr>`;
    // ping: the host is "host", bots are "bot", players show ms (red when it's bad)
    const pingCell = (c) => {
      if (!mp) return '';
      const hostId = game.mode === 'host' ? game.player.id : 0;
      if (c.id === hostId) return '<td class="ping">host</td>';
      if (!c.isHuman) return '<td class="ping">bot</td>';
      const v = c.ping ?? -2;
      return `<td class="ping${v > 200 ? ' bad' : v > 120 ? ' meh' : ''}">${v < 0 ? '…' : v}</td>`;
    };
    if (head.innerHTML !== headHtml) head.innerHTML = headHtml;
    tbody.innerHTML = rows.map((c, i) => (
      `<tr class="${c.isPlayer ? 'me' : ''}${c.alive ? '' : ' dead'}"><td>${i + 1}</td>`
      + `<td class="l"><i style="background:${hex(c.color)}"></i>${lvBadge(c)}${esc(c.name)}`
      + `<small class="sb-title">${esc(itemOf('title', c.cos ? c.cos.equipped.title : 'recruit').name)}</small></td>`
      + `${col ? `<td>${esc(col.value(c))}</td>` : ''}<td>${c.kills}</td><td>${c.deaths}</td>${pingCell(c)}</tr>`
    )).join('');
  }
}
