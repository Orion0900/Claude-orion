import { Rng } from '../core/rng'
import { circlePoint, clampToSquare, ringPoint, ringSpots, type Point2 } from './placement'

describe('ringPoint', () => {
  it('lands on the ring in open ground', () => {
    const rng = new Rng(5)
    const p = { x: 0, z: 0 }
    for (let i = 0; i < 200; i++) {
      expect(ringPoint(rng, 10, -5, 28, 40, 200, p)).toBe(true)
      const d = Math.hypot(p.x - 10, p.z + 5)
      expect(d).toBeGreaterThanOrEqual(28 - 1e-9)
      expect(d).toBeLessThanOrEqual(40 + 1e-9)
    }
  })

  it('stays inside the map near a wall', () => {
    const rng = new Rng(8)
    const p = { x: 0, z: 0 }
    for (let i = 0; i < 200; i++) {
      ringPoint(rng, 90, 90, 28, 40, 94, p)
      expect(Math.abs(p.x)).toBeLessThanOrEqual(94)
      expect(Math.abs(p.z)).toBeLessThanOrEqual(94)
    }
  })

  it('clamps when no ring point fits', () => {
    const rng = new Rng(1)
    const p = { x: 0, z: 0 }
    expect(ringPoint(rng, 0, 0, 28, 40, 10, p)).toBe(false)
    expect(Math.abs(p.x)).toBeLessThanOrEqual(10)
    expect(Math.abs(p.z)).toBeLessThanOrEqual(10)
  })
})

describe('circlePoint', () => {
  it('spaces points evenly', () => {
    const p = { x: 0, z: 0 }
    circlePoint(0, 4, 5, 1, 1, 0, p)
    expect(p.x).toBeCloseTo(6)
    expect(p.z).toBeCloseTo(1)
    circlePoint(1, 4, 5, 1, 1, 0, p)
    expect(p.x).toBeCloseTo(1)
    expect(p.z).toBeCloseTo(6)
  })

  it('survives n = 0', () => {
    const p = circlePoint(0, 0, 3, 0, 0, 0, { x: 0, z: 0 })
    expect(Number.isFinite(p.x)).toBe(true)
  })
})

describe('ringSpots', () => {
  it('spaces n points evenly on the ring in open ground', () => {
    const out: Point2[] = []
    expect(ringSpots(8, 16, 5, -5, 0, 94, out)).toBe(8)
    for (let i = 0; i < 8; i++) {
      expect(Math.hypot(out[i].x - 5, out[i].z + 5)).toBeCloseTo(16)
      const next = out[(i + 1) % 8]
      expect(Math.hypot(next.x - out[i].x, next.z - out[i].z)).toBeCloseTo(2 * 16 * Math.sin(Math.PI / 8))
    }
  })

  it('closes against a wall as an arc instead of piling onto it', () => {
    const out: Point2[] = []
    expect(ringSpots(30, 16, 88, 0, 0.3, 94, out)).toBe(30)
    for (let i = 0; i < 30; i++) {
      expect(Math.abs(out[i].x)).toBeLessThanOrEqual(94)
      expect(Math.hypot(out[i].x - 88, out[i].z)).toBeCloseTo(16)
    }
    // No two members share a spot.
    const keys = new Set(out.slice(0, 30).map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`))
    expect(keys.size).toBe(30)
  })

  it('places nothing when no part of the ring is inside', () => {
    expect(ringSpots(10, 50, 0, 0, 0, 20, [])).toBe(0)
    expect(ringSpots(0, 16, 0, 0, 0, 94, [])).toBe(0)
  })
})

describe('clampToSquare', () => {
  it('pulls points inside', () => {
    expect(clampToSquare({ x: 50, z: -50 }, 10)).toEqual({ x: 10, z: -10 })
  })
})
