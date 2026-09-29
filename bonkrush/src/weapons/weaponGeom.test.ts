import { Vector3 } from 'three'
import {
  angularRadius,
  ballisticVelocity,
  boomerangDecel,
  closestT,
  fanOffset,
  forwardX,
  forwardZ,
  inSwept,
  segmentDist2,
  steerToward,
  sweepFraction,
  wrapAngle,
  yawOf,
} from './weaponGeom'

describe('yaw convention', () => {
  it('faces −Z at yaw 0 and −X at a quarter turn', () => {
    expect(forwardX(0)).toBeCloseTo(0)
    expect(forwardZ(0)).toBeCloseTo(-1)
    expect(forwardX(Math.PI / 2)).toBeCloseTo(-1)
    expect(forwardZ(Math.PI / 2)).toBeCloseTo(0)
  })

  it('yawOf inverts forward', () => {
    for (const yaw of [-2.5, -1, 0, 0.7, 2, 3]) {
      expect(wrapAngle(yawOf(forwardX(yaw), forwardZ(yaw)) - yaw)).toBeCloseTo(0)
    }
  })
})

describe('wrapAngle', () => {
  it('folds into [−π, π)', () => {
    expect(wrapAngle(0)).toBeCloseTo(0)
    expect(wrapAngle(Math.PI * 2 + 0.5)).toBeCloseTo(0.5)
    expect(wrapAngle(-Math.PI * 2 - 0.5)).toBeCloseTo(-0.5)
    expect(wrapAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1)
  })
})

describe('fanOffset', () => {
  it('centres the fan on the aim', () => {
    expect(fanOffset(0, 1, 0.2)).toBe(0)
    expect(fanOffset(0, 3, 0.2)).toBeCloseTo(-0.2)
    expect(fanOffset(1, 3, 0.2)).toBeCloseTo(0)
    expect(fanOffset(2, 3, 0.2)).toBeCloseTo(0.2)
    expect(fanOffset(0, 2, 0.2) + fanOffset(1, 2, 0.2)).toBeCloseTo(0)
  })
})

describe('swings', () => {
  const half = (75 * Math.PI) / 180

  it('measures where a point lies along the sweep', () => {
    // Facing −Z; sweeping toward increasing yaw starts on the +X side.
    expect(sweepFraction(0, -1, 0, half, 1)).toBeCloseTo(0.5)
    expect(sweepFraction(forwardX(-half), forwardZ(-half), 0, half, 1)).toBeCloseTo(0)
    expect(sweepFraction(forwardX(half), forwardZ(half), 0, half, 1)).toBeCloseTo(1)
    expect(sweepFraction(forwardX(half), forwardZ(half), 0, half, -1)).toBeCloseTo(0)
  })

  it('only reaches what the blade has passed', () => {
    const start = [forwardX(-1), forwardZ(-1)] as const
    const end = [forwardX(1), forwardZ(1)] as const
    expect(inSwept(start[0] * 2, start[1] * 2, 0.3, 3, 0, half, 1, 0.1)).toBe(true)
    expect(inSwept(end[0] * 2, end[1] * 2, 0.3, 3, 0, half, 1, 0.1)).toBe(false)
    expect(inSwept(end[0] * 2, end[1] * 2, 0.3, 3, 0, half, 1, 1)).toBe(true)
  })

  it('never reaches behind or beyond the blade', () => {
    expect(inSwept(0, 2, 0.3, 3, 0, half, 1, 1)).toBe(false)
    expect(inSwept(0, -4, 0.3, 3, 0, half, 1, 1)).toBe(false)
  })

  it('catches big bodies by their edge and anything overlapping the swinger', () => {
    // Just outside the arc by angle, but a wide body pokes into it.
    const a = half + 0.2
    expect(inSwept(forwardX(a) * 2, forwardZ(a) * 2, 0.1, 3, 0, half, 1, 1)).toBe(false)
    expect(inSwept(forwardX(a) * 2, forwardZ(a) * 2, 0.8, 3, 0, half, 1, 1)).toBe(true)
    expect(inSwept(0, 0.2, 0.5, 3, 0, half, 1, 0)).toBe(true)
  })

  it('gives the angular size of a body', () => {
    expect(angularRadius(1, 2)).toBeCloseTo(Math.PI / 6)
    expect(angularRadius(2, 1)).toBe(Math.PI)
  })
})

describe('ballisticVelocity', () => {
  it('lands on the target after the given time', () => {
    const g = 16
    const v = ballisticVelocity(6, -1, 8, 0.8, g, new Vector3())
    const t = 0.8
    expect(v.x * t).toBeCloseTo(6)
    expect(v.z * t).toBeCloseTo(8)
    expect(v.y * t - 0.5 * g * t * t).toBeCloseTo(-1)
  })

  it('never divides by zero', () => {
    const v = ballisticVelocity(1, 0, 0, 0, 10, new Vector3())
    expect(Number.isFinite(v.x)).toBe(true)
  })
})

describe('boomerangDecel', () => {
  it('stops a throw exactly at its range', () => {
    const a = boomerangDecel(20, 14)
    // v² = 2 a d
    expect((20 * 20) / (2 * a)).toBeCloseTo(14)
    expect(Number.isFinite(boomerangDecel(20, 0))).toBe(true)
  })
})

describe('segment distance', () => {
  it('clamps to the ends', () => {
    expect(closestT(0, 0, 10, 0, -5, 3)).toBe(0)
    expect(closestT(0, 0, 10, 0, 15, 3)).toBe(1)
    expect(closestT(0, 0, 10, 0, 4, 3)).toBeCloseTo(0.4)
  })

  it('measures squared distance to the nearest point', () => {
    expect(segmentDist2(0, 0, 10, 0, 4, 3)).toBeCloseTo(9)
    expect(segmentDist2(0, 0, 10, 0, 13, 4)).toBeCloseTo(25)
    expect(segmentDist2(2, 2, 2, 2, 5, 6)).toBeCloseTo(25)
  })
})

describe('steerToward', () => {
  it('turns by at most the given angle', () => {
    const dir = new Vector3(1, 0, 0)
    const want = new Vector3(0, 0, 1)
    steerToward(dir, want, 0.3)
    expect(dir.length()).toBeCloseTo(1)
    expect(Math.acos(dir.x)).toBeCloseTo(0.3)
    expect(dir.z).toBeGreaterThan(0)
  })

  it('snaps when the turn is small enough', () => {
    const dir = new Vector3(1, 0, 0)
    steerToward(dir, new Vector3(0, 0, 1), 2)
    expect(dir.z).toBeCloseTo(1)
  })

  it('still turns when facing exactly away', () => {
    const dir = new Vector3(1, 0, 0)
    steerToward(dir, new Vector3(-1, 0, 0), 0.5)
    expect(dir.length()).toBeCloseTo(1)
    expect(Math.acos(dir.x)).toBeCloseTo(0.5)
  })
})
