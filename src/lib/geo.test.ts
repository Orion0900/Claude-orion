import { describe, expect, it } from 'vitest'
import {
  bearingTo,
  bounds,
  cumulativeDistances,
  destination,
  haversine,
  pathLength,
  pointAtFraction,
  resample,
} from './geo'

const BOSTON = { lat: 42.3601, lng: -71.0589 }

describe('haversine', () => {
  it('is zero for identical points', () => {
    expect(haversine(BOSTON, BOSTON)).toBe(0)
  })

  it('matches a known city-to-city distance', () => {
    // Boston -> New York is ~306 km great-circle.
    const nyc = { lat: 40.7128, lng: -74.006 }
    expect(haversine(BOSTON, nyc) / 1000).toBeCloseTo(306, 0)
  })

  it('is symmetric', () => {
    const other = { lat: 42.4, lng: -71.1 }
    expect(haversine(BOSTON, other)).toBeCloseTo(haversine(other, BOSTON), 6)
  })
})

describe('destination', () => {
  it('lands the requested distance away', () => {
    const target = destination(BOSTON, 45, 1000)
    expect(haversine(BOSTON, target)).toBeCloseTo(1000, 1)
  })

  it('round-trips with bearingTo', () => {
    for (const bearing of [0, 37, 128, 271, 359]) {
      const target = destination(BOSTON, bearing, 2500)
      expect(bearingTo(BOSTON, target)).toBeCloseTo(bearing, 3)
    }
  })

  it('moves north for bearing 0 and east for bearing 90', () => {
    expect(destination(BOSTON, 0, 5000).lat).toBeGreaterThan(BOSTON.lat)
    expect(destination(BOSTON, 90, 5000).lng).toBeGreaterThan(BOSTON.lng)
  })

  it('wraps longitude across the antimeridian', () => {
    const nearDateLine = { lat: 0, lng: 179.9 }
    const crossed = destination(nearDateLine, 90, 40000)
    expect(crossed.lng).toBeLessThan(0)
    expect(crossed.lng).toBeGreaterThan(-180)
  })
})

describe('pathLength', () => {
  it('sums the legs', () => {
    const path = [BOSTON, destination(BOSTON, 0, 1000), destination(BOSTON, 0, 2000)]
    expect(pathLength(path)).toBeCloseTo(2000, 0)
  })

  it('is zero for a degenerate path', () => {
    expect(pathLength([BOSTON])).toBe(0)
    expect(pathLength([])).toBe(0)
  })
})

describe('resample', () => {
  const line = Array.from({ length: 40 }, (_, i) => destination(BOSTON, 90, i * 100))

  it('returns exactly the requested number of points', () => {
    expect(resample(line, 10)).toHaveLength(10)
    expect(resample(line, 2)).toHaveLength(2)
  })

  it('keeps both endpoints', () => {
    const out = resample(line, 7)
    expect(out[0]).toEqual(line[0])
    expect(out[out.length - 1]).toEqual(line[line.length - 1])
  })

  it('spaces points evenly along the path', () => {
    const out = resample(line, 9)
    const gaps = cumulativeDistances(out).slice(1).map((d, i) => d - cumulativeDistances(out)[i])
    const expected = pathLength(line) / 8
    for (const gap of gaps) expect(gap).toBeCloseTo(expected, 0)
  })

  it('preserves total length within a metre', () => {
    expect(pathLength(resample(line, 20))).toBeCloseTo(pathLength(line), 0)
  })

  it('handles a zero-length path without dividing by zero', () => {
    const out = resample([BOSTON, BOSTON, BOSTON], 5)
    expect(out).toHaveLength(5)
    expect(out.every((p) => p.lat === BOSTON.lat)).toBe(true)
  })
})

describe('bounds', () => {
  it('brackets every point', () => {
    const path = [BOSTON, destination(BOSTON, 45, 3000), destination(BOSTON, 225, 3000)]
    const [sw, ne] = bounds(path)
    for (const p of path) {
      expect(p.lat).toBeGreaterThanOrEqual(sw.lat)
      expect(p.lat).toBeLessThanOrEqual(ne.lat)
      expect(p.lng).toBeGreaterThanOrEqual(sw.lng)
      expect(p.lng).toBeLessThanOrEqual(ne.lng)
    }
  })
})

describe('pointAtFraction', () => {
  const line = Array.from({ length: 11 }, (_, i) => destination(BOSTON, 90, i * 100))

  it('returns the endpoints at 0 and 1', () => {
    expect(pointAtFraction(line, 0)).toEqual(line[0])
    expect(haversine(pointAtFraction(line, 1), line[10])).toBeLessThan(0.01)
  })

  it('lands halfway along by distance', () => {
    expect(haversine(line[0], pointAtFraction(line, 0.5))).toBeCloseTo(500, 0)
  })

  it('clamps out-of-range fractions', () => {
    expect(haversine(pointAtFraction(line, -2), line[0])).toBeLessThan(0.01)
    expect(haversine(pointAtFraction(line, 5), line[10])).toBeLessThan(0.01)
  })

  it('handles a degenerate path', () => {
    expect(pointAtFraction([BOSTON, BOSTON], 0.4)).toEqual(BOSTON)
    expect(pointAtFraction([BOSTON], 0.4)).toEqual(BOSTON)
  })
})
