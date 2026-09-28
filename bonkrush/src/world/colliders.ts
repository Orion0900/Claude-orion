/** The walkable square: nothing's centre goes past ±PLAY_LIMIT (minus its radius). */
export const PLAY_LIMIT = 98

export interface Circle {
  x: number
  z: number
  r: number
}

/**
 * Static solid circles bucketed into a uniform grid, so pushing a body out
 * of them only looks at the few cells it overlaps. Built once per stage;
 * the buckets are flat typed arrays (CSR) to keep lookups cache-friendly.
 */
export class ColliderGrid {
  readonly count: number
  private readonly xs: Float32Array
  private readonly zs: Float32Array
  private readonly rs: Float32Array
  private readonly cells: number
  private readonly invCell: number
  private readonly cellStart: Int32Array
  private readonly cellItems: Int32Array
  /** Largest radius, so a query knows how far into a cell a circle can reach. */
  private readonly maxR: number
  /** Per-circle query stamps, so a circle spanning several cells is reported once. */
  private readonly seen: Int32Array
  private stamp = 0

  constructor(
    circles: readonly Circle[],
    private readonly halfSize: number,
    readonly limit = PLAY_LIMIT,
    cellSize = 4,
  ) {
    this.count = circles.length
    this.xs = new Float32Array(this.count)
    this.zs = new Float32Array(this.count)
    this.rs = new Float32Array(this.count)
    this.cells = Math.max(1, Math.ceil((2 * halfSize) / cellSize))
    this.invCell = this.cells / (2 * halfSize)

    const nCells = this.cells * this.cells
    const counts = new Int32Array(nCells + 1)
    circles.forEach((c, n) => {
      this.xs[n] = c.x
      this.zs[n] = c.z
      this.rs[n] = c.r
      this.forCells(c.x, c.z, c.r, (k) => counts[k + 1]++)
    })
    for (let k = 0; k < nCells; k++) counts[k + 1] += counts[k]
    this.cellStart = counts
    this.cellItems = new Int32Array(counts[nCells])
    const fill = counts.slice(0, nCells)
    circles.forEach((c, n) => this.forCells(c.x, c.z, c.r, (k) => (this.cellItems[fill[k]++] = n)))
    this.maxR = circles.reduce((m, c) => Math.max(m, c.r), 0)
    this.seen = new Int32Array(this.count)
  }

  /** Pushes the circle at (pos.x, pos.z) out of every solid it overlaps, then inside the play square. */
  collide(pos: { x: number; z: number }, radius: number): void {
    // A NaN position would otherwise stick forever; park it at the centre.
    if (!Number.isFinite(pos.x)) pos.x = 0
    if (!Number.isFinite(pos.z)) pos.z = 0
    const r = radius > 0 ? radius : 0

    const c0 = this.cellOf(pos.x - r)
    const c1 = this.cellOf(pos.x + r)
    const r0 = this.cellOf(pos.z - r)
    const r1 = this.cellOf(pos.z + r)
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const k = row * this.cells + col
        for (let n = this.cellStart[k], end = this.cellStart[k + 1]; n < end; n++) {
          const id = this.cellItems[n]
          const dx = pos.x - this.xs[id]
          const dz = pos.z - this.zs[id]
          const min = this.rs[id] + r
          const d2 = dx * dx + dz * dz
          if (d2 >= min * min) continue
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2)
            const push = (min - d) / d
            pos.x += dx * push
            pos.z += dz * push
          } else {
            // Dead centre: any direction works, so pick one deterministically.
            pos.x += min
          }
        }
      }
    }

    const lim = Math.max(0, this.limit - r)
    if (pos.x > lim) pos.x = lim
    else if (pos.x < -lim) pos.x = -lim
    if (pos.z > lim) pos.z = lim
    else if (pos.z < -lim) pos.z = -lim
  }

  /** Whether a circle overlaps any solid (used when placing things). */
  blocked(x: number, z: number, radius: number): boolean {
    const c0 = this.cellOf(x - radius)
    const c1 = this.cellOf(x + radius)
    const r0 = this.cellOf(z - radius)
    const r1 = this.cellOf(z + radius)
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const k = row * this.cells + col
        for (let n = this.cellStart[k], end = this.cellStart[k + 1]; n < end; n++) {
          const id = this.cellItems[n]
          const dx = x - this.xs[id]
          const dz = z - this.zs[id]
          const min = this.rs[id] + radius
          if (dx * dx + dz * dz < min * min) return true
        }
      }
    }
    return false
  }

  /**
   * Fills `out` with the index of every solid whose circle, grown by `pad`,
   * touches the segment (ax, az)–(bx, bz), each once. Only looks in the cells
   * along the segment, so a short one costs a handful of cells.
   */
  querySegment(ax: number, az: number, bx: number, bz: number, pad: number, out: number[]): number[] {
    out.length = 0
    if (this.count === 0) return out
    this.stamp++
    const reach = this.maxR + Math.max(0, pad)
    const size = 1 / this.invCell
    // A cell can only hold a hit if the segment passes within this of its centre.
    const cellReach = size * Math.SQRT1_2 + reach
    const c0 = this.cellOf(Math.min(ax, bx) - reach)
    const c1 = this.cellOf(Math.max(ax, bx) + reach)
    const r0 = this.cellOf(Math.min(az, bz) - reach)
    const r1 = this.cellOf(Math.max(az, bz) + reach)
    for (let row = r0; row <= r1; row++) {
      const cz = -this.halfSize + (row + 0.5) * size
      for (let col = c0; col <= c1; col++) {
        const cx = -this.halfSize + (col + 0.5) * size
        if (segmentPointDistance(ax, az, bx, bz, cx, cz) > cellReach) continue
        const k = row * this.cells + col
        for (let n = this.cellStart[k], end = this.cellStart[k + 1]; n < end; n++) {
          const id = this.cellItems[n]
          if (this.seen[id] === this.stamp) continue
          this.seen[id] = this.stamp
          if (segmentPointDistance(ax, az, bx, bz, this.xs[id], this.zs[id]) < this.rs[id] + pad) out.push(id)
        }
      }
    }
    return out
  }

  private cellOf(v: number): number {
    const c = Math.floor((v + this.halfSize) * this.invCell)
    return c < 0 ? 0 : c >= this.cells ? this.cells - 1 : c
  }

  private forCells(x: number, z: number, r: number, fn: (k: number) => void): void {
    const c0 = this.cellOf(x - r)
    const c1 = this.cellOf(x + r)
    const r0 = this.cellOf(z - r)
    const r1 = this.cellOf(z + r)
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) fn(row * this.cells + col)
  }
}

/** Distance from (px, pz) to the segment (ax, az)–(bx, bz). */
export function segmentPointDistance(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const ex = bx - ax
  const ez = bz - az
  const len2 = ex * ex + ez * ez
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / len2)) : 0
  const dx = ax + ex * t - px
  const dz = az + ez * t - pz
  return Math.sqrt(dx * dx + dz * dz)
}
