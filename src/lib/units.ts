export type DistanceUnit = 'mi' | 'km'
export type ElevationUnit = 'ft' | 'm'

export const METERS_PER_MILE = 1609.344
export const METERS_PER_FOOT = 0.3048

export const milesToMeters = (mi: number) => mi * METERS_PER_MILE
export const metersToMiles = (m: number) => m / METERS_PER_MILE
export const kmToMeters = (km: number) => km * 1000
export const metersToKm = (m: number) => m / 1000
export const feetToMeters = (ft: number) => ft * METERS_PER_FOOT
export const metersToFeet = (m: number) => m / METERS_PER_FOOT

export function distanceToMeters(value: number, unit: DistanceUnit): number {
  return unit === 'mi' ? milesToMeters(value) : kmToMeters(value)
}

export function metersToDistance(meters: number, unit: DistanceUnit): number {
  return unit === 'mi' ? metersToMiles(meters) : metersToKm(meters)
}

export function elevationToMeters(value: number, unit: ElevationUnit): number {
  return unit === 'ft' ? feetToMeters(value) : value
}

export function metersToElevation(meters: number, unit: ElevationUnit): number {
  return unit === 'ft' ? metersToFeet(meters) : meters
}

export function formatDistance(meters: number, unit: DistanceUnit): string {
  return `${metersToDistance(meters, unit).toFixed(2)} ${unit}`
}

export function formatElevation(meters: number, unit: ElevationUnit): string {
  return `${Math.round(metersToElevation(meters, unit))} ${unit}`
}

/** Pace in seconds per unit distance -> "8:24 /mi". */
export function formatPace(secondsPerUnit: number, unit: DistanceUnit): string {
  const mins = Math.floor(secondsPerUnit / 60)
  const secs = Math.round(secondsPerUnit % 60)
  const s = secs === 60 ? 0 : secs
  const m = secs === 60 ? mins + 1 : mins
  return `${m}:${String(s).padStart(2, '0')} /${unit}`
}

/** Duration in seconds -> "1:04:30" or "44:12". */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
