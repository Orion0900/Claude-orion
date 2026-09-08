/**
 * Throwing away GPS fixes that cannot be true.
 *
 * Satellite accuracy collapses between tall buildings, which is exactly where
 * junctions are — so the worst fixes tend to arrive at the moment a runner
 * turns. Left unfiltered they drag the map somewhere the runner is not.
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

/** Beyond this the receiver is guessing, and a guess moves the map. */
export const MAX_ACCURACY_METERS = 65

/**
 * Faster than any runner, with room for honest error. A fix implying more than
 * this did not come from someone on foot.
 */
export const MAX_SPEED_MPS = 15

/**
 * After this many refusals in a row, take the next fix regardless. Standing
 * under a bridge should not leave the map stuck for the rest of the run.
 */
export const MAX_REJECT_STREAK = 6

/**
 * Receivers report roughly once a second. Two fixes closer together than this
 * are not two observations of a moving runner, so the speed between them is
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
    // Give up refusing rather than leave the runner stranded on a stale fix.
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
