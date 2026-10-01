import { classifyShape, shapeFeatures, type FaceShapeResult } from './faceShape'
import { computeFrame, toUpright, type FaceFrame } from './frame'
import { dist } from './geometry'
import { IRIS_LEFT, IRIS_RIGHT, LM } from './indices'
import { FRONT_METRICS, type FrontContext, type HairlineState, type Space } from './metrics/front'
import { weightedMean } from './metrics/scoring'
import type { GroupId, MetricResult } from './metrics/types'
import type { PixelStats } from './pixels'
import { meshPoints, uprightPoints, type FrontPointId, type FrontPoints, type PointAdjustments } from './points'
import { faceForward, poseFromMatrix, type HeadPose } from './pose'
import { assessQuality, IRIS_MM, type QualityReport } from './quality'
import { analyzeSymmetry, type SymmetryResult } from './symmetry'
import type { AnalysisSettings, FaceDetection, Vec2 } from './types'

export interface FrontInput {
  detection: FaceDetection
  pixels: PixelStats
  adjustments: PointAdjustments
  /** The user says their hairline is hidden or receding: estimate it instead. */
  hairlineHidden?: boolean
  focal35?: number | null
}

export interface GroupScore {
  id: GroupId
  /** 0–10, or null when nothing in the group is graded. */
  score: number | null
}

export interface FrontAnalysis {
  /** Turns the photo upright; every drawing is in that upright space. */
  frame: FaceFrame
  pose: HeadPose | null
  /** Key points in photo pixels, with the user's corrections applied: what the point editor shows. */
  photoPoints: FrontPoints
  /** Key points where the mesh alone puts them, in photo pixels. */
  meshPhotoPoints: FrontPoints
  display: { points: FrontPoints; landmarks: Vec2[] }
  metrics: MetricResult[]
  groups: GroupScore[]
  /** 0–100. */
  harmony: number
  symmetry: SymmetryResult
  shape: FaceShapeResult
  quality: QualityReport
  mmPerPx: number | null
  /** Nasion to chin in mm, front on: the scale a side profile borrows. */
  faceHeightMm: number | null
  hairline: HairlineState
}

/** How much each group counts towards the harmony score. */
export const GROUP_WEIGHTS: Record<GroupId, number> = {
  proportions: 3,
  eyes: 2,
  nose: 1,
  lips: 1.5,
  jaw: 1.5,
  symmetry: 2,
  profile: 3,
}

/** Minimum confidence for the photo's own hairline to be trusted without a tap. */
const HAIRLINE_CONFIDENCE = 0.15

export function hairlineState(input: FrontInput): HairlineState {
  if (input.adjustments.tr) return 'adjusted'
  if (input.hairlineHidden) return 'hidden'
  const h = input.pixels.hairline
  return h.point && h.confidence >= HAIRLINE_CONFIDENCE ? 'detected' : 'estimated'
}

/** The mesh-only key points for a detection, in photo pixels. */
export function basePoints(input: FrontInput): { points: FrontPoints; frame: FaceFrame } {
  const lm = input.detection.landmarks
  const frame = computeFrame(lm)
  const upright = lm.map((p) => toUpright(frame, p))
  const state = hairlineState(input)
  const hairline = state === 'detected' ? input.pixels.hairline.point : null
  return { points: meshPoints(lm, upright, hairline), frame }
}

export function analyzeFront(input: FrontInput, settings: AnalysisSettings): FrontAnalysis {
  const det = input.detection
  const lm3 = det.landmarks
  const state = hairlineState(input)

  // Display space: the photo, turned upright.
  const { points: meshPhotoPoints, frame } = basePoints(input)
  const photoPoints: FrontPoints = { ...meshPhotoPoints }
  for (const [id, p] of Object.entries(input.adjustments) as [FrontPointId, Vec2][]) if (p) photoPoints[id] = p
  const displayLm = lm3.map((p) => toUpright(frame, p))
  const displayMesh = uprightPoints(meshPhotoPoints, frame)
  const displayPoints = uprightPoints(photoPoints, frame)
  const D: Space = { lm: (i) => displayLm[i], p: displayPoints }

  // Measuring space: upright, then turned to face the camera squarely.
  const pose = det.matrix ? poseFromMatrix(det.matrix) : null
  const upright3 = lm3.map((p) => ({ ...toUpright(frame, p), z: p.z }))
  const front3 = faceForward(upright3, pose)
  const mFrame = computeFrame(front3)
  const measureLm = front3.map((p) => toUpright(mFrame, p))
  const hairlinePhoto = state === 'detected' ? input.pixels.hairline.point : null
  const frontHairline = hairlinePhoto
    ? faceForward([{ ...toUpright(frame, hairlinePhoto), z: lm3[LM.foreheadTop].z }], pose, upright3)[0]
    : null
  const measureMesh = uprightPoints(meshPoints(front3, measureLm, frontHairline), mFrame)
  // Carry each correction across as the same offset, measured upright.
  const measurePoints: FrontPoints = { ...measureMesh }
  for (const id of Object.keys(input.adjustments) as FrontPointId[]) {
    measurePoints[id] = {
      x: measureMesh[id].x + (displayPoints[id].x - displayMesh[id].x),
      y: measureMesh[id].y + (displayPoints[id].y - displayMesh[id].y),
    }
  }
  const M: Space = { lm: (i) => measureLm[i], p: measurePoints }

  // Scale from the irises, sanity-checked against a plausible pupil distance.
  const irisPx = (dist(measureLm[IRIS_RIGHT.edges[0]], measureLm[IRIS_RIGHT.edges[2]]) + dist(measureLm[IRIS_LEFT.edges[0]], measureLm[IRIS_LEFT.edges[2]])) / 2
  let mmPerPx: number | null = irisPx > 0 ? IRIS_MM / irisPx : null
  if (mmPerPx) {
    const ipd = dist(measurePoints.pR, measurePoints.pL) * mmPerPx
    if (ipd < 48 || ipd > 78) mmPerPx = null
  }

  const ctx: FrontContext = { M, D, sex: settings.sex, mm: mmPerPx, hairline: state }
  const metrics = FRONT_METRICS.map((fn) => fn(ctx))
  const symmetry = analyzeSymmetry(measureLm, measurePoints, mmPerPx)
  const shape = classifyShape(shapeFeatures(measurePoints, measureLm[LM.chinRight], measureLm[LM.chinLeft]))

  const quality = assessQuality({
    pose,
    blendshapes: det.blendshapes,
    pixels: input.pixels,
    faceWidthPx: dist(displayPoints.zyR, displayPoints.zyL),
    irisPx: (dist(lm3[IRIS_RIGHT.edges[0]], lm3[IRIS_RIGHT.edges[2]]) + dist(lm3[IRIS_LEFT.edges[0]], lm3[IRIS_LEFT.edges[2]])) / 2,
    imageDiagonalPx: Math.hypot(det.width, det.height),
    focal35: input.focal35 ?? null,
    hairline: state,
  })
  // Flag measurements the photo undermines.
  for (const check of quality.checks) {
    if (check.status === 'good') continue
    for (const m of metrics) {
      if (check.affects.includes(m.group) && !m.caveat) m.caveat = check.title
    }
  }

  const groups = groupScores(metrics, symmetry.score)
  return {
    frame,
    pose,
    photoPoints,
    meshPhotoPoints,
    display: { points: displayPoints, landmarks: displayLm },
    metrics,
    groups,
    harmony: harmonyOf(groups),
    symmetry,
    shape,
    quality,
    mmPerPx,
    faceHeightMm: mmPerPx ? dist(measureLm[LM.nasion], measurePoints.me) * mmPerPx : null,
    hairline: state,
  }
}

export function groupScores(metrics: readonly MetricResult[], symmetryScore: number): GroupScore[] {
  const ids: GroupId[] = ['proportions', 'eyes', 'nose', 'lips', 'jaw', 'symmetry', 'profile']
  return ids.map((id) => {
    if (id === 'symmetry') return { id, score: symmetryScore / 10 }
    return { id, score: weightedMean(metrics.filter((m) => m.group === id)) }
  })
}

/** 0–100: the groups' scores, weighted. */
export function harmonyOf(groups: readonly GroupScore[]): number {
  const mean = weightedMean(groups.map((g) => ({ score: g.score ?? undefined, weight: GROUP_WEIGHTS[g.id] })))
  return mean === null ? 0 : Math.round(mean * 10)
}
