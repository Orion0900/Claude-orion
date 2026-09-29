/**
 * The voice between the turns.
 *
 * Runkeeper and Nike Run Club talk to you every mile — how far, how long, how
 * fast — and at the moments that matter: halfway, and the last stretch. It is
 * most of what makes a run with an app feel like company rather than a
 * stopwatch. These are those lines, worked out from progress and the clock.
 */
import { METERS_PER_MILE, type DistanceUnit } from './units'

/** Runs shorter than this don't get halfway or last-stretch calls. */
export const MIN_COACHED_DISTANCE = 2000
/** Nothing is said about splits this close to the finish; the finish says it all. */
const QUIET_BEFORE_FINISH = 150

export interface CoachState {
  /** Whole units (miles or km) already announced. */
  splits: number
  /** Moving seconds at the last announced split, for that split's own pace. */
  splitAtSeconds: number
  halfway: boolean
  finalStretch: boolean
}

export const INITIAL_COACH: CoachState = { splits: 0, splitAtSeconds: 0, halfway: false, finalStretch: false }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "18 minutes 24 seconds", "1 hour 2 minutes", said the way a coach would. */
export function spokenDuration(totalSeconds: number): string {
  const total = Math.max(0, Math.round(totalSeconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return minutes > 0 ? `${plural(hours, 'hour')} ${plural(minutes, 'minute')}` : plural(hours, 'hour')
  if (minutes === 0) return plural(seconds, 'second')
  return seconds > 0 ? `${plural(minutes, 'minute')} ${plural(seconds, 'second')}` : plural(minutes, 'minute')
}

/** "9 minutes 12 seconds per mile". */
export function spokenPace(secondsPerUnit: number, unit: DistanceUnit): string {
  return `${spokenDuration(secondsPerUnit)} per ${unit === 'mi' ? 'mile' : 'kilometre'}`
}

const unitLength = (unit: DistanceUnit) => (unit === 'mi' ? METERS_PER_MILE : 1000)
const unitName = (unit: DistanceUnit) => (unit === 'mi' ? 'Mile' : 'Kilometre')

export interface CoachInput {
  distanceAlong: number
  total: number
  movingSeconds: number
  unit: DistanceUnit
  state: CoachState
}

export function coachCues({ distanceAlong, total, movingSeconds, unit, state }: CoachInput): {
  cues: string[]
  state: CoachState
} {
  const cues: string[] = []
  let next = state
  const remaining = total - distanceAlong
  const length = unitLength(unit)

  const completed = Math.floor(distanceAlong / length)
  if (completed > state.splits) {
    // A GPS gap can carry the runner past more than one marker; only the
    // latest is worth saying. And the finish announces itself.
    if (remaining > QUIET_BEFORE_FINISH && movingSeconds > 0) {
      const average = movingSeconds / (distanceAlong / length)
      const parts = [`${unitName(unit)} ${completed}.`, `Time, ${spokenDuration(movingSeconds)}.`]
      if (completed === state.splits + 1 && state.splits > 0) {
        parts.push(`That ${unit === 'mi' ? 'mile' : 'kilometre'}, ${spokenDuration(movingSeconds - state.splitAtSeconds)}.`)
      }
      parts.push(`Average pace, ${spokenPace(average, unit)}.`)
      cues.push(parts.join(' '))
    }
    next = { ...next, splits: completed, splitAtSeconds: movingSeconds }
  }

  if (total >= MIN_COACHED_DISTANCE) {
    if (!state.halfway && distanceAlong >= total / 2) {
      next = { ...next, halfway: true }
      if (remaining > QUIET_BEFORE_FINISH) cues.push('Halfway there. Keep it steady.')
    }
    const stretch = unit === 'mi' ? METERS_PER_MILE / 2 : 500
    if (!state.finalStretch && remaining <= stretch && distanceAlong >= total / 2) {
      next = { ...next, finalStretch: true }
      if (remaining > QUIET_BEFORE_FINISH) {
        cues.push(unit === 'mi' ? 'Half a mile to go. Finish strong.' : '500 metres to go. Finish strong.')
      }
    }
  }

  return { cues, state: next }
}
