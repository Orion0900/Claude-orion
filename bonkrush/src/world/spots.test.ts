import type { Vector3 } from 'three'
import { Rng } from '../core/rng'
import { STAGES } from '../data/stages'
import { SPOT_CLEARANCE, SPOT_RULES, placeSpots } from './spots'
import { generateTerrain } from './terrain'

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

  it('levels the ground under the altar and the shrines', () => {
    for (const { spots, field } of layouts) {
      for (const p of [spots.altar, ...spots.shrines]) expect(field.flatness(p.x, p.z)).toBeGreaterThan(0.999)
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
