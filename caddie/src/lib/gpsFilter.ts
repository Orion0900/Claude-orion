/**
 * Throwing away GPS fixes that cannot be true.
 *
 * Tree lines and the phone living in a pocket both wreck a fix, and a bad
 * one turns into a 40-yard shot that never happened. Left unfiltered they
 * drag the map, and the distance, somewhere the player is not.
 *
 * Two things give a bad fix away: the receiver's own admission that it is
 * unsure, and a jump that would need impossible speed. Both are checked, with a
 * escape hatch so a long run of bad fixes cannot freeze the app permanently.
 */
import { haversine, type LatLng } from './geo'

export interface Fix {
  position: LatLng
  /** The receiver's own estimate of its error, in meters. */
  accuracy: number
  /** Milliseconds, from the fix itself rather than the clock. */
  timestamp: number
}

export interface FixVerdict {
  accepted: boolean
  reason?: 'inaccurate' | 'impossible-speed'
}

/** Beyond this the receiver is guessing, and a guess moves the yardage. */
export const MAX_ACCURACY_METERS = 40

/**
 * Faster than a cart, with room for honest error. A fix implying more than
 * this (about 45 km/h) did not come from someone on a golf course.
 */
export const MAX_SPEED_MPS = 12

/**
 * After this many refusals in a row, take the next fix regardless. Standing
 * under the trees should not leave the map stuck for the rest of the round.
 */
export const MAX_REJECT_STREAK = 6

/**
 * Receivers report roughly once a second. Two fixes closer together than this
 * are not two observations of a moving player, so the speed between them is
 * arithmetic on noise rather than a measurement, and judging by it would throw
 * away good fixes. Accuracy is still checked either way.
 */
export const MIN_INTERVAL_FOR_SPEED_MS = 250

export interface FixFilter {
  accept(fix: Fix): FixVerdict
  reset(): void
}

export function createFixFilter(options: {
  maxAccuracy?: number
  maxSpeed?: number
  maxRejectStreak?: number
} = {}): FixFilter {
  const maxAccuracy = options.maxAccuracy ?? MAX_ACCURACY_METERS
  const maxSpeed = options.maxSpeed ?? MAX_SPEED_MPS
  const maxStreak = options.maxRejectStreak ?? MAX_REJECT_STREAK

  let last: Fix | null = null
  let streak = 0

  const take = (fix: Fix): FixVerdict => {
    last = fix
    streak = 0
    return { accepted: true }
  }

  const refuse = (fix: Fix, reason: FixVerdict['reason']): FixVerdict => {
    streak++
    // Give up refusing rather than leave the player stranded on a stale fix.
    if (streak >= maxStreak) return take(fix)
    return { accepted: false, reason }
  }

  return {
    accept(fix) {
      // The first fix has nothing to be judged against, but still has to be
      // better than useless.
      if (last === null) {
        return fix.accuracy > maxAccuracy * 2 ? refuse(fix, 'inaccurate') : take(fix)
      }

      if (fix.accuracy > maxAccuracy) return refuse(fix, 'inaccurate')

      const elapsed = fix.timestamp - last.timestamp
      const seconds = elapsed / 1000
      // Fixes out of order, or arriving faster than a receiver reports, say
      // nothing useful about speed.
      if (elapsed >= MIN_INTERVAL_FOR_SPEED_MS) {
        const speed = haversine(last.position, fix.position) / seconds
        if (speed > maxSpeed) return refuse(fix, 'impossible-speed')
      }

      return take(fix)
    },
    reset() {
      last = null
      streak = 0
    },
  }
}
