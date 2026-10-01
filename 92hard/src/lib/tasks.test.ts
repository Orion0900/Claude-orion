import { describe, expect, it } from 'vitest'
import { emptyLog, isDayComplete, isTaskDone, normalizeLog, tasksDone, type DayLog } from './tasks'

const full: DayLog = { ...emptyLog(), sets: 15, neck: true, hyperextensions: 100, makerSchool: true, vlog: true }

describe('the gym task', () => {
  it('takes fifteen sets and neck', () => {
    expect(isTaskDone({ ...emptyLog(), sets: 15 }, 'training')).toBe(false)
    expect(isTaskDone({ ...emptyLog(), sets: 14, neck: true }, 'training')).toBe(false)
    expect(isTaskDone({ ...emptyLog(), sets: 15, neck: true }, 'training')).toBe(true)
    expect(isTaskDone({ ...emptyLog(), sets: 20, neck: true }, 'training')).toBe(true)
  })
  it('is done by a half marathon instead', () => {
    expect(isTaskDone({ ...emptyLog(), halfMarathon: true }, 'training')).toBe(true)
  })
})

describe('the other tasks', () => {
  it('needs a hundred hyperextensions', () => {
    expect(isTaskDone({ ...emptyLog(), hyperextensions: 99 }, 'hyperextensions')).toBe(false)
    expect(isTaskDone({ ...emptyLog(), hyperextensions: 100 }, 'hyperextensions')).toBe(true)
  })
  it('counts Maker School and the vlog once each', () => {
    expect(isTaskDone({ ...emptyLog(), makerSchool: true }, 'makerSchool')).toBe(true)
    expect(isTaskDone({ ...emptyLog(), vlog: true }, 'vlog')).toBe(true)
    expect(isTaskDone(emptyLog(), 'vlog')).toBe(false)
  })
})

describe('a day', () => {
  it('is complete only with all four done', () => {
    expect(isDayComplete(full)).toBe(true)
    expect(isDayComplete({ ...full, vlog: false })).toBe(false)
    expect(isDayComplete({ ...full, sets: 0, neck: false, halfMarathon: true })).toBe(true)
    expect(isDayComplete(undefined)).toBe(false)
    expect(tasksDone({ ...full, makerSchool: false, hyperextensions: 40 })).toBe(2)
  })
})

describe('normalizeLog', () => {
  it('keeps what is valid and defaults the rest', () => {
    expect(normalizeLog({ sets: 7.8, neck: 'yes', hyperextensions: -5, vlog: true, note: 'leg day' })).toEqual({
      ...emptyLog(),
      sets: 7,
      vlog: true,
      note: 'leg day',
    })
    expect(normalizeLog(null)).toEqual(emptyLog())
    expect(normalizeLog({ sets: Infinity }).sets).toBe(0)
  })
})
