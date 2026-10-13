/**
 * Where the investing goes over the years: a starting amount, a monthly
 * contribution and a yearly return, compounded monthly.
 */
import { roundCents } from './money'

export interface Projection {
  /** Invested already, up front. */
  start: number
  /** Added each month. */
  monthly: number
  /** Going into the 401k each month, on top of `monthly`. */
  k401: number
  /** Yearly return as a fraction: 0.07 is 7%. */
  rate: number
  years: number
}

export const MAX_YEARS = 60
export const MAX_RATE = 0.3

export interface ProjectionPoint {
  year: number
  /** What the investments are worth at the end of the year. */
  value: number
  /** What was put in by then: the start plus every contribution. */
  contributed: number
}

/** Year 0 to the last year, month by month underneath: each month earns its share of the return, then the contribution goes in. */
export function project(p: Projection): ProjectionPoint[] {
  const monthlyRate = p.rate / 12
  const points: ProjectionPoint[] = [{ year: 0, value: p.start, contributed: p.start }]
  let value = p.start
  for (let year = 1; year <= p.years; year++) {
    for (let m = 0; m < 12; m++) value = value * (1 + monthlyRate) + p.monthly + p.k401
    points.push({ year, value: roundCents(value), contributed: roundCents(p.start + (p.monthly + p.k401) * 12 * year) })
  }
  return points
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const finite = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function normalizeProjection(raw: unknown, monthlyFallback: number, k401Fallback = 0): Projection {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>
  return {
    start: Math.max(0, roundCents(finite(r.start, 0))),
    monthly: Math.max(0, roundCents(finite(r.monthly, monthlyFallback))),
    k401: Math.max(0, roundCents(finite(r.k401, k401Fallback))),
    rate: clamp(finite(r.rate, 0.07), 0, MAX_RATE),
    years: clamp(Math.round(finite(r.years, 30)), 1, MAX_YEARS),
  }
}

/** Round, readable steps for an axis that reaches `max`, about `count` of them. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw)!
  const ticks: number[] = []
  for (let t = 0; t <= max + step * 0.001; t += step) ticks.push(t)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

/** $1.2M, $850k, $4,000: short enough for an axis. */
export function compactMoney(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e6) return `$${trim(n / 1e6)}M`
  if (abs >= 1e4) return `$${trim(n / 1e3)}k`
  return `$${Math.round(n).toLocaleString('en-US')}`
}
const trim = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ''))
