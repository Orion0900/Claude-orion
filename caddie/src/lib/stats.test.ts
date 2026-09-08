import { describe, expect, it } from 'vitest'
import { normalCdf, probabilityBetween, trimmedMean, stdDev } from './stats'

describe('normalCdf', () => {
  it('is a half at zero and near one far out', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3)
  })
})

describe('probabilityBetween', () => {
  it('captures most of the mass within two deviations', () => {
    expect(probabilityBetween(100, 10, 80, 120)).toBeCloseTo(0.954, 2)
  })
  it('handles a zero spread as a point', () => {
    expect(probabilityBetween(100, 0, 90, 110)).toBe(1)
    expect(probabilityBetween(100, 0, 110, 120)).toBe(0)
  })
})

describe('trimmedMean', () => {
  it('drops the outliers once there are enough samples', () => {
    expect(trimmedMean([100, 101, 99, 100, 102, 100, 100, 100, 100, 20])).toBe(100)
  })
  it('keeps every sample when there are few', () => {
    expect(trimmedMean([100, 20])).toBe(60)
  })
})

describe('stdDev', () => {
  it('is zero for a single value', () => {
    expect(stdDev([5])).toBe(0)
  })
})
