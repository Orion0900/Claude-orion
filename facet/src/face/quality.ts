import type { PixelStats } from './pixels'
import { PITCH_BIAS, type HeadPose } from './pose'
import type { GroupId } from './metrics/types'

export type CheckStatus = 'good' | 'warn' | 'bad'

export interface QualityCheck {
  id: 'pose' | 'tilt' | 'expression' | 'eyes' | 'resolution' | 'light' | 'evenness' | 'sharpness' | 'distance' | 'hairline'
  status: CheckStatus
  title: string
  detail: string
  /** Measurement groups this issue makes less reliable. */
  affects: GroupId[]
}

export interface QualityReport {
  checks: QualityCheck[]
  overall: 'good' | 'fair' | 'poor'
  /** Estimated camera distance in cm, when the photo says what lens took it. */
  distanceCm: number | null
}

export interface QualityInput {
  pose: HeadPose | null
  blendshapes: Record<string, number>
  pixels: PixelStats
  /** Cheekbone width in photo pixels. */
  faceWidthPx: number
  /** Iris diameter in photo pixels. */
  irisPx: number
  imageDiagonalPx: number
  focal35: number | null
  hairline: 'detected' | 'adjusted' | 'estimated' | 'hidden'
}

/** Average adult visible iris diameter, mm: the ruler every face carries. */
export const IRIS_MM = 11.7

/** Blur threshold on the fixed-scale Laplacian spread; see measurePixels. */
const SHARP_WARN = 6
const SHARP_BAD = 3.5

const side = (deg: number, pos: string, neg: string) => (deg > 0 ? pos : neg)

export function assessQuality(q: QualityInput): QualityReport {
  const checks: QualityCheck[] = []
  const add = (c: QualityCheck) => checks.push(c)

  if (q.pose) {
    const { yaw } = q.pose
    // The model reads about five degrees of downward pitch on a level head.
    const pitch = q.pose.pitch + PITCH_BIAS
    const turned = Math.abs(yaw)
    const tipped = Math.abs(pitch)
    if (turned <= 4 && tipped <= 7) {
      add({ id: 'pose', status: 'good', title: 'Facing the camera', detail: 'Your head is square to the lens.', affects: [] })
    } else {
      const parts: string[] = []
      if (turned > 4) parts.push(`turned about ${Math.round(turned)}° to your ${side(yaw, 'left', 'right')}`)
      if (tipped > 7) parts.push(`chin ${side(pitch, 'raised', 'lowered')} about ${Math.round(tipped)}°`)
      const bad = turned > 12 || tipped > 15
      add({
        id: 'pose',
        status: bad ? 'bad' : 'warn',
        title: bad ? 'Head not facing the camera' : 'Head slightly turned',
        detail: `Your head is ${parts.join(' and ')}. The measurements are corrected for it, but ${turned > 4 ? 'symmetry and widths' : 'vertical proportions'} are less certain. Look straight into the lens for the most reliable result.`,
        affects: turned > 4 ? ['symmetry', 'eyes', 'proportions'] : ['proportions', 'lips'],
      })
    }
    if (Math.abs(q.pose.roll) > 8) {
      add({ id: 'tilt', status: 'good', title: 'Head tilt corrected', detail: `Your head was tilted about ${Math.round(Math.abs(q.pose.roll))}°; the analysis straightens it.`, affects: [] })
    }
  }

  const b = q.blendshapes
  const smile = Math.max(b.mouthSmileLeft ?? 0, b.mouthSmileRight ?? 0)
  const open = b.jawOpen ?? 0
  const raised = Math.max(b.browInnerUp ?? 0, b.browOuterUpLeft ?? 0, b.browOuterUpRight ?? 0)
  const expression: string[] = []
  if (smile > 0.35) expression.push('smiling')
  if (open > 0.12) expression.push('mouth open')
  if (raised > 0.45) expression.push('eyebrows raised')
  if (expression.length) {
    const strong = smile > 0.7 || open > 0.3
    add({
      id: 'expression',
      status: strong ? 'bad' : 'warn',
      title: 'Not a neutral expression',
      detail: `Detected: ${expression.join(', ')}. Expressions change mouth width, lip heights, eye shape and brow position. Relax your face, lips together, for these to be accurate.`,
      affects: ['lips', 'eyes', 'jaw'],
    })
  } else {
    add({ id: 'expression', status: 'good', title: 'Neutral expression', detail: 'Relaxed face, lips together.', affects: [] })
  }

  const blink = Math.max(b.eyeBlinkLeft ?? 0, b.eyeBlinkRight ?? 0)
  if (blink > 0.5) {
    add({ id: 'eyes', status: blink > 0.75 ? 'bad' : 'warn', title: 'Eyes partly closed', detail: 'Eye shape and canthal tilt need the eyes fully open.', affects: ['eyes'] })
  }

  if (q.faceWidthPx < 220) {
    add({ id: 'resolution', status: 'bad', title: 'Face too small in the photo', detail: 'Get closer or crop less: the face should fill most of the frame.', affects: ['proportions', 'eyes', 'nose', 'lips', 'jaw', 'symmetry'] })
  } else if (q.faceWidthPx < 360) {
    add({ id: 'resolution', status: 'warn', title: 'Low resolution', detail: 'Small features like the eye corners are only a few pixels across. A sharper, closer photo helps.', affects: ['eyes', 'lips'] })
  }

  const light = q.pixels.brightness
  if (light < 60 || light > 225 || q.pixels.clipped > 0.15) {
    add({ id: 'light', status: 'bad', title: light < 60 ? 'Too dark' : 'Overexposed', detail: 'Face a window or a soft light; avoid direct sun and flash.', affects: ['proportions', 'eyes', 'jaw'] })
  } else if (light < 85 || light > 205 || q.pixels.clipped > 0.05) {
    add({ id: 'light', status: 'warn', title: light < 85 ? 'A little dark' : 'A little bright', detail: 'Softer, even light makes edges like the jaw and hairline easier to find.', affects: ['jaw'] })
  }

  if (q.pixels.sideBalance > 1.6) {
    add({ id: 'evenness', status: 'bad', title: 'Lit from one side', detail: 'Strong side light hides one half of the face and skews the symmetry reading. Face the light source.', affects: ['symmetry', 'jaw'] })
  } else if (q.pixels.sideBalance > 1.3) {
    add({ id: 'evenness', status: 'warn', title: 'Uneven lighting', detail: 'One side of your face is noticeably darker.', affects: ['symmetry'] })
  }

  if (q.pixels.sharpness < SHARP_BAD) {
    add({ id: 'sharpness', status: 'bad', title: 'Blurry photo', detail: 'Hold the camera steady or use more light.', affects: ['eyes', 'lips'] })
  } else if (q.pixels.sharpness < SHARP_WARN) {
    add({ id: 'sharpness', status: 'warn', title: 'Slightly soft', detail: 'Fine edges are a little blurred.', affects: ['eyes'] })
  }

  // Distance from the lens: focal length in pixels × real iris ÷ iris in pixels.
  let distanceCm: number | null = null
  if (q.focal35 && q.irisPx > 0) {
    const focalPx = (q.focal35 / Math.hypot(36, 24)) * q.imageDiagonalPx
    distanceCm = (focalPx * IRIS_MM) / q.irisPx / 10
    if (distanceCm < 50) {
      add({ id: 'distance', status: 'bad', title: `Taken close up (≈ ${Math.round(distanceCm)} cm)`, detail: 'At arm’s length, perspective makes the nose look larger and the face narrower than they are. Have someone take it from 1–2 m with the zoom lens.', affects: ['nose', 'proportions', 'eyes'] })
    } else if (distanceCm < 90) {
      add({ id: 'distance', status: 'warn', title: `Taken fairly close (≈ ${Math.round(distanceCm)} cm)`, detail: 'Some perspective distortion: the nose reads a little wide. From 1.5 m or more it disappears.', affects: ['nose'] })
    } else {
      add({ id: 'distance', status: 'good', title: `Good distance (≈ ${Math.round(distanceCm)} cm)`, detail: 'Far enough that perspective doesn’t distort the proportions.', affects: [] })
    }
  }

  if (q.hairline === 'estimated' || q.hairline === 'hidden') {
    add({ id: 'hairline', status: 'warn', title: 'Hairline not found', detail: 'The upper third is estimated. Drag the hairline point into place, or pull your hair back, for true facial thirds.', affects: ['proportions'] })
  }

  const bad = checks.filter((c) => c.status === 'bad').length
  const warn = checks.filter((c) => c.status === 'warn').length
  return { checks, overall: bad ? 'poor' : warn > 1 ? 'fair' : 'good', distanceCm }
}
