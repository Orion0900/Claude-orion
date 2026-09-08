import { describe, expect, it } from 'vitest'
import {
  angleDifference,
  chooseHeading,
  HEADING_EPSILON_DEGREES,
  headingChanged,
  headingFromOrientation,
  MIN_SPEED_FOR_COURSE,
  normalizeAngle,
  smoothHeading,
} from './heading'

describe('normalizeAngle', () => {
  it('leaves an ordinary angle alone', () => {
    expect(normalizeAngle(90)).toBe(90)
  })

  it('wraps past a full turn', () => {
    expect(normalizeAngle(370)).toBe(10)
    expect(normalizeAngle(720)).toBe(0)
  })

  it('wraps negatives round the other way', () => {
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(-370)).toBe(350)
  })
})

describe('angleDifference', () => {
  it('measures a simple turn', () => {
    expect(angleDifference(0, 90)).toBe(90)
    expect(angleDifference(90, 0)).toBe(-90)
  })

  it('takes the short way across north', () => {
    // 350 to 10 is twenty degrees clockwise, not 340 the other way.
    expect(angleDifference(350, 10)).toBe(20)
    expect(angleDifference(10, 350)).toBe(-20)
  })

  it('is zero for no turn', () => {
    expect(angleDifference(123, 123)).toBe(0)
  })

  it('handles a half turn', () => {
    expect(Math.abs(angleDifference(0, 180))).toBe(180)
  })
})

describe('smoothHeading', () => {
  it('adopts the first reading outright', () => {
    expect(smoothHeading(null, 123)).toBe(123)
  })

  it('moves most of the way at the default factor', () => {
    // Responsive by design: smoothing is for jitter, not for slowing the turn.
    expect(smoothHeading(0, 100, 0.45)).toBeCloseTo(45, 5)
  })

  it('snaps immediately at a factor of one', () => {
    expect(smoothHeading(0, 100, 1)).toBe(100)
  })

  it('eases across north without spinning the long way', () => {
    const result = smoothHeading(350, 10, 0.5)
    expect(result).toBeCloseTo(0, 5)
  })

  it('stays inside 0-360', () => {
    for (const [prev, next] of [[350, 10], [10, 350], [180, 0], [0, 180]] as const) {
      const value = smoothHeading(prev, next, 0.6)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(360)
    }
  })

  it('converges on the target when applied repeatedly', () => {
    let heading = 0
    for (let i = 0; i < 25; i++) heading = smoothHeading(heading, 270, 0.45)
    expect(heading).toBeCloseTo(270, 1)
  })
})

describe('headingChanged', () => {
  it('always accepts the first reading', () => {
    expect(headingChanged(null, 12)).toBe(true)
  })

  it('ignores a wobble below the threshold', () => {
    expect(headingChanged(100, 100 + HEADING_EPSILON_DEGREES / 2)).toBe(false)
  })

  it('accepts a real turn', () => {
    expect(headingChanged(100, 130)).toBe(true)
  })

  it('sees a small turn across north as small', () => {
    expect(headingChanged(359.9, 0.1)).toBe(false)
  })
})

describe('headingFromOrientation', () => {
  it('uses Safari’s compass heading directly', () => {
    expect(headingFromOrientation({ webkitCompassHeading: 90 })).toBe(90)
  })

  it('flips alpha, which counts the other way', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: true })).toBe(270)
    expect(headingFromOrientation({ alpha: 0, absolute: true })).toBe(0)
  })

  it('adds the screen rotation for a phone held sideways', () => {
    expect(headingFromOrientation({ alpha: 0, absolute: true }, 90)).toBe(90)
  })

  it('prefers the compass heading when both are present', () => {
    expect(headingFromOrientation({ webkitCompassHeading: 45, alpha: 200, absolute: true })).toBe(45)
  })

  it('refuses a reading with no fixed north', () => {
    expect(headingFromOrientation({ alpha: 90, absolute: false })).toBeNull()
  })

  it('refuses an empty reading', () => {
    expect(headingFromOrientation({})).toBeNull()
    expect(headingFromOrientation({ alpha: null })).toBeNull()
  })
})

describe('chooseHeading', () => {
  it('trusts the compass above everything', () => {
    expect(chooseHeading({ compass: 10, course: 200, speed: 5, derived: 300 })).toBe(10)
  })

  it('falls back to course over ground when running', () => {
    expect(chooseHeading({ compass: null, course: 200, speed: 3, derived: 300 })).toBe(200)
  })

  it('distrusts course when barely moving', () => {
    expect(chooseHeading({ compass: null, course: 200, speed: 0.2, derived: 300 })).toBe(300)
  })

  it('accepts course when speed is unknown', () => {
    expect(chooseHeading({ compass: null, course: 200, speed: null, derived: 300 })).toBe(200)
  })

  it('uses the direction just travelled as a last resort', () => {
    expect(chooseHeading({ compass: null, course: null, speed: null, derived: 42 })).toBe(42)
  })

  it('reports nothing when no source knows', () => {
    expect(chooseHeading({ compass: null, course: null, speed: null, derived: null })).toBeNull()
  })

  it('treats the walking threshold as inclusive', () => {
    expect(chooseHeading({ compass: null, course: 77, speed: MIN_SPEED_FOR_COURSE, derived: 5 })).toBe(77)
  })
})
