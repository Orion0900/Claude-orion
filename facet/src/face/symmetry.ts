import { CANONICAL_VERTICES } from './canonical'
import { BILATERAL_PAIRS } from './frame'
import { dist, mean, toDeg } from './geometry'
import { BROW_LEFT, BROW_RIGHT, EYE_LEFT, EYE_RIGHT, FACE_OVAL, IRIS_LEFT, IRIS_RIGHT, LIPS_INNER, LIPS_OUTER, LM } from './indices'
import type { FrontPoints } from './points'
import type { Vec2 } from './types'

export type SymmetryRegion = 'eyes' | 'brows' | 'nose' | 'mouth' | 'jaw' | 'cheeks'

export interface SymmetryFinding {
  id: 'eyeLevel' | 'browLevel' | 'mouthTilt' | 'noseDeviation' | 'chinDeviation' | 'eyeSize' | 'faceHalves'
  /** Size of the difference in its natural unit (mm when scaled, % or ° otherwise). */
  amount: number
  unit: 'mm' | '%' | '°'
  /** Which side is higher, larger or deviated towards; 'right'/'left' are the subject's. */
  side: 'right' | 'left'
  /** How much it matters: 0 negligible, 1 slight, 2 noticeable. */
  level: 0 | 1 | 2
}

export interface SymmetryResult {
  /** 0–100. */
  score: number
  /** Mean distance between each point and its mirrored partner, as % of face width. */
  asymmetry: number
  regions: { id: SymmetryRegion; score: number; asymmetry: number }[]
  findings: SymmetryFinding[]
  /** Per-landmark asymmetry (% of face width), for the heat map; midline points get their offset from the midline. */
  perPoint: number[]
  /** The fitted midline, top and bottom, in the space measured. */
  midline: [Vec2, Vec2]
}

const cx = (i: number) => CANONICAL_VERTICES[i * 3]
const cy = (i: number) => CANONICAL_VERTICES[i * 3 + 1]
const cz = (i: number) => CANONICAL_VERTICES[i * 3 + 2]

const set = (...lists: number[][]) => new Set(lists.flat())
const EYES = set(EYE_RIGHT.upper, EYE_RIGHT.lower, EYE_LEFT.upper, EYE_LEFT.lower, [IRIS_RIGHT.center, IRIS_LEFT.center], [130, 243, 359, 463])
const BROWS = set(BROW_RIGHT.upper, BROW_RIGHT.lower, BROW_LEFT.upper, BROW_LEFT.lower)
const MOUTH = set(LIPS_OUTER, LIPS_INNER)
const JAW = new Set(FACE_OVAL.filter((i) => cy(i) < -1))

function regionOf(i: number): SymmetryRegion | null {
  if (EYES.has(i)) return 'eyes'
  if (BROWS.has(i)) return 'brows'
  if (MOUTH.has(i)) return 'mouth'
  if (JAW.has(i)) return 'jaw'
  if (Math.abs(cx(i)) < 2 && cy(i) > -2.3 && cy(i) < 3.3 && cz(i) > 4.6) return 'nose'
  if (Math.abs(cx(i)) > 2.5 && cy(i) > -3 && cy(i) < 2) return 'cheeks'
  return null
}

/** Mean asymmetry (% of face width) that costs one point of symmetry score. */
const POINTS_PER_PERCENT = 6

export const symmetryScore = (asymmetryPercent: number) => Math.max(0, Math.min(100, 100 - POINTS_PER_PERCENT * asymmetryPercent))

/**
 * Compares each side of the face with the other mirrored across the midline.
 * `lm` must be upright (the face's horizontal along x) — ideally frontalized
 * too, since a turned head makes the near side look wider.
 */
export function analyzeSymmetry(lm: readonly Vec2[], points: FrontPoints, mmPerPx: number | null): SymmetryResult {
  const width = dist(points.zyR, points.zyL)
  // Midline x = a + b·y, least squares through the pair midpoints.
  const mids = BILATERAL_PAIRS.map(([r, l]) => ({ x: (lm[r].x + lm[l].x) / 2, y: (lm[r].y + lm[l].y) / 2 }))
  const my = mean(mids).y
  const mx = mean(mids).x
  let sxy = 0
  let syy = 0
  for (const m of mids) {
    sxy += (m.y - my) * (m.x - mx)
    syy += (m.y - my) ** 2
  }
  const b = syy > 0 ? sxy / syy : 0
  const a = mx - b * my
  const midX = (y: number) => a + b * y

  const perPoint = new Array<number>(lm.length).fill(0)
  const regionSums = new Map<SymmetryRegion, { sum: number; n: number }>()
  let total = 0
  for (const [r, l] of BILATERAL_PAIRS) {
    const mirrored = { x: 2 * midX(lm[r].y) - lm[r].x, y: lm[r].y }
    const d = (dist(mirrored, lm[l]) / width) * 100
    perPoint[r] = d
    perPoint[l] = d
    total += d
    const region = regionOf(l)
    if (region) {
      const s = regionSums.get(region) ?? { sum: 0, n: 0 }
      s.sum += d
      s.n++
      regionSums.set(region, s)
    }
  }
  for (let i = 0; i < lm.length && i < 468; i++) {
    if (CANONICAL_VERTICES[i * 3] === 0) perPoint[i] = (Math.abs(lm[i].x - midX(lm[i].y)) / width) * 100
  }
  const asymmetry = total / BILATERAL_PAIRS.length

  const regions = (['eyes', 'brows', 'nose', 'mouth', 'jaw', 'cheeks'] as SymmetryRegion[]).map((id) => {
    const s = regionSums.get(id)
    const asym = s && s.n ? s.sum / s.n : 0
    return { id, asymmetry: asym, score: symmetryScore(asym) }
  })

  // Specific, nameable differences.
  const toUnit = (px: number): { amount: number; unit: 'mm' | '%' } =>
    mmPerPx ? { amount: px * mmPerPx, unit: 'mm' } : { amount: (px / width) * 100, unit: '%' }
  const mmLevel = (mm: number) => (mm < 1 ? 0 : mm < 2.5 ? 1 : 2)
  const pctLevel = (p: number) => (p < 0.8 ? 0 : p < 2 ? 1 : 2)
  const level = (v: { amount: number; unit: string }) => (v.unit === 'mm' ? mmLevel(v.amount) : pctLevel(v.amount))

  const findings: SymmetryFinding[] = []
  const eyeR = mean([points.enR, points.exR])
  const eyeL = mean([points.enL, points.exL])
  const eyeDy = toUnit(Math.abs(eyeR.y - eyeL.y))
  findings.push({ id: 'eyeLevel', ...eyeDy, side: eyeR.y < eyeL.y ? 'right' : 'left', level: level(eyeDy) })

  const browPeak = (brow: typeof BROW_RIGHT) => Math.min(...brow.upper.map((i) => lm[i].y))
  const browDy = toUnit(Math.abs(browPeak(BROW_RIGHT) - browPeak(BROW_LEFT)))
  findings.push({ id: 'browLevel', ...browDy, side: browPeak(BROW_RIGHT) < browPeak(BROW_LEFT) ? 'right' : 'left', level: level(browDy) })

  const mouthAngle = toDeg(Math.atan2(points.chL.y - points.chR.y, points.chL.x - points.chR.x))
  findings.push({
    id: 'mouthTilt',
    amount: Math.abs(mouthAngle),
    unit: '°',
    // Positive angle: the left corner sits lower, so the right corner is higher.
    side: mouthAngle > 0 ? 'right' : 'left',
    level: Math.abs(mouthAngle) < 1.5 ? 0 : Math.abs(mouthAngle) < 3.5 ? 1 : 2,
  })

  const noseTip = lm[LM.pronasale]
  const noseDx = noseTip.x - midX(noseTip.y)
  const nose = toUnit(Math.abs(noseDx))
  findings.push({ id: 'noseDeviation', ...nose, side: noseDx > 0 ? 'left' : 'right', level: level(nose) })

  const chinDx = points.me.x - midX(points.me.y)
  const chin = toUnit(Math.abs(chinDx))
  findings.push({ id: 'chinDeviation', ...chin, side: chinDx > 0 ? 'left' : 'right', level: level(chin) })

  const wR = dist(points.exR, points.enR)
  const wL = dist(points.exL, points.enL)
  const eyeSize = (Math.abs(wR - wL) / ((wR + wL) / 2)) * 100
  findings.push({ id: 'eyeSize', amount: eyeSize, unit: '%', side: wR > wL ? 'right' : 'left', level: eyeSize < 4 ? 0 : eyeSize < 8 ? 1 : 2 })

  const halfR = midX(points.zyR.y) - points.zyR.x
  const halfL = points.zyL.x - midX(points.zyL.y)
  const halves = (Math.abs(halfR - halfL) / ((halfR + halfL) / 2)) * 100
  findings.push({ id: 'faceHalves', amount: halves, unit: '%', side: halfR > halfL ? 'right' : 'left', level: halves < 4 ? 0 : halves < 8 ? 1 : 2 })

  const top = Math.min(...lm.slice(0, 468).map((p) => p.y))
  const bottom = Math.max(...lm.slice(0, 468).map((p) => p.y))
  return {
    score: symmetryScore(asymmetry),
    asymmetry,
    regions,
    findings,
    perPoint,
    midline: [
      { x: midX(top), y: top },
      { x: midX(bottom), y: bottom },
    ],
  }
}
