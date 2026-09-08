/**
 * What to show a rider the moment they arrive.
 *
 * The end of a ride is the one time someone is certain to look at the screen,
 * so it reports what actually happened rather than what was predicted: the
 * speed here is measured, not estimated.
 */
import { metersToDistance, type DistanceUnit } from './units'

export interface RideSummary {
  /** Distance actually covered along the route, in meters. */
  distance: number
  /** Wall-clock time from starting the ride, in seconds. */
  elapsedSeconds: number
  /** Total ascent over the part covered, in meters. */
  gain: number
  /** Measured average speed in miles or kilometres per hour, or null if too short to mean anything. */
  averageSpeed: number | null
  /** True when the rider got all the way there. */
  completed: boolean
}

/** Below this, speed is noise rather than a measurement. */
export const MIN_DISTANCE_FOR_SPEED = 200

export function buildRideSummary(input: {
  distanceCovered: number
  elapsedSeconds: number
  routeDistance: number
  routeGain: number
  unit: DistanceUnit
}): RideSummary {
  const { distanceCovered, elapsedSeconds, routeDistance, routeGain, unit } = input
  const fraction = routeDistance > 0 ? Math.min(1, distanceCovered / routeDistance) : 0

  const covered = metersToDistance(distanceCovered, unit)
  const averageSpeed =
    distanceCovered >= MIN_DISTANCE_FOR_SPEED && elapsedSeconds > 0 && covered > 0
      ? covered / (elapsedSeconds / 3600)
      : null

  return {
    distance: distanceCovered,
    elapsedSeconds,
    // Climbing is only known for the whole route, so it's apportioned to how
    // much was covered rather than claimed in full.
    gain: routeGain * fraction,
    averageSpeed,
    completed: fraction >= 0.97,
  }
}

/** A line that reads like something you'd say out loud about the ride. */
export function summaryHeadline(summary: RideSummary): string {
  return summary.completed ? 'You made it' : 'Ride ended early'
}
