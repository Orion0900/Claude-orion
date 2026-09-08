import { describe, expect, it } from 'vitest'
import { buildProfile } from './elevation'
import { destination, pathLength, resample } from './geo'
import { gradeSegments, STEEP_GRADE, steepDistance, steepestGrade, windowedGrades } from './grades'

const origin = { lat: 42.36, lng: -71.06 }
/** 2 km due east, a vertex every 20 m. */
const path = Array.from({ length: 101 }, (_, i) => destination(origin, 90, i * 20))

/** A profile whose elevation is a function of distance along the route. */
function profileFor(elevationAt: (meters: number) => number, samples = 41) {
  const points = resample(path, samples)
  const total = pathLength(path)
  const elevations = points.map((_, i) => elevationAt((i / (samples - 1)) * total))
  return buildProfile(points, elevations, { smoothWindow: 1 })
}

describe('windowedGrades', () => {
  it('reads a steady climb as its true grade', () => {
    const grades = windowedGrades(profileFor((m) => m * 0.08))
    for (const grade of grades.slice(2, -2)) expect(grade).toBeCloseTo(0.08, 3)
  })

  it('reads a descent as negative and the flat as zero', () => {
    expect(windowedGrades(profileFor((m) => 100 - m * 0.04)).every((g) => g < 0)).toBe(true)
    expect(windowedGrades(profileFor(() => 50)).every((g) => g === 0)).toBe(true)
  })
})

describe('gradeSegments', () => {
  it('marks one steep hill in the middle of a flat ride', () => {
    // Flat, then a 7% climb from 800 m to 1200 m, then flat again.
    const hill = (m: number) => (m < 800 ? 0 : m < 1200 ? (m - 800) * 0.07 : 28)
    const segments = gradeSegments(path, profileFor(hill))
    const steep = segments.filter((s) => s.kind === 'steep')
    expect(steep).toHaveLength(1)
    expect(steepDistance(segments)).toBeGreaterThanOrEqual(250)
    expect(steepDistance(segments)).toBeLessThan(600)
    expect(steepestGrade(segments)).toBeGreaterThan(0.06)
    // The whole route is covered, in order, with nothing lost.
    const covered = segments.reduce((sum, s) => sum + s.length, 0)
    expect(covered).toBeCloseTo(pathLength(path), -1)
  })

  it('leaves a gentle climb green', () => {
    const segments = gradeSegments(path, profileFor((m) => m * 0.03))
    expect(segments.every((s) => s.kind === 'easy')).toBe(true)
    expect(steepDistance(segments)).toBe(0)
  })

  it('never calls a descent steep, however sharp', () => {
    const segments = gradeSegments(path, profileFor((m) => 200 - m * 0.1))
    expect(segments.every((s) => s.kind === 'easy')).toBe(true)
  })

  it('cuts stretches from the real geometry so they draw on the road', () => {
    const segments = gradeSegments(path, profileFor((m) => (m < 1000 ? 0 : (m - 1000) * 0.06)))
    for (const segment of segments) {
      expect(segment.path.length).toBeGreaterThanOrEqual(2)
      for (const point of segment.path) expect(Math.abs(point.lat - origin.lat)).toBeLessThan(1e-4)
    }
    // Consecutive segments share their boundary point.
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i].path[0]).toEqual(segments[i - 1].path[segments[i - 1].path.length - 1])
    }
  })

  it('has nothing to say without a profile', () => {
    expect(gradeSegments(path, buildProfile([], []))).toHaveLength(1)
    expect(gradeSegments([], buildProfile([], []))).toEqual([])
  })

  it('uses five percent as the line between cruising and grinding', () => {
    expect(STEEP_GRADE).toBe(0.05)
  })
})
