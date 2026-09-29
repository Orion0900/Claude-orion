import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RETRY_AFTER_MS, STALE_AFTER_MS, watchGps, type GpsStatus } from './gpsWatch'

function fakeGeolocation() {
  let next = 1
  const watches = new Map<number, { ok: PositionCallback; fail: PositionErrorCallback }>()
  return {
    watches,
    watchPosition: vi.fn((ok: PositionCallback, fail?: PositionErrorCallback | null, _options?: PositionOptions) => {
      const id = next++
      watches.set(id, { ok, fail: fail ?? (() => undefined) })
      return id
    }),
    clearWatch: vi.fn((id: number) => {
      watches.delete(id)
    }),
    /** Deliver a fix to every live watch. */
    fix() {
      for (const { ok } of watches.values()) ok({ coords: {}, timestamp: Date.now() } as GeolocationPosition)
    },
    fail(code: number) {
      for (const { fail } of watches.values()) fail({ code } as GeolocationPositionError)
    },
  }
}

function fakeDocument() {
  const listeners = new Set<() => void>()
  return {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    fire: () => listeners.forEach((fn) => fn()),
    listeners,
  }
}

describe('watchGps', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup() {
    const geolocation = fakeGeolocation()
    const doc = fakeDocument()
    const statuses: GpsStatus[] = []
    const fixes: GeolocationPosition[] = []
    const stop = watchGps(
      { onFix: (f) => fixes.push(f), onStatus: (s) => statuses.push(s) },
      { geolocation, document: doc as never, now: () => Date.now() },
    )
    return { geolocation, doc, statuses, fixes, stop }
  }

  it('never asks the browser for a timeout', () => {
    const { geolocation } = setup()
    const options = geolocation.watchPosition.mock.calls[0][2]
    expect(options?.timeout).toBeUndefined()
    expect(options?.maximumAge).toBe(0)
  })

  it('passes fixes through and reports a good signal once', () => {
    const { geolocation, statuses, fixes } = setup()
    geolocation.fix()
    geolocation.fix()
    expect(fixes).toHaveLength(2)
    expect(statuses).toEqual(['ok'])
  })

  it('notices a stalled watch and starts a fresh one', () => {
    const { geolocation, statuses } = setup()
    geolocation.fix()
    vi.advanceTimersByTime(STALE_AFTER_MS + 3_000)
    expect(statuses).toEqual(['ok', 'searching'])
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2)
    expect(geolocation.watches.size).toBe(1)
    geolocation.fix()
    expect(statuses).toEqual(['ok', 'searching', 'ok'])
  })

  it('does not restart while fixes keep coming', () => {
    const { geolocation } = setup()
    for (let s = 0; s < 60; s++) {
      geolocation.fix()
      vi.advanceTimersByTime(1000)
    }
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
  })

  it('retries after a recoverable error instead of going quiet', () => {
    const { geolocation, statuses } = setup()
    geolocation.fail(3) // TIMEOUT
    expect(statuses).toEqual(['searching'])
    vi.advanceTimersByTime(RETRY_AFTER_MS)
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2)
  })

  it('stops for good when permission is refused', () => {
    const { geolocation, statuses } = setup()
    geolocation.fail(1)
    vi.advanceTimersByTime(60_000)
    expect(statuses).toEqual(['denied'])
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
    expect(geolocation.watches.size).toBe(0)
  })

  it('restarts straight away when the app comes back to the front', () => {
    const { geolocation, doc } = setup()
    doc.visibilityState = 'hidden'
    doc.fire()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(1)
    doc.visibilityState = 'visible'
    doc.fire()
    expect(geolocation.watchPosition).toHaveBeenCalledTimes(2)
    expect(geolocation.watches.size).toBe(1)
  })

  it('cleans up everything when stopped', () => {
    const { geolocation, doc, stop, fixes } = setup()
    stop()
    geolocation.fix()
    vi.advanceTimersByTime(60_000)
    expect(fixes).toHaveLength(0)
    expect(geolocation.watches.size).toBe(0)
    expect(doc.listeners.size).toBe(0)
  })

  it('says so when there is no GPS at all', () => {
    const statuses: GpsStatus[] = []
    watchGps({ onFix: () => undefined, onStatus: (s) => statuses.push(s) }, { geolocation: null, document: null, now: Date.now })
    expect(statuses).toEqual(['unsupported'])
  })
})
