/**
 * The chase camera's geometry: orbit angles, the boom that keeps the
 * terrain out of the way, and how speed widens the view. Pure, so it's
 * testable without a renderer.
 */
import { Vector3 } from 'three'
import { wrapAngle, yawOf } from '../player/movement'

/** Pitch limits; positive looks down on the player from above. */
export const PITCH_MIN = -0.3
export const PITCH_MAX = 1.15
export const DEFAULT_PITCH = 0.32
export const BASE_DISTANCE = 7.5
/** Extra boom length at full speed. */
export const SPEED_DISTANCE = 2
export const FOV_MIN = 70
export const FOV_MAX = 85
/** The base run speed camera effects are measured against (m/s). */
export const BASE_RUN = 7
/** The boom never gets shorter than this, so the character can't fill the view. */
export const MIN_BOOM = 4
/** Pitch search step when rising terrain pushes the view up (rad). */
const PITCH_STEP = 0.06

export function clampPitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return DEFAULT_PITCH
  return Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch))
}

/** Unit vector from the look-at point out to the camera: behind the yaw, raised by the pitch. */
export function boomDirection(yaw: number, pitch: number, out: Vector3): Vector3 {
  const c = Math.cos(pitch)
  return out.set(Math.sin(yaw) * c, Math.sin(pitch), Math.cos(yaw) * c)
}

/** 0 at an ordinary run, 1 at about 3.5× base speed, for FOV and boom length. */
export function speedFactor(speed: number): number {
  if (!(speed > 0)) return 0
  return Math.min(1, Math.max(0, (speed - BASE_RUN * 1.1) / (BASE_RUN * 2.4)))
}

export function fovFor(factor: number): number {
  return FOV_MIN + (FOV_MAX - FOV_MIN) * Math.min(1, Math.max(0, factor || 0))
}

/**
 * How long the boom from `target` along `dir` can be before the ground
 * (plus `clearance`) gets in the way. Samples along the boom, then
 * bisects the first blocked stretch for a smooth answer.
 */
export function clearBoom(
  target: Vector3,
  dir: Vector3,
  maxLen: number,
  heightAt: (x: number, z: number) => number,
  clearance = 0.45,
  minLen = MIN_BOOM,
  samples = 10,
): number {
  const blocked = (t: number) =>
    target.y + dir.y * t < heightAt(target.x + dir.x * t, target.z + dir.z * t) + clearance
  let clear = 0
  for (let i = 1; i <= samples; i++) {
    const t = (i / samples) * maxLen
    if (blocked(t)) {
      let hit = t
      for (let k = 0; k < 6; k++) {
        const mid = (clear + hit) / 2
        if (blocked(mid)) hit = mid
        else clear = mid
      }
      return Math.max(minLen, clear)
    }
    clear = t
  }
  return maxLen
}

const _dir = new Vector3()

/**
 * The lowest pitch from `pitch` up to PITCH_MAX at which a boom of `len`
 * keeps at least `need` × len clear of the ground. Rising ground behind the
 * player (the rim, a hillside) lifts the view over it instead of pulling
 * the camera into the character's back. PITCH_MAX when nothing clears.
 */
export function clearPitch(
  target: Vector3,
  yaw: number,
  pitch: number,
  len: number,
  heightAt: (x: number, z: number) => number,
  clearance = 0.45,
  need = 0.85,
): number {
  const want = need * len - 1e-6
  const clears = (p: number) => clearBoom(target, boomDirection(yaw, p, _dir), len, heightAt, clearance, 0) >= want
  const start = clampPitch(pitch)
  if (clears(start)) return start
  let lo = start
  while (lo < PITCH_MAX) {
    const hi = Math.min(PITCH_MAX, lo + PITCH_STEP)
    if (clears(hi)) {
      // Refine inside the step so the result glides rather than jumping 0.06 at a time.
      let a = lo
      let b = hi
      for (let k = 0; k < 4; k++) {
        const mid = (a + b) / 2
        if (clears(mid)) b = mid
        else a = mid
      }
      return b
    }
    lo = hi
  }
  return PITCH_MAX
}

/** Touch auto-follow: seconds without look input before it starts. */
export const AUTO_DELAY = 0.6
/** How eagerly it eases in behind the run direction (per second, at run speed). */
export const AUTO_RATE = 1.5
/** It never turns the view faster than this: 40°/s. */
export const AUTO_MAX_RATE = (40 * Math.PI) / 180
/** It only acts while the stick points within this of straight ahead (rad, about 26°)… */
export const AUTO_STICK_CONE = 0.45
/** …and the run direction is within this of the view (rad, about 34°). */
export const AUTO_MAX_ANGLE = 0.6

/**
 * How far the touch camera turns this step (radians, added to its yaw) to
 * ease in behind where the player is running. Movement is camera-relative,
 * so a view that chased the velocity while the stick points sideways would
 * turn the run direction with it and circle forever; it only follows while
 * the stick points mostly forward, fading out toward the edge of that cone,
 * and never faster than AUTO_MAX_RATE.
 */
export function autoFollowTurn(
  camYaw: number,
  vel: { x: number; z: number },
  move: { x: number; y: number },
  sinceLook: number,
  dt: number,
): number {
  if (!(dt > 0) || !(sinceLook > AUTO_DELAY)) return 0
  const speed = Math.hypot(vel.x, vel.z)
  if (!(speed > 2) || Math.hypot(move.x, move.y) < 0.3) return 0
  const stick = Math.atan2(Math.abs(move.x), move.y)
  if (!(stick < AUTO_STICK_CONE)) return 0
  const diff = wrapAngle(yawOf(vel.x, vel.z) - camYaw)
  if (!(Math.abs(diff) < AUTO_MAX_ANGLE)) return 0
  const rate = AUTO_RATE * (1 - stick / AUTO_STICK_CONE) * Math.min(1, speed / BASE_RUN)
  const turn = diff * (1 - Math.exp(-rate * dt))
  const limit = AUTO_MAX_RATE * dt
  return Math.max(-limit, Math.min(limit, turn))
}

/** Frame-rate independent exponential approach. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)))
}
