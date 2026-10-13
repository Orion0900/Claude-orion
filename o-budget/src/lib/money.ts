/**
 * Dollars in and out of text. Whole dollars read as "$7,800" and only show
 * cents when there are some, so a $4.99 subscription keeps its 99.
 */

const WHOLE = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const CENTS = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
const GROUPED = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export const roundCents = (n: number) => Math.round(n * 100) / 100

const hasCents = (n: number) => Math.abs(roundCents(n) % 1) > 0

/** $7,800, $4.99, -$53. */
export function money(n: number): string {
  const value = roundCents(n) || 0
  return (hasCents(value) ? CENTS : WHOLE).format(value)
}

/** An amount as it sits in a field, after the "$": 7,800 or 4.99 or 4.50. */
export function moneyField(n: number): string {
  const value = roundCents(n) || 0
  return hasCents(value) ? CENTS.format(value).replace('$', '') : GROUPED.format(value)
}

/** The same amount with nothing in the way of typing over it: 7800, 4.5. */
export function moneyDraft(n: number): string {
  return String(roundCents(n) || 0)
}

/**
 * Reads what someone typed into an amount: "$1,500", "1500.5" and " 80 " all
 * work. Empty or unreadable text gives null, so the caller can keep the
 * last good number while the field is half typed.
 */
export function parseMoney(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '')
  if (!/^\d*\.?\d*$/.test(cleaned) || !/\d/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? roundCents(n) : null
}

/** A share of a whole as a percent: 51.3%, 50%. */
export function percent(fraction: number): string {
  return `${percentField(fraction)}%`
}

/** The number part of a percent, to one decimal place and no trailing .0. */
export function percentField(fraction: number): string {
  const p = Math.round((Number.isFinite(fraction) ? fraction : 0) * 1000) / 10
  return Number.isInteger(p) ? p.toFixed(0) : p.toFixed(1)
}

/** "51.3" or "51.3%" back to 0.513; null while it isn't a number yet. */
export function parsePercent(text: string): number | null {
  const cleaned = text.replace(/[%\s]/g, '')
  if (!/^\d*\.?\d*$/.test(cleaned) || !/\d/.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n / 100 : null
}
