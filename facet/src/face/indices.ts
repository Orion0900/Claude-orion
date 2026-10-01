// Named groups of MediaPipe face-mesh landmark indices. "Right" and "left"
// are the subject's own: their right eye appears on the left of an unmirrored
// photo.

/** Face outline, clockwise from the top of the forehead. */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

/** Lower face outline on each side, from the cheek down to the chin point. */
export const JAW_RIGHT = [93, 132, 58, 172, 136, 150, 149, 176, 148, 152]
export const JAW_LEFT = [323, 361, 288, 397, 365, 379, 378, 400, 377, 152]

export const MIDLINE = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152]

export const EYE_RIGHT = {
  outer: 33,
  inner: 133,
  top: 159,
  bottom: 145,
  upper: [33, 246, 161, 160, 159, 158, 157, 173, 133],
  lower: [33, 7, 163, 144, 145, 153, 154, 155, 133],
  /** The next ring of mesh points out from the lid margin. */
  outerRing: 130,
  innerRing: 243,
}
export const EYE_LEFT = {
  outer: 263,
  inner: 362,
  top: 386,
  bottom: 374,
  upper: [263, 466, 388, 387, 386, 385, 384, 398, 362],
  lower: [263, 249, 390, 373, 374, 380, 381, 382, 362],
  outerRing: 359,
  innerRing: 463,
}

/** Iris centre and its right, top, left and bottom edge points (image directions). */
export const IRIS_RIGHT = { center: 468, edges: [469, 470, 471, 472] }
export const IRIS_LEFT = { center: 473, edges: [474, 475, 476, 477] }

/** Brows from the inner end (by the nose) to the tail. */
export const BROW_RIGHT = { upper: [107, 66, 105, 63, 70], lower: [55, 65, 52, 53, 46] }
export const BROW_LEFT = { upper: [336, 296, 334, 293, 300], lower: [285, 295, 282, 283, 276] }

export const LIPS_OUTER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146]
export const LIPS_INNER = [78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]

export const LM = {
  foreheadTop: 10,
  forehead: 151,
  glabella: 9,
  browCenter: 8,
  nasion: 168,
  pronasale: 4,
  noseTipLow: 1,
  subnasale: 2,
  upperLipTop: 0,
  upperLipInner: 13,
  lowerLipInner: 14,
  lowerLipBottom: 17,
  mentolabial: 18,
  chin: 175,
  menton: 152,
  alarRight: 129,
  alarLeft: 358,
  alarInnerRight: 48,
  alarInnerLeft: 278,
  mouthRight: 61,
  mouthLeft: 291,
  foreheadRight: 21,
  foreheadLeft: 251,
  chinRight: 176,
  chinLeft: 400,
} as const

/** Candidates for the widest point of the cheekbones, per side. */
export const ZYGION_CANDIDATES = { right: [162, 127, 234, 93], left: [389, 356, 454, 323] }
/** Candidates for the jaw angle, per side. */
export const GONION_CANDIDATES = { right: [58, 172, 136], left: [288, 397, 365] }
