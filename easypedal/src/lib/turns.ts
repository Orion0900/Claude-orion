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
 * Turns per kilometre — the comparable measure, since a 10 km route naturally
 * has more turns than a 5 km one without being harder to follow.
 */
export function turnDensity(turns: number, distanceMeters: number): number {
  if (distanceMeters <= 0) return 0
  return turns / (distanceMeters / 1000)
}

/** Plain-language verdict on how much navigating a route asks of you. */
export function simplicityLabel(turns: number, distanceMeters: number): string {
  const density = turnDensity(turns, distanceMeters)
  if (density <= 1.5) return 'Very simple'
  if (density <= 3) return 'Simple'
  if (density <= 5) return 'Moderate'
  return 'Busy'
}
