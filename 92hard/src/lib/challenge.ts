/**
 * A run at 92 Hard: which day it is, what each day asks for, whether one was
 * missed, and starting over. Fail = Start Over is the whole point, so it
 * lives here, in one place, under test.
 *
 * Weeks are counted from Day 1, so every week has seven days and exactly one
 * Saturday whichever day the run began. Days 1–7 are Week 1; Day 92 is a week
 * of one day on its own.
 *
 *   - Every day: Maker School, and a lift — or the week's one rest day.
 *   - Saturdays: a half marathon too.
 *   - The last day of each week: the week's 100 hyperextensions, added up.
 *
 * Six lifts a week falls out of the second line: seven days, one of them off.
 */
import { addDays, daysBetween, isDateKey, SATURDAY, weekday, type DateKey } from './dates'
import {
  HYPEREXTENSIONS_PER_WEEK,
  cleanCount,
  emptyLog,
  liftDone,
  normalizeLog,
  type DayLog,
  type TaskId,
} from './tasks'

export const CHALLENGE_DAYS = 92
export const WEEK = 7

export interface Attempt {
  /** Day 1. */
  start: DateKey
  /** Days at the start counted done without a log: a run begun before the app kept count. */
  carried: number
  logs: Record<DateKey, DayLog>
}

export interface PastAttempt {
  start: DateKey
  /** The last day done in a row: Day 92 for a finished run, Day 1 for one that never got going. */
  end: DateKey
  /** Days done in a row from Day 1. */
  completed: number
  outcome: 'restarted' | 'finished'
}

export interface AppState {
  attempt: Attempt | null
  /** Earlier attempts, most recent first. */
  history: PastAttempt[]
}

export const EMPTY_STATE: AppState = { attempt: null, history: [] }

export type Status =
  | { kind: 'none' }
  | { kind: 'upcoming'; startsIn: number }
  | { kind: 'active'; day: number }
  | { kind: 'missed'; day: number; missed: number }
  | { kind: 'finished' }

/** How a single day of the run looks from today. */
export type DayState = 'done' | 'carried' | 'open' | 'missed' | 'future'

export interface TaskState {
  id: TaskId
  done: boolean
}

export function dayNumber(attempt: Attempt, date: DateKey): number {
  return daysBetween(attempt.start, date) + 1
}

export function dateOfDay(attempt: Attempt, day: number): DateKey {
  return addDays(attempt.start, day - 1)
}

export function finishDate(attempt: Attempt): DateKey {
  return dateOfDay(attempt, CHALLENGE_DAYS)
}

export function logFor(attempt: Attempt, date: DateKey): DayLog {
  return attempt.logs[date] ?? emptyLog()
}

/** The week a day falls in: Days 1–7 are Week 1. */
export function weekOf(day: number): number {
  return Math.ceil(day / WEEK)
}

/** A week's first and last day, the last never past Day 92. */
export function weekSpan(week: number): [number, number] {
  return [(week - 1) * WEEK + 1, Math.min(week * WEEK, CHALLENGE_DAYS)]
}

/** Logged days of a week: the ones in the run and not carried. */
function loggedDays(attempt: Attempt, week: number): number[] {
  const [first, last] = weekSpan(week)
  const days: number[] = []
  for (let d = Math.max(first, attempt.carried + 1); d <= last; d++) days.push(d)
  return days
}

/** A week owes its hundred when all seven days are in the run and every one was logged here. */
export function hyperextensionsDue(attempt: Attempt, week: number): boolean {
  const [first, last] = weekSpan(week)
  return last - first + 1 === WEEK && first > attempt.carried
}

export function weekHyperextensions(attempt: Attempt, week: number): number {
  return loggedDays(attempt, week).reduce((n, d) => n + (attempt.logs[dateOfDay(attempt, d)]?.hyperextensions ?? 0), 0)
}

/** The week's rest day: the first day in it taken as one. A second one doesn't count. */
export function restDay(attempt: Attempt, week: number): number | null {
  return loggedDays(attempt, week).find((d) => attempt.logs[dateOfDay(attempt, d)]?.rest) ?? null
}

export function weekLifts(attempt: Attempt, week: number): number {
  return loggedDays(attempt, week).filter((d) => liftDone(logFor(attempt, dateOfDay(attempt, d)))).length
}

/** What a day of the run asks for, in the whiteboard's order, and which of it is done. */
export function dayTasks(attempt: Attempt, day: number): TaskState[] {
  const date = dateOfDay(attempt, day)
  const log = logFor(attempt, date)
  const week = weekOf(day)
  const tasks: TaskState[] = [{ id: 'lift', done: liftDone(log) || (log.rest && restDay(attempt, week) === day) }]
  if (weekday(date) === SATURDAY) tasks.push({ id: 'halfMarathon', done: log.halfMarathon })
  if (day === weekSpan(week)[1] && hyperextensionsDue(attempt, week)) {
    tasks.push({ id: 'hyperextensions', done: weekHyperextensions(attempt, week) >= HYPEREXTENSIONS_PER_WEEK })
  }
  tasks.push({ id: 'makerSchool', done: log.makerSchool })
  return tasks
}

export function isDayDone(attempt: Attempt, day: number): boolean {
  if (day < 1 || day > CHALLENGE_DAYS) return false
  return day <= attempt.carried || dayTasks(attempt, day).every((task) => task.done)
}

export function getStatus(attempt: Attempt | null, today: DateKey): Status {
  if (!attempt) return { kind: 'none' }
  const day = dayNumber(attempt, today)
  if (day < 1) return { kind: 'upcoming', startsIn: 1 - day }
  // Every day before today has to be done. The first one that isn't ends the run.
  for (let d = 1; d <= Math.min(day - 1, CHALLENGE_DAYS); d++) {
    if (!isDayDone(attempt, d)) return { kind: 'missed', day, missed: d }
  }
  if (day > CHALLENGE_DAYS || isDayDone(attempt, CHALLENGE_DAYS)) return { kind: 'finished' }
  return { kind: 'active', day }
}

export function dayState(attempt: Attempt, day: number, today: DateKey): DayState {
  const current = dayNumber(attempt, today)
  if (day > current) return 'future'
  if (day <= attempt.carried) return 'carried'
  if (isDayDone(attempt, day)) return 'done'
  return day === current ? 'open' : 'missed'
}

/** Days done in a row from Day 1, looking no further than day `through`. */
export function streak(attempt: Attempt, through: number): number {
  const last = Math.min(through, CHALLENGE_DAYS)
  let n = 0
  while (n < last && isDayDone(attempt, n + 1)) n++
  return n
}

/** Whether a day can still be ticked off: in this run, not in the future, not carried. */
export function canLog(attempt: Attempt, date: DateKey, today: DateKey): boolean {
  const day = dayNumber(attempt, date)
  return day >= 1 && day <= CHALLENGE_DAYS && day > attempt.carried && daysBetween(date, today) >= 0
}

export function newAttempt(start: DateKey, carried = 0): Attempt {
  return { start, carried: Math.min(CHALLENGE_DAYS - 1, cleanCount(carried)), logs: {} }
}

/** A run already under way: today is Day `day`, and the days before it count as done. */
export function attemptOnDay(today: DateKey, day: number): Attempt {
  const d = Math.min(CHALLENGE_DAYS, Math.max(1, Math.floor(day)))
  return newAttempt(addDays(today, -(d - 1)), d - 1)
}

/** The current attempt as history will remember it, or null if it never really began. */
export function summarize(attempt: Attempt, today: DateKey): PastAttempt | null {
  const status = getStatus(attempt, today)
  if (status.kind === 'none' || status.kind === 'upcoming') return null
  if (status.kind === 'finished') {
    return { start: attempt.start, end: finishDate(attempt), completed: CHALLENGE_DAYS, outcome: 'finished' }
  }
  const completed = streak(attempt, status.day)
  // Starting over on the day you began, with nothing done, is a do-over, not an attempt.
  if (completed === 0 && status.day <= 1) return null
  return { start: attempt.start, end: dateOfDay(attempt, Math.max(1, completed)), completed, outcome: 'restarted' }
}

/** Closes the current attempt into history. The next one begins from the start screen. */
export function endAttempt(state: AppState, today: DateKey): AppState {
  const past = state.attempt ? summarize(state.attempt, today) : null
  return { attempt: null, history: past ? [past, ...state.history] : state.history }
}

export function updateLog(state: AppState, date: DateKey, change: (log: DayLog) => DayLog): AppState {
  const attempt = state.attempt
  if (!attempt) return state
  return { ...state, attempt: { ...attempt, logs: { ...attempt.logs, [date]: change(logFor(attempt, date)) } } }
}

export interface Totals {
  daysDone: number
  lifts: number
  sets: number
  hyperextensions: number
  makerSchool: number
  halfMarathons: number
}

/** Everything done so far in this run, today included. */
export function totals(attempt: Attempt, today: DateKey): Totals {
  const t: Totals = { daysDone: 0, lifts: 0, sets: 0, hyperextensions: 0, makerSchool: 0, halfMarathons: 0 }
  const last = Math.min(dayNumber(attempt, today), CHALLENGE_DAYS)
  for (let day = 1; day <= last; day++) {
    if (isDayDone(attempt, day)) t.daysDone++
    const log = attempt.logs[dateOfDay(attempt, day)]
    if (!log || day <= attempt.carried) continue
    if (liftDone(log)) t.lifts++
    t.sets += log.sets
    t.hyperextensions += log.hyperextensions
    if (log.makerSchool) t.makerSchool++
    if (log.halfMarathon) t.halfMarathons++
  }
  return t
}

/** The longest run of days in a row, across every attempt. */
export function bestStreak(state: AppState, today: DateKey): number {
  const current = state.attempt ? streak(state.attempt, Math.max(0, dayNumber(state.attempt, today))) : 0
  return state.history.reduce((best, past) => Math.max(best, past.completed), current)
}

function normalizeAttempt(raw: unknown): Attempt | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isDateKey(r.start)) return null
  const logs: Record<DateKey, DayLog> = {}
  if (r.logs && typeof r.logs === 'object') {
    for (const [key, value] of Object.entries(r.logs as Record<string, unknown>)) {
      if (isDateKey(key)) logs[key] = normalizeLog(value)
    }
  }
  return { ...newAttempt(r.start, typeof r.carried === 'number' ? r.carried : 0), logs }
}

function normalizePast(raw: unknown): PastAttempt | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!isDateKey(r.start) || !isDateKey(r.end)) return null
  return {
    start: r.start,
    end: r.end,
    completed: Math.min(CHALLENGE_DAYS, cleanCount(r.completed)),
    outcome: r.outcome === 'finished' ? 'finished' : 'restarted',
  }
}

/** Reads saved state, dropping anything malformed rather than failing. Null if it isn't state at all. */
export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!('attempt' in r) && !('history' in r)) return null
  const history = Array.isArray(r.history)
    ? r.history.map(normalizePast).filter((p): p is PastAttempt => p !== null)
    : []
  return { attempt: normalizeAttempt(r.attempt), history }
}
