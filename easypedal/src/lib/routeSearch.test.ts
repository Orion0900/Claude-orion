import { describe, expect, it, vi } from 'vitest'
import {
  assignHighlights,
  costingProfiles,
  DEFAULT_CRITERIA,
  findRoutes,
  isDuplicate,
  NoRouteError,
  scoreRoute,
  viaLabel,
  type RouteResult,
  type SearchOptions,
} from './routeSearch'
import { breakdownEdges } from './bikeway'
import { pathLength } from './geo'
import {
  createFakeEngine,
  createFakeWays,
  createTerrainElevation,
  FROM,
  geometryFor,
  TO,
  WAYS,
} from './__fixtures__/world'

function outcome(overrides: Partial<SearchOptions> = {}, priority: 'lanes' | 'hills' = 'lanes') {
  return findRoutes({
    routing: createFakeEngine(),
    ways: createFakeWays(),
    elevation: createTerrainElevation(),
    criteria: { ...DEFAULT_CRITERIA, from: FROM, to: TO, priority },
    elevationSamples: 40,
    ...overrides,
  })
}

/** Most tests only care about what came back, not why it didn't. */
async function search(overrides: Partial<SearchOptions> = {}, priority: 'lanes' | 'hills' = 'lanes') {
  return (await outcome(overrides, priority)).routes
}

describe('costingProfiles', () => {
  it('leans on cycleways when lanes come first', () => {
    const [first] = costingProfiles('lanes')
    expect(first.useRoads).toBeLessThanOrEqual(0.1)
  })

  it('leans away from hills when hills come first', () => {
    const [first] = costingProfiles('hills')
    expect(first.useHills).toBeLessThanOrEqual(0.1)
  })

  it('always gives the other half of easy a turn', () => {
    expect(costingProfiles('lanes').some((p) => p.useHills <= 0.1)).toBe(true)
    expect(costingProfiles('hills').some((p) => p.useRoads <= 0.1)).toBe(true)
  })
})

describe('isDuplicate', () => {
  it('recognises the same way twice', () => {
    expect(isDuplicate(geometryFor('greenway'), geometryFor('greenway'))).toBe(true)
  })

  it('tells different ways apart', () => {
    expect(isDuplicate(geometryFor('greenway'), geometryFor('backstreets'))).toBe(false)
    expect(isDuplicate(geometryFor('mainroad'), geometryFor('highway'))).toBe(false)
  })
})

describe('scoreRoute', () => {
  const context = { shortest: 4000, mostGain: 100 }
  const lanes = breakdownEdges([
    { path: [], length: 1000, use: 'cycleway', roadClass: 'service_other', cycleLane: 'none' },
  ])
  const busy = breakdownEdges([
    { path: [], length: 1000, use: 'road', roadClass: 'primary', cycleLane: 'none' },
  ])

  it('prefers lanes over flatness when lanes come first', () => {
    const laned = scoreRoute({ distance: 4400, gain: 60, ways: lanes }, context, 'lanes')
    const flat = scoreRoute({ distance: 4000, gain: 10, ways: busy }, context, 'lanes')
    expect(laned).toBeLessThan(flat)
  })

  it('prefers flatness over lanes when hills come first', () => {
    const laned = scoreRoute({ distance: 4400, gain: 90, ways: lanes }, context, 'hills')
    const flat = scoreRoute({ distance: 4000, gain: 10, ways: busy }, context, 'hills')
    expect(flat).toBeLessThan(laned)
  })

  it('charges for a long detour', () => {
    const direct = scoreRoute({ distance: 4000, gain: 50, ways: lanes }, context, 'lanes')
    const detour = scoreRoute({ distance: 7000, gain: 50, ways: lanes }, context, 'lanes')
    expect(detour).toBeGreaterThan(direct)
  })

  it('gives quiet streets partial credit', () => {
    const quiet = breakdownEdges([
      { path: [], length: 1000, use: 'road', roadClass: 'residential', cycleLane: 'none' },
    ])
    const onQuiet = scoreRoute({ distance: 4000, gain: 50, ways: quiet }, context, 'lanes')
    const onBusy = scoreRoute({ distance: 4000, gain: 50, ways: busy }, context, 'lanes')
    const onLanes = scoreRoute({ distance: 4000, gain: 50, ways: lanes }, context, 'lanes')
    expect(onQuiet).toBeLessThan(onBusy)
    expect(onQuiet).toBeGreaterThan(onLanes)
  })
})

describe('findRoutes', () => {
  it('never offers a route along a highway', async () => {
    const routes = await search({
      routing: createFakeEngine({ answer: () => ['highway', 'backstreets'] }),
    })
    expect(routes.length).toBeGreaterThan(0)
    expect(routes.every((route) => route.ways?.meters.unsafe === 0)).toBe(true)
  })

  it('returns nothing rather than something unsafe, and says why', async () => {
    const result = await outcome({ routing: createFakeEngine({ answer: () => ['highway'] }) })
    expect(result.routes).toEqual([])
    expect(result.failure).toBe('unsafe-only')
  })

  it('puts the cycleway first when lanes are the priority', async () => {
    const routes = await search({}, 'lanes')
    expect(routes[0].bikewayShare).toBeCloseTo(1, 2)
    expect(routes[0].highlights).toContain('recommended')
    expect(routes[0].highlights).toContain('most-lanes')
  })

  it('puts the flat way first when hills are the priority', async () => {
    const routes = await search({}, 'hills')
    const gains = routes.map((route) => route.profile.gain)
    expect(routes[0].profile.gain).toBe(Math.min(...gains))
    expect(routes[0].highlights).toContain('flattest')
  })

  it('tries every costing profile and reports progress', async () => {
    const seen: number[] = []
    const progress = vi.fn()
    await search({
      routing: createFakeEngine({ onRoute: (profile) => seen.push(profile.useRoads) }),
      onProgress: progress,
    })
    expect(seen).toHaveLength(costingProfiles('lanes').length)
    const last = progress.mock.calls[progress.mock.calls.length - 1][0]
    expect(last.completed).toBe(last.total)
  })

  it('drops the same route returned by two profiles', async () => {
    const routes = await search({ routing: createFakeEngine({ answer: () => ['backstreets'] }) })
    expect(routes).toHaveLength(1)
  })

  it('still offers routes when the road lookup fails', async () => {
    const routes = await search({ ways: createFakeWays({ fail: true }) })
    expect(routes.length).toBeGreaterThan(0)
    expect(routes[0].ways).toBeNull()
    expect(routes[0].bikewayShare).toBe(0)
  })

  it('survives one profile failing to route', async () => {
    let calls = 0
    const engine = createFakeEngine()
    const flaky = {
      route: async (...args: Parameters<typeof engine.route>) => {
        calls++
        if (calls === 1) throw new Error('no route')
        return engine.route(...args)
      },
    }
    const routes = await search({ routing: flaky })
    expect(routes.length).toBeGreaterThan(0)
  })

  it('blames the terrain service, not the rider, when elevation fails', async () => {
    const result = await outcome({
      elevation: { lookup: async () => { throw new Error('offline') } },
    })
    expect(result.routes).toEqual([])
    // Moving a pin would never help here, so it must not read like it would.
    expect(result.failure).toBe('elevation-unavailable')
  })

  it('reports an unreachable engine as unreachable', async () => {
    const result = await outcome({
      routing: { route: async () => { throw new Error('connection refused') } },
    })
    expect(result.routes).toEqual([])
    expect(result.failure).toBe('routing-unavailable')
  })

  it('reports an engine that simply knows no way through', async () => {
    const result = await outcome({ routing: { route: async () => [] } })
    expect(result.routes).toEqual([])
    expect(result.failure).toBe('no-route')
  })

  it('tells an engine that refuses apart from an engine that is down', async () => {
    const refused = await outcome({
      routing: { route: async () => { throw new NoRouteError('no path could be found') } },
    })
    expect(refused.failure).toBe('no-route')
  })

  it('flags routes whose road types could not be looked up', async () => {
    const result = await outcome({ ways: createFakeWays({ fail: true }) })
    expect(result.routes.length).toBeGreaterThan(0)
    expect(result.failure).toBeNull()
    expect(result.waysUnavailable).toBe(true)
  })

  it('does not flag road types when they were looked up fine', async () => {
    const result = await outcome()
    expect(result.waysUnavailable).toBe(false)
  })

  it('returns nothing once aborted, and blames nobody', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await outcome({ signal: controller.signal })
    expect(result.routes).toEqual([])
    expect(result.failure).toBeNull()
  })

  it('places turn instructions along the route', async () => {
    const path = WAYS.backstreets
    const routes = await search({
      routing: {
        route: async () => [
          {
            path,
            distance: pathLength(path),
            steps: [
              { type: 'depart', location: path[0], name: 'Home Street', length: 300 },
              { type: 'turn', modifier: 'right', location: path[Math.floor(path.length / 2)], name: 'Hill Road', length: 900 },
              { type: 'arrive', location: path[path.length - 1] },
            ],
          },
        ],
      },
    })
    expect(routes[0].steps).toHaveLength(3)
    expect(routes[0].steps[1].distanceAlong).toBeGreaterThan(routes[0].steps[0].distanceAlong)
    expect(viaLabel(routes[0].steps)).toBe('via Hill Road')
  })

  it('returns at most the number of routes asked for', async () => {
    const routes = await search({
      criteria: { ...DEFAULT_CRITERIA, from: FROM, to: TO, priority: 'lanes', results: 1 },
    })
    expect(routes).toHaveLength(1)
  })
})

describe('assignHighlights', () => {
  const base = (over: Partial<RouteResult>): RouteResult => ({
    id: 'x',
    path: WAYS.greenway,
    distance: 5000,
    profile: { distances: [], elevations: [], gain: 50, loss: 50, minElevation: 0, maxElevation: 0 },
    turns: 0,
    steps: [],
    ways: null,
    bikewayShare: 0,
    highlights: [],
    score: 0,
    ...over,
  })

  it('labels the first route recommended and the rest by what they are best at', () => {
    const [a, b, c] = assignHighlights([
      base({ id: 'a', bikewayShare: 0.9 }),
      base({ id: 'b', distance: 4000 }),
      base({ id: 'c', profile: { distances: [], elevations: [], gain: 5, loss: 5, minElevation: 0, maxElevation: 0 } }),
    ])
    expect(a.highlights).toEqual(['recommended', 'most-lanes'])
    expect(b.highlights).toEqual(['shortest'])
    expect(c.highlights).toEqual(['flattest'])
  })

  it('does not claim most lanes when nobody has any', () => {
    const [only] = assignHighlights([base({})])
    expect(only.highlights).not.toContain('most-lanes')
  })
})

describe('viaLabel', () => {
  it('names the longest named step', () => {
    expect(viaLabel([{ name: 'A', length: 10 }, { name: 'B', length: 500 }, { length: 900 }])).toBe('via B')
  })

  it('has nothing to say without names', () => {
    expect(viaLabel([{ length: 900 }])).toBeNull()
  })
})
