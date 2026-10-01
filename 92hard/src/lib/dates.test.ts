import { describe, expect, it } from 'vitest'
import { addDays, dateKey, daysBetween, isDateKey, msUntilMidnight } from './dates'

describe('dateKey', () => {
  it('names the local calendar day', () => {
    expect(dateKey(new Date(2026, 9, 1, 23, 59))).toBe('2026-10-01')
    expect(dateKey(new Date(2026, 0, 5, 0, 0))).toBe('2026-01-05')
  })
})

describe('isDateKey', () => {
  it('accepts real dates only', () => {
    expect(isDateKey('2026-10-01')).toBe(true)
    expect(isDateKey('2028-02-29')).toBe(true)
    expect(isDateKey('2026-02-29')).toBe(false)
    expect(isDateKey('2026-13-01')).toBe(false)
    expect(isDateKey('2026-1-01')).toBe(false)
    expect(isDateKey(20261001)).toBe(false)
  })
})

describe('day arithmetic', () => {
  it('runs from October 1st to December 31st in 92 days', () => {
    expect(addDays('2026-10-01', 91)).toBe('2026-12-31')
    expect(daysBetween('2026-10-01', '2026-12-31')).toBe(91)
  })
  it('crosses months, years and leap days', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-12-31', '2026-10-01')).toBe(-91)
  })
  it('is not thrown by daylight saving changes', () => {
    // US clocks go back on November 1st 2026; the count must not notice.
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
  })
})

describe('msUntilMidnight', () => {
  it('counts down to the next local day', () => {
    expect(msUntilMidnight(new Date(2026, 9, 1, 23, 0, 0))).toBe(3_600_000)
    expect(msUntilMidnight(new Date(2026, 9, 1, 0, 0, 0))).toBe(86_400_000)
  })
})
