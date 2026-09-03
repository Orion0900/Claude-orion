import { describe, expect, it } from 'vitest'
import { toGpx } from './gpx'
import { buildProfile } from './elevation'
import { destination } from './geo'
import type { RouteResult } from './routeSearch'

const start = { lat: 42.36, lng: -71.06 }
const path = Array.from({ length: 20 }, (_, i) => destination(start, 90, i * 100))

const route: RouteResult = {
  id: 'test',
  path,
  distance: 1900,
  profile: buildProfile(path.filter((_, i) => i % 4 === 0), [10, 20, 35, 20, 10]),
  outboundBearing: 90,
  meetsCriteria: true,
  distanceError: 0.01,
  score: 0.02,
}

describe('toGpx', () => {
  const gpx = toGpx(route, 'Morning 5')

  it('emits a well-formed GPX 1.1 document', () => {
    expect(gpx.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(gpx).toContain('<gpx version="1.1"')
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"')
    expect(gpx.trimEnd().endsWith('</gpx>')).toBe(true)
  })

  it('writes one track point per route vertex', () => {
    expect(gpx.match(/<trkpt /g)).toHaveLength(path.length)
  })

  it('includes elevation on the track points', () => {
    expect(gpx).toContain('<ele>')
  })

  it('escapes the route name', () => {
    expect(toGpx(route, 'Tom & "Jerry" <run>')).toContain('Tom &amp; &quot;Jerry&quot; &lt;run&gt;')
  })

  it('keeps coordinates in the original order', () => {
    const lats = [...gpx.matchAll(/lat="([-\d.]+)"/g)].map((m) => Number(m[1]))
    expect(lats[0]).toBeCloseTo(path[0].lat, 5)
    expect(lats[lats.length - 1]).toBeCloseTo(path[path.length - 1].lat, 5)
  })

  it('handles a route with no elevation samples', () => {
    const bare = { ...route, profile: { ...route.profile, elevations: [] } }
    expect(() => toGpx(bare, 'bare')).not.toThrow()
    expect(toGpx(bare, 'bare')).not.toContain('<ele>')
  })
})
