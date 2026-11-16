// SABLEPOINT — navigation. A 1 m grid over the yard, A* over it, and the
// 2D segment-vs-box tests the bots use for line of sight and hearing. Pure
// math: no three.js, no allocations in the hot path beyond the path arrays.

import { CONFIG } from './config.js';

// An axis-aligned box in XZ space. Colliders from map.js use this shape.
export function boxContains(b, x, z) {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

// Does the segment (ax,az)->(bx,bz) hit box b? Slab test in 2D.
export function segmentHitsBox(ax, az, bx, bz, b) {
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  const axes = [
    [ax, dx, b.minX, b.maxX],
    [az, dz, b.minZ, b.maxZ],
  ];
  for (let a = 0; a < 2; a++) {
    const [o, d, lo, hi] = axes[a];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let ta = (lo - o) / d, tb = (hi - o) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
  }
  return true;
}

// Line of sight between two points, blocked by any collider. y is ignored:
// walls are full height, crates are chest-high and still block sight for the
// crouch-height check the caller does separately.
export function hasLineOfSight(ax, az, bx, bz, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    if (segmentHitsBox(ax, az, bx, bz, colliders[i])) return false;
  }
  return true;
}

// Ray vs the wall colliders, for bullets: returns distance along the ray to
// the first box hit, or Infinity. dir must be normalized.
export function rayHitDistance(ox, oy, oz, dx, dy, dz, colliders, maxDist) {
  let best = maxDist;
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    // 3D slab test; the collider's Y span is [0, b.height].
    let t0 = 0, t1 = best;
    let ok = true;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    const lo = [b.minX, 0, b.minZ], hi = [b.maxX, b.height, b.maxZ];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < lo[a] || o[a] > hi[a]) { ok = false; break; }
      } else {
        let ta = (lo[a] - o[a]) / d[a], tb = (hi[a] - o[a]) / d[a];
        if (ta > tb) { const t = ta; ta = tb; tb = t; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { ok = false; break; }
      }
    }
    if (ok && t0 < best && t0 > 0) best = t0;
  }
  return best;
}

export class NavGrid {
  constructor(colliders) {
    this.losBoxes = colliders; // colliders, for line-of-sight path smoothing
    this.w = CONFIG.MAP_W;
    this.d = CONFIG.MAP_D;
    this.halfW = this.w / 2;
    this.halfD = this.d / 2;
    // blocked[y * w + x]: 1 m cells, cell centre is the sample point.
    this.blocked = new Uint8Array(this.w * this.d);
    for (let z = 0; z < this.d; z++) {
      for (let x = 0; x < this.w; x++) {
        const wx = x - this.halfW + 0.5;
        const wz = z - this.halfD + 0.5;
        for (let i = 0; i < colliders.length; i++) {
          const b = colliders[i];
          // A bot needs its radius clear of the box.
          if (wx > b.minX - 0.45 && wx < b.maxX + 0.45 && wz > b.minZ - 0.45 && wz < b.maxZ + 0.45) {
            this.blocked[z * this.w + x] = 1;
            break;
          }
        }
      }
    }
  }

  toCell(x, z) {
    return [
      Math.max(0, Math.min(this.w - 1, Math.floor(x + this.halfW))),
      Math.max(0, Math.min(this.d - 1, Math.floor(z + this.halfD))),
    ];
  }

  isWalkableCell(cx, cz) {
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.d) return false;
    return this.blocked[cz * this.w + cx] === 0;
  }

  isWalkable(x, z) {
    const [cx, cz] = this.toCell(x, z);
    return this.isWalkableCell(cx, cz);
  }

  // Nearest walkable cell to a world point (spiral search, bounded).
  nearestWalkable(x, z) {
    const [cx, cz] = this.toCell(x, z);
    if (this.isWalkableCell(cx, cz)) return [cx, cz];
    for (let r = 1; r <= 8; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (this.isWalkableCell(cx + dx, cz + dz)) return [cx + dx, cz + dz];
        }
      }
    }
    return [cx, cz];
  }

  // A* with an octile heuristic. Returns world waypoints (cell centres),
  // smoothed by line-of-sight shortcuts, or null when unreachable.
  findPath(sx, sz, tx, tz) {
    const [scx, scz] = this.nearestWalkable(sx, sz);
    const [tcx, tcz] = this.nearestWalkable(tx, tz);
    const W = this.w, D = this.d;
    const start = scz * W + scx;
    const goal = tcz * W + tcx;
    if (start === goal) return [{ x: tx, z: tz }];
    const gScore = new Float32Array(W * D).fill(Infinity);
    const came = new Int32Array(W * D).fill(-1);
    const closed = new Uint8Array(W * D);
    const open = [start];
    gScore[start] = 0;
    const h = (i) => {
      const x = i % W, z = (i / W) | 0;
      const dx = Math.abs(x - tcx), dz = Math.abs(z - tcz);
      return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
    };
    let guard = 0;
    while (open.length > 0) {
      if (++guard > 12000) return null;
      // Linear-min open list: the grid is small and paths are short.
      let bi = 0, bf = Infinity;
      for (let i = 0; i < open.length; i++) {
        const f = gScore[open[i]] + h(open[i]);
        if (f < bf) { bf = f; bi = i; }
      }
      const cur = open.splice(bi, 1)[0];
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
          const ni = nz * W + nx;
          if (this.blocked[ni] === 1 || closed[ni]) continue;
          // No corner-cutting through a blocked diagonal neighbour.
          if (dx !== 0 && dz !== 0 && (this.blocked[cz * W + nx] === 1 || this.blocked[nz * W + cx] === 1)) continue;
          const step = (dx !== 0 && dz !== 0) ? 1.4142 : 1;
          const ng = gScore[cur] + step;
          if (ng < gScore[ni]) {
            gScore[ni] = ng;
            came[ni] = cur;
            if (!open.includes(ni)) open.push(ni);
          }
        }
      }
    }
    if (came[goal] === -1 && goal !== start) return null;
    // Reconstruct, then smooth with straight-line shortcuts.
    const cells = [];
    let cur = goal;
    while (cur !== -1) {
      cells.push(cur);
      cur = came[cur];
    }
    cells.reverse();
    const pts = cells.map((i) => ({ x: (i % W) - this.halfW + 0.5, z: ((i / W) | 0) - this.halfD + 0.5 }));
    pts[pts.length - 1] = { x: tx, z: tz };
    const smooth = [pts[0]];
    let anchor = 0;
    for (let i = 1; i < pts.length; i++) {
      let blocked = false;
      for (let k = 0; k < this.losBoxes.length; k++) {
        if (segmentHitsBox(pts[anchor].x, pts[anchor].z, pts[i].x, pts[i].z, this.losBoxes[k])) { blocked = true; break; }
      }
      if (blocked) { smooth.push(pts[i - 1]); anchor = i - 1; }
    }
    smooth.push(pts[pts.length - 1]);
    return smooth;
  }
}
