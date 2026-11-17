// "SPAN" — two raised bases joined by a long bridge over a low killing field.
// Long sight lines along the bridge, cover and flanking routes underneath.
// See arena.js for the format and editing tips.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });
const stairs = (min, max, dir, steps, mat = 'ramp') => ({ type: 'stairs', min, max, dir, steps, mat });

const solids = [
  // shell
  box([-50, -1, -24], [50, 0, 24], 'floor'),
  box([-51, 0, -25], [51, 9, -24], 'wall'),
  box([-51, 0, 24], [51, 9, 25], 'wall'),
  box([-51, 0, -24], [-50, 9, 24], 'wall'),
  box([50, 0, -24], [51, 9, 24], 'wall'),

  // the two bases
  box([-50, 0, -24], [-36, 3, 24], 'blue'),
  box([36, 0, -24], [50, 3, 24], 'orange'),
  ramp([-36, 0, -22], [-27, 3, -16], '-x'),
  ramp([-36, 0, 16], [-27, 3, 22], '-x'),
  ramp([27, 0, -22], [36, 3, -16], '+x'),
  ramp([27, 0, 16], [36, 3, 22], '+x'),

  // sniper nests at the back of each base
  box([-50, 3, -4], [-46, 5, 4], 'metalDark'),
  stairs([-50, 3, 4], [-48, 5, 8], '-z', 4),
  box([46, 3, -4], [50, 5, 4], 'metalDark'),
  stairs([48, 3, -8], [50, 5, -4], '+z', 4),
  box([-46.4, 5, -4], [-46, 5.9, -1], 'metalDark'),
  box([-46.4, 5, 1], [-46, 5.9, 4], 'metalDark'),
  box([46, 5, -4], [46.4, 5.9, -1], 'metalDark'),
  box([46, 5, 1], [46.4, 5.9, 4], 'metalDark'),

  // base cover
  box([-40, 3, -10], [-39, 4.2, -4], 'concrete'),
  box([-40, 3, 4], [-39, 4.2, 10], 'concrete'),
  box([-44, 3, -15], [-42, 4.5, -13], 'crate'),
  box([-44, 3, 13], [-42, 4.5, 15], 'crate'),
  box([39, 3, -10], [40, 4.2, -4], 'concrete'),
  box([39, 3, 4], [40, 4.2, 10], 'concrete'),
  box([42, 3, -15], [44, 4.5, -13], 'crate'),
  box([42, 3, 13], [44, 4.5, 15], 'crate'),

  // the bridge
  box([-36, 2.5, -3], [36, 3, 3], 'metalDark'),
  box([-25, 0, -1], [-23, 2.5, 1], 'pillar'),
  box([-13, 0, -1], [-11, 2.5, 1], 'pillar'),
  box([11, 0, -1], [13, 2.5, 1], 'pillar'),
  box([23, 0, -1], [25, 2.5, 1], 'pillar'),
  // railings (gaps let you drop off or climb the middle stairs)
  box([-36, 3, -3], [-20, 4, -2.6], 'metal'),
  box([-14, 3, -3], [-2, 4, -2.6], 'metal'),
  box([2, 3, -3], [14, 4, -2.6], 'metal'),
  box([20, 3, -3], [36, 4, -2.6], 'metal'),
  box([-36, 3, 2.6], [-26, 4, 3], 'metal'),
  box([-18, 3, 2.6], [-2, 4, 3], 'metal'),
  box([2, 3, 2.6], [18, 4, 3], 'metal'),
  box([26, 3, 2.6], [36, 4, 3], 'metal'),
  box([-1, 3, -1], [1, 4.3, 1], 'crate'),
  box([-19, 3, 0], [-18, 4.2, 2], 'crate'),
  box([18, 3, -2], [19, 4.2, 0], 'crate'),
  stairs([-2, 0, -9], [2, 3, -3], '+z', 6),
  stairs([-2, 0, 3], [2, 3, 9], '-z', 6),

  // north lane
  box([-20, 0, -14], [-12, 3, -13], 'concrete'),
  box([12, 0, -14], [20, 3, -13], 'concrete'),
  box([-8, 0, -19], [-6, 1.5, -17], 'crate'),
  box([6, 0, -12], [8, 1.5, -10], 'crate'),
  box([-1, 0, -20], [1, 1.2, -19], 'concrete'),
  box([-30, 0, -10], [-27, 3, -6], 'blue'),
  box([27, 0, -10], [30, 3, -6], 'orange'),
  box([-22, 0, -22], [-20, 1.5, -20], 'crate'),
  box([20, 0, -8], [22, 1.5, -6], 'crate'),

  // south lane
  box([-22, 0, 12], [-21, 3, 20], 'concrete'),
  box([21, 0, 12], [22, 3, 20], 'concrete'),
  box([-10, 0, 10], [-8, 1.5, 12], 'crate'),
  box([8, 0, 17], [10, 1.5, 19], 'crate'),
  box([-3, 0, 15], [3, 1.2, 16], 'concrete'),
  box([-30, 0, 6], [-27, 3, 10], 'blue'),
  box([27, 0, 6], [30, 3, 10], 'orange'),
  box([-15, 0, 20], [-13, 1.5, 22], 'crate'),
  box([13, 0, 6], [15, 1.5, 8], 'crate'),
];

export default {
  id: 'span',
  name: 'Span',
  blurb: 'Two bases and a long bridge. Sniper country.',
  bounds: { minX: -50, maxX: 50, minZ: -24, maxZ: 24 },

  materials: {
    floor: { color: '#7d8791', tex: 'tiles', scale: 4 },
    wall: { color: '#5e6b7a', tex: 'concrete', scale: 5 },
    concrete: { color: '#a3aab2', tex: 'concrete', scale: 4 },
    pillar: { color: '#8a939e', tex: 'concrete', scale: 3 },
    ramp: { color: '#7b8490', tex: 'plates', scale: 2 },
    metal: { color: '#9aa7b5', tex: 'plates', scale: 2 },
    metalDark: { color: '#566170', tex: 'plates', scale: 2 },
    crate: { color: '#b98a4e', tex: 'crate' },
    blue: { color: '#4572ad', tex: 'plates', scale: 3 },
    orange: { color: '#c46a2b', tex: 'plates', scale: 3 },
  },

  sky: {
    top: '#2f5fb0',
    horizon: '#f0c9a0',
    sunDir: [0.62, 0.42, -0.5],
    sunColor: '#ffd9a8',
    fogNear: 80,
    fogFar: 300,
  },

  lights: [
    { pos: [-18, 1.8, 0], color: '#a0c8ff', intensity: 22, distance: 16 },
    { pos: [18, 1.8, 0], color: '#ffc890', intensity: 22, distance: 16 },
  ],

  solids,

  spawns: [
    [-47.5, 3, -18.5, -90], [-47.5, 3, 18.5, -90], [-42.5, 3, 0.5, -90],
    [47.5, 3, -18.5, 90], [47.5, 3, 18.5, 90], [42.5, 3, 0.5, 90],
    [-18.5, 0, -20.5, -90], [18.5, 0, -20.5, 90],
    [-17.5, 0, 21.5, -90], [17.5, 0, 21.5, 90],
    [4.5, 0, -22.5, 180], [-4.5, 0, 22.5, 0],
    [-32.5, 0, 0.5, -90], [32.5, 0, 0.5, 90],
  ],

  pickups: [
    { type: 'health', pos: [0.5, 0, 0.5] },
    { type: 'health', pos: [-42.5, 3, 18.5] },
    { type: 'health', pos: [42.5, 3, -18.5] },
    { type: 'armor', pos: [5.5, 3, 0.5] },
    { type: 'armor', pos: [-5.5, 3, -0.5] },
    { type: 'crate', pos: [-48.5, 5, 0.5] },
    { type: 'crate', pos: [48.5, 5, 0.5] },
    { type: 'ammo', pos: [-15.5, 0, -18.5] },
    { type: 'ammo', pos: [15.5, 0, -18.5] },
    { type: 'ammo', pos: [-15.5, 0, 17.5] },
    { type: 'ammo', pos: [15.5, 0, 12.5] },
    { type: 'ammo', pos: [-30.5, 0, -13.5] },
    { type: 'ammo', pos: [30.5, 0, 13.5] },
    { type: 'ammo', pos: [-28.5, 3, 0.5] },
    { type: 'ammo', pos: [28.5, 3, -0.5] },
  ],

  // King of the Hill zones: [x, floorY, z, radius]
  hills: [
    [0.5, 3, 0.5, 3.5], [0.5, 0, -18, 5], [0.5, 0, 18, 5],
    [-18, 0, 0.5, 4], [18, 0, 0.5, 4], [-42, 3, 0.5, 4], [42, 3, 0.5, 4],
  ],

  pois: [
    [-28.5, 3, 0.5], [28.5, 3, 0.5], [-8.5, 3, 1.5], [8.5, 3, -1.5],
    [-48.5, 5, -1.5], [48.5, 5, 1.5],
    [-43.5, 3, -19.5], [-43.5, 3, 19.5], [43.5, 3, -19.5], [43.5, 3, 19.5],
    [-41.5, 3, 0.5], [41.5, 3, 0.5],
    [-16.5, 0, -18.5], [16.5, 0, -18.5], [0.5, 0, -22.5], [-24.5, 0, -12.5], [24.5, 0, -12.5],
    [-16.5, 0, 17.5], [16.5, 0, 9.5], [0.5, 0, 21.5], [-24.5, 0, 13.5], [24.5, 0, 13.5],
    [-17.5, 0, 0.5], [17.5, 0, 0.5], [5.5, 0, 0.5], [-33.5, 0, -1.5], [33.5, 0, 1.5],
  ],
};
