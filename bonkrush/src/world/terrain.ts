import type { StageDef, Vec3 } from '../game/types'
import { Noise2D, smoothstep } from './noise'
import { planRamps, rampFootprint, rampHeight, type SlideRamp } from './ramps'

/** Half the side of every map, metres. */
export const WORLD_HALF_SIZE = 110

/** Shape knobs shared by every stage; the per-stage feel comes from `StageDef.terrain`. */
export const TERRAIN_SHAPE = {
  /** The player start is dead flat within this radius... */
  startRadius: 12,
  /** ...and blends back into the hills over this distance. */
  startBlend: 10,
  /** Where (in distance from the centre, measured squarish) the rim starts to rise and where it tops out. */
  rimStart: 78,
  rimEnd: 108,
  /** Rim height on top of the stage amplitude. */
  rimHeight: 18,
}

export type TerrainParams = StageDef['terrain']

/**
 * A square grid of heights sampled every `cell` metres over
 * [-halfSize, halfSize]². Heights between samples are bilinear, outside the
 * grid they clamp to the edge.
 */
export class HeightField {
  /** Samples per side. */
  readonly size: number
  /** Row-major: heights[j * size + i] is at x = -halfSize + i·cell, z = -halfSize + j·cell. */
  readonly heights: Float32Array
  /** The slide ramps baked into these heights (spots and props keep off their lanes). */
  ramps: readonly SlideRamp[] = []
  private readonly invCell: number

  constructor(
    readonly halfSize: number,
    readonly cell: number,
  ) {
    this.size = Math.round((2 * halfSize) / cell) + 1
    this.heights = new Float32Array(this.size * this.size)
    this.invCell = 1 / cell
  }

  /** World coordinate of grid column / row `i`. */
  coord(i: number): number {
    return -this.halfSize + i * this.cell
  }

  heightAt(x: number, z: number): number {
    const last = this.size - 1
    let fx = (x + this.halfSize) * this.invCell
    let fz = (z + this.halfSize) * this.invCell
    // Written so NaN lands on 0 instead of poisoning the index.
    if (!(fx > 0)) fx = 0
    else if (fx > last) fx = last
    if (!(fz > 0)) fz = 0
    else if (fz > last) fz = last
    let i = Math.floor(fx)
    let j = Math.floor(fz)
    if (i >= last) i = last - 1
    if (j >= last) j = last - 1
    const tx = fx - i
    const tz = fz - j
    const k = j * this.size + i
    const h = this.heights
    const a = h[k] + (h[k + 1] - h[k]) * tx
    const b = h[k + this.size] + (h[k + this.size + 1] - h[k + this.size]) * tx
    return a + (b - a) * tz
  }

  /** Unit ground normal by central differences one cell apart. */
  normalAt(x: number, z: number, out: Vec3): Vec3 {
    const e = this.cell
    const nx = (this.heightAt(x - e, z) - this.heightAt(x + e, z)) / (2 * e)
    const nz = (this.heightAt(x, z - e) - this.heightAt(x, z + e)) / (2 * e)
    const inv = 1 / Math.sqrt(nx * nx + 1 + nz * nz)
    return out.set(nx * inv, inv, nz * inv)
  }

  /** The y of the ground normal: 1 on flat ground, cos(slope) in general. Allocation-free. */
  flatness(x: number, z: number): number {
    const e = this.cell
    const gx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e)
    const gz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e)
    return 1 / Math.sqrt(1 + gx * gx + gz * gz)
  }

  /**
   * Levels a disc to `level` (default: the current height at its centre),
   * fully flat within `radius` and eased back to the old ground over `blend`.
   */
  flatten(cx: number, cz: number, radius: number, blend: number, level = this.heightAt(cx, cz)): void {
    const reach = radius + blend
    const i0 = Math.max(0, Math.floor((cx - reach + this.halfSize) * this.invCell))
    const i1 = Math.min(this.size - 1, Math.ceil((cx + reach + this.halfSize) * this.invCell))
    const j0 = Math.max(0, Math.floor((cz - reach + this.halfSize) * this.invCell))
    const j1 = Math.min(this.size - 1, Math.ceil((cz + reach + this.halfSize) * this.invCell))
    for (let j = j0; j <= j1; j++) {
      const dz = this.coord(j) - cz
      for (let i = i0; i <= i1; i++) {
        const dx = this.coord(i) - cx
        const w = 1 - smoothstep(radius, reach, Math.sqrt(dx * dx + dz * dz))
        if (w <= 0) continue
        const k = j * this.size + i
        this.heights[k] += (level - this.heights[k]) * w
      }
    }
  }
}

/**
 * The continuous height function behind a stage: broad swells to slide down,
 * fractal hills on top, gentle terraces, a flat start and a steep rim.
 * Defined everywhere, so it can also shape things beyond the grid. The slide
 * ramps are not part of it; `generateTerrain` bakes them into the grid.
 */
export function makeHeightFunction(params: TerrainParams): (x: number, z: number) => number {
  const hills = new Noise2D(params.seed)
  const swell = new Noise2D(params.seed ^ 0x51ed27)
  const rim = new Noise2D(params.seed ^ 0x2c1b3c6d)
  const amp = params.amplitude
  const f = params.frequency
  const octaves = Math.max(1, params.octaves)
  const plateau = Math.min(1, Math.max(0, params.plateau))
  const step = Math.max(1.5, amp * 0.4)
  const s = TERRAIN_SHAPE

  const raw = (x: number, z: number): number => {
    // fbm rarely strays past ±0.6, so ×1.8 lets the hills use the whole amplitude.
    let h = hills.fbm(x * f, z * f, octaves, 0.42) * amp * 1.8
    // Long, low swells a slide can build speed on.
    h += swell.noise(x * f * 0.38, z * f * 0.38) * amp * 1.1
    if (plateau > 0) {
      const u = h / step
      const k = Math.floor(u)
      const t = u - k
      const terraced = (k + t * t * t * (t * (t * 6 - 15) + 10)) * step
      h += (terraced - h) * plateau
    }
    return h
  }

  const startLevel = raw(0, 0)
  return (x: number, z: number): number => {
    let h = raw(x, z)
    const r = Math.sqrt(x * x + z * z)
    const flat = 1 - smoothstep(s.startRadius, s.startRadius + s.startBlend, r)
    if (flat > 0) h += (startLevel - h) * flat
    // A superellipse: square along the sides, rounded at the corners so they don't crease.
    const ax = Math.abs(x) / s.rimEnd
    const az = Math.abs(z) / s.rimEnd
    const edge = Math.pow(ax ** 6 + az ** 6, 1 / 6) * s.rimEnd + rim.noise(x * 0.035, z * 0.035) * 6
    const t = smoothstep(s.rimStart, s.rimEnd, edge)
    if (t > 0) {
      const lumpy = 0.8 + 0.4 * (rim.noise(x * 0.09 + 40, z * 0.09 - 40) * 0.5 + 0.5)
      h += Math.pow(t, 1.5) * (s.rimHeight + amp) * lumpy
    }
    return h
  }
}

/**
 * Samples a stage's height function onto a grid, then carves in its slide
 * ramps (fitted to the hills they sit on). Deterministic for a given seed.
 */
export function generateTerrain(params: TerrainParams, halfSize = WORLD_HALF_SIZE, cell = 1, ramps = true): HeightField {
  const field = new HeightField(halfSize, cell)
  const height = makeHeightFunction(params)
  const n = field.size
  for (let j = 0; j < n; j++) {
    const z = field.coord(j)
    for (let i = 0; i < n; i++) field.heights[j * n + i] = height(field.coord(i), z)
  }
  if (ramps) {
    field.ramps = planRamps((x, z) => field.heightAt(x, z), params.seed)
    for (const r of field.ramps) bakeRamp(field, r)
  }
  return field
}

/** Blends one ramp into the grid over its footprint. */
function bakeRamp(field: HeightField, r: SlideRamp): void {
  const f = rampFootprint(r)
  const reach = f.half + field.cell
  const toIndex = (v: number) => (v + field.halfSize) / field.cell
  const last = field.size - 1
  const i0 = Math.max(0, Math.floor(toIndex(Math.min(f.ax, f.bx) - reach)))
  const i1 = Math.min(last, Math.ceil(toIndex(Math.max(f.ax, f.bx) + reach)))
  const j0 = Math.max(0, Math.floor(toIndex(Math.min(f.az, f.bz) - reach)))
  const j1 = Math.min(last, Math.ceil(toIndex(Math.max(f.az, f.bz) + reach)))
  for (let j = j0; j <= j1; j++) {
    const z = field.coord(j)
    for (let i = i0; i <= i1; i++) {
      const k = j * field.size + i
      field.heights[k] = rampHeight(r, field.coord(i), z, field.heights[k])
    }
  }
}
