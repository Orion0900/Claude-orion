import { Rng } from '../core/rng'
import { STAGES } from '../data/stages'
import { ColliderGrid, PLAY_LIMIT } from './colliders'
import { propSpec } from './propSpecs'
import { laneDistance } from './ramps'
import { RAMP_PROP_CLEAR, boundaryRocks, scatterProps } from './scatter'
import { SPOT_CLEARANCE, placeSpots } from './spots'
import { generateTerrain } from './terrain'

function layout(stageIndex: number, seed: number) {
  const stage = STAGES[stageIndex]
  const field = generateTerrain(stage.terrain)
  const rng = new Rng(seed)
  const spots = placeSpots(field, rng)
  const result = scatterProps(field, spots, stage.props, rng)
  return { stage, field, spots, result }
}

const layouts = [0, 1, 2].map((i) => layout(i, 31 + i))

describe('scatterProps', () => {
  it('places (nearly) every prop the stage asks for, in stage order', () => {
    for (const { stage, result } of layouts) {
      expect(result.groups.map((g) => g.kind)).toEqual(stage.props.map((p) => p.kind))
      stage.props.forEach((p, i) => {
        expect(result.groups[i].instances.length).toBeGreaterThanOrEqual(Math.floor(p.count * 0.9))
        expect(result.groups[i].instances.length).toBeLessThanOrEqual(p.count)
      })
    }
  })

  it('registers a collider for every solid prop and none for decorations', () => {
    for (const { stage, result } of layouts) {
      const solid = result.groups.filter((g) => g.solid).reduce((n, g) => n + g.instances.length, 0)
      expect(result.colliders.length).toBe(solid)
      expect(stage.props.some((p) => !p.solid)).toBe(true)
    }
  })

  it('keeps props out of the start clearing and off every spot', () => {
    for (const { spots, result } of layouts) {
      for (const g of result.groups) {
        const spec = propSpec(g.kind)
        for (const p of g.instances) {
          const r = spec.radius * p.scale
          const fromStart = Math.hypot(p.x, p.z)
          // Ring props (crypt candles) sit deliberately around the start, never on it.
          expect(fromStart).toBeGreaterThanOrEqual(spec.startRing ? Math.min(spec.startClear, spec.startRing.min - 0.5) : spec.startClear)
          const check = (s: { x: number; z: number }, keep: number) =>
            expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeGreaterThanOrEqual(keep + r)
          check(spots.altar, SPOT_CLEARANCE.altar)
          for (const s of spots.shrines) check(s, SPOT_CLEARANCE.shrine)
          for (const s of spots.chests) check(s, SPOT_CLEARANCE.chest)
          for (const s of spots.pots) check(s, SPOT_CLEARANCE.pot)
        }
      }
    }
  })

  it('keeps every prop off the slide ramps', () => {
    for (const { field, result } of layouts) {
      expect(field.ramps.length).toBeGreaterThan(0)
      for (const g of result.groups) {
        const spec = propSpec(g.kind)
        for (const p of g.instances) {
          for (const r of field.ramps) expect(laneDistance(r, p.x, p.z)).toBeGreaterThanOrEqual(spec.radius * p.scale + RAMP_PROP_CLEAR)
        }
      }
    }
  })

  it('links each solid prop to its own collider', () => {
    for (const { result } of layouts) {
      const seen = new Set<number>()
      for (const g of result.groups) {
        for (const p of g.instances) {
          if (!g.solid) {
            expect(p.collider).toBeUndefined()
            continue
          }
          const c = result.colliders[p.collider!]
          expect(c).toBeDefined()
          expect(c.x).toBe(p.x)
          expect(c.z).toBe(p.z)
          seen.add(p.collider!)
        }
      }
      expect(seen.size).toBe(result.colliders.length)
    }
  })

  it('never puts a spot inside a solid collider', () => {
    for (const { spots, result, field } of layouts) {
      const grid = new ColliderGrid(result.colliders, field.halfSize)
      for (const s of [...spots.chests, ...spots.shrines, ...spots.pots, spots.altar, spots.playerStart]) {
        expect(grid.blocked(s.x, s.z, 0.8)).toBe(false)
      }
    }
  })

  it('stands props on gentle enough ground, inside the walls, with finite transforms', () => {
    for (const { field, result } of layouts) {
      for (const g of result.groups) {
        const spec = propSpec(g.kind)
        const minFlat = Math.cos((spec.maxSlope * Math.PI) / 180)
        for (const p of g.instances) {
          expect(field.flatness(p.x, p.z)).toBeGreaterThanOrEqual(minFlat - 1e-9)
          expect(Math.abs(p.x)).toBeLessThanOrEqual(PLAY_LIMIT)
          expect(Math.abs(p.z)).toBeLessThanOrEqual(PLAY_LIMIT)
          for (const v of [p.x, p.y, p.z, p.yaw, p.sx, p.sy, p.sz, p.leanX, p.leanZ]) expect(Number.isFinite(v)).toBe(true)
          expect(p.variant).toBeGreaterThanOrEqual(0)
          expect(p.variant).toBeLessThan(Math.max(1, spec.variants))
          // Seated on the ground: never floating above the lowest point of its footprint.
          expect(p.y).toBeLessThanOrEqual(field.heightAt(p.x, p.z) + 1e-6)
        }
      }
    }
  })

  it('leaves a walkable gap between solid props', () => {
    for (const { result } of layouts) {
      const c = result.colliders
      for (let i = 0; i < c.length; i++) {
        for (let j = i + 1; j < c.length; j++) {
          expect(Math.hypot(c[i].x - c[j].x, c[i].z - c[j].z)).toBeGreaterThanOrEqual(c[i].r + c[j].r + 1.2 - 1e-9)
        }
      }
    }
  })

  it('rings the crypt start with candles', () => {
    const crypt = layouts[2]
    const candles = crypt.result.groups.find((g) => g.kind === 'candle')!
    const ring = candles.instances.filter((p) => Math.hypot(p.x, p.z) < 16)
    expect(ring.length).toBeGreaterThanOrEqual(4)
  })

  it('is deterministic for a seed', () => {
    const a = layout(0, 5).result
    const b = layout(0, 5).result
    expect(a.colliders).toEqual(b.colliders)
    expect(a.groups[4].instances).toEqual(b.groups[4].instances)
  })

  it('treats an unknown kind like a rock instead of crashing', () => {
    const { field, spots } = layouts[0]
    const r = scatterProps(field, spots, [{ kind: 'mystery', count: 10, solid: true }], new Rng(3))
    expect(r.groups[0].instances.length).toBe(10)
    expect(r.colliders.length).toBe(10)
  })
})

describe('boundaryRocks', () => {
  it('walls all four sides just outside the walkable square', () => {
    const { field } = layouts[0]
    const rocks = boundaryRocks(field, new Rng(1))
    expect(rocks.length).toBeGreaterThan(80)
    const sides = [0, 0, 0, 0]
    for (const r of rocks) {
      const edge = Math.max(Math.abs(r.x), Math.abs(r.z))
      expect(edge).toBeGreaterThan(PLAY_LIMIT)
      expect(edge).toBeLessThanOrEqual(field.halfSize)
      if (r.x > PLAY_LIMIT) sides[0]++
      if (r.x < -PLAY_LIMIT) sides[1]++
      if (r.z > PLAY_LIMIT) sides[2]++
      if (r.z < -PLAY_LIMIT) sides[3]++
    }
    for (const n of sides) expect(n).toBeGreaterThan(20)
  })
})
