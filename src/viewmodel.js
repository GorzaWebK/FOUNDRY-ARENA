// First-person weapon models, rendered in their own scene on top of the world
// so they never clip into walls. All animation is simple procedural tweening.

import * as THREE from 'three';
import { flashTexture } from './textures.js';
import { SWITCH_TIME } from './weapons.js';

const std = (color, rough = 0.6, metal = 0.1) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
function bx(parent, w, h, d, m, x = 0, y = 0, z = 0, rx = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.x = rx;
  parent.add(mesh);
  return mesh;
}
function cyl(parent, r, len, m, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

const GUN = 0x4a515c, GUN2 = 0x69727f, GLOVE = 0x3a3f47, SLEEVE = 0x34475c, WOOD = 0x9a6a3c;

// right hand on the grip; the forearm runs back and down out of view
function arm(g, x, y, z) {
  bx(g, 0.07, 0.07, 0.095, std(GLOVE, 0.9, 0), x, y, z);
  const fore = bx(g, 0.066, 0.066, 0.4, std(SLEEVE, 0.9, 0), x + 0.035, y - 0.075, z + 0.23, 0.32);
  fore.rotation.y = 0.14;
}
// support hand under the fore-end; forearm runs back, left and down
function supportArm(parent, g, x, y, z) {
  bx(parent, 0.068, 0.06, 0.09, std(GLOVE, 0.9, 0), x, y, z);
  const fore = bx(g, 0.064, 0.064, 0.4, std(SLEEVE, 0.9, 0), x - 0.125, y - 0.085, z + 0.15, 0.38);
  fore.rotation.y = -0.68;
}

function buildPistol() {
  const g = new THREE.Group();
  const dark = std(GUN), mid = std(GUN2);
  const slide = bx(g, 0.036, 0.046, 0.21, mid, 0, 0.022, -0.02);
  bx(g, 0.03, 0.03, 0.17, dark, 0, -0.012, -0.015);
  bx(g, 0.032, 0.115, 0.052, dark, 0, -0.075, 0.055, 0.22);
  bx(g, 0.012, 0.04, 0.05, dark, 0, -0.045, 0.0);
  bx(g, 0.008, 0.012, 0.01, std(0xffffff, 0.4, 0), 0, 0.051, -0.11);
  bx(g, 0.022, 0.012, 0.01, dark, 0, 0.05, 0.075);
  const mag = bx(g, 0.026, 0.1, 0.04, std(0x2c3138), 0, -0.08, 0.057, 0.22);
  arm(g, 0.0, -0.085, 0.075);
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.022, -0.14), slide, mag, pump: null,
    hip: new THREE.Vector3(0.14, -0.135, -0.42), ads: new THREE.Vector3(0, -0.0585, -0.42),
  };
}

function buildRifle() {
  const g = new THREE.Group();
  const dark = std(GUN), mid = std(GUN2);
  bx(g, 0.05, 0.072, 0.32, mid, 0, 0, 0);
  bx(g, 0.046, 0.052, 0.24, dark, 0, 0.004, -0.27);
  cyl(g, 0.012, 0.22, dark, 0, 0.012, -0.48);
  cyl(g, 0.018, 0.06, std(0x2c3138), 0, 0.012, -0.6);
  const mag = bx(g, 0.03, 0.14, 0.06, std(0x2c3138), 0, -0.095, -0.06, 0.18);
  bx(g, 0.03, 0.085, 0.04, dark, 0, -0.072, 0.1, -0.25);
  bx(g, 0.04, 0.062, 0.22, dark, 0, -0.012, 0.27);
  bx(g, 0.018, 0.016, 0.34, dark, 0, 0.044, -0.06);
  bx(g, 0.006, 0.03, 0.01, dark, 0, 0.062, -0.37);
  bx(g, 0.008, 0.026, 0.012, dark, -0.012, 0.062, 0.08);
  bx(g, 0.008, 0.026, 0.012, dark, 0.012, 0.062, 0.08);
  bx(g, 0.052, 0.012, 0.1, std(0xff8a2a, 0.5, 0.1), 0, 0.012, -0.2);
  arm(g, 0.0, -0.08, 0.115);
  supportArm(g, g, -0.005, -0.05, -0.28);
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.012, -0.64), slide: null, mag, pump: null,
    hip: new THREE.Vector3(0.16, -0.16, -0.36), ads: new THREE.Vector3(0, -0.0755, -0.5),
  };
}

function buildShotgun() {
  const g = new THREE.Group();
  const dark = std(GUN), wood = std(WOOD, 0.8, 0);
  cyl(g, 0.018, 0.6, dark, 0, 0.022, -0.32);
  cyl(g, 0.015, 0.44, std(GUN2), 0, -0.016, -0.26);
  const pump = bx(g, 0.052, 0.048, 0.15, wood, 0, -0.02, -0.3);
  bx(g, 0.05, 0.078, 0.24, std(GUN2), 0, 0, 0.03);
  bx(g, 0.04, 0.066, 0.26, wood, 0, -0.03, 0.28, -0.12);
  bx(g, 0.03, 0.07, 0.04, dark, 0, -0.065, 0.12, -0.3);
  bx(g, 0.008, 0.014, 0.01, std(0xffffff, 0.4, 0), 0, 0.046, -0.6);
  arm(g, 0.0, -0.075, 0.135);
  supportArm(g, g, -0.005, -0.06, -0.3);
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.022, -0.64), slide: null, mag: null, pump,
    hip: new THREE.Vector3(0.16, -0.155, -0.36), ads: new THREE.Vector3(0, -0.054, -0.6),
  };
}

function buildSmg() {
  const g = new THREE.Group();
  const dark = std(GUN), mid = std(GUN2), black = std(0x2c3138);
  bx(g, 0.046, 0.07, 0.26, mid, 0, 0, -0.02);
  bx(g, 0.04, 0.045, 0.12, dark, 0, 0.002, -0.2);
  cyl(g, 0.011, 0.1, dark, 0, 0.008, -0.3);
  cyl(g, 0.02, 0.09, black, 0, 0.008, -0.37);
  const mag = bx(g, 0.026, 0.17, 0.04, black, 0, -0.115, -0.07, 0.06);
  bx(g, 0.03, 0.085, 0.04, dark, 0, -0.07, 0.07, -0.25);
  bx(g, 0.03, 0.03, 0.16, dark, 0, 0.012, 0.18);
  bx(g, 0.035, 0.07, 0.02, dark, 0, 0, 0.26);
  bx(g, 0.016, 0.014, 0.2, dark, 0, 0.042, -0.04);
  bx(g, 0.006, 0.026, 0.01, dark, 0, 0.058, -0.24);
  bx(g, 0.008, 0.022, 0.012, dark, -0.011, 0.056, 0.05);
  bx(g, 0.008, 0.022, 0.012, dark, 0.011, 0.056, 0.05);
  bx(g, 0.048, 0.012, 0.07, std(0x4fc3f7, 0.5, 0.1), 0, 0.012, -0.14);
  arm(g, 0.0, -0.078, 0.085);
  supportArm(g, g, -0.005, -0.045, -0.18);
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.008, -0.43), slide: null, mag, pump: null,
    hip: new THREE.Vector3(0.15, -0.15, -0.36), ads: new THREE.Vector3(0, -0.068, -0.42),
  };
}

function buildSniper() {
  const g = new THREE.Group();
  const dark = std(GUN), mid = std(GUN2), black = std(0x2c3138), green = std(0x56604a, 0.8, 0);
  bx(g, 0.05, 0.07, 0.36, mid, 0, 0, 0.02);
  bx(g, 0.045, 0.05, 0.3, green, 0, -0.012, -0.3);
  cyl(g, 0.012, 0.5, dark, 0, 0.014, -0.62);
  cyl(g, 0.02, 0.07, black, 0, 0.014, -0.9);
  // scope
  cyl(g, 0.026, 0.26, black, 0, 0.078, -0.02);
  cyl(g, 0.034, 0.06, black, 0, 0.078, -0.17);
  cyl(g, 0.03, 0.04, black, 0, 0.078, 0.12);
  bx(g, 0.016, 0.03, 0.03, dark, 0, 0.045, -0.08);
  bx(g, 0.016, 0.03, 0.03, dark, 0, 0.045, 0.05);
  const bolt = bx(g, 0.05, 0.016, 0.016, std(0xb8c0c8, 0.4, 0.5), 0.04, 0.012, 0.1);
  const mag = bx(g, 0.03, 0.07, 0.07, black, 0, -0.065, -0.03);
  bx(g, 0.03, 0.085, 0.04, dark, 0, -0.07, 0.13, -0.3);
  bx(g, 0.042, 0.075, 0.26, green, 0, -0.022, 0.33, -0.08);
  arm(g, 0.0, -0.078, 0.145);
  supportArm(g, g, -0.005, -0.055, -0.3);
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.014, -0.94), slide: null, mag, pump: bolt,
    hip: new THREE.Vector3(0.16, -0.165, -0.34), ads: new THREE.Vector3(0, -0.078, -0.3),
  };
}

function buildLmg() {
  const g = new THREE.Group();
  const dark = std(GUN), mid = std(GUN2), black = std(0x2c3138);
  bx(g, 0.06, 0.085, 0.36, mid, 0, 0, 0);
  bx(g, 0.05, 0.05, 0.26, dark, 0, 0.006, -0.3);
  cyl(g, 0.015, 0.3, dark, 0, 0.012, -0.55);
  cyl(g, 0.021, 0.06, black, 0, 0.012, -0.72);
  const mag = bx(g, 0.09, 0.1, 0.12, std(0x4b5a3a, 0.8, 0), -0.02, -0.095, -0.06);
  bx(g, 0.03, 0.085, 0.04, dark, 0, -0.075, 0.12, -0.25);
  bx(g, 0.045, 0.07, 0.24, dark, 0, -0.012, 0.29);
  bx(g, 0.02, 0.018, 0.3, dark, 0, 0.052, -0.04);
  bx(g, 0.006, 0.03, 0.01, dark, 0, 0.07, -0.4);
  bx(g, 0.008, 0.026, 0.012, dark, -0.012, 0.07, 0.1);
  bx(g, 0.008, 0.026, 0.012, dark, 0.012, 0.07, 0.1);
  bx(g, 0.012, 0.012, 0.2, dark, -0.025, -0.03, -0.38);
  bx(g, 0.012, 0.012, 0.2, dark, 0.025, -0.03, -0.38);
  bx(g, 0.062, 0.012, 0.08, std(0xff8a2a, 0.5, 0.1), 0, 0.02, -0.19);
  arm(g, 0.0, -0.085, 0.135);
  supportArm(g, g, -0.005, -0.05, -0.28);
  return {
    group: g, muzzle: new THREE.Vector3(0, 0.012, -0.76), slide: null, mag, pump: null,
    hip: new THREE.Vector3(0.17, -0.17, -0.36), ads: new THREE.Vector3(0, -0.084, -0.5),
  };
}

const FLASH_SCALE = { pistol: 0.85, smg: 0.9, rifle: 1.1, lmg: 1.25, shotgun: 1.5, sniper: 1.7 };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x55504a, 1.6));
    const d = new THREE.DirectionalLight(0xfff2d6, 2.2);
    d.position.set(-1, 2, 1.5);
    this.scene.add(d);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.models = {
      pistol: buildPistol(), rifle: buildRifle(), smg: buildSmg(),
      shotgun: buildShotgun(), sniper: buildSniper(), lmg: buildLmg(),
    };
    for (const m of Object.values(this.models)) {
      m.group.visible = false;
      this.root.add(m.group);
      if (m.mag) m.magHome = m.mag.position.clone();
      if (m.pump) m.pumpHome = m.pump.position.clone();
      if (m.slide) m.slideHome = m.slide.position.clone();
    }
    this.current = null;
    this.throwT = 0;
    this.slidePose = 0;

    const fmat = new THREE.MeshBasicMaterial({
      map: flashTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.flash = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), fmat);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), fmat);
    p2.rotation.y = Math.PI / 2;
    const p3 = p2.clone();
    p3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    this.flash.add(p1, p2, p3);
    this.flash.visible = false;
    this.root.add(this.flash);
    this.flashT = 0;

    this.kickZ = 0; this.kickRot = 0;
    this.bob = 0;
    this.swayX = 0; this.swayY = 0;
    this.landDip = 0;
    this.pumpT = 9;
    this.slideT = 9;
    this.pos = new THREE.Vector3();
  }

  setAspect(a) { this.camera.aspect = a; this.camera.updateProjectionMatrix(); }

  fire(def) {
    this.kickZ += def.kick;
    this.kickRot += def.kick * 1.6;
    this.flashT = 0.05;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar((FLASH_SCALE[def.id] || 1) * (0.85 + Math.random() * 0.4));
    if (def.id === 'shotgun' || def.id === 'sniper') this.pumpT = 0; // pump / bolt
    if (def.id === 'pistol') this.slideT = 0;
  }

  land(strength) { this.landDip = Math.min(0.06, strength * 0.006); }

  /** Weapon dips out of the way while the off hand throws a grenade. */
  throwAnim() { this.throwT = 0.55; }

  /**
   * s = { weaponId, ads (0..1), hidden, speed, onGround, sprinting, sliding,
   *       reloadFrac (0..1 or -1), switchT, mdx, mdy }
   */
  update(dt, s) {
    if (s.weaponId !== this.current) {
      if (this.current) this.models[this.current].group.visible = false;
      this.current = s.weaponId;
      this.models[this.current].group.visible = true;
    }
    this.root.visible = !s.hidden; // looking through a scope
    const m = this.models[this.current];
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
    const sp = s.sprinting ? 1 : 0;
    this.sprintT = (this.sprintT || 0) + (sp - (this.sprintT || 0)) * Math.min(1, dt * 8);
    p.x -= this.sprintT * 0.05; p.y -= this.sprintT * 0.03;
    ry += this.sprintT * 0.55; rx -= this.sprintT * 0.25;

    // slide: gun cants over
    this.slidePose += ((s.sliding ? 1 : 0) - this.slidePose) * Math.min(1, dt * 10);
    p.y -= this.slidePose * 0.02;
    rz += this.slidePose * 0.32;

    // grenade throw: dip down and back up
    if (this.throwT > 0) {
      this.throwT -= dt;
      const bell = Math.sin(Math.max(0, this.throwT / 0.55) * Math.PI);
      p.y -= bell * 0.16;
      rx -= bell * 0.5;
    }

    // reload: dip + tilt, magazine drops out and comes back
    if (s.reloadFrac >= 0) {
      const t = s.reloadFrac;
      const bell = smooth(0, 0.18, t) * (1 - smooth(0.82, 1, t));
      p.y -= bell * 0.09; p.x -= bell * 0.02;
      rz += bell * 0.55; rx += bell * 0.35;
      if (m.mag) {
        const out = smooth(0.15, 0.35, t) * (1 - smooth(0.5, 0.7, t));
        m.mag.position.copy(m.magHome);
        m.mag.position.y -= out * 0.22;
      }
      if (m.pump) {
        const w = Math.sin(t * Math.PI * 6) * 0.5 + 0.5;
        m.pump.position.z = m.pumpHome.z + bell * w * 0.07;
      }
    } else {
      if (m.mag) m.mag.position.copy(m.magHome);
      if (m.pump) {
        this.pumpT += dt;
        const t = this.pumpT;
        const back = t > 0.3 && t < 0.62 ? Math.sin(((t - 0.3) / 0.32) * Math.PI) : 0;
        m.pump.position.z = m.pumpHome.z + back * 0.09;
      }
    }
    if (m.slide) {
      this.slideT += dt;
      m.slide.position.z = m.slideHome.z + (this.slideT < 0.09 ? Math.sin((this.slideT / 0.09) * Math.PI) * 0.04 : 0);
    }

    // weapon switch: rise from below
    if (s.switchT > 0) {
      const t = s.switchT / SWITCH_TIME;
      p.y -= t * t * 0.3;
      rx -= t * 0.7;
    }

    this.root.position.copy(p);
    this.root.rotation.set(rx, ry, rz);

    if (this.flashT > 0) {
      this.flashT -= dt;
      this.flash.visible = true;
      this.flash.position.copy(m.muzzle);
      this.flash.position.z -= 0.06;
    } else {
      this.flash.visible = false;
    }
  }
}
