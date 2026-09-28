/**
 * Where spawns land. Pure: the Spawner settles the result against props and
 * terrain afterwards.
 */

export interface Point2 {
  x: number
  z: number
}

interface Roller {
  next(): number
}

const RING_ATTEMPTS = 20

/**
 * A point on the ring [minR, maxR] around (cx, cz) that lies inside the
 * square |x|, |z| ≤ limit. Near a wall (or in a corner, where three
 * quarters of the ring can be outside) it tries up to 20 angles and then
 * clamps the last try inside. Returns false when it had to clamp (the point
 * may then be closer than `minR`).
 */
export function ringPoint(rng: Roller, cx: number, cz: number, minR: number, maxR: number, limit: number, out: Point2): boolean {
  for (let attempt = 0; attempt < RING_ATTEMPTS; attempt++) {
    const a = rng.next() * Math.PI * 2
    const r = minR + (maxR - minR) * rng.next()
    const x = cx + Math.cos(a) * r
    const z = cz + Math.sin(a) * r
    if (insideSquare(x, z, limit)) {
      out.x = x
      out.z = z
      return true
    }
    out.x = x
    out.z = z
  }
  out.x = clamp(out.x, -limit, limit)
  out.z = clamp(out.z, -limit, limit)
  return false
}

/** The i-th of n evenly spaced points on a circle, rotated by `offset` radians. */
export function circlePoint(i: number, n: number, radius: number, cx: number, cz: number, offset: number, out: Point2): Point2 {
  const a = offset + (i / Math.max(1, n)) * Math.PI * 2
  out.x = cx + Math.cos(a) * radius
  out.z = cz + Math.sin(a) * radius
  return out
}

/**
 * `n` points spread evenly around a ring, leaving out the part of it past
 * the walls (|x| or |z| > limit): near a wall the ring becomes an arc that
 * closes against it, rather than a line of points squashed onto the wall.
 * Writes into `out` (growing it as needed) and returns how many it placed,
 * which is `n` unless almost none of the ring is inside.
 */
export function ringSpots(
  n: number, radius: number, cx: number, cz: number, offset: number, limit: number, out: Point2[],
): number {
  const want = Math.max(0, Math.floor(n))
  if (want === 0) return 0
  const samples = want * 4
  let inside = 0
  for (let i = 0; i < samples; i++) {
    const a = offset + (i / samples) * Math.PI * 2
    if (insideSquare(cx + Math.cos(a) * radius, cz + Math.sin(a) * radius, limit)) inside++
  }
  const count = Math.min(want, inside)
  // Take every (inside / count)-th inside sample, so the picks are evenly spread along the arc.
  let seen = 0
  let k = 0
  for (let i = 0; i < samples && k < count; i++) {
    const a = offset + (i / samples) * Math.PI * 2
    const x = cx + Math.cos(a) * radius
    const z = cz + Math.sin(a) * radius
    if (!insideSquare(x, z, limit)) continue
    if (seen === Math.floor((k * inside) / count)) {
      const p = (out[k] ??= { x: 0, z: 0 })
      p.x = x
      p.z = z
      k++
    }
    seen++
  }
  return k
}

function insideSquare(x: number, z: number, limit: number): boolean {
  return Math.abs(x) <= limit && Math.abs(z) <= limit
}

/** Keeps a point inside the square |x|, |z| ≤ limit. */
export function clampToSquare(p: Point2, limit: number): Point2 {
  p.x = clamp(p.x, -limit, limit)
  p.z = clamp(p.z, -limit, limit)
  return p
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
