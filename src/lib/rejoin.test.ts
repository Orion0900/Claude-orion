import { describe, expect, it } from 'vitest'
import { cumulativeDistances, destination, haversine, type LatLng } from './geo'
import {
  DETOUR_AFTER_METERS,
  DETOUR_CONFIRM_FIXES,
  DETOUR_MIN_INTERVAL_MS,
  hasRejoined,
  rejoinTarget,
  shouldRequestDetour,
} from './rejoin'

const start: LatLng = { lat: 47.61, lng: -122.33 }

/** A 1 km square loop: north, east, south, west, 20 m between points. */
function squareLoop(): LatLng[] {
  const path: LatLng[] = []
  let corner = start
  for (const bearing of [0, 90, 180, 270]) {
    for (let d = 0; d < 250; d += 20) path.push(destination(corner, bearing, d))
    corner = destination(corner, bearing, 250)
  }
  path.push(start)
  return path
}

describe('rejoinTarget', () => {
  const path = squareLoop()
  const cumulative = cumulativeDistances(path)

  it('leads a runner who overshot a turn back to that turn', () => {
    // The route turns east at the top-left corner (250 m); they carried on north.
    const overshot = destination(destination(start, 0, 250), 0, 80)
    const target = rejoinTarget(path, cumulative, 230, overshot)!
    const corner = destination(start, 0, 250)
    expect(haversine(target.point, corner)).toBeLessThan(40)
    expect(target.distanceAlong).toBeGreaterThanOrEqual(250)
  })

  it('never sends them back over ground already run', () => {
    // Standing inside the square near its start, 400 m into the run.
    const inside = destination(destination(start, 0, 30), 90, 30)
    const target = rejoinTarget(path, cumulative, 400, inside)!
    expect(target.distanceAlong).toBeGreaterThanOrEqual(400)
  })

  it('prefers rejoining soon to skipping a stretch of the loop', () => {
    // Beside the east side, equally near two points 150 m apart along it.
    const east = destination(destination(start, 0, 250), 90, 250)
    const beside = destination(destination(east, 180, 100), 90, 60)
    const target = rejoinTarget(path, cumulative, 500, beside)!
    expect(target.distanceAlong).toBeLessThan(700)
  })

  it('gives nothing for a route too short to follow', () => {
    expect(rejoinTarget([start], [0], 0, start)).toBeNull()
  })
})

describe('shouldRequestDetour', () => {
  const lost = {
    offStreak: DETOUR_CONFIRM_FIXES,
    offRouteBy: DETOUR_AFTER_METERS + 30,
    offDetourBy: null,
    sinceLastRequest: Infinity,
    online: true,
    inFlight: false,
  }

  it('asks once the runner is clearly and repeatedly off route', () => {
    expect(shouldRequestDetour(lost)).toBe(true)
  })

  it('waits out a single bad fix', () => {
    expect(shouldRequestDetour({ ...lost, offStreak: 1 })).toBe(false)
    expect(shouldRequestDetour({ ...lost, offRouteBy: DETOUR_AFTER_METERS - 5 })).toBe(false)
  })

  it('leaves a detour alone while it is being followed', () => {
    expect(shouldRequestDetour({ ...lost, offDetourBy: 10, sinceLastRequest: 60_000 })).toBe(false)
  })

  it('replaces a detour the runner has wandered off', () => {
    expect(shouldRequestDetour({ ...lost, offDetourBy: 90, sinceLastRequest: 60_000 })).toBe(true)
  })

  it('does not hammer the routing service', () => {
    expect(shouldRequestDetour({ ...lost, sinceLastRequest: DETOUR_MIN_INTERVAL_MS - 1 })).toBe(false)
    expect(shouldRequestDetour({ ...lost, inFlight: true })).toBe(false)
    expect(shouldRequestDetour({ ...lost, online: false })).toBe(false)
  })
})

describe('hasRejoined', () => {
  it('is true once back within a street width of the line', () => {
    expect(hasRejoined(10)).toBe(true)
    expect(hasRejoined(80)).toBe(false)
  })
})
