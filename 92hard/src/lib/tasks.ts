/**
 * The 92 Hard rules, as written on the whiteboard, and what counts as doing
 * each one on the day it's logged. Two of them are weekly — one day off
 * lifting, 100 hyperextensions — so the parts that need the rest of the week
 * live in challenge.ts.
 */

export const SETS_TARGET = 15
export const LIFTS_PER_WEEK = 6
export const HYPEREXTENSIONS_PER_WEEK = 100
export const HALF_MARATHON_MILES = 13.1

/** The rules, word for word. */
export const RULES: readonly string[] = [
  'Lift 6× a week, 15 sets a day',
  'Half Marathon Saturdays',
  'Neck on Uppers',
  '100× Hyperextensions a week',
  'Maker School 1× a day',
]

export const FAIL_RULE = 'Fail = Start Over'

/** Neck goes with upper days, so "upper" is only ever picked with neck done. */
export type Split = 'upper' | 'lower'

export interface DayLog {
  /** Working sets. Fifteen of them, upper (with neck) or lower, make a lift. */
  sets: number
  split: Split | null
  /** The one day a week off lifting: six lifts in seven days. */
  rest: boolean
  /** Owed on Saturdays. */
  halfMarathon: boolean
  /** Counted toward the week's hundred. */
  hyperextensions: number
  makerSchool: boolean
  /** From the first version of the app, which had a notes box. Kept so nothing is lost. */
  note: string
}

export type TaskId = 'lift' | 'halfMarathon' | 'hyperextensions' | 'makerSchool'

export function emptyLog(): DayLog {
  return { sets: 0, split: null, rest: false, halfMarathon: false, hyperextensions: 0, makerSchool: false, note: '' }
}

/** Nothing logged at all: a day still to be filled in, rather than one with something missing. */
export function isBlank(log: DayLog): boolean {
  return (
    log.sets === 0 && log.split === null && !log.rest && !log.halfMarathon && log.hyperextensions === 0 && !log.makerSchool
  )
}

/** Fifteen sets, and upper or lower picked. */
export function liftDone(log: DayLog): boolean {
  return log.sets >= SETS_TARGET && log.split !== null
}

/** A count as stored: a whole number, never negative, never absurd. */
export function cleanCount(value: unknown, max = 10_000): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0
  return Math.min(max, Math.max(0, n))
}

/** Reads a stored log, keeping whatever is valid and defaulting the rest. */
export function normalizeLog(raw: unknown): DayLog {
  const log = emptyLog()
  if (!raw || typeof raw !== 'object') return log
  const r = raw as Record<string, unknown>
  return {
    sets: cleanCount(r.sets, 999),
    // The first version asked for neck every gym day, so a day with it ticked had neck done.
    split: r.split === 'upper' || r.split === 'lower' ? r.split : r.neck === true ? 'upper' : null,
    rest: r.rest === true,
    halfMarathon: r.halfMarathon === true,
    hyperextensions: cleanCount(r.hyperextensions),
    makerSchool: r.makerSchool === true,
    note: typeof r.note === 'string' ? r.note.slice(0, 5000) : log.note,
  }
}
