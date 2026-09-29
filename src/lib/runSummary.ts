/**
 * What to show a runner the moment they finish.
 *
 * The end of a run is the one time someone is certain to look at the screen, so
 * it's worth reporting what actually happened rather than what was predicted.
 * Pace here is measured, not estimated.
 */
import { formatDuration, formatPace, metersToDistance, type DistanceUnit } from './units'

export interface RunSummary {
  /** Distance actually covered along the route, in meters. */
  distance: number
  /** Wall-clock time from starting the run, in seconds. */
  elapsedSeconds: number
  /** Total ascent over the part covered, in meters. */
  gain: number
  /** Measured seconds per mile or kilometre, or null if too short to mean anything. */
  paceSecondsPerUnit: number | null
  /** True when the runner got all the way round. */
  completed: boolean
}

/** Below this, pace is noise rather than a measurement. */
export const MIN_DISTANCE_FOR_PACE = 200

export function buildRunSummary(input: {
  distanceCovered: number
  elapsedSeconds: number
  routeDistance: number
  routeGain: number
  unit: DistanceUnit
}): RunSummary {
  const { distanceCovered, elapsedSeconds, routeDistance, routeGain, unit } = input
  const fraction = routeDistance > 0 ? Math.min(1, distanceCovered / routeDistance) : 0

  const covered = metersToDistance(distanceCovered, unit)
  const paceSecondsPerUnit =
    distanceCovered >= MIN_DISTANCE_FOR_PACE && elapsedSeconds > 0 && covered > 0
      ? elapsedSeconds / covered
      : null

  return {
    distance: distanceCovered,
    elapsedSeconds,
    // Climbing is only known for the whole route, so it's apportioned to how
    // much was covered rather than claimed in full.
    gain: routeGain * fraction,
    paceSecondsPerUnit,
    completed: fraction >= 0.97,
  }
}

/** A line that reads like something you'd say out loud about the run. */
export function summaryHeadline(summary: RunSummary): string {
  return summary.completed ? 'Run complete' : 'Run ended early'
}

/** What to send a friend: "I ran 5.02 mi in 45:12 (9:00 /mi) with LoopMaker". */
export function runShareText(summary: RunSummary, unit: DistanceUnit): string {
  const distance = `${metersToDistance(summary.distance, unit).toFixed(2)} ${unit}`
  const pace = summary.paceSecondsPerUnit === null ? '' : ` (${formatPace(summary.paceSecondsPerUnit, unit)})`
  const verb = summary.completed ? 'ran a' : 'ran'
  const loop = summary.completed ? ' loop' : ''
  return `I ${verb} ${distance}${loop} in ${formatDuration(summary.elapsedSeconds)}${pace} with LoopMaker 🏃`
}
