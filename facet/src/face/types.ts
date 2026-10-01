export interface Vec2 {
  x: number
  y: number
}

export interface Vec3 extends Vec2 {
  z: number
}

/**
 * One face found in a photo. Landmark x and y are image pixels; z is relative
 * depth in the same pixel scale (negative is nearer the camera), as MediaPipe
 * reports it.
 */
export interface FaceDetection {
  width: number
  height: number
  /** 478 points: the 468-point face mesh followed by 10 iris points. */
  landmarks: Vec3[]
  /** Expression coefficients, 0–1, keyed by ARKit-style blendshape name. */
  blendshapes: Record<string, number>
  /** Column-major 4×4 head pose in centimetres, or null when unavailable. */
  matrix: number[] | null
}

export type Sex = 'female' | 'male'

/** Which way the numbers are compared: the ideal ranges differ by sex. */
export interface AnalysisSettings {
  sex: Sex
}
