import { describe, expect, it } from 'vitest'
import { FAIL_RULE, RULES, cleanCount, emptyLog, isBlank, liftDone, normalizeLog } from './tasks'

describe('the rules', () => {
  it('are the five on the whiteboard, and the one that makes them hard', () => {
    expect(RULES).toEqual([
      'Lift 6× a week, 15 sets a day',
      'Half Marathon Saturdays',
      'Neck on Uppers',
      '100× Hyperextensions a week',
      'Maker School 1× a day',
    ])
    expect(FAIL_RULE).toBe('Fail = Start Over')
  })
})

describe('a lift', () => {
  it('takes fifteen sets, upper with neck or lower', () => {
    expect(liftDone({ ...emptyLog(), sets: 15 })).toBe(false)
    expect(liftDone({ ...emptyLog(), sets: 14, split: 'upper' })).toBe(false)
    expect(liftDone({ ...emptyLog(), sets: 15, split: 'upper' })).toBe(true)
    expect(liftDone({ ...emptyLog(), sets: 20, split: 'lower' })).toBe(true)
  })
})

describe('a blank day', () => {
  it('has nothing logged at all', () => {
    expect(isBlank(emptyLog())).toBe(true)
    expect(isBlank({ ...emptyLog(), note: 'rained' })).toBe(true)
    expect(isBlank({ ...emptyLog(), sets: 1 })).toBe(false)
    expect(isBlank({ ...emptyLog(), rest: true })).toBe(false)
    expect(isBlank({ ...emptyLog(), hyperextensions: 10 })).toBe(false)
  })
})

describe('normalizeLog', () => {
  it('keeps what is valid and defaults the rest', () => {
    expect(normalizeLog({ sets: 7.8, split: 'sideways', rest: 'yes', hyperextensions: -5, makerSchool: true })).toEqual({
      ...emptyLog(),
      sets: 7,
      makerSchool: true,
    })
    expect(normalizeLog(null)).toEqual(emptyLog())
    expect(normalizeLog({ sets: Infinity }).sets).toBe(0)
  })

  it('reads a day logged by the first version', () => {
    const old = { sets: 15, neck: true, halfMarathon: false, hyperextensions: 45, makerSchool: true, vlog: true, note: 'push' }
    expect(normalizeLog(old)).toEqual({
      sets: 15,
      split: 'upper',
      rest: false,
      halfMarathon: false,
      hyperextensions: 45,
      makerSchool: true,
      note: 'push',
    })
    expect(normalizeLog({ sets: 15, neck: false }).split).toBeNull()
  })
})

describe('cleanCount', () => {
  it('keeps counts whole, positive and sane', () => {
    expect(cleanCount(12.9)).toBe(12)
    expect(cleanCount(-1)).toBe(0)
    expect(cleanCount('20')).toBe(0)
    expect(cleanCount(1e9, 999)).toBe(999)
  })
})
