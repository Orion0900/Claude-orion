import { describe, expect, it } from 'vitest'
import { formatAway, formatDistance, formatSpread, fromUnit, toUnit } from './units'

describe('toUnit and fromUnit', () => {
  it('round-trip in both units', () => {
    for (const unit of ['yd', 'm'] as const) {
      expect(fromUnit(toUnit(137, unit), unit)).toBeCloseTo(137, 9)
    }
  })

  it('knows a yard is shorter than a metre', () => {
    expect(toUnit(100, 'yd')).toBeGreaterThan(toUnit(100, 'm'))
  })
})

describe('formatDistance', () => {
  it('rounds to whole units — nobody hits a club to the decimal', () => {
    expect(formatDistance(137.16, 'yd')).toBe('150 yd')
    expect(formatDistance(137.4, 'm')).toBe('137 m')
  })
})

describe('formatSpread', () => {
  it('marks it as a spread without repeating the unit', () => {
    expect(formatSpread(9.144, 'yd')).toBe('±10')
  })
})

describe('formatAway', () => {
  it('uses golf units for something on this hole', () => {
    expect(formatAway(137.16, 'yd')).toBe('150 yd')
    expect(formatAway(300, 'm')).toBe('300 m')
  })

  it('switches to road units for the course across town', () => {
    expect(formatAway(1648, 'yd')).toBe('1.0 mi')
    expect(formatAway(2500, 'm')).toBe('2.5 km')
  })
})
