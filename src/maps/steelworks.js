// "STEELWORKS": the mega map. 220 x 160 m, more than twice the area of any other.
// A blast furnace in the middle with stairs to its top and conveyor bridges
// running 5 m up to towers east and west; a rail yard of container rows across
// the north; a long rolling-mill hall with a mezzanine along the south; slag
// mounds and cooling towers in between; and a base at each end for CTF.
// See arena.js for the format.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });
const stairs = (min, max, dir, steps, mat = 'ramp') => ({ type: 'stairs', min, max, dir, steps, mat });
const sp = (x, y, z) => [x, y, z, Math.round((Math.atan2(x, z) * 180) / Math.PI)];
const FLIP = { '+x': '-x', '-x': '+x', '+z': '+z', '-z': '-z' };
/** The same solid, mirrored east-west (x -> -x). */
const mirror = (s) => ({ ...s, min: [-s.max[0], s.min[1], s.min[2]], max: [-s.min[0], s.max[1], s.max[2]], ...(s.dir ? { dir: FLIP[s.dir] } : {}) });

const HW = 110, HD = 80, WALL = 12;
const solids = [
  // ---------------------------------------------------------------- shell
  box([-HW, -1, -HD], [HW, 0, HD], 'ground'),
  box([-HW - 1, 0, -HD - 1], [HW + 1, WALL, -HD], 'wall'),
  box([-HW - 1, 0, HD], [HW + 1, WALL, HD + 1], 'wall'),
  box([-HW - 1, 0, -HD], [-HW, WALL, HD], 'wall'),
  box([HW, 0, -HD], [HW + 1, WALL, HD], 'wall'),

  // ---------------------------------------------------------------- blast furnace (centre)
  box([-7, 0, -7], [7, 5, 7], 'metalDark'),
  stairs([-2, 0, -17], [2, 5, -7], '+z', 10),
  stairs([-2, 0, 7], [2, 5, 17], '-z', 10),
  box([-1.5, 5, -1.5], [1.5, 24, 1.5], 'brick'), // the chimney: a landmark from anywhere
  box([-6.5, 5, -6.5], [-3.5, 6.1, -5.5], 'metal'), box([3.5, 5, 5.5], [6.5, 6.1, 6.5], 'metal'), // low cover up top
  box([-6.5, 5, 3], [-5.5, 6.1, 6.5], 'metal'), box([5.5, 5, -6.5], [6.5, 6.1, -3], 'metal'),
];

// ---------------------------------------------------------------- conveyor bridges + towers (west, mirrored east)
const west = [
  box([-50, 4.5, -1.5], [-7, 5, 1.5], 'metal'), // the bridge, flush with the furnace top
  box([-50, 5, -1.7], [-7, 5.7, -1.5], 'metalDark'), box([-50, 5, 1.5], [-7, 5.7, 1.7], 'metalDark'), // rails
  ...[-15, -25, -35, -45].map((x) => box([x - 0.4, 0, -0.4], [x + 0.4, 4.5, 0.4], 'pillar')),
  box([-56, 4.5, -4], [-50, 5, 4], 'metal'), // tower deck
  ...[[-56, -4], [-50.8, -4], [-56, 3.2], [-50.8, 3.2]].map(([x, z]) => box([x, 0, z], [x + 0.8, 4.5, z + 0.8], 'pillar')),
  stairs([-56, 0, 4], [-52, 5, 14], '-z', 10),

  // ---------------------------------------------------------------- base (Cobalt west / Crimson east)
  box([-109, 0, -22], [-104, 3, 22], 'concrete'), // sniper deck along the back wall
  // its parapet, open where the stairs arrive
  box([-104.4, 3, -22], [-104, 4, -20], 'metalDark'), box([-104.4, 3, -16], [-104, 4, 16], 'metalDark'), box([-104.4, 3, 20], [-104, 4, 22], 'metalDark'),
  stairs([-104, 0, 16], [-98, 3, 20], '-x', 6),
  stairs([-104, 0, -20], [-98, 3, -16], '-x', 6),
  box([-100, 0, -13], [-88, 3, -12], 'wall'), box([-100, 0, 12], [-88, 3, 13], 'wall'), // walls either side of the flag
  box([-92, 0, -5], [-91, 1.4, 5], 'blue'), // low barrier in front of it
  box([-86, 0, -24], [-84, 1.3, -22], 'crate'), box([-86, 0, 22], [-84, 1.3, 24], 'crate'),
  box([-80, 0, -9], [-75, 1.2, -8], 'metalDark'), box([-80, 0, 8], [-75, 1.2, 9], 'metalDark'),

  // ---------------------------------------------------------------- slag mound (west one sits at -30, 20)
  box([-34, 0, 16], [-26, 3, 24], 'slag'),
  ramp([-34, 0, 24], [-26, 3, 30], '-z', 'slag'), ramp([-34, 0, 10], [-26, 3, 16], '+z', 'slag'),
  ramp([-40, 0, 16], [-34, 3, 24], '+x', 'slag'), ramp([-26, 0, 16], [-20, 3, 24], '-x', 'slag'),
  box([-33.5, 3, 16.5], [-31.5, 4.2, 17.5], 'crate'),

  // ---------------------------------------------------------------- cooling tower (west one at -30, -20)
  box([-36, 0, -26], [-24, 14, -14], 'tower'),
  box([-40, 0, -28], [-38, 1.4, -24], 'metalDark'), box([-22, 0, -16], [-20, 1.4, -12], 'metalDark'),
];
solids.push(...west, ...west.map(mirror));
// (the east side is the west one turned around, so the mounds and towers swap north / south)
for (const s of solids) {
  if (s.min[0] > 0 && ((s.mat === 'slag') || s.mat === 'tower' || (s.mat === 'crate' && s.min[1] >= 3) || (s.mat === 'metalDark' && s.max[1] <= 1.4 && Math.abs(s.min[2]) > 10 && s.min[0] < 45))) {
    const z0 = -s.max[2], z1 = -s.min[2];
    s.min = [s.min[0], s.min[1], z0];
    s.max = [s.max[0], s.max[1], z1];
    if (s.dir === '+z') s.dir = '-z'; else if (s.dir === '-z') s.dir = '+z';
  }
}

// ---------------------------------------------------------------- rail yard (north): rows of containers
const CONT = ['cRed', 'cBlue', 'cGreen', 'cOrange', 'cTan'];
[-70, -58, -46].forEach((zc, row) => {
  const xs = row === 1 ? [-68, -52, -36, -20, -4, 12, 28, 44, 60] : [-76, -60, -44, -28, -12, 4, 20, 36, 52, 68];
  xs.forEach((x0, i) => {
    if ((i + row) % 5 === 3) return; // a gap to run through
    const mat = CONT[(i * 3 + row) % CONT.length];
    solids.push(box([x0, 0, zc - 1.25], [x0 + 12, 2.6, zc + 1.25], mat));
    if ((i + row) % 3 === 0 && i > 0 && i < xs.length - 1) solids.push(box([x0, 2.6, zc - 1.25], [x0 + 12, 5.2, zc + 1.25], CONT[(i * 3 + row + 2) % CONT.length]));
  });
  // stairs up onto the row's end containers
  solids.push(stairs([xs[0] - 6, 0, zc - 1.25], [xs[0], 2.6, zc + 1.25], '+x', 6));
  const last = xs[xs.length - 1];
  solids.push(stairs([last + 12, 0, zc - 1.25], [last + 18, 2.6, zc + 1.25], '-x', 6));
});

// ---------------------------------------------------------------- rolling mill (south): a long hall
// north wall with four doorways, side walls with one each; the map's south wall closes it
for (const [a, b] of [[-64, -40], [-36, -4], [4, 36], [40, 64]]) solids.push(box([a, 0, 32], [b, 7, 33], 'wall'));
for (const x of [-65, 64]) for (const [a, b] of [[33, 50], [56, 80]]) solids.push(box([x, 0, a], [x + 1, 7, b], 'wall'));
solids.push(box([-62, 3, 33], [62, 3.5, 38], 'metal')); // mezzanine along the inside of the north wall
solids.push(box([-58, 3.5, 37.8], [58, 4.3, 38], 'metalDark')); // its rail (open at both stairs)
solids.push(stairs([-62, 0, 38], [-58, 3.5, 45], '-z', 7), stairs([58, 0, 38], [62, 3.5, 45], '-z', 7));
for (const x of [-45, -30, -15, 15, 30, 45]) solids.push(box([x - 0.3, 0, 37.2], [x + 0.3, 3, 37.8], 'pillar'));
for (const x0 of [-56, -34, -12, 10, 32]) solids.push(box([x0, 0, 44], [x0 + 12, 1.4, 47], 'machine'));
for (const x0 of [-46, -24, -2, 20, 42]) solids.push(box([x0, 0, 58], [x0 + 12, 1.4, 61], 'machine'));
for (const x0 of [-50, -12, 26]) solids.push(box([x0, 0, 66], [x0 + 3, 2.4, 69], 'metalDark')); // taller presses

// ---------------------------------------------------------------- scattered cover across the middle
const keepOut = [
  [-9, -19, 9, 19], [-HW, -3, HW, 3], // furnace, bridges
  [-58, -6, -48, 16], [48, -6, 58, 16], // towers + their stairs
  [-42, 8, -18, 32], [18, -32, 42, -8], // mounds
  [-42, -30, -18, -10], [18, 10, 42, 30], // cooling towers
  [-HW, -HD, -82, HD], [82, -HD, HW, HD], // bases
];
const spawnsList = [
  sp(-92.5, 0, -8.5), sp(-92.5, 0, 8.5), sp(-86.5, 0, -18.5), sp(-86.5, 0, 18.5), sp(-106.5, 3, -10.5), sp(-106.5, 3, 10.5),
  sp(92.5, 0, 8.5), sp(92.5, 0, -8.5), sp(86.5, 0, 18.5), sp(86.5, 0, -18.5), sp(106.5, 3, 10.5), sp(106.5, 3, -10.5),
  sp(-60.5, 0, -64.5), sp(-20.5, 0, -64.5), sp(20.5, 0, -52.5), sp(60.5, 0, -52.5),
  sp(-50.5, 0, 52.5), sp(-10.5, 0, 52.5), sp(30.5, 0, 52.5), sp(-30.5, 0, 72.5), sp(10.5, 0, 72.5), sp(50.5, 0, 72.5),
  sp(-45.5, 0, -20.5), sp(45.5, 0, 20.5), sp(-15.5, 0, 24.5), sp(15.5, 0, -24.5),
];
const pickups = [
  { type: 'health', pos: [-88.5, 0, -18.5] }, { type: 'health', pos: [88.5, 0, 18.5] },
  { type: 'health', pos: [0.5, 0, -28.5] }, { type: 'health', pos: [0.5, 0, 28.5] },
  { type: 'health', pos: [-50.5, 0, 52.5] }, { type: 'health', pos: [50.5, 0, 52.5] },
  { type: 'armor', pos: [-4.5, 5, 4.5] }, { type: 'armor', pos: [-30.5, 3, 20.5] }, { type: 'armor', pos: [30.5, 3, -19.5] },
  { type: 'ammo', pos: [-40.5, 0, -64.5] }, { type: 'ammo', pos: [40.5, 0, -64.5] }, { type: 'ammo', pos: [-0.5, 0, 52.5] },
  { type: 'ammo', pos: [0.5, 3.5, 35.5] },
  { type: 'crate', pos: [-53.5, 5, 0.5] }, { type: 'crate', pos: [53.5, 5, 0.5] },
  { type: 'crate', pos: [-106.5, 3, 0.5] }, { type: 'crate', pos: [106.5, 3, 0.5] },
];
let n = 0;
for (let z = -26; z <= 26; z += 13) {
  for (let x = -78; x <= 78; x += 12) {
    const ox = x + ((n * 5) % 7) - 3, oz = z + ((n * 3) % 5) - 2;
    n++;
    if (keepOut.some(([a, b, c, d]) => ox > a - 3 && ox < c + 3 && oz > b - 3 && oz < d + 3)) continue;
    if (spawnsList.some((s) => Math.hypot(s[0] - ox, s[2] - oz) < 5)) continue;
    if (pickups.some((p) => Math.hypot(p.pos[0] - ox, p.pos[2] - oz) < 4)) continue;
    const kind = n % 3;
    if (kind === 0) solids.push(box([ox - 1, 0, oz - 1], [ox + 1, 1.3, oz + 1], 'crate'));
    else if (kind === 1) solids.push(box([ox - 2.5, 0, oz - 0.5], [ox + 2.5, 1.2, oz + 0.5], 'metalDark'));
    else solids.push(box([ox - 0.5, 0, oz - 2.5], [ox + 0.5, 2.2, oz + 2.5], 'concrete'));
  }
}

export default {
  id: 'steelworks',
  name: 'Steelworks',
  blurb: 'Mega map, 220 m across: furnace, bridges, rail yard, rolling mill.',
  bounds: { minX: -HW, maxX: HW, minZ: -HD, maxZ: HD },

  materials: {
    ground: { color: '#77756f', tex: 'concrete', scale: 6 },
    wall: { color: '#6b6f74', tex: 'corrugated', scale: 5 },
    concrete: { color: '#a19d94', tex: 'concrete', scale: 4 },
    metal: { color: '#86909b', tex: 'plates', scale: 2 },
    metalDark: { color: '#4b5058', tex: 'plates', scale: 2 },
    pillar: { color: '#c9a23a', tex: 'plates', scale: 2 },
    ramp: { color: '#6f7780', tex: 'plates', scale: 2 },
    brick: { color: '#8c5a44', tex: 'brick', scale: 3 },
    crate: { color: '#b98a4e', tex: 'crate' },
    blue: { color: '#4f7fb8', tex: 'plates', scale: 3 },
    red: { color: '#b8504a', tex: 'plates', scale: 3 },
    slag: { color: '#4a4541', tex: 'concrete', scale: 3 },
    tower: { color: '#b4ada2', tex: 'concrete', scale: 6 },
    machine: { color: '#5c6670', tex: 'plates', scale: 2 },
    cRed: { color: '#a8433a', tex: 'corrugated', scale: 3 },
    cBlue: { color: '#3f6fa8', tex: 'corrugated', scale: 3 },
    cGreen: { color: '#4f7f4f', tex: 'corrugated', scale: 3 },
    cOrange: { color: '#c46a2b', tex: 'corrugated', scale: 3 },
    cTan: { color: '#a8946a', tex: 'corrugated', scale: 3 },
  },

  sky: {
    top: '#5a5f6e',
    horizon: '#e3b48a',
    sunDir: [0.5, 0.5, -0.4],
    sunColor: '#ffd2a0',
    fogNear: 110,
    fogFar: 460,
  },

  lights: [
    { pos: [0, 7, 0], color: '#ff9a4a', intensity: 40, distance: 22 }, // the furnace glows
    { pos: [-40, 6, 52], color: '#ffe2b0', intensity: 30, distance: 26 },
    { pos: [40, 6, 52], color: '#ffe2b0', intensity: 30, distance: 26 },
  ],

  orbit: { r: 72, h: 34, lookY: 2 },

  // set dressing (decor.js): molten orange on rusted steel
  decor: {
    accent: '#ff7a1a', trim: '#22201e', pipe: '#7a6e64', pipe2: '#b8504a', cable: '#121212', bracket: '#2e2a26',
    hazard: true, pipes: true, cables: true,
    signs: [['FURNACE\nNo. 2', 'stencil'], ['MOLTEN\nMETAL', 'hazard'], ['RAIL YARD', 'plate'], ['ROLLING\nMILL', 'stencil'], ['KEEP CLEAR\nOF CRANE', 'hazard'], ['GATE 4', 'plate'], ['SLAG\nHEAP', 'stencil']],
    barrels: 16, barrelColors: ['#8c3a2b', '#3d4a57', '#6b5a2e', '#2f5e8f'],
  },

  solids,
  spawns: spawnsList,

  pickups,

  flags: [[-94.5, 0, 0.5], [94.5, 0, 0.5]],

  hills: [
    [4.5, 5, 0.5, 2.5], [0.5, 0, 52.5, 4], [-30.5, 3, 20.5, 3], [30.5, 3, -19.5, 3], [0.5, 0, -52.5, 4], [-70.5, 0, 0.5, 4],
  ],

  pois: [
    [0.5, 5, 4.5], [0.5, 0, -20.5], [0.5, 0, 20.5], [-53.5, 5, 0.5], [53.5, 5, 0.5], [-28.5, 5, 0.5], [28.5, 5, 0.5],
    [-94.5, 0, 0.5], [94.5, 0, 0.5], [-106.5, 3, 0.5], [106.5, 3, 0.5],
    [-60.5, 0, -64.5], [0.5, 0, -64.5], [60.5, 0, -64.5], [-40.5, 0, -52.5], [40.5, 0, -52.5],
    [-50.5, 0, 52.5], [0.5, 0, 52.5], [50.5, 0, 52.5], [-30.5, 0, 72.5], [30.5, 0, 72.5], [0.5, 3.5, 35.5],
    [-30.5, 3, 20.5], [30.5, 3, -19.5], [-60.5, 0, 20.5], [60.5, 0, -20.5], [-70.5, 0, 0.5], [70.5, 0, 0.5],
  ],
};
