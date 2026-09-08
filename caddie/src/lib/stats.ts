/** Small statistics helpers; nothing here needs a library. */

/** Standard normal cumulative distribution (Abramowitz & Stegun 7.1.26). */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.SQRT2
  const t = 1 / (1 + 0.3275911 * x)
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  const erf = 1 - poly * Math.exp(-x * x)
  return 0.5 * (1 + sign * erf)
}

/** Probability a normal(mean, sd) sample lands in [from, to]. */
export function probabilityBetween(mean: number, sd: number, from: number, to: number): number {
  if (sd <= 0) return mean >= from && mean <= to ? 1 : 0
  return normalCdf((to - mean) / sd) - normalCdf((from - mean) / sd)
}

export function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Sample standard deviation; zero for fewer than two values. */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1))
}

/**
 * Mean with the top and bottom `fraction` of values dropped once there are
 * enough of them to spare. One shanked 7-iron shouldn't move the number
 * the advisor plans with.
 */
export function trimmedMean(values: number[], fraction = 0.1): number {
  if (values.length < 5) return mean(values)
  const sorted = [...values].sort((a, b) => a - b)
  const cut = Math.floor(sorted.length * fraction)
  return mean(sorted.slice(cut, sorted.length - cut))
}
