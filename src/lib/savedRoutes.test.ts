import { describe, expect, it, vi, afterEach } from 'vitest'
import { destination } from './geo'
import { buildProfile } from './elevation'
import type { RouteResult } from './routeSearch'
import {
  addRoute,
  createLocalStore,
  findSaved,
  isSaved,
  MAX_SAVED,
  removeRoute,
  renameRoute,
  routeSignature,
  StorageFullError,
  suggestName,
  type SavedRoute,
} from './savedRoutes'

const start = { lat: 42.3601, lng: -71.0589 }

function makeRoute(overrides: Partial<RouteResult> = {}): RouteResult {
  const path = Array.from({ length: 20 }, (_, i) => destination(start, 90, i * 100))
  return {
    id: 'r1',
    path,
    distance: 1900,
    profile: buildProfile(path.filter((_, i) => i % 5 === 0), [10, 20, 30, 20]),
    outboundBearing: 90,
    turns: 5,
    steps: [],
    meetsCriteria: true,
    distanceError: 0.01,
    score: 0.02,
    ...overrides,
  }
}

describe('routeSignature', () => {
  it('is the same for the same loop found twice', () => {
    const a = makeRoute({ id: '1-45', score: 0.1 })
    const b = makeRoute({ id: '9-200', score: 0.4 })
    expect(routeSignature(a)).toBe(routeSignature(b))
  })

  it('differs for routes of clearly different length', () => {
    expect(routeSignature(makeRoute())).not.toBe(routeSignature(makeRoute({ distance: 8000 })))
  })

  it('differs for routes covering different ground', () => {
    const elsewhere = makeRoute({
      path: Array.from({ length: 20 }, (_, i) => destination({ lat: 51.5, lng: -0.12 }, 90, i * 100)),
    })
    expect(routeSignature(makeRoute())).not.toBe(routeSignature(elsewhere))
  })

  it('handles an empty route', () => {
    expect(routeSignature({ path: [], distance: 0 })).toBe('empty')
  })
})

describe('addRoute', () => {
  it('saves a route, newest first', () => {
    const first = addRoute([], makeRoute(), 'Morning loop', new Date('2026-09-01T08:00:00Z'))
    const second = addRoute(first, makeRoute({ distance: 8000 }), 'Long one', new Date('2026-09-02T08:00:00Z'))
    expect(second.map((s) => s.name)).toEqual(['Long one', 'Morning loop'])
  })

  it('refuses to save the same loop twice', () => {
    const once = addRoute([], makeRoute({ id: 'a' }), 'Loop')
    const twice = addRoute(once, makeRoute({ id: 'b' }), 'Loop again')
    expect(twice).toHaveLength(1)
    expect(twice).toBe(once)
  })

  it('falls back to a sensible name when given a blank one', () => {
    expect(addRoute([], makeRoute(), '   ')[0].name).toBe('Saved route')
  })

  it('gives every save its own id', () => {
    const one = addRoute([], makeRoute(), 'A')
    const two = addRoute(one, makeRoute({ distance: 5000 }), 'B')
    expect(two[0].id).not.toBe(two[1].id)
  })

  it('stops at the cap rather than filling the browser', () => {
    let routes: SavedRoute[] = []
    for (let i = 0; i < MAX_SAVED; i++) {
      routes = addRoute(routes, makeRoute({ distance: 1000 + i * 100 }), `Route ${i}`)
    }
    expect(routes).toHaveLength(MAX_SAVED)
    expect(() => addRoute(routes, makeRoute({ distance: 99000 }), 'One too many')).toThrow(StorageFullError)
  })

  it('keeps everything needed to run it again offline', () => {
    const saved = addRoute([], makeRoute(), 'Loop')[0]
    expect(saved.route.path.length).toBeGreaterThan(0)
    expect(saved.route.profile.elevations.length).toBeGreaterThan(0)
    expect(saved.route.distance).toBe(1900)
  })
})

describe('isSaved and findSaved', () => {
  const routes = addRoute([], makeRoute(), 'Loop')

  it('recognises the same loop from a later search', () => {
    expect(isSaved(routes, makeRoute({ id: 'different-id' }))).toBe(true)
    expect(findSaved(routes, makeRoute({ id: 'different-id' }))?.name).toBe('Loop')
  })

  it('does not claim an unrelated route is saved', () => {
    expect(isSaved(routes, makeRoute({ distance: 12000 }))).toBe(false)
  })

  it('says nothing is saved when the list is empty', () => {
    expect(isSaved([], makeRoute())).toBe(false)
  })
})

describe('removeRoute and renameRoute', () => {
  const routes = addRoute(addRoute([], makeRoute(), 'A'), makeRoute({ distance: 5000 }), 'B')

  it('removes only the one asked for', () => {
    const left = removeRoute(routes, routes[0].id)
    expect(left).toHaveLength(1)
    expect(left[0].name).toBe('A')
  })

  it('ignores an id that is not there', () => {
    expect(removeRoute(routes, 'nope')).toHaveLength(2)
  })

  it('renames in place', () => {
    expect(renameRoute(routes, routes[0].id, 'Hill repeats')[0].name).toBe('Hill repeats')
  })

  it('refuses a blank rename', () => {
    expect(renameRoute(routes, routes[0].id, '   ')[0].name).toBe('B')
  })
})

describe('suggestName', () => {
  it('pairs the route label with the date', () => {
    expect(suggestName('5.02 mi NE loop', new Date(2026, 8, 8))).toBe('5.02 mi NE loop, 8 Sep')
  })

  it('spells the month the same way whatever the platform locale', () => {
    expect(suggestName('Loop', new Date(2026, 0, 1))).toBe('Loop, 1 Jan')
    expect(suggestName('Loop', new Date(2026, 11, 25))).toBe('Loop, 25 Dec')
  })
})

describe('createLocalStore', () => {
  function stubStorage(initial: Record<string, string> = {}, failWrites = false) {
    const data = { ...initial }
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => data[k] ?? null,
      setItem: (k: string, v: string) => {
        if (failWrites) throw new Error('QuotaExceededError')
        data[k] = v
      },
    })
    return data
  }

  afterEach(() => vi.unstubAllGlobals())

  it('round-trips saved routes', () => {
    stubStorage()
    const store = createLocalStore('test-key')
    const routes = addRoute([], makeRoute(), 'Loop')
    store.write(routes)
    expect(store.read().map((s) => s.name)).toEqual(['Loop'])
  })

  it('starts empty when nothing is stored', () => {
    stubStorage()
    expect(createLocalStore('test-key').read()).toEqual([])
  })

  it('ignores corrupted storage rather than crashing', () => {
    stubStorage({ 'test-key': 'not json at all' })
    expect(createLocalStore('test-key').read()).toEqual([])
  })

  it('drops entries that are not routes', () => {
    stubStorage({ 'test-key': JSON.stringify([{ id: 'x' }, null, 42]) })
    expect(createLocalStore('test-key').read()).toEqual([])
  })

  it('reports a full browser store as such', () => {
    stubStorage({}, true)
    expect(() => createLocalStore('test-key').write([])).toThrow(StorageFullError)
  })

  it('survives storage being unavailable altogether', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(createLocalStore('test-key').read()).toEqual([])
  })
})
