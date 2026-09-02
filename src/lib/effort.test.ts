import { describe, expect, it } from 'vitest'
import { estimateDuration, parsePace } from './effort'
import { feetToMeters, milesToMeters } from './units'

describe('estimateDuration', () => {
  it('is flat pace times distance on flat ground', () => {
    expect(estimateDuration(milesToMeters(5), 0, 540, 'mi')).toBeCloseTo(2700, 3)
  })

  it('adds about 30 seconds per 100 feet of climb', () => {
    const flat = estimateDuration(milesToMeters(5), 0, 540, 'mi')
    const hilly = estimateDuration(milesToMeters(5), feetToMeters(500), 540, 'mi')
    expect(hilly - flat).toBeCloseTo(150, 0)
  })

  it('works in kilometres', () => {
    expect(estimateDuration(10000, 0, 300, 'km')).toBeCloseTo(3000, 3)
  })
})

describe('parsePace', () => {
  it('parses minutes and seconds', () => {
    expect(parsePace('8:30')).toBe(510)
    expect(parsePace('10:05')).toBe(605)
  })

  it('parses bare minutes', () => {
    expect(parsePace('9')).toBe(540)
  })

  it('rejects nonsense', () => {
    for (const bad of ['', 'fast', '8:75', '-3', '8:30:00']) {
      expect(parsePace(bad)).toBeNull()
    }
  })

  it('rejects a zero pace', () => {
    expect(parsePace('0:00')).toBeNull()
  })
})
