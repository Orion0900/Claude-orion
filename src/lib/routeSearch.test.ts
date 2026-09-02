import { describe, expect, it, vi } from 'vitest'
import { haversine, type LatLng } from './geo'
import {
  buildWaypoints,
  compassLabel,
  DEFAULT_CRITERIA,
  findRoutes,
  initialRadius,
  isDuplicate,
  mulberry32,
  scoreRoute,
  type RouteCriteria,
  type RouteResult,
} from './routeSearch'
import { createGridRouter, createTerrainElevation, ORIGIN, toLatLng, toXY } from './__fixtures__/world'
import { milesToMeters, feetToMeters } from './units'

const criteriaFor = (overrides: Partial<RouteCriteria> = {}): RouteCriteria => ({
  ...DEFAULT_CRITERIA,
  start: ORIGIN,
  ...overrides,
})

const world = () => ({ routing: createGridRouter(), elevation: createTerrainElevation() })

describe('mulberry32', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('produces different streams for different seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)())
  })

  it('stays within [0, 1)', () => {
    const rng = mulberry32(99)
    for (let i = 0; i < 500; i++) {
      const value = rng()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('initialRadius', () => {
  it('scales with the target distance', () => {
    expect(initialRadius(10000, 'loop')).toBeCloseTo(2 * initialRadius(5000, 'loop'), 6)
  })

  it('undershoots the ideal circle so refinement grows into the target', () => {
    const target = 8000
    const idealCircle = target / (2 * Math.PI)
    expect(initialRadius(target, 'loop')).toBeLessThan(idealCircle)
  })

  it('uses roughly half the distance for an out-and-back', () => {
    expect(initialRadius(8000, 'out-and-back')).toBeCloseTo(3000, 0)
  })
})

describe('buildWaypoints', () => {
  it('opens and closes a loop at the start point', () => {
    const waypoints = buildWaypoints(ORIGIN, 800, 45, 'loop')
    expect(waypoints[0]).toEqual(ORIGIN)
    expect(waypoints[waypoints.length - 1]).toEqual(ORIGIN)
    expect(waypoints.length).toBeGreaterThan(3)
  })

  it('spreads loop waypoints away from the start', () => {
    const waypoints = buildWaypoints(ORIGIN, 900, 0, 'loop')
    for (const wp of waypoints.slice(1, -1)) {
      expect(haversine(ORIGIN, wp)).toBeGreaterThan(100)
    }
  })

  it('sends an out-and-back one way and back again', () => {
    const waypoints = buildWaypoints(ORIGIN, 2000, 90, 'out-and-back')
    expect(waypoints).toHaveLength(4)
    expect(waypoints[0]).toEqual(ORIGIN)
    expect(waypoints[3]).toEqual(ORIGIN)
    expect(haversine(ORIGIN, waypoints[2])).toBeCloseTo(2000, 0)
    expect(toXY(waypoints[2]).x).toBeGreaterThan(0) // bearing 90 is east
  })

  it('changes shape when jitter is applied', () => {
    const rng = mulberry32(3)
    const plain = buildWaypoints(ORIGIN, 900, 0, 'loop')
    const jittered = buildWaypoints(ORIGIN, 900, 0, 'loop', (m) => (rng() * 2 - 1) * m)
    expect(jittered).not.toEqual(plain)
  })
})

describe('scoreRoute', () => {
  const criteria = criteriaFor({ targetDistance: 8000, distanceTolerance: 0.1, maxGain: 150 })

  it('accepts a route inside both constraints', () => {
    expect(scoreRoute(8100, 120, criteria).meetsCriteria).toBe(true)
  })

  it('rejects a route that is too long', () => {
    expect(scoreRoute(9500, 100, criteria).meetsCriteria).toBe(false)
  })

  it('rejects a route that climbs too much', () => {
    expect(scoreRoute(8000, 400, criteria).meetsCriteria).toBe(false)
  })

  it('ignores climbing when no limit is set', () => {
    const noLimit = criteriaFor({ ...criteria, maxGain: null })
    expect(scoreRoute(8000, 2000, noLimit).meetsCriteria).toBe(true)
  })

  it('ranks a closer match ahead of a looser one', () => {
    expect(scoreRoute(8050, 100, criteria).score).toBeLessThan(scoreRoute(8600, 100, criteria).score)
  })
})

describe('isDuplicate', () => {
  const routeAt = (path: LatLng[], distance: number) =>
    ({ path, distance, profile: { gain: 0 } } as unknown as RouteResult)

  it('flags two routes over the same ground at the same length', () => {
    const path = [ORIGIN, { lat: 42.37, lng: -71.05 }]
    expect(isDuplicate(routeAt(path, 8000), routeAt(path, 8100))).toBe(true)
  })

  it('keeps routes that head in opposite directions', () => {
    const east = [ORIGIN, { lat: 42.36, lng: -71.0 }]
    const west = [ORIGIN, { lat: 42.36, lng: -71.12 }]
    expect(isDuplicate(routeAt(east, 8000), routeAt(west, 8000))).toBe(false)
  })

  it('keeps same-area routes of clearly different lengths', () => {
    const path = [ORIGIN, { lat: 42.37, lng: -71.05 }]
    expect(isDuplicate(routeAt(path, 5000), routeAt(path, 9000))).toBe(false)
  })
})

describe('compassLabel', () => {
  it('names the cardinals', () => {
    expect(compassLabel(0)).toBe('N')
    expect(compassLabel(90)).toBe('E')
    expect(compassLabel(180)).toBe('S')
    expect(compassLabel(270)).toBe('W')
  })

  it('wraps past a full turn', () => {
    expect(compassLabel(360)).toBe('N')
    expect(compassLabel(-90)).toBe('W')
  })
})

describe('findRoutes', () => {
  it('returns loops that hit the requested distance', async () => {
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null, results: 4 })
    const routes = await findRoutes({ ...world(), criteria })

    expect(routes.length).toBeGreaterThan(0)
    expect(routes.length).toBeLessThanOrEqual(4)
    for (const route of routes) {
      expect(route.distanceError).toBeLessThanOrEqual(criteria.distanceTolerance)
    }
  })

  it('honours a different target distance', async () => {
    const criteria = criteriaFor({ targetDistance: milesToMeters(10), maxGain: null, results: 3 })
    const routes = await findRoutes({ ...world(), criteria })

    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route.distance).toBeGreaterThan(milesToMeters(9))
      expect(route.distance).toBeLessThan(milesToMeters(11))
    }
  })

  it('starts and finishes each loop at the runner', async () => {
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null })
    const routes = await findRoutes({ ...world(), criteria })

    for (const route of routes) {
      // Within one grid block of home at both ends.
      expect(haversine(ORIGIN, route.path[0])).toBeLessThan(200)
      expect(haversine(ORIGIN, route.path[route.path.length - 1])).toBeLessThan(200)
    }
  })

  it('keeps routes under the elevation cap on the flat side of town', async () => {
    const criteria = criteriaFor({
      targetDistance: milesToMeters(5),
      maxGain: feetToMeters(500),
      candidates: 10,
      results: 3,
    })
    const routes = await findRoutes({ ...world(), criteria })

    expect(routes.length).toBeGreaterThan(0)
    expect(routes[0].meetsCriteria).toBe(true)
    for (const route of routes.filter((r) => r.meetsCriteria)) {
      expect(route.profile.gain).toBeLessThanOrEqual(feetToMeters(500))
      // Terrain only climbs east of the origin, so a low-gain loop must sit west.
      const easternmost = Math.max(...route.path.map((p) => toXY(p).x))
      expect(easternmost).toBeLessThan(2500)
    }
  })

  it('surfaces the closest matches first when nothing satisfies the cap', async () => {
    // Start in the hills east of the origin, where every loop must climb.
    const criteria = criteriaFor({
      start: toLatLng({ x: 3000, y: 0 }),
      targetDistance: milesToMeters(5),
      maxGain: 1, // unreachable on this terrain
      results: 3,
    })
    const routes = await findRoutes({ ...world(), criteria })

    expect(routes.length).toBeGreaterThan(0)
    expect(routes.every((r) => !r.meetsCriteria)).toBe(true)
    const scores = routes.map((r) => r.score)
    expect([...scores].sort((a, b) => a - b)).toEqual(scores)
  })

  it('ranks routes that meet every constraint above those that do not', async () => {
    const criteria = criteriaFor({
      targetDistance: milesToMeters(4),
      maxGain: feetToMeters(300),
      candidates: 10,
      results: 6,
    })
    const routes = await findRoutes({ ...world(), criteria })
    const firstFailure = routes.findIndex((r) => !r.meetsCriteria)
    if (firstFailure >= 0) {
      expect(routes.slice(firstFailure).every((r) => !r.meetsCriteria)).toBe(true)
    }
  })

  it('is reproducible for a seed and varied across seeds', async () => {
    const base = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null, seed: 42 })
    const first = await findRoutes({ ...world(), criteria: base })
    const repeat = await findRoutes({ ...world(), criteria: base })
    const reseeded = await findRoutes({ ...world(), criteria: { ...base, seed: 43 } })

    expect(repeat.map((r) => r.distance)).toEqual(first.map((r) => r.distance))
    expect(reseeded.map((r) => r.distance)).not.toEqual(first.map((r) => r.distance))
  })

  it('returns distinct routes rather than the same loop repeated', async () => {
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null, candidates: 10, results: 4 })
    const routes = await findRoutes({ ...world(), criteria })

    for (let i = 0; i < routes.length; i++) {
      for (let j = i + 1; j < routes.length; j++) {
        expect(isDuplicate(routes[i], routes[j])).toBe(false)
      }
    }
  })

  it('routes around directions the engine cannot serve', async () => {
    const routing = createGridRouter({ deadZone: { from: 315, to: 45 } }) // north is impassable
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null, candidates: 8 })
    const routes = await findRoutes({ routing, elevation: createTerrainElevation(), criteria })

    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route.distanceError).toBeLessThanOrEqual(criteria.distanceTolerance)
    }
  })

  it('reports progress as candidates complete', async () => {
    const onProgress = vi.fn()
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null, candidates: 6 })
    await findRoutes({ ...world(), criteria, onProgress })

    expect(onProgress).toHaveBeenCalled()
    const last = onProgress.mock.calls[onProgress.mock.calls.length - 1][0]
    expect(last).toEqual({ completed: 6, total: 6 })
  })

  it('stops early when the search is aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null })
    const routes = await findRoutes({ ...world(), criteria, signal: controller.signal })

    expect(routes).toEqual([])
  })

  it('gives up gracefully when routing is entirely unavailable', async () => {
    const routing = { route: () => Promise.reject(new Error('offline')) }
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null })
    const routes = await findRoutes({ routing, elevation: createTerrainElevation(), criteria })

    expect(routes).toEqual([])
  })

  it('drops routes whose elevation lookup fails rather than reporting a false zero', async () => {
    const elevation = { lookup: () => Promise.reject(new Error('elevation down')) }
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: feetToMeters(500) })
    const routes = await findRoutes({ routing: createGridRouter(), elevation, criteria })

    expect(routes).toEqual([])
  })

  it('builds out-and-back routes of the requested length', async () => {
    const criteria = criteriaFor({
      targetDistance: milesToMeters(6),
      maxGain: null,
      shape: 'out-and-back',
      results: 2,
    })
    const routes = await findRoutes({ ...world(), criteria })

    expect(routes.length).toBeGreaterThan(0)
    for (const route of routes) {
      expect(route.distanceError).toBeLessThanOrEqual(criteria.distanceTolerance)
    }
  })
})

describe('U-turn handling', () => {
  it('forbids doubling back when building a loop', async () => {
    const seen: Array<boolean | undefined> = []
    const routing = createGridRouter({ onRoute: (_, options) => seen.push(options?.allowUTurns) })
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null, shape: 'loop' })
    await findRoutes({ routing, elevation: createTerrainElevation(), criteria })

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((allowed) => allowed === false)).toBe(true)
  })

  it('allows doubling back for an out-and-back', async () => {
    const seen: Array<boolean | undefined> = []
    const routing = createGridRouter({ onRoute: (_, options) => seen.push(options?.allowUTurns) })
    const criteria = criteriaFor({ targetDistance: milesToMeters(5), maxGain: null, shape: 'out-and-back' })
    await findRoutes({ routing, elevation: createTerrainElevation(), criteria })

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((allowed) => allowed === true)).toBe(true)
  })
})
