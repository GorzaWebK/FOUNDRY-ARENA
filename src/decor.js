// Set dressing: the detail that makes a block-out look like a place. Built from
// the map's solids and its `decor` theme, with no effect on play (nothing here
// collides except the corner drums, which world.js places and owns):
//
//   trims        a dark baseboard and a top cap on tall walls, and a band of the
//                map's accent colour at head height
//   edges        hazard stripes (or an accent strip) along raised walkway edges
//   pipes        runs of pipe with brackets high on long walls, where it's clear
//   cables       sagging cable runs below them
//   signs        stencilled plates, warning signs, neon: from the map's list
//   drums        the oil drums from world.props
//
// Everything is merged into a handful of meshes per material. Placement is
// deterministic (seeded by the map id), so every player sees the same dressing.
//
// map.decor = {
//   accent, trim, pipe, pipe2, cable,   colours (CSS strings)
//   hazard: true                         striped edges (else accent strips)
//   pipes, cables: true                  include them
//   neon: true                           signs glow (unlit)
//   signs: [[text, style], ...]          style: stencil | hazard | plate | neon
//   barrels: 8, barrelColors: [...]      corner drums (placed by world.js)
// }

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const STEP = 1; // wall cells are about a metre long

export function buildDecor(world, scene) {
  const map = world.map, th = map.decor;
  if (!th) return [];
  let seed = 7;
  for (const ch of map.id) seed = (Math.imul(seed ^ ch.charCodeAt(0), 2654435761) + 3) >>> 0;
  const rand = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
  const b = world.bounds;
  const geos = new Map(); // key -> [geometry]
  const add = (key, g) => { if (!geos.has(key)) geos.set(key, []); geos.get(key).push(g); };

  const faces = [];
  for (const s of map.solids) {
    if (s.type !== 'box') continue;
    const [x0, y0, z0] = s.min, [x1, y1, z1] = s.max;
    const h = y1 - y0;
    if (h >= 2.5) {
      faces.push({ axis: 'x', f: x0, n: -1, a0: z0, a1: z1, y0, y1 });
      faces.push({ axis: 'x', f: x1, n: 1, a0: z0, a1: z1, y0, y1 });
      faces.push({ axis: 'z', f: z0, n: -1, a0: x0, a1: x1, y0, y1 });
      faces.push({ axis: 'z', f: z1, n: 1, a0: x0, a1: x1, y0, y1 });
    }
  }

  // a box in front of a face: along a0..a1, out d0..d1, up y0..y1, as world coordinates
  const front = (F, a0, a1, d0, d1, y0, y1) => {
    const p0 = F.f + F.n * d0, p1 = F.f + F.n * d1;
    const lo = Math.min(p0, p1), hi = Math.max(p0, p1);
    return F.axis === 'x' ? [lo, y0, a0, hi, y1, a1] : [a0, y0, lo, a1, y1, hi];
  };
  const inside = (bx) => bx[0] >= b.minX - 0.01 && bx[3] <= b.maxX + 0.01 && bx[2] >= b.minZ - 0.01 && bx[5] <= b.maxZ + 0.01;
  const clear = (bx) => inside(bx) && !world.blocked(...bx);
  // the face's cells (along), each marked clear or not for a test at height y..y+hh, out to depth dd
  const cells = (F, y, hh, dd) => {
    const len = F.a1 - F.a0, n = Math.max(1, Math.round(len / STEP)), c = len / n;
    const out = [];
    for (let i = 0; i < n; i++) {
      const a0 = F.a0 + i * c, a1 = a0 + c;
      out.push({ a0, a1, ok: clear(front(F, a0 + 0.04, a1 - 0.04, 0.04, dd, y, y + hh)) });
    }
    return out;
  };
  // runs of consecutive clear cells: [[a0, a1], ...]
  const runs = (cs) => {
    const out = [];
    let start = null, end = 0;
    for (const c of cs) {
      if (c.ok) { if (start === null) start = c.a0; end = c.a1; }
      else if (start !== null) { out.push([start, end]); start = null; }
    }
    if (start !== null) out.push([start, end]);
    return out;
  };

  const boxAt = (key, bx) => {
    const g = new THREE.BoxGeometry(bx[3] - bx[0], bx[4] - bx[1], bx[5] - bx[2]);
    g.translate((bx[0] + bx[3]) / 2, (bx[1] + bx[4]) / 2, (bx[2] + bx[5]) / 2);
    add(key, g);
  };
  const rotFor = (F) => (F.axis === 'x' ? (F.n > 0 ? Math.PI / 2 : -Math.PI / 2) : F.n > 0 ? 0 : Math.PI);
  // a flat strip on the face (for textured trims): length along, height, centre
  const plane = (key, F, a0, a1, y0, y1, d, uScale = 0) => {
    const len = a1 - a0, hh = y1 - y0;
    const g = new THREE.PlaneGeometry(len, hh);
    if (uScale) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / uScale); }
    g.rotateY(rotFor(F));
    const am = (a0 + a1) / 2, p = F.f + F.n * d;
    if (F.axis === 'x') g.translate(p, (y0 + y1) / 2, am); else g.translate(am, (y0 + y1) / 2, p);
    add(key, g);
  };
  // a pipe along a face: from a0 to a1 at height y, out d
  const pipe = (key, F, a0, a1, y, d, r) => {
    const g = new THREE.CylinderGeometry(r, r, a1 - a0, 10, 1, false);
    const am = (a0 + a1) / 2, p = F.f + F.n * d;
    if (F.axis === 'x') { g.rotateX(Math.PI / 2); g.translate(p, y, am); } else { g.rotateZ(Math.PI / 2); g.translate(am, y, p); }
    add(key, g);
  };
  // a short pipe straight out of the wall (where a run turns into it)
  const stub = (key, F, a, y, d, r) => {
    const g = new THREE.CylinderGeometry(r, r, d, 10);
    const p = F.f + F.n * d / 2;
    if (F.axis === 'x') { g.rotateZ(Math.PI / 2); g.translate(p, y, a); } else { g.rotateX(Math.PI / 2); g.translate(a, y, p); }
    add(key, g);
  };
  const toWorld = (F, a, d, y) => (F.axis === 'x' ? new THREE.Vector3(F.f + F.n * d, y, a) : new THREE.Vector3(a, y, F.f + F.n * d));

  const signs = [];
  let signIdx = Math.floor(rand() * 7);

  for (const F of faces) {
    const h = F.y1 - F.y0, len = F.a1 - F.a0;
    // it must stand on something (not a slab end hanging in the air)
    // ---- baseboard
    for (const [a0, a1] of runs(cells(F, F.y0 + 0.05, 0.2, 0.3))) boxAt('trim', front(F, a0, a1, 0, 0.06, F.y0, F.y0 + 0.22));
    // ---- top cap
    if (h < 9) for (const [a0, a1] of runs(cells(F, F.y1 - 0.2, 0.15, 0.3))) boxAt('trim', front(F, a0 - 0.0, a1, 0, 0.08, F.y1 - 0.16, F.y1));
    // ---- accent band at head height
    if (h >= 4.5 && len >= 4) for (const [a0, a1] of runs(cells(F, F.y0 + 2.3, 0.15, 0.3))) boxAt('accent', front(F, a0, a1, 0, 0.03, F.y0 + 2.34, F.y0 + 2.41));

    // ---- pipes (long, tall walls; not every one)
    let pipeY = 0;
    if (th.pipes && h >= 4.2 && len >= 6 && rand() < 0.75) {
      pipeY = F.y0 + Math.min(h - 0.7, 3.9);
      // clear for the pipe and for anyone standing under it
      for (const [a0, a1] of runs(cells(F, pipeY - 2.4, 2.85, 0.6))) {
        if (a1 - a0 < 3) continue;
        const e0 = a0 + 0.3, e1 = a1 - 0.3;
        pipe('pipe', F, e0, e1, pipeY, 0.3, 0.13);
        stub('pipe', F, e0, pipeY, 0.3, 0.13);
        stub('pipe', F, e1, pipeY, 0.3, 0.13);
        const two = h >= 4.8;
        if (two) { pipe('pipe2', F, e0 + 0.4, e1 - 0.4, pipeY + 0.34, 0.2, 0.075); stub('pipe2', F, e0 + 0.4, pipeY + 0.34, 0.2, 0.075); stub('pipe2', F, e1 - 0.4, pipeY + 0.34, 0.2, 0.075); }
        // brackets
        const n = Math.max(1, Math.round((e1 - e0) / 3));
        for (let i = 0; i <= n; i++) {
          const a = e0 + ((e1 - e0) * i) / n;
          boxAt('bracket', front(F, a - 0.05, a + 0.05, 0, 0.45, pipeY - 0.18, pipeY - 0.12));
          if (two) boxAt('bracket', front(F, a - 0.04, a + 0.04, 0, 0.3, pipeY + 0.24, pipeY + 0.28));
        }
        // a valve wheel now and then
        if (e1 - e0 > 5 && rand() < 0.6) {
          const a = e0 + 1 + rand() * (e1 - e0 - 2);
          const g = new THREE.TorusGeometry(0.16, 0.025, 6, 16);
          g.rotateY(rotFor(F));
          const p = toWorld(F, a, 0.46, pipeY);
          g.translate(p.x, p.y, p.z);
          add('accent', g);
          stub('bracket', F, a, pipeY, 0.46, 0.025);
        }
      }
    }

    // ---- cable runs
    if (th.cables && h >= 3.6 && len >= 5 && rand() < 0.6) {
      const cy = pipeY ? pipeY - 0.45 : F.y0 + Math.min(h - 0.5, 3.3);
      for (const [a0, a1] of runs(cells(F, cy - 2.1, 2.4, 0.4))) {
        if (a1 - a0 < 3) continue;
        const n = Math.max(1, Math.round((a1 - a0 - 0.4) / 2.6));
        for (const [off, sag, r] of [[0.1, 0.28, 0.022], [0.16, 0.2, 0.016]]) {
          for (let i = 0; i < n; i++) {
            const s0 = a0 + 0.2 + ((a1 - a0 - 0.4) * i) / n, s1 = a0 + 0.2 + ((a1 - a0 - 0.4) * (i + 1)) / n;
            const pts = [];
            for (let k = 0; k <= 10; k++) {
              const t = k / 10;
              pts.push(toWorld(F, s0 + (s1 - s0) * t, off, cy - sag * 4 * t * (1 - t)));
            }
            add('cable', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, r, 4, false));
          }
        }
        for (let i = 0; i <= n; i++) {
          const a = a0 + 0.2 + ((a1 - a0 - 0.4) * i) / n;
          boxAt('bracket', front(F, a - 0.05, a + 0.05, 0, 0.2, cy - 0.05, cy + 0.05));
        }
      }
    }

    // ---- signs
    if (th.signs && th.signs.length && h >= 3 && len >= 4) {
      const sy = F.y0 + 2.75, w = 1.7, hh = 0.85;
      for (const [a0, a1] of runs(cells(F, sy - hh / 2, hh, 0.25))) {
        if (a1 - a0 < w + 1) continue;
        const a = a0 + (a1 - a0) * (0.3 + rand() * 0.4);
        const p = toWorld(F, a, 0.04, sy);
        if (signs.some((s) => s.distanceTo(p) < 15)) continue;
        if (rand() < 0.35) continue;
        signs.push(p);
        const [text, style] = th.signs[signIdx++ % th.signs.length];
        plane(`sign:${text}|${style}`, F, a - w / 2, a + w / 2, sy - hh / 2, sy + hh / 2, 0.04);
        boxAt('trim', front(F, a - w / 2 - 0.04, a + w / 2 + 0.04, 0, 0.035, sy - hh / 2 - 0.04, sy + hh / 2 + 0.04));
      }
    }
  }

  // ---- raised walkway edges: hazard stripes (or an accent strip) on the slab sides
  for (const s of map.solids) {
    if (s.type !== 'box') continue;
    const [x0, y0, z0] = s.min, [x1, y1, z1] = s.max;
    const h = y1 - y0;
    if (h > 0.9 || y0 < 0.9 || (x1 - x0) * (z1 - z0) < 4) continue;
    const sides = [
      { axis: 'x', f: x0, n: -1, a0: z0, a1: z1, y0, y1 }, { axis: 'x', f: x1, n: 1, a0: z0, a1: z1, y0, y1 },
      { axis: 'z', f: z0, n: -1, a0: x0, a1: x1, y0, y1 }, { axis: 'z', f: z1, n: 1, a0: x0, a1: x1, y0, y1 },
    ];
    for (const F of sides) {
      // only edges with a drop under them (walkways), not roofs capping a wall
      const under = cells(F, Math.max(0.1, y0 - 1.2), 1.0, 0.25);
      const side = cells(F, y0 + 0.05, h - 0.1, 0.25).map((c, i) => ({ ...c, ok: c.ok && under[i].ok }));
      for (const [a0, a1] of runs(side)) {
        if (a1 - a0 < 1.5) continue;
        if (th.hazard) plane('hazard', F, a0, a1, y1 - Math.min(h, 0.3), y1, 0.012, 0.9);
        else boxAt('accent', front(F, a0, a1, 0, 0.02, y1 - 0.09, y1 - 0.02));
      }
    }
  }

  // ---- drums
  const drumCols = th.barrelColors || ['#8c3a2b', '#2f5e8f', '#5b6b3a'];
  for (const p of world.props || []) {
    if (p.kind !== 'barrel') continue;
    const key = `drum:${Math.floor(p.v * drumCols.length)}`;
    const body = new THREE.CylinderGeometry(p.r, p.r, p.h - 0.04, 16);
    body.translate(p.x, p.y + p.h / 2, p.z);
    add(key, body);
    for (const f of [0.3, 0.7]) {
      const rib = new THREE.TorusGeometry(p.r + 0.005, 0.018, 4, 18);
      rib.rotateX(Math.PI / 2);
      rib.translate(p.x, p.y + p.h * f, p.z);
      add('bracket', rib);
    }
    const lid = new THREE.CylinderGeometry(p.r - 0.02, p.r - 0.02, 0.03, 16);
    lid.translate(p.x, p.y + p.h - 0.015, p.z);
    add('trim', lid);
    const cap = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8);
    cap.translate(p.x + Math.cos(p.spin) * 0.2, p.y + p.h + 0.005, p.z + Math.sin(p.spin) * 0.2);
    add('bracket', cap);
  }

  // ---- merge into meshes
  const meshes = [];
  const col = (c, d) => new THREE.Color(c || d);
  for (const [key, list] of geos) {
    const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    for (const g of list) g.dispose();
    let mat, cast = false;
    if (key === 'trim') mat = new THREE.MeshLambertMaterial({ color: col(th.trim, '#2a2e33') });
    else if (key === 'accent') mat = new THREE.MeshLambertMaterial({ color: col(th.accent, '#ff6b1a'), emissive: col(th.accent, '#ff6b1a'), emissiveIntensity: 0.07 });
    else if (key === 'pipe') { mat = new THREE.MeshStandardMaterial({ color: col(th.pipe, '#7a828c'), metalness: 0.55, roughness: 0.45 }); cast = true; }
    else if (key === 'pipe2') { mat = new THREE.MeshStandardMaterial({ color: col(th.pipe2 || th.accent, '#b8503a'), metalness: 0.4, roughness: 0.5 }); cast = true; }
    else if (key === 'bracket') mat = new THREE.MeshLambertMaterial({ color: col(th.bracket, '#3a3f45') });
    else if (key === 'cable') mat = new THREE.MeshLambertMaterial({ color: col(th.cable, '#17191c') });
    else if (key === 'hazard') mat = new THREE.MeshLambertMaterial({ map: hazardTexture(), polygonOffset: true, polygonOffsetFactor: -1 });
    else if (key.startsWith('drum:')) { mat = new THREE.MeshStandardMaterial({ color: col(drumCols[+key.slice(5)]), metalness: 0.3, roughness: 0.6, map: drumTexture() }); cast = true; }
    else if (key.startsWith('sign:')) {
      const [text, style] = key.slice(5).split('|');
      const tex = signTexture(text, style, th.accent || '#ff6b1a');
      mat = style === 'neon' ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }) : new THREE.MeshLambertMaterial({ map: tex });
    } else mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'decor:' + key;
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

// ---------------------------------------------------------------- textures

let hazardTex = null;
function hazardTexture() {
  if (hazardTex) return hazardTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#f2b417';
  x.fillRect(0, 0, 128, 32);
  x.fillStyle = '#16181b';
  for (let i = -2; i < 6; i++) {
    x.beginPath();
    x.moveTo(i * 32, 32); x.lineTo(i * 32 + 16, 32); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0);
    x.closePath(); x.fill();
  }
  // wear
  for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(60,50,40,${Math.random() * 0.25})`; x.fillRect(Math.random() * 128, Math.random() * 32, 1 + Math.random() * 2, 1); }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.wrapS = THREE.RepeatWrapping;
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  hazardTex.anisotropy = 4;
  return hazardTex;
}

let drumTex = null;
function drumTexture() {
  if (drumTex) return drumTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#e8e8e8';
  x.fillRect(0, 0, 128, 64);
  // a label band and some scuffs
  x.fillStyle = '#f4f1e6';
  x.fillRect(20, 24, 40, 16);
  x.fillStyle = '#222';
  x.fillRect(24, 28, 32, 3); x.fillRect(24, 34, 22, 2);
  for (let i = 0; i < 400; i++) { const v = Math.random() < 0.5 ? 0 : 255; x.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.12})`; x.fillRect(Math.random() * 128, Math.random() * 64, 1 + Math.random() * 3, 1 + Math.random() * 2); }
  for (let i = 0; i < 6; i++) { x.fillStyle = `rgba(80,40,10,${0.08 + Math.random() * 0.1})`; x.fillRect(Math.random() * 128, 0, 2 + Math.random() * 3, 20 + Math.random() * 44); }
  drumTex = new THREE.CanvasTexture(c);
  drumTex.colorSpace = THREE.SRGBColorSpace;
  return drumTex;
}

const signCache = new Map();
const pendingSigns = [];
let fontsHooked = false;

function signTexture(text, style, accent) {
  const k = `${text}|${style}|${accent}`;
  if (signCache.has(k)) return signCache.get(k);
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => { drawSign(c.getContext('2d'), text, style, accent); tex.needsUpdate = true; };
  draw();
  signCache.set(k, tex);
  // the stencil font may still be loading: draw again once it's here
  pendingSigns.push(draw);
  if (!fontsHooked && document.fonts && document.fonts.load) {
    fontsHooked = true;
    Promise.all([document.fonts.load('400 120px "Saira Stencil One"'), document.fonts.load('800 120px "Barlow Condensed"')])
      .then(() => { for (const d of pendingSigns) d(); })
      .catch(() => {});
  } else if (fontsHooked && document.fonts && document.fonts.status === 'loaded') setTimeout(draw, 0);
  return tex;
}

function drawSign(x, text, style, accent) {
  const W = 512, H = 256;
  const lines = text.split('\n');
  const fit = (font, maxW, size) => {
    let s = size;
    for (; s > 20; s -= 4) { x.font = font.replace('#', s); if (Math.max(...lines.map((l) => x.measureText(l).width)) <= maxW) break; }
    return s;
  };
  const writeLines = (font, size, cx, cy, maxW) => {
    const s = fit(font, maxW, size);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    lines.forEach((l, i) => x.fillText(l, cx, cy + (i - (lines.length - 1) / 2) * s * 0.95));
  };
  const grime = (n, a) => { for (let i = 0; i < n; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * a})`; x.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 6, 1 + Math.random() * 3); } };
  x.clearRect(0, 0, W, H);
  if (style === 'hazard') {
    x.fillStyle = '#f2b417'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#16181b'; x.lineWidth = 12; x.strokeRect(14, 14, W - 28, H - 28);
    // warning triangle
    x.fillStyle = '#16181b';
    x.beginPath(); x.moveTo(100, 50); x.lineTo(170, 200); x.lineTo(30, 200); x.closePath(); x.fill();
    x.fillStyle = '#f2b417';
    x.fillRect(94, 95, 12, 60); x.fillRect(94, 167, 12, 14);
    x.fillStyle = '#16181b';
    writeLines('800 #px "Barlow Condensed", sans-serif', 84, 340, 128, 290);
    grime(160, 0.25);
  } else if (style === 'plate') {
    x.fillStyle = '#ddd8cc'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#2a2e33'; x.lineWidth = 8; x.strokeRect(12, 12, W - 24, H - 24);
    x.fillStyle = '#23272c';
    writeLines('800 #px "Barlow Condensed", sans-serif', 110, W / 2, H / 2 + 4, W - 70);
    for (const [px, py] of [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]]) { x.fillStyle = '#7d7a72'; x.beginPath(); x.arc(px, py, 6, 0, Math.PI * 2); x.fill(); }
    grime(200, 0.18);
  } else if (style === 'neon') {
    x.fillStyle = '#0d0b10'; x.fillRect(0, 0, W, H);
    x.strokeStyle = accent; x.lineWidth = 6; x.shadowColor = accent; x.shadowBlur = 24;
    x.strokeRect(20, 20, W - 40, H - 40);
    x.fillStyle = '#fff4ec';
    writeLines('800 #px "Barlow Condensed", sans-serif', 130, W / 2, H / 2 + 4, W - 90);
    x.shadowBlur = 0;
  } else {
    // stencil: dark plate, accent edge, stencilled lettering
    x.fillStyle = '#1b1f24'; x.fillRect(0, 0, W, H);
    x.fillStyle = accent; x.fillRect(0, 0, W, 16); x.fillRect(0, H - 16, W, 16);
    x.fillStyle = '#e9e4da';
    writeLines('400 #px "Saira Stencil One", "Barlow Condensed", sans-serif', 120, W / 2, H / 2 + 4, W - 70);
    grime(260, 0.3);
  }
}
