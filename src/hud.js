// DOM heads-up display. Only touches the DOM when a value actually changes.

import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
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
    };
    this.slots = [...document.querySelectorAll('#slots .slot')];
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
    this.el.limit.textContent = `first to ${CFG.killLimit}`;
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  reset() {
    this.el.feed.innerHTML = '';
    this.feedItems.length = 0;
    for (const a of this.arcs) a.el.remove();
    this.arcs.length = 0;
    this.hitT = this.vigT = this.toastT = this.cmT = 0;
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
    this._set('hp', hp, (v) => {
      e.hpNum.textContent = v;
      e.hpBar.style.width = v + '%';
      e.hpNum.classList.toggle('low', v <= 30);
      e.hpBar.style.background = v <= 30 ? '#ff5a5a' : '#5dff9a';
    });
    this._set('ar', Math.ceil(p.armor), (v) => { e.arNum.textContent = v; e.arBar.style.width = v + '%'; });
    this._set('mag', w.mag, (v) => { e.mag.textContent = v; });
    this._set('magLow', w.mag <= w.def.magSize * 0.25, (v) => e.mag.classList.toggle('low', v));
    this._set('res', w.reserve, (v) => { e.res.textContent = v === Infinity ? '∞' : v; });
    this._set('wname', w.def.name, (v) => { e.wname.textContent = v; });
    const rl = w.reloadT > 0 ? 'RELOADING' : w.mag === 0 ? (w.reserve > 0 ? 'PRESS R TO RELOAD' : 'NO AMMO') : '';
    this._set('rl', rl, (v) => { e.reload.textContent = v; });
    this._set('slot', p.weaponIdx, (v) => this.slots.forEach((s, i) => s.classList.toggle('on', i === v)));
    for (let i = 0; i < this.slots.length; i++) {
      this._set('se' + i, !p.hasAmmo(i), (v) => this.slots[i].classList.toggle('empty', v));
    }

    // match info
    const t = Math.max(0, Math.ceil(game.matchTime));
    this._set('time', t, (v) => {
      e.time.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
      e.time.classList.toggle('hurry', v <= 30);
    });
    this._set('you', p.kills, (v) => { e.you.textContent = v; });
    let lead = null;
    for (const c of game.chars) if (c !== p && (!lead || c.kills > lead.kills)) lead = c;
    if (lead) {
      this._set('lead', lead.kills, (v) => { e.lead.textContent = v; });
      this._set('leadName', lead.name, (v) => { e.leadName.textContent = v.toUpperCase(); });
    }

    // crosshair spread
    const spread = p.currentSpread(p.ads);
    const fovRad = (game.camera.fov * Math.PI) / 180;
    const gap = Math.max(3, (Math.tan(spread) / Math.tan(fovRad / 2)) * (window.innerHeight / 2));
    this._set('gap', Math.round(gap), (v) => e.cross.style.setProperty('--gap', v + 'px'));
    // iron sights replace the crosshair when aiming (the shotgun keeps its spread ring)
    const showCross = p.alive && !(p.ads > 0.6 && w.def.id !== 'shotgun');
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
    this._set('dead', !p.alive, (v) => e.death.classList.toggle('hidden', !v));
    if (!p.alive) {
      const left = Math.max(0, p.respawnAt - game.time);
      this._set('dc', Math.ceil(left), (v) => { e.deathCount.textContent = Number.isFinite(v) ? `Respawning in ${v}` : 'Waiting for the host…'; });
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

  hitmarker(head, kill) {
    const h = this.el.hit;
    h.className = kill ? 'kill' : head ? 'head' : '';
    h.style.opacity = 1;
    this.hitT = kill ? 0.3 : 0.18;
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
    tbody.innerHTML = rows.map((c, i) => (
      `<tr class="${c.isPlayer ? 'me' : ''}${c.alive ? '' : ' dead'}"><td>${i + 1}</td>`
      + `<td class="l"><i style="background:${hex(c.color)}"></i>${esc(c.name)}</td><td>${c.kills}</td><td>${c.deaths}</td></tr>`
    )).join('');
  }
}
