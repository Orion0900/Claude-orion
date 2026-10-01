import { CANONICAL_VERTICES, MIRROR } from './canonical'
import { rotate } from './geometry'
import type { Vec2 } from './types'

/** Every left/right landmark pair once, as [subject's right, subject's left]. */
export const BILATERAL_PAIRS: readonly (readonly [number, number])[] = MIRROR.flatMap((j, i) =>
  j !== i && CANONICAL_VERTICES[i * 3] < 0 ? [[i, j] as const] : [],
)

/** Mesh landmarks that sit on the midline of the face. */
export const MIDLINE_POINTS: readonly number[] = MIRROR.flatMap((j, i) => (j === i ? [i] : []))

/**
 * The face's own axes in the photo. `angle` is the direction of the face's
 * left–right axis (subject's right to left) in image coordinates, so turning
 * the photo by −angle about `center` stands the face upright.
 */
export interface FaceFrame {
  center: Vec2
  angle: number
}

/**
 * Finds the face's horizontal from every mirrored pair of landmarks at once.
 * One pair (the inner eye corners, say) would inherit that feature's own
 * asymmetry; hundreds of pairs, weighted by their span, average it away.
 */
export function computeFrame(landmarks: readonly Vec2[]): FaceFrame {
  let sx = 0
  let sy = 0
  let cx = 0
  let cy = 0
  for (const [r, l] of BILATERAL_PAIRS) {
    sx += landmarks[l].x - landmarks[r].x
    sy += landmarks[l].y - landmarks[r].y
    cx += landmarks[l].x + landmarks[r].x
    cy += landmarks[l].y + landmarks[r].y
  }
  const n = BILATERAL_PAIRS.length * 2
  return { center: { x: cx / n, y: cy / n }, angle: Math.atan2(sy, sx) }
}

export const toUpright = (frame: FaceFrame, p: Vec2): Vec2 => rotate(p, frame.center, -frame.angle)
export const fromUpright = (frame: FaceFrame, p: Vec2): Vec2 => rotate(p, frame.center, frame.angle)
