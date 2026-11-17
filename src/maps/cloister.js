// "CLOISTER" — a tight courtyard ringed by a covered walkway with a catwalk on
// top. Close quarters: shotguns, SMGs and grenades shine here.
// See arena.js for the format and editing tips.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });
const stairs = (min, max, dir, steps, mat = 'ramp') => ({ type: 'stairs', min, max, dir, steps, mat });

const solids = [
  // shell
  box([-26, -1, -26], [26, 0, 26], 'floor'),
  box([-27, 0, -27], [27, 9, -26], 'wall'),
  box([-27, 0, 26], [27, 9, 27], 'wall'),
  box([-27, 0, -26], [-26, 9, 26], 'wall'),
  box([26, 0, -26], [27, 9, 26], 'wall'),

  // catwalk ring (walkable on top, covered walkway underneath)
  box([-26, 2.5, -26], [26, 3, -22], 'metalDark'),
  box([-26, 2.5, 22], [26, 3, 26], 'metalDark'),
  box([-26, 2.5, -22], [-22, 3, 22], 'metalDark'),
  box([22, 2.5, -22], [26, 3, 22], 'metalDark'),
  stairs([-22, 0, 8], [-20, 3, 14], '-z', 6),
  ramp([20, 0, -14], [22, 3, -5], '-z'),

  // cloister walls and columns
  box([-18, 0, -22], [-4, 2.5, -21], 'sand'),
  box([4, 0, -22], [18, 2.5, -21], 'sand'),
  box([-18, 0, 21], [-4, 2.5, 22], 'sand'),
  box([4, 0, 21], [18, 2.5, 22], 'sand'),
  box([-22, 0, -18], [-21, 2.5, -17], 'pillar'),
  box([-22, 0, -6], [-21, 2.5, -5], 'pillar'),
  box([-22, 0, 3], [-21, 2.5, 4], 'pillar'),
  box([-22, 0, 17], [-21, 2.5, 18], 'pillar'),
  box([21, 0, -18], [22, 2.5, -17], 'pillar'),
  box([21, 0, -3], [22, 2.5, -2], 'pillar'),
  box([21, 0, 4], [22, 2.5, 5], 'pillar'),
  box([21, 0, 17], [22, 2.5, 18], 'pillar'),

  // catwalk railings and cover
  box([-14, 3, -22.4], [14, 4, -22], 'sand'),
  box([-14, 3, 22], [14, 4, 22.4], 'sand'),
  box([-22.4, 3, -14], [-22, 4, 4], 'sand'),
  box([22, 3, -2], [22.4, 4, 14], 'sand'),
  box([-1, 3, -25], [1, 4.2, -24], 'crate'),
  box([-1, 3, 24], [1, 4.2, 25], 'crate'),
  box([-25, 3, -3], [-24, 4.2, -1], 'crate'),
  box([24, 3, 6], [25, 4.2, 8], 'crate'),

  // centre platform
  box([-5, 0, -5], [5, 1.5, 5], 'plaza'),
  ramp([-2, 0, -9], [2, 1.5, -5], '+z'),
  ramp([-2, 0, 5], [2, 1.5, 9], '-z'),
  stairs([-8, 0, -2], [-5, 1.5, 2], '+x', 3),
  stairs([5, 0, -2], [8, 1.5, 2], '-x', 3),
  box([-1, 1.5, -1], [1, 6, 1], 'pillar'),
  box([-5, 1.5, -5], [-3, 2.7, -4.6], 'metal'),
  box([3, 1.5, 4.6], [5, 2.7, 5], 'metal'),
  box([4.6, 1.5, -5], [5, 2.7, -3], 'metal'),
  box([-5, 1.5, 3], [-4.6, 2.7, 5], 'metal'),

  // courtyard cover
  box([-14, 0, -14], [-12, 1.5, -12], 'crate'),
  box([12, 0, 12], [14, 1.5, 14], 'crate'),
  box([-15, 0, 15], [-13, 1.5, 17], 'crate'),
  box([13, 0, -17], [15, 1.5, -15], 'crate'),
  box([-13, 0, -3], [-12, 1.2, 3], 'concrete'),
  box([12, 0, -3], [13, 1.2, 3], 'concrete'),
  box([-3, 0, 13], [3, 1.2, 14], 'concrete'),
  box([-3, 0, -14], [3, 1.2, -13], 'concrete'),

  // walkway clutter
  box([-26, 0, -26], [-24, 1.5, -24], 'crate'),
  box([24, 0, 24], [26, 1.5, 26], 'crate'),
  box([24, 0, -26], [26, 1.2, -25], 'crate'),
  box([-26, 0, 25], [-24, 1.2, 26], 'crate'),
];

export default {
  id: 'cloister',
  name: 'Cloister',
  blurb: 'Small courtyard with a catwalk ring. Fast and close.',
  bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },

  materials: {
    floor: { color: '#8f8a80', tex: 'tiles', scale: 4 },
    wall: { color: '#6d6a72', tex: 'concrete', scale: 5 },
    concrete: { color: '#aaa69c', tex: 'concrete', scale: 4 },
    plaza: { color: '#b3a48a', tex: 'tiles', scale: 2 },
    pillar: { color: '#9a958b', tex: 'concrete', scale: 3 },
    ramp: { color: '#807a73', tex: 'plates', scale: 2 },
    metal: { color: '#8d99a6', tex: 'plates', scale: 2 },
    metalDark: { color: '#5b5f6b', tex: 'plates', scale: 2 },
    crate: { color: '#b98a4e', tex: 'crate' },
    sand: { color: '#c7b184', tex: 'concrete', scale: 4 },
  },

  sky: {
    top: '#44508f',
    horizon: '#e7b5a5',
    sunDir: [-0.5, 0.5, -0.6],
    sunColor: '#ffd2b0',
    fogNear: 60,
    fogFar: 220,
  },

  lights: [
    { pos: [0, 2, -24], color: '#ffd9a0', intensity: 20, distance: 18 },
    { pos: [0, 2, 24], color: '#ffd9a0', intensity: 20, distance: 18 },
    { pos: [-24, 2, 0], color: '#ffd9a0', intensity: 20, distance: 18 },
    { pos: [24, 2, 0], color: '#ffd9a0', intensity: 20, distance: 18 },
  ],

  solids,

  spawns: [
    [-23.5, 0, -19.5, -135], [23.5, 0, -19.5, 135], [-23.5, 0, 19.5, -45], [23.5, 0, 19.5, 45],
    [0.5, 0, -24.5, 180], [0.5, 0, 24.5, 0],
    [-24.5, 3, -24.5, -135], [24.5, 3, 24.5, 45], [24.5, 3, -24.5, 135], [-24.5, 3, 24.5, -45],
    [-17.5, 0, 0.5, -90], [17.5, 0, 0.5, 90], [0.5, 0, -17.5, 180], [0.5, 0, 17.5, 0],
  ],

  pickups: [
    { type: 'health', pos: [-24.5, 0, 0.5] },
    { type: 'health', pos: [24.5, 0, 0.5] },
    { type: 'armor', pos: [3.5, 1.5, -3.5] },
    { type: 'crate', pos: [6.5, 3, -24.5] },
    { type: 'crate', pos: [-6.5, 3, 24.5] },
    { type: 'ammo', pos: [-10.5, 0, -17.5] },
    { type: 'ammo', pos: [10.5, 0, 17.5] },
    { type: 'ammo', pos: [-17.5, 0, 10.5] },
    { type: 'ammo', pos: [17.5, 0, -10.5] },
    { type: 'ammo', pos: [8.5, 0, -24.5] },
    { type: 'ammo', pos: [-8.5, 0, 24.5] },
  ],

  pois: [
    [2.5, 1.5, 2.5], [-2.5, 1.5, -2.5],
    [-16.5, 3, -24.5], [16.5, 3, -24.5], [-16.5, 3, 24.5], [16.5, 3, 24.5],
    [-24.5, 3, -10.5], [-24.5, 3, 16.5], [24.5, 3, -16.5], [24.5, 3, 10.5],
    [-24.5, 0, -10.5], [-24.5, 0, 10.5], [24.5, 0, -10.5], [24.5, 0, 10.5],
    [-10.5, 0, -24.5], [10.5, 0, -24.5], [-10.5, 0, 24.5], [10.5, 0, 24.5],
    [-9.5, 0, -9.5], [9.5, 0, 9.5], [9.5, 0, -9.5], [-9.5, 0, 9.5],
    [-16.5, 0, 0.5], [16.5, 0, 0.5], [0.5, 0, -17.5], [0.5, 0, 17.5],
  ],
};
