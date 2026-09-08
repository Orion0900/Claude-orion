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

/** "±9" for a spread, in the reader's unit, without repeating the unit. */
export function formatSpread(meters: number, unit: Unit): string {
  return `±${Math.round(toUnit(meters, unit))}`
}
