import { describe, expect, it } from 'vitest'
import { ACTIVE_RUN_MAX_AGE_MS, createActiveRunStore } from './activeRun'
import type { RouteResult } from './routeSearch'

function memoryStorage() {
  const data: Record<string, string> = {}
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    removeItem: (k: string) => {
      delete data[k]
    },
    data,
  }
}

const route = {
  id: 'r1',
  path: [
    { lat: 1, lng: 1 },
    { lat: 1.001, lng: 1 },
  ],
  distance: 111,
  profile: { distances: [0, 111], elevations: [0, 0], gain: 0, loss: 0 },
  outboundBearing: 0,
  turns: 0,
  steps: [],
  meetsCriteria: true,
  distanceError: 0,
  score: 1,
} as unknown as RouteResult

describe('createActiveRunStore', () => {
  it('has nothing to resume on a fresh install', () => {
    expect(createActiveRunStore(memoryStorage()).read()).toBeNull()
  })

  it('survives a reload: a new store reads what the old one wrote', () => {
    const storage = memoryStorage()
    const first = createActiveRunStore(storage)
    first.begin(route, 1000)
    first.update({ distanceAlong: 420, segment: 7, direction: 'reverse', directionSettled: true }, 2000)

    const resumed = createActiveRunStore(storage).read(3000)
    expect(resumed?.route.id).toBe('r1')
    expect(resumed?.startedAt).toBe(1000)
    expect(resumed?.distanceAlong).toBe(420)
    expect(resumed?.segment).toBe(7)
    expect(resumed?.direction).toBe('reverse')
    expect(resumed?.directionSettled).toBe(true)
  })

  it('forgets a run once it is ended', () => {
    const storage = memoryStorage()
    const store = createActiveRunStore(storage)
    store.begin(route)
    store.clear()
    expect(createActiveRunStore(storage).read()).toBeNull()
  })

  it('treats a run untouched for hours as abandoned', () => {
    const storage = memoryStorage()
    createActiveRunStore(storage).begin(route, 0)
    expect(createActiveRunStore(storage).read(ACTIVE_RUN_MAX_AGE_MS + 1)).toBeNull()
    // And clears it, so it doesn't come back next time either.
    expect(Object.keys(storage.data)).toHaveLength(0)
  })

  it('ignores anything malformed rather than crashing on it', () => {
    const storage = memoryStorage()
    storage.setItem('loopmaker.activeRun.v1', '{"version":1,"route":{}}')
    expect(createActiveRunStore(storage).read()).toBeNull()
    storage.setItem('loopmaker.activeRun.v1', 'not json')
    expect(createActiveRunStore(storage).read()).toBeNull()
  })

  it('keeps running when storage refuses to write', () => {
    const store = createActiveRunStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    expect(() => store.begin(route)).not.toThrow()
    expect(() => store.update({ distanceAlong: 5 })).not.toThrow()
  })

  it('does nothing when there is no storage at all', () => {
    const store = createActiveRunStore(null)
    store.begin(route)
    expect(store.read()).toBeNull()
  })
})
