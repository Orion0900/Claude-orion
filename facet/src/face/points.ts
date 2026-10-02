import { toUpright, type FaceFrame } from './frame'
import { dist, lerp, mid, signedDistance } from './geometry'
import { EYE_LEFT, EYE_RIGHT, GONION_CANDIDATES, IRIS_LEFT, IRIS_RIGHT, LM, ZYGION_CANDIDATES } from './indices'
import type { Vec2 } from './types'

/**
 * The anthropometric points the measurements are taken between, named after
 * the landmarks of facial anthropometry (Farkas). Each starts where the face
 * mesh puts it and can be dragged to where it really is.
 */
export const FRONT_POINTS = [
  { id: 'tr', name: 'Hairline', hint: 'Where the hair begins, at the centre of the forehead.' },
  { id: 'g', name: 'Brow line', hint: 'The smooth spot between the eyebrows, level with them.' },
  { id: 'sn', name: 'Base of the nose', hint: 'Where the underside of the nose meets the upper lip.' },
  { id: 'ls', name: 'Top of the upper lip', hint: 'The centre of the upper lip’s top edge.' },
  { id: 'sto', name: 'Lip line', hint: 'Where the lips meet, at the centre.' },
  { id: 'li', name: 'Bottom of the lower lip', hint: 'The centre of the lower lip’s bottom edge.' },
  { id: 'me', name: 'Bottom of the chin', hint: 'The lowest point of the chin.' },
  { id: 'pR', name: 'Right pupil', hint: 'The centre of your right pupil.' },
  { id: 'pL', name: 'Left pupil', hint: 'The centre of your left pupil.' },
  { id: 'exR', name: 'Right eye, outer corner', hint: 'Where the eyelids meet at the outer corner.' },
  { id: 'enR', name: 'Right eye, inner corner', hint: 'Where the eyelids meet beside the nose.' },
  { id: 'enL', name: 'Left eye, inner corner', hint: 'Where the eyelids meet beside the nose.' },
  { id: 'exL', name: 'Left eye, outer corner', hint: 'Where the eyelids meet at the outer corner.' },
  { id: 'alR', name: 'Right nostril wing', hint: 'The widest point of the nose on this side.' },
  { id: 'alL', name: 'Left nostril wing', hint: 'The widest point of the nose on this side.' },
  { id: 'chR', name: 'Right mouth corner', hint: 'Where the lips meet at the corner.' },
  { id: 'chL', name: 'Left mouth corner', hint: 'Where the lips meet at the corner.' },
  { id: 'zyR', name: 'Right cheekbone', hint: 'The widest point of the face on this side.' },
  { id: 'zyL', name: 'Left cheekbone', hint: 'The widest point of the face on this side.' },
  { id: 'goR', name: 'Right jaw angle', hint: 'Where the jawline turns up towards the ear.' },
  { id: 'goL', name: 'Left jaw angle', hint: 'Where the jawline turns up towards the ear.' },
  { id: 'ftR', name: 'Right temple', hint: 'The edge of the forehead at brow height.' },
  { id: 'ftL', name: 'Left temple', hint: 'The edge of the forehead at brow height.' },
] as const

export type FrontPointId = (typeof FRONT_POINTS)[number]['id']
export type FrontPoints = Record<FrontPointId, Vec2>

/**
 * The mesh's eye-corner points sit on the lid margins a little inside the
 * true corners: the inner one stops at the edge of the white rather than the
 * pink caruncle, the outer one short of where the lids meet. Nudging each a
 * set fraction towards the next ring of mesh points lands on the anatomical
 * canthi that published eye measurements use.
 */
const INNER_CORNER_SHIFT = 0.3
const OUTER_CORNER_SHIFT = 0.6
/**
 * Likewise the mesh's widest nose points sit in the crease beside the nostril
 * wing, a little outside its edge; a step towards the wing lands on it.
 */
const ALAR_SHIFT = 0.3

/** How the hairline point was arrived at. */
export type HairlineSource = 'detected' | 'estimated' | 'adjusted'

/**
 * Picks the anthropometric points from the mesh. `lm` are the landmarks in
 * the space the points are wanted in; `upright` those same landmarks turned
 * upright, used only to choose between candidate points (the widest cheek
 * point, the sharpest jaw corner) so the choice doesn't depend on head tilt.
 */
export function meshPoints(lm: readonly Vec2[], upright: readonly Vec2[], hairline: Vec2 | null): FrontPoints {
  const widest = (candidates: number[], side: 1 | -1) =>
    candidates.reduce((best, i) => (upright[i].x * side > upright[best].x * side ? i : best))
  const jawCorner = (candidates: number[], top: number) => {
    const a = upright[top]
    const b = upright[LM.menton]
    return candidates.reduce((best, i) =>
      Math.abs(signedDistance(upright[i], a, b)) > Math.abs(signedDistance(upright[best], a, b)) ? i : best,
    )
  }
  // The brow line runs through the middle of the brows: halfway between the
  // mesh's points at their top (9) and bottom (8) edges.
  const g = mid(lm[LM.glabella], lm[LM.browCenter])
  const sn = lm[LM.subnasale]
  return {
    // Without a hairline, assume the classical canon: upper third = middle third.
    tr: hairline ?? { x: g.x - (sn.x - g.x), y: g.y - (sn.y - g.y) },
    g,
    sn,
    ls: lm[LM.upperLipTop],
    sto: mid(lm[LM.upperLipInner], lm[LM.lowerLipInner]),
    li: lm[LM.lowerLipBottom],
    me: lm[LM.menton],
    pR: lm[IRIS_RIGHT.center],
    pL: lm[IRIS_LEFT.center],
    exR: lerp(lm[EYE_RIGHT.outer], lm[EYE_RIGHT.outerRing], OUTER_CORNER_SHIFT),
    enR: lerp(lm[EYE_RIGHT.inner], lm[EYE_RIGHT.innerRing], INNER_CORNER_SHIFT),
    enL: lerp(lm[EYE_LEFT.inner], lm[EYE_LEFT.innerRing], INNER_CORNER_SHIFT),
    exL: lerp(lm[EYE_LEFT.outer], lm[EYE_LEFT.outerRing], OUTER_CORNER_SHIFT),
    alR: lerp(lm[LM.alarRight], lm[LM.alarInnerRight], ALAR_SHIFT),
    alL: lerp(lm[LM.alarLeft], lm[LM.alarInnerLeft], ALAR_SHIFT),
    chR: lm[LM.mouthRight],
    chL: lm[LM.mouthLeft],
    zyR: lm[widest(ZYGION_CANDIDATES.right, -1)],
    zyL: lm[widest(ZYGION_CANDIDATES.left, 1)],
    goR: lm[jawCorner(GONION_CANDIDATES.right, 93)],
    goL: lm[jawCorner(GONION_CANDIDATES.left, 323)],
    ftR: lm[LM.foreheadRight],
    ftL: lm[LM.foreheadLeft],
  }
}

export type PointAdjustments = Partial<Record<FrontPointId, Vec2>>

/**
 * Applies the user's corrections. Adjustments are stored in photo pixels;
 * `shift` carries each correction into another space (the frontalized one)
 * by moving the point there by the same offset it was moved in the photo.
 */
export function withAdjustments(
  photo: FrontPoints,
  target: FrontPoints,
  adjustments: PointAdjustments,
): FrontPoints {
  const out = { ...target }
  for (const [id, p] of Object.entries(adjustments) as [FrontPointId, Vec2][]) {
    if (!p) continue
    out[id] = { x: target[id].x + (p.x - photo[id].x), y: target[id].y + (p.y - photo[id].y) }
  }
  return out
}

/** Points turned upright in a face frame. */
export function uprightPoints(points: FrontPoints, frame: FaceFrame): FrontPoints {
  const out = {} as FrontPoints
  for (const id of Object.keys(points) as FrontPointId[]) out[id] = toUpright(frame, points[id])
  return out
}

/** A rough size for the face, used to scale tolerances: the cheekbone width. */
export const faceWidth = (p: FrontPoints) => dist(p.zyR, p.zyL)
