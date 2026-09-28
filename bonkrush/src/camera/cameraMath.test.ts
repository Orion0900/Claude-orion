import { Vector3 } from 'three'
import {
  BASE_RUN,
  DEFAULT_PITCH,
  FOV_MAX,
  FOV_MIN,
  PITCH_MAX,
  PITCH_MIN,
  approach,
  boomDirection,
  clampPitch,
  clearBoom,
  fovFor,
  speedFactor,
} from './cameraMath'

describe('cameraMath', () => {
  it('clamps pitch and survives NaN', () => {
    expect(clampPitch(5)).toBe(PITCH_MAX)
    expect(clampPitch(-5)).toBe(PITCH_MIN)
    expect(clampPitch(0.4)).toBe(0.4)
    expect(clampPitch(Number.NaN)).toBe(DEFAULT_PITCH)
  })

  it('puts the camera behind the yaw and above for positive pitch', () => {
    const d = boomDirection(0, 0, new Vector3())
    // Yaw 0 faces -Z, so behind is +Z.
    expect(d.z).toBeCloseTo(1)
    expect(d.x).toBeCloseTo(0)
    const up = boomDirection(Math.PI / 2, 0.5, new Vector3())
    expect(up.y).toBeGreaterThan(0)
    expect(up.x).toBeGreaterThan(0)
    expect(up.length()).toBeCloseTo(1)
  })

  it('keeps the full boom over flat ground', () => {
    const len = clearBoom(new Vector3(0, 1.4, 0), boomDirection(0, 0.3, new Vector3()), 7.5, () => 0)
    expect(len).toBe(7.5)
  })

  it('pulls the boom in when a hill is behind the player', () => {
    const target = new Vector3(0, 1.4, 0)
    const dir = boomDirection(0, 0.2, new Vector3())
    // A wall of ground rising 4 m from z = 3 onwards.
    const hill = (_x: number, z: number) => (z > 3 ? 4 : 0)
    const len = clearBoom(target, dir, 7.5, hill)
    expect(len).toBeLessThan(3.2)
    expect(len).toBeGreaterThan(2.5)
    // Never closer than the minimum, even with the ground right behind.
    expect(clearBoom(target, dir, 7.5, () => 10)).toBe(1.2)
  })

  it('widens the FOV with speed between 70° and 85°', () => {
    expect(speedFactor(0)).toBe(0)
    expect(speedFactor(BASE_RUN)).toBe(0)
    expect(speedFactor(BASE_RUN * 4)).toBe(1)
    expect(speedFactor(Number.NaN)).toBe(0)
    expect(fovFor(0)).toBe(FOV_MIN)
    expect(fovFor(1)).toBe(FOV_MAX)
    expect(fovFor(speedFactor(BASE_RUN * 2))).toBeGreaterThan(FOV_MIN)
    expect(fovFor(speedFactor(BASE_RUN * 2))).toBeLessThan(FOV_MAX)
  })

  it('approaches targets independent of frame rate', () => {
    let a = 0
    for (let i = 0; i < 60; i++) a = approach(a, 10, 3, 1 / 60)
    let b = 0
    for (let i = 0; i < 144; i++) b = approach(b, 10, 3, 1 / 144)
    expect(a).toBeCloseTo(b, 5)
    expect(approach(4, 10, 3, 0)).toBe(4)
  })
})
