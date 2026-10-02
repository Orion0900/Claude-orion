/**
 * Calendar days, the way the challenge counts them: local dates written as
 * YYYY-MM-DD keys. The arithmetic runs on the date alone, in UTC, so a
 * daylight saving change can never make a day 23 or 25 hours long and knock
 * the count off by one.
 */

export type DateKey = string

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

function parts(key: DateKey): [number, number, number] {
  const [y, m, d] = key.split('-').map(Number)
  return [y, m, d]
}

function fromUtc(ms: number): DateKey {
  const date = new Date(ms)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** The local calendar day a moment falls on. */
export function dateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** True for a real date written as YYYY-MM-DD; February 30th is not one. */
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = parts(value)
  return fromUtc(Date.UTC(y, m - 1, d)) === value
}

export function addDays(key: DateKey, days: number): DateKey {
  const [y, m, d] = parts(key)
  return fromUtc(Date.UTC(y, m - 1, d) + days * DAY_MS)
}

/** Whole days from `from` to `to`, negative when `to` comes first. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const [y1, m1, d1] = parts(from)
  const [y2, m2, d2] = parts(to)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS)
}

export const SATURDAY = 6

/** Day of the week, 0 for Sunday to 6 for Saturday, read off the date alone. */
export function weekday(key: DateKey): number {
  const [y, m, d] = parts(key)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Noon on the day, local time: safe to format in any time zone. */
export function toDate(key: DateKey): Date {
  const [y, m, d] = parts(key)
  return new Date(y, m - 1, d, 12)
}

export function formatDate(key: DateKey, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, options).format(toDate(key))
}

/** "Thu, Oct 1" */
export const shortDate = (key: DateKey) => formatDate(key, { weekday: 'short', month: 'short', day: 'numeric' })

/** "Oct 1" */
export const monthDay = (key: DateKey) => formatDate(key, { month: 'short', day: 'numeric' })

/** "Wed" */
export const dayName = (key: DateKey) => formatDate(key, { weekday: 'short' })

/** Milliseconds until the next local midnight, when "today" changes. */
export function msUntilMidnight(now: Date): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return midnight.getTime() - now.getTime()
}
