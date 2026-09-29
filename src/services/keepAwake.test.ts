import { describe, expect, it, vi } from 'vitest'
import { createKeepAwake, iosVersion, needsVideoFallback } from './keepAwake'

const IOS_17 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1'
const IOS_18_5 =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'

describe('iosVersion', () => {
  it('reads the version from an iPhone user agent', () => {
    expect(iosVersion(IOS_17)).toBeCloseTo(17.04)
    expect(iosVersion(IOS_18_5)).toBeCloseTo(18.05)
    expect(iosVersion(ANDROID)).toBeNull()
  })
})

describe('needsVideoFallback', () => {
  it('uses the video where there is no wake lock at all', () => {
    expect(needsVideoFallback({ userAgent: ANDROID, standalone: false, hasWakeLock: false })).toBe(true)
  })

  it('uses it in home-screen apps on iOS before 18.4, where the API does nothing', () => {
    expect(needsVideoFallback({ userAgent: IOS_17, standalone: true, hasWakeLock: true })).toBe(true)
  })

  it('trusts the API where it works', () => {
    expect(needsVideoFallback({ userAgent: IOS_18_5, standalone: true, hasWakeLock: true })).toBe(false)
    expect(needsVideoFallback({ userAgent: IOS_17, standalone: false, hasWakeLock: true })).toBe(false)
    expect(needsVideoFallback({ userAgent: ANDROID, standalone: true, hasWakeLock: true })).toBe(false)
  })
})

function fakeEnvironment() {
  const listeners = new Map<string, Set<() => void>>()
  const released: Array<() => void> = []
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (type: string, fn: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
  }
  const request = vi.fn(async () => {
    let onRelease: () => void = () => undefined
    const sentinel = {
      release: vi.fn(async () => undefined),
      addEventListener: (_: 'release', fn: () => void) => {
        onRelease = fn
      },
    }
    released.push(() => onRelease())
    return sentinel
  })
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn())
  return { doc, request, fire, released, listeners }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createKeepAwake', () => {
  it('takes the lock back after the page has been hidden', async () => {
    const env = fakeEnvironment()
    const keepAwake = createKeepAwake({
      wakeLock: { request: env.request },
      document: env.doc as never,
      useVideo: false,
    })
    keepAwake.start()
    await flush()
    expect(env.request).toHaveBeenCalledTimes(1)

    // The browser drops it on its own when the page is hidden...
    env.doc.visibilityState = 'hidden'
    env.released[0]()
    env.fire('visibilitychange')
    await flush()
    expect(env.request).toHaveBeenCalledTimes(1)

    // ...and it is asked for again as soon as the runner is back.
    env.doc.visibilityState = 'visible'
    env.fire('visibilitychange')
    await flush()
    expect(env.request).toHaveBeenCalledTimes(2)
  })

  it('does not stack requests while it already holds the lock', async () => {
    const env = fakeEnvironment()
    const keepAwake = createKeepAwake({ wakeLock: { request: env.request }, document: env.doc as never, useVideo: false })
    keepAwake.start()
    await flush()
    env.fire('pointerdown')
    env.fire('pointerdown')
    await flush()
    expect(env.request).toHaveBeenCalledTimes(1)
  })

  it('lets go when the run ends and stops listening', async () => {
    const env = fakeEnvironment()
    const keepAwake = createKeepAwake({ wakeLock: { request: env.request }, document: env.doc as never, useVideo: false })
    keepAwake.start()
    await flush()
    const sentinel = await env.request.mock.results[0].value
    keepAwake.stop()
    expect(sentinel.release).toHaveBeenCalled()
    expect(env.listeners.get('visibilitychange')?.size ?? 0).toBe(0)
    expect(env.listeners.get('pointerdown')?.size ?? 0).toBe(0)
  })

  it('is harmless without a browser', () => {
    const keepAwake = createKeepAwake(null)
    expect(() => {
      keepAwake.start()
      keepAwake.stop()
    }).not.toThrow()
  })
})
