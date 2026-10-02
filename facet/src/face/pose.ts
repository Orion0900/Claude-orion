import { toDeg } from './geometry'
import type { Vec3 } from './types'

/**
 * Head orientation in degrees.
 * yaw > 0: turned towards the right of the photo (the subject's left).
 * pitch > 0: chin raised.
 * roll > 0: head tipped so the subject's left side is lower in the photo.
 */
export interface HeadPose {
  yaw: number
  pitch: number
  roll: number
}

/** Row-major 3×3 rotation from MediaPipe's column-major 4×4 transform. */
export function rotationOf(m: readonly number[]): number[][] {
  return [
    [m[0], m[4], m[8]],
    [m[1], m[5], m[9]],
    [m[2], m[6], m[10]],
  ]
}

/**
 * The transform maps the canonical face into camera space (x right, y up,
 * z towards the camera): its first column is the face's left–right axis, its
 * third the direction the face points. Roll comes from the left–right axis;
 * yaw and pitch are read with that roll undone, so a tilted head that faces
 * the camera doesn't register as turned.
 */
export function poseFromMatrix(m: readonly number[]): HeadPose {
  const R = rotationOf(m)
  const roll = Math.atan2(-R[1][0], R[0][0])
  const c = Math.cos(roll)
  const s = Math.sin(roll)
  const fx = c * R[0][2] - s * R[1][2]
  const fy = s * R[0][2] + c * R[1][2]
  const fz = R[2][2]
  return {
    yaw: toDeg(Math.atan2(fx, fz)),
    pitch: toDeg(Math.atan2(fy, Math.hypot(fx, fz))),
    roll: toDeg(roll),
  }
}

/**
 * The landmarker reads a level head, looking straight into the lens, as a few
 * degrees chin-down. Pitch is corrected only beyond that.
 */
export const PITCH_BIAS = 5

/**
 * Turns an upright landmark cloud (roll already removed) to face the camera:
 * undoes the head's yaw, then any pitch beyond the landmarker's usual reading
 * for a level head. The landmarks are 3D — x, y in pixels, z relative depth
 * on the same scale, smaller nearer — so this is a rigid rotation, and a head
 * turned a few degrees no longer makes one eye look narrower than the other,
 * nor a lowered chin shorten the lower third.
 */
export function faceForward<T extends Vec3>(points: readonly T[], pose: HeadPose | null, reference: readonly Vec3[] = points): Vec3[] {
  if (!pose) return points.map((p) => ({ x: p.x, y: p.y, z: p.z }))
  const a = (pose.yaw * Math.PI) / 180
  const b = ((pose.pitch + PITCH_BIAS) * Math.PI) / 180
  const ca = Math.cos(a)
  const sa = Math.sin(a)
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  let cx = 0
  let cy = 0
  let cz = 0
  for (const p of reference) {
    cx += p.x
    cy += p.y
    cz += p.z
  }
  cx /= reference.length
  cy /= reference.length
  cz /= reference.length
  return points.map((p) => {
    // Camera axes: X = image x, Y = up, Z = towards the camera.
    const X = p.x - cx
    const Y = -(p.y - cy)
    const Z = -(p.z - cz)
    // Undo yaw (about Y), then pitch (about X).
    const X1 = X * ca - Z * sa
    const Z1 = X * sa + Z * ca
    const Y2 = Y * cb - Z1 * sb
    const Z2 = Y * sb + Z1 * cb
    return { x: cx + X1, y: cy - Y2, z: cz - Z2 }
  })
}
