import { describe, expect, it } from 'vitest'
import { destination, type LatLng } from './geo'
import { createMotionDetector, RESUME_METERS, STOP_WINDOW_MS } from './motion'

const here: LatLng = { lat: 40.7, lng: -74 }

/** A stationary phone's fixes: a few metres of wander around one spot. */
const wobble = (i: number) => destination(here, (i * 97) % 360, 3 + (i % 3))

describe('createMotionDetector', () => {
  it('stays moving while the runner covers ground', () => {
    const detector = createMotionDetector()
    for (let s = 0; s < 60; s++) {
      expect(detector.update(destination(here, 90, s * 3), s * 1000)).toBe('moving')
    }
  })

  it('notices a stop once the runner has stayed put for the window', () => {
    const detector = createMotionDetector()
    let state = 'moving'
    let stoppedAfter = -1
    for (let s = 0; s <= 20 && state === 'moving'; s++) {
      state = detector.update(wobble(s), s * 1000)
      if (state === 'stopped') stoppedAfter = s * 1000
    }
    expect(state).toBe('stopped')
    expect(stoppedAfter).toBeGreaterThanOrEqual(STOP_WINDOW_MS)
    expect(stoppedAfter).toBeLessThanOrEqual(STOP_WINDOW_MS + 1000)
  })

  it('does not call a slow jog a stop', () => {
    const detector = createMotionDetector()
    // 2 m/s — a gentle shuffle, still moving.
    for (let s = 0; s < 30; s++) expect(detector.update(destination(here, 0, s * 2), s * 1000)).toBe('moving')
  })

  it('does not stop on GPS wander alone within the window', () => {
    const detector = createMotionDetector()
    for (let s = 0; s < 7; s++) expect(detector.update(wobble(s), s * 1000)).toBe('moving')
  })

  it('starts again once the runner leaves the spot', () => {
    const detector = createMotionDetector()
    for (let s = 0; s <= 10; s++) detector.update(wobble(s), s * 1000)
    expect(detector.update(wobble(11), 11_000)).toBe('stopped')
    expect(detector.update(destination(here, 0, RESUME_METERS - 6), 12_000)).toBe('stopped')
    expect(detector.update(destination(here, 0, RESUME_METERS + 6), 13_000)).toBe('stopped')
    expect(detector.update(destination(here, 0, RESUME_METERS + 12), 14_000)).toBe('moving')
  })

  it('stays paused through a single jumpy fix', () => {
    const detector = createMotionDetector()
    for (let s = 0; s <= 10; s++) detector.update(wobble(s), s * 1000)
    expect(detector.update(destination(here, 45, 40), 11_000)).toBe('stopped')
    expect(detector.update(wobble(12), 12_000)).toBe('stopped')
    expect(detector.update(wobble(13), 13_000)).toBe('stopped')
  })

  it('forgets everything on reset', () => {
    const detector = createMotionDetector()
    for (let s = 0; s <= 10; s++) detector.update(wobble(s), s * 1000)
    detector.reset()
    expect(detector.update(wobble(12), 12_000)).toBe('moving')
  })
})
