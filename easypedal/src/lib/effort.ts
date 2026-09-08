import { metersToDistance, type DistanceUnit } from './units'

/**
 * Climbing costs a cyclist far more than distance does. A rider who cruises
 * at 18 km/h on the flat drops to walking pace on a steady hill, which works
 * out at roughly five extra seconds for every metre climbed — the figure most
 * ride planners use for a relaxed rider.
 */
export const SECONDS_PER_METER_CLIMBED = 5

/** Estimated ride time in seconds at a given easy flat speed. */
export function estimateDuration(
  distanceMeters: number,
  gainMeters: number,
  speedPerHour: number,
  unit: DistanceUnit,
): number {
  if (speedPerHour <= 0) return 0
  const flat = (metersToDistance(distanceMeters, unit) / speedPerHour) * 3600
  return flat + gainMeters * SECONDS_PER_METER_CLIMBED
}

export const DEFAULT_SPEED: Record<DistanceUnit, number> = { mi: 11, km: 18 }

/** Speed ranges a relaxed rider might actually pick. */
export const SPEED_RANGE: Record<DistanceUnit, { min: number; max: number; step: number }> = {
  mi: { min: 6, max: 22, step: 0.5 },
  km: { min: 10, max: 35, step: 1 },
}
