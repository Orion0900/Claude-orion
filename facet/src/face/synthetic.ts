import { CANONICAL_VERTICES } from './canonical'
import { EYE_LEFT, EYE_RIGHT } from './indices'
import type { FaceDetection, Vec3 } from './types'

export interface SyntheticOptions {
  /** Pixels per canonical centimetre. */
  scale?: number
  yaw?: number
  pitch?: number
  roll?: number
  center?: { x: number; y: number }
  width?: number
  height?: number
  /** Edit canonical vertices (centimetres, y up) before posing, e.g. to widen a jaw. */
  edit?: (v: Vec3[]) => void
  blendshapes?: Record<string, number>
}

/** Canonical vertices as points, y up, +z towards the viewer. */
export function canonicalPoints(): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i < CANONICAL_VERTICES.length; i += 3) {
    out.push({ x: CANONICAL_VERTICES[i], y: CANONICAL_VERTICES[i + 1], z: CANONICAL_VERTICES[i + 2] })
  }
  return out
}

/** Rotation about y (yaw), then x (pitch), then z (roll), in degrees; row-major. */
export function rotationMatrix(yaw: number, pitch: number, roll: number): number[][] {
  const [a, b, c] = [yaw, pitch, roll].map((d) => (d * Math.PI) / 180)
  const Ry = [
    [Math.cos(a), 0, Math.sin(a)],
    [0, 1, 0],
    [-Math.sin(a), 0, Math.cos(a)],
  ]
  // Positive pitch raises the chin: the forward axis tips up (+y).
  const Rx = [
    [1, 0, 0],
    [0, Math.cos(b), Math.sin(b)],
    [0, -Math.sin(b), Math.cos(b)],
  ]
  // Positive roll lowers the subject's left side: the +x axis tips down (−y).
  const Rz = [
    [Math.cos(c), Math.sin(c), 0],
    [-Math.sin(c), Math.cos(c), 0],
    [0, 0, 1],
  ]
  const mul = (A: number[][], B: number[][]) => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)))
  return mul(Rz, mul(Ry, Rx))
}

/**
 * A detection of the canonical face posed and placed in an image, as the
 * landmarker would report it: pixels, y down, smaller z nearer. Irises are
 * added at each eye's centre with an 11.7 mm diameter.
 */
export function syntheticDetection(o: SyntheticOptions = {}): FaceDetection {
  const scale = o.scale ?? 30
  const width = o.width ?? 1000
  const height = o.height ?? 1200
  const center = o.center ?? { x: width / 2, y: height / 2 }
  const v = canonicalPoints()
  o.edit?.(v)

  const eyeCenter = (e: typeof EYE_RIGHT): Vec3 => {
    const ids = [e.outer, e.inner, e.top, e.bottom]
    const p = ids.map((i) => v[i])
    return { x: p.reduce((s, q) => s + q.x, 0) / 4, y: p.reduce((s, q) => s + q.y, 0) / 4, z: p.reduce((s, q) => s + q.z, 0) / 4 + 0.3 }
  }
  const r = 0.585
  for (const e of [EYE_RIGHT, EYE_LEFT]) {
    const c = eyeCenter(e)
    // Centre, then the edges at image-right, top, image-left, bottom.
    v.push(c, { ...c, x: c.x + r }, { ...c, y: c.y + r }, { ...c, x: c.x - r }, { ...c, y: c.y - r })
  }

  const R = rotationMatrix(o.yaw ?? 0, o.pitch ?? 0, o.roll ?? 0)
  const landmarks = v.map((p) => {
    const x = R[0][0] * p.x + R[0][1] * p.y + R[0][2] * p.z
    const y = R[1][0] * p.x + R[1][1] * p.y + R[1][2] * p.z
    const z = R[2][0] * p.x + R[2][1] * p.y + R[2][2] * p.z
    return { x: center.x + x * scale, y: center.y - y * scale, z: -z * scale }
  })
  const matrix = [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, 0, 0, -60, 1]
  return { width, height, landmarks, blendshapes: o.blendshapes ?? {}, matrix }
}
