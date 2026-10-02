import { describe, expect, it } from 'vitest'
import { FAIL_RULE, RULES, cleanCount, emptyLog, isBlank, normalizeLog } from './tasks'

describe('the rules', () => {
  it('are the five on the whiteboard and the vlog, and the one that makes them hard', () => {
    expect(RULES).toEqual([
      'Lift 6× a week, 15 sets a day',
      'Half Marathon Saturdays',
      'Neck on Uppers',
      '100× Hyperextensions a week',
      'Maker School 1× a day',
      'Vlog 1× a day',
    ])
    expect(FAIL_RULE).toBe('Fail = Start Over')
  })
})

describe('a lift logged set by set, as earlier versions did', () => {
  it('reads as ticked at fifteen sets', () => {
    expect(normalizeLog({ sets: 15, split: 'lower' }).lifted).toBe(true)
    expect(normalizeLog({ sets: 15, split: null }).lifted).toBe(true)
    expect(normalizeLog({ sets: 14, split: 'upper' }).lifted).toBe(false)
    expect(normalizeLog({ lifted: false, sets: 20 }).lifted).toBe(false)
  })
})

describe('a blank day', () => {
  it('has nothing logged at all', () => {
    expect(isBlank(emptyLog())).toBe(true)
    expect(isBlank({ ...emptyLog(), note: 'rained' })).toBe(true)
    expect(isBlank({ ...emptyLog(), lifted: true })).toBe(false)
    expect(isBlank({ ...emptyLog(), rest: true })).toBe(false)
    expect(isBlank({ ...emptyLog(), vlog: true })).toBe(false)
    expect(isBlank({ ...emptyLog(), hyperextensions: 10 })).toBe(false)
  })
})

describe('normalizeLog', () => {
  it('keeps what is valid and defaults the rest', () => {
    expect(normalizeLog({ lifted: 'yes', rest: 1, hyperextensions: 12.8, makerSchool: true, vlog: true })).toEqual({
      ...emptyLog(),
      hyperextensions: 12,
      makerSchool: true,
      vlog: true,
    })
    expect(normalizeLog(null)).toEqual(emptyLog())
    expect(normalizeLog({ hyperextensions: Infinity }).hyperextensions).toBe(0)
  })

  it('reads a day logged by the last version, before the vlog came back', () => {
    const last = { sets: 15, split: 'upper', rest: false, halfMarathon: false, hyperextensions: 20, makerSchool: true, note: '' }
    expect(normalizeLog(last)).toEqual({ ...emptyLog(), lifted: true, hyperextensions: 20, makerSchool: true })
  })

  it('reads a day logged by the first version', () => {
    const old = { sets: 15, neck: true, halfMarathon: false, hyperextensions: 45, makerSchool: true, vlog: true, note: 'push' }
    expect(normalizeLog(old)).toEqual({
      lifted: true,
      rest: false,
      halfMarathon: false,
      hyperextensions: 45,
      makerSchool: true,
      vlog: true,
      note: 'push',
    })
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
