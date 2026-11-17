// Procedural low-poly gun models, shared by the first-person view and the
// characters in the world.
//
// Every builder draws a gun at real size (metres) with the barrel along -z and
// +y up, origin roughly at the receiver, and returns:
//   group                      the meshes
//   parts.{mag,slide,bolt,pump,charge}   moving parts (or null)
//   points.{muzzle,eject,sight,grip,fore,magwell,center}   attachment points
//   casing                     'brass' | 'shell'
//
// buildGun(id, mats) builds the first-person version (separate meshes so parts
// can move). worldGun(id) returns a merged single-mesh copy for characters.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { skinColor } from './skins.js';

// ------------------------------------------------------------------ palette

export const PALETTE = {
  metal: [0x3a3f47, 0.42, 0.55],
  metalLight: [0x69727e, 0.38, 0.5],
  polymer: [0x272b30, 0.85, 0.0],
  polymerLight: [0x454b53, 0.8, 0.0],
  wood: [0x8a5a32, 0.75, 0.0],
  woodDark: [0x5e3c20, 0.8, 0.0],
  olive: [0x5b6646, 0.8, 0.0],
  tan: [0x9c8a64, 0.8, 0.0],
  orange: [0xff8a2a, 0.5, 0.1],
  cyan: [0x4fc3f7, 0.5, 0.1],
  red: [0xc0392b, 0.6, 0.0],
  white: [0xf2f2f2, 0.4, 0.0],
  brass: [0xc8a24a, 0.35, 0.7],
  glass: [0x1c3550, 0.15, 0.3],
};

/** One MeshStandardMaterial per palette key. */
export function makeMaterials() {
  const m = {};
  for (const [k, [color, rough, metal]] of Object.entries(PALETTE)) {
    m[k] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  }
  return m;
}

// ------------------------------------------------------------------ geometry helpers

const geoCache = new Map();
let LOW = false; // world copies: plain boxes, fewer cylinder sides (bevels don't show at a distance)
function rboxGeo(w, h, d) {
  if (LOW) {
    const key = `b${w},${h},${d}`;
    let b = geoCache.get(key);
    if (!b) { b = new THREE.BoxGeometry(w, h, d); geoCache.set(key, b); }
    return b;
  }
  const key = `r${w},${h},${d}`;
  let g = geoCache.get(key);
  if (!g) {
    const r = Math.min(w, h, d) * 0.2;
    g = new RoundedBoxGeometry(w, h, d, 2, r);
    geoCache.set(key, g);
  }
  return g;
}
function cylGeo(r0, r1, len, seg = 10) {
  if (LOW) seg = 6;
  const key = `c${r0},${r1},${len},${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(r0, r1, len, seg);
    g.rotateX(Math.PI / 2); // along z
    geoCache.set(key, g);
  }
  return g;
}
function sphereGeo(r) {
  const key = `s${r}${LOW ? 'l' : ''}`;
  let g = geoCache.get(key);
  if (!g) { g = LOW ? new THREE.SphereGeometry(r, 6, 4) : new THREE.SphereGeometry(r, 10, 8); geoCache.set(key, g); }
  return g;
}

/** Tiny builder bound to a parent and a material set. */
function kit(mats) {
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mats[mat]);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    parent.add(mesh);
    return mesh;
  };
  return {
    box: (p, w, h, d, mat, x, y, z, rx, ry, rz) => add(p, rboxGeo(w, h, d), mat, x, y, z, rx, ry, rz),
    cyl: (p, r, len, mat, x, y, z, seg) => add(p, cylGeo(r, r, len, seg), mat, x, y, z),
    cone: (p, r0, r1, len, mat, x, y, z) => add(p, cylGeo(r0, r1, len), mat, x, y, z),
    ball: (p, r, mat, x, y, z) => add(p, sphereGeo(r), mat, x, y, z),
    group: (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; },
    /** trigger guard: a loop from the frame (yTop) down and back to the grip */
    guard(p, zFront, zBack, yTop, yBottom, w = 0.008) {
      const len = zBack - zFront, h = yTop - yBottom;
      this.box(p, w, 0.008, len, 'metal', 0, yBottom + 0.004, (zFront + zBack) / 2); // bottom bar
      this.box(p, w, h, 0.008, 'metal', 0, yBottom + h / 2, zFront + 0.004); // front, up into the frame
    },
    /** picatinny rail: a strip with teeth */
    rail(p, len, x, y, z, w = 0.022) {
      this.box(p, w, 0.008, len, 'metal', x, y, z);
      const n = Math.max(2, Math.round(len / 0.024));
      for (let i = 0; i < n; i++) this.box(p, w + 0.004, 0.006, 0.012, 'metal', x, y + 0.006, z - len / 2 + (i + 0.5) * (len / n));
    },
  };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ the guns

function pistol(mats) {
  const k = kit(mats), g = new THREE.Group();
  const slide = k.group(g, 0, 0.024, -0.02);
  k.box(slide, 0.034, 0.04, 0.2, 'metalLight', 0, 0, 0);
  for (let i = 0; i < 5; i++) k.box(slide, 0.036, 0.03, 0.004, 'metal', 0, 0, 0.065 + i * 0.008); // serrations
  k.box(slide, 0.006, 0.012, 0.008, 'white', 0, 0.025, -0.088); // front sight dot
  k.box(slide, 0.026, 0.01, 0.01, 'metal', 0, 0.024, 0.085); // rear sight
  k.box(slide, 0.012, 0.008, 0.03, 'metal', 0.018, 0.006, -0.01); // ejection port
  k.box(g, 0.03, 0.028, 0.17, 'polymer', 0, -0.008, -0.015); // frame
  k.box(g, 0.024, 0.008, 0.06, 'polymer', 0, -0.025, -0.06); // accessory rail
  k.cyl(g, 0.007, 0.02, 'metal', 0, 0.022, -0.125);
  k.box(g, 0.032, 0.11, 0.05, 'polymer', 0, -0.075, 0.055, 0.2); // grip
  k.box(g, 0.034, 0.07, 0.035, 'polymerLight', 0, -0.07, 0.057, 0.2); // grip panels
  k.guard(g, -0.03, 0.04, -0.02, -0.05); // trigger guard
  k.box(g, 0.006, 0.02, 0.006, 'metal', 0, -0.03, 0.006, 0.3); // trigger
  const mag = k.group(g, 0, -0.08, 0.058);
  mag.rotation.x = 0.2;
  k.box(mag, 0.026, 0.1, 0.038, 'metal', 0, 0, 0);
  k.box(mag, 0.03, 0.01, 0.044, 'polymer', 0, -0.053, 0);
  return {
    group: g, parts: { slide, mag }, casing: 'brass',
    points: {
      muzzle: V(0, 0.024, -0.13), eject: V(0.02, 0.035, -0.02), sight: V(0, 0.0495, 0),
      grip: V(0, -0.075, 0.06), fore: V(-0.012, -0.11, 0.05), magwell: V(0, -0.08, 0.058), center: V(0, -0.02, 0),
    },
  };
}

function rifle(mats) {
  const k = kit(mats), g = new THREE.Group();
  k.box(g, 0.05, 0.05, 0.3, 'metalLight', 0, 0.015, -0.02); // upper receiver
  k.box(g, 0.046, 0.045, 0.2, 'metal', 0, -0.03, 0.02); // lower receiver
  k.box(g, 0.058, 0.058, 0.26, 'polymer', 0, 0.01, -0.3); // handguard
  for (let i = 0; i < 4; i++) {
    k.box(g, 0.06, 0.012, 0.03, 'polymerLight', 0, 0.01, -0.39 + i * 0.06); // vents
  }
  k.box(g, 0.061, 0.01, 0.07, 'orange', 0, 0.03, -0.205); // accent band
  k.rail(g, 0.52, 0, 0.047, -0.13);
  k.cyl(g, 0.011, 0.2, 'metal', 0, 0.012, -0.52);
  k.box(g, 0.028, 0.04, 0.03, 'metal', 0, 0.035, -0.45); // gas block / front sight base
  k.box(g, 0.005, 0.03, 0.008, 'metal', 0, 0.065, -0.45); // front post
  k.cyl(g, 0.017, 0.06, 'metal', 0, 0.012, -0.645, 8); // muzzle brake
  for (let i = 0; i < 3; i++) k.box(g, 0.036, 0.004, 0.006, 'polymer', 0, 0.012, -0.665 + i * 0.016);
  k.box(g, 0.03, 0.024, 0.03, 'metal', 0, 0.064, 0.09); // rear sight
  k.box(g, 0.006, 0.014, 0.012, 'metal', -0.009, 0.08, 0.09);
  k.box(g, 0.006, 0.014, 0.012, 'metal', 0.009, 0.08, 0.09);
  const charge = k.box(g, 0.03, 0.012, 0.02, 'metal', 0, 0.045, 0.14); // charging handle
  k.box(g, 0.014, 0.022, 0.03, 'metal', 0.03, 0.02, -0.02); // ejection port cover
  k.box(g, 0.03, 0.09, 0.045, 'polymer', 0, -0.085, 0.1, -0.3); // grip
  k.guard(g, 0.0, 0.085, -0.05, -0.078); // trigger guard
  k.cyl(g, 0.019, 0.14, 'metal', 0, -0.002, 0.17); // buffer tube
  k.box(g, 0.026, 0.03, 0.08, 'polymer', 0, -0.03, 0.2, -0.25); // stock web, tube to butt
  k.box(g, 0.042, 0.075, 0.18, 'polymer', 0, -0.012, 0.3);
  k.box(g, 0.044, 0.085, 0.02, 'polymerLight', 0, -0.014, 0.395);
  const mag = k.group(g, 0, -0.05, -0.06);
  k.box(mag, 0.03, 0.14, 0.06, 'metal', 0, -0.06, 0.008, 0.16); // one straight, slightly raked mag
  k.box(mag, 0.034, 0.012, 0.064, 'polymer', 0, -0.13, 0.019, 0.16); // floor plate
  return {
    group: g, parts: { mag, charge }, casing: 'brass',
    points: {
      muzzle: V(0, 0.012, -0.68), eject: V(0.035, 0.02, -0.02), sight: V(0, 0.083, 0),
      grip: V(0, -0.08, 0.11), fore: V(0, -0.02, -0.3), magwell: V(0, -0.05, -0.06), center: V(0, 0, -0.12),
    },
  };
}

function smg(mats) {
  const k = kit(mats), g = new THREE.Group();
  k.box(g, 0.05, 0.075, 0.28, 'polymerLight', 0, 0, -0.03); // receiver
  k.box(g, 0.052, 0.012, 0.1, 'cyan', 0, 0.02, -0.12); // accent
  k.rail(g, 0.22, 0, 0.044, -0.05, 0.02);
  k.box(g, 0.044, 0.05, 0.12, 'metal', 0, 0.006, -0.22); // barrel shroud
  k.cyl(g, 0.011, 0.06, 'metal', 0, 0.008, -0.3);
  k.cyl(g, 0.021, 0.14, 'metal', 0, 0.008, -0.39, 12); // suppressor
  k.cyl(g, 0.022, 0.01, 'polymer', 0, 0.008, -0.33, 12);
  k.box(g, 0.005, 0.024, 0.008, 'metal', 0, 0.062, -0.14); // front post
  k.box(g, 0.022, 0.018, 0.02, 'metal', 0, 0.058, 0.06); // rear sight
  k.box(g, 0.03, 0.085, 0.04, 'polymer', 0, -0.075, 0.07, -0.25); // grip
  k.box(g, 0.026, 0.055, 0.032, 'polymer', 0, -0.04, -0.19, 0.1); // fore grip, straight off the shroud
  k.guard(g, -0.01, 0.06, -0.037, -0.062); // trigger guard
  // folding stock: hinge block, a solid strut and a cheek bar, butt plate
  k.box(g, 0.04, 0.05, 0.03, 'metal', 0, -0.005, 0.12);
  k.box(g, 0.034, 0.018, 0.16, 'metal', 0, 0.012, 0.19); // top bar
  k.box(g, 0.03, 0.016, 0.17, 'metal', 0, -0.03, 0.19, 0.12); // lower strut
  k.box(g, 0.044, 0.075, 0.022, 'polymer', 0, -0.012, 0.275);
  k.box(g, 0.012, 0.02, 0.028, 'metal', 0.028, 0.02, -0.03); // ejection port
  const mag = k.group(g, 0, -0.05, -0.07);
  k.box(mag, 0.026, 0.16, 0.04, 'metal', 0, -0.06, 0, 0.06);
  k.box(mag, 0.03, 0.012, 0.044, 'polymer', 0, -0.142, 0.005, 0.06);
  return {
    group: g, parts: { mag }, casing: 'brass',
    points: {
      muzzle: V(0, 0.008, -0.465), eject: V(0.03, 0.02, -0.03), sight: V(0, 0.072, 0),
      grip: V(0, -0.072, 0.075), fore: V(0, -0.07, -0.19), magwell: V(0, -0.05, -0.07), center: V(0, 0, -0.08),
    },
  };
}

function shotgun(mats) {
  const k = kit(mats), g = new THREE.Group();
  k.box(g, 0.052, 0.075, 0.22, 'metal', 0, 0, 0.02); // receiver
  k.box(g, 0.014, 0.022, 0.05, 'polymer', 0.026, 0.012, 0.02); // ejection port
  for (let i = 0; i < 4; i++) k.cyl(g, 0.0085, 0.03, 'red', -0.031, 0.012 - i * 0.004, -0.04 + i * 0.02, 8); // side-saddle shells
  k.cyl(g, 0.017, 0.56, 'metal', 0, 0.022, -0.36);
  k.cyl(g, 0.015, 0.46, 'metalLight', 0, -0.016, -0.31); // tube magazine
  k.box(g, 0.006, 0.006, 0.006, 'white', 0, 0.043, -0.63); // bead sight
  k.box(g, 0.02, 0.01, 0.12, 'metal', 0, 0.042, 0.02); // receiver sight rib
  const pump = k.group(g, 0, -0.018, -0.3);
  k.box(pump, 0.058, 0.05, 0.16, 'wood', 0, 0, 0);
  for (let i = 0; i < 5; i++) k.box(pump, 0.06, 0.006, 0.012, 'woodDark', 0, -0.004, -0.06 + i * 0.03); // grooves
  k.box(g, 0.044, 0.07, 0.07, 'wood', 0, -0.02, 0.14); // stock wrist, butted against the receiver
  k.box(g, 0.036, 0.07, 0.05, 'wood', 0, -0.06, 0.16, -0.35); // grip
  k.box(g, 0.042, 0.07, 0.28, 'wood', 0, -0.04, 0.29, -0.12); // stock
  k.box(g, 0.044, 0.08, 0.02, 'polymer', 0, -0.06, 0.43, -0.12); // butt pad
  k.guard(g, 0.03, 0.12, -0.035, -0.062); // trigger guard
  return {
    group: g, parts: { pump }, casing: 'shell',
    points: {
      muzzle: V(0, 0.022, -0.64), eject: V(0.03, 0.02, 0.02), sight: V(0, 0.047, 0),
      grip: V(0, -0.065, 0.15), fore: V(0, -0.03, -0.3), magwell: V(0, -0.045, 0.0), center: V(0, 0, -0.12),
    },
  };
}

function sniper(mats) {
  const k = kit(mats), g = new THREE.Group();
  k.cyl(g, 0.022, 0.26, 'metal', 0, 0.012, 0.0, 12); // action
  // the stock is one piece: forend, body, wrist and butt all overlap
  k.box(g, 0.048, 0.05, 0.42, 'olive', 0, -0.014, -0.3); // forend
  k.box(g, 0.05, 0.08, 0.3, 'olive', 0, -0.026, 0.02); // body under the action
  k.box(g, 0.044, 0.062, 0.12, 'olive', 0, -0.038, 0.2); // wrist
  k.box(g, 0.044, 0.095, 0.2, 'olive', 0, -0.044, 0.33); // butt
  k.box(g, 0.04, 0.026, 0.13, 'tan', 0, 0.012, 0.31); // cheek rest, sitting on the butt
  k.box(g, 0.046, 0.1, 0.02, 'polymer', 0, -0.044, 0.44); // recoil pad
  k.cone(g, 0.015, 0.011, 0.74, 'metal', 0, 0.012, -0.49); // barrel, from the action to the brake
  k.box(g, 0.036, 0.036, 0.07, 'metal', 0, 0.012, -0.87); // muzzle brake
  for (let i = 0; i < 2; i++) k.box(g, 0.04, 0.03, 0.006, 'polymer', 0, 0.012, -0.88 + i * 0.022);
  // scope
  k.cyl(g, 0.018, 0.28, 'polymer', 0, 0.075, -0.02, 14);
  k.cone(g, 0.028, 0.018, 0.08, 'polymer', 0, 0.075, -0.2);
  k.cyl(g, 0.0275, 0.004, 'glass', 0, 0.075, -0.242, 14);
  k.cone(g, 0.018, 0.024, 0.06, 'polymer', 0, 0.075, 0.15);
  k.box(g, 0.016, 0.016, 0.02, 'metal', 0, 0.096, -0.02); // elevation turret
  k.box(g, 0.02, 0.016, 0.016, 'metal', 0.024, 0.075, -0.02); // windage turret
  k.box(g, 0.022, 0.034, 0.02, 'metal', 0, 0.048, -0.09); // rings
  k.box(g, 0.022, 0.034, 0.02, 'metal', 0, 0.048, 0.07);
  // folded bipod, tucked flat against the underside of the forend
  k.box(g, 0.03, 0.02, 0.03, 'metal', 0, -0.044, -0.48); // mount
  k.box(g, 0.008, 0.01, 0.2, 'metal', -0.012, -0.044, -0.37);
  k.box(g, 0.008, 0.01, 0.2, 'metal', 0.012, -0.044, -0.37);
  k.box(g, 0.032, 0.085, 0.045, 'olive', 0, -0.085, 0.15, -0.3); // grip, part of the stock
  k.guard(g, 0.04, 0.13, -0.066, -0.094);
  const bolt = k.group(g, 0.024, 0.012, 0.08);
  k.box(bolt, 0.04, 0.01, 0.01, 'metalLight', 0.02, 0, 0);
  k.ball(bolt, 0.012, 'metalLight', 0.042, 0, 0);
  const mag = k.group(g, 0, -0.07, -0.02);
  k.box(mag, 0.03, 0.05, 0.07, 'metal', 0, 0, 0);
  return {
    group: g, parts: { bolt, mag }, casing: 'brass',
    points: {
      muzzle: V(0, 0.012, -0.9), eject: V(0.03, 0.025, 0.04), sight: V(0, 0.075, 0),
      grip: V(0, -0.08, 0.14), fore: V(0, -0.04, -0.3), magwell: V(0, -0.07, -0.02), center: V(0, 0, -0.18),
    },
  };
}

function lmg(mats) {
  const k = kit(mats), g = new THREE.Group();
  k.box(g, 0.064, 0.09, 0.36, 'metal', 0, 0, 0); // receiver
  k.box(g, 0.066, 0.022, 0.2, 'metalLight', 0, 0.052, -0.02); // feed cover
  k.rail(g, 0.18, 0, 0.068, -0.02);
  k.box(g, 0.066, 0.012, 0.08, 'orange', 0, 0.02, -0.15);
  k.cyl(g, 0.024, 0.3, 'metalLight', 0, 0.012, -0.33, 12); // shroud
  for (let i = 0; i < 6; i++) k.box(g, 0.05, 0.012, 0.016, 'polymer', 0, 0.03, -0.44 + i * 0.045); // vent holes
  k.cyl(g, 0.013, 0.2, 'metal', 0, 0.012, -0.57);
  k.cyl(g, 0.019, 0.06, 'metal', 0, 0.012, -0.69, 8);
  k.box(g, 0.012, 0.05, 0.012, 'metal', 0, 0.06, -0.6); // front sight
  k.box(g, 0.016, 0.03, 0.016, 'metal', 0, 0.066, 0.14); // rear sight
  k.box(g, 0.012, 0.035, 0.012, 'metal', 0, 0.075, -0.24); // carry handle legs
  k.box(g, 0.012, 0.035, 0.012, 'metal', 0, 0.075, -0.12);
  k.box(g, 0.012, 0.012, 0.13, 'polymer', 0, 0.096, -0.18);
  // folded bipod, clamped to the shroud
  k.box(g, 0.05, 0.02, 0.03, 'metal', 0, -0.016, -0.47); // clamp
  k.box(g, 0.01, 0.012, 0.22, 'metal', -0.016, -0.018, -0.35);
  k.box(g, 0.01, 0.012, 0.22, 'metal', 0.016, -0.018, -0.35);
  k.box(g, 0.03, 0.09, 0.045, 'polymer', 0, -0.085, 0.12, -0.25); // grip
  k.guard(g, 0.02, 0.105, -0.045, -0.075);
  k.box(g, 0.046, 0.07, 0.24, 'polymer', 0, -0.012, 0.3);
  k.box(g, 0.048, 0.085, 0.02, 'polymerLight', 0, -0.014, 0.425);
  const mag = k.group(g, -0.015, -0.1, -0.05);
  k.box(mag, 0.09, 0.11, 0.12, 'olive', 0, 0, 0);
  k.box(mag, 0.092, 0.02, 0.122, 'tan', 0, 0.035, 0);
  for (let i = 0; i < 4; i++) k.box(mag, 0.012, 0.012, 0.02, 'brass', 0.04 + i * 0.002, 0.06 + i * 0.008, 0.0); // belt
  return {
    group: g, parts: { mag }, casing: 'brass',
    points: {
      muzzle: V(0, 0.012, -0.72), eject: V(0.035, -0.02, 0.0), sight: V(0, 0.081, 0),
      grip: V(0, -0.08, 0.12), fore: V(0, -0.015, -0.33), magwell: V(-0.015, -0.1, -0.05), center: V(0, 0, -0.14),
    },
  };
}

const BUILDERS = { pistol, rifle, smg, shotgun, sniper, lmg };

/** First-person gun: separate meshes so parts can move. */
export function buildGun(id, mats) {
  return BUILDERS[id](mats);
}

// ------------------------------------------------------------------ world (third-person) guns

const WORLD_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.25 });
const worldCache = new Map();
const _c = new THREE.Color();

/** Merge a gun into one vertex-coloured geometry (built once per gun and skin). */
function worldSpec(id, skin = 'none') {
  const cacheKey = `${id}|${skin}`;
  if (worldCache.has(cacheKey)) return worldCache.get(cacheKey);
  // record each part's colour through a throwaway material set (skins repaint the body parts)
  const mats = {};
  for (const [key, [color]] of Object.entries(PALETTE)) mats[key] = { color: new THREE.Color(skinColor(skin, key) || color) };
  LOW = true;
  let spec;
  try { spec = BUILDERS[id](mats); } finally { LOW = false; }
  spec.group.updateMatrixWorld(true);
  const geos = [];
  spec.group.traverse((o) => {
    if (!o.isMesh) return;
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    geo.applyMatrix4(o.matrixWorld);
    _c.copy(o.material.color);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(geo);
  });
  const out = { geometry: mergeGeometries(geos, false), points: spec.points };
  for (const g of geos) g.dispose();
  worldCache.set(cacheKey, out);
  return out;
}

/** A single-mesh copy of a gun (in a skin) for a character to hold or carry. */
export function worldGun(id, skin = 'none') {
  const spec = worldSpec(id, skin);
  const mesh = new THREE.Mesh(spec.geometry, WORLD_MAT);
  mesh.castShadow = true;
  mesh.userData.points = spec.points;
  return mesh;
}
