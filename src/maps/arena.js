// ARENA "FOUNDRY" — map data.
//
// The whole level is plain data, so it is easy to edit or to clone into a new
// map. Coordinates: +x = east, +z = south, +y = up. One unit ~ one metre.
//
// Solid types
//   box    { min:[x,y,z], max:[x,y,z], mat }
//   ramp   { min, max, dir, mat }          smooth slope rising towards `dir`
//   stairs { min, max, dir, steps, mat }   `steps` equal steps rising towards `dir`
// `dir` is one of '+x' '-x' '+z' '-z' (the direction in which height increases).
//
// Tips for editing:
//  * Keep walls on whole-unit boundaries: the bot nav grid uses 1x1 cells.
//  * Keep ramps at a slope of 0.5 or less and stair steps at 0.5 or lower.
//  * Run `npm run check:map` to print an ASCII nav map and validate that every
//    spawn / pickup / point of interest is reachable by the bots.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });
const stairs = (min, max, dir, steps, mat = 'ramp') => ({ type: 'stairs', min, max, dir, steps, mat });

const solids = [
  // ---------------------------------------------------------------- shell
  box([-40, -1, -40], [40, 0, 40], 'floor'),
  box([-41, 0, -41], [41, 10, -40], 'wall'),
  box([-41, 0, 40], [41, 10, 41], 'wall'),
  box([-41, 0, -40], [-40, 10, 40], 'wall'),
  box([40, 0, -40], [41, 10, 40], 'wall'),

  // ---------------------------------------------------------------- centre dais
  box([-5, 0, -5], [5, 1, 5], 'plaza'),
  stairs([-2, 0, -7], [2, 1, -5], '+z', 2),
  stairs([-2, 0, 5], [2, 1, 7], '-z', 2),
  ramp([-8, 0, -2], [-5, 1, 2], '+x'),
  ramp([5, 0, -2], [8, 1, 2], '-x'),
  box([-5, 1, -5], [-4, 6, -4], 'pillar'),
  box([4, 1, -5], [5, 6, -4], 'pillar'),
  box([-5, 1, 4], [-4, 6, 5], 'pillar'),
  box([4, 1, 4], [5, 6, 5], 'pillar'),
  box([-5.5, 6, -5.5], [5.5, 6.4, 5.5], 'metalDark'),
  box([-1, 1, -1], [1, 2.2, 1], 'metal'),

  // ---------------------------------------------------------------- north: sniper walkway + tower
  box([-16, 3.5, -40], [16, 4, -33], 'metalDark'),
  ramp([-28, 0, -40], [-16, 4, -36], '+x'),
  ramp([16, 0, -40], [28, 4, -36], '-x'),
  box([-10, 0, -34], [-3, 3.5, -33], 'blue'),
  box([3, 0, -34], [10, 3.5, -33], 'blue'),
  box([-16, 4, -33.5], [-9, 5, -33], 'blue'),
  box([-5, 4, -33.5], [5, 5, -33], 'blue'),
  box([9, 4, -33.5], [16, 5, -33], 'blue'),
  box([-3, 4, -40], [3, 6.5, -37], 'blue'),
  stairs([3, 4, -40], [8, 6.5, -38], '-x', 5),
  box([-3, 6.5, -37.4], [-1, 7.4, -37], 'metalDark'),
  box([1, 6.5, -37.4], [3, 7.4, -37], 'metalDark'),
  box([-3, 6.5, -40], [-2.6, 7.4, -37.4], 'metalDark'),

  // ---------------------------------------------------------------- west: balcony over a corridor
  box([-40, 2.5, -12], [-31, 3, 12], 'metalDark'),
  box([-32, 0, -12], [-31, 2.5, -4], 'green'),
  box([-32, 0, 4], [-31, 2.5, 12], 'green'),
  ramp([-40, 0, -21], [-36, 3, -12], '+z'),
  stairs([-40, 0, 12], [-36, 3, 18], '-z', 6),
  box([-31.4, 3, -12], [-31, 4, -5], 'green'),
  box([-31.4, 3, 5], [-31, 4, 12], 'green'),
  box([-38, 3, 2], [-36, 4.2, 3], 'crate'),
  box([-35, 3, -8], [-34, 4.2, -6], 'crate'),

  // ---------------------------------------------------------------- east: generator block + flank corridor
  box([22, 0, -6], [28, 3, 6], 'orange'),
  ramp([23, 0, 6], [27, 3, 15], '-z'),
  box([22, 3, -6], [28, 4, -5.6], 'metalDark'),
  box([22, 3, -5.6], [22.4, 4, -1], 'metalDark'),
  box([22, 3, 1], [22.4, 4, 6], 'metalDark'),
  box([25, 3, -3], [26, 4.2, -2], 'crate'),
  box([33, 0, -22], [34, 4, -4], 'orange'),
  box([33, 0, 4], [34, 4, 22], 'orange'),
  box([37, 0, -12], [39, 1.5, -10], 'crate'),
  box([34, 0, 12], [36, 1.5, 14], 'crate'),
  box([26, 0, -28], [32, 3, -25], 'blue'),

  // ---------------------------------------------------------------- south: bunker with roof access
  // north wall (door in the middle, a window slit on each side)
  box([-12, 0, 26], [-9, 3.5, 27], 'sand'),
  box([-9, 0, 26], [-5, 1.2, 27], 'sand'),
  box([-9, 2.2, 26], [-5, 3.5, 27], 'sand'),
  box([-5, 0, 26], [-2, 3.5, 27], 'sand'),
  box([-2, 2.5, 26], [2, 3.5, 27], 'sand'),
  box([2, 0, 26], [5, 3.5, 27], 'sand'),
  box([5, 0, 26], [9, 1.2, 27], 'sand'),
  box([5, 2.2, 26], [9, 3.5, 27], 'sand'),
  box([9, 0, 26], [12, 3.5, 27], 'sand'),
  // south wall (back door)
  box([-12, 0, 35], [4, 3.5, 36], 'sand'),
  box([4, 2.5, 35], [8, 3.5, 36], 'sand'),
  box([8, 0, 35], [12, 3.5, 36], 'sand'),
  // west wall (side door)
  box([-12, 0, 27], [-11, 3.5, 29], 'sand'),
  box([-12, 2.5, 29], [-11, 3.5, 33], 'sand'),
  box([-12, 0, 33], [-11, 3.5, 35], 'sand'),
  // east wall
  box([11, 0, 27], [12, 3.5, 35], 'sand'),
  // roof + roof access
  box([-12, 3.5, 26], [12, 4, 36], 'metalDark'),
  ramp([12, 0, 30], [24, 4, 34], '-x'),
  box([-12, 4, 26], [-3, 5, 26.4], 'sand'),
  box([3, 4, 26], [12, 5, 26.4], 'sand'),
  box([-12, 4, 26.4], [-11.6, 5, 36], 'sand'),
  box([-11.6, 4, 35.6], [12, 5, 36], 'sand'),
  box([11.6, 4, 26.4], [12, 5, 30], 'sand'),
  box([11.6, 4, 34], [12, 5, 35.6], 'sand'),
  box([-3, 4, 30], [-1, 5.2, 31], 'crate'),
  // interior cover
  box([-9, 0, 28], [-7, 1.5, 30], 'crate'),
  box([5, 0, 32], [7, 1.2, 34], 'crate'),

  // ---------------------------------------------------------------- plaza ring cover
  box([-3, 0, -16], [3, 1.2, -15], 'concrete'),
  box([-3, 0, 15], [3, 1.2, 16], 'concrete'),
  box([-16, 0, -3], [-15, 1.2, 3], 'concrete'),
  box([15, 0, -3], [16, 1.2, 3], 'concrete'),
  box([-13, 0, -13], [-11, 4, -11], 'pillar'),
  box([11, 0, -13], [13, 4, -11], 'pillar'),
  box([-13, 0, 11], [-11, 4, 13], 'pillar'),
  box([11, 0, 11], [13, 4, 13], 'pillar'),

  // ---------------------------------------------------------------- north-west yard
  box([-22, 0, -22], [-14, 3, -21], 'concrete'),
  box([-22, 0, -21], [-21, 3, -15], 'concrete'),
  box([-18, 0, -18], [-16, 1.5, -16], 'crate'),
  box([-16, 0, -18], [-15, 1, -17], 'crate'),
  box([-33, 0, -27], [-31, 1.5, -25], 'crate'),

  // ---------------------------------------------------------------- north-east yard
  box([13, 0, -21], [15, 4, -19], 'pillar'),
  box([19, 0, -15], [21, 4, -13], 'pillar'),
  box([9, 0, -24], [10, 1.2, -18], 'concrete'),
  box([16, 0, -27], [18, 1.5, -25], 'crate'),

  // ---------------------------------------------------------------- south-west yard
  box([-24, 0, 14], [-16, 3, 15], 'concrete'),
  box([-15, 0, 19], [-13, 1.5, 21], 'crate'),
  box([-13, 0, 19], [-12, 1, 20], 'crate'),
  box([-26, 0, 22], [-25, 1.2, 28], 'concrete'),
  box([-25, 0, -1], [-23, 1.5, 1], 'crate'),
  box([-34, 0, 30], [-32, 1.5, 32], 'crate'),

  // ---------------------------------------------------------------- south-east yard
  box([15, 0, 18], [17, 1.5, 20], 'crate'),
  box([17, 0, 18], [18, 1, 19], 'crate'),
  box([28, 0, 20], [29, 3, 28], 'concrete'),
  box([33, 0, 31], [35, 1.5, 33], 'crate'),
];

export default {
  id: 'foundry',
  name: 'Foundry',
  blurb: 'Large mixed arena: plaza, bunker, sniper walkway.',
  bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },

  // Look of each material key used above. `tex` is one of the procedural
  // textures in textures.js; `scale` is world units per texture repeat
  // (omit for "fit to face").
  materials: {
    floor: { color: '#8d939c', tex: 'tiles', scale: 4 },
    wall: { color: '#6f7a88', tex: 'concrete', scale: 5 },
    concrete: { color: '#a9afb6', tex: 'concrete', scale: 4 },
    plaza: { color: '#b9a98e', tex: 'tiles', scale: 2 },
    pillar: { color: '#8f98a3', tex: 'concrete', scale: 3 },
    ramp: { color: '#7f8894', tex: 'plates', scale: 2 },
    metal: { color: '#9aa7b5', tex: 'plates', scale: 2 },
    metalDark: { color: '#59626e', tex: 'plates', scale: 2 },
    crate: { color: '#b98a4e', tex: 'crate' },
    blue: { color: '#4f7fb8', tex: 'plates', scale: 3 },
    orange: { color: '#c9742f', tex: 'plates', scale: 3 },
    green: { color: '#5d9a6a', tex: 'plates', scale: 3 },
    sand: { color: '#c2ad84', tex: 'concrete', scale: 4 },
  },

  sky: {
    top: '#3f78c9',
    horizon: '#c9dcef',
    sunDir: [-0.45, 0.72, 0.52],
    sunColor: '#fff2d6',
    fogNear: 70,
    fogFar: 260,
  },

  // Small fill lights for the roofed areas (no shadows).
  lights: [
    { pos: [0, 2.8, 31], color: '#ffd9a0', intensity: 30, distance: 16 },
    { pos: [-36, 2.0, 0], color: '#a8ffc8', intensity: 26, distance: 16 },
    { pos: [0, 2.8, -36.5], color: '#a0c8ff', intensity: 26, distance: 18 },
  ],

  solids,

  // [x, y, z, yawDegrees]  (yaw 0 faces north / -z)
  spawns: [
    [-36.5, 0, -30.5, -135],
    [36.5, 0, -33.5, 135],
    [-36.5, 0, 36.5, -45],
    [36.5, 0, 36.5, 45],
    [0.5, 0, -26.5, 180],
    [0.5, 0, 21.5, 0],
    [-26.5, 0, 6.5, -90],
    [30.5, 0, -10.5, 90],
    [-20.5, 0, 31.5, -30],
    [18.5, 0, 25.5, 30],
    [-27.5, 0, -30.5, -150],
    [30.5, 0, -32.5, 150],
    [-35.5, 3, -9.5, -90],
    [12.5, 4, -36.5, 180],
    [37.5, 0, 18.5, 20],
    [-6.5, 0, 38.5, 0],
  ],

  // type: health | armor | ammo | crate (full ammo + grenades)
  pickups: [
    { type: 'health', pos: [-35.5, 0, 0.5] },
    { type: 'health', pos: [36.5, 0, 0.5] },
    { type: 'health', pos: [0.5, 0, -36.5] },
    { type: 'health', pos: [5.5, 0, 29.5] },
    { type: 'armor', pos: [0.5, 1, 3.5] },
    { type: 'armor', pos: [0.5, 4, 32.5] },
    { type: 'crate', pos: [0.5, 6.5, -38.5] },
    { type: 'crate', pos: [-35.5, 3, 0.5] },
    { type: 'crate', pos: [25.5, 3, 0.5] },
    { type: 'crate', pos: [-6.5, 0, 31.5] },
    { type: 'ammo', pos: [-25.5, 0, -25.5] },
    { type: 'ammo', pos: [22.5, 0, -22.5] },
    { type: 'ammo', pos: [-20.5, 0, 24.5] },
    { type: 'ammo', pos: [21.5, 0, 23.5] },
    { type: 'ammo', pos: [0.5, 0, -11.5] },
    { type: 'ammo', pos: [0.5, 0, 11.5] },
    { type: 'ammo', pos: [36.5, 0, -30.5] },
    { type: 'ammo', pos: [-36.5, 0, 28.5] },
  ],

  // Capture the Flag bases: [blue, red], each [x, floorY, z]
  flags: [[-30.5, 0, -32.5], [30.5, 0, 34.5]],

  // King of the Hill zones: [x, floorY, z, radius]
  hills: [
    [0.5, 1, 0.5, 4.5], [0.5, 0, 31, 4], [-35.5, 3, 0.5, 3.5],
    [17, 0, -20, 5], [-19, 0, 19.5, 5], [25, 3, 0.5, 3.5],
  ],

  // Points of interest the bots patrol between.
  pois: [
    [0.5, 1, -3.5], [2.5, 1, 2.5],
    [-12.5, 4, -36.5], [12.5, 4, -36.5], [1.5, 6.5, -38.5],
    [-35.5, 3, -9.5], [-35.5, 3, 8.5],
    [-6.5, 4, 30.5], [6.5, 4, 32.5], [0.5, 0, 31.5],
    [25.5, 3, 3.5], [24.5, 3, -3.5],
    [37.5, 0, -15.5], [37.5, 0, 15.5],
    [-36.5, 0, -5.5], [-34.5, 0, 6.5],
    [-13.5, 0, -36.5], [13.5, 0, -36.5],
    [-18.5, 0, -12.5], [17.5, 0, -17.5], [-18.5, 0, 18.5], [20.5, 0, 14.5],
    [0.5, 0, 38.5], [-30.5, 0, 34.5], [30.5, 0, 34.5],
    [-30.5, 0, -32.5], [32.5, 0, -32.5],
    [-9.5, 0, -9.5], [9.5, 0, 9.5], [9.5, 0, -9.5], [-9.5, 0, 9.5],
    [30.5, 0, 0.5], [-27.5, 0, -8.5],
  ],
};
