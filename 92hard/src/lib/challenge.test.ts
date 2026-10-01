import { describe, expect, it } from 'vitest'
import {
  attemptOnDay,
  bestStreak,
  canLog,
  dayState,
  EMPTY_STATE,
  endAttempt,
  finishDate,
  getStatus,
  newAttempt,
  normalizeState,
  streak,
  summarize,
  totals,
  updateLog,
  type AppState,
  type Attempt,
} from './challenge'
import { addDays } from './dates'
import { emptyLog, type DayLog } from './tasks'

const START = '2026-10-01'
const full: DayLog = { ...emptyLog(), sets: 15, neck: true, hyperextensions: 100, makerSchool: true, vlog: true }

/** An attempt from START with the first `days` days done. */
function doneThrough(days: number, attempt = newAttempt(START)): Attempt {
  const logs = { ...attempt.logs }
  for (let i = 0; i < days; i++) logs[addDays(attempt.start, i)] = full
  return { ...attempt, logs }
}

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

describe('missing a day', () => {
  it('ends the run on the first day not done', () => {
    expect(getStatus(doneThrough(3), '2026-10-06')).toEqual({ kind: 'missed', day: 6, missed: 4 })
  })

  it('treats a day with one task short as missed', () => {
    const attempt = doneThrough(1)
    const shortDay = { ...attempt, logs: { ...attempt.logs, '2026-10-02': { ...full, vlog: false } } }
    expect(getStatus(shortDay, '2026-10-03')).toEqual({ kind: 'missed', day: 3, missed: 2 })
  })

  it('lets a forgotten tick be logged afterwards', () => {
    const state: AppState = { attempt: doneThrough(3), history: [] }
    const logged = updateLog(state, '2026-10-04', () => full)
    expect(getStatus(logged.attempt, '2026-10-05')).toEqual({ kind: 'active', day: 5 })
  })

  it('does not end the run while today is still open', () => {
    expect(getStatus(doneThrough(4), '2026-10-05')).toEqual({ kind: 'active', day: 5 })
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
    const attempt = doneThrough(2)
    const withToday = {
      ...attempt,
      logs: {
        ...attempt.logs,
        '2026-10-02': { ...full, sets: 0, neck: false, halfMarathon: true },
        '2026-10-03': { ...emptyLog(), sets: 6, hyperextensions: 45, note: 'half way' },
        // Ahead of today, so not counted.
        '2026-10-04': full,
      },
    }
    expect(totals(withToday, '2026-10-03')).toEqual({
      daysDone: 2,
      sets: 21,
      neck: 1,
      halfMarathons: 1,
      hyperextensions: 245,
      makerSchool: 2,
      vlogs: 2,
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
    expect(updateLog(EMPTY_STATE, START, () => full)).toBe(EMPTY_STATE)
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

  it('drops what it cannot read', () => {
    const state = normalizeState({
      attempt: { start: START, carried: -3, logs: { 'not-a-date': full, '2026-10-01': { sets: 'many' } } },
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
