/**
 * Where the hills are, on the map rather than the profile.
 *
 * A route's elevation profile says how much climbing there is; a rider
 * choosing between routes wants to know where it happens and how hard it is.
 * This cuts the route into stretches that are a steep climb and stretches
 * that aren't, ready to paint.
 */
import { cumulativeDistances, resample, slicePath, type LatLng } from './geo'
import type { ElevationProfile } from './elevation'

/**
 * Five percent is where a casual rider on an ordinary bike stops cruising
 * and starts grinding: a 5% grade roughly halves the speed of someone doing
 * 18 km/h on the flat, and anything much steeper means low gear or walking.
 * Cycling infrastructure guidance treats 5% as the limit for a comfortable
 * sustained climb, which is the sense meant here.
 */
export const STEEP_GRADE = 0.05

export type GradeKind = 'steep' | 'easy'

export interface GradeSegment {
  kind: GradeKind
  path: LatLng[]
  /** Meters along the route. */
  length: number
  /** Steepest windowed grade inside this stretch, as a fraction (0.06 = 6%). */
  maxGrade: number
}

/**
 * Grade at each elevation sample, measured over a window of two sample
 * spacings — about 100 m on a typical route — so a single noisy sample can't
 * paint a hill that isn't there. Uphill is positive.
 */
export function windowedGrades(profile: ElevationProfile): number[] {
  const { distances, elevations } = profile
  const n = elevations.length
  if (n < 2) return new Array(Math.max(0, n - 1)).fill(0)
  const grades: number[] = []
  for (let i = 1; i < n; i++) {
    const lo = Math.max(0, i - 2)
    const hi = Math.min(n - 1, i + 1)
    const run = distances[hi] - distances[lo]
    grades.push(run <= 0 ? 0 : (elevations[hi] - elevations[lo]) / run)
  }
  return grades
}

/**
 * Cut the route into steep climbs and everything else. Descents, however
 * sharp, are "easy": the question is what you have to pedal up.
 *
 * Results are remembered per profile. A profile is fixed once its route is
 * found, and this is asked the same question on every render of the card, the
 * bar and the map — including on every pointer move while the rider scrubs
 * the elevation trace, which is exactly when the phone can least afford it.
 */
export function gradeSegments(
  path: LatLng[],
  profile: ElevationProfile,
  threshold = STEEP_GRADE,
): GradeSegment[] {
  const byThreshold = cache.get(profile)
  const remembered = byThreshold?.get(threshold)
  if (remembered) return remembered

  const computed = cutSegments(path, profile, threshold)
  if (byThreshold) byThreshold.set(threshold, computed)
  else cache.set(profile, new Map([[threshold, computed]]))
  return computed
}

/** Keyed on the profile, which is frozen for the life of its route. */
const cache = new WeakMap<ElevationProfile, Map<number, GradeSegment[]>>()

function cutSegments(path: LatLng[], profile: ElevationProfile, threshold: number): GradeSegment[] {
  const samples = profile.elevations.length
  if (path.length < 2 || samples < 2) {
    return path.length < 2 ? [] : [{ kind: 'easy', path: path.slice(), length: 0, maxGrade: 0 }]
  }

  // Where each sample sits along the route. The profile carries these, and
  // they are the true along-path distances; measuring the resampled points
  // against each other instead would cut every corner and leave the last
  // stretch of the ride unpainted.
  const along =
    profile.distances.length === samples ? profile.distances : cumulativeDistances(resample(path, samples))
  const cumulative = cumulativeDistances(path)
  const grades = windowedGrades(profile)

  const segments: GradeSegment[] = []
  for (let i = 0; i < grades.length; i++) {
    const kind: GradeKind = grades[i] >= threshold ? 'steep' : 'easy'
    const from = along[i]
    const to = along[i + 1]
    const last = segments[segments.length - 1]
    if (last && last.kind === kind) {
      const extra = slicePath(path, from, to, cumulative)
      last.path.push(...extra.slice(1))
      last.length += to - from
      last.maxGrade = Math.max(last.maxGrade, grades[i])
    } else {
      segments.push({ kind, path: slicePath(path, from, to, cumulative), length: to - from, maxGrade: grades[i] })
    }
  }
  return segments
}

/** Meters of the route spent on steep climbs. */
export function steepDistance(segments: GradeSegment[]): number {
  return segments.reduce((sum, segment) => sum + (segment.kind === 'steep' ? segment.length : 0), 0)
}

/** The steepest windowed grade anywhere on the route, as a fraction. */
export function steepestGrade(segments: GradeSegment[]): number {
  return segments.reduce((max, segment) => Math.max(max, segment.maxGrade), 0)
}
