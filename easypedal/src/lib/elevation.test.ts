import { describe, expect, it } from 'vitest'
import { buildProfile, gainAndLoss, smooth } from './elevation'
import { destination } from './geo'

describe('smooth', () => {
  it('leaves a flat series untouched', () => {
    expect(smooth([10, 10, 10, 10], 3)).toEqual([10, 10, 10, 10])
  })

  it('flattens single-sample spikes', () => {
    const spiky = [10, 10, 40, 10, 10]
    const smoothed = smooth(spiky, 3)
    expect(smoothed[2]).toBeLessThan(30)
    expect(Math.max(...smoothed)).toBeLessThan(Math.max(...spiky))
  })

  it('preserves the series length and endpoints approximately', () => {
    const values = [0, 5, 10, 15, 20]
    const smoothed = smooth(values, 3)
    expect(smoothed).toHaveLength(5)
    expect(smoothed[0]).toBeCloseTo(2.5, 5)
  })

  it('is a no-op for window sizes below 2', () => {
    expect(smooth([1, 9, 3], 1)).toEqual([1, 9, 3])
  })
})

describe('gainAndLoss', () => {
  it('measures a simple climb', () => {
    expect(gainAndLoss([0, 25, 50], 3).gain).toBeCloseTo(50, 5)
  })

  it('measures descent separately', () => {
    const { gain, loss } = gainAndLoss([100, 60, 20], 3)
    expect(gain).toBe(0)
    expect(loss).toBeCloseTo(80, 5)
  })

  it('closes the loop: a there-and-back has equal gain and loss', () => {
    const { gain, loss } = gainAndLoss([0, 30, 60, 30, 0], 3)
    expect(gain).toBeCloseTo(loss, 5)
    expect(gain).toBeCloseTo(60, 5)
  })

  it('ignores oscillation below the threshold', () => {
    const noisy = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 100 : 101.5))
    expect(gainAndLoss(noisy, 3).gain).toBe(0)
  })

  it('still accumulates a gradual climb made of sub-threshold steps', () => {
    // 100 steps of 1 m each: no single step clears the 3 m threshold, but the
    // climb is real and must be counted.
    const gradual = Array.from({ length: 101 }, (_, i) => i)
    expect(gainAndLoss(gradual, 3).gain).toBeGreaterThan(90)
  })

  it('returns zero for degenerate input', () => {
    expect(gainAndLoss([], 3)).toEqual({ gain: 0, loss: 0 })
    expect(gainAndLoss([42], 3)).toEqual({ gain: 0, loss: 0 })
  })
})

describe('buildProfile', () => {
  const points = Array.from({ length: 5 }, (_, i) => destination({ lat: 42.36, lng: -71.06 }, 90, i * 500))

  it('reports distances, extremes and ascent together', () => {
    const profile = buildProfile(points, [10, 30, 60, 30, 10])
    expect(profile.distances).toHaveLength(5)
    expect(profile.distances[4]).toBeCloseTo(2000, 0)
    expect(profile.gain).toBeGreaterThan(0)
    expect(profile.maxElevation).toBeGreaterThan(profile.minElevation)
  })

  it('reports near-zero ascent for noisy flat ground', () => {
    const flatNoisy = points.map((_, i) => 5 + (i % 2) * 1.2)
    expect(buildProfile(points, flatNoisy).gain).toBe(0)
  })
})
