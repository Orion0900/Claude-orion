import type { Vector3 } from 'three'
import { Rng } from '../core/rng'
import { STAGES } from '../data/stages'
import { laneDistance } from './ramps'
import { SPOT_CLEARANCE, SPOT_PADS, SPOT_RAMP_CLEAR, SPOT_RULES, padRimFits, placeSpots } from './spots'
import { generateTerrain, HeightField } from './terrain'

const minGap = (list: readonly Vector3[]): number => {
  let min = Infinity
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) min = Math.min(min, Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z))
  }
  return min
}

const layouts = STAGES.flatMap((stage) =>
  [1, 77, 4242].map((seed) => {
    const field = generateTerrain({ ...stage.terrain, seed: stage.terrain.seed + seed })
    return { stage, field, spots: placeSpots(field, new Rng(seed)) }
  }),
)

describe('placeSpots', () => {
  it('places every chest, shrine and pot', () => {
    for (const { spots } of layouts) {
      expect(spots.chests.length).toBe(SPOT_RULES.chests)
      expect(spots.shrines.length).toBe(SPOT_RULES.shrines)
      expect(spots.pots.length).toBe(SPOT_RULES.pots)
    }
  })

  it('spaces chests ≥ 10 m apart and shrines ≥ 14 m apart', () => {
    for (const { spots } of layouts) {
      expect(minGap(spots.chests)).toBeGreaterThanOrEqual(10)
      expect(minGap(spots.shrines)).toBeGreaterThanOrEqual(14)
      expect(minGap(spots.pots)).toBeGreaterThanOrEqual(SPOT_RULES.potSpacing)
    }
  })

  it('keeps different kinds of spot out of each other', () => {
    for (const { spots } of layouts) {
      for (const s of spots.shrines) {
        for (const c of spots.chests) expect(Math.hypot(s.x - c.x, s.z - c.z)).toBeGreaterThanOrEqual(SPOT_CLEARANCE.shrine + SPOT_CLEARANCE.chest)
        expect(Math.hypot(s.x - spots.altar.x, s.z - spots.altar.z)).toBeGreaterThanOrEqual(SPOT_CLEARANCE.shrine + SPOT_CLEARANCE.altar)
      }
    }
  })

  it('starts the player at the centre on the ground, and puts the altar at least 50 m away', () => {
    for (const { spots, field } of layouts) {
      expect(spots.playerStart.x).toBe(0)
      expect(spots.playerStart.z).toBe(0)
      expect(spots.playerStart.y).toBeCloseTo(field.heightAt(0, 0))
      expect(Math.hypot(spots.altar.x, spots.altar.z)).toBeGreaterThanOrEqual(50)
    }
  })

  it('keeps spots within 95 m of the centre, out of the start clearing, on walkable ground, at ground height', () => {
    for (const { spots, field } of layouts) {
      for (const p of [...spots.chests, ...spots.shrines, ...spots.pots, spots.altar]) {
        const r = Math.hypot(p.x, p.z)
        expect(r).toBeLessThanOrEqual(95)
        expect(r).toBeGreaterThanOrEqual(SPOT_RULES.startClear)
        expect(p.y).toBeCloseTo(field.heightAt(p.x, p.z), 5)
        expect(field.flatness(p.x, p.z)).toBeGreaterThan(Math.cos((35 * Math.PI) / 180))
      }
    }
  })

  it('keeps every spot off the slide ramps, far enough that levelling a pad never dents one', () => {
    for (const { spots, field } of layouts) {
      expect(field.ramps.length).toBeGreaterThan(0)
      for (const r of field.ramps) {
        expect(laneDistance(r, spots.altar.x, spots.altar.z)).toBeGreaterThanOrEqual(SPOT_RAMP_CLEAR.altar)
        for (const p of spots.shrines) expect(laneDistance(r, p.x, p.z)).toBeGreaterThanOrEqual(SPOT_RAMP_CLEAR.shrine)
        for (const p of spots.chests) expect(laneDistance(r, p.x, p.z)).toBeGreaterThanOrEqual(SPOT_RAMP_CLEAR.chest)
        for (const p of spots.pots) expect(laneDistance(r, p.x, p.z)).toBeGreaterThanOrEqual(SPOT_RAMP_CLEAR.pot)
      }
    }
  })

  it('levels the ground under the altar and the shrines', () => {
    for (const { spots, field } of layouts) {
      for (const p of [spots.altar, ...spots.shrines]) expect(field.flatness(p.x, p.z)).toBeGreaterThan(0.999)
    }
  })

  it('leaves every levelled pad with a rim a player can walk up', () => {
    const walkable = Math.cos((50 * Math.PI) / 180)
    for (const { spots, field } of layouts) {
      const pads = [{ p: spots.altar, pad: SPOT_PADS.altar }, ...spots.shrines.map((p) => ({ p, pad: SPOT_PADS.shrine }))]
      for (const { p, pad } of pads) {
        for (let r = pad.radius; r <= pad.radius + pad.blend + 1; r += 0.5) {
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
            expect(field.flatness(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r)).toBeGreaterThan(walkable)
          }
        }
      }
    }
  })

  it('is deterministic for the same seed and terrain', () => {
    const stage = STAGES[1]
    const a = placeSpots(generateTerrain(stage.terrain), new Rng(5))
    const b = placeSpots(generateTerrain(stage.terrain), new Rng(5))
    expect(a.chests.map((p) => p.toArray())).toEqual(b.chests.map((p) => p.toArray()))
    expect(a.altar.toArray()).toEqual(b.altar.toArray())
    const c = placeSpots(generateTerrain(stage.terrain), new Rng(6))
    expect(c.chests.map((p) => p.toArray())).not.toEqual(a.chests.map((p) => p.toArray()))
  })
})

describe('padRimFits', () => {
  const pad = SPOT_PADS.shrine
  const field = (height: (x: number, z: number) => number) => {
    const f = new HeightField(20, 1)
    for (let j = 0; j < f.size; j++) for (let i = 0; i < f.size; i++) f.heights[j * f.size + i] = height(f.coord(i), f.coord(j))
    return f
  }

  it('takes flat ground and gentle slopes', () => {
    expect(padRimFits(field(() => 3), 0, 0, pad, SPOT_RULES.padRim)).toBe(true)
    expect(padRimFits(field((x) => 0.2 * x), 0, 0, pad, SPOT_RULES.padRim)).toBe(true)
  })

  it('refuses a spot whose levelled pad would end in a bank too steep to walk up', () => {
    const steepest = (f: HeightField) => {
      let min = 1
      for (let x = -10; x <= 10; x += 0.25) for (let z = -10; z <= 10; z += 0.25) min = Math.min(min, f.flatness(x, z))
      return Math.acos(min) / (Math.PI / 180)
    }
    // Walkable as it stands (a 45° bank a few metres off, or a 3 m hollow), but not once the pad cuts in.
    for (const height of [(x: number) => Math.max(0, x - 3.5), (x: number, z: number) => -0.8 * Math.max(0, Math.hypot(x, z) - 3.4)]) {
      const f = field(height)
      expect(padRimFits(f, 0, 0, pad, SPOT_RULES.padRim)).toBe(false)
      f.flatten(0, 0, pad.radius, pad.blend)
      expect(steepest(f)).toBeGreaterThan(47)
    }
  })
})
