// Little pictures of cosmetics for the Customize screen. Gear (helmets, armour,
// shoulder pads), charms, knives and grenades are rendered from the same 3D
// models the game uses, on a small offscreen renderer; tracers, kill effects and
// crosshair shapes are drawn in 2D. Each picture is made once and cached.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BotModel } from './botModel.js';
import { buildCharm, buildKnife } from './viewmodel.js';
import { itemOf } from './cosmetics.js';

const W = 192, H = 128;
const cache = new Map();
let R = null; // { renderer, scene, camera }

function rig() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  // a soft studio environment so metal looks like metal, not black
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4a4540, 1.2));
  const key = new THREE.DirectionalLight(0xfff2d6, 2.4);
  key.position.set(-1.5, 2, -2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff9a4a, 1.2);
  rim.position.set(2, 1, 1.5);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.005, 20);
  R = { renderer, scene, camera };
  return R;
}

/** Render `obj` from `from` looking at `at`, return a data URL, and clean up. */
function shoot(obj, from, at, fov = 30) {
  const { renderer, scene, camera } = rig();
  scene.add(obj);
  camera.fov = fov;
  camera.position.set(...from);
  camera.lookAt(...at);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(obj);
  // (geometry and materials are left alone: the game's models share some of them;
  // each picture is only made once, so there's nothing to pile up)
  return url;
}

/** A crew member's upper body wearing one piece of gear. */
function gear(slot, id, color) {
  const bot = new BotModel('', color);
  const eq = { helmet: 'none', shoulders: 'none', armour: 'none' };
  eq[slot] = id;
  bot.setLook(eq);
  bot.tag.visible = false;
  bot.group.rotation.y = Math.PI + (slot === 'shoulders' ? 0.3 : 0.55); // three-quarter view from the front
  // the model faces -z; the camera stands in front of it
  if (slot === 'helmet') return shoot(bot.group, [0, 1.9, 1.3], [0, 1.76, 0], 30);
  if (slot === 'shoulders') return shoot(bot.group, [0, 2.15, 1.35], [0, 1.5, 0], 34);
  return shoot(bot.group, [0, 1.6, 1.5], [0, 1.32, 0], 32); // armour
}

function charm(id) {
  const g = buildCharm(id);
  g.rotation.y = -0.6;
  g.scale.setScalar(2.2);
  return shoot(g, [0, -0.07, 0.2], [0, -0.075, 0], 30);
}

function knife(item) {
  const g = buildKnife();
  const { blade, handle } = g.userData;
  blade.color.set(item.blade);
  handle.color.set(item.handle);
  if (item.glow) { blade.emissive.set(item.blade); blade.emissiveIntensity = 0.8; }
  // just the knife, not the glove and sleeve it's held in
  g.children.forEach((c, i) => { if (i >= 4) c.visible = false; });
  g.rotation.set(0.15, Math.PI / 2, -0.35);
  return shoot(g, [0, 0, 0.46], [0, 0, 0], 30);
}

function grenade(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: color === 0xc8d0d8 ? 0.85 : 0.15, flatShading: true }));
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.4, metalness: 0.8 });
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.05, 10), metal);
  fuse.position.y = 0.12;
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.15, 0.012), metal);
  spoon.position.set(0.05, 0.07, 0.08); spoon.rotation.z = -0.35;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 18), metal);
  ring.position.set(-0.05, 0.15, 0); ring.rotation.y = Math.PI / 2;
  g.add(body, fuse, spoon, ring);
  g.rotation.set(0.2, 0.6, 0);
  return shoot(g, [0, 0.03, 0.62], [0, 0.03, 0], 32);
}

// ---------------------------------------------------------------- 2D

function canvas2d(draw) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  draw(c.getContext('2d'));
  return c.toDataURL('image/png');
}

const css = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0').slice(-6);

function tracer(color) {
  return canvas2d((x) => {
    x.fillStyle = '#14181c'; x.fillRect(0, 0, W, H);
    // three rounds streaking across, a bright head and a fading tail
    for (const [y, len, off] of [[38, 110, 20], [66, 150, 0], [94, 90, 60]]) {
      const g = x.createLinearGradient(off, 0, off + len, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, css(color));
      x.strokeStyle = g; x.lineWidth = 3; x.lineCap = 'round';
      x.shadowColor = css(color); x.shadowBlur = 10;
      x.beginPath(); x.moveTo(off, y); x.lineTo(off + len, y - len * 0.08); x.stroke();
      x.fillStyle = '#fff';
      x.beginPath(); x.arc(off + len, y - len * 0.08, 2.5, 0, 7); x.fill();
    }
  });
}

function killfx(id) {
  return canvas2d((x) => {
    x.fillStyle = '#14181c'; x.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + 6;
    // the usual burst everyone has
    const g = x.createRadialGradient(cx, cy, 2, cx, cy, 34);
    g.addColorStop(0, 'rgba(255,220,180,0.9)'); g.addColorStop(0.4, 'rgba(255,120,60,0.45)'); g.addColorStop(1, 'rgba(255,90,40,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 34, 0, 7); x.fill();
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (id === 'sparks') {
      x.shadowColor = '#ffe2a0'; x.shadowBlur = 8; x.lineCap = 'round';
      for (let i = 0; i < 22; i++) {
        const a = rnd() * Math.PI * 2, r0 = 14 + rnd() * 10, r1 = r0 + 16 + rnd() * 30;
        x.strokeStyle = i % 2 ? '#fff0b0' : '#ffffff'; x.lineWidth = 2;
        x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.8); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.8); x.stroke();
      }
    } else if (id === 'pixels') {
      const cols = ['#4fe3ff', '#ff5cf0', '#5dff9a', '#ffd24d'];
      for (let i = 0; i < 26; i++) {
        const a = rnd() * Math.PI * 2, r = 10 + rnd() * 48, s = 5 + rnd() * 6;
        x.fillStyle = cols[i % 4];
        x.fillRect(Math.round(cx + Math.cos(a) * r - s / 2), Math.round(cy + Math.sin(a) * r * 0.75 - s / 2 - 8), s, s);
      }
    } else if (id === 'confetti') {
      const cols = ['#ff4d4d', '#ffd24d', '#4fc3f7', '#5dff9a', '#ff5cf0', '#ffffff'];
      for (let i = 0; i < 34; i++) {
        const px = 20 + rnd() * (W - 40), py = 10 + rnd() * (H - 30);
        x.save(); x.translate(px, py); x.rotate(rnd() * Math.PI);
        x.fillStyle = cols[i % cols.length]; x.fillRect(-4, -1.5, 8, 3);
        x.restore();
      }
    } else {
      x.fillStyle = 'rgba(233,228,218,0.65)'; x.font = '700 13px "Barlow Condensed", sans-serif'; x.textAlign = 'center';
      x.fillText('STANDARD BURST', cx, H - 12);
    }
  });
}

function crosshair(id, color) {
  return canvas2d((x) => {
    x.fillStyle = '#14181c'; x.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, c = color || '#7dff8a';
    x.strokeStyle = c; x.fillStyle = c; x.lineWidth = 3; x.lineCap = 'butt';
    x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = 2;
    const line = (x0, y0, x1, y1) => { x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); };
    const g = 7, l = 16;
    if (id === 'cross' || id === 'tee') {
      if (id === 'cross') line(cx, cy - g, cx, cy - g - l);
      line(cx, cy + g, cx, cy + g + l); line(cx - g, cy, cx - g - l, cy); line(cx + g, cy, cx + g + l, cy);
      x.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    } else if (id === 'dot') {
      x.beginPath(); x.arc(cx, cy, 4, 0, 7); x.fill();
    } else if (id === 'circle') {
      x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.stroke();
      x.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    } else if (id === 'chevron') {
      x.lineWidth = 3; x.beginPath(); x.moveTo(cx - 14, cy + 10); x.lineTo(cx, cy - 2); x.lineTo(cx + 14, cy + 10); x.stroke();
      x.fillRect(cx - 1.5, cy - 9, 3, 3);
    }
  });
}

/**
 * A preview image (data URL) for an item, or null if this slot uses a plain
 * swatch instead. `ctx`: { color (the player's colour), xhColor }.
 */
export function previewFor(slot, id, ctx = {}) {
  const key = `${slot}:${id}:${ctx.color || 0}:${slot === 'xhShape' ? ctx.xhColor : ''}`;
  if (cache.has(key)) return cache.get(key);
  let url = null;
  try {
    const item = itemOf(slot, id);
    if (slot === 'helmet' || slot === 'armour' || slot === 'shoulders') url = gear(slot, id, ctx.color || 0xff6b1a);
    else if (slot === 'charm') url = id === 'none' ? null : charm(id);
    else if (slot === 'knife') url = knife(item);
    else if (slot === 'nade') url = grenade(item.color);
    else if (slot === 'tracer') url = tracer(item.color);
    else if (slot === 'killfx') url = killfx(id);
    else if (slot === 'xhShape') url = crosshair(id, ctx.xhColor);
  } catch (e) {
    console.warn('No preview for', slot, id, e);
  }
  cache.set(key, url);
  return url;
}

/** Slots that get a picture (taller tiles in Customize). */
export const PREVIEW_SLOTS = new Set(['helmet', 'armour', 'shoulders', 'charm', 'knife', 'nade', 'tracer', 'killfx', 'xhShape']);
