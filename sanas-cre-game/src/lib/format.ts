/** Numbers the way a real estate investor reads them. */
import { TYPES } from '../engine/data'
import type { Asset } from '../engine/types'

export function money(x: number, digits?: number): string {
  if (!Number.isFinite(x)) return '–'
  const a = Math.abs(x)
  const sign = x < 0 ? '−' : ''
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(digits ?? (a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2))}B`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(digits ?? (a >= 1e8 ? 0 : 1))}M`
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(digits ?? 0)}K`
  return `${sign}$${a.toFixed(0)}`
}

export function signedMoney(x: number): string {
  return `${x > 0 ? '+' : ''}${money(x)}`
}

export function pct(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–'
  return `${(x * 100).toFixed(digits)}%`
}

export function bp(x: number): string {
  const v = Math.round(x * 10000)
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} bp`
}

export function mult(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–'
  return `${x.toFixed(2)}x`
}

export function num(x: number): string {
  return Math.round(x).toLocaleString('en-US')
}

export function sizeLabel(a: Pick<Asset, 'size' | 'type' | 'count'>): string {
  const spec = TYPES[a.type]
  const size = spec.unit === 'MW' ? (a.size >= 10 ? Math.round(a.size).toString() : a.size.toFixed(1).replace(/\.0$/, '')) : num(a.size)
  const what = spec.unit === 'SF' ? 'SF' : spec.unit
  const buildings = a.count > 1 ? ` in ${a.count} buildings` : ''
  return `${size} ${what}${buildings}`
}

/** Price per unit in each sector's own convention. */
export function perUnit(price: number, a: Pick<Asset, 'size' | 'type'>): string {
  const spec = TYPES[a.type]
  const v = price / Math.max(1e-9, a.size)
  if (spec.unit === 'SF') return `$${Math.round(v)}/SF`
  if (spec.unit === 'MW') return `${money(v)}/MW`
  return `${money(v)}/${spec.unitOne}`
}

/** Rent in each sector's own convention: per SF a year, per apartment a month, revenue per key a year, per kW a month. */
export function rentLabel(rent: number, a: Pick<Asset, 'type'>): string {
  const spec = TYPES[a.type]
  if (spec.unit === 'SF') return `$${rent.toFixed(2)}/SF`
  if (a.type === 'multifamily') return `$${num(rent / 12)}/mo`
  if (a.type === 'hotel') return `${money(rent)}/key`
  return `$${Math.round(rent / 12 / 1000)}/kW-mo`
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
