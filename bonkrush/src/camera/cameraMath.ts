/**
 * The chase camera's geometry: orbit angles, the boom that keeps the
 * terrain out of the way, and how speed widens the view. Pure, so it's
 * testable without a renderer.
 */
import type { Vector3 } from 'three'

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
  minLen = 1.2,
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

/** Frame-rate independent exponential approach. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)))
}
