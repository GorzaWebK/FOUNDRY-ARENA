// Collision world built from map data. Pure JS (no three.js) so it can also be
// used by the offline map checker.
//
// Two collider sets are kept:
//   colliders  - axis-aligned boxes used for character movement. Ramps are
//                approximated here by many shallow steps, which the character
//                controller climbs with its step-up logic.
//   rayShapes  - boxes plus exact wedges (box clipped by a plane) used for
//                bullets and line-of-sight tests.

const GRID = 4; // broadphase cell size
const SURFACE_BY_TEX = { plates: 'metal', corrugated: 'metal', crate: 'wood', concrete: 'concrete', tiles: 'concrete', brick: 'concrete' };
const RAMP_STEP = 0.125;

function mk(x0, y0, z0, x1, y1, z1) {
  return { x0, y0, z0, x1, y1, z1, plane: null, stamp: 0 };
}

// Slice of a footprint along the "uphill" direction, f0..f1 in 0..1.
function slice(dir, f0, f1, x0, z0, x1, z1) {
  switch (dir) {
    case '+x': return [x0 + (x1 - x0) * f0, z0, x0 + (x1 - x0) * f1, z1];
    case '-x': return [x1 - (x1 - x0) * f1, z0, x1 - (x1 - x0) * f0, z1];
    case '+z': return [x0, z0 + (z1 - z0) * f0, x1, z0 + (z1 - z0) * f1];
    case '-z': return [x0, z1 - (z1 - z0) * f1, x1, z1 - (z1 - z0) * f0];
    default: throw new Error('bad dir ' + dir);
  }
}

export class World {
  constructor(map) {
    this.map = map;
    this.bounds = map.bounds;
    this.colliders = [];
    this.rayShapes = [];
    this.renderItems = [];
    this._stamp = 0;
    for (const s of map.solids) this._addSolid(s);
    this._buildGrid();
    // props (oil drums) tucked into corners: generated from the map, the same on
    // every machine, and solid like any other cover
    this.props = [];
    if (map.decor && map.decor.barrels) { this._placeProps(map.decor.barrels); if (this.props.length) this._buildGrid(); }
    // what each material sounds like underfoot: a map can say (materials[m].surface),
    // otherwise it follows from the texture
    this.surfaces = {};
    for (const [name, def] of Object.entries(map.materials || {})) {
      this.surfaces[name] = def.surface || SURFACE_BY_TEX[def.tex] || (/sand|dirt|gravel/.test(name) ? 'sand' : 'concrete');
    }
  }

  /** Is any movement collider inside this box? (`except`: one to ignore) */
  blocked(x0, y0, z0, x1, y1, z1, except = null) {
    const out = this._blkQ || (this._blkQ = []);
    this.query(x0, y0, z0, x1, y1, z1, out);
    for (const c of out) {
      if (c === except) continue;
      if (c.x1 > x0 && c.x0 < x1 && c.y1 > y0 && c.y0 < y1 && c.z1 > z0 && c.z0 < z1) return true;
    }
    return false;
  }

  /**
   * Drums in open corners of big floors: a cell with a tall wall on one x side and
   * one z side, open on the other two, away from spawns, pickups, objectives and
   * anything you'd climb. Seeded by the map id, so it's the same everywhere.
   */
  _placeProps(max) {
    const map = this.map, b = this.bounds;
    let seed = 0;
    for (const ch of map.id) seed = (Math.imul(seed ^ ch.charCodeAt(0), 2654435761) + 1) >>> 0;
    const rand = () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
    const keep = [
      ...map.spawns, ...map.pickups.map((p) => p.pos), ...(map.flags || []), ...(map.hills || []), ...(map.pois || []),
    ].map((p) => [p[0], p[1], p[2]]);
    const out = [];
    const cands = [];
    for (let z = Math.ceil(b.minZ) + 0.5; z < b.maxZ; z += 1) {
      for (let x = Math.ceil(b.minX) + 0.5; x < b.maxX; x += 1) {
        // the floor here: the highest top under the cell centre with headroom above it
        this.query(x - 0.01, -2, z - 0.01, x + 0.01, 12, z + 0.01, out);
        let floor = null;
        for (const c of out) {
          if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) continue;
          if ((c.x1 - c.x0) * (c.z1 - c.z0) < 30) continue; // big floors only (not catwalks or crates)
          if (!floor || c.y1 > floor.y1) floor = c;
        }
        if (!floor) continue;
        const y = floor.y1;
        if (this.blocked(x - 0.45, y + 0.02, z - 0.45, x + 0.45, y + 2.3, z + 0.45)) continue;
        const wall = (dx, dz) => this.blocked(x + dx - 0.2, y + 1.4, z + dz - 0.2, x + dx + 0.2, y + 2.4, z + dz + 0.2);
        const wx = wall(-1, 0) ? -1 : wall(1, 0) ? 1 : 0;
        const wz = wall(0, -1) ? -1 : wall(0, 1) ? 1 : 0;
        if (!wx || !wz) continue;
        // open the other way, so a drum never closes off a gap
        if (this.blocked(x - wx * 2 - 0.4, y + 0.02, z - wz * 2 - 0.4, x - wx * 2 + 0.4, y + 2, z - wz * 2 + 0.4)) continue;
        if (this.blocked(x - wx - 0.45, y + 0.02, z - 0.45, x - wx + 0.45, y + 2, z + 0.45)) continue;
        if (this.blocked(x - 0.45, y + 0.02, z - wz - 0.45, x + 0.45, y + 2, z - wz + 0.45)) continue;
        // nothing low nearby (steps, ramps, crates): keep climbing routes as they are
        this.query(x - 2.5, y + 0.05, z - 2.5, x + 2.5, y + 1.6, z + 2.5, out);
        if (out.some((c) => c.y0 <= y + 0.05 && c.y1 > y + 0.05 && c.y1 < y + 1.8)) continue;
        if (keep.some((p) => Math.hypot(p[0] - x, p[2] - z) < 4 && Math.abs(p[1] - y) < 3)) continue;
        cands.push({ x, y, z, wx, wz });
      }
    }
    // shuffle, then take spaced-out picks
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    const placed = [];
    for (const c of cands) {
      if (placed.length >= max) break;
      if (placed.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 9)) continue;
      placed.push(c);
      // snug into the corner
      const px = c.x + c.wx * 0.08, pz = c.z + c.wz * 0.08;
      this._addProp(px, c.y, pz, rand);
      // sometimes a second drum along the longer wall
      if (rand() < 0.5) {
        const alongX = rand() < 0.5;
        const nx = alongX ? px - c.wx * 0.82 : px, nz = alongX ? pz : pz - c.wz * 0.82;
        if (!this.blocked(nx - 0.4, c.y + 0.02, nz - 0.4, nx + 0.4, c.y + 2, nz + 0.4)) this._addProp(nx, c.y, nz, rand);
      }
    }
  }

  _addProp(x, y, z, rand) {
    const r = 0.38, h = 0.95;
    const c = mk(x - r, y, z - r, x + r, y + h, z + r);
    c.mat = 'barrel';
    this.colliders.push(c);
    this.rayShapes.push(c);
    this.props.push({ kind: 'barrel', x, y, z, r, h, v: rand(), spin: rand() * Math.PI * 2 });
  }

  /** The surface under a point at foot level: 'metal', 'wood', 'concrete' or 'sand'. */
  surfaceAt(x, y, z) {
    const out = this._surfQ || (this._surfQ = []);
    this.query(x - 0.05, y - 0.4, z - 0.05, x + 0.05, y + 0.05, z + 0.05, out);
    let best = null;
    for (const c of out) {
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1 || c.y1 > y + 0.08) continue;
      if (!best || c.y1 > best.y1) best = c;
    }
    return (best && (best.mat === 'barrel' ? 'metal' : this.surfaces[best.mat])) || 'concrete';
  }

  _addSolid(s) {
    const [x0, y0, z0] = s.min;
    const [x1, y1, z1] = s.max;
    const mat = s.mat || 'concrete';
    if (s.type === 'box') {
      const c = mk(x0, y0, z0, x1, y1, z1);
      c.mat = mat;
      this.colliders.push(c);
      this.rayShapes.push(c);
      this.renderItems.push({ kind: 'box', x0, y0, z0, x1, y1, z1, mat });
    } else if (s.type === 'stairs') {
      const n = s.steps;
      for (let i = 0; i < n; i++) {
        const [sx0, sz0, sx1, sz1] = slice(s.dir, i / n, (i + 1) / n, x0, z0, x1, z1);
        const top = y0 + ((y1 - y0) * (i + 1)) / n;
        const c = mk(sx0, y0, sz0, sx1, top, sz1);
        c.mat = mat;
        this.colliders.push(c);
        this.rayShapes.push(c);
        this.renderItems.push({ kind: 'box', x0: sx0, y0, z0: sz0, x1: sx1, y1: top, z1: sz1, mat });
      }
    } else if (s.type === 'ramp') {
      const rise = y1 - y0;
      const n = Math.max(1, Math.ceil(rise / RAMP_STEP));
      for (let i = 0; i < n; i++) {
        const [sx0, sz0, sx1, sz1] = slice(s.dir, i / n, (i + 1) / n, x0, z0, x1, z1);
        const c = mk(sx0, y0, sz0, sx1, y0 + (rise * (i + 0.5)) / n, sz1);
        c.mat = mat;
        this.colliders.push(c);
      }
      // exact wedge for rays: box ∩ { n·p <= d }
      const w = mk(x0, y0, z0, x1, y1, z1);
      let nx = 0, ny = 0, nz = 0, d = 0;
      if (s.dir === '+x') { const run = x1 - x0; nx = -rise; ny = run; d = y0 * run - x0 * rise; }
      else if (s.dir === '-x') { const run = x1 - x0; nx = rise; ny = run; d = y0 * run + x1 * rise; }
      else if (s.dir === '+z') { const run = z1 - z0; nz = -rise; ny = run; d = y0 * run - z0 * rise; }
      else { const run = z1 - z0; nz = rise; ny = run; d = y0 * run + z1 * rise; }
      const len = Math.hypot(nx, ny, nz);
      w.plane = { nx: nx / len, ny: ny / len, nz: nz / len, d: d / len };
      this.rayShapes.push(w);
      this.renderItems.push({ kind: 'wedge', x0, y0, z0, x1, y1, z1, dir: s.dir, mat });
    } else {
      throw new Error('unknown solid type ' + s.type);
    }
  }

  _buildGrid() {
    const b = this.bounds;
    this.gx0 = b.minX - 2 * GRID;
    this.gz0 = b.minZ - 2 * GRID;
    this.gw = Math.ceil((b.maxX - b.minX) / GRID) + 4;
    this.gh = Math.ceil((b.maxZ - b.minZ) / GRID) + 4;
    this.cells = Array.from({ length: this.gw * this.gh }, () => []);
    for (const c of this.colliders) {
      const ix0 = this._cx(c.x0), ix1 = this._cx(c.x1);
      const iz0 = this._cz(c.z0), iz1 = this._cz(c.z1);
      for (let iz = iz0; iz <= iz1; iz++)
        for (let ix = ix0; ix <= ix1; ix++) this.cells[iz * this.gw + ix].push(c);
    }
  }

  _cx(x) { const i = Math.floor((x - this.gx0) / GRID); return i < 0 ? 0 : i >= this.gw ? this.gw - 1 : i; }
  _cz(z) { const i = Math.floor((z - this.gz0) / GRID); return i < 0 ? 0 : i >= this.gh ? this.gh - 1 : i; }

  /** Collect movement colliders overlapping the AABB into `out`. Returns count. */
  query(x0, y0, z0, x1, y1, z1, out) {
    out.length = 0;
    const stamp = ++this._stamp;
    const ix0 = this._cx(x0), ix1 = this._cx(x1), iz0 = this._cz(z0), iz1 = this._cz(z1);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const cell = this.cells[iz * this.gw + ix];
        for (let i = 0; i < cell.length; i++) {
          const c = cell[i];
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.x0 < x1 && c.x1 > x0 && c.y0 < y1 && c.y1 > y0 && c.z0 < z1 && c.z1 > z0) out.push(c);
        }
      }
    }
    return out.length;
  }

  /** True if any movement collider overlaps the AABB. */
  overlaps(x0, y0, z0, x1, y1, z1) {
    const ix0 = this._cx(x0), ix1 = this._cx(x1), iz0 = this._cz(z0), iz1 = this._cz(z1);
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const cell = this.cells[iz * this.gw + ix];
        for (let i = 0; i < cell.length; i++) {
          const c = cell[i];
          if (c.x0 < x1 && c.x1 > x0 && c.y0 < y1 && c.y1 > y0 && c.z0 < z1 && c.z1 > z0) return true;
        }
      }
    }
    return false;
  }

  /**
   * Ray vs. world. Direction must be normalised. Fills `hit` {t,nx,ny,nz} with
   * the nearest intersection and returns true, or returns false.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, hit) {
    let best = maxDist;
    let bnx = 0, bny = 0, bnz = 0;
    let found = false;
    const shapes = this.rayShapes;
    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i];
      let tmin = 0, tmax = best;
      let nx = 0, ny = 0, nz = 0;
      // x slab
      if (dx > -1e-9 && dx < 1e-9) { if (ox < s.x0 || ox > s.x1) continue; }
      else {
        let t1 = (s.x0 - ox) / dx, t2 = (s.x1 - ox) / dx, sn = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sn = 1; }
        if (t1 > tmin) { tmin = t1; nx = sn; ny = 0; nz = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      // y slab
      if (dy > -1e-9 && dy < 1e-9) { if (oy < s.y0 || oy > s.y1) continue; }
      else {
        let t1 = (s.y0 - oy) / dy, t2 = (s.y1 - oy) / dy, sn = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sn = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = sn; nz = 0; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      // z slab
      if (dz > -1e-9 && dz < 1e-9) { if (oz < s.z0 || oz > s.z1) continue; }
      else {
        let t1 = (s.z0 - oz) / dz, t2 = (s.z1 - oz) / dz, sn = -1;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; sn = 1; }
        if (t1 > tmin) { tmin = t1; nx = 0; ny = 0; nz = sn; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) continue;
      }
      const p = s.plane;
      if (p) {
        const denom = p.nx * dx + p.ny * dy + p.nz * dz;
        const dist = p.d - (p.nx * ox + p.ny * oy + p.nz * oz);
        if (denom > -1e-9 && denom < 1e-9) { if (dist < 0) continue; }
        else {
          const t = dist / denom;
          if (denom > 0) { if (t < tmax) tmax = t; }
          else if (t > tmin) { tmin = t; nx = p.nx; ny = p.ny; nz = p.nz; }
          if (tmin > tmax) continue;
        }
      }
      if (tmin < best) { best = tmin; bnx = nx; bny = ny; bnz = nz; found = true; }
    }
    if (found && hit) { hit.t = best; hit.nx = bnx; hit.ny = bny; hit.nz = bnz; }
    return found;
  }

  /** True if the segment a→b is blocked by world geometry. */
  segmentBlocked(ax, ay, az, bx, by, bz) {
    let dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return false;
    dx /= len; dy /= len; dz /= len;
    return this.raycast(ax, ay, az, dx, dy, dz, len - 0.02, null);
  }
}
