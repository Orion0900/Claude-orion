/**
 * The 92 Hard rules, as written on the whiteboard plus the vlog, and what
 * counts as doing each one on the day it's logged. Two of them are weekly —
 * one day off lifting, 100 hyperextensions — so the parts that need the rest
 * of the week live in challenge.ts.
 */
import type { DateKey } from './dates'

export const SETS_TARGET = 15
export const LIFTS_PER_WEEK = 6
export const HYPEREXTENSIONS_PER_WEEK = 100
export const HALF_MARATHON_MILES = 13.1

/** The vlog joined the rules on October 2nd, 2026. Days before it don't owe one. */
export const VLOG_FROM: DateKey = '2026-10-02'

/** The rules, word for word. */
export const RULES: readonly string[] = [
  'Lift 6× a week, 15 sets a day',
  'Half Marathon Saturdays',
  'Neck on Uppers',
  '100× Hyperextensions a week',
  'Maker School 1× a day',
  'Vlog 1× a day',
]

export const FAIL_RULE = 'Fail = Start Over'

export interface DayLog {
  /** Ticked once the day's 15 sets are in, neck included on an upper day. */
  lifted: boolean
  /** The one day a week off lifting: six lifts in seven days. */
  rest: boolean
  /** Owed on Saturdays. */
  halfMarathon: boolean
  /** Counted toward the week's hundred. */
  hyperextensions: number
  makerSchool: boolean
  vlog: boolean
  /** From the first version of the app, which had a notes box. Kept so nothing is lost. */
  note: string
}

export type TaskId = 'lift' | 'halfMarathon' | 'hyperextensions' | 'makerSchool' | 'vlog'

export function emptyLog(): DayLog {
  return { lifted: false, rest: false, halfMarathon: false, hyperextensions: 0, makerSchool: false, vlog: false, note: '' }
}

/** Nothing logged at all: a day still to be filled in, rather than one with something missing. */
export function isBlank(log: DayLog): boolean {
  return !log.lifted && !log.rest && !log.halfMarathon && log.hyperextensions === 0 && !log.makerSchool && !log.vlog
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
    // Earlier versions counted sets one at a time; fifteen of them was the lift.
    lifted: typeof r.lifted === 'boolean' ? r.lifted : cleanCount(r.sets, 999) >= SETS_TARGET,
    rest: r.rest === true,
    halfMarathon: r.halfMarathon === true,
    hyperextensions: cleanCount(r.hyperextensions),
    makerSchool: r.makerSchool === true,
    vlog: r.vlog === true,
    note: typeof r.note === 'string' ? r.note.slice(0, 5000) : log.note,
  }
}
