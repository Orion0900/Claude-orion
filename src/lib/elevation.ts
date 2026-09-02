import { cumulativeDistances, type LatLng } from './geo'

export interface ElevationProfile {
  /** Cumulative distance along the route at each sample, meters. */
  distances: number[]
  /** Smoothed elevation at each sample, meters. */
  elevations: number[]
  /** Total ascent, meters. */
  gain: number
  /** Total descent, meters. */
  loss: number
  minElevation: number
  maxElevation: number
}

/**
 * Centered moving average. Raw DEM samples are noisy enough that unsmoothed
 * series can report double the true ascent, so every gain figure in the app
 * runs through this first.
 */
export function smooth(values: number[], window = 3): number[] {
  if (values.length === 0 || window <= 1) return [...values]
  const half = Math.floor(window / 2)
  return values.map((_, i) => {
    const start = Math.max(0, i - half)
    const end = Math.min(values.length - 1, i + half)
    let sum = 0
    for (let j = start; j <= end; j++) sum += values[j]
    return sum / (end - start + 1)
  })
}

/**
 * Hysteresis accumulator: only count a rise once it exceeds `threshold`
 * meters above the last confirmed reference point. Oscillations smaller
 * than the threshold are treated as sensor noise and ignored.
 */
export function gainAndLoss(
  elevations: number[],
  threshold = 3,
): { gain: number; loss: number } {
  if (elevations.length < 2) return { gain: 0, loss: 0 }
  let gain = 0
  let loss = 0
  let reference = elevations[0]

  for (let i = 1; i < elevations.length; i++) {
    const delta = elevations[i] - reference
    if (delta >= threshold) {
      gain += delta
      reference = elevations[i]
    } else if (delta <= -threshold) {
      loss += -delta
      reference = elevations[i]
    }
  }
  return { gain, loss }
}

export function buildProfile(
  samplePoints: LatLng[],
  rawElevations: number[],
  options: { smoothWindow?: number; threshold?: number } = {},
): ElevationProfile {
  const elevations = smooth(rawElevations, options.smoothWindow ?? 3)
  const { gain, loss } = gainAndLoss(elevations, options.threshold ?? 3)
  return {
    distances: cumulativeDistances(samplePoints),
    elevations,
    gain,
    loss,
    minElevation: elevations.length ? Math.min(...elevations) : 0,
    maxElevation: elevations.length ? Math.max(...elevations) : 0,
  }
}
