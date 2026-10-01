/**
 * The four things 92 Hard asks for every day, and exactly what counts as
 * doing each one. Everything else in the app asks this file.
 */

export const SETS_TARGET = 15
export const HYPEREXTENSIONS_TARGET = 100
export const HALF_MARATHON_KM = 21.1

export interface DayLog {
  /** Working sets in the gym. Fifteen of them plus neck does the first task. */
  sets: number
  neck: boolean
  /** A half marathon does the first task on its own, in place of the gym. */
  halfMarathon: boolean
  hyperextensions: number
  makerSchool: boolean
  vlog: boolean
  note: string
}

export type TaskId = 'training' | 'hyperextensions' | 'makerSchool' | 'vlog'

export interface Task {
  id: TaskId
  /** The rule as written, shown wherever the rules are. */
  rule: string
}

export const TASKS: readonly Task[] = [
  { id: 'training', rule: 'Gym 15 sets + neck / half marathon' },
  { id: 'hyperextensions', rule: '100× Hyperextensions' },
  { id: 'makerSchool', rule: 'Maker School 1×' },
  { id: 'vlog', rule: 'Vlog 1×' },
]

export function emptyLog(): DayLog {
  return { sets: 0, neck: false, halfMarathon: false, hyperextensions: 0, makerSchool: false, vlog: false, note: '' }
}

export function gymDone(log: DayLog): boolean {
  return log.sets >= SETS_TARGET && log.neck
}

export function isTaskDone(log: DayLog, task: TaskId): boolean {
  switch (task) {
    case 'training':
      return gymDone(log) || log.halfMarathon
    case 'hyperextensions':
      return log.hyperextensions >= HYPEREXTENSIONS_TARGET
    case 'makerSchool':
      return log.makerSchool
    case 'vlog':
      return log.vlog
  }
}

export function tasksDone(log: DayLog | undefined): number {
  return log ? TASKS.filter((task) => isTaskDone(log, task.id)).length : 0
}

export function isDayComplete(log: DayLog | undefined): boolean {
  return tasksDone(log) === TASKS.length
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
    neck: r.neck === true,
    halfMarathon: r.halfMarathon === true,
    hyperextensions: cleanCount(r.hyperextensions),
    makerSchool: r.makerSchool === true,
    vlog: r.vlog === true,
    note: typeof r.note === 'string' ? r.note.slice(0, 5000) : log.note,
  }
}
