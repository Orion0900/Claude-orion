import { describe, expect, it } from 'vitest'
import {
  distanceToMeters,
  elevationToMeters,
  feetToMeters,
  formatDistance,
  formatDuration,
  formatElevation,
  formatPace,
  metersToDistance,
  metersToElevation,
  milesToMeters,
} from './units'

describe('conversions', () => {
  it('round-trips distances', () => {
    expect(metersToDistance(milesToMeters(5), 'mi')).toBeCloseTo(5, 9)
    expect(metersToDistance(distanceToMeters(8, 'km'), 'km')).toBeCloseTo(8, 9)
  })

  it('round-trips elevations', () => {
    expect(metersToElevation(feetToMeters(500), 'ft')).toBeCloseTo(500, 9)
    expect(elevationToMeters(120, 'm')).toBe(120)
  })

  it('uses the standard mile and foot', () => {
    expect(milesToMeters(1)).toBeCloseTo(1609.344, 6)
    expect(feetToMeters(1)).toBeCloseTo(0.3048, 6)
  })
})

describe('formatting', () => {
  it('formats distance to two decimals with the unit', () => {
    expect(formatDistance(milesToMeters(5), 'mi')).toBe('5.00 mi')
    expect(formatDistance(5000, 'km')).toBe('5.00 km')
  })

  it('rounds elevation to whole units', () => {
    expect(formatElevation(feetToMeters(500), 'ft')).toBe('500 ft')
    expect(formatElevation(152.4, 'm')).toBe('152 m')
  })

  it('formats pace as minutes and seconds', () => {
    expect(formatPace(504, 'mi')).toBe('8:24 /mi')
    expect(formatPace(300, 'km')).toBe('5:00 /km')
  })

  it('carries a rounded 60-second pace into the next minute', () => {
    expect(formatPace(479.7, 'mi')).toBe('8:00 /mi')
  })

  it('formats durations with and without hours', () => {
    expect(formatDuration(2652)).toBe('44:12')
    expect(formatDuration(3870)).toBe('1:04:30')
    expect(formatDuration(59)).toBe('0:59')
  })
})
