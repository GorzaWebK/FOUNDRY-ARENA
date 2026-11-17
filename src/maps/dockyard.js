// "DOCKYARD" — a shipping-container yard. Each team's flag sits in a shed with a
// sniper roof; the yard between is a maze of containers, some you can climb
// onto, and a gantry crane walkway runs across the middle high above it.
// See arena.js for the format and editing tips.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });
const stairs = (min, max, dir, steps, mat = 'ramp') => ({ type: 'stairs', min, max, dir, steps, mat });
const sp = (x, y, z) => [x, y, z, Math.round((Math.atan2(x, z) * 180) / Math.PI)];

const flip = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
function mirror(s) {
  const m = { ...s, min: [-s.max[0], s.min[1], -s.max[2]], max: [-s.min[0], s.max[1], -s.min[2]] };
  if (s.dir) m.dir = flip[s.dir];
  return m;
}
const swap = { blue: 'red', cBlue: 'cRed', cRed: 'cBlue', cGreen: 'cOrange', cOrange: 'cGreen' };
const recolour = (s) => ({ ...s, mat: swap[s.mat] || s.mat });

// the west half; the east half is the same, turned round
const west = [
  // base shed: three walls and a flat roof you can stand on
  box([-44, 0, -10], [-34, 4, -9], 'shed'),
  box([-44, 0, 9], [-34, 4, 10], 'shed'),
  box([-44, 4, -10], [-34, 4.5, 10], 'metalDark'),
  box([-34.4, 4.5, -6], [-34, 5.3, 6], 'blue'), // parapet on the roof's front edge
  stairs([-40, 0, -19], [-36, 4.5, -10], '+z', 9),
  box([-43, 0, 5], [-41, 1.4, 8], 'crate'), box([-43, 0, -8], [-40, 1.2, -6], 'crate'),
  // containers
  box([-30, 0, -26], [-24, 3, -23], 'cRed'),
  box([-30, 0, -23], [-24, 3, -20], 'cGreen'),
  ramp([-24, 0, -26], [-18, 3, -23], '-x'),
  box([-14, 0, -26], [-8, 3, -23], 'cBlue'), box([-14, 3, -26], [-8, 6, -23], 'cOrange'),
  box([-26, 0, -6], [-23, 3, 0], 'cOrange'),
  ramp([-26, 0, 0], [-23, 3, 6], '-z'),
  box([-18, 0, -12], [-12, 3, -9], 'cTan'),
  box([-18, 0, 6], [-15, 3, 12], 'cGreen'), box([-18, 3, 6], [-15, 6, 12], 'cBlue'),
  box([-10, 0, -4], [-7, 3, 2], 'cRed'),
  box([-30, 0, 14], [-24, 3, 17], 'cBlue'),
  box([-12, 0, 16], [-6, 3, 19], 'cOrange'),
  box([-22, 0, 20], [-16, 3, 23], 'cTan'),
  // the crane walkway's north stairs
  stairs([-1.5, 0, -26], [1.5, 6, -14], '+z', 12),
  // small stuff
  box([-21, 0, -17], [-19, 1.2, -15], 'crate'), box([-6, 0, -12], [-4, 1.4, -10], 'crate'),
  box([-31, 0, 3], [-29, 1.2, 5], 'crate'), box([-8, 0, 8], [-6, 1.2, 10], 'crate'),
  box([-36, 0, 18], [-34, 1.5, 21], 'crate'),
  // bollards along the quay at the back
  ...[-38, -28, -18, -8].map((x) => box([x, 0, -27.5], [x + 1, 0.8, -26.5], 'metalDark')),
];

const solids = [
  box([-44, -1, -28], [44, 0, 28], 'ground'),
  box([-45, 0, -29], [45, 8, -28], 'fence'),
  box([-45, 0, 28], [45, 8, 29], 'fence'),
  box([-45, 0, -28], [-44, 8, 28], 'fence'),
  box([44, 0, -28], [45, 8, 28], 'fence'),
  // gantry crane: legs, top beams and the walkway across the middle
  box([-1.5, 5.6, -14], [1.5, 6, 14], 'metal'),
  box([-1.5, 6, -14], [-1.3, 6.9, -2], 'metalDark'), box([1.3, 6, 2], [1.5, 6.9, 14], 'metalDark'),
  box([1.3, 6, -14], [1.5, 6.9, -6], 'metalDark'), box([-1.5, 6, 6], [-1.3, 6.9, 14], 'metalDark'),
  box([-5, 0, -15], [-4, 11, -14], 'crane'), box([4, 0, -15], [5, 11, -14], 'crane'),
  box([-5, 0, 14], [-4, 11, 15], 'crane'), box([4, 0, 14], [5, 11, 15], 'crane'),
  box([-5, 11, -15], [5, 12, -14], 'crane'), box([-5, 11, 14], [5, 12, 15], 'crane'),
  box([-0.5, 11, -14], [0.5, 12, 14], 'crane'),
  box([-1.5, 9, -1.5], [1.5, 11, 1.5], 'crane'), // the trolley
  ...west,
  ...west.map((s) => recolour(mirror(s))),
];

export default {
  id: 'dockyard',
  name: 'Dockyard',
  blurb: 'Container yard: sheds at each end, stacks to climb and a crane walkway.',
  bounds: { minX: -44, maxX: 44, minZ: -28, maxZ: 28 },

  materials: {
    ground: { color: '#7c7f82', tex: 'concrete', scale: 6 },
    fence: { color: '#6b7480', tex: 'corrugated', scale: 4 },
    shed: { color: '#8b949c', tex: 'corrugated', scale: 3 },
    concrete: { color: '#a9afb6', tex: 'concrete', scale: 4 },
    ramp: { color: '#6f7882', tex: 'plates', scale: 2 },
    metal: { color: '#8a96a3', tex: 'plates', scale: 2 },
    metalDark: { color: '#4f5864', tex: 'plates', scale: 2 },
    crane: { color: '#e0b030', tex: 'plates', scale: 2 },
    crate: { color: '#b98a4e', tex: 'crate' },
    blue: { color: '#4f7fb8', tex: 'plates', scale: 2 },
    red: { color: '#b8504a', tex: 'plates', scale: 2 },
    cBlue: { color: '#3f6fa8', tex: 'corrugated', scale: 3 },
    cRed: { color: '#a8433a', tex: 'corrugated', scale: 3 },
    cGreen: { color: '#4f7f4f', tex: 'corrugated', scale: 3 },
    cOrange: { color: '#c46a2b', tex: 'corrugated', scale: 3 },
    cTan: { color: '#a8946a', tex: 'corrugated', scale: 3 },
  },

  sky: {
    top: '#4a77b0',
    horizon: '#dde6ee',
    sunDir: [0.4, 0.62, 0.55],
    sunColor: '#fff4e0',
    fogNear: 80,
    fogFar: 280,
  },

  lights: [
    { pos: [-39, 3, 0], color: '#a0c8ff', intensity: 24, distance: 14 },
    { pos: [39, 3, 0], color: '#ffc890', intensity: 24, distance: 14 },
  ],

  solids,

  spawns: [
    sp(-40.5, 0, -14.5), sp(40.5, 0, 14.5), sp(-40.5, 0, 14.5), sp(40.5, 0, -14.5),
    sp(-32.5, 0, -2.5), sp(32.5, 0, 2.5), sp(-38.5, 4.5, 4.5), sp(38.5, 4.5, -4.5),
    sp(-27.5, 3, -24.5), sp(27.5, 3, 24.5), sp(-20.5, 0, 0.5), sp(20.5, 0, -0.5),
    sp(-10.5, 0, -18.5), sp(10.5, 0, 18.5), sp(-26.5, 0, 24.5), sp(26.5, 0, -24.5),
    sp(-4.5, 0, 22.5), sp(4.5, 0, -22.5),
  ],

  pickups: [
    { type: 'health', pos: [-30.5, 0, -8.5] },
    { type: 'health', pos: [30.5, 0, 8.5] },
    { type: 'health', pos: [-8.5, 0, 12.5] },
    { type: 'health', pos: [8.5, 0, -12.5] },
    { type: 'armor', pos: [0.5, 6, 0.5] },
    { type: 'armor', pos: [0.5, 0, 0.5] },
    { type: 'crate', pos: [-39.5, 4.5, -7.5] },
    { type: 'crate', pos: [39.5, 4.5, 7.5] },
    { type: 'ammo', pos: [-24.5, 3, -3.5] },
    { type: 'ammo', pos: [24.5, 3, 3.5] },
    { type: 'ammo', pos: [-15.5, 0, -15.5] },
    { type: 'ammo', pos: [15.5, 0, 15.5] },
    { type: 'ammo', pos: [-20.5, 0, 14.5] },
    { type: 'ammo', pos: [20.5, 0, -14.5] },
  ],

  flags: [[-38.5, 0, 0.5], [38.5, 0, 0.5]],

  hills: [
    [0.5, 0, 0.5, 4], [0.5, 6, 0.5, 1.5], [-39, 4.5, 0.5, 3.5], [39, 4.5, 0.5, 3.5],
    [-27, 3, -23, 2.5], [27, 3, 23, 2.5], [-20, 0, -4, 4], [20, 0, 4, 4],
  ],

  pois: [
    [-38.5, 0, -4.5], [38.5, 0, 4.5], [-39.5, 4.5, -2.5], [39.5, 4.5, 2.5],
    [-27.5, 3, -21.5], [27.5, 3, 21.5], [-24.5, 3, -2.5], [24.5, 3, 2.5],
    [0.5, 6, -8.5], [0.5, 6, 8.5], [0.5, 0, -8.5], [0.5, 0, 8.5],
    [-20.5, 0, -18.5], [20.5, 0, 18.5], [-20.5, 0, 2.5], [20.5, 0, -2.5],
    [-12.5, 0, 0.5], [12.5, 0, -0.5], [-28.5, 0, 10.5], [28.5, 0, -10.5],
    [-8.5, 0, 22.5], [8.5, 0, -22.5], [-32.5, 0, -24.5], [32.5, 0, 24.5],
  ],
};
