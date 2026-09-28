import type { Rng } from '../core/rng'
import type { StageDef } from '../game/types'
import { PLAY_LIMIT, type Circle } from './colliders'
import { Noise2D, smoothstep } from './noise'
import { propSpec, type PropSpec } from './propSpecs'
import { SPOT_CLEARANCE, type WorldSpots } from './spots'
import type { HeightField } from './terrain'

/** One placed prop. Scale is per axis so walls can be stretched; `scale` is the collision scale. */
export interface PropInstance {
  x: number
  y: number
  z: number
  yaw: number
  leanX: number
  leanZ: number
  sx: number
  sy: number
  sz: number
  scale: number
  variant: number
}

export interface PropGroup {
  kind: string
  solid: boolean
  spec: PropSpec
  instances: PropInstance[]
}

export interface ScatterResult {
  groups: PropGroup[]
  /** Collision circles of every solid prop. */
  colliders: Circle[]
}

/** Gap left between two solid props so the player (and most enemies) can squeeze through. */
const SOLID_GAP = 1.2
/** Props stay a little inside the walkable square; beyond it is the rim and its walls. */
const PROP_LIMIT = PLAY_LIMIT - 2

/**
 * Scatters every prop a stage lists. Solid, big kinds go first so small
 * decorations fill in around them. Nothing lands in the start clearing, on
 * a spot, on a steep slope, or overlapping a solid.
 */
export function scatterProps(
  field: HeightField,
  spots: WorldSpots,
  props: StageDef['props'],
  rng: Rng,
): ScatterResult {
  const keepOut: Circle[] = [
    { x: spots.altar.x, z: spots.altar.z, r: SPOT_CLEARANCE.altar },
    ...spots.shrines.map((p) => ({ x: p.x, z: p.z, r: SPOT_CLEARANCE.shrine })),
    ...spots.chests.map((p) => ({ x: p.x, z: p.z, r: SPOT_CLEARANCE.chest })),
    ...spots.pots.map((p) => ({ x: p.x, z: p.z, r: SPOT_CLEARANCE.pot })),
  ]
  const spotHash = new CircleHash(field.halfSize)
  for (const c of keepOut) spotHash.add(c)
  const solids = new CircleHash(field.halfSize)

  // Shared clump fields: pines and oaks grow together; flowers take the clearings between.
  const fieldSeed = rng.int(0, 0x7fffffff)
  const forest = new Noise2D(fieldSeed)
  const own = new Map<string, Noise2D>()
  const density = (spec: PropSpec, kind: string, x: number, z: number): number => {
    switch (spec.field) {
      case 'forest':
        return smoothstep(0.02, 0.28, forest.fbm(x * 0.028, z * 0.028, 2))
      case 'meadow':
        return smoothstep(0.0, 0.3, -forest.fbm(x * 0.028, z * 0.028, 2)) * smoothstep(-0.2, 0.25, noiseFor('meadow').fbm(x * 0.07, z * 0.07, 2))
      default: {
        const n = noiseFor(spec.field === 'own' ? kind : spec.field)
        return smoothstep(-0.05, 0.3, n.fbm(x * 0.04, z * 0.04, 2))
      }
    }
  }
  function noiseFor(key: string): Noise2D {
    let n = own.get(key)
    if (!n) {
      n = new Noise2D(fieldSeed ^ hashString(key))
      own.set(key, n)
    }
    return n
  }

  const order = props
    .map((p, i) => ({ ...p, i, spec: propSpec(p.kind) }))
    .sort((a, b) => Number(b.solid) - Number(a.solid) || b.spec.radius - a.spec.radius || a.i - b.i)

  const groups: Array<PropGroup & { i: number }> = []
  const colliders: Circle[] = []
  for (const entry of order) {
    const { kind, solid, spec } = entry
    const kindRng = rng.fork(hashString(kind))
    const same = new CircleHash(field.halfSize)
    const instances: PropInstance[] = []
    const minFlat = Math.cos((spec.maxSlope * Math.PI) / 180)

    const tryPlace = (x: number, z: number, yaw: number, ignoreStart = false): boolean => {
      if (Math.abs(x) > PROP_LIMIT || Math.abs(z) > PROP_LIMIT) return false
      const scale = kindRng.range(spec.scale[0], spec.scale[1])
      const r = spec.radius * scale
      if (!ignoreStart && x * x + z * z < spec.startClear ** 2) return false
      if (field.flatness(x, z) < minFlat) return false
      if (spotHash.hits(x, z, r, 0.3)) return false
      if (solid ? solids.hits(x, z, r, SOLID_GAP) : solids.hits(x, z, r * 0.6, 0)) return false
      if (spec.spacing > 0 && same.hits(x, z, 0, spec.spacing * scale, true)) return false

      const foot = r * 0.8
      const ground = Math.min(
        field.heightAt(x, z),
        field.heightAt(x + foot, z),
        field.heightAt(x - foot, z),
        field.heightAt(x, z + foot),
        field.heightAt(x, z - foot),
      )
      const stretch = kindRng.range(0.92, 1.08)
      instances.push({
        x,
        y: ground - spec.sink * scale,
        z,
        yaw,
        leanX: spec.lean ? kindRng.range(-spec.lean, spec.lean) : 0,
        leanZ: spec.lean ? kindRng.range(-spec.lean, spec.lean) : 0,
        sx: scale,
        sy: scale * stretch,
        sz: scale,
        scale,
        variant: pickVariant(spec, kindRng),
      })
      same.add({ x, z, r: 0 })
      if (solid) {
        const c = { x, z, r }
        solids.add(c)
        colliders.push(c)
      }
      return true
    }

    const count = Math.max(0, Math.floor(entry.count))
    if (spec.startRing) {
      const ring = spec.startRing
      const phase = kindRng.range(0, Math.PI * 2)
      for (let k = 0; k < ring.count && instances.length < count; k++) {
        const a = phase + (k / ring.count) * Math.PI * 2 + kindRng.range(-0.15, 0.15)
        const d = kindRng.range(ring.min, ring.max)
        tryPlace(Math.cos(a) * d, Math.sin(a) * d, kindRng.range(0, Math.PI * 2), true)
      }
    }

    if (spec.layout === 'rows') {
      for (let cluster = 0; instances.length < count && cluster < count; cluster++) {
        const [cx, cz] = randomPoint(kindRng, spec.startClear + 4, PROP_LIMIT)
        const theta = kindRng.range(0, Math.PI)
        const cos = Math.cos(theta)
        const sin = Math.sin(theta)
        const rows = kindRng.int(2, 4)
        const cols = kindRng.int(3, 6)
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols && instances.length < count; c++) {
            // A few gaps keep the rows from looking stamped.
            if (kindRng.chance(0.12)) continue
            const lx = (c - (cols - 1) / 2) * 2.4 + kindRng.range(-0.25, 0.25)
            const lz = (r - (rows - 1) / 2) * 3.1 + kindRng.range(-0.25, 0.25)
            tryPlace(cx + lx * cos + lz * sin, cz - lx * sin + lz * cos, theta + kindRng.range(-0.15, 0.15))
          }
        }
      }
    }

    for (let tries = 0, max = count * 40; instances.length < count && tries < max; tries++) {
      const [x, z] = randomPoint(kindRng, 0, PROP_LIMIT)
      if (spec.clump > 0 && kindRng.next() > 1 - spec.clump + spec.clump * density(spec, kind, x, z)) continue
      tryPlace(x, z, kindRng.range(0, Math.PI * 2))
    }

    groups.push({ kind, solid, spec, instances, i: entry.i })
  }

  // Report groups in the order the stage listed them.
  groups.sort((a, b) => a.i - b.i)
  return { groups: groups.map((g) => ({ kind: g.kind, solid: g.solid, spec: g.spec, instances: g.instances })), colliders }
}

/** The big rocks that wall the map in, just outside the walkable square. */
export function boundaryRocks(field: HeightField, rng: Rng): PropInstance[] {
  const out: PropInstance[] = []
  const reach = field.halfSize
  for (let side = 0; side < 4; side++) {
    for (let t = -reach; t <= reach; t += rng.range(6, 9)) {
      const inset = rng.range(PLAY_LIMIT + 4, PLAY_LIMIT + 9)
      const x = side === 0 ? t : side === 1 ? inset : side === 2 ? t : -inset
      const z = side === 0 ? -inset : side === 1 ? t : side === 2 ? inset : t
      const sx = rng.range(4.5, 7.5)
      const sy = rng.range(6, 15)
      const sz = rng.range(4.5, 7.5)
      out.push({
        x,
        y: field.heightAt(x, z) - sy * 0.3,
        z,
        yaw: rng.range(0, Math.PI * 2),
        leanX: rng.range(-0.12, 0.12),
        leanZ: rng.range(-0.12, 0.12),
        sx,
        sy,
        sz,
        scale: Math.max(sx, sz),
        variant: 0,
      })
    }
  }
  return out
}

function pickVariant(spec: PropSpec, rng: Rng): number {
  if (spec.variants <= 1) return 0
  const w = spec.variantWeights
  if (!w || w.length !== spec.variants) return rng.int(0, spec.variants - 1)
  const indices = w.map((_, i) => i)
  return rng.weighted(indices, (i) => w[i])
}

/** Uniform by area in the square |x|,|z| ≤ limit, outside a disc of radius `minR`. */
function randomPoint(rng: Rng, minR: number, limit: number): [number, number] {
  // Capped so the corners outside the disc always remain and this can't spin forever.
  const r2 = Math.min(minR, limit) ** 2
  for (;;) {
    const x = rng.range(-limit, limit)
    const z = rng.range(-limit, limit)
    if (x * x + z * z >= r2) return [x, z]
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Bucketed circles for the placement checks (placement only; the runtime uses `ColliderGrid`). */
class CircleHash {
  private readonly cell = 6
  private readonly cells: number
  private readonly buckets = new Map<number, Circle[]>()
  private maxR = 0

  constructor(private readonly halfSize: number) {
    this.cells = Math.ceil((2 * halfSize) / this.cell) + 1
  }

  add(c: Circle): void {
    const k = this.key(this.col(c.x), this.col(c.z))
    let list = this.buckets.get(k)
    if (!list) this.buckets.set(k, (list = []))
    list.push(c)
    this.maxR = Math.max(this.maxR, c.r)
  }

  /**
   * Whether a circle of radius `r` comes within `gap` of any stored circle.
   * With `centres`, only the centre distance counts (same-kind spacing).
   */
  hits(x: number, z: number, r: number, gap: number, centres = false): boolean {
    const span = r + gap + (centres ? 0 : this.maxR)
    const c0 = this.col(x - span)
    const c1 = this.col(x + span)
    const r0 = this.col(z - span)
    const r1 = this.col(z + span)
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const list = this.buckets.get(this.key(col, row))
        if (!list) continue
        for (const c of list) {
          const need = centres ? gap : c.r + r + gap
          const dx = x - c.x
          const dz = z - c.z
          if (dx * dx + dz * dz < need * need) return true
        }
      }
    }
    return false
  }

  private col(v: number): number {
    return Math.max(0, Math.min(this.cells - 1, Math.floor((v + this.halfSize) / this.cell)))
  }

  private key(col: number, row: number): number {
    return row * this.cells + col
  }
}
