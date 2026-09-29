import { describe, expect, it } from 'vitest'
import {
  elapsedSeconds,
  isPaused,
  movingSeconds,
  normaliseClock,
  pauseClock,
  resumeClock,
  startClock,
} from './runClock'

describe('run clock', () => {
  it('counts running time', () => {
    expect(movingSeconds(startClock(0), 90_000)).toBe(90)
  })

  it('stops while paused and banks the pause on resume', () => {
    let clock = startClock(0)
    clock = pauseClock(clock, 60_000)
    expect(isPaused(clock)).toBe(true)
    expect(movingSeconds(clock, 100_000)).toBe(60)
    clock = resumeClock(clock, 100_000)
    expect(isPaused(clock)).toBe(false)
    expect(movingSeconds(clock, 130_000)).toBe(90)
    expect(elapsedSeconds(clock, 130_000)).toBe(130)
  })

  it('ignores a second pause or a resume while running', () => {
    const paused = pauseClock(startClock(0), 10_000)
    expect(pauseClock(paused, 20_000)).toBe(paused)
    const running = startClock(0)
    expect(resumeClock(running, 5_000)).toBe(running)
  })

  it('never reports negative time', () => {
    expect(movingSeconds(startClock(5_000), 1_000)).toBe(0)
  })

  it('repairs a clock saved by an older version', () => {
    expect(normaliseClock(undefined, 42)).toEqual({ startedAt: 42, pausedMs: 0, pausedAt: null })
    expect(normaliseClock({ startedAt: 7, pausedMs: -3 }, 42)).toEqual({ startedAt: 7, pausedMs: 0, pausedAt: null })
  })
})
