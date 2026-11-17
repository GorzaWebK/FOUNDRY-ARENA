// Turns the world's render items into a handful of merged meshes, and builds
// the sky + lighting.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTexture } from './textures.js';

function shade(geo, y0, y1, tint) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const span = Math.max(0.001, y1 - y0);
  for (let i = 0; i < pos.count; i++) {
    // darker towards the base of tall things: cheap fake ambient occlusion
    const t = (pos.getY(i) - y0) / span;
    const v = (0.72 + 0.28 * Math.min(1, t * (span > 1.5 ? 1 : 1.6))) * tint;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

function boxGeo(it, def) {
  const w = it.x1 - it.x0, h = it.y1 - it.y0, d = it.z1 - it.z0;
  const geo = new THREE.BoxGeometry(w, h, d);
  if (def.scale) {
    const uv = geo.attributes.uv;
    const s = def.scale;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / s, (uv.getY(i) * dims[f][1]) / s);
      }
    }
  }
  geo.translate((it.x0 + it.x1) / 2, (it.y0 + it.y1) / 2, (it.z0 + it.z1) / 2);
  const out = geo.toNonIndexed();
  shade(out, it.y0, it.y1, h <= 1.01 && it.y0 < 0 ? 1 : 0.94 + Math.random() * 0.12);
  return out;
}

function wedgeGeo(it, def) {
  const alongX = it.dir === '+x' || it.dir === '-x';
  const run = alongX ? it.x1 - it.x0 : it.z1 - it.z0;
  const width = alongX ? it.z1 - it.z0 : it.x1 - it.x0;
  const rise = it.y1 - it.y0;
  const s = def.scale || 2;
  const A0 = [0, 0, 0], B0 = [run, 0, 0], C0 = [run, rise, 0];
  const A1 = [0, 0, width], B1 = [run, 0, width], C1 = [run, rise, width];
  const slope = Math.hypot(run, rise);
  const pos = [], nor = [], uvs = [];
  const tri = (a, b, c, n, ua, ub, uc) => {
    // make winding agree with the intended normal
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) { const t = b; b = c; c = t; const u = ub; ub = uc; uc = u; }
    pos.push(...a, ...b, ...c);
    nor.push(...n, ...n, ...n);
    uvs.push(ua[0] / s, ua[1] / s, ub[0] / s, ub[1] / s, uc[0] / s, uc[1] / s);
  };
  const quad = (a, b, c, d, n, ua, ub, uc, ud) => { tri(a, b, c, n, ua, ub, uc); tri(a, c, d, n, ua, uc, ud); };
  const nl = Math.hypot(rise, run);
  quad(A0, A1, C1, C0, [-rise / nl, run / nl, 0], [0, 0], [width, 0], [width, slope], [0, slope]);
  quad(A0, B0, B1, A1, [0, -1, 0], [0, 0], [run, 0], [run, width], [0, width]);
  quad(B0, C0, C1, B1, [1, 0, 0], [0, 0], [0, rise], [width, rise], [width, 0]);
  tri(A0, C0, B0, [0, 0, -1], [0, 0], [run, rise], [run, 0]);
  tri(A1, B1, C1, [0, 0, 1], [0, 0], [run, 0], [run, rise]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = new THREE.Matrix4();
  if (it.dir === '+x') m.makeTranslation(it.x0, it.y0, it.z0);
  else if (it.dir === '-x') m.makeRotationY(Math.PI).setPosition(it.x1, it.y0, it.z1);
  else if (it.dir === '+z') m.makeRotationY(-Math.PI / 2).setPosition(it.x1, it.y0, it.z0);
  else m.makeRotationY(Math.PI / 2).setPosition(it.x0, it.y0, it.z1);
  geo.applyMatrix4(m);
  shade(geo, it.y0, it.y1, 1);
  return geo;
}

export function buildWorldMeshes(world, scene) {
  const groups = new Map();
  for (const it of world.renderItems) {
    const def = world.map.materials[it.mat] || { color: '#999999' };
    const geo = it.kind === 'box' ? boxGeo(it, def) : wedgeGeo(it, def);
    if (!groups.has(it.mat)) groups.set(it.mat, { def, geos: [] });
    groups.get(it.mat).geos.push(geo);
  }
  const meshes = [];
  for (const [name, { def, geos }] of groups) {
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(def.color),
      map: def.tex ? getTexture(def.tex) : null,
      vertexColors: true,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'world:' + name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

export function buildSky(scene, sky) {
  const sun = new THREE.Vector3(...sky.sunDir).normalize();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(sky.top) },
      horizon: { value: new THREE.Color(sky.horizon) },
      sunDir: { value: sun },
      sunColor: { value: new THREE.Color(sky.sunColor) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      float fbm(vec2 p) { return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15; }
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        col = mix(col, horizon * 0.82, clamp(-d.y * 3.0, 0.0, 1.0));
        if (d.y > 0.02) {
          vec2 uv = d.xz / (d.y + 0.25) * 1.6;
          float c = smoothstep(0.52, 0.8, fbm(uv + 3.0));
          col = mix(col, vec3(1.0), c * 0.7 * smoothstep(0.02, 0.25, d.y));
        }
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 600.0) * 3.0 + pow(s, 24.0) * 0.28);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.onBeforeRender = (r, s, camera) => { mesh.position.copy(camera.position); mesh.updateMatrixWorld(); };
  scene.add(mesh);
  scene.fog = new THREE.Fog(new THREE.Color(sky.horizon), sky.fogNear, sky.fogFar);
  return mesh;
}

export function buildLights(scene, map, shadows) {
  const sky = map.sky;
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8d877b, 1.2);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xdde6f2, 0.45); // keeps ceilings and deep shade readable
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(new THREE.Color(sky.sunColor), 2.6);
  const dir = new THREE.Vector3(...sky.sunDir).normalize();
  sun.position.copy(dir).multiplyScalar(90);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = shadows;
  const b = map.bounds;
  const half = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.5 * 1.42 + 6;
  const cam = sun.shadow.camera;
  cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
  cam.near = 10; cam.far = 200;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const points = [];
  for (const l of map.lights || []) {
    const p = new THREE.PointLight(new THREE.Color(l.color), l.intensity, l.distance, 2);
    p.position.set(...l.pos);
    scene.add(p);
    points.push(p);
  }
  return { hemi, sun, points, all: [hemi, ambient, sun, sun.target, ...points] };
}
