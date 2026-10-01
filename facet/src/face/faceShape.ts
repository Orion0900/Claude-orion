import { dist } from './geometry'
import type { FrontPoints } from './points'
import type { Vec2 } from './types'

export const FACE_SHAPES = ['oval', 'round', 'square', 'oblong', 'heart', 'diamond', 'triangle'] as const
export type FaceShape = (typeof FACE_SHAPES)[number]

export interface ShapeFeatures {
  /** Face length (hairline to chin) over cheekbone width. */
  length: number
  /** Forehead width over cheekbone width. */
  forehead: number
  /** Jaw width over cheekbone width. */
  jaw: number
  /** Chin width over jaw width: low is a tapered, pointed chin. */
  taper: number
}

export interface FaceShapeResult {
  shape: FaceShape
  runnerUp: FaceShape
  /** Probability-like share of the best match, 0–1. */
  confidence: number
  scores: Record<FaceShape, number>
  features: ShapeFeatures
}

/**
 * Each shape as the proportions that define it. Oval sits at the proportions
 * of the average face; the others move away from it in the directions the
 * usual descriptions give ("jaw as wide as the forehead", "long with straight
 * sides", "wide forehead tapering to a narrow chin").
 */
const PROTOTYPES: Record<FaceShape, ShapeFeatures> = {
  oval: { length: 1.38, forehead: 0.92, jaw: 0.78, taper: 0.4 },
  round: { length: 1.2, forehead: 0.9, jaw: 0.82, taper: 0.48 },
  square: { length: 1.22, forehead: 0.93, jaw: 0.88, taper: 0.52 },
  oblong: { length: 1.58, forehead: 0.92, jaw: 0.84, taper: 0.46 },
  heart: { length: 1.35, forehead: 0.97, jaw: 0.72, taper: 0.34 },
  diamond: { length: 1.38, forehead: 0.84, jaw: 0.74, taper: 0.36 },
  triangle: { length: 1.32, forehead: 0.84, jaw: 0.88, taper: 0.5 },
}
const SCALE: ShapeFeatures = { length: 0.08, forehead: 0.035, jaw: 0.035, taper: 0.05 }

export function shapeFeatures(p: FrontPoints, chinR: Vec2, chinL: Vec2): ShapeFeatures {
  const width = p.zyL.x - p.zyR.x
  const jaw = p.goL.x - p.goR.x
  return {
    length: (p.me.y - p.tr.y) / width,
    forehead: (p.ftL.x - p.ftR.x) / width,
    jaw: jaw / width,
    taper: dist(chinR, chinL) / jaw,
  }
}

export function classifyShape(features: ShapeFeatures): FaceShapeResult {
  const logits = FACE_SHAPES.map((shape) => {
    const proto = PROTOTYPES[shape]
    let d2 = 0
    for (const k of Object.keys(SCALE) as (keyof ShapeFeatures)[]) d2 += ((features[k] - proto[k]) / SCALE[k]) ** 2
    return -0.5 * d2
  })
  const max = Math.max(...logits)
  const exp = logits.map((l) => Math.exp(l - max))
  const sum = exp.reduce((a, b) => a + b, 0)
  const scores = Object.fromEntries(FACE_SHAPES.map((s, i) => [s, exp[i] / sum])) as Record<FaceShape, number>
  const ranked = [...FACE_SHAPES].sort((a, b) => scores[b] - scores[a])
  return { shape: ranked[0], runnerUp: ranked[1], confidence: scores[ranked[0]], scores, features }
}
