/**
 * Every run, kept.
 *
 * All the popular running apps keep a log, and most of what makes them fun is
 * built on it: this week's miles, a streak to keep alive, a longest run to beat.
 * Records are small — numbers, not routes — so years of them fit comfortably.
 */
import { browserStorage, type PreferenceStorage } from './preferences'

export interface RunRecord {
  /** Stable per run, so recording the same run twice replaces rather than duplicates. */
  id: string
  /** ISO timestamp of when the run ended. */
  finishedAt: string
  /** Meters covered. */
  distance: number
  /** Seconds spent running, pauses excluded. */
  movingSeconds: number
  /** Meters climbed. */
  gain: number
  /** Whether the whole route was run. */
  completed: boolean
}

/** Shorter than this is a false start, not a run. */
export const MIN_DISTANCE_TO_RECORD = 400
/** Plenty; the oldest go first. */
export const MAX_HISTORY = 1000

const KEY = 'loopmaker.runHistory.v1'

export interface HistoryStore {
  read(): RunRecord[]
  /** Adds or replaces by id, newest first; returns the new list. */
  save(record: RunRecord): RunRecord[]
}

function isRecord(value: unknown): value is RunRecord {
  const r = value as RunRecord
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof r.id === 'string' &&
    typeof r.finishedAt === 'string' &&
    !Number.isNaN(Date.parse(r.finishedAt)) &&
    Number.isFinite(r.distance) &&
    Number.isFinite(r.movingSeconds)
  )
}

export function createHistoryStore(storage: PreferenceStorage | null = browserStorage()): HistoryStore {
  const read = (): RunRecord[] => {
    try {
      const raw = storage?.getItem(KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(isRecord) : []
    } catch {
      return []
    }
  }
  return {
    read,
    save(record) {
      const next = [record, ...read().filter((r) => r.id !== record.id)]
        .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
        .slice(0, MAX_HISTORY)
      try {
        storage?.setItem(KEY, JSON.stringify(next))
      } catch {
        // Out of room: the run still shows now, it just won't be remembered.
      }
      return next
    },
  }
}

/** Monday 00:00 local time of the week containing `date`. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const daysSinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

export interface Totals {
  runs: number
  distance: number
  movingSeconds: number
}

const sum = (records: RunRecord[]): Totals => ({
  runs: records.length,
  distance: records.reduce((total, r) => total + r.distance, 0),
  movingSeconds: records.reduce((total, r) => total + r.movingSeconds, 0),
})

export function weekTotals(records: RunRecord[], now: Date): Totals {
  const from = weekStart(now).getTime()
  return sum(records.filter((r) => Date.parse(r.finishedAt) >= from))
}

export function lifetimeTotals(records: RunRecord[]): Totals {
  return sum(records)
}

/**
 * Weeks in a row with at least one run — Nike Run Club's measure, kinder than
 * a daily streak. A week with no run yet doesn't break it until it's over.
 */
export function weekStreak(records: RunRecord[], now: Date): number {
  const weeks = new Set(records.map((r) => weekStart(new Date(r.finishedAt)).getTime()))
  const cursor = weekStart(now)
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7)
  let streak = 0
  while (weeks.has(cursor.getTime())) {
    streak++
    cursor.setDate(cursor.getDate() - 7)
  }
  return streak
}
