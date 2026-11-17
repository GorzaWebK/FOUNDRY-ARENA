// Offline map validator: builds the collision world + nav grid exactly like
// the game does, prints an ASCII overview and checks that all spawns, pickups
// and points of interest sit on nav nodes the bots can reach.
//
//   npm run check:map            all maps
//   npm run check:map -- --quiet no ASCII overview

import { MAPS } from '../src/maps/index.js';
import { World } from '../src/world.js';
import { NavGrid } from '../src/navgrid.js';

let failed = 0;
for (const map of MAPS) {
const world = new World(map);
const t0 = performance.now();
const nav = new NavGrid(world);
const s0 = map.spawns[0];
nav.markReachable(s0[0], s0[1], s0[2]);
const buildMs = performance.now() - t0;

let edges = 0, drops = 0;
for (let i = 0; i < nav.nodeCount; i++) {
  edges += nav.adj[i].length;
  for (const d of nav.adjDrop[i]) drops += d;
}
console.log(`map "${map.name}": ${map.solids.length} solids -> ${world.colliders.length} move colliders, ${world.rayShapes.length} ray shapes`);
console.log(`nav: ${nav.nodeCount} nodes (${nav.reachable.length} reachable), ${edges} edges (${drops} drops), built in ${buildMs.toFixed(0)} ms\n`);

// ASCII map: highest reachable node per cell.  . ground  : <2  + <3.5  # <5  @ higher, blank = blocked
const rows = [];
for (let iz = 0; iz < nav.h; iz++) {
  let row = '';
  for (let ix = 0; ix < nav.w; ix++) {
    const nodes = nav.layers[iz * nav.w + ix].filter((n) => nav.reach[n]);
    if (!nodes.length) { row += ' '; continue; }
    const y = nav.py[nodes[nodes.length - 1]];
    const multi = nodes.length > 1;
    let ch = y < 0.3 ? '.' : y < 2 ? ':' : y < 3.5 ? '+' : y < 5 ? '#' : '@';
    if (multi && ch !== '.') ch = ch === '+' ? 'x' : ch === '#' ? 'H' : ch;
    row += ch;
  }
  rows.push(row);
}
if (!process.argv.includes('--quiet')) console.log(rows.join('\n'));
console.log('\nlegend: . ground  : low  + mid (x = walkable underneath)  # high (H = walkable underneath)  @ top\n');

let bad = 0;
function check(kind, p) {
  const id = nav.nodeAt(p[0], p[2], p[1], 0.3);
  if (id < 0) { console.log(`ERROR ${kind} at ${p.slice(0, 3)} is not on a nav node`); bad++; return; }
  if (!nav.reach[id]) { console.log(`ERROR ${kind} at ${p.slice(0, 3)} is unreachable`); bad++; }
}
map.spawns.forEach((s) => check('spawn', s));
map.pickups.forEach((p) => check('pickup:' + p.type, p.pos));
map.pois.forEach((p) => check('poi', p));

// every spawn must be able to path to every pickup, and back
for (const s of map.spawns) {
  for (const p of map.pickups) {
    const a = nav.findPath(s[0], s[1], s[2], p.pos[0], p.pos[1], p.pos[2]);
    const b = nav.findPath(p.pos[0], p.pos[1], p.pos[2], s[0], s[1], s[2]);
    if (!a || !a.complete || !b || !b.complete) { console.log(`ERROR no round trip spawn ${s} <-> ${p.type} ${p.pos}`); bad++; }
  }
}

// timing
const t1 = performance.now();
let total = 0;
for (let i = 0; i < 500; i++) {
  const a = nav.randomNode(), b = nav.randomNode();
  const r = nav.findPath(nav.px[a], nav.py[a], nav.pz[a], nav.px[b], nav.py[b], nav.pz[b]);
  if (r && r.complete) total++;
}
console.log(`500 random paths: ${total} complete, ${((performance.now() - t1) / 500).toFixed(3)} ms each`);
console.log(bad ? `\n${bad} problem(s) found in ${map.name}\n` : `\n${map.name} OK\n`);
failed += bad;
}
process.exit(failed ? 1 : 0);
