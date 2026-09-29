/**
 * The run's stopwatch, with pauses.
 *
 * Every running app stops the clock at red lights — by hand, or by noticing
 * you've stopped — so the time and pace at the end are for running, not for
 * waiting. Kept as plain data so it can be saved with the run and survive a
 * reload mid-pause.
 */
export interface RunClock {
  /** Wall-clock moment the run began, milliseconds. */
  startedAt: number
  /** Total paused time already banked, milliseconds. */
  pausedMs: number
  /** When the current pause began, or null while running. */
  pausedAt: number | null
}

export function startClock(now: number): RunClock {
  return { startedAt: now, pausedMs: 0, pausedAt: null }
}

export function isPaused(clock: RunClock): boolean {
  return clock.pausedAt !== null
}

export function pauseClock(clock: RunClock, now: number): RunClock {
  return clock.pausedAt !== null ? clock : { ...clock, pausedAt: now }
}

export function resumeClock(clock: RunClock, now: number): RunClock {
  if (clock.pausedAt === null) return clock
  return { ...clock, pausedMs: clock.pausedMs + Math.max(0, now - clock.pausedAt), pausedAt: null }
}

/** Seconds actually spent running. */
export function movingSeconds(clock: RunClock, now: number): number {
  const current = clock.pausedAt !== null ? Math.max(0, now - clock.pausedAt) : 0
  return Math.max(0, (now - clock.startedAt - clock.pausedMs - current) / 1000)
}

/** Seconds since the start, pauses included. */
export function elapsedSeconds(clock: RunClock, now: number): number {
  return Math.max(0, (now - clock.startedAt) / 1000)
}

/** Anything saved by an older version, or damaged, becomes a sensible clock. */
export function normaliseClock(value: Partial<RunClock> | undefined, fallbackStart: number): RunClock {
  const startedAt = typeof value?.startedAt === 'number' && Number.isFinite(value.startedAt) ? value.startedAt : fallbackStart
  const pausedMs = typeof value?.pausedMs === 'number' && value.pausedMs >= 0 ? value.pausedMs : 0
  const pausedAt = typeof value?.pausedAt === 'number' && Number.isFinite(value.pausedAt) ? value.pausedAt : null
  return { startedAt, pausedMs, pausedAt }
}
