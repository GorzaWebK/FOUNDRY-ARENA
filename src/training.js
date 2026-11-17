// Training range: practice targets, weapon stands, a timed challenge and
// accuracy stats. Solo only, no bots, unlimited ammo.

import * as THREE from 'three';
import { worldGun } from './gunModels.js';
import { WEAPON_BY_ID, GRENADE } from './weapons.js';

export const TRAINING = {
  id: 'training', name: 'Training Range', training: true,
  blurb: 'Practice: targets at 10–40 m, moving targets, pop-ups and a close-quarters corner. Walk onto a stand to swap guns. Unlimited ammo.',
  rank: (chars) => [...chars],
  won: () => false,
  hud(game) {
    const r = game.range;
    return { left: ['ACCURACY', r ? `${r.accuracy()}%` : '—'], right: ['DOWN', r ? r.stats.down : 0], sub: 'training range' };
  },
  column: null,
  result: () => ({ won: true, sub: 'Practice over.' }),
};

const BEST_KEY = 'foundry-arena-range-best';
const CHALLENGE_T = 30;
const DOWN_T = 2; // seconds a knocked-down target stays down
const BOX = new THREE.BoxGeometry(1, 1, 1);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function bullseye() {
  return canvasTex(128, 128, (ctx, w) => {
    ctx.fillStyle = '#f4f1ea'; ctx.fillRect(0, 0, w, w);
    const rings = ['#d84a2b', '#f4f1ea', '#d84a2b', '#f4f1ea', '#d84a2b'];
    rings.forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2, w / 2, w * 0.46 * (1 - i / 5.3), 0, 7); ctx.fill(); });
  });
}

function label(text, color = '#ffffff', bg = 'rgba(10,14,20,0.7)') {
  const tex = canvasTex(256, 64, (ctx, w, h) => {
    ctx.font = '700 32px system-ui, "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = Math.min(w - 8, ctx.measureText(text).width + 30);
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.roundRect((w - tw) / 2, 8, tw, h - 16, 10); ctx.fill();
    ctx.fillStyle = color; ctx.fillText(text, w / 2, h / 2 + 1);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(1.6, 0.4, 1);
  return sp;
}

class Target {
  constructor(range, def, mats) {
    this.kind = def.kind;
    this.home = new THREE.Vector3(...(def.pos || def.a));
    this.a = def.a ? new THREE.Vector3(...def.a) : null;
    this.b = def.b ? new THREE.Vector3(...def.b) : null;
    this.speed = def.speed || 0;
    this.phase = Math.random() * 10;
    // shape matches the character hit volumes used by the game's ray test
    this.pos = this.home.clone();
    this.height = 1.8;
    this.radius = 0.33;
    this.yaw = 0;
    this.leanOff = 0;
    this.hp = 100;
    this.up = this.kind !== 'popup';
    this.fall = this.up ? 0 : 1;
    this.timer = this.kind === 'popup' ? 1 + Math.random() * 3 : 0;

    this.group = new THREE.Group();
    this.hinge = new THREE.Group(); // falls backward from the feet
    this.group.add(this.hinge);
    const part = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(BOX, mat);
      m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true;
      this.hinge.add(m);
      return m;
    };
    part(0.14, 0.9, 0.08, mats.pole, 0, 0.45, 0);
    part(0.62, 0.5, 0.08, mats.board, 0, 1.15, 0);
    part(0.6, 0.48, 0.02, mats.face, 0, 1.15, 0.05); // bullseye on the front (+z, toward the line)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mats.head);
    head.position.set(0, 1.6, 0);
    head.castShadow = true;
    this.hinge.add(head);
    const base = new THREE.Mesh(BOX, mats.pole);
    base.scale.set(0.7, 0.06, 0.5); base.position.y = 0.03;
    this.group.add(base);
    range.group.add(this.group);
  }

  get alive() { return this.up && this.fall < 0.5; }
}

export class Range {
  constructor(game) {
    this.game = game;
    const map = game.map;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    const tex = bullseye();
    this.mats = {
      pole: new THREE.MeshLambertMaterial({ color: 0x40464f }),
      board: new THREE.MeshLambertMaterial({ color: 0xe8e2d4 }),
      face: new THREE.MeshLambertMaterial({ map: tex }),
      head: new THREE.MeshLambertMaterial({ color: 0xff8a2a }),
      stand: new THREE.MeshLambertMaterial({ color: 0x2b3038, emissive: 0x4fc3f7, emissiveIntensity: 0.25 }),
      pad: new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.55, depthWrite: false }),
      stripe: new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.7 }),
    };
    this.targets = (map.targets || []).map((d) => new Target(this, d, this.mats));

    // weapon stands
    this.stands = (map.stands || []).map((s) => {
      const g = new THREE.Group();
      g.position.set(...s.pos);
      const ped = new THREE.Mesh(BOX, this.mats.stand);
      ped.scale.set(0.9, 0.8, 0.9); ped.position.y = 0.4; ped.receiveShadow = true;
      g.add(ped);
      const gun = worldGun(s.weapon);
      gun.position.y = 1.15;
      const spin = new THREE.Group();
      spin.position.y = 0; spin.add(gun);
      g.add(spin);
      const tag = label(WEAPON_BY_ID[s.weapon].name, '#9fe0ff');
      tag.position.y = 1.75;
      g.add(tag);
      this.group.add(g);
      return { weapon: s.weapon, pos: new THREE.Vector3(...s.pos), spin };
    });

    // challenge pad
    this.padPos = map.challengePad ? new THREE.Vector3(...map.challengePad) : null;
    if (this.padPos) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.05, 32), this.mats.pad);
      pad.position.copy(this.padPos).add(new THREE.Vector3(0, 0.03, 0));
      this.group.add(pad);
      this.padTag = label('30s CHALLENGE', '#ffd9b0');
      this.padTag.position.copy(this.padPos).add(new THREE.Vector3(0, 1.6, 0));
      this.padTag.scale.set(2, 0.5, 1);
      this.group.add(this.padTag);
    }

    // distance stripes across the lanes
    for (const d of map.markers || []) {
      const z = map.line - d;
      const stripe = new THREE.Mesh(BOX, this.mats.stripe);
      stripe.scale.set(33, 0.01, 0.12); stripe.position.set(-4, 0.012, z);
      this.group.add(stripe);
      const tag = label(`${d} m`);
      tag.position.set(-22, 0.7, z);
      tag.scale.set(1.2, 0.3, 1);
      this.group.add(tag);
    }

    this.stats = { shots: 0, hits: 0, heads: 0, down: 0 };
    this.best = 0;
    try { this.best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { /* no storage */ }
    this.challenge = null; // { count, t, down }
    this.padArmed = true;
    this.lastStand = null;

    // floating damage numbers
    this.numBox = document.getElementById('dmg-nums');
    this.nums = [];
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className = 'dmg-num';
      this.numBox.append(el);
      this.nums.push({ el, x: 0, y: 0, z: 0, life: 0 });
    }
    this.nextNum = 0;
    this.panel = document.getElementById('range-panel');
    this.panel.classList.remove('hidden');
    this.panelText = '';
    this.v = new THREE.Vector3();
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
      else if (o.isMesh && o.geometry !== BOX && !o.geometry.userData.shared) o.geometry.dispose();
    });
    for (const m of Object.values(this.mats)) { if (m.map) m.map.dispose(); m.dispose(); }
    for (const n of this.nums) n.el.remove();
    this.panel.classList.add('hidden');
  }

  accuracy() { return this.stats.shots ? Math.round((100 * this.stats.hits) / this.stats.shots) : 0; }

  resetStats() { this.stats = { shots: 0, hits: 0, heads: 0, down: 0 }; }

  // ---------------------------------------------------------------- hits

  /** Nearest standing target along a ray, as { target, t, head }, or null. */
  raycast(ox, oy, oz, dx, dy, dz, tMax, rayChar, out) {
    let best = null, bt = tMax, bh = false;
    for (const tg of this.targets) {
      if (!tg.alive) continue;
      if (rayChar(ox, oy, oz, dx, dy, dz, tg, bt, out)) { best = tg; bt = out.t; bh = out.head; }
    }
    return best ? { target: best, t: bt, head: bh } : null;
  }

  /** One trigger pull by the player (hit = any pellet hit a target). */
  onShot(hit, head) {
    if (this.challenge && this.challenge.count > 0) return; // shots before "GO" don't count
    this.stats.shots++;
    if (hit) this.stats.hits++;
    if (head) this.stats.heads++;
  }

  damage(tg, dmg, head, x, y, z) {
    if (!tg.alive) return;
    tg.hp -= dmg;
    this.number(x, y, z, Math.round(dmg), head);
    const g = this.game;
    g.hud.hitmarker(head, tg.hp <= 0);
    g.audio.play(head ? 'headshot' : 'hit');
    if (tg.hp <= 0) {
      tg.up = false;
      tg.timer = this.challenge && this.challenge.count <= 0 ? 0.8 : DOWN_T;
      this.stats.down++;
      if (this.challenge && this.challenge.count <= 0) this.challenge.down++;
      g.audio.play('kill', null, 0.6);
    }
  }

  /** Knife: the nearest standing target in front within reach. */
  meleeTarget(a, reach) {
    const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
    let best = null, bd = reach;
    for (const tg of this.targets) {
      if (!tg.alive || Math.abs(tg.pos.y - a.pos.y) > 1.6) continue;
      const dx = tg.pos.x - a.pos.x, dz = tg.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz) - tg.radius;
      if (d > bd || (d > 0.3 && (dx * fx + dz * fz) / (d + tg.radius) < 0.55)) continue;
      best = tg; bd = d;
    }
    return best;
  }

  explode(x, y, z, radius, damage) {
    for (const tg of this.targets) {
      if (!tg.alive) continue;
      const d = Math.hypot(tg.pos.x - x, tg.pos.y + 1 - y, tg.pos.z - z);
      if (d < radius) this.damage(tg, damage * (1 - d / radius), false, tg.pos.x, tg.pos.y + 1.2, tg.pos.z);
    }
  }

  number(x, y, z, value, head) {
    const n = this.nums[this.nextNum];
    this.nextNum = (this.nextNum + 1) % this.nums.length;
    n.x = x + (Math.random() - 0.5) * 0.2; n.y = y; n.z = z;
    n.life = 0.9;
    n.el.textContent = value;
    n.el.classList.toggle('head', !!head);
  }

  // ---------------------------------------------------------------- per frame

  update(dt) {
    const g = this.game, p = g.player, time = g.time;
    const ch = this.challenge;
    const live = ch && ch.count <= 0;

    // targets
    for (const tg of this.targets) {
      if (tg.kind === 'moving') {
        const span = tg.a.distanceTo(tg.b);
        const u = (Math.sin((time * tg.speed) / Math.max(1, span) * Math.PI + tg.phase) + 1) / 2;
        tg.pos.lerpVectors(tg.a, tg.b, u);
      }
      if (!tg.up) {
        tg.timer -= dt;
        if (tg.timer <= 0) {
          if (tg.kind === 'popup' && !live && Math.random() < 0.5) { tg.timer = 0.5 + Math.random() * 1.5; }
          else { tg.up = true; tg.hp = 100; tg.timer = tg.kind === 'popup' ? (live ? 1.6 : 2.5) + Math.random() * 1.5 : 0; }
        }
      } else if (tg.kind === 'popup') {
        tg.timer -= dt; // pop-ups drop again if you're too slow
        if (tg.timer <= 0) { tg.up = false; tg.timer = 0.6 + Math.random() * 2; }
      }
      tg.fall += ((tg.up ? 0 : 1) - tg.fall) * Math.min(1, dt * 12);
      tg.group.position.copy(tg.pos);
      tg.hinge.rotation.x = -tg.fall * 1.45;
    }

    // unlimited ammo and grenades (you still have to reload)
    if (p.alive) {
      for (const w of p.weapons) if (w.reserve !== Infinity) w.reserve = w.def.reserveMax;
      p.grenades = GRENADE.max;
      p.tactical = p.tacDef.max;
    }

    // weapon stands: walk onto one to take that gun
    for (const s of this.stands) {
      s.spin.rotation.y = time * 1.2;
      const near = p.alive && Math.hypot(p.pos.x - s.pos.x, p.pos.z - s.pos.z) < 1.1;
      if (near && this.lastStand !== s.weapon && p.primary !== s.weapon) {
        p.primary = s.weapon;
        p.weapons = g.loadoutFor(p);
        p.weaponIdx = 0;
        p.switchT = 0.35;
        p.onSwitch();
        g.hud.toast(`Picked up the ${WEAPON_BY_ID[s.weapon].name}`, '#9fe0ff');
        this.lastStand = s.weapon;
      }
      if (!near && this.lastStand === s.weapon) this.lastStand = null;
    }

    // challenge pad
    if (this.padPos) {
      const onPad = p.alive && Math.hypot(p.pos.x - this.padPos.x, p.pos.z - this.padPos.z) < 1.2;
      if (!onPad) this.padArmed = true;
      if (onPad && this.padArmed && !this.challenge) this.startChallenge();
    }
    if (ch) {
      if (ch.count > 0) {
        const before = Math.ceil(ch.count);
        ch.count -= dt;
        const now = Math.ceil(ch.count);
        if (now !== before) {
          if (now > 0) { g.hud.centerMessage(String(now), 'Get ready', 0.9, '#ff8a2a'); g.audio.play('ui'); }
          else {
            g.hud.centerMessage('GO!', 'Knock down as many targets as you can', 1, '#5dff9a');
            g.audio.play('respawn');
            for (const tg of this.targets) if (tg.kind !== 'popup') { tg.up = true; tg.hp = 100; }
          }
        }
      } else {
        ch.t -= dt;
        if (ch.t <= 0) this.endChallenge();
      }
    }

    this.updateNumbers(dt);
    this.updatePanel();
  }

  startChallenge() {
    this.padArmed = false;
    this.resetStats();
    this.challenge = { count: 3.0, t: CHALLENGE_T, down: 0 };
    this.game.hud.centerMessage('3', 'Get ready', 0.9, '#ff8a2a');
    this.game.audio.play('ui');
  }

  endChallenge() {
    const n = this.challenge.down;
    const record = n > this.best;
    if (record) {
      this.best = n;
      try { localStorage.setItem(BEST_KEY, String(n)); } catch (e) { /* no storage */ }
    }
    this.game.announcer.announce(record ? 'New Record' : 'Time', `${n} targets down · ${this.accuracy()}% accuracy${record ? '' : ` · best ${this.best}`}`);
    this.challenge = null;
  }

  updateNumbers(dt) {
    const cam = this.game.camera, W = window.innerWidth, H = window.innerHeight;
    for (const n of this.nums) {
      if (n.life <= 0) continue;
      n.life -= dt;
      if (n.life <= 0) { n.el.style.opacity = 0; continue; }
      n.y += dt * 0.6;
      this.v.set(n.x, n.y, n.z).project(cam);
      if (this.v.z > 1) { n.el.style.opacity = 0; continue; }
      n.el.style.transform = `translate(${((this.v.x + 1) / 2) * W}px, ${((1 - this.v.y) / 2) * H}px) translate(-50%, -50%)`;
      n.el.style.opacity = Math.min(1, n.life * 2.5);
    }
  }

  updatePanel() {
    const s = this.stats, ch = this.challenge;
    let head;
    if (ch && ch.count > 0) head = `<b class="rp-live">CHALLENGE STARTING…</b>`;
    else if (ch) head = `<b class="rp-live">CHALLENGE ${Math.ceil(ch.t)}s · ${ch.down} down</b>`;
    else head = `<b>CHALLENGE</b> step on the orange pad · best ${this.best}`;
    const hp = s.hits ? Math.round((100 * s.heads) / s.hits) : 0;
    const text = `${head}<br>Shots ${s.shots} · Hits ${s.hits} · Accuracy ${this.accuracy()}%<br>Headshots ${s.heads} (${hp}%) · Targets down ${s.down}`;
    if (text !== this.panelText) { this.panelText = text; this.panel.innerHTML = text; }
  }
}
