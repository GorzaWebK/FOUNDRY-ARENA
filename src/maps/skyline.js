// "SKYLINE" — rooftops over a street grid. Each team's base sits on a roof,
// with a tall sniper roof behind it. Bridges, planks and long outdoor stairs
// join the roofs; the short gaps between the north and south blocks can be
// jumped for a shortcut. Fall off and you're back in the street.
// See arena.js for the format and editing tips.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });
const stairs = (min, max, dir, steps, mat = 'ramp') => ({ type: 'stairs', min, max, dir, steps, mat });
const sp = (x, y, z) => [x, y, z, Math.round((Math.atan2(x, z) * 180) / Math.PI)];

// everything west of the middle is mirrored (x, z) -> (-x, -z) for the east
const flip = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
function mirror(s) {
  const m = { ...s, min: [-s.max[0], s.min[1], -s.max[2]], max: [-s.min[0], s.max[1], -s.min[2]] };
  if (s.dir) m.dir = flip[s.dir];
  return m;
}
const red = (s) => ({ ...s, mat: s.mat === 'blue' ? 'red' : s.mat === 'blueTrim' ? 'redTrim' : s.mat });

const west = [
  // base roof (A) + its parapet
  box([-40, 0, -12], [-26, 6, 12], 'brick'),
  box([-26.4, 6, 3], [-26, 7, 12], 'blueTrim'), box([-26.4, 6, -12], [-26, 7, -3], 'blueTrim'),
  box([-38, 6, -1.5], [-36, 7.2, 1.5], 'blue'), // a vent block to hide behind at the flag
  // tall sniper roof (B) behind the base, reached by a stair bridge from A
  box([-40, 0, -30], [-24, 9, -18], 'brick'),
  stairs([-36, 6, -18], [-32, 9, -12], '-z', 6),
  box([-24.4, 9, -30], [-24, 10, -22], 'blueTrim'),
  box([-30, 9, -21], [-28, 10.2, -19], 'blue'),
  // low roof (C), ramp down from A, stairs up from the street
  box([-40, 0, 18], [-26, 4, 30], 'brick'),
  ramp([-34, 4, 12], [-30, 6, 18], '-z'),
  stairs([-26, 0, 22], [-18, 4, 26], '-x', 8),
  // stairs from the street up to A, and a bridge from A to the middle
  stairs([-26, 0, 6], [-14, 6, 10], '-x', 12),
  box([-26, 5.6, -2], [-8, 6, 2], 'metal'),
  box([-26, 6, -2.2], [-10, 6.8, -2], 'metalDark'),
  // north block: three roofs with jumpable gaps between them (a plank across
  // each for the bots), street stairs at both ends and a ramp down to the middle
  box([-18, 0, -30], [-8, 5, -20], 'brick'),
  box([-5.5, 0, -30], [5.5, 5, -21], 'brick'),
  box([8, 0, -30], [18, 5, -20], 'brick'),
  box([-8, 4.6, -29], [-5.5, 5, -27.5], 'wood'),
  box([5.5, 4.6, -23], [8, 5, -21.5], 'wood'),
  stairs([-14, 0, -20], [-10, 5, -10], '-z', 10),
  stairs([10, 0, -20], [14, 5, -10], '-z', 10),
  ramp([-2, 4.6, -21], [2, 6, -8], '+z'),
  box([-17, 5, -29], [-15, 6.2, -27], 'crate'),
  box([15, 5, -23], [17, 6.2, -21], 'crate'),
  // street cover
  box([-22, 0, -16], [-20, 1.4, -14], 'crate'),
  box([-12, 0, 13], [-10, 1.2, 16], 'crate'),
  box([-23, 0, 13], [-21, 1.5, 15], 'crate'),
  box([-6, 0, -16], [-3, 1.2, -14], 'crate'),
  box([-31, 0, 14], [-29, 1.2, 16], 'crate'),
];

const solids = [
  box([-40, -1, -30], [40, 0, 30], 'street'),
  // the city around us
  box([-41, 0, -31], [41, 16, -30], 'wall'),
  box([-41, 0, 30], [41, 16, 31], 'wall'),
  box([-41, 0, -30], [-40, 16, 30], 'wall'),
  box([40, 0, -30], [41, 16, 30], 'wall'),
  // middle roof (D) with a small tower
  box([-8, 0, -8], [8, 6, 8], 'brick'),
  box([-3, 6, -3], [3, 8.5, 3], 'concrete'),
  stairs([3, 6, -1.5], [8, 8.5, 1.5], '-x', 5),
  stairs([-8, 6, -1.5], [-3, 8.5, 1.5], '+x', 5),
  box([-8, 6, -8], [-5, 7, -7.6], 'metalDark'), box([5, 6, 7.6], [8, 7, 8], 'metalDark'),
  ...west,
  ...west.map((s) => red(mirror(s))),
];

export default {
  id: 'skyline',
  name: 'Skyline',
  blurb: 'Rooftops over a street: bridges, long stairs and gaps to jump.',
  bounds: { minX: -40, maxX: 40, minZ: -30, maxZ: 30 },

  materials: {
    street: { color: '#6a6e73', tex: 'concrete', scale: 6 },
    wall: { color: '#8a7a6c', tex: 'brick', scale: 6 },
    brick: { color: '#a8735a', tex: 'brick', scale: 4 },
    concrete: { color: '#a9afb6', tex: 'concrete', scale: 4 },
    ramp: { color: '#7f8894', tex: 'plates', scale: 2 },
    metal: { color: '#8a96a3', tex: 'plates', scale: 2 },
    metalDark: { color: '#59626e', tex: 'plates', scale: 2 },
    crate: { color: '#b98a4e', tex: 'crate' },
    wood: { color: '#8a6a44', tex: 'crate' },
    blue: { color: '#4f7fb8', tex: 'plates', scale: 2 },
    blueTrim: { color: '#3d6aa8', tex: 'plates', scale: 2 },
    red: { color: '#b8504a', tex: 'plates', scale: 2 },
    redTrim: { color: '#a8403a', tex: 'plates', scale: 2 },
  },

  sky: {
    top: '#24467e',
    horizon: '#f2b58a',
    sunDir: [-0.55, 0.38, -0.6],
    sunColor: '#ffcf9a',
    fogNear: 70,
    fogFar: 240,
  },

  lights: [
    { pos: [-20, 3, 0], color: '#ffd9a0', intensity: 18, distance: 14 },
    { pos: [20, 3, 0], color: '#ffd9a0', intensity: 18, distance: 14 },
  ],

  solids,

  spawns: [
    sp(-33.5, 6, -8.5), sp(33.5, 6, 8.5), sp(-30.5, 6, 8.5), sp(30.5, 6, -8.5),
    sp(-33.5, 4, 24.5), sp(33.5, 4, -24.5), sp(-32.5, 9, -25.5), sp(32.5, 9, 25.5),
    sp(-20.5, 0, -24.5), sp(20.5, 0, 24.5), sp(-20.5, 0, 14.5), sp(20.5, 0, -14.5),
    sp(-6.5, 0, -12.5), sp(6.5, 0, 12.5), sp(-13.5, 5, -25.5), sp(13.5, 5, 25.5),
    sp(-6.5, 0, 15.5), sp(6.5, 0, -15.5),
  ],

  pickups: [
    { type: 'health', pos: [-30.5, 6, -8.5] },
    { type: 'health', pos: [30.5, 6, 8.5] },
    { type: 'health', pos: [-20.5, 0, -0.5] },
    { type: 'health', pos: [20.5, 0, 0.5] },
    { type: 'armor', pos: [0.5, 8.5, 0.5] },
    { type: 'armor', pos: [0.5, 0, -14.5] },
    { type: 'armor', pos: [0.5, 0, 14.5] },
    { type: 'crate', pos: [-32.5, 9, -25.5] },
    { type: 'crate', pos: [32.5, 9, 25.5] },
    { type: 'ammo', pos: [-2.5, 5, -25.5] },
    { type: 'ammo', pos: [2.5, 5, 25.5] },
    { type: 'ammo', pos: [-33.5, 4, 26.5] },
    { type: 'ammo', pos: [33.5, 4, -26.5] },
    { type: 'ammo', pos: [-20.5, 0, -27.5] },
    { type: 'ammo', pos: [20.5, 0, 27.5] },
  ],

  flags: [[-31.5, 6, 0.5], [31.5, 6, 0.5]],

  hills: [
    [0.5, 8.5, 0.5, 2.5], [0, 0, -14.5, 4], [0, 0, 14.5, 4],
    [-2.5, 5, -25.5, 3], [2.5, 5, 25.5, 3], [-21, 0, 0.5, 4], [21, 0, 0.5, 4],
  ],

  pois: [
    [-33.5, 6, -6.5], [33.5, 6, 6.5], [-30.5, 6, 6.5], [30.5, 6, -6.5],
    [-32.5, 9, -24.5], [32.5, 9, 24.5], [-33.5, 4, 22.5], [33.5, 4, -22.5],
    [-12.5, 5, -24.5], [12.5, 5, 24.5], [-2.5, 5, -24.5], [2.5, 5, 24.5],
    [-4.5, 6, 4.5], [4.5, 6, -4.5], [0.5, 8.5, 0.5],
    [-20.5, 0, -24.5], [20.5, 0, 24.5], [-20.5, 0, 16.5], [20.5, 0, -16.5],
    [-17.5, 0, -14.5], [17.5, 0, 14.5], [-17.5, 0, 12.5], [17.5, 0, -12.5],
    [0.5, 0, -16.5], [0.5, 0, 16.5], [-22.5, 0, 0.5], [22.5, 0, 0.5],
  ],
};
