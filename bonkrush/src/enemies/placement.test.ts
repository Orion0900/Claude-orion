import { Rng } from '../core/rng'
import { circlePoint, clampToSquare, ringPoint } from './placement'

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

describe('clampToSquare', () => {
  it('pulls points inside', () => {
    expect(clampToSquare({ x: 50, z: -50 }, 10)).toEqual({ x: 10, z: -10 })
  })
})
