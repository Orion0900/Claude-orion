/**
 * Counting the turns a runner actually has to remember.
 *
 * A routing engine emits a step for every change in the road network, but most
 * of those aren't decisions: a road bending gently, or changing name under your
 * feet, needs no thought. Only the moments where you'd hesitate without a map
 * count toward how complicated a route feels.
 */

export interface Maneuver {
  type: string
  modifier?: string
}

/** Steps that never represent a decision, whatever their modifier. */
const IGNORED_TYPES = new Set(['depart', 'arrive', 'notification'])

/** Junctions that always demand a decision, even when you carry straight on. */
const ALWAYS_COUNTED_TYPES = new Set([
  'roundabout',
  'rotary',
  'roundabout turn',
  'fork',
  'end of road',
  'merge',
  'on ramp',
  'off ramp',
])

/** Modifiers that mean a genuine change of direction. */
const TURNING_MODIFIERS = new Set(['left', 'right', 'sharp left', 'sharp right', 'uturn'])

export function isTurn({ type, modifier }: Maneuver): boolean {
  if (IGNORED_TYPES.has(type)) return false
  if (ALWAYS_COUNTED_TYPES.has(type)) return true
  // 'turn', 'continue' and 'new name' only count when the road genuinely
  // changes direction — a slight bend is something you follow, not remember.
  return modifier !== undefined && TURNING_MODIFIERS.has(modifier)
}

export function countTurns(maneuvers: Maneuver[]): number {
  return maneuvers.reduce((total, maneuver) => total + (isTurn(maneuver) ? 1 : 0), 0)
}

/**
 * Two turns closer together than this are one moment, not two.
 *
 * Stepping left and then right to cross at a kerb, or jogging round the corner
 * of a block, reads to a routing engine as two maneuvers and to a runner as a
 * single "cross here". Counting them separately is what makes an ordinary
 * neighbourhood loop look like it has thirty turns in it.
 */
export const MERGE_TURNS_WITHIN_METERS = 30

export interface PlacedManeuver extends Maneuver {
  /** Distance from the start of the route to this maneuver, in meters. */
  distanceAlong: number
}

/**
 * Turns as a runner would count them: clusters of maneuvers at the same spot
 * collapse into the one decision they actually represent.
 */
export function countDecisions(
  maneuvers: PlacedManeuver[],
  mergeWithin = MERGE_TURNS_WITHIN_METERS,
): number {
  let decisions = 0
  let lastCounted = -Infinity

  for (const maneuver of maneuvers) {
    if (!isTurn(maneuver)) continue
    if (maneuver.distanceAlong - lastCounted <= mergeWithin) continue
    decisions++
    lastCounted = maneuver.distanceAlong
  }
  return decisions
}

/**
 * Turns per kilometre — the comparable measure, since a 10 km route naturally
 * has more turns than a 5 km one without being harder to follow.
 */
export function turnDensity(turns: number, distanceMeters: number): number {
  if (distanceMeters <= 0) return 0
  return turns / (distanceMeters / 1000)
}

/**
 * How a route reads at a glance.
 *
 * This is the number's replacement, not its label. A raw tally invites a runner
 * to worry about remembering thirty turns; what they actually want to know is
 * whether this route is the straightforward one.
 */
export function simplicityLabel(turns: number, distanceMeters: number): string {
  const density = turnDensity(turns, distanceMeters)
  if (density <= 1) return 'Barely any turns'
  if (density <= 2) return 'Easy to follow'
  if (density <= 3.5) return 'A few turns'
  return 'Plenty of turns'
}
