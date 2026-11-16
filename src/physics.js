// Kinematic character controller: an upright box (square footprint) moved
// against the world's axis-aligned colliders, one axis at a time, with
// step-up (stairs / ramps / kerbs) and step-down ground snapping.
//
// A body needs: pos (feet centre, {x,y,z}), vel, radius, height, onGround,
// stepOffset (visual smoothing accumulator), extX/extZ (external push).

import { CFG } from './config.js';

const EPS = 0.001;
const list = [];

function moveAxis(world, b, axis, delta) {
  if (delta === 0) return;
  const p = b.pos, r = b.radius, h = b.height;
  const nx = axis === 0 ? p.x + delta : p.x;
  const nz = axis === 2 ? p.z + delta : p.z;
  const n = world.query(nx - r, p.y + EPS, nz - r, nx + r, p.y + h, nz + r, list);
  if (n === 0) { p.x = nx; p.z = nz; return; }

  // Try to step up onto low obstacles.
  if (b.onGround) {
    let top = -Infinity;
    for (let i = 0; i < n; i++) if (list[i].y1 > top) top = list[i].y1;
    const rise = top - p.y;
    if (rise <= CFG.stepUp + EPS) {
      const free =
        !world.overlaps(nx - r, top + EPS, nz - r, nx + r, top + h, nz + r) &&
        !world.overlaps(p.x - r, p.y + h, p.z - r, p.x + r, top + h, p.z + r);
      if (free) {
        p.x = nx; p.z = nz; p.y = top;
        b.stepOffset -= rise;
        return;
      }
      // the step-up test clobbers nothing in `list` (overlaps() doesn't write)
    }
  }

  // Blocked: slide up to the contact plane.
  if (axis === 0) {
    if (delta > 0) {
      let lim = Infinity;
      for (let i = 0; i < n; i++) lim = Math.min(lim, list[i].x0 - r - EPS);
      p.x = Math.max(p.x, Math.min(nx, lim));
    } else {
      let lim = -Infinity;
      for (let i = 0; i < n; i++) lim = Math.max(lim, list[i].x1 + r + EPS);
      p.x = Math.min(p.x, Math.max(nx, lim));
    }
    b.vel.x = 0;
    b.hitWall = true;
  } else {
    if (delta > 0) {
      let lim = Infinity;
      for (let i = 0; i < n; i++) lim = Math.min(lim, list[i].z0 - r - EPS);
      p.z = Math.max(p.z, Math.min(nz, lim));
    } else {
      let lim = -Infinity;
      for (let i = 0; i < n; i++) lim = Math.max(lim, list[i].z1 + r + EPS);
      p.z = Math.min(p.z, Math.max(nz, lim));
    }
    b.vel.z = 0;
    b.hitWall = true;
  }
}

function moveVertical(world, b, dy) {
  const p = b.pos, r = b.radius, h = b.height;
  const oldY = p.y;
  p.y += dy;
  const n = world.query(p.x - r, p.y, p.z - r, p.x + r, p.y + h, p.z + r, list);
  if (n === 0) return false;
  if (dy <= 0) {
    let top = -Infinity;
    for (let i = 0; i < n; i++) {
      const c = list[i];
      if (c.y1 <= oldY + 0.02 && c.y1 > top) top = c.y1;
    }
    if (top > -Infinity) {
      p.y = top;
      b.vel.y = 0;
      return true;
    }
    return false;
  }
  let ceil = Infinity;
  for (let i = 0; i < n; i++) {
    const c = list[i];
    if (c.y0 >= oldY + h - 0.02 && c.y0 < ceil) ceil = c.y0;
  }
  if (ceil < Infinity) {
    p.y = ceil - h - EPS;
    if (b.vel.y > 0) b.vel.y = 0;
  }
  return false;
}

/** Move a body by its velocity over dt, resolving collisions. */
export function moveBody(world, b, dt) {
  const p = b.pos, v = b.vel;
  const wasGround = b.onGround;
  b.hitWall = false;

  // Failsafe: if somehow embedded in geometry, float up until free.
  if (world.overlaps(p.x - b.radius + 0.02, p.y + 0.05, p.z - b.radius + 0.02,
    p.x + b.radius - 0.02, p.y + b.height - 0.05, p.z + b.radius - 0.02)) {
    p.y += 0.15;
    v.y = 0;
    return;
  }

  const tx = v.x * dt + b.extX;
  const tz = v.z * dt + b.extZ;
  const ty = v.y * dt;
  b.extX = 0; b.extZ = 0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(tx), Math.abs(ty), Math.abs(tz)) / 0.25));
  let grounded = false;
  for (let s = 0; s < steps; s++) {
    moveAxis(world, b, 0, tx / steps);
    moveAxis(world, b, 2, tz / steps);
    grounded = moveVertical(world, b, ty / steps);
    if (grounded) b.onGround = true; // enables step-up for following substeps
  }
  b.onGround = grounded;

  // Stick to the ground when walking down steps / ramps.
  if (wasGround && !grounded && v.y <= 0) {
    const r = b.radius;
    const n = world.query(p.x - r, p.y - CFG.stepDown, p.z - r, p.x + r, p.y, p.z + r, list);
    if (n > 0) {
      let top = -Infinity;
      for (let i = 0; i < n; i++) if (list[i].y1 <= p.y + 0.02 && list[i].y1 > top) top = list[i].y1;
      if (top > -Infinity) {
        b.stepOffset += p.y - top;
        p.y = top;
        v.y = 0;
        b.onGround = true;
      }
    }
  }

  // Safety net below the floor.
  if (p.y < -20) { p.y = 5; v.y = 0; }
}

/** Can the body stand up to `height` where it is? */
export function hasHeadroom(world, b, height) {
  const p = b.pos, r = b.radius;
  return !world.overlaps(p.x - r, p.y + b.height - 0.01, p.z - r, p.x + r, p.y + height, p.z + r);
}
