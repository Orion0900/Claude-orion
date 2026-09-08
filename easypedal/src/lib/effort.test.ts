import { describe, expect, it } from 'vitest'
import { estimateDuration, SECONDS_PER_METER_CLIMBED } from './effort'

describe('estimateDuration', () => {
  it('is pure distance over speed on the flat', () => {
    // 11 miles at 11 mph is an hour.
    expect(estimateDuration(11 * 1609.344, 0, 11, 'mi')).toBeCloseTo(3600, 0)
    expect(estimateDuration(18000, 0, 18, 'km')).toBeCloseTo(3600, 0)
  })

  it('adds a fixed cost per metre climbed', () => {
    const flat = estimateDuration(10000, 0, 18, 'km')
    expect(estimateDuration(10000, 100, 18, 'km') - flat).toBeCloseTo(100 * SECONDS_PER_METER_CLIMBED, 5)
  })

  it('never divides by zero', () => {
    expect(estimateDuration(10000, 50, 0, 'km')).toBe(0)
  })
})
