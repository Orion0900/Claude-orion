/**
 * Noticing that the runner has stopped — and started again.
 *
 * Auto-pause in running apps watches for the moment you stop at a crossing and
 * stops the clock for you. Speed alone can't tell: a stationary phone's GPS
 * wanders a few metres either way, which reads as a slow jog. What does tell is
 * staying inside a small circle for several seconds, and leaving it.
 */
import { haversine, type LatLng } from './geo'

/** Everything in the last this-many milliseconds stayed within the circle… */
export const STOP_WINDOW_MS = 8_000
/** …of this radius, so the runner has stopped. */
export const STOP_RADIUS_METERS = 9
/** Leaving the spot they stopped at by this much means they're off again… */
export const RESUME_METERS = 14
/** …on this many fixes in a row, so one jumpy fix at a crossing doesn't count. */
export const RESUME_FIXES = 2

export type Motion = 'moving' | 'stopped'

interface Sample {
  position: LatLng
  time: number
}

export interface MotionDetector {
  /** Feed an accepted fix; returns the state after it. */
  update(position: LatLng, time: number): Motion
  reset(): void
}

export function createMotionDetector(): MotionDetector {
  let state: Motion = 'moving'
  let samples: Sample[] = []
  let stoppedAt: LatLng | null = null
  let away = 0

  return {
    update(position, time) {
      if (state === 'stopped') {
        away = stoppedAt && haversine(stoppedAt, position) > RESUME_METERS ? away + 1 : 0
        if (away >= RESUME_FIXES) {
          state = 'moving'
          stoppedAt = null
          away = 0
          samples = [{ position, time }]
        }
        return state
      }

      samples.push({ position, time })
      // Keep just enough history to cover the window.
      while (samples.length > 1 && time - samples[1].time >= STOP_WINDOW_MS) samples.shift()
      const spansWindow = time - samples[0].time >= STOP_WINDOW_MS
      if (spansWindow && samples.every((sample) => haversine(sample.position, position) <= STOP_RADIUS_METERS)) {
        state = 'stopped'
        stoppedAt = position
        samples = []
      }
      return state
    },
    reset() {
      state = 'moving'
      samples = []
      stoppedAt = null
      away = 0
    },
  }
}
