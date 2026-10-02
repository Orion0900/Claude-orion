import type { Vec2 } from './types'

export const vec = (x: number, y: number): Vec2 => ({ x, y })
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y })
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y })
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s })
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.y * b.y
export const cross = (a: Vec2, b: Vec2) => a.x * b.y - a.y * b.x
export const len = (a: Vec2) => Math.hypot(a.x, a.y)
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y)
export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
export const mid = (a: Vec2, b: Vec2): Vec2 => lerp(a, b, 0.5)
export const norm = (a: Vec2): Vec2 => {
  const l = len(a)
  return l === 0 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l }
}
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x })

export const DEG = 180 / Math.PI
export const toDeg = (rad: number) => rad * DEG
export const toRad = (deg: number) => deg / DEG

export function mean(points: readonly Vec2[]): Vec2 {
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

export function rotate(p: Vec2, center: Vec2, angle: number): Vec2 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const dx = p.x - center.x
  const dy = p.y - center.y
  return { x: center.x + dx * c - dy * s, y: center.y + dx * s + dy * c }
}

/** The angle at `vertex` between the rays to `a` and `b`, in degrees (0–180). */
export function angleAt(vertex: Vec2, a: Vec2, b: Vec2): number {
  const u = sub(a, vertex)
  const v = sub(b, vertex)
  return toDeg(Math.atan2(Math.abs(cross(u, v)), dot(u, v)))
}

/** Angle between two undirected lines, in degrees (0–90). */
export function lineAngle(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): number {
  const u = sub(a2, a1)
  const v = sub(b2, b1)
  const a = toDeg(Math.atan2(Math.abs(cross(u, v)), Math.abs(dot(u, v))))
  return a
}

/**
 * Signed perpendicular distance from `p` to the line through `a` and `b`.
 * Positive on the left of a→b in a y-down image (counter-clockwise side).
 */
export function signedDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const d = sub(b, a)
  const l = len(d)
  if (l === 0) return dist(p, a)
  return cross(d, sub(p, a)) / l
}

/** Where `p` lands on the line through `a` and `b`, as a fraction along a→b. */
export function projectT(p: Vec2, a: Vec2, b: Vec2): number {
  const d = sub(b, a)
  const l2 = dot(d, d)
  return l2 === 0 ? 0 : dot(sub(p, a), d) / l2
}

export function project(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  return lerp(a, b, projectT(p, a, b))
}

/** Intersection of the infinite lines a1–a2 and b1–b2, or null if parallel. */
export function intersect(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): Vec2 | null {
  const r = sub(a2, a1)
  const s = sub(b2, b1)
  const denom = cross(r, s)
  if (Math.abs(denom) < 1e-12) return null
  const t = cross(sub(b1, a1), s) / denom
  return add(a1, scale(r, t))
}

/** Reflect `p` across the line through `a` and `b`. */
export function reflect(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const q = project(p, a, b)
  return { x: 2 * q.x - p.x, y: 2 * q.y - p.y }
}

/**
 * Total-least-squares line through the points: returns a point on the line
 * (the centroid) and a unit direction. Robust to lines at any angle.
 */
export function fitLine(points: readonly Vec2[]): { point: Vec2; dir: Vec2 } {
  const c = mean(points)
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of points) {
    const dx = p.x - c.x
    const dy = p.y - c.y
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  return { point: c, dir: { x: Math.cos(theta), y: Math.sin(theta) } }
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}

/** Linear interpolation of y at x along a polyline sorted by x (clamped at the ends). */
export function interpolateAtX(points: readonly Vec2[], x: number): number {
  const s = [...points].sort((a, b) => a.x - b.x)
  if (x <= s[0].x) return s[0].y
  for (let i = 1; i < s.length; i++) {
    if (x <= s[i].x) {
      const t = (x - s[i - 1].x) / (s[i].x - s[i - 1].x || 1)
      return s[i - 1].y + (s[i].y - s[i - 1].y) * t
    }
  }
  return s[s.length - 1].y
}
