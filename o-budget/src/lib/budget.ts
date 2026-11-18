/**
 * The budget: the net paycheck and how often it comes (which make the
 * month's income), and where every dollar of it goes. Money goes to one of
 * four places:
 *
 * - Investing, markets: like VTI, deposited each paycheck.
 * - Investing, self investment: like STNDRD, counted in Investing but not
 *   grown by the projection, and pulled from the fixed card.
 * - Living, fixed: bills that are the same each month, all on one card.
 * - Living, variable: food, gas and the rest, all on another card, checked
 *   against a monthly budget.
 *
 * Each paycheck's plan follows from those amounts, so changing a category
 * changes the plan. Gross pay, bonus and the 401k sit beside it. Everything
 * here is plain data and pure functions, so the screens and the tests share
 * one set of sums.
 */
import { roundCents } from './money'
import { normalizeProjection, type Projection } from './projection'

export interface Item {
  id: string
  name: string
  amount: number
}

export type Bucket = 'invest' | 'self' | 'fixed' | 'variable'

export const BUCKETS: { id: Bucket; label: string }[] = [
  { id: 'invest', label: 'Investing: markets' },
  { id: 'self', label: 'Investing: self investment' },
  { id: 'fixed', label: 'Living: fixed' },
  { id: 'variable', label: 'Living: variable' },
]

const isBucket = (v: unknown): v is Bucket => BUCKETS.some((b) => b.id === v)

export interface Category {
  id: string
  name: string
  /** A month. When the category has items this is their sum, kept in step by the edits below. */
  amount: number
  note: string
  items: Item[]
  bucket: Bucket
}

/** How often the paycheck comes. */
export type Cadence = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export const CADENCES: { id: Cadence; label: string; perYear: number }[] = [
  { id: 'weekly', label: 'Every week', perYear: 52 },
  { id: 'biweekly', label: 'Every 2 weeks', perYear: 26 },
  { id: 'semimonthly', label: 'Twice a month', perYear: 24 },
  { id: 'monthly', label: 'Once a month', perYear: 12 },
]

const isCadence = (v: unknown): v is Cadence => CADENCES.some((c) => c.id === v)

export interface Budget {
  /** Before taxes, a year. */
  gross: number
  /** A year, on top of gross income. */
  bonus: number
  /** Net: what lands in the account each payday. */
  paycheck: number
  cadence: Cadence
  /** Into the 401k each paycheck, taken out before the paycheck lands. */
  k401: number
  /** The card each kind of Living goes on. */
  cards: { fixed: string; variable: string }
  categories: Category[]
  /** The payday checklist, kept for every pay period ("2026-10-15") it was ticked in. */
  checks: Record<string, PeriodCheck>
  /** The variable card month by month ("2026-10"): this month so far, and where every earlier month ended up. */
  cardMonths: Record<string, CardMonth>
  /** The investing projection's inputs. */
  projection: Projection
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

const item = (name: string, amount: number): Item => ({ id: newId(), name, amount })
const category = (name: string, amount: number, bucket: Bucket, items: Item[] = [], note = ''): Category => ({
  id: newId(),
  name,
  amount: items.length ? sum(items.map((i) => i.amount)) : amount,
  note,
  items,
  bucket,
})

const DEFAULT_CARDS = { fixed: 'Chase Sapphire', variable: 'Amazon card' }

/** The variable budget as set up: $1,000 a month across food, gas and everything else. */
const variableCategories = () => [category('Food', 600, 'variable'), category('Gas', 150, 'variable'), category('Random', 250, 'variable')]

/** Orion's budget: $3,900 twice a month, $1,450 of each into VTI, fixed on Chase Sapphire, variable on the Amazon card. */
export function orionBudget(): Budget {
  return {
    gross: 0,
    bonus: 0,
    paycheck: 3900,
    cadence: 'semimonthly',
    k401: 405,
    cards: { ...DEFAULT_CARDS },
    categories: [
      category('VTI', 2900, 'invest', [], '$1,450 straight into VTI each paycheck.'),
      category('STNDRD', 1000, 'self'),
      category('Rent, utils, park', 1380, 'fixed'),
      category('Car', 250, 'fixed'),
      category('Subscriptions', 0, 'fixed', [
        item('RCF', 65),
        item('Cap Hill Fitness', 70),
        item('Claude', 20),
        item('HBO', 20),
        item('Spotify', 15),
        item('iCloud', 10),
        item('NFL', 7),
        item('Soundcloud', 6),
        item('WSJ', 5),
        item('Chase', 5),
      ]),
      category('Haircut', 100, 'fixed'),
      category('Medical', 100, 'fixed'),
      ...variableCategories(),
    ],
    checks: {},
    cardMonths: {},
    projection: { start: 0, monthly: 2900, k401: 810, rate: 0.07, years: 30, inflation: 0.03, real: false },
  }
}

export function emptyBudget(): Budget {
  return {
    gross: 0,
    bonus: 0,
    paycheck: 0,
    cadence: 'semimonthly',
    k401: 0,
    cards: { ...DEFAULT_CARDS },
    categories: [],
    checks: {},
    cardMonths: {},
    projection: { start: 0, monthly: 0, k401: 0, rate: 0.07, years: 30, inflation: 0.03, real: false },
  }
}

// ---------------------------------------------------------------- the sums

export function sum(values: number[]): number {
  return roundCents(values.reduce((total, n) => total + n, 0))
}

export function categoryTotal(c: Category): number {
  return c.items.length ? sum(c.items.map((i) => i.amount)) : c.amount
}

export const inBucket = (b: Budget, ...buckets: Bucket[]) => b.categories.filter((c) => buckets.includes(c.bucket))

/** A month in the given buckets. */
export const bucketTotal = (b: Budget, ...buckets: Bucket[]) => sum(inBucket(b, ...buckets).map(categoryTotal))

export const investingTotal = (b: Budget) => bucketTotal(b, 'invest', 'self')
export const livingTotal = (b: Budget) => bucketTotal(b, 'fixed', 'variable')

export const paychecksPerYear = (b: Budget) => CADENCES.find((c) => c.id === b.cadence)?.perYear ?? 24

/** 2 for twice a month; 26 ÷ 12 for every two weeks, an average across the year. */
export const paychecksPerMonth = (b: Budget) => paychecksPerYear(b) / 12

/** The month's income: the net paycheck times the paychecks in a year, spread over twelve months. */
export function monthlyIncome(b: Budget): number {
  return roundCents((b.paycheck * paychecksPerYear(b)) / 12)
}

/** Net pay over a year, the bonus aside. */
export function takeHomeYear(b: Budget): number {
  return roundCents(b.paycheck * paychecksPerYear(b))
}

/** Take-home as a fraction of gross income; null until there's a gross income. */
export function takeHomeShare(b: Budget): number | null {
  return b.gross > 0 ? takeHomeYear(b) / b.gross : null
}

/** A monthly amount per paycheck. */
export function perPaycheck(b: Budget, monthly = monthlyIncome(b)): number {
  return roundCents(monthly / paychecksPerMonth(b))
}

/** What's left of the month's income after Investing and Living; negative when they ask for more. */
export function leftOver(b: Budget): number {
  return roundCents(monthlyIncome(b) - investingTotal(b) - livingTotal(b))
}

/** The 401k over a month. */
export const k401Monthly = (b: Budget) => roundCents(b.k401 * paychecksPerMonth(b))

export interface PlanRow {
  /** Stable across edits, so a tick stays on its row. */
  key: string
  label: string
  detail: string
  amount: number
  bucket: Bucket
}

const names = (cs: Category[]) => cs.map((c) => c.name.trim() || 'Untitled').join(', ')

/**
 * Where each paycheck goes once it lands, in order: each investment, then
 * what to set aside for each card's bill, and what's left. Self investment
 * like STNDRD is pulled from the fixed card, so it's set aside with the
 * fixed bills. The 401k is out before the paycheck and isn't part of it.
 */
export function paycheckPlan(b: Budget): { rows: PlanRow[]; start: number; after: number[]; leftOver: number } {
  // Whole dollars, so the rows and what's left add up to the paycheck exactly.
  const each = (monthly: number) => Math.round(perPaycheck(b, monthly))
  const rows: PlanRow[] = []
  for (const c of inBucket(b, 'invest'))
    rows.push({ key: c.id, label: `Deposit into ${c.name.trim() || 'investing'}`, detail: 'Investing', amount: each(categoryTotal(c)), bucket: 'invest' })
  const fixed = inBucket(b, 'fixed')
  const self = inBucket(b, 'self')
  if (fixed.length || self.length) {
    const parts = [fixed.length ? `Fixed: ${names(fixed)}` : '', self.length ? `${fixed.length ? 'plus ' : ''}${names(self)}` : ''].filter(Boolean)
    rows.push({ key: 'fixed', label: `Set aside for ${b.cards.fixed}`, detail: parts.join(', '), amount: each(bucketTotal(b, 'fixed', 'self')), bucket: 'fixed' })
  }
  const variable = inBucket(b, 'variable')
  if (variable.length)
    rows.push({ key: 'variable', label: `Set aside for ${b.cards.variable}`, detail: `Variable: ${names(variable)}`, amount: each(bucketTotal(b, 'variable')), bucket: 'variable' })
  let left = b.paycheck
  const after = rows.map((r) => (left = roundCents(left - r.amount)))
  return { rows, start: b.paycheck, after, leftOver: left }
}

// ------------------------------------------------------ the variable card

/** One month on the variable card, as it stood when it was last checked. */
export interface CardMonth {
  /** What was on the card. */
  spent: number
  /** The day of the month it was typed in; 0 when that isn't known (kept before days were). */
  day: number
  /** The variable budget then, so an earlier month is held to its own budget. */
  budget: number
}

/** "2026-10" for any day in October 2026. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/

const daysIn = (year: number, month: number) => new Date(year, month, 0).getDate()

/** What's on the variable card this month; a new month starts at nothing. */
export const spentThisMonth = (b: Budget, now: Date) => b.cardMonths[monthKey(now)]?.spent ?? 0

/**
 * Where the variable card stands: spent against the budget, what's left,
 * what's left a day for the rest of the month, and where spending would be
 * if it went evenly through the month. `checked` is the day of the month the
 * balance was last typed in: null before it has been this month, 0 when the
 * day isn't known.
 */
export function variableCheck(b: Budget, now: Date) {
  const budget = bucketTotal(b, 'variable')
  const month = b.cardMonths[monthKey(now)]
  const spent = month?.spent ?? 0
  const days = daysIn(now.getFullYear(), now.getMonth() + 1)
  const day = now.getDate()
  const daysLeft = days - day + 1
  const left = roundCents(budget - spent)
  const pace = roundCents((budget * day) / days)
  const checked = month ? month.day : null
  return { budget, spent, left, daysLeft, perDay: left > 0 ? left / daysLeft : 0, pace, aheadOfPace: roundCents(pace - spent), day, days, checked }
}

/** Every other month on the variable card, newest first, with what was left of its budget (negative when over). */
export const cardHistory = (b: Budget, now: Date) =>
  Object.entries(b.cardMonths)
    .filter(([month]) => month !== monthKey(now))
    .sort(([x], [y]) => (x < y ? 1 : x > y ? -1 : 0))
    .map(([month, m]) => {
      const [y, mo] = month.split('-').map(Number)
      return { month, ...m, left: roundCents(m.budget - m.spent), days: daysIn(y, mo) }
    })

/** How those months went: how many stayed within their budget, and the average on the card. */
export function cardRecord(history: { spent: number; budget: number }[]) {
  const months = history.length
  const under = history.filter((m) => m.spent <= m.budget).length
  return { months, under, average: months ? roundCents(sum(history.map((m) => m.spent)) / months) : 0 }
}

// ------------------------------------------------------ the payday checklist

/** What to confirm each paycheck: the investing went in, the fixed bills came as expected, the variable card is under budget. */
export type CheckKey = 'invest' | 'fixed' | 'variable'
export const CHECK_KEYS: CheckKey[] = ['invest', 'fixed', 'variable']

export interface PeriodCheck {
  done: CheckKey[]
  /** What went into investing that paycheck, as planned when it was ticked. */
  invest: number
}

/** The pay period a day falls in: the 1st to the 14th, or the 15th to the month's end ("2026-10-1", "2026-10-15"). */
export const periodKey = (d: Date) => `${monthKey(d)}-${d.getDate() < 15 ? 1 : 15}`

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "October 2026". */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return `${MONTH_FULL[m - 1]} ${y}`
}

/** "Oct 15–31, 2026". */
export function periodLabel(key: string): string {
  const [y, m, start] = key.split('-').map(Number)
  const end = start === 1 ? 14 : new Date(y, m, 0).getDate()
  return `${MONTH_NAMES[m - 1]} ${start}–${end}, ${y}`
}

/** What goes into investing (markets) each paycheck. */
export const investPerPaycheck = (b: Budget) => sum(paycheckPlan(b).rows.filter((r) => r.bucket === 'invest').map((r) => r.amount))

/** This period's checklist; a new period starts empty, which is the reset on the 1st and the 15th. */
export const currentChecks = (b: Budget, now: Date): CheckKey[] => b.checks[periodKey(now)]?.done ?? []

export function toggleCheck(b: Budget, key: CheckKey, now: Date): Budget {
  const period = periodKey(now)
  const done = currentChecks(b, now)
  const next = done.includes(key) ? done.filter((k) => k !== key) : CHECK_KEYS.filter((k) => k === key || done.includes(k))
  return { ...b, checks: { ...b.checks, [period]: { done: next, invest: investPerPaycheck(b) } } }
}

/** Earlier periods, newest first. */
export const checkHistory = (b: Budget, now: Date) =>
  Object.entries(b.checks)
    .filter(([k]) => k !== periodKey(now))
    .sort(([x], [y]) => periodOrder(y) - periodOrder(x))
    .map(([period, c]) => ({ period, ...c }))

const periodOrder = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return y * 10000 + m * 100 + d
}

// --------------------------------------------------------------- the edits

/** Amounts are never negative and never hold fractions of a cent. */
const dollars = (n: number) => Math.max(0, roundCents(n))

export const setGross = (b: Budget, gross: number): Budget => ({ ...b, gross: dollars(gross) })

export const setBonus = (b: Budget, bonus: number): Budget => ({ ...b, bonus: dollars(bonus) })

/** The bonus as a share of gross income. */
export const setBonusShare = (b: Budget, share: number): Budget => setBonus(b, b.gross * Math.max(0, share))

/**
 * A change in pay goes to investing: the first market category without
 * items takes the difference in monthly income, so a raise is invested and
 * a cut comes out of investing, while Living stays as budgeted. The
 * projection's monthly amount follows when it was matching the markets.
 */
function trickle(before: Budget, after: Budget): Budget {
  const delta = roundCents(monthlyIncome(after) - monthlyIncome(before))
  const target = after.categories.find((c) => c.bucket === 'invest' && !c.items.length)
  if (!delta || !target) return after
  const markets = bucketTotal(after, 'invest')
  const next = withCategory(after, target.id, (c) => ({ ...c, amount: dollars(c.amount + delta) }))
  return next.projection.monthly === markets ? { ...next, projection: { ...next.projection, monthly: bucketTotal(next, 'invest') } } : next
}

export const setPaycheck = (b: Budget, paycheck: number): Budget => trickle(b, { ...b, paycheck: dollars(paycheck) })

/** Monthly net pay; the paycheck is worked out from it and the cadence. */
export const setMonthlyIncome = (b: Budget, income: number): Budget =>
  trickle(b, { ...b, paycheck: (Math.max(0, income) * 12) / paychecksPerYear(b) })

/** A new cadence keeps the month's income and changes what each paycheck is. */
export const setCadence = (b: Budget, cadence: Cadence): Budget =>
  isCadence(cadence) ? { ...b, cadence, paycheck: (monthlyIncome(b) * 12) / CADENCES.find((c) => c.id === cadence)!.perYear } : b

export const setK401 = (b: Budget, k401: number): Budget => ({ ...b, k401: dollars(k401) })

export const setCard = (b: Budget, which: 'fixed' | 'variable', name: string): Budget => ({
  ...b,
  cards: { ...b.cards, [which]: name.slice(0, 40) },
})

/**
 * This month's card figure is held to the variable budget as it stands, so a
 * budget changed after the last check-in counts. Once the month is over it's
 * left as it was: each month keeps the budget it ended with.
 */
export function holdCardBudget(b: Budget, now: Date): Budget {
  const key = monthKey(now)
  const month = b.cardMonths[key]
  const budget = bucketTotal(b, 'variable')
  return month && month.budget !== budget ? { ...b, cardMonths: { ...b.cardMonths, [key]: { ...month, budget } } } : b
}

/** What's on the variable card today, kept as this month's figure with the day and the budget it's held to. */
export const setSpent = (b: Budget, amount: number, now: Date): Budget => ({
  ...b,
  cardMonths: { ...b.cardMonths, [monthKey(now)]: { spent: dollars(amount), day: now.getDate(), budget: bucketTotal(b, 'variable') } },
})

// Categories and their items

export function addCategory(b: Budget, bucket: Bucket): [Budget, string] {
  const c = category('', 0, bucket)
  return [{ ...b, categories: [...b.categories, c] }, c.id]
}

const withCategory = (b: Budget, id: string, change: (c: Category) => Category): Budget => ({
  ...b,
  categories: b.categories.map((c) => (c.id === id ? change(c) : c)),
})

/** Keeps a category's amount equal to its items whenever it has any. */
const settle = (c: Category): Category => (c.items.length ? { ...c, amount: categoryTotal(c) } : c)

export const updateCategory = (b: Budget, id: string, patch: Partial<Pick<Category, 'name' | 'amount' | 'note'>>): Budget =>
  withCategory(b, id, (c) => settle({ ...c, ...patch, ...(patch.amount !== undefined ? { amount: dollars(patch.amount) } : {}) }))

/** Moves a category to another bucket, at the end of that bucket's list. */
export const setCategoryBucket = (b: Budget, id: string, bucket: Bucket): Budget => {
  const moved = b.categories.find((c) => c.id === id)
  if (!moved || !isBucket(bucket) || moved.bucket === bucket) return b
  return { ...b, categories: [...b.categories.filter((c) => c.id !== id), { ...moved, bucket }] }
}

export const removeCategory = (b: Budget, id: string): Budget => ({
  ...b,
  categories: b.categories.filter((c) => c.id !== id),
})

/**
 * Adds a detail line. The first one starts out holding the category's whole
 * amount, so breaking a category down never drops its total to $0 midway.
 */
export function addItem(b: Budget, categoryId: string): [Budget, string] {
  const added = item('', 0)
  const next = withCategory(b, categoryId, (c) => settle({ ...c, items: [...c.items, c.items.length ? added : { ...added, amount: c.amount }] }))
  return [next, added.id]
}

export const updateItem = (b: Budget, categoryId: string, itemId: string, patch: Partial<Omit<Item, 'id'>>): Budget =>
  withCategory(b, categoryId, (c) =>
    settle({
      ...c,
      items: c.items.map((i) => (i.id === itemId ? { ...i, ...patch, ...(patch.amount !== undefined ? { amount: dollars(patch.amount) } : {}) } : i)),
    }),
  )

/** Removing the last item leaves the category at what's left: $0. */
export const removeItem = (b: Budget, categoryId: string, itemId: string): Budget =>
  withCategory(b, categoryId, (c) => {
    const items = c.items.filter((i) => i.id !== itemId)
    return items.length ? settle({ ...c, items }) : { ...c, items, amount: 0 }
  })

/** Puts a removed category back where it was, leaving everything changed since as it is. */
export function restoreCategory(b: Budget, c: Category, index: number): Budget {
  if (b.categories.some((x) => x.id === c.id)) return b
  const categories = [...b.categories]
  categories.splice(Math.max(0, Math.min(index, categories.length)), 0, c)
  return { ...b, categories }
}

/** Puts a removed item back where it was in its category, and the category's total with it. */
export function restoreItem(b: Budget, categoryId: string, it: Item, index: number): Budget {
  const c = b.categories.find((x) => x.id === categoryId)
  if (!c || c.items.some((x) => x.id === it.id)) return b
  const items = [...c.items]
  items.splice(Math.max(0, Math.min(index, items.length)), 0, it)
  return withCategory(b, categoryId, () => settle({ ...c, items }))
}

/** A category opened, left blank and closed again isn't kept. */
export const isBlankCategory = (c: Category) => !c.name.trim() && c.amount === 0 && !c.items.length && !c.note.trim()

export const setProjection = (b: Budget, patch: Partial<Projection>): Budget => ({
  ...b,
  projection: normalizeProjection({ ...b.projection, ...patch }, b.projection.monthly, b.projection.k401),
})

// ------------------------------------------------------------- from storage

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const amountOf = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, roundCents(v)) : 0)
const textOf = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const idOf = (v: unknown, seen: Set<string>) => {
  const id = typeof v === 'string' && /^[\w-]{1,40}$/.test(v) && !seen.has(v) ? v : newId()
  seen.add(id)
  return id
}

const checksOf = (raw: unknown): Record<string, PeriodCheck> => {
  const out: Record<string, PeriodCheck> = {}
  if (!isObject(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(1|15)$/.test(k) || !isObject(v)) continue
    const done = Array.isArray(v.done) ? CHECK_KEYS.filter((c) => (v.done as unknown[]).includes(c)) : []
    out[k] = { done, invest: amountOf(v.invest) }
  }
  return out
}

/**
 * The card's months. Before version 6 only this month's figure was kept, as
 * `spent`; it carries over as its month, held to today's variable budget.
 */
const cardMonthsOf = (raw: unknown, legacy: unknown, budget: number): Record<string, CardMonth> => {
  const out: Record<string, CardMonth> = {}
  if (isObject(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (!MONTH_KEY.test(k) || !isObject(v)) continue
      const day = typeof v.day === 'number' && Number.isInteger(v.day) && v.day >= 0 && v.day <= 31 ? v.day : 0
      out[k] = { spent: amountOf(v.spent), day, budget: typeof v.budget === 'number' ? amountOf(v.budget) : budget }
    }
  } else if (isObject(legacy) && MONTH_KEY.test(textOf(legacy.month))) {
    out[textOf(legacy.month)] = { spent: amountOf(legacy.amount), day: 0, budget }
  }
  return out
}

/**
 * Turns whatever was saved (by this version, an older one, or a hand edit
 * of the shared copy) into a budget the screens can trust. Null when it
 * isn't a budget at all.
 */
export function normalizeBudget(raw: unknown): Budget | null {
  if (!isObject(raw)) return null
  const seen = new Set<string>()
  const version = typeof raw.version === 'number' ? raw.version : 1
  // The first version kept a monthly income and a count of paychecks a month
  // instead of the paycheck and its cadence; the month's income carries over.
  const perMonth = typeof raw.paychecks === 'number' && Number.isFinite(raw.paychecks) ? Math.round(raw.paychecks) : 2
  const cadence: Cadence = isCadence(raw.cadence) ? raw.cadence : perMonth <= 1 ? 'monthly' : perMonth === 2 ? 'semimonthly' : 'weekly'
  const perYear = CADENCES.find((c) => c.id === cadence)!.perYear
  const paycheck = 'paycheck' in raw ? amountOf(raw.paycheck) : roundCents((amountOf(raw.income) * 12) / perYear)

  let categories: Category[] = (Array.isArray(raw.categories) ? raw.categories : []).filter(isObject).map((c) =>
    settle({
      id: idOf(c.id, seen),
      name: textOf(c.name),
      amount: amountOf(c.amount),
      note: textOf(c.note, 2000),
      items: (Array.isArray(c.items) ? c.items : [])
        .filter(isObject)
        .map((i) => ({ id: idOf(i.id, seen), name: textOf(i.name), amount: amountOf(i.amount) })),
      bucket: isBucket(c.bucket) ? c.bucket : c.bucket === 'self' || /^\s*stndrd\s*$/i.test(textOf(c.name)) ? 'self' : 'fixed',
    }),
  )

  let k401 = amountOf(raw.k401)
  let projection = normalizeProjection(raw.projection, 0, 0)
  // Only a budget that had something in it is carried over; an empty save stays empty.
  if (version < 5 && ['categories', 'steps', 'investing', 'income', 'paycheck'].some((k) => k in raw)) {
    // Before version 5 the paycheck ran on hand-written steps and one Living
    // list. The system now: the 401k before the paycheck, VTI each paycheck,
    // fixed bills on one card and variable spending ($1,000 of food, gas and
    // random) on another.
    const steps = (Array.isArray(raw.steps) ? raw.steps : []).filter(isObject)
    const before = steps.filter((s) => (version < 3 ? /\b401\s*\(?k\)?/i.test(textOf(s.text)) : s.beforePay === true))
    k401 = sum(before.map((s) => amountOf(s.amount)))
    categories = categories.filter((c) => !/^\s*(food|gas|random)\s*$/i.test(c.name))
    categories.push(...variableCategories())
    if (!categories.some((c) => c.bucket === 'invest'))
      categories.unshift(category('VTI', roundCents(1450 * (perYear / 12)), 'invest', [], '$1,450 straight into VTI each paycheck.'))
    const markets = sum(categories.filter((c) => c.bucket === 'invest').map(categoryTotal))
    const k401Fallback = roundCents(k401 * (perYear / 12))
    projection = normalizeProjection(
      isObject(raw.projection) ? { ...raw.projection, monthly: markets } : { monthly: markets, k401: k401Fallback },
      markets,
      k401Fallback,
    )
  }

  const cards = isObject(raw.cards) ? raw.cards : {}
  const variableBudget = sum(categories.filter((c) => c.bucket === 'variable').map(categoryTotal))
  return {
    gross: amountOf(raw.gross),
    bonus: amountOf(raw.bonus),
    paycheck,
    cadence,
    k401,
    cards: {
      fixed: textOf(cards.fixed, 40) || DEFAULT_CARDS.fixed,
      variable: textOf(cards.variable, 40) || DEFAULT_CARDS.variable,
    },
    categories,
    checks: checksOf(raw.checks),
    cardMonths: cardMonthsOf(raw.cardMonths, raw.spent, variableBudget),
    projection,
  }
}

/** Same numbers, names and order: a copy that changes nothing on screen. */
export function sameBudget(a: Budget | null, b: Budget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
