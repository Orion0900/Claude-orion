/**
 * Aiming and hit-shape maths shared by the weapon behaviors. Pure: plain
 * numbers in, plain numbers out (vectors are written in place), so all of it
 * is unit-tested without a renderer.
 *
 * Yaw follows the player and camera: 0 faces −Z, and forward is
 * (−sin yaw, 0, −cos yaw).
 */
import type { Vector3 } from 'three'

const TAU = Math.PI * 2

export function forwardX(yaw: number): number {
  return -Math.sin(yaw)
}

export function forwardZ(yaw: number): number {
  return -Math.cos(yaw)
}

/** The yaw that faces along (dx, dz); the inverse of forwardX/forwardZ. */
export function yawOf(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz)
}

/** Angle folded into [−π, π). */
export function wrapAngle(a: number): number {
  const w = (((a + Math.PI) % TAU) + TAU) % TAU
  return w - Math.PI
}

/** Angle offset of shot `i` of `n` in a fan whose neighbours are `spread` apart, centred on the aim. */
export function fanOffset(i: number, n: number, spread: number): number {
  return (i - (n - 1) / 2) * spread
}

/** Half the angle a body of `radius` covers when seen from `dist` away. */
export function angularRadius(radius: number, dist: number): number {
  if (dist <= radius) return Math.PI
  return Math.asin(radius / dist)
}

/**
 * Where a point at (dx, dz) lies along a swing that sweeps `2 × halfArc`
 * around `facing`: 0 at the edge the swing starts from, 1 at the edge it
 * ends on. `sign` +1 sweeps toward increasing yaw. Outside 0..1 is outside
 * the arc.
 */
export function sweepFraction(dx: number, dz: number, facing: number, halfArc: number, sign: number): number {
  const rel = wrapAngle(yawOf(dx, dz) - facing)
  return (sign * rel + halfArc) / (2 * halfArc)
}

/**
 * Whether a body of `radius` at (dx, dz) has been reached by a swing that is
 * `progress` (0..1) of the way through its sweep. Bodies overlapping the
 * swinger always count; big bodies are caught by their edge.
 */
export function inSwept(
  dx: number,
  dz: number,
  radius: number,
  reach: number,
  facing: number,
  halfArc: number,
  sign: number,
  progress: number,
): boolean {
  const dist = Math.hypot(dx, dz)
  if (dist > reach + radius) return false
  if (dist <= radius) return true
  const pad = angularRadius(radius, dist) / (2 * halfArc)
  const f = sweepFraction(dx, dz, facing, halfArc, sign)
  return f >= -pad && f <= progress + pad
}

/**
 * Launch velocity that carries a projectile (dx, dy, dz) away in `time`
 * seconds under gravity `g`. Written into `out`.
 */
export function ballisticVelocity(dx: number, dy: number, dz: number, time: number, g: number, out: Vector3): Vector3 {
  const t = Math.max(time, 1e-3)
  return out.set(dx / t, dy / t + 0.5 * g * t, dz / t)
}

/** Deceleration that stops something thrown at `speed` exactly `range` metres out. */
export function boomerangDecel(speed: number, range: number): number {
  return range > 0 ? (speed * speed) / (2 * range) : speed
}

/** Parameter 0..1 of the point on segment a→b (in XZ) closest to p. */
export function closestT(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const vx = bx - ax
  const vz = bz - az
  const len2 = vx * vx + vz * vz
  if (len2 < 1e-12) return 0
  const t = ((px - ax) * vx + (pz - az) * vz) / len2
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Squared XZ distance from p to segment a→b. */
export function segmentDist2(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const t = closestT(ax, az, bx, bz, px, pz)
  const x = ax + (bx - ax) * t - px
  const z = az + (bz - az) * t - pz
  return x * x + z * z
}

/**
 * Turns unit vector `dir` toward unit vector `desired` by at most `maxAngle`
 * radians (a capped slerp). Mutates and returns `dir`.
 */
export function steerToward(dir: Vector3, desired: Vector3, maxAngle: number): Vector3 {
  const dot = Math.min(1, Math.max(-1, dir.dot(desired)))
  const angle = Math.acos(dot)
  if (angle <= maxAngle || angle < 1e-6) return dir.copy(desired)
  const s = Math.sin(angle)
  if (s < 1e-4) {
    // Exactly opposite: any way round works, so turn about the vertical.
    const c = Math.cos(maxAngle)
    const n = Math.sin(maxAngle)
    return dir.set(dir.x * c + dir.z * n, dir.y, -dir.x * n + dir.z * c).normalize()
  }
  const t = maxAngle / angle
  const a = Math.sin((1 - t) * angle) / s
  const b = Math.sin(t * angle) / s
  return dir.set(dir.x * a + desired.x * b, dir.y * a + desired.y * b, dir.z * a + desired.z * b).normalize()
}
