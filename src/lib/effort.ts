import { metersToDistance, type DistanceUnit } from './units'

/**
 * Rule of thumb used by most running calculators: about 30 seconds added per
 * 100 ft (30.5 m) climbed, on top of flat pace.
 */
export const SECONDS_PER_METER_CLIMBED = 30 / 30.48

/** Estimated finish time in seconds for a route at a given flat pace. */
export function estimateDuration(
  distanceMeters: number,
  gainMeters: number,
  paceSecondsPerUnit: number,
  unit: DistanceUnit,
): number {
  const flat = metersToDistance(distanceMeters, unit) * paceSecondsPerUnit
  return flat + gainMeters * SECONDS_PER_METER_CLIMBED
}

/** Parse "8:30" or "8" into seconds. Returns null when unparseable. */
export function parsePace(input: string): number | null {
  const match = input.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = match[2] === undefined ? 0 : Number(match[2])
  if (seconds >= 60) return null
  const total = minutes * 60 + seconds
  return total > 0 ? total : null
}
