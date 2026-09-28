/**
 * Steering and the little state machines behind each enemy behavior. Pure
 * maths on plain numbers so it can be tested; the manager feeds it relative
 * positions and applies the results.
 */

export interface Steer {
  x: number
  z: number
}

export const CHARGER = {
  /** Starts a wind-up when the player is this close. */
  range: 11,
  windup: 0.7,
  dashSpeed: 18,
  dashTime: 0.85,
  recover: 0.8,
  /** Minimum time spent approaching between charges. */
  cooldown: 1.2,
}
export const CHARGE_APPROACH = 0
export const CHARGE_WINDUP = 1
export const CHARGE_DASH = 2
export const CHARGE_RECOVER = 3

export const EXPLODER = { armRange: 1.5, fuse: 0.7, radius: 3 }
export const EXPLODE_IDLE = 0
export const EXPLODE_ARMED = 1

/** Ranged enemies hold this distance; ranged fliers hover a little closer. */
export const RANGED_KEEP = 12
export const FLIER_KEEP = 9

/** Yaw that faces along (dx, dz), with the player's convention: 0 faces -Z. */
export function yawTowards(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

/** Turns `current` toward `target` by at most `maxStep` radians, the short way round. */
export function turnTowards(current: number, target: number, maxStep: number): number {
  let d = target - current
  d = d - Math.PI * 2 * Math.floor((d + Math.PI) / (Math.PI * 2))
  if (d > maxStep) d = maxStep
  else if (d < -maxStep) d = -maxStep
  return current + d
}

/** Straight at the target with a gentle weave (−1..1) so a crowd doesn't march in single file. */
export function chase(dx: number, dz: number, dist: number, speed: number, weave: number, out: Steer): Steer {
  if (!(dist > 1e-4)) return zero(out)
  const nx = dx / dist
  const nz = dz / dist
  const w = weave * 0.35
  return setLength(nx - nz * w, nz + nx * w, speed, out)
}

/**
 * Swarmers aim at a point beside the target on their own side and swing in
 * as they close, so a pack arrives from several angles at once.
 */
export function flank(dx: number, dz: number, dist: number, speed: number, side: number, out: Steer): Steer {
  if (!(dist > 1e-4)) return zero(out)
  const nx = dx / dist
  const nz = dz / dist
  const off = dist > 3 ? Math.min(7, dist * 0.45) * side : 0
  return setLength(dx - nz * off, dz + nx * off, speed, out)
}

/** Closes in when far, backs off when crowded, and strafes in between. */
export function keepDistance(dx: number, dz: number, dist: number, keep: number, speed: number, side: number, out: Steer): Steer {
  if (!(dist > 1e-4)) return zero(out)
  const nx = dx / dist
  const nz = dz / dist
  if (dist > keep + 1.5) return setLength(nx, nz, speed, out)
  if (dist < keep - 2) return setLength(-nx, -nz, speed * 0.8, out)
  // Strafe, drifting back toward the sweet spot.
  const radial = (dist - keep) * 0.25
  return setLength(-nz * side + nx * radial, nx * side + nz * radial, speed * 0.6, out)
}

/** Advances a charger; `s.t` is time spent in the current state. Returns the new state. */
export function stepCharger(s: { state: number; t: number }, dt: number, dist: number): number {
  s.t += dt
  switch (s.state) {
    case CHARGE_WINDUP:
      if (s.t >= CHARGER.windup) enter(s, CHARGE_DASH)
      break
    case CHARGE_DASH:
      if (s.t >= CHARGER.dashTime) enter(s, CHARGE_RECOVER)
      break
    case CHARGE_RECOVER:
      if (s.t >= CHARGER.recover) enter(s, CHARGE_APPROACH)
      break
    default:
      if (s.t >= CHARGER.cooldown && dist <= CHARGER.range) enter(s, CHARGE_WINDUP)
  }
  return s.state
}

/** Advances an exploder; arms within reach and returns true when the fuse runs out. */
export function stepExploder(s: { state: number; t: number }, dt: number, dist: number): boolean {
  s.t += dt
  if (s.state !== EXPLODE_ARMED) {
    if (dist <= EXPLODER.armRange) enter(s, EXPLODE_ARMED)
    return false
  }
  return s.t >= EXPLODER.fuse
}

function enter(s: { state: number; t: number }, state: number): void {
  s.state = state
  s.t = 0
}

function zero(out: Steer): Steer {
  out.x = 0
  out.z = 0
  return out
}

function setLength(x: number, z: number, len: number, out: Steer): Steer {
  const l = Math.hypot(x, z)
  if (!(l > 1e-6)) return zero(out)
  out.x = (x / l) * len
  out.z = (z / l) * len
  return out
}
