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

/**
 * A point on the ring [minR, maxR] around (cx, cz) that lies inside the
 * square |x|, |z| ≤ limit. Near a wall half the ring is outside the map, so
 * it tries a few angles and then clamps the last try inside. Returns false
 * when it had to clamp (the point may then be closer than `minR`).
 */
export function ringPoint(rng: Roller, cx: number, cz: number, minR: number, maxR: number, limit: number, out: Point2): boolean {
  for (let attempt = 0; attempt < 10; attempt++) {
    const a = rng.next() * Math.PI * 2
    const r = minR + (maxR - minR) * rng.next()
    const x = cx + Math.cos(a) * r
    const z = cz + Math.sin(a) * r
    if (Math.abs(x) <= limit && Math.abs(z) <= limit) {
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

/** Keeps a point inside the square |x|, |z| ≤ limit. */
export function clampToSquare(p: Point2, limit: number): Point2 {
  p.x = clamp(p.x, -limit, limit)
  p.z = clamp(p.z, -limit, limit)
  return p
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
