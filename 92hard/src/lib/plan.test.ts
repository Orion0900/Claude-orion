import { describe, expect, it } from 'vitest'
import { ROUTINE, clock, groupFor, slotTime, timeSpan, upNext } from './plan'

const at = (h: number, m = 0) => h * 60 + m
const THURSDAY = 4
const FRIDAY = 5
const SATURDAY = 6
const SUNDAY = 0

describe('the routine', () => {
  it('has a plan for every day of the week', () => {
    expect(groupFor(THURSDAY).label).toBe('M–F')
    expect(groupFor(SATURDAY).label).toBe('Saturday')
    expect(groupFor(SUNDAY).label).toBe('Sunday')
    expect(ROUTINE.flatMap((group) => group.days).sort()).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('starts weekends with Maker School at 6:30', () => {
    for (const day of [SATURDAY, SUNDAY]) expect(groupFor(day).slots[0]).toMatchObject({ what: 'Maker School', start: at(6, 30) })
  })
})

describe('now and next', () => {
  const what = (weekday: number, minutes: number) => {
    const { now, next } = upNext(weekday, minutes)
    return [now?.what ?? null, next.what]
  }

  it('walks a weekday', () => {
    expect(what(THURSDAY, at(4))).toEqual(['Sleep', 'Gym'])
    expect(what(THURSDAY, at(5, 30))).toEqual(['Gym', 'Maker School'])
    expect(what(THURSDAY, at(6, 15))).toEqual([null, 'Maker School'])
    expect(what(THURSDAY, at(7, 40))).toEqual(['Maker School', 'Work'])
    expect(what(THURSDAY, at(12))).toEqual(['Work', 'Sleep'])
    expect(what(THURSDAY, at(18))).toEqual([null, 'Sleep'])
  })

  it('looks to tomorrow once it is time for bed', () => {
    expect(what(THURSDAY, at(21))).toEqual(['Sleep', 'Gym'])
    expect(what(FRIDAY, at(20, 30))).toEqual(['Sleep', 'Maker School'])
    expect(upNext(FRIDAY, at(22)).next.start).toBe(at(6, 30))
  })

  it('leaves date night untimed, as on the board', () => {
    expect(what(SATURDAY, at(10, 15))).toEqual([null, 'Date Night'])
    expect(upNext(SATURDAY, at(10, 15)).next.start).toBeNull()
  })

  it('walks a Sunday', () => {
    expect(what(SUNDAY, at(9))).toEqual([null, 'Magic'])
    expect(what(SUNDAY, at(13))).toEqual([null, 'Friends & Family Dinner'])
    expect(what(SUNDAY, at(18))).toEqual([null, 'Sleep'])
  })
})

describe('times', () => {
  it('reads a clock', () => {
    expect(clock(0)).toBe('12:00 AM')
    expect(clock(at(5))).toBe('5:00 AM')
    expect(clock(at(12))).toBe('12:00 PM')
    expect(clock(at(20, 30))).toBe('8:30 PM')
  })

  it('writes a span once when it stays on one side of noon', () => {
    expect(timeSpan(at(5), at(6))).toBe('5:00–6:00 AM')
    expect(timeSpan(at(9), at(17))).toBe('9:00 AM–5:00 PM')
    expect(timeSpan(at(20, 30), at(4, 30))).toBe('8:30 PM–4:30 AM')
  })

  it('writes each slot the way the board does', () => {
    const [weekdays, saturday] = ROUTINE
    expect(weekdays.slots.map(slotTime)).toEqual(['5:00–6:00 AM', '7:00–8:30 AM', '9:00 AM–5:00 PM'])
    expect(saturday.slots.map(slotTime)).toEqual(['6:30 AM', '9:30 AM', 'X:00'])
  })
})
