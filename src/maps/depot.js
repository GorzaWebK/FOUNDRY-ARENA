// "DEPOT" — a roofed, three-storey warehouse. Shelving aisles on the ground floor, a
// mezzanine ring around the walls at 4 m, and a high catwalk at 8 m across the
// middle, reached from towers at each end. Fights happen on every level.
// See arena.js for the format and editing tips.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });
const stairs = (min, max, dir, steps, mat = 'ramp') => ({ type: 'stairs', min, max, dir, steps, mat });
// spawn facing the middle of the map
const sp = (x, y, z) => [x, y, z, Math.round((Math.atan2(x, z) * 180) / Math.PI)];

const solids = [
  // shell: tall walls, roof beams and a roof with three long skylights
  box([-36, -1, -24], [36, 0, 24], 'floor'),
  box([-37, 0, -25], [37, 15, -24], 'wall'),
  box([-37, 0, 24], [37, 15, 25], 'wall'),
  box([-37, 0, -24], [-36, 15, 24], 'wall'),
  box([36, 0, -24], [37, 15, 24], 'wall'),
  ...[-18, -6, 6, 18].map((z) => box([-36, 13, z - 0.3], [36, 13.6, z + 0.3], 'metalDark')),
  box([-36, 14, -24], [36, 14.6, -13], 'roof'),
  box([-36, 14, -9], [36, 14.6, -2], 'roof'),
  box([-36, 14, 2], [36, 14.6, 9], 'roof'),
  box([-36, 14, 13], [36, 14.6, 24], 'roof'),
  ...[[-13, -9], [-2, 2], [9, 13]].flatMap(([z0, z1]) => [
    box([-36, 14, z0], [-28, 14.6, z1], 'roof'), box([28, 14, z0], [36, 14.6, z1], 'roof'),
    // skylight frames
    ...[-14, 0, 14].map((x) => box([x - 0.15, 14, z0], [x + 0.15, 14.6, z1], 'metalDark')),
  ]),

  // ---------------------------------------------------------------- mezzanine ring (y 4)
  box([-36, 3.5, -24], [36, 4, -18], 'metal'),
  box([-36, 3.5, 18], [36, 4, 24], 'metal'),
  box([-36, 3.5, -18], [-30, 4, 18], 'metal'),
  box([30, 3.5, -18], [36, 4, 18], 'metal'),
  // support columns under its inner edge
  ...[-26, -18, -2, 2, 18, 26].flatMap((x) => [box([x - 0.3, 0, -19], [x + 0.3, 3.5, -18.4], 'pillar'), box([x - 0.3, 0, 18.4], [x + 0.3, 3.5, 19], 'pillar')]),
  ...[-14, 14].flatMap((z) => [box([-31, 0, z - 0.3], [-30.4, 3.5, z + 0.3], 'pillar'), box([30.4, 0, z - 0.3], [31, 3.5, z + 0.3], 'pillar')]),
  // railings along the inner edge, open where the stairs arrive
  box([-30, 4, -18.4], [-14, 5, -18], 'metalDark'), box([-10, 4, -18.4], [10, 5, -18], 'metalDark'), box([14, 4, -18.4], [30, 5, -18], 'metalDark'),
  box([-30, 4, 18], [-14, 5, 18.4], 'metalDark'), box([-10, 4, 18], [10, 5, 18.4], 'metalDark'), box([14, 4, 18], [30, 5, 18.4], 'metalDark'),
  box([-30.4, 4, -18], [-30, 5, -6], 'metalDark'), box([-30.4, 4, 12], [-30, 5, 18], 'metalDark'),
  box([30, 4, -18], [30.4, 5, -12], 'metalDark'), box([30, 4, 6], [30.4, 5, 18], 'metalDark'),
  // stairs up from the floor
  stairs([-14, 0, -18], [-10, 4, -10], '-z', 8),
  stairs([10, 0, -18], [14, 4, -10], '-z', 8),
  stairs([-14, 0, 10], [-10, 4, 18], '+z', 8),
  stairs([10, 0, 10], [14, 4, 18], '+z', 8),
  stairs([-30, 0, 8], [-22, 4, 12], '-x', 8),
  stairs([22, 0, -12], [30, 4, -8], '+x', 8),
  // crates up on the mezzanine
  box([-24, 4, -23], [-22, 5.2, -21], 'crate'), box([22, 4, 21], [24, 5.2, 23], 'crate'),
  box([4, 4, -23.5], [6, 5.2, -22], 'crate'), box([-6, 4, 22], [-4, 5.2, 23.5], 'crate'),
  box([-35.5, 4, -17], [-34, 5.2, -15], 'crate'), box([34, 4, 15], [35.5, 5.2, 17], 'crate'),

  // ---------------------------------------------------------------- towers + catwalk (y 8)
  stairs([-36, 4, -14], [-32, 8, -6], '+z', 8),
  stairs([32, 4, 6], [36, 8, 14], '-z', 8),
  box([-36, 7.6, -6], [-30, 8, 6], 'metalDark'),
  box([30, 7.6, -6], [36, 8, 6], 'metalDark'),
  box([-30, 7.6, -3], [-24, 8, 3], 'metalDark'),
  box([24, 7.6, -3], [30, 8, 3], 'metalDark'),
  box([-24, 7.6, -1.5], [24, 8, 1.5], 'metal'),
  // catwalk rails (open in the middle, so you can drop down)
  box([-24, 8, -1.5], [-4, 8.9, -1.3], 'metalDark'), box([4, 8, -1.5], [24, 8.9, -1.3], 'metalDark'),
  box([-24, 8, 1.3], [-4, 8.9, 1.5], 'metalDark'), box([4, 8, 1.3], [24, 8.9, 1.5], 'metalDark'),
  // tower cover
  box([-29, 8, 2.2], [-27, 9.2, 3], 'crate'), box([27, 8, -3], [29, 9.2, -2.2], 'crate'),
  // hangers holding the catwalk up
  ...[-16, -8, 8, 16].flatMap((x) => [box([x - 0.1, 8.9, -1.5], [x + 0.1, 13, -1.3], 'metalDark'), box([x - 0.1, 8.9, 1.3], [x + 0.1, 13, 1.5], 'metalDark')]),

  // ---------------------------------------------------------------- ground floor
  // shelving racks
  box([-22, 0, -9], [-6, 3, -8], 'orange'), box([6, 0, -9], [22, 3, -8], 'orange'),
  box([-22, 0, 8], [-6, 3, 9], 'orange'), box([6, 0, 8], [22, 3, 9], 'orange'),
  ...[-22, -14, -6].flatMap((x) => [box([x, 3, -9], [x + 0.3, 3.4, -8], 'metalDark')]),
  // pallets and crates
  box([-3, 0, -3], [-1, 1.5, -1], 'crate'), box([1, 0, 1], [3, 1.5, 3], 'crate'),
  box([-18, 0, -15], [-16, 1.2, -13], 'crate'), box([16, 0, 13], [18, 1.2, 15], 'crate'),
  box([-18, 0, 13], [-15, 1.5, 15], 'crate'), box([15, 0, -15], [18, 1.5, -13], 'crate'),
  box([-8, 0, -4], [-6, 2.4, -2], 'crate'), box([6, 0, 2], [8, 2.4, 4], 'crate'),
  box([-22, 0, -3], [-20, 1.2, 1], 'crate'), box([20, 0, -1], [22, 1.2, 3], 'crate'),
  box([-27, 0, -17], [-25, 1.5, -16], 'crate'), box([25, 0, 16], [27, 1.5, 17], 'crate'),
  // a parked forklift-ish block by each base
  box([-34, 0, -6], [-32, 1.8, -3], 'green'), box([32, 0, 3], [34, 1.8, 6], 'green'),
];

export default {
  id: 'depot',
  name: 'Depot',
  blurb: 'Three-storey warehouse: aisles, a mezzanine ring and a high catwalk.',
  bounds: { minX: -36, maxX: 36, minZ: -24, maxZ: 24 },

  materials: {
    floor: { color: '#8a8f94', tex: 'concrete', scale: 4 },
    wall: { color: '#7a8088', tex: 'corrugated', scale: 4 },
    concrete: { color: '#a9afb6', tex: 'concrete', scale: 4 },
    pillar: { color: '#c9a23a', tex: 'plates', scale: 2 },
    ramp: { color: '#6f7a86', tex: 'plates', scale: 2 },
    metal: { color: '#7d8a98', tex: 'plates', scale: 2 },
    metalDark: { color: '#4f5864', tex: 'plates', scale: 2 },
    roof: { color: '#7b838c', tex: 'corrugated', scale: 4 },
    crate: { color: '#b98a4e', tex: 'crate' },
    orange: { color: '#c9742f', tex: 'plates', scale: 2 },
    green: { color: '#5d8a5a', tex: 'plates', scale: 2 },
  },

  sky: {
    top: '#55606e',
    horizon: '#b8c0c8',
    sunDir: [0.3, 0.85, 0.25],
    sunColor: '#f2f0ea',
    fogNear: 60,
    fogFar: 200,
  },

  // the roof makes it an indoor map: work lights hung from the beams fill it in
  lights: [
    { pos: [0, 3, -21], color: '#ffe2b0', intensity: 26, distance: 16 },
    { pos: [0, 3, 21], color: '#ffe2b0', intensity: 26, distance: 16 },
    { pos: [-33, 3, 0], color: '#a0c8ff', intensity: 24, distance: 14 },
    { pos: [33, 3, 0], color: '#ffc890', intensity: 24, distance: 14 },
    { pos: [0, 7, 0], color: '#ffffff', intensity: 20, distance: 18 },
    { pos: [-18, 12, -12], color: '#fff1d6', intensity: 60, distance: 24 },
    { pos: [18, 12, 12], color: '#fff1d6', intensity: 60, distance: 24 },
    { pos: [18, 12, -12], color: '#fff1d6', intensity: 60, distance: 24 },
    { pos: [-18, 12, 12], color: '#fff1d6', intensity: 60, distance: 24 },
  ],

  // menu background camera: circle inside, under the roof
  orbit: { r: 21, h: 11, lookY: 1 },

  solids,

  spawns: [
    sp(-32.5, 0, -12.5), sp(32.5, 0, 12.5), sp(-32.5, 0, 14.5), sp(32.5, 0, -14.5),
    sp(-20.5, 0, -20.5), sp(20.5, 0, 20.5), sp(20.5, 0, -20.5), sp(-20.5, 0, 20.5),
    sp(0.5, 0, -14.5), sp(0.5, 0, 14.5), sp(-14.5, 0, 0.5), sp(14.5, 0, 0.5),
    sp(-20.5, 4, -21.5), sp(20.5, 4, 21.5), sp(-33.5, 4, 15.5), sp(33.5, 4, -15.5),
    sp(-27.5, 8, -0.5), sp(27.5, 8, 0.5),
  ],

  pickups: [
    { type: 'health', pos: [-33.5, 0, 0.5] },
    { type: 'health', pos: [33.5, 0, 0.5] },
    { type: 'health', pos: [0.5, 4, -21.5] },
    { type: 'health', pos: [0.5, 4, 21.5] },
    { type: 'armor', pos: [0.5, 0, 0.5] },
    { type: 'armor', pos: [0.5, 8, 0.5] },
    { type: 'crate', pos: [-27.5, 8, 1.5] },
    { type: 'crate', pos: [27.5, 8, -1.5] },
    { type: 'ammo', pos: [-8.5, 0, -13.5] },
    { type: 'ammo', pos: [8.5, 0, 13.5] },
    { type: 'ammo', pos: [13.5, 0, -4.5] },
    { type: 'ammo', pos: [-13.5, 0, 4.5] },
    { type: 'ammo', pos: [-33.5, 4, 9.5] },
    { type: 'ammo', pos: [33.5, 4, -9.5] },
  ],

  flags: [[-26.5, 0, -12.5], [26.5, 0, 12.5]],

  hills: [
    [0.5, 0, 0.5, 4], [0.5, 8, 0.5, 2.5], [0.5, 4, -21, 3], [0.5, 4, 21, 3],
    [-33, 4, 0.5, 2.5], [33, 4, 0.5, 2.5],
  ],

  pois: [
    [0.5, 0, -5.5], [0.5, 0, 5.5], [-12.5, 0, -0.5], [12.5, 0, 0.5],
    [-14.5, 0, -12.5], [14.5, 0, 12.5], [-2.5, 0, -12.5], [2.5, 0, 12.5],
    [-26.5, 0, -20.5], [26.5, 0, 20.5], [-26.5, 0, 4.5], [26.5, 0, -4.5],
    [-20.5, 4, -21.5], [20.5, 4, 21.5], [8.5, 4, -21.5], [-8.5, 4, 21.5],
    [-33.5, 4, -4.5], [33.5, 4, 4.5], [-33.5, 4, 16.5], [33.5, 4, -16.5],
    [-12.5, 8, 0.5], [12.5, 8, 0.5], [-33.5, 8, 2.5], [33.5, 8, -2.5],
  ],
};
