/**
 * The budget: the net paycheck and how often it comes (which make the
 * month's income), and where every dollar of it goes. Money goes to one of
 * four places:
 *
 * - Investing, markets: like VTI, deposited each paycheck.
 * - Investing, self investment: like STNDRD, paid from Investing but not
 *   grown by the projection.
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
  /** The plan's rows ticked off for the paycheck in hand, by key. */
  paid: string[]
  /** What's on the variable card so far this month ("2026-10"). */
  spent: { month: string; amount: number }
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
    paid: [],
    spent: { month: '', amount: 0 },
    projection: { start: 0, monthly: 2900, k401: 810, rate: 0.07, years: 30 },
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
    paid: [],
    spent: { month: '', amount: 0 },
    projection: { start: 0, monthly: 0, k401: 0, rate: 0.07, years: 30 },
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
  bucket: Bucket | 'before'
}

const names = (cs: Category[]) => cs.map((c) => c.name.trim() || 'Untitled').join(', ')

/**
 * Where each paycheck goes, in order: the 401k before it lands, then each
 * investment, then what to set aside for each card's bill, and what's left.
 */
export function paycheckPlan(b: Budget): { rows: PlanRow[]; start: number; after: (number | null)[]; leftOver: number } {
  // Whole dollars, so the rows and what's left add up to the paycheck exactly.
  const each = (monthly: number) => Math.round(perPaycheck(b, monthly))
  const rows: PlanRow[] = []
  if (b.k401 > 0) rows.push({ key: 'k401', label: '401k', detail: 'Out before the paycheck lands', amount: b.k401, bucket: 'before' })
  for (const c of inBucket(b, 'invest'))
    rows.push({ key: c.id, label: `Deposit into ${c.name.trim() || 'investing'}`, detail: 'Investing', amount: each(categoryTotal(c)), bucket: 'invest' })
  for (const c of inBucket(b, 'self'))
    rows.push({ key: c.id, label: `Pay ${c.name.trim() || 'self investment'}`, detail: 'Self investment', amount: each(categoryTotal(c)), bucket: 'self' })
  const fixed = inBucket(b, 'fixed')
  if (fixed.length)
    rows.push({ key: 'fixed', label: `Set aside for ${b.cards.fixed}`, detail: `Fixed: ${names(fixed)}`, amount: each(bucketTotal(b, 'fixed')), bucket: 'fixed' })
  const variable = inBucket(b, 'variable')
  if (variable.length)
    rows.push({ key: 'variable', label: `Set aside for ${b.cards.variable}`, detail: `Variable: ${names(variable)}`, amount: each(bucketTotal(b, 'variable')), bucket: 'variable' })
  let left = b.paycheck
  const after = rows.map((r) => (r.bucket === 'before' ? null : (left = roundCents(left - r.amount))))
  return { rows, start: b.paycheck, after, leftOver: left }
}

// ------------------------------------------------------ the variable card

/** "2026-10" for any day in October 2026. */
export const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

/** What's on the variable card this month; a figure from last month counts as nothing yet. */
export const spentThisMonth = (b: Budget, now: Date) => (b.spent.month === monthKey(now) ? b.spent.amount : 0)

/**
 * Where the variable card stands: spent against the budget, what's left,
 * what's left a day for the rest of the month, and where spending would be
 * if it went evenly through the month.
 */
export function variableCheck(b: Budget, now: Date) {
  const budget = bucketTotal(b, 'variable')
  const spent = spentThisMonth(b, now)
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const day = now.getDate()
  const daysLeft = days - day + 1
  const left = roundCents(budget - spent)
  const pace = roundCents((budget * day) / days)
  return { budget, spent, left, daysLeft, perDay: left > 0 ? left / daysLeft : 0, pace, aheadOfPace: roundCents(pace - spent), day, days }
}

// --------------------------------------------------------------- the edits

/** Amounts are never negative and never hold fractions of a cent. */
const dollars = (n: number) => Math.max(0, roundCents(n))

export const setGross = (b: Budget, gross: number): Budget => ({ ...b, gross: dollars(gross) })

export const setBonus = (b: Budget, bonus: number): Budget => ({ ...b, bonus: dollars(bonus) })

/** The bonus as a share of gross income. */
export const setBonusShare = (b: Budget, share: number): Budget => setBonus(b, b.gross * Math.max(0, share))

export const setPaycheck = (b: Budget, paycheck: number): Budget => ({ ...b, paycheck: dollars(paycheck) })

export const setCadence = (b: Budget, cadence: Cadence): Budget => (isCadence(cadence) ? { ...b, cadence } : b)

export const setK401 = (b: Budget, k401: number): Budget => ({ ...b, k401: dollars(k401) })

export const setCard = (b: Budget, which: 'fixed' | 'variable', name: string): Budget => ({
  ...b,
  cards: { ...b.cards, [which]: name.slice(0, 40) },
})

export const setSpent = (b: Budget, amount: number, now: Date): Budget => ({
  ...b,
  spent: { month: monthKey(now), amount: dollars(amount) },
})

export const togglePaid = (b: Budget, key: string): Budget => ({
  ...b,
  paid: b.paid.includes(key) ? b.paid.filter((k) => k !== key) : [...b.paid, key],
})

/** Clears the ticks for the next paycheck. */
export const resetPaid = (b: Budget): Budget => (b.paid.length ? { ...b, paid: [] } : b)

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
  paid: b.paid.filter((k) => k !== id),
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
  const spent = isObject(raw.spent) ? raw.spent : {}
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
    paid: version < 5 ? [] : (Array.isArray(raw.paid) ? raw.paid : []).filter((k): k is string => typeof k === 'string').slice(0, 100),
    spent: { month: /^\d{4}-\d{2}$/.test(textOf(spent.month)) ? textOf(spent.month) : '', amount: amountOf(spent.amount) },
    projection,
  }
}

/** Same numbers, names and order: a copy that changes nothing on screen. */
export function sameBudget(a: Budget | null, b: Budget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
