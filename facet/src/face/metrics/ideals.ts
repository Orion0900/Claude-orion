import type { Sex } from '../types'
import type { GroupId, Range } from './types'

export interface MetricSpec {
  group: GroupId
  /** Ideal range by the chosen comparison; absent for descriptive measures. */
  ideal?: Record<Sex, [number, number]>
  /** How far past the range costs about three points. */
  sigma?: number
  /** Share of its group's score. */
  weight: number
  /** Gauge extent. */
  gauge: [number, number]
}

/**
 * The ideal ranges. They come from the classical proportion canons, facial
 * anthropometry norms and studies of rated attractiveness, and they describe
 * averages of the faces studied — mostly young adults of European descent in
 * the older literature. A face outside a range is a face that differs from
 * that average, nothing more.
 */
export const FRONT_SPECS = {
  // Largest miss of any third from 33.3%, in percentage points.
  thirds: { group: 'proportions', ideal: { female: [0, 3], male: [0, 3] }, sigma: 3, weight: 3, gauge: [0, 12] },
  // Largest miss of any fifth from its ideal share, in percentage points.
  fifths: { group: 'proportions', ideal: { female: [0, 2.5], male: [0, 2.5] }, sigma: 2.5, weight: 2, gauge: [0, 10] },
  // Cheekbone width over brow-to-lip height.
  fwhr: { group: 'proportions', ideal: { female: [1.75, 1.95], male: [1.85, 2.05] }, sigma: 0.12, weight: 1.5, gauge: [1.5, 2.4] },
  // Pupil distance over pupil-to-lip-line height.
  midface: { group: 'proportions', ideal: { female: [0.97, 1.07], male: [0.97, 1.07] }, sigma: 0.07, weight: 1.5, gauge: [0.8, 1.3] },
  // Nasion-to-chin height over cheekbone width, descriptive.
  faceIndex: { group: 'proportions', weight: 0, gauge: [0.7, 1.1] },
  // Jaw width over cheekbone width.
  jawCheek: { group: 'jaw', ideal: { female: [0.7, 0.8], male: [0.78, 0.88] }, sigma: 0.05, weight: 2, gauge: [0.6, 1.0] },
  // Degrees, outer corner above inner.
  canthalTilt: { group: 'eyes', ideal: { female: [4, 9], male: [3, 8] }, sigma: 3, weight: 2, gauge: [-8, 16] },
  // Distance between the eyes over one eye's width.
  eyeSpacing: { group: 'eyes', ideal: { female: [0.92, 1.1], male: [0.92, 1.1] }, sigma: 0.1, weight: 1.5, gauge: [0.7, 1.4] },
  // Pupil distance over face width.
  eyeSeparation: { group: 'eyes', ideal: { female: [0.44, 0.48], male: [0.44, 0.48] }, sigma: 0.025, weight: 1, gauge: [0.38, 0.54] },
  // Eye height over width, descriptive.
  eyeShape: { group: 'eyes', weight: 0, gauge: [0.15, 0.5] },
  // Pupil-to-brow height over pupil distance, descriptive.
  browPosition: { group: 'eyes', weight: 0, gauge: [0.1, 0.45] },
  // Brow head-to-tail angle in degrees, descriptive.
  browTilt: { group: 'eyes', weight: 0, gauge: [-15, 20] },
  // Nose width over the distance between the eyes.
  noseWidth: { group: 'nose', ideal: { female: [0.95, 1.12], male: [1.0, 1.18] }, sigma: 0.12, weight: 2, gauge: [0.7, 1.6] },
  // Mouth width over nose width.
  mouthNose: { group: 'lips', ideal: { female: [1.5, 1.7], male: [1.45, 1.65] }, sigma: 0.12, weight: 1.5, gauge: [1.1, 2.0] },
  // Lower lip height over upper lip height.
  lipRatio: { group: 'lips', ideal: { female: [1.4, 2.0], male: [1.4, 2.0] }, sigma: 0.3, weight: 1.5, gauge: [0.6, 2.8] },
  // Lip line to chin over nose base to lip line.
  lowerThird: { group: 'jaw', ideal: { female: [1.9, 2.3], male: [2.0, 2.4] }, sigma: 0.25, weight: 1.5, gauge: [1.2, 3.0] },
} satisfies Record<string, MetricSpec>

export type FrontMetricId = keyof typeof FRONT_SPECS

export function idealRange(spec: MetricSpec, sex: Sex): Range | undefined {
  if (!spec.ideal) return undefined
  const [lo, hi] = spec.ideal[sex]
  return { lo, hi }
}
