export type Unit = 'yd' | 'm'

export const METERS_PER_YARD = 0.9144

export const yardsToMeters = (yd: number) => yd * METERS_PER_YARD
export const metersToYards = (m: number) => m / METERS_PER_YARD

export function toUnit(meters: number, unit: Unit): number {
  return unit === 'yd' ? metersToYards(meters) : meters
}

export function fromUnit(value: number, unit: Unit): number {
  return unit === 'yd' ? yardsToMeters(value) : value
}

/** "152 yd" — whole numbers, because nobody hits a club to the decimal. */
export function formatDistance(meters: number, unit: Unit): string {
  return `${Math.round(toUnit(meters, unit))} ${unit}`
}

/**
 * A distance you're travelling rather than hitting: the next course over is
 * "1.1 mi", not "1802 yd". Golf units below the switch, road units above.
 */
export function formatAway(meters: number, unit: Unit): string {
  if (unit === 'yd') {
    const yards = metersToYards(meters)
    return yards < 600 ? `${Math.round(yards)} yd` : `${(meters / 1609.344).toFixed(1)} mi`
  }
  return meters < 600 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`
}

/** "±9" for a spread, in the reader's unit, without repeating the unit. */
export function formatSpread(meters: number, unit: Unit): string {
  return `±${Math.round(toUnit(meters, unit))}`
}
