/**
 * Running a loop the other way round.
 *
 * A loop can be run in either direction, but it is generated in one. If the
 * runner sets off the opposite way, every instruction is wrong: the turns come
 * in the wrong order, they point the wrong way, and they name the wrong roads.
 *
 * Reversing instructions is not reversing a list. A routing engine's step
 * carries a maneuver *and* the road travelled after it, so going backwards a
 * turn keeps its junction but takes the previous step's road, and left becomes
 * right.
 */
import { bearingTo, cumulativeDistances, haversine, pathLength, type LatLng } from './geo'
import { angleDifference } from './heading'
import type { RouteStep } from './navigation'
import type { RouteResult } from './routeSearch'
import type { ElevationProfile } from './elevation'

export type RunDirection = 'forward' | 'reverse'

const MIRRORED: Record<string, string> = {
  left: 'right',
  right: 'left',
  'slight left': 'slight right',
  'slight right': 'slight left',
  'sharp left': 'sharp right',
  'sharp right': 'sharp left',
  straight: 'straight',
  uturn: 'uturn',
}

/** A left turn taken the other way round is a right turn. */
export function mirrorModifier(modifier: string | undefined): string | undefined {
  if (modifier === undefined) return undefined
  return MIRRORED[modifier] ?? modifier
}

/**
 * Rebuild the instruction list for a route travelled backwards.
 *
 * Step `i` sits at junction `L(i)` and names the road run *after* it, up to
 * `L(i+1)`. Going the other way, the junction at `L(i)` is still a junction,
 * but you arrive on the road that used to follow it and leave on the one that
 * used to precede it — so each reversed step keeps its own location and takes
 * the *previous* step's road, mirrored.
 */
export function reverseSteps(steps: RouteStep[], reversedPath: LatLng[]): RouteStep[] {
  if (steps.length === 0) return []

  const total = pathLength(reversedPath)
  const along = (fromEnd: number) => Math.max(0, total - fromEnd)
  const last = steps.length - 1

  const reversed: RouteStep[] = [
    {
      ...steps[last],
      type: 'depart',
      modifier: undefined,
      exit: undefined,
      // Setting off, you are on the road that used to lead here.
      name: steps[Math.max(0, last - 1)]?.name,
      ref: steps[Math.max(0, last - 1)]?.ref,
      distanceAlong: 0,
    },
  ]

  for (let i = last - 1; i >= 1; i--) {
    const previous = steps[i - 1]
    reversed.push({
      ...steps[i],
      modifier: mirrorModifier(steps[i].modifier),
      // A roundabout counted from the other side has a different exit, and
      // nothing here can work out which — better to say nothing than to guess.
      exit: undefined,
      name: previous.name,
      ref: previous.ref,
      destinations: previous.destinations,
      distanceAlong: along(steps[i].distanceAlong),
    })
  }

  reversed.push({
    ...steps[0],
    type: 'arrive',
    modifier: undefined,
    exit: undefined,
    distanceAlong: total,
  })

  return reversed
}

/**
 * Flip an elevation profile end for end. What was climbed on the way round one
 * way is descended the other, so ascent and descent swap.
 */
export function reverseProfile(profile: ElevationProfile): ElevationProfile {
  const total = profile.distances[profile.distances.length - 1] ?? 0
  return {
    ...profile,
    distances: profile.distances.map((d) => total - d).reverse(),
    elevations: [...profile.elevations].reverse(),
    gain: profile.loss,
    loss: profile.gain,
  }
}

/** Below this the runner has not committed to a direction yet. */
export const MIN_MOVEMENT_METERS = 20
/** How far along the loop to look when working out which way it heads. */
const SIGHT_METERS = 70
/** The two directions must be told apart by at least this much to call it. */
const MARGIN_DEGREES = 25
/**
 * However clearly one direction beats the other, the runner still has to be
 * roughly going that way. Someone striking out perpendicular to the loop is
 * not running it backwards — they are off the route, which is a different
 * problem with its own warning.
 */
const MAX_DEVIATION_DEGREES = 75

function bearingAlong(path: LatLng[], fromStart: boolean): number | null {
  if (path.length < 2) return null
  const cumulative = cumulativeDistances(path)
  const total = cumulative[cumulative.length - 1]
  const target = Math.min(SIGHT_METERS, total)

  if (fromStart) {
    const index = cumulative.findIndex((d) => d >= target)
    return bearingTo(path[0], path[index === -1 ? path.length - 1 : index])
  }
  const backwards = total - target
  let index = cumulative.length - 1
  while (index > 0 && cumulative[index] > backwards) index--
  return bearingTo(path[path.length - 1], path[index])
}

/** The same run, described in the opposite direction. */
export function reverseRoute(route: RouteResult): RouteResult {
  const path = [...route.path].reverse()

  return {
    ...route,
    id: `${route.id}-rev`,
    path,
    profile: reverseProfile(route.profile),
    steps: reverseSteps(route.steps, path),
    // Measured over the same short sight line the direction check uses, so the
    // label describes where the run actually sets off rather than where it has
    // wandered to several hundred metres later.
    outboundBearing: bearingAlong(path, true) ?? route.outboundBearing,
  }
}

/**
 * Which way round the loop the runner has set off.
 *
 * Compares how they actually moved against the two ways the route leaves the
 * start. Returns null while the answer is still genuinely unclear — better to
 * keep the original instructions than to flip on a wobble.
 */
export function detectDirection(path: LatLng[], from: LatLng, to: LatLng): RunDirection | null {
  if (path.length < 2) return null
  if (haversine(from, to) < MIN_MOVEMENT_METERS) return null

  const forward = bearingAlong(path, true)
  const reverse = bearingAlong(path, false)
  if (forward === null || reverse === null) return null

  const moved = bearingTo(from, to)
  const towardForward = Math.abs(angleDifference(moved, forward))
  const towardReverse = Math.abs(angleDifference(moved, reverse))

  // An out-and-back leaves and returns along the same line, so both directions
  // look identical and there is nothing to choose between them.
  if (Math.abs(towardForward - towardReverse) < MARGIN_DEGREES) return null

  const reverseWins = towardReverse < towardForward
  const best = reverseWins ? towardReverse : towardForward
  if (best > MAX_DEVIATION_DEGREES) return null

  return reverseWins ? 'reverse' : 'forward'
}
