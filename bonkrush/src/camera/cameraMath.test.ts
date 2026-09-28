import { Vector3 } from 'three'
import { yawOf } from '../player/movement'
import {
  AUTO_DELAY,
  AUTO_MAX_RATE,
  BASE_DISTANCE,
  BASE_RUN,
  DEFAULT_PITCH,
  FOV_MAX,
  FOV_MIN,
  MIN_BOOM,
  PITCH_MAX,
  PITCH_MIN,
  approach,
  autoFollowTurn,
  boomDirection,
  clampPitch,
  clearBoom,
  clearPitch,
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
    const len = clearBoom(target, dir, 7.5, hill, 0.45, 1)
    expect(len).toBeLessThan(3.2)
    expect(len).toBeGreaterThan(2.5)
    // Never closer than the minimum, even with the ground right behind.
    expect(clearBoom(target, dir, 7.5, () => 10)).toBe(MIN_BOOM)
    expect(MIN_BOOM).toBeGreaterThanOrEqual(3.5)
  })

  it('finds the lowest pitch that lifts the boom over rising ground', () => {
    const target = new Vector3(0, 1.4, 0)
    // Open ground: the player's own pitch is kept.
    expect(clearPitch(target, 0, DEFAULT_PITCH, BASE_DISTANCE, () => 0)).toBe(DEFAULT_PITCH)
    // A 35° bank rising from 1 m behind the player (+Z is behind at yaw 0).
    const bank = (_x: number, z: number) => Math.max(0, (z - 1) * Math.tan((35 * Math.PI) / 180))
    const p = clearPitch(target, 0, DEFAULT_PITCH, BASE_DISTANCE, bank)
    expect(p).toBeGreaterThan(DEFAULT_PITCH)
    expect(p).toBeLessThan(PITCH_MAX)
    const dir = boomDirection(0, p, new Vector3())
    expect(clearBoom(target, dir, BASE_DISTANCE, bank, 0.45, 0)).toBeGreaterThanOrEqual(0.85 * BASE_DISTANCE - 1e-6)
    // …and it's the lowest: a little less pitch no longer clears.
    const lower = boomDirection(0, p - 0.03, new Vector3())
    expect(clearBoom(target, lower, BASE_DISTANCE, bank, 0.45, 0)).toBeLessThan(0.85 * BASE_DISTANCE)
    // A sheer wall can't be cleared at any pitch: the steepest view is the best there is.
    expect(clearPitch(target, 0, DEFAULT_PITCH, BASE_DISTANCE, (_x, z) => (z > 1 ? 50 : 0))).toBe(PITCH_MAX)
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

  describe('touch auto-follow', () => {
    const DT = 1 / 60
    // Camera looking down -Z; the player runs 20° to the right of that.
    const vel = { x: Math.sin((20 * Math.PI) / 180) * 7, z: -Math.cos((20 * Math.PI) / 180) * 7 }
    const velYaw = yawOf(vel.x, vel.z)

    it('eases in behind a forward run after a pause in look input', () => {
      const turn = autoFollowTurn(0, vel, { x: 0, y: 1 }, AUTO_DELAY + 0.1, DT)
      expect(Math.sign(turn)).toBe(Math.sign(velYaw))
      expect(Math.abs(turn)).toBeGreaterThan(0)
      expect(Math.abs(turn)).toBeLessThanOrEqual(AUTO_MAX_RATE * DT + 1e-12)
    })

    it('leaves the view alone while looking, sideways, backwards or slow', () => {
      expect(autoFollowTurn(0, vel, { x: 0, y: 1 }, AUTO_DELAY - 0.1, DT)).toBe(0)
      expect(autoFollowTurn(0, vel, { x: 1, y: 0 }, 5, DT)).toBe(0)
      expect(autoFollowTurn(0, vel, { x: 0.707, y: 0.707 }, 5, DT)).toBe(0)
      expect(autoFollowTurn(0, vel, { x: 0, y: -1 }, 5, DT)).toBe(0)
      expect(autoFollowTurn(0, vel, { x: 0, y: 0 }, 5, DT)).toBe(0)
      expect(autoFollowTurn(0, { x: 0.5, z: -1 }, { x: 0, y: 1 }, 5, DT)).toBe(0)
      // Running well away from the view (a knockback, a reversal) never whips it round.
      expect(autoFollowTurn(0, { x: 7, z: 0 }, { x: 0, y: 1 }, 5, DT)).toBe(0)
      expect(autoFollowTurn(0, vel, { x: 0, y: 1 }, 5, 0)).toBe(0)
    })

    it('never turns faster than 40°/s', () => {
      for (const dt of [1 / 144, 1 / 60, 1 / 20, 0.25]) {
        expect(Math.abs(autoFollowTurn(0, vel, { x: 0, y: 1 }, 5, dt))).toBeLessThanOrEqual(AUTO_MAX_RATE * dt + 1e-12)
      }
      expect(AUTO_MAX_RATE).toBeCloseTo((40 * Math.PI) / 180)
    })
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
