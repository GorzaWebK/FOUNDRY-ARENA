// First-person weapon view, rendered in its own scene on top of the world so
// the gun never clips into walls. Everything is procedural tweening:
// recoil, bob, sway, sprint/slide poses, hand-animated reloads, pump and bolt
// cycles, shell casings, barrel smoke, muzzle flash, knife slash, grenade
// throw and an inspect animation.

import * as THREE from 'three';
import { flashTexture, glowTexture } from './textures.js';
import { SWITCH_TIME } from './weapons.js';
import { buildGun, makeMaterials } from './gunModels.js';

const GLOVE = 0x3a3f47, SLEEVE = 0x34475c;
const std = (color, rough = 0.6, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const BOX = new THREE.BoxGeometry(1, 1, 1);
function bx(parent, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

// How each gun sits on screen. ADS height comes from the gun's own sight line.
const VIEW = {
  pistol: { hip: [0.14, -0.13, -0.42], adsZ: -0.4, flash: 0.85, reload: 'mag', flashT: 0.05 },
  rifle: { hip: [0.16, -0.16, -0.38], adsZ: -0.42, flash: 1.1, reload: 'mag', flashT: 0.05 },
  smg: { hip: [0.15, -0.15, -0.38], adsZ: -0.38, flash: 0.75, reload: 'mag', flashT: 0.04 },
  shotgun: { hip: [0.16, -0.155, -0.38], adsZ: -0.5, flash: 1.6, reload: 'shells', flashT: 0.07 },
  sniper: { hip: [0.16, -0.165, -0.36], adsZ: -0.3, flash: 1.8, reload: 'mag', flashT: 0.07 },
  lmg: { hip: [0.17, -0.17, -0.38], adsZ: -0.46, flash: 1.25, reload: 'mag', flashT: 0.05 },
};

const KNIFE_ANIM = 0.42;
const INSPECT_T = 2.6;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

/** Hand + forearm. `side` 1 = right (grip hand), -1 = left (support hand). */
function makeArm(side) {
  const g = new THREE.Group();
  const glove = std(GLOVE, 0.9, 0), sleeve = std(SLEEVE, 0.9, 0);
  bx(g, 0.068, 0.07, 0.092, glove, 0, 0, 0);
  bx(g, 0.02, 0.026, 0.06, glove, side * 0.03, 0.02, -0.02, 0, 0, 0); // thumb
  if (side > 0) bx(g, 0.064, 0.064, 0.4, sleeve, 0.035, -0.08, 0.23, 0.32, 0.14, 0);
  else bx(g, 0.062, 0.062, 0.42, sleeve, -0.1, -0.09, 0.18, 0.36, -0.6, 0);
  return g;
}

function buildKnife() {
  const g = new THREE.Group();
  const blade = std(0xd9dee4, 0.25, 0.85), handle = std(0x23262b, 0.8, 0), guard = std(0x55606c, 0.5, 0.5);
  bx(g, 0.012, 0.035, 0.2, blade, 0, 0, -0.12);
  bx(g, 0.012, 0.016, 0.05, blade, 0, 0.01, -0.235, 0.6); // tip
  bx(g, 0.05, 0.016, 0.018, guard, 0, 0, -0.012);
  bx(g, 0.026, 0.03, 0.11, handle, 0, -0.002, 0.05);
  bx(g, 0.07, 0.07, 0.09, std(GLOVE, 0.9, 0), 0, -0.01, 0.06);
  bx(g, 0.066, 0.066, 0.36, std(SLEEVE, 0.9, 0), 0.02, -0.06, 0.26, 0.25);
  return g;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x55504a, 1.5));
    const d = new THREE.DirectionalLight(0xfff2d6, 2.2);
    d.position.set(-1, 2, 1.5);
    this.scene.add(d);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8);
    rim.position.set(1.5, 0.5, -1);
    this.scene.add(rim);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.mats = makeMaterials();
    this.models = {};
    for (const id of Object.keys(VIEW)) {
      const spec = buildGun(id, this.mats);
      const v = VIEW[id];
      spec.view = v;
      spec.hip = new THREE.Vector3(...v.hip);
      spec.ads = new THREE.Vector3(-spec.points.sight.x, -spec.points.sight.y, v.adsZ);
      spec.homes = {};
      for (const [k, part] of Object.entries(spec.parts)) {
        if (part) spec.homes[k] = { pos: part.position.clone(), rot: part.rotation.clone() };
      }
      // hands
      spec.armR = makeArm(1);
      spec.armR.position.copy(spec.points.grip);
      spec.armL = makeArm(-1);
      spec.armL.position.copy(spec.points.fore);
      spec.group.add(spec.armR, spec.armL);
      // a round in the support hand while loading the shotgun
      if (v.reload === 'shells') {
        spec.handShell = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.03, 8), this.mats.red);
        spec.handShell.rotation.x = Math.PI / 2;
        spec.handShell.position.set(0, 0.04, -0.02);
        spec.handShell.visible = false;
        spec.armL.add(spec.handShell);
      }
      spec.group.visible = false;
      this.root.add(spec.group);
      this.models[id] = spec;
    }
    this.current = null;

    // knife (camera space, independent of the gun's pose)
    this.knife = buildKnife();
    this.knife.visible = false;
    this.scene.add(this.knife);

    // muzzle flash: three crossed star planes + a light that catches the gun and hands
    const fmat = new THREE.MeshBasicMaterial({
      map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.flash = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), fmat);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.11), fmat);
    p2.rotation.y = Math.PI / 2;
    p2.position.z = -0.08;
    const p3 = p2.clone();
    p3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    this.flash.add(p1, p2, p3);
    this.flash.visible = false;
    this.root.add(this.flash);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.6, 2);
    this.scene.add(this.flashLight);
    this.flashT = 0;
    this.flashMax = 0.05;

    // shell casings + barrel smoke (camera space, so they leave the gun behind)
    const brass = new THREE.CylinderGeometry(0.0065, 0.0065, 0.03, 6);
    const shell = new THREE.CylinderGeometry(0.01, 0.01, 0.036, 8);
    this.casings = [];
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(brass, this.mats.brass);
      m.visible = false;
      this.scene.add(m);
      this.casings.push({ m, vx: 0, vy: 0, vz: 0, sx: 0, sz: 0, life: 0 });
    }
    this.casingGeo = { brass, shell };
    this.nextCasing = 0;
    this.smoke = [];
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(), color: 0xc8c8c8, transparent: true, opacity: 0, depthWrite: false,
      }));
      sp.visible = false;
      this.scene.add(sp);
      this.smoke.push({ sp, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.05 });
    }
    this.nextSmoke = 0;
    this.heat = 0; // how hot the barrel looks (drives the after-fire smoke)
    this.sinceShot = 9;
    this.smokeT = 0;

    this.kickZ = 0; this.kickRot = 0;
    this.bob = 0;
    this.swayX = 0; this.swayY = 0;
    this.landDip = 0;
    this.sprintT = 0;
    this.slidePose = 0;
    this.throwT = 0;
    this.knifeT = 0;
    this.inspectT = 0;
    this.cycleT = 9; // time since the last shot, for pump / bolt / slide motion
    this.pendingEject = 0; // casings to spawn this frame
    this.delayedEject = -1; // pump / bolt guns eject partway through the cycle
    this.pos = new THREE.Vector3();
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  fire(def, heat = 0) {
    const v = VIEW[def.id];
    this.kickZ += def.kick;
    this.kickRot += def.kick * 1.6;
    this.flashMax = v ? v.flashT : 0.05;
    this.flashT = this.flashMax;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar((v ? v.flash : 1) * (0.8 + Math.random() * 0.45));
    this.cycleT = 0;
    this.sinceShot = 0;
    this.inspectT = 0;
    this.heat = Math.max(this.heat, heat);
    if (def.id === 'shotgun') { this.delayedEject = 0.44; this.puff(3); }
    else if (def.id === 'sniper') { this.delayedEject = 0.5; this.puff(3); }
    else this.pendingEject++;
  }

  land(strength) { this.landDip = Math.min(0.06, strength * 0.006); }

  /** Weapon dips out of the way while the off hand throws a grenade. */
  throwAnim() { this.throwT = 0.55; this.inspectT = 0; }

  /** Knife slash: the gun ducks out and the knife sweeps right to left. */
  knifeAnim() { this.knifeT = KNIFE_ANIM; this.inspectT = 0; }

  /** Turn the gun over and have a look at it. */
  inspect() { if (this.inspectT <= 0) this.inspectT = INSPECT_T; }

  // ---------------------------------------------------------------- casings + smoke

  _spawnCasing(m) {
    const c = this.casings[this.nextCasing];
    this.nextCasing = (this.nextCasing + 1) % this.casings.length;
    const shell = m.casing === 'shell';
    c.m.geometry = shell ? this.casingGeo.shell : this.casingGeo.brass;
    c.m.material = shell ? this.mats.red : this.mats.brass;
    m.group.localToWorld(_v.copy(m.points.eject));
    c.m.position.copy(_v);
    c.m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    c.vx = 1.1 + Math.random() * 0.7;
    c.vy = 0.9 + Math.random() * 0.6;
    c.vz = 0.15 + Math.random() * 0.25;
    c.sx = (Math.random() - 0.5) * 30;
    c.sz = (Math.random() - 0.5) * 30;
    c.life = 0.7;
    c.m.visible = true;
  }

  /** Smoke puffs at the muzzle. */
  puff(n, size = 0.05) {
    const m = this.models[this.current];
    if (!m) return;
    for (let i = 0; i < n; i++) {
      const s = this.smoke[this.nextSmoke];
      this.nextSmoke = (this.nextSmoke + 1) % this.smoke.length;
      m.group.localToWorld(_v.copy(m.points.muzzle));
      s.sp.position.copy(_v);
      s.vx = (Math.random() - 0.5) * 0.06;
      s.vy = 0.07 + Math.random() * 0.08;
      s.vz = -0.04 - Math.random() * 0.06;
      s.max = s.life = 0.9 + Math.random() * 0.8;
      s.size = size * (0.7 + Math.random() * 0.6);
      s.sp.visible = true;
    }
  }

  _updateFx(dt) {
    for (const c of this.casings) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { c.m.visible = false; continue; }
      c.vy -= 6 * dt;
      c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.position.z += c.vz * dt;
      c.m.rotation.x += c.sx * dt; c.m.rotation.z += c.sz * dt;
    }
    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.sp.visible = false; continue; }
      const t = 1 - s.life / s.max;
      s.sp.position.x += s.vx * dt; s.sp.position.y += s.vy * dt; s.sp.position.z += s.vz * dt;
      s.sp.scale.setScalar(s.size * (1 + t * 3.5));
      s.sp.material.opacity = 0.22 * Math.sin(Math.min(1, t * 1.4) * Math.PI) * (1 - t * 0.5);
    }
  }

  // ---------------------------------------------------------------- per frame

  /**
   * s = { weaponId, ads (0..1), hidden, speed, onGround, sprinting, sliding,
   *       reloadFrac (0..1 or -1), switchT, mdx, mdy, busy }
   */
  update(dt, s) {
    if (s.weaponId !== this.current) {
      if (this.current) this.models[this.current].group.visible = false;
      this.current = s.weaponId;
      this.models[this.current].group.visible = true;
      this.inspectT = 0;
      this.cycleT = 9;
      this.delayedEject = -1;
    }
    if (s.busy) this.inspectT = 0;
    this.root.visible = !s.hidden; // looking through a scope
    const m = this.models[this.current];
    const P = m.parts, H = m.homes;
    const hipW = 1 - s.ads;

    // bob
    if (s.onGround && s.speed > 0.5) this.bob += dt * (4 + s.speed * 1.25);
    const bobAmt = Math.min(1, s.speed / 6) * (0.25 + 0.75 * hipW) * (s.onGround ? 1 : 0.2);
    const bx_ = Math.cos(this.bob) * 0.009 * bobAmt;
    const by_ = -Math.abs(Math.sin(this.bob)) * 0.012 * bobAmt;

    // sway (lags behind mouse movement)
    const k = Math.min(1, dt * 10);
    this.swayX += (Math.max(-0.03, Math.min(0.03, -s.mdx * 0.0006)) - this.swayX) * k;
    this.swayY += (Math.max(-0.03, Math.min(0.03, s.mdy * 0.0006)) - this.swayY) * k;

    // recoil spring
    this.kickZ *= Math.exp(-dt * 14);
    this.kickRot *= Math.exp(-dt * 12);
    this.landDip *= Math.exp(-dt * 9);

    const p = this.pos.copy(m.hip).lerp(m.ads, s.ads);
    let rx = this.kickRot * (0.6 + 0.4 * hipW), ry = 0, rz = 0;
    p.x += bx_ + this.swayX * hipW;
    p.y += by_ + this.swayY * hipW - this.landDip;
    p.z += this.kickZ;
    ry += this.swayX * 1.5;

    // sprint pose
    this.sprintT += ((s.sprinting ? 1 : 0) - this.sprintT) * Math.min(1, dt * 8);
    p.x -= this.sprintT * 0.05; p.y -= this.sprintT * 0.03;
    ry += this.sprintT * 0.55; rx -= this.sprintT * 0.25;

    // slide: gun cants over
    this.slidePose += ((s.sliding ? 1 : 0) - this.slidePose) * Math.min(1, dt * 10);
    p.y -= this.slidePose * 0.02;
    rz += this.slidePose * 0.32;

    // inspect: turn it to show the side, then tip it to show the top
    if (this.inspectT > 0) {
      this.inspectT -= dt;
      const u = 1 - Math.max(0, this.inspectT) / INSPECT_T;
      const a = smooth(0, 0.15, u) * (1 - smooth(0.85, 1, u));
      const b = smooth(0.12, 0.38, u) * (1 - smooth(0.5, 0.68, u));
      const c = smooth(0.5, 0.68, u) * (1 - smooth(0.8, 0.96, u));
      p.x -= 0.1 * a; p.y += 0.035 * a; p.z += 0.04 * a;
      ry += 0.95 * b + 0.3 * c;
      rz += 0.28 * b - 0.4 * c;
      rx += 0.55 * c;
    }

    // knife slash
    if (this.knifeT > 0) {
      this.knifeT -= dt;
      const u = 1 - Math.max(0, this.knifeT) / KNIFE_ANIM;
      const duck = Math.sin(Math.min(1, u * 1.15) * Math.PI);
      p.y -= duck * 0.22;
      rx -= duck * 0.6;
      const sw = smooth(0.1, 0.6, u);
      const up = smooth(0, 0.14, u) * (1 - smooth(0.72, 1, u));
      const kn = this.knife;
      kn.visible = !s.hidden && u > 0.02 && u < 0.98;
      kn.position.set(0.34 - sw * 0.62, -0.42 + up * 0.22 + Math.sin(sw * Math.PI) * 0.1, -0.5);
      kn.rotation.set(0.2, -0.55 + sw * 1.5, -1.35 + sw * 0.5);
    } else {
      this.knife.visible = false;
    }

    // a grenade in the off hand (pin pulled): the gun waits low
    this.cookAmt = (this.cookAmt || 0) + ((s.cooking ? 1 : 0) - (this.cookAmt || 0)) * Math.min(1, dt * 12);
    if (this.cookAmt > 0.001) { p.y -= this.cookAmt * 0.14; rx -= this.cookAmt * 0.45; }

    // grenade throw: dip down and back up
    if (this.throwT > 0) {
      this.throwT -= dt;
      const bell = Math.sin(Math.max(0, this.throwT / 0.55) * Math.PI);
      p.y -= bell * 0.16;
      rx -= bell * 0.5;
    }

    // ---- moving parts: reset to rest, then animate
    for (const [key, part] of Object.entries(P)) {
      if (!part) continue;
      part.position.copy(H[key].pos);
      part.rotation.copy(H[key].rot);
    }
    const pts = m.points;
    m.armL.position.copy(pts.fore);
    if (m.handShell) m.handShell.visible = false;
    this.cycleT += dt;

    if (s.reloadFrac >= 0) {
      this.inspectT = 0;
      const t = s.reloadFrac;
      // bring the gun up and roll its underside toward the middle so the hands can be seen working
      const bell = smooth(0, 0.15, t) * (1 - smooth(0.85, 1, t));
      p.x -= bell * 0.09; p.y += bell * 0.15; p.z -= bell * 0.06;
      rz -= bell * 0.3; rx += bell * 0.12; ry += bell * 0.35;
      if (m.view.reload === 'shells') this._reloadShells(m, t);
      else this._reloadMag(m, t);
    } else {
      // firing cycles
      if (P.slide && this.cycleT < 0.09) P.slide.position.z += Math.sin((this.cycleT / 0.09) * Math.PI) * 0.04;
      if (P.pump) {
        const u = this.cycleT;
        const back = u > 0.3 && u < 0.62 ? Math.sin(((u - 0.3) / 0.32) * Math.PI) : 0;
        P.pump.position.z += back * 0.09;
        m.armL.position.z += back * 0.09; // the support hand rides the pump
      }
      if (P.bolt) this._boltPose(P.bolt, H.bolt, (this.cycleT - 0.25) / 0.6);
      if (this.delayedEject >= 0 && this.cycleT >= this.delayedEject) {
        this.delayedEject = -1;
        this.pendingEject++;
      }
    }

    // weapon switch: rise from below
    if (s.switchT > 0) {
      const t = s.switchT / SWITCH_TIME;
      p.y -= t * t * 0.3;
      rx -= t * 0.7;
    }

    this.root.position.copy(p);
    this.root.rotation.set(rx, ry, rz);
    this.root.updateMatrixWorld(true);

    // muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = true;
      this.flash.position.copy(pts.muzzle);
      this.flash.position.z -= 0.06;
      m.group.localToWorld(_w.copy(pts.muzzle));
      this.flashLight.position.copy(_w);
      this.flashLight.intensity = 5 * Math.max(0, this.flashT / this.flashMax);
    } else {
      this.flash.visible = false;
      this.flashLight.intensity = 0;
    }

    // casings queued by shots / pump / bolt
    while (this.pendingEject > 0) { this.pendingEject--; this._spawnCasing(m); }

    // smoke curling off a hot barrel once you stop shooting
    this.sinceShot += dt;
    this.heat = Math.max(0, this.heat - dt * 0.35);
    if (this.sinceShot > 0.15 && this.heat > 0.3 && !s.hidden) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) { this.smokeT = 0.11; this.puff(1, 0.035); }
    }
    this._updateFx(dt);
  }

  /** Bolt action: lift, pull back, push forward, lock down. u in 0..1. */
  _boltPose(bolt, home, u) {
    if (u <= 0 || u >= 1) return;
    const lift = smooth(0, 0.2, u) * (1 - smooth(0.8, 1, u));
    const back = smooth(0.2, 0.42, u) * (1 - smooth(0.55, 0.78, u));
    bolt.rotation.z = home.rot.z + lift * 1.1;
    bolt.position.z = home.pos.z + back * 0.075;
  }

  /** Magazine reload: support hand grabs the mag, pulls it, brings a fresh one. */
  _reloadMag(m, t) {
    const P = m.parts, H = m.homes, pts = m.points;
    const grab = _v.copy(pts.magwell).add(_w.set(0.0, -0.085, 0.015));
    const down = { x: grab.x - 0.06, y: grab.y - 0.2, z: grab.z + 0.05 };
    let hx, hy, hz, attached = false;
    if (t < 0.18) { // reach for the mag
      const e = smooth(0, 0.18, t);
      hx = lerp(pts.fore.x, grab.x, e); hy = lerp(pts.fore.y, grab.y, e); hz = lerp(pts.fore.z, grab.z, e);
    } else if (t < 0.4) { // pull it out and away
      const e = smooth(0.18, 0.4, t);
      hx = lerp(grab.x, down.x, e); hy = lerp(grab.y, down.y, e); hz = lerp(grab.z, down.z, e);
      attached = true;
    } else if (t < 0.55) { // swap, out of view
      hx = down.x; hy = down.y; hz = down.z; attached = true;
    } else if (t < 0.74) { // bring the fresh one up and seat it
      const e = smooth(0.55, 0.74, t);
      hx = lerp(down.x, grab.x, e); hy = lerp(down.y, grab.y, e); hz = lerp(down.z, grab.z, e);
      attached = true;
    } else if (t < 0.8) { // smack it home
      const e = Math.sin(smooth(0.74, 0.8, t) * Math.PI);
      hx = grab.x; hy = grab.y + e * 0.012; hz = grab.z;
    } else { // back to the grip
      const e = smooth(0.8, 1, t);
      hx = lerp(grab.x, pts.fore.x, e); hy = lerp(grab.y, pts.fore.y, e); hz = lerp(grab.z, pts.fore.z, e);
    }
    m.armL.position.set(hx, hy, hz);
    if (P.mag && attached) {
      P.mag.position.set(H.mag.pos.x + (hx - grab.x), H.mag.pos.y + (hy - grab.y), H.mag.pos.z + (hz - grab.z));
    }
    // pistol: slide locks back, then snaps forward once the mag is in
    if (P.slide) P.slide.position.z = H.slide.pos.z + 0.035 * smooth(0.02, 0.08, t) * (1 - smooth(0.8, 0.84, t));
    // rifle: charging handle pull at the end
    if (P.charge) P.charge.position.z = H.charge.pos.z + 0.06 * Math.sin(smooth(0.82, 0.95, t) * Math.PI);
    // sniper: open the bolt first, close it last
    if (P.bolt) {
      const open = smooth(0.03, 0.14, t) * (1 - smooth(0.86, 0.97, t));
      P.bolt.rotation.z = H.bolt.rot.z + open * 1.1;
      P.bolt.position.z = H.bolt.pos.z + smooth(0.08, 0.16, t) * (1 - smooth(0.86, 0.93, t)) * 0.075;
    }
  }

  /** Shotgun: feed shells one at a time into the loading port. */
  _reloadShells(m, t) {
    const pts = m.points;
    const port = pts.magwell;
    const low = { x: port.x + 0.01, y: port.y - 0.1, z: port.z + 0.05 };
    let hx, hy, hz, shell = false;
    if (t < 0.12) {
      const e = smooth(0, 0.12, t);
      hx = lerp(pts.fore.x, low.x, e); hy = lerp(pts.fore.y, low.y, e); hz = lerp(pts.fore.z, low.z, e);
    } else if (t < 0.84) {
      const cyc = ((t - 0.12) / 0.72) * 4; // four pushes
      const f = cyc % 1;
      const up = Math.sin(Math.min(1, f / 0.7) * Math.PI); // push up into the port, drop back for the next
      hx = low.x; hy = lerp(low.y, port.y - 0.02, up); hz = lerp(low.z, port.z, up);
      shell = f < 0.45;
    } else {
      const e = smooth(0.84, 1, t);
      hx = lerp(low.x, pts.fore.x, e); hy = lerp(low.y, pts.fore.y, e); hz = lerp(low.z, pts.fore.z, e);
    }
    m.armL.position.set(hx, hy, hz);
    if (m.handShell) m.handShell.visible = shell;
  }
}
