import { describe, expect, it } from 'vitest'
import { ACTIVE_RUN_MAX_AGE_MS, createActiveRunStore, discardActiveRun } from './activeRun'
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

  it('keeps the stopwatch, pause and all', () => {
    const storage = memoryStorage()
    const store = createActiveRunStore(storage)
    const begun = store.begin(route, 1000)
    store.update({ clock: { startedAt: 1000, pausedMs: 5000, pausedAt: 9000 } }, 9000)
    const resumed = createActiveRunStore(storage).read(9500)
    expect(resumed?.runId).toBe(begun.runId)
    expect(resumed?.clock).toEqual({ startedAt: 1000, pausedMs: 5000, pausedAt: 9000 })
  })

  it('picks up a run saved before pauses existed', () => {
    const storage = memoryStorage()
    storage.setItem(
      'loopmaker.activeRun.v1',
      JSON.stringify({ version: 1, route, direction: 'forward', directionSettled: false, startedAt: 500, distanceAlong: 10, segment: 1, updatedAt: 600 }),
    )
    const run = createActiveRunStore(storage).read(700)
    expect(run?.clock).toEqual({ startedAt: 500, pausedMs: 0, pausedAt: null })
    expect(run?.runId).toBe('run-500')
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

  it('refuses a route whose geometry or steps are damaged', () => {
    const storage = memoryStorage()
    const base = { version: 1, direction: 'forward', directionSettled: false, startedAt: 1, distanceAlong: 0, segment: 0, updatedAt: 1 }
    storage.setItem('loopmaker.activeRun.v1', JSON.stringify({ ...base, route: { ...route, path: [{ lat: 1 }, { lat: 2, lng: 2 }] } }))
    expect(createActiveRunStore(storage).read(2)).toBeNull()
    storage.setItem('loopmaker.activeRun.v1', JSON.stringify({ ...base, route: { ...route, steps: [null] } }))
    expect(createActiveRunStore(storage).read(2)).toBeNull()
    storage.setItem('loopmaker.activeRun.v1', JSON.stringify({ ...base, route: { ...route, profile: null } }))
    expect(createActiveRunStore(storage).read(2)).toBeNull()
  })

  it('can be discarded from outside, for the crash screen', () => {
    const storage = memoryStorage()
    createActiveRunStore(storage).begin(route)
    discardActiveRun(storage)
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
