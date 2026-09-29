import {
  RAMP_RULES,
  RAMP_SHAPE,
  laneDistance,
  nearRamp,
  planRamps,
  rampDrop,
  rampFall,
  rampFootprint,
  rampHeight,
  rampSurface,
  type SlideRamp,
} from './ramps'
import { segmentPointDistance } from './colliders'

const deg = Math.PI / 180
const ramp: SlideRamp = {
  x: 10, z: -20, dx: 0.6, dz: 0.8, length: 35, angle: 20 * deg, top: 12,
  sideBlend: RAMP_SHAPE.sideBlend, backBlend: RAMP_SHAPE.backBlend,
}

describe('rampDrop', () => {
  it('is flat on the deck, eases in and out, and holds the full angle in the middle', () => {
    expect(rampDrop(ramp, -3)).toBe(0)
    expect(rampDrop(ramp, 0)).toBe(0)
    const slope = (u: number) => (rampDrop(ramp, u + 0.01) - rampDrop(ramp, u - 0.01)) / 0.02
    expect(slope(0.02)).toBeLessThan(0.01)
    expect(slope(ramp.length - 0.02)).toBeLessThan(0.01)
    expect(slope(ramp.length / 2)).toBeCloseTo(Math.tan(ramp.angle), 6)
    // Continuous where the pieces meet.
    for (const u of [RAMP_SHAPE.lip, ramp.length - RAMP_SHAPE.foot]) {
      expect(Math.abs(rampDrop(ramp, u + 1e-6) - rampDrop(ramp, u - 1e-6))).toBeLessThan(1e-5)
      expect(Math.abs(slope(u + 0.02) - slope(u - 0.02))).toBeLessThan(0.01)
    }
    expect(rampDrop(ramp, ramp.length + 7)).toBeCloseTo(rampFall(ramp), 9)
  })

  it('never climbs, and never bends sharply enough to launch a fast slide', () => {
    let last = 0
    let bend = 0
    for (let u = -2; u <= ramp.length + 2; u += 0.25) {
      const d = rampDrop(ramp, u)
      expect(d).toBeGreaterThanOrEqual(last - 1e-12)
      last = d
      bend = Math.max(bend, Math.abs(rampDrop(ramp, u + 0.25) - 2 * d + rampDrop(ramp, u - 0.25)) / 0.0625)
    }
    // Curvature of at most ~0.1/m: the lip rounds over a radius of 10 m or more.
    expect(bend).toBeLessThan(0.1)
  })

  it('drops as much as a 30–40 m run at 15–25° should', () => {
    const fall = rampFall(ramp)
    expect(fall).toBeCloseTo(Math.tan(ramp.angle) * (ramp.length - (RAMP_SHAPE.lip + RAMP_SHAPE.foot) / 2), 9)
    expect(fall / ramp.length).toBeGreaterThan(Math.tan(15 * deg))
    expect(fall / ramp.length).toBeLessThan(Math.tan(25 * deg))
  })
})

describe('rampHeight', () => {
  it('is the ramp surface on the lane and the natural ground outside the footprint', () => {
    const at = (u: number, v: number) => [ramp.x + ramp.dx * u - ramp.dz * v, ramp.z + ramp.dz * u + ramp.dx * v] as const
    for (const [u, v] of [[-4, 0], [0, 2], [17, -4], [ramp.length, 0], [ramp.length + 9, 3]]) {
      const [x, z] = at(u, v)
      expect(rampHeight(ramp, x, z, -50)).toBeCloseTo(rampSurface(ramp, u, v), 9)
      expect(laneDistance(ramp, x, z)).toBe(0)
      expect(nearRamp([ramp], x, z, 0.1)).toBe(true)
    }
    const [fx, fz] = at(ramp.length + RAMP_SHAPE.runout + RAMP_SHAPE.frontBlend + 1, 0)
    expect(rampHeight(ramp, fx, fz, -50)).toBe(-50)
    const [sx, sz] = at(10, RAMP_SHAPE.halfWidth + RAMP_SHAPE.sideBlend + 0.5)
    expect(rampHeight(ramp, sx, sz, 3)).toBe(3)
    expect(laneDistance(ramp, sx, sz)).toBeCloseTo(RAMP_SHAPE.sideBlend + 0.5, 9)
    expect(nearRamp([ramp], sx, sz, 5)).toBe(false)
  })

  it('dishes the lane so a slide drifts back to the middle', () => {
    expect(rampSurface(ramp, 10, RAMP_SHAPE.halfWidth)).toBeCloseTo(rampSurface(ramp, 10, 0) + RAMP_SHAPE.bank, 9)
    expect(rampSurface(ramp, 10, -2)).toBeGreaterThan(rampSurface(ramp, 10, 0))
  })
})

describe('planRamps', () => {
  // A long tilted plane with a bump in the middle: plenty of room, one obvious fall line.
  const ground = (x: number, z: number) => -0.25 * x + 3 * Math.exp(-(x * x + z * z) / 400)

  it('is deterministic by seed, and different seeds place them differently', () => {
    const a = planRamps(ground, 7)
    const b = planRamps(ground, 7)
    const c = planRamps(ground, 8)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('places a few ramps clear of the start and the rim, apart from each other, within the length and angle rules', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const ramps = planRamps(ground, seed)
      // Aims for 3–4; a one-way slope like this only fits a couple running downhill.
      expect(ramps.length).toBeGreaterThanOrEqual(2)
      expect(ramps.length).toBeLessThanOrEqual(RAMP_RULES.count[1])
      for (const r of ramps) {
        expect(Math.hypot(r.dx, r.dz)).toBeCloseTo(1, 9)
        expect(r.length).toBeGreaterThanOrEqual(RAMP_RULES.length[0])
        expect(r.length).toBeLessThanOrEqual(RAMP_RULES.length[1])
        expect(r.angle / deg).toBeGreaterThanOrEqual(RAMP_RULES.angle[0])
        expect(r.angle / deg).toBeLessThanOrEqual(RAMP_RULES.angle[1])
        // With its least blends the footprint keeps the rules exactly; widened, within the slack.
        const least = { ...r, sideBlend: RAMP_SHAPE.sideBlend, backBlend: RAMP_SHAPE.backBlend }
        for (const [shape, slack] of [[least, 0], [r, RAMP_RULES.blendSlack]] as const) {
          const f = rampFootprint(shape)
          expect(segmentPointDistance(f.ax, f.az, f.bx, f.bz, 0, 0) - f.half).toBeGreaterThanOrEqual(RAMP_RULES.startClear - slack - 1e-9)
          // The footprint rectangle's corners stay inside the square.
          const px = -r.dz * f.half
          const pz = r.dx * f.half
          for (const [x, z] of [[f.ax + px, f.az + pz], [f.ax - px, f.az - pz], [f.bx + px, f.bz + pz], [f.bx - px, f.bz - pz]]) {
            expect(Math.abs(x)).toBeLessThanOrEqual(RAMP_RULES.limit + slack + 1e-9)
            expect(Math.abs(z)).toBeLessThanOrEqual(RAMP_RULES.limit + slack + 1e-9)
          }
        }
      }
      for (let i = 0; i < ramps.length; i++) {
        for (let j = i + 1; j < ramps.length; j++) {
          const a = rampFootprint(ramps[i])
          const b = rampFootprint(ramps[j])
          const gap = Math.min(
            segmentPointDistance(a.ax, a.az, a.bx, a.bz, b.ax, b.az),
            segmentPointDistance(a.ax, a.az, a.bx, a.bz, b.bx, b.bz),
            segmentPointDistance(b.ax, b.az, b.bx, b.bz, a.ax, a.az),
            segmentPointDistance(b.ax, b.az, b.bx, b.bz, a.bx, a.bz),
          )
          expect(gap - a.half - b.half).toBeGreaterThanOrEqual(RAMP_RULES.gap - 1e-9)
        }
      }
    }
  })

  it('fits each deck to the ground, so the lane runs along the natural slope', () => {
    for (const r of planRamps(ground, 11)) {
      // On a plane falling toward +x the best lanes point downhill that way.
      expect(r.dx).toBeGreaterThan(0.5)
      let worst = 0
      for (let u = -RAMP_SHAPE.deck; u <= r.length + RAMP_SHAPE.runout; u += 2) {
        worst = Math.max(worst, Math.abs(ground(r.x + r.dx * u, r.z + r.dz * u) - rampSurface(r, u, 0)))
      }
      expect(worst).toBeLessThanOrEqual(RAMP_RULES.maxMisfit)
    }
  })

  it('widens the blends where a lane cuts into steep hills, so every bank stays walkable', () => {
    // A hillside steeper than any face: each deck cuts into it and each run-out stands proud of it.
    const valley = (x: number, z: number) => -0.4 * x + 3 * Math.exp(-(x * x + z * z) / 400)
    const limit = Math.tan(RAMP_RULES.maxBank * deg)
    const gradient = (fn: (x: number, z: number) => number, x: number, z: number) =>
      Math.hypot(fn(x + 0.5, z) - fn(x - 0.5, z), fn(x, z + 0.5) - fn(x, z - 0.5))
    let widened = 0
    for (const seed of [1, 2, 3]) {
      const ramps = planRamps(valley, seed)
      expect(ramps.length).toBeGreaterThan(0)
      for (const r of ramps) {
        expect(r.sideBlend).toBeGreaterThanOrEqual(RAMP_SHAPE.sideBlend)
        expect(r.sideBlend).toBeLessThanOrEqual(RAMP_SHAPE.sideBlend * RAMP_RULES.maxBlend)
        expect(r.backBlend / r.sideBlend).toBeCloseTo(RAMP_SHAPE.backBlend / RAMP_SHAPE.sideBlend, 9)
        if (r.sideBlend > RAMP_SHAPE.sideBlend) widened++
        const blended = (x: number, z: number) => rampHeight(r, x, z, valley(x, z))
        const f = rampFootprint(r)
        for (let u = -RAMP_SHAPE.deck - r.backBlend; u <= r.length + RAMP_SHAPE.runout + RAMP_SHAPE.frontBlend; u += 0.5) {
          for (let v = -f.half; v <= f.half; v += 0.5) {
            const x = r.x + r.dx * u - r.dz * v
            const z = r.z + r.dz * u + r.dx * v
            if (laneDistance(r, x, z) === 0) continue
            // Up to sampling slack, never steeper than the limit unless the hills already were.
            expect(gradient(blended, x, z)).toBeLessThan(Math.max(limit * 1.03, gradient(valley, x, z) + 0.03))
          }
        }
      }
    }
    // The narrowest blend would leave cliffs on this hillside.
    expect(widened).toBeGreaterThan(0)
  })

  it('gives up gracefully when there is no room', () => {
    expect(planRamps(ground, 3, { ...RAMP_RULES, limit: 20 })).toEqual([])
  })
})
