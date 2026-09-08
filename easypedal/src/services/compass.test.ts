import { afterEach, describe, expect, it, vi } from 'vitest'
import { isCompassSupported, requestCompassPermission, watchCompass } from './compass'

function stubWindow(options: {
  requestPermission?: () => Promise<'granted' | 'denied'>
  hasOrientationEvent?: boolean
  screenAngle?: number
} = {}) {
  const listeners = new Map<string, ((event: unknown) => void)[]>()
  const frames: (() => void)[] = []

  const win = {
    DeviceOrientationEvent: options.hasOrientationEvent === false
      ? undefined
      : (options.requestPermission ? { requestPermission: options.requestPermission } : {}),
    screen: { orientation: { angle: options.screenAngle ?? 0 } },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn))
    },
    requestAnimationFrame: (fn: () => void) => {
      frames.push(fn)
      return frames.length
    },
    cancelAnimationFrame: vi.fn(),
  }
  vi.stubGlobal('window', win)

  return {
    fire(type: string, event: unknown) {
      for (const fn of listeners.get(type) ?? []) fn(event)
    },
    flushFrames() {
      const pending = frames.splice(0, frames.length)
      for (const fn of pending) fn()
    },
    listenerCount: () => [...listeners.values()].reduce((n, fns) => n + fns.length, 0),
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('isCompassSupported', () => {
  it('is true where the browser exposes orientation events', () => {
    stubWindow()
    expect(isCompassSupported()).toBe(true)
  })

  it('is false where it does not', () => {
    stubWindow({ hasOrientationEvent: false })
    expect(isCompassSupported()).toBe(false)
  })
})

describe('requestCompassPermission', () => {
  it('passes on what iOS answered', async () => {
    stubWindow({ requestPermission: async () => 'granted' })
    await expect(requestCompassPermission()).resolves.toBe('granted')
  })

  it('reports a refusal', async () => {
    stubWindow({ requestPermission: async () => 'denied' })
    await expect(requestCompassPermission()).resolves.toBe('denied')
  })

  it('treats a browser with no gate as already granted', async () => {
    stubWindow()
    await expect(requestCompassPermission()).resolves.toBe('granted')
  })

  it('treats a throwing request as a refusal, not a crash', async () => {
    stubWindow({
      requestPermission: async () => {
        throw new Error('must be called from a user gesture')
      },
    })
    await expect(requestCompassPermission()).resolves.toBe('denied')
  })

  it('reports no compass at all', async () => {
    stubWindow({ hasOrientationEvent: false })
    await expect(requestCompassPermission()).resolves.toBe('unsupported')
  })
})

describe('watchCompass', () => {
  it('reports Safari’s compass heading', () => {
    const harness = stubWindow()
    const onHeading = vi.fn()
    watchCompass({ onHeading })

    harness.fire('deviceorientation', { webkitCompassHeading: 137 })
    harness.flushFrames()
    expect(onHeading).toHaveBeenCalledWith(137)
  })

  it('converts alpha, correcting for a sideways screen', () => {
    const harness = stubWindow({ screenAngle: 90 })
    const onHeading = vi.fn()
    watchCompass({ onHeading })

    harness.fire('deviceorientationabsolute', { alpha: 0, absolute: true })
    harness.flushFrames()
    expect(onHeading).toHaveBeenCalledWith(90)
  })

  it('delivers only the newest reading per frame', () => {
    const harness = stubWindow()
    const onHeading = vi.fn()
    watchCompass({ onHeading })

    // A magnetometer fires far faster than the screen can redraw.
    harness.fire('deviceorientation', { webkitCompassHeading: 10 })
    harness.fire('deviceorientation', { webkitCompassHeading: 20 })
    harness.fire('deviceorientation', { webkitCompassHeading: 30 })
    harness.flushFrames()

    expect(onHeading).toHaveBeenCalledTimes(1)
    expect(onHeading).toHaveBeenCalledWith(30)
  })

  it('ignores readings with no usable heading', () => {
    const harness = stubWindow()
    const onHeading = vi.fn()
    watchCompass({ onHeading })

    harness.fire('deviceorientation', { alpha: null })
    harness.flushFrames()
    expect(onHeading).not.toHaveBeenCalled()
  })

  it('stops listening when released', () => {
    const harness = stubWindow()
    const onHeading = vi.fn()
    const stop = watchCompass({ onHeading })
    expect(harness.listenerCount()).toBe(2)

    stop()
    expect(harness.listenerCount()).toBe(0)
    harness.fire('deviceorientation', { webkitCompassHeading: 90 })
    harness.flushFrames()
    expect(onHeading).not.toHaveBeenCalled()
  })
})
