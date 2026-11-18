// TRAINING RANGE — a practice map (not part of the normal map rotation).
// A firing line with lanes down-range, distance markers, moving targets, a
// close-quarters corner, weapon stands and a challenge pad. Targets and stands
// are defined at the bottom and handled by src/training.js.

const box = (min, max, mat = 'concrete') => ({ type: 'box', min, max, mat });
const ramp = (min, max, dir, mat = 'ramp') => ({ type: 'ramp', min, max, dir, mat });

const LINE = 4; // z of the firing line; distances are measured from here

const solids = [
  // shell
  box([-24, -1, -50], [24, 0, 18], 'floor'),
  box([-25, 0, -51], [25, 10, -50], 'wall'),
  box([-25, 0, 18], [25, 8, 19], 'wall'),
  box([-25, 0, -50], [-24, 8, 18], 'wall'),
  box([24, 0, -50], [25, 8, 18], 'wall'),

  // firing line: counters with gaps to walk down-range
  box([-20, 0, LINE - 0.4], [-6, 1.05, LINE + 0.4], 'metalDark'),
  box([-3, 0, LINE - 0.4], [3, 1.05, LINE + 0.4], 'metalDark'),
  box([6, 0, LINE - 0.4], [12, 1.05, LINE + 0.4], 'metalDark'),

  // lane dividers (low, so you can see across)
  box([-12.2, 0, -44], [-11.8, 0.6, LINE - 1], 'blue'),
  box([-0.2, 0, -44], [0.2, 0.6, LINE - 1], 'blue'),

  // backstop berm + raised far platform
  box([-24, 0, -50], [12, 2.5, -46], 'sand'),
  box([-24, 0, -46], [12, 1.2, -45], 'sand'),
  box([-22, 0, -44.5], [-14, 2, -40], 'concrete'),
  ramp([-14, 0, -44.5], [-10, 2, -40], '-x'),

  // close-quarters corner (right side)
  box([12, 0, -14], [13, 3, 2], 'orange'),
  box([13, 0, -14], [24, 3, -13], 'orange'),
  box([16, 0, -6], [17, 3, -2], 'orange'),
  box([19, 0, -10], [21, 1.4, -8], 'crate'),
  box([14, 0, -11], [15, 1.4, -10], 'crate'),

  // the waiting area behind the line
  box([-22, 0, 14], [-18, 1.4, 16], 'crate'),
  box([18, 0, 14], [22, 1.4, 16], 'crate'),
];

export default {
  id: 'range',
  name: 'Training Range',
  training: true,
  bounds: { minX: -24, maxX: 24, minZ: -50, maxZ: 18 },
  line: LINE,

  materials: {
    floor: { color: '#8b9198', tex: 'tiles', scale: 4 },
    wall: { color: '#6a7480', tex: 'concrete', scale: 5 },
    concrete: { color: '#a9afb6', tex: 'concrete', scale: 4 },
    ramp: { color: '#7f8894', tex: 'plates', scale: 2 },
    metalDark: { color: '#4f5864', tex: 'plates', scale: 2 },
    crate: { color: '#b98a4e', tex: 'crate' },
    blue: { color: '#4f7fb8', tex: 'plates', scale: 3 },
    orange: { color: '#c9742f', tex: 'plates', scale: 3 },
    sand: { color: '#b9a37a', tex: 'concrete', scale: 4 },
  },

  sky: {
    top: '#3f78c9', horizon: '#d2e2f0', sunDir: [-0.4, 0.75, 0.5], sunColor: '#fff2d6', fogNear: 90, fogFar: 300,
  },
  lights: [],
  solids,

  spawns: [[0, 0, 10, 0]],
  pickups: [],
  pois: [[0, 0, 10]],
  hills: [],

  // Targets: kind 'static' | 'moving' (slides between a and b) | 'popup' (stands up at random)
  targets: [
    // lane A (left): 10 / 20 / 30 / 40 m
    { kind: 'static', pos: [-17, 0, LINE - 10] },
    { kind: 'static', pos: [-15, 0, LINE - 20] },
    { kind: 'static', pos: [-17, 0, LINE - 30] },
    { kind: 'static', pos: [-18, 2, LINE - 46] },
    // lane B (middle): moving targets
    { kind: 'moving', a: [-10, 0, LINE - 12], b: [-2, 0, LINE - 12], speed: 2.2 },
    { kind: 'moving', a: [-2, 0, LINE - 24], b: [-10, 0, LINE - 24], speed: 3.2 },
    { kind: 'moving', a: [-10, 0, LINE - 36], b: [-2, 0, LINE - 36], speed: 4.2 },
    // lane C (right of centre): pop-ups
    { kind: 'popup', pos: [3, 0, LINE - 8] },
    { kind: 'popup', pos: [8, 0, LINE - 14] },
    { kind: 'popup', pos: [4, 0, LINE - 22] },
    { kind: 'popup', pos: [9, 0, LINE - 30] },
    { kind: 'popup', pos: [5, 0, LINE - 40] },
    // close quarters
    { kind: 'static', pos: [15, 0, -4] },
    { kind: 'static', pos: [22, 0, -4] },
    { kind: 'static', pos: [19, 0, -11.5] },
    { kind: 'popup', pos: [14.5, 0, -8] },
  ],
  stands: [
    { weapon: 'burst', pos: [-20, 0, 12] },
    { weapon: 'rifle', pos: [-16, 0, 12] },
    { weapon: 'smg', pos: [-12, 0, 12] },
    { weapon: 'shotgun', pos: [-8, 0, 12] },
    { weapon: 'dmr', pos: [-4, 0, 12] },
    { weapon: 'sniper', pos: [8, 0, 12] },
    { weapon: 'lmg', pos: [12, 0, 12] },
  ],
  challengePad: [16, 0, 10],
  markers: [10, 20, 30, 40], // distance stripes, metres from the line
};
