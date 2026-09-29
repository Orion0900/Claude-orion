/**
 * A uniform grid over the XZ plane for neighbour queries. It is rebuilt from
 * scratch every frame with a counting sort into flat typed arrays, so a
 * rebuild and every query run without allocating (once capacity has grown to
 * fit). Points outside the grid are filed in the nearest edge cell.
 */
export class SpatialHash {
  readonly cellSize: number
  private readonly inv: number
  private readonly dim: number
  private readonly origin: number
  private readonly cellStart: Int32Array
  private readonly cellFill: Int32Array
  private ids: Int32Array
  private xs: Float32Array
  private zs: Float32Array
  private cells: Int32Array
  private sortedIds: Int32Array
  private sortedX: Float32Array
  private sortedZ: Float32Array
  private n = 0

  /** Covers [-halfExtent, halfExtent] on both axes. */
  constructor(halfExtent: number, cellSize: number, capacity = 512) {
    this.cellSize = Math.max(0.1, cellSize)
    this.inv = 1 / this.cellSize
    this.dim = Math.max(1, Math.ceil((2 * Math.max(1, halfExtent)) / this.cellSize))
    this.origin = -Math.max(1, halfExtent)
    this.cellStart = new Int32Array(this.dim * this.dim + 1)
    this.cellFill = new Int32Array(this.dim * this.dim)
    this.ids = new Int32Array(capacity)
    this.xs = new Float32Array(capacity)
    this.zs = new Float32Array(capacity)
    this.cells = new Int32Array(capacity)
    this.sortedIds = new Int32Array(capacity)
    this.sortedX = new Float32Array(capacity)
    this.sortedZ = new Float32Array(capacity)
  }

  get count(): number {
    return this.n
  }

  clear(): void {
    this.n = 0
  }

  insert(id: number, x: number, z: number): void {
    if (this.n >= this.ids.length) this.grow(this.ids.length * 2)
    this.ids[this.n] = id
    this.xs[this.n] = x
    this.zs[this.n] = z
    this.n++
  }

  /** Sorts the inserted points into cells; call once after the inserts, before querying. */
  build(): void {
    const { cellStart, cellFill, n } = this
    cellStart.fill(0)
    for (let i = 0; i < n; i++) {
      const c = this.cellIndex(this.xs[i], this.zs[i])
      this.cells[i] = c
      cellStart[c + 1]++
    }
    for (let c = 1; c < cellStart.length; c++) cellStart[c] += cellStart[c - 1]
    cellFill.set(cellStart.subarray(0, cellFill.length))
    for (let i = 0; i < n; i++) {
      const slot = cellFill[this.cells[i]]++
      this.sortedIds[slot] = this.ids[i]
      this.sortedX[slot] = this.xs[i]
      this.sortedZ[slot] = this.zs[i]
    }
  }

  /** Ids of every point within `radius` of (x, z), written into `out` (cleared first). */
  query(x: number, z: number, radius: number, out: number[]): number[] {
    out.length = 0
    if (this.n === 0 || !(radius >= 0)) return out
    const r2 = radius * radius
    const x0 = this.axisCell(x - radius)
    const x1 = this.axisCell(x + radius)
    const z0 = this.axisCell(z - radius)
    const z1 = this.axisCell(z + radius)
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const c = cz * this.dim + cx
        for (let k = this.cellStart[c], end = this.cellStart[c + 1]; k < end; k++) {
          const dx = this.sortedX[k] - x
          const dz = this.sortedZ[k] - z
          if (dx * dx + dz * dz <= r2) out.push(this.sortedIds[k])
        }
      }
    }
    return out
  }

  /**
   * Closest accepted point within `maxDist`, searching outward ring by ring
   * and stopping as soon as no unvisited cell could hold anything closer.
   * Returns its id, or -1.
   */
  nearest(x: number, z: number, maxDist: number, accept?: (id: number) => boolean): number {
    if (this.n === 0 || !(maxDist > 0)) return -1
    const cx = this.axisCell(x)
    const cz = this.axisCell(z)
    let best = -1
    let bestD2 = maxDist * maxDist
    const maxRing = Math.min(this.dim, Math.ceil(maxDist * this.inv) + 1)
    for (let ring = 0; ring <= maxRing; ring++) {
      const zLo = cz - ring
      const zHi = cz + ring
      for (let gz = zLo; gz <= zHi; gz++) {
        if (gz < 0 || gz >= this.dim) continue
        const edge = gz === zLo || gz === zHi
        const step = edge ? 1 : 2 * ring
        for (let gx = cx - ring; gx <= cx + ring; gx += step || 1) {
          if (gx < 0 || gx >= this.dim) continue
          const c = gz * this.dim + gx
          for (let k = this.cellStart[c], end = this.cellStart[c + 1]; k < end; k++) {
            const dx = this.sortedX[k] - x
            const dz = this.sortedZ[k] - z
            const d2 = dx * dx + dz * dz
            if (d2 <= bestD2 && (!accept || accept(this.sortedIds[k]))) {
              bestD2 = d2
              best = this.sortedIds[k]
            }
          }
        }
      }
      // Everything in the next ring is at least ring × cellSize away.
      const reach = ring * this.cellSize
      if (best >= 0 && bestD2 <= reach * reach) break
    }
    return best
  }

  /** NaN lands in cell 0 rather than corrupting the counting sort. */
  private axisCell(v: number): number {
    const c = Math.floor((v - this.origin) * this.inv)
    return c >= 0 ? (c < this.dim ? c : this.dim - 1) : 0
  }

  private cellIndex(x: number, z: number): number {
    return this.axisCell(z) * this.dim + this.axisCell(x)
  }

  private grow(capacity: number): void {
    const ids = new Int32Array(capacity)
    const xs = new Float32Array(capacity)
    const zs = new Float32Array(capacity)
    ids.set(this.ids.subarray(0, this.n))
    xs.set(this.xs.subarray(0, this.n))
    zs.set(this.zs.subarray(0, this.n))
    this.ids = ids
    this.xs = xs
    this.zs = zs
    this.cells = new Int32Array(capacity)
    this.sortedIds = new Int32Array(capacity)
    this.sortedX = new Float32Array(capacity)
    this.sortedZ = new Float32Array(capacity)
  }
}
