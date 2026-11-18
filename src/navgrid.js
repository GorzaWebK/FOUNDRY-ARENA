// Navigation grid generated automatically from the collision world.
//
// The arena is sampled on a 1x1 grid. Every cell can hold several nodes (one
// per walkable surface height), which lets bots walk both on top of and
// underneath platforms. Edges are:
//   walk  - neighbouring nodes whose heights differ by no more than a step
//   drop  - one-way edges off ledges down to a lower node
// Paths are found with A* (binary heap) and smoothed by the bots at runtime
// using lineClear().

const BODY_R = 0.45; // clearance radius used for walkability (bot radius + margin)
const BODY_H = 1.75;
const STEP = 0.62;
const MAX_DROP = 7;

class Heap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }
  clear() { this.ids.length = 0; this.keys.length = 0; }
  push(id, key) {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop(), lastKey = keys.pop();
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c]; keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}

export class NavGrid {
  constructor(world, cell = 1) {
    this.world = world;
    this.cell = cell;
    const b = world.bounds;
    this.minX = b.minX;
    this.minZ = b.minZ;
    this.w = Math.round((b.maxX - b.minX) / cell);
    this.h = Math.round((b.maxZ - b.minZ) / cell);
    this.px = []; this.py = []; this.pz = [];
    this.layers = new Array(this.w * this.h);
    this.adj = []; this.adjCost = []; this.adjDrop = [];
    this.reachable = [];
    this._build();
    const n = this.px.length;
    this._g = new Float32Array(n);
    this._from = new Int32Array(n);
    this._fromDrop = new Uint8Array(n);
    this._seen = new Int32Array(n);
    this._closed = new Int32Array(n);
    this._stamp = 0;
    this._heap = new Heap();
  }

  get nodeCount() { return this.px.length; }

  _build() {
    const { world, w, h, cell } = this;
    const list = [];
    const tops = [];
    for (let iz = 0; iz < h; iz++) {
      for (let ix = 0; ix < w; ix++) {
        const cx = this.minX + (ix + 0.5) * cell;
        const cz = this.minZ + (iz + 0.5) * cell;
        world.query(cx - 0.02, -100, cz - 0.02, cx + 0.02, 100, cz + 0.02, list);
        tops.length = 0;
        for (const c of list) if (!tops.includes(c.y1)) tops.push(c.y1);
        tops.sort((a, b) => a - b);
        const nodes = [];
        for (const y of tops) {
          // surface must be exposed at the cell centre...
          if (world.overlaps(cx - 0.05, y + 0.02, cz - 0.05, cx + 0.05, y + BODY_H, cz + 0.05)) continue;
          // ...and a body must fit (anything lower than a step is ignored)
          if (world.overlaps(cx - BODY_R, y + STEP, cz - BODY_R, cx + BODY_R, y + BODY_H, cz + BODY_R)) continue;
          const id = this.px.length;
          this.px.push(cx); this.py.push(y); this.pz.push(cz);
          this.adj.push([]); this.adjCost.push([]); this.adjDrop.push([]);
          nodes.push(id);
        }
        this.layers[iz * w + ix] = nodes;
      }
    }

    const R = BODY_R;
    const nodeNear = (ix, iz, y) => {
      if (ix < 0 || iz < 0 || ix >= w || iz >= h) return -1;
      const nodes = this.layers[iz * w + ix];
      let best = -1, bd = STEP;
      for (const id of nodes) {
        const d = Math.abs(this.py[id] - y);
        if (d <= bd) { bd = d; best = id; }
      }
      return best;
    };
    const sweepFree = (a, b) => {
      const y = Math.max(this.py[a], this.py[b]);
      const x0 = Math.min(this.px[a], this.px[b]) - R, x1 = Math.max(this.px[a], this.px[b]) + R;
      const z0 = Math.min(this.pz[a], this.pz[b]) - R, z1 = Math.max(this.pz[a], this.pz[b]) + R;
      return !world.overlaps(x0, y + STEP, z0, x1, y + BODY_H, z1);
    };
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let iz = 0; iz < h; iz++) {
      for (let ix = 0; ix < w; ix++) {
        for (const a of this.layers[iz * w + ix]) {
          const ya = this.py[a];
          for (let d = 0; d < 8; d++) {
            const [dx, dz] = dirs[d];
            const b = nodeNear(ix + dx, iz + dz, ya);
            if (d < 4) {
              if (b >= 0) {
                if (!sweepFree(a, b)) continue;
                this._link(a, b, 1 + Math.abs(this.py[b] - ya) * 0.5, 0);
              } else {
                // drop edge?
                const nx = ix + dx, nz = iz + dz;
                if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
                let low = -1;
                for (const id of this.layers[nz * w + nx]) {
                  if (this.py[id] < ya - STEP && ya - this.py[id] <= MAX_DROP) low = id; // layers ascend
                }
                if (low < 0) continue;
                const bx = this.px[low], bz = this.pz[low], yb = this.py[low];
                if (world.overlaps(bx - R, yb + STEP, bz - R, bx + R, ya + BODY_H, bz + R)) continue;
                // the lip between the two cells must be clear at the upper level
                const mx = (this.px[a] + bx) / 2, mz = (this.pz[a] + bz) / 2;
                if (world.overlaps(mx - R, ya + STEP, mz - R, mx + R, ya + BODY_H, mz + R)) continue;
                this._link(a, low, 1.6 + (ya - yb) * 0.5, 1);
              }
            } else if (b >= 0) {
              const o1 = nodeNear(ix + dx, iz, ya);
              const o2 = nodeNear(ix, iz + dz, ya);
              if (o1 < 0 || o2 < 0) continue;
              if (Math.abs(this.py[o1] - this.py[b]) > STEP || Math.abs(this.py[o2] - this.py[b]) > STEP) continue;
              if (!sweepFree(a, b)) continue;
              this._link(a, b, 1.4142 + Math.abs(this.py[b] - ya) * 0.5, 0);
            }
          }
        }
      }
    }
  }

  _link(a, b, cost, drop) {
    this.adj[a].push(b);
    this.adjCost[a].push(cost);
    this.adjDrop[a].push(drop);
  }

  /** Flood fill from a seed position; only nodes reached are used as goals. */
  markReachable(x, y, z) {
    const n = this.px.length;
    this.reach = new Uint8Array(n);
    const start = this._nearestAny(x, y, z);
    this.reachable = [];
    if (start < 0) return;
    const stack = [start];
    this.reach[start] = 1;
    while (stack.length) {
      const a = stack.pop();
      this.reachable.push(a);
      for (const b of this.adj[a]) if (!this.reach[b]) { this.reach[b] = 1; stack.push(b); }
    }
  }

  cellIndex(x, z) {
    const ix = Math.floor((x - this.minX) / this.cell);
    const iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }

  /** Node in the cell under (x,z) whose height is within `tol` of y, or -1. */
  nodeAt(x, z, y, tol = 0.65) {
    const ci = this.cellIndex(x, z);
    if (ci < 0) return -1;
    const nodes = this.layers[ci];
    let best = -1, bd = tol;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.abs(this.py[nodes[i]] - y);
      if (d <= bd) { bd = d; best = nodes[i]; }
    }
    return best;
  }

  _nearestAny(x, y, z) { return this.nearest(x, y, z, false); }

  /** Closest node to a point (searching outwards over neighbouring cells). */
  nearest(x, y, z, reachableOnly = true) {
    const cix = Math.floor((x - this.minX) / this.cell);
    const ciz = Math.floor((z - this.minZ) / this.cell);
    let best = -1, bs = Infinity;
    for (let ring = 0; ring <= 6; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const ix = cix + dx, iz = ciz + dz;
          if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
          const nodes = this.layers[iz * this.w + ix];
          for (let i = 0; i < nodes.length; i++) {
            const id = nodes[i];
            if (reachableOnly && this.reach && !this.reach[id]) continue;
            const ex = this.px[id] - x, ez = this.pz[id] - z;
            let ey = this.py[id] - y;
            // nodes above us are much "further" than nodes below us
            ey = ey > 0.7 ? ey * 4 : ey * 1.5;
            const s = ex * ex + ez * ez + ey * ey;
            if (s < bs) { bs = s; best = id; }
          }
        }
      }
      if (best >= 0 && ring >= 1) break;
    }
    return best;
  }

  randomNode() {
    const r = this.reachable;
    return r[(Math.random() * r.length) | 0];
  }

  /**
   * A* from one position to another.
   * opts.avoid = {x, z, r, w}: extra cost for nodes within r of a point.
   * Returns { points:[{x,y,z,drop}], cost, complete } or null.
   */
  findPath(sx, sy, sz, gx, gy, gz, opts) {
    const start = this.nearest(sx, sy, sz, false);
    const goal = this.nearest(gx, gy, gz, true);
    if (start < 0 || goal < 0) return null;
    const px = this.px, py = this.py, pz = this.pz;
    const g = this._g, from = this._from, fromDrop = this._fromDrop, seen = this._seen, closed = this._closed;
    const stamp = ++this._stamp;
    const heap = this._heap;
    heap.clear();
    const avoid = opts && opts.avoid;
    const tx = px[goal], ty = py[goal], tz = pz[goal];
    const heur = (n) => {
      const dx = Math.abs(px[n] - tx), dz = Math.abs(pz[n] - tz);
      return (dx > dz ? dx + dz * 0.4142 : dz + dx * 0.4142) + Math.abs(py[n] - ty) * 0.5;
    };
    g[start] = 0; from[start] = -1; seen[start] = stamp;
    heap.push(start, heur(start));
    let bestNode = start, bestH = heur(start);
    let found = false;
    let iter = 0;
    const maxIter = Math.max(20000, this.nodeCount | 0); // (big maps need longer searches)
    while (heap.size > 0 && iter++ < maxIter) {
      const cur = heap.pop();
      if (closed[cur] === stamp) continue;
      closed[cur] = stamp;
      if (cur === goal) { found = true; break; }
      const adj = this.adj[cur], costs = this.adjCost[cur], drops = this.adjDrop[cur];
      const gc = g[cur];
      for (let i = 0; i < adj.length; i++) {
        const nb = adj[i];
        if (closed[nb] === stamp) continue;
        let c = gc + costs[i];
        if (avoid) {
          const ax = px[nb] - avoid.x, az = pz[nb] - avoid.z;
          const d = Math.sqrt(ax * ax + az * az);
          if (d < avoid.r) c += avoid.w * (1 - d / avoid.r);
        }
        if (seen[nb] !== stamp || c < g[nb]) {
          g[nb] = c; from[nb] = cur; fromDrop[nb] = drops[i]; seen[nb] = stamp;
          const hh = heur(nb);
          if (hh < bestH) { bestH = hh; bestNode = nb; }
          heap.push(nb, c + hh);
        }
      }
    }
    const end = found ? goal : bestNode;
    const points = [];
    for (let n = end; n >= 0; n = from[n]) {
      points.push({ x: px[n], y: py[n], z: pz[n], drop: n !== start && fromDrop[n] === 1 });
      if (n === start) break;
    }
    points.reverse();
    return { points, cost: g[end], complete: found };
  }

  /** Height of the walkable surface at (x,z) near y, or NaN. */
  heightAt(x, z, y) {
    const id = this.nodeAt(x, z, y, 0.7);
    return id < 0 ? NaN : this.py[id];
  }

  /**
   * Can a body walk in a straight line from (x0,y0,z0) to (x1,z1) staying on
   * connected walkable cells (no ledges, no walls)?
   */
  lineClear(x0, y0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return this.nodeAt(x0, z0, y0, 0.7) >= 0;
    // Sample densely, with two side rails a body-radius out, so that a wall
    // corner clipping the swept path is never missed.
    const n = Math.ceil(len / 0.2);
    const ox = (-dz / len) * 0.4, oz = (dx / len) * 0.4;
    let y = y0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x0 + dx * t, z = z0 + dz * t;
      const ny = this.heightAt(x, z, y);
      if (ny !== ny) return false;
      if (i > 1) {
        const a = this.heightAt(x + ox, z + oz, y), b = this.heightAt(x - ox, z - oz, y);
        if (a !== a || b !== b) return false;
      }
      y = ny;
    }
    return true;
  }
}
