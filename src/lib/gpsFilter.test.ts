import { describe, expect, it } from 'vitest'
import { destination } from './geo'
import {
  createFixFilter,
  MAX_ACCURACY_METERS,
  MAX_REJECT_STREAK,
  MIN_INTERVAL_FOR_SPEED_MS,
  type Fix,
} from './gpsFilter'

const home = { lat: 42.3601, lng: -71.0589 }
const fix = (overrides: Partial<Fix> = {}): Fix => ({
  position: home,
  accuracy: 8,
  timestamp: 0,
  ...overrides,
})

describe('createFixFilter', () => {
  it('accepts an ordinary first fix', () => {
    expect(createFixFilter().accept(fix()).accepted).toBe(true)
  })

  it('accepts a runner moving at a runner’s pace', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))
    // 4 m/s is a brisk but entirely ordinary running speed.
    const later = fix({ position: destination(home, 90, 4), timestamp: 1000 })
    expect(filter.accept(later).accepted).toBe(true)
  })

  it('refuses a fix the receiver admits it is unsure of', () => {
    const filter = createFixFilter()
    filter.accept(fix())
    const vague = fix({ accuracy: MAX_ACCURACY_METERS + 20, timestamp: 1000 })
    expect(filter.accept(vague)).toEqual({ accepted: false, reason: 'inaccurate' })
  })

  it('refuses a jump no runner could make', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))
    // Two blocks in a second, which is what "wigging out" looks like.
    expect(MIN_INTERVAL_FOR_SPEED_MS).toBeLessThan(1000)
    const teleport = fix({ position: destination(home, 90, 180), timestamp: 1000 })
    expect(filter.accept(teleport)).toEqual({ accepted: false, reason: 'impossible-speed' })
  })

  it('allows a big move after a long gap, which is just a lost signal', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))
    // 400 m in two minutes is a normal run, not a glitch.
    const afterGap = fix({ position: destination(home, 90, 400), timestamp: 120000 })
    expect(filter.accept(afterGap).accepted).toBe(true)
  })

  it('judges speed against the last accepted fix, not the last seen one', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))
    filter.accept(fix({ position: destination(home, 90, 500), timestamp: 1000 })) // refused
    // A sane fix following the glitch is still measured from the good one.
    const sane = fix({ position: destination(home, 90, 6), timestamp: 2000 })
    expect(filter.accept(sane).accepted).toBe(true)
  })

  it('stops refusing rather than freezing under a bridge', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))

    let lastVerdict = { accepted: true }
    for (let i = 1; i <= MAX_REJECT_STREAK; i++) {
      lastVerdict = filter.accept(fix({ accuracy: 300, timestamp: i * 1000 }))
    }
    // The run of refusals ends by taking what it can get.
    expect(lastVerdict.accepted).toBe(true)
  })

  it('starts the streak again after a good fix', () => {
    const filter = createFixFilter({ maxRejectStreak: 3 })
    filter.accept(fix({ timestamp: 0 }))
    filter.accept(fix({ accuracy: 300, timestamp: 1000 }))
    filter.accept(fix({ position: destination(home, 90, 4), timestamp: 2000 }))

    // Two more refusals should not tip it over, the count having been cleared.
    expect(filter.accept(fix({ accuracy: 300, timestamp: 3000 })).accepted).toBe(false)
    expect(filter.accept(fix({ accuracy: 300, timestamp: 4000 })).accepted).toBe(false)
  })

  it('refuses a hopeless first fix but takes a merely poor one', () => {
    expect(createFixFilter().accept(fix({ accuracy: 500 })).accepted).toBe(false)
    expect(createFixFilter().accept(fix({ accuracy: MAX_ACCURACY_METERS + 10 })).accepted).toBe(true)
  })

  it('does not judge speed between fixes closer together than a receiver reports', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))
    // 30 m apart but only 50 ms later: the interval is too short to mean
    // anything, so this is judged on accuracy alone.
    const rapid = fix({ position: destination(home, 90, 30), timestamp: 50 })
    expect(filter.accept(rapid).accepted).toBe(true)
  })

  it('still refuses an impossible jump at a normal reporting interval', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))
    const teleport = fix({ position: destination(home, 90, 200), timestamp: 1000 })
    expect(filter.accept(teleport).accepted).toBe(false)
  })

  it('ignores fixes that arrive out of order rather than reading them as speed', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 5000 }))
    const stale = fix({ position: destination(home, 90, 200), timestamp: 1000 })
    expect(filter.accept(stale).accepted).toBe(true)
  })

  it('forgets everything when reset for a new run', () => {
    const filter = createFixFilter()
    filter.accept(fix({ timestamp: 0 }))
    filter.reset()
    // With no previous fix, speed cannot be judged, so this is accepted.
    expect(filter.accept(fix({ position: destination(home, 90, 5000), timestamp: 500 })).accepted).toBe(true)
  })
})
