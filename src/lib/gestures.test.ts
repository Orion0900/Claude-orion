import { describe, expect, it } from 'vitest'
import { createDoubleTapDetector } from './gestures'

describe('createDoubleTapDetector', () => {
  it('does not fire on a single tap', () => {
    expect(createDoubleTapDetector().tap(10, 10, 0)).toBe(false)
  })

  it('fires on two quick taps in the same place', () => {
    const detector = createDoubleTapDetector()
    detector.tap(10, 10, 0)
    expect(detector.tap(12, 11, 150)).toBe(true)
  })

  it('ignores two taps too far apart in time', () => {
    const detector = createDoubleTapDetector({ maxDelayMs: 320 })
    detector.tap(10, 10, 0)
    expect(detector.tap(10, 10, 500)).toBe(false)
  })

  it('ignores two taps too far apart on screen', () => {
    const detector = createDoubleTapDetector({ maxDistancePx: 36 })
    detector.tap(10, 10, 0)
    expect(detector.tap(200, 200, 100)).toBe(false)
  })

  it('starts a fresh pair after firing, so a third tap does not re-fire', () => {
    const detector = createDoubleTapDetector()
    detector.tap(10, 10, 0)
    expect(detector.tap(10, 10, 100)).toBe(true)
    expect(detector.tap(10, 10, 200)).toBe(false)
  })

  it('treats a tap that missed as the start of the next pair', () => {
    const detector = createDoubleTapDetector({ maxDelayMs: 320 })
    detector.tap(10, 10, 0)
    detector.tap(10, 10, 900) // too slow, becomes the new first tap
    expect(detector.tap(10, 10, 1000)).toBe(true)
  })

  it('can be reset, so an interrupted gesture is forgotten', () => {
    const detector = createDoubleTapDetector()
    detector.tap(10, 10, 0)
    detector.reset()
    expect(detector.tap(10, 10, 100)).toBe(false)
  })

  it('respects custom thresholds', () => {
    const generous = createDoubleTapDetector({ maxDelayMs: 800, maxDistancePx: 100 })
    generous.tap(0, 0, 0)
    expect(generous.tap(80, 0, 700)).toBe(true)
  })
})
