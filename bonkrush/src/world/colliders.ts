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
