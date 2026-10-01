import type { Band, Range } from './types'

/** Signed distance outside a range: negative below it, positive above, 0 within. */
export function outside(v: number, r: Range): number {
  return v < r.lo ? v - r.lo : v > r.hi ? v - r.hi : 0
}

/**
 * 0–10. Anywhere inside the ideal range scores 9–10 (10 at its centre); past
 * the edge the score falls away smoothly, a tolerance `sigma` costing about
 * three points and never dropping below 1.
 */
export function scoreValue(v: number, r: Range, sigma: number): number {
  const d = outside(v, r)
  if (d === 0) {
    const half = (r.hi - r.lo) / 2
    const centre = (r.hi + r.lo) / 2
    return half === 0 ? 10 : 10 - Math.abs(v - centre) / half
  }
  return 1 + 8 * Math.exp(-0.5 * (d / sigma) ** 2)
}

export function bandOf(v: number, r: Range, sigma: number): { band: Band; dir: -1 | 0 | 1 } {
  const d = outside(v, r)
  if (d === 0) return { band: 'ideal', dir: 0 }
  const dir = d < 0 ? -1 : 1
  const k = Math.abs(d) / sigma
  return { band: k < 0.5 ? 'near' : k < 1.5 ? 'moderate' : 'notable', dir }
}

/** Weighted mean of the scores present, or null if there are none. */
export function weightedMean(items: readonly { score?: number; weight: number }[]): number | null {
  let sum = 0
  let w = 0
  for (const it of items) {
    if (it.score === undefined || it.weight <= 0) continue
    sum += it.score * it.weight
    w += it.weight
  }
  return w > 0 ? sum / w : null
}
