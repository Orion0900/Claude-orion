import { describe, expect, it } from 'vitest'
import {
  attemptOnDay,
  bestStreak,
  canLog,
  dayState,
  dayTasks,
  EMPTY_STATE,
  endAttempt,
  finishDate,
  getStatus,
  hyperextensionsDue,
  isDayDone,
  logFor,
  newAttempt,
  normalizeState,
  restDay,
  streak,
  summarize,
  totals,
  updateLog,
  weekHyperextensions,
  weekLifts,
  type AppState,
  type Attempt,
} from './challenge'
import { SATURDAY, addDays, weekday, type DateKey } from './dates'
import { emptyLog, type DayLog } from './tasks'

// A Thursday.
const START = '2026-10-01'
const lifted: DayLog = { ...emptyLog(), sets: 15, split: 'lower', hyperextensions: 15, makerSchool: true }

/** A day done the plain way: a lift, Maker School, 15 hyperextensions, and the half marathon on a Saturday. */
function fullDay(date: DateKey): DayLog {
  return weekday(date) === SATURDAY ? { ...lifted, halfMarathon: true } : lifted
}

/** An attempt from its start with the first `days` days done. */
function doneThrough(days: number, attempt = newAttempt(START)): Attempt {
  const logs = { ...attempt.logs }
  for (let i = 0; i < days; i++) {
    const date = addDays(attempt.start, i)
    logs[date] = fullDay(date)
  }
  return { ...attempt, logs }
}

function withLog(attempt: Attempt, date: DateKey, change: Partial<DayLog>): Attempt {
  return { ...attempt, logs: { ...attempt.logs, [date]: { ...logFor(attempt, date), ...change } } }
}

const restInstead: Partial<DayLog> = { sets: 0, split: null, rest: true }
const ids = (attempt: Attempt, day: number) => dayTasks(attempt, day).map((task) => task.id)

describe('the count', () => {
  it('runs Day 1 on October 1st to Day 92 on December 31st', () => {
    const attempt = newAttempt(START)
    expect(finishDate(attempt)).toBe('2026-12-31')
    expect(getStatus(attempt, START)).toEqual({ kind: 'active', day: 1 })
    expect(getStatus(doneThrough(91), '2026-12-31')).toEqual({ kind: 'active', day: 92 })
  })

  it('has nothing to say before there is a run', () => {
    expect(getStatus(null, START)).toEqual({ kind: 'none' })
  })

  it('counts down to a run that starts later', () => {
    expect(getStatus(newAttempt('2026-10-03'), START)).toEqual({ kind: 'upcoming', startsIn: 2 })
  })
})

describe('what a day asks for', () => {
  const attempt = newAttempt(START)

  it('is a lift and Maker School on a weekday', () => {
    expect(ids(attempt, 1)).toEqual(['lift', 'makerSchool'])
  })

  it('adds the half marathon on a Saturday', () => {
    expect(ids(attempt, 3)).toEqual(['lift', 'halfMarathon', 'makerSchool'])
  })

  it("adds the week's hundred hyperextensions on its last day", () => {
    expect(ids(attempt, 7)).toEqual(['lift', 'hyperextensions', 'makerSchool'])
    expect(ids(attempt, 14)).toEqual(['lift', 'hyperextensions', 'makerSchool'])
  })

  it('asks no hyperextensions of Day 92, a week of one day', () => {
    expect(ids(attempt, 92)).toEqual(['lift', 'makerSchool'])
    expect(hyperextensionsDue(attempt, 14)).toBe(false)
  })

  it('asks all four of a Saturday that ends a week', () => {
    // A run begun on a Sunday ends its weeks on Saturdays.
    expect(ids(newAttempt('2026-10-04'), 7)).toEqual(['lift', 'halfMarathon', 'hyperextensions', 'makerSchool'])
  })
})

describe('lifting', () => {
  it('takes fifteen sets with upper or lower picked', () => {
    const fifteen = withLog(newAttempt(START), START, { sets: 15, makerSchool: true })
    expect(isDayDone(fifteen, 1)).toBe(false)
    expect(isDayDone(withLog(fifteen, START, { split: 'upper' }), 1)).toBe(true)
    expect(isDayDone(withLog(fifteen, START, { sets: 14, split: 'upper' }), 1)).toBe(false)
  })

  it('takes one rest day a week in place of a lift', () => {
    const attempt = withLog(doneThrough(3), '2026-10-03', restInstead)
    expect(isDayDone(attempt, 3)).toBe(true)
    expect(restDay(attempt, 1)).toBe(3)
  })

  it('does not count a second rest day in the same week', () => {
    const attempt = withLog(withLog(doneThrough(5), '2026-10-02', restInstead), '2026-10-04', restInstead)
    expect(isDayDone(attempt, 2)).toBe(true)
    expect(isDayDone(attempt, 4)).toBe(false)
    expect(getStatus(attempt, '2026-10-06')).toEqual({ kind: 'missed', day: 6, missed: 4 })
  })

  it('gives every week its own rest day', () => {
    const attempt = withLog(withLog(doneThrough(10), '2026-10-03', restInstead), '2026-10-10', restInstead)
    expect(isDayDone(attempt, 3)).toBe(true)
    expect(isDayDone(attempt, 10)).toBe(true)
  })

  it('makes six lifts a week', () => {
    expect(weekLifts(withLog(doneThrough(7), '2026-10-03', restInstead), 1)).toBe(6)
  })
})

describe('hyperextensions', () => {
  it("add up across the week and fall due on the week's last day", () => {
    const attempt = doneThrough(7)
    expect(weekHyperextensions(attempt, 1)).toBe(105)
    expect(isDayDone(attempt, 7)).toBe(true)
    const short = withLog(attempt, '2026-10-07', { hyperextensions: 9 })
    expect(weekHyperextensions(short, 1)).toBe(99)
    expect(isDayDone(short, 6)).toBe(true)
    expect(isDayDone(short, 7)).toBe(false)
  })

  it('can all come on one day', () => {
    let attempt = doneThrough(7)
    for (let i = 0; i < 7; i++) attempt = withLog(attempt, addDays(START, i), { hyperextensions: 0 })
    expect(isDayDone(attempt, 7)).toBe(false)
    expect(isDayDone(withLog(attempt, '2026-10-02', { hyperextensions: 100 }), 7)).toBe(true)
  })

  it('are not owed in a week begun before the app was counting', () => {
    const attempt = attemptOnDay('2026-10-12', 12)
    expect(hyperextensionsDue(attempt, 2)).toBe(false)
    expect(ids(attempt, 14)).toEqual(['lift', 'makerSchool'])
    expect(hyperextensionsDue(attempt, 3)).toBe(true)
  })
})

describe('missing a day', () => {
  it('ends the run on the first day not done', () => {
    expect(getStatus(doneThrough(3), '2026-10-06')).toEqual({ kind: 'missed', day: 6, missed: 4 })
  })

  it('counts a Saturday with no half marathon as missed', () => {
    const attempt = withLog(doneThrough(3), '2026-10-03', { halfMarathon: false })
    expect(getStatus(attempt, '2026-10-04')).toEqual({ kind: 'missed', day: 4, missed: 3 })
  })

  it('ends the run on the last day of a week short of a hundred', () => {
    const attempt = withLog(doneThrough(8), '2026-10-07', { hyperextensions: 0 })
    expect(getStatus(attempt, '2026-10-09')).toEqual({ kind: 'missed', day: 9, missed: 7 })
    expect(dayTasks(attempt, 7).filter((task) => !task.done)).toEqual([{ id: 'hyperextensions', done: false }])
  })

  it('lets a forgotten tick be logged afterwards', () => {
    const state: AppState = { attempt: doneThrough(3), history: [] }
    const logged = updateLog(state, '2026-10-04', () => fullDay('2026-10-04'))
    expect(getStatus(logged.attempt, '2026-10-05')).toEqual({ kind: 'active', day: 5 })
  })

  it('does not end the run while today is still open', () => {
    expect(getStatus(doneThrough(4), '2026-10-05')).toEqual({ kind: 'active', day: 5 })
    // The week's hundred is due by the end of Day 7, not before.
    let light = doneThrough(6)
    for (let i = 0; i < 6; i++) light = withLog(light, addDays(START, i), { hyperextensions: 0 })
    expect(getStatus(light, '2026-10-07')).toEqual({ kind: 'active', day: 7 })
  })
})

describe('finishing', () => {
  it('finishes when Day 92 is done', () => {
    expect(getStatus(doneThrough(92), '2026-12-31')).toEqual({ kind: 'finished' })
  })
  it('stays finished afterwards', () => {
    expect(getStatus(doneThrough(92), '2027-02-01')).toEqual({ kind: 'finished' })
  })
  it('misses Day 92 if it is left undone', () => {
    expect(getStatus(doneThrough(91), '2027-01-01')).toEqual({ kind: 'missed', day: 93, missed: 92 })
  })
})

describe('a run begun before the app', () => {
  it('starts at the day given, with the days before it counted', () => {
    const attempt = attemptOnDay('2026-10-12', 12)
    expect(attempt.start).toBe(START)
    expect(attempt.carried).toBe(11)
    expect(getStatus(attempt, '2026-10-12')).toEqual({ kind: 'active', day: 12 })
    expect(streak(attempt, 12)).toBe(11)
    expect(dayState(attempt, 5, '2026-10-12')).toBe('carried')
  })
  it('keeps the day in range', () => {
    expect(attemptOnDay(START, 0).carried).toBe(0)
    expect(attemptOnDay(START, 500).carried).toBe(91)
  })
})

describe('starting over', () => {
  it('remembers how far the run got', () => {
    const state: AppState = { attempt: doneThrough(7), history: [] }
    const next = endAttempt(state, '2026-10-10')
    expect(next.attempt).toBeNull()
    expect(next.history).toEqual([{ start: START, end: '2026-10-07', completed: 7, outcome: 'restarted' }])
  })

  it('records giving up on an open day as ending on the last day done', () => {
    const state: AppState = { attempt: doneThrough(2), history: [] }
    expect(endAttempt(state, '2026-10-03').history[0]).toMatchObject({ end: '2026-10-02', completed: 2 })
  })

  it('records a run that broke on Day 1 as ending on Day 1', () => {
    const state: AppState = { attempt: newAttempt(START), history: [] }
    expect(endAttempt(state, '2026-10-04').history[0]).toMatchObject({ end: START, completed: 0 })
  })

  it('does not record a do-over on Day 1, or a run that never began', () => {
    expect(endAttempt({ attempt: newAttempt(START), history: [] }, START).history).toEqual([])
    expect(summarize(newAttempt('2026-10-05'), START)).toBeNull()
  })

  it('records a finished run as finished', () => {
    expect(summarize(doneThrough(92), '2027-01-05')).toEqual({
      start: START,
      end: '2026-12-31',
      completed: 92,
      outcome: 'finished',
    })
  })

  it('keeps the newest attempt first', () => {
    const first = endAttempt({ attempt: doneThrough(3), history: [] }, '2026-10-05')
    const second = endAttempt({ ...first, attempt: doneThrough(9, newAttempt('2026-10-05')) }, '2026-10-20')
    expect(second.history.map((p) => p.completed)).toEqual([9, 3])
    expect(bestStreak(second, '2026-10-20')).toBe(9)
  })
})

describe('days on the board', () => {
  const attempt = doneThrough(3)
  it('shows done, missed, open and future days', () => {
    const today = '2026-10-06'
    expect(dayState(attempt, 2, today)).toBe('done')
    expect(dayState(attempt, 4, today)).toBe('missed')
    expect(dayState(attempt, 6, today)).toBe('open')
    expect(dayState(attempt, 7, today)).toBe('future')
    expect(dayState(doneThrough(6), 6, today)).toBe('done')
  })

  it('only takes logs for days that have happened in this run', () => {
    const today = '2026-10-06'
    expect(canLog(attempt, '2026-10-01', today)).toBe(true)
    expect(canLog(attempt, today, today)).toBe(true)
    expect(canLog(attempt, '2026-10-07', today)).toBe(false)
    expect(canLog(attempt, '2026-09-30', today)).toBe(false)
    expect(canLog(attemptOnDay(today, 6), '2026-10-02', today)).toBe(false)
    expect(canLog(attempt, '2027-01-01', '2027-01-05')).toBe(false)
  })
})

describe('totals', () => {
  it('adds up the run so far, today included', () => {
    let attempt = doneThrough(2)
    attempt = withLog(attempt, '2026-10-02', { ...restInstead, halfMarathon: true })
    attempt = withLog(attempt, '2026-10-03', { ...emptyLog(), sets: 6, hyperextensions: 45 })
    // Ahead of today, so not counted.
    attempt = withLog(attempt, '2026-10-04', lifted)
    expect(totals(attempt, '2026-10-03')).toEqual({
      daysDone: 2,
      lifts: 1,
      sets: 21,
      hyperextensions: 75,
      makerSchool: 2,
      halfMarathons: 1,
    })
  })

  it('counts carried days as done without inventing their numbers', () => {
    expect(totals(attemptOnDay('2026-10-05', 5), '2026-10-05')).toMatchObject({ daysDone: 4, sets: 0 })
  })
})

describe('updateLog', () => {
  it('changes one day without touching the old state', () => {
    const state: AppState = { attempt: newAttempt(START), history: [] }
    const next = updateLog(state, START, (log) => ({ ...log, sets: log.sets + 1 }))
    expect(next.attempt!.logs[START].sets).toBe(1)
    expect(state.attempt!.logs[START]).toBeUndefined()
  })
  it('does nothing without a run', () => {
    expect(updateLog(EMPTY_STATE, START, () => lifted)).toBe(EMPTY_STATE)
  })
})

describe('normalizeState', () => {
  it('keeps a good state as it is', () => {
    const state: AppState = {
      attempt: doneThrough(2),
      history: [{ start: '2026-09-01', end: '2026-09-04', completed: 3, outcome: 'restarted' }],
    }
    expect(normalizeState(JSON.parse(JSON.stringify(state)))).toEqual(state)
  })

  it('reads a run saved by the first version', () => {
    const saved = {
      version: 1,
      attempt: {
        start: START,
        carried: 0,
        logs: { [START]: { sets: 15, neck: true, halfMarathon: false, hyperextensions: 40, makerSchool: true, vlog: true, note: '' } },
      },
      history: [],
    }
    const state = normalizeState(saved)!
    expect(state.attempt!.logs[START]).toEqual({ ...lifted, split: 'upper', hyperextensions: 40 })
    expect(isDayDone(state.attempt!, 1)).toBe(true)
  })

  it('drops what it cannot read', () => {
    const state = normalizeState({
      attempt: { start: START, carried: -3, logs: { 'not-a-date': lifted, '2026-10-01': { sets: 'many' } } },
      history: [{ start: 'yesterday' }, { start: '2026-09-01', end: '2026-09-02', completed: 400, outcome: '?' }],
    })
    expect(state).toEqual({
      attempt: { start: START, carried: 0, logs: { '2026-10-01': emptyLog() } },
      history: [{ start: '2026-09-01', end: '2026-09-02', completed: 92, outcome: 'restarted' }],
    })
  })

  it('refuses things that are not state', () => {
    expect(normalizeState(null)).toBeNull()
    expect(normalizeState([1, 2])).toBeNull()
    expect(normalizeState({ hello: 'world' })).toBeNull()
    expect(normalizeState({ attempt: { start: 'soon' } })).toEqual(EMPTY_STATE)
  })
})
