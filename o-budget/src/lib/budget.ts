/**
 * The budget: gross pay and bonus, the net paycheck and how often it comes
 * (which make the month's income), how that income splits between
 * Investing and Living, the steps to run each payday, and where Living goes.
 * Everything here is plain data and pure functions, so the screens and the
 * tests share one set of sums.
 */
import { roundCents } from './money'
import { normalizeProjection, type Projection } from './projection'

export interface Item {
  id: string
  name: string
  amount: number
}

/** Where a category's money comes from: Living, or Investing as self investment. */
export type Bucket = 'living' | 'self'

export interface Category {
  id: string
  name: string
  /** A month. When the category has items this is their sum, kept in step by the edits below. */
  amount: number
  note: string
  items: Item[]
  /**
   * 'self' is self investment: paid from Investing rather than Living, and
   * left out of what the investment projection grows.
   */
  bucket: Bucket
}

export interface Step {
  id: string
  text: string
  amount: number
  /** Ticked off for the paycheck in hand. */
  done: boolean
  /**
   * Taken out before the paycheck lands, like a 401k contribution: listed
   * first, and not taken from the net paycheck.
   */
  beforePay: boolean
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
  /** A month. Living is whatever income is left after it. */
  investing: number
  steps: Step[]
  categories: Category[]
  /** The investing projection's inputs. */
  projection: Projection
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

const item = (name: string, amount: number): Item => ({ id: newId(), name, amount })
const category = (name: string, amount: number, items: Item[] = [], bucket: Bucket = 'living'): Category => ({
  id: newId(),
  name,
  amount: items.length ? sum(items.map((i) => i.amount)) : amount,
  note: '',
  items,
  bucket,
})
const step = (text: string, amount: number, beforePay = false): Step => ({ id: newId(), text, amount, done: false, beforePay })

/** Orion's budget as written down: $7,800 a month in two paychecks of $3,900. */
export function orionBudget(): Budget {
  return {
    gross: 0,
    bonus: 0,
    paycheck: 3900,
    cadence: 'semimonthly',
    investing: 4000,
    steps: [step('Goes into 401k', 405, true), step('Invest in VTI', 1500), step('Remains for 2 wks', 1900)],
    categories: [
      category('Rent, utils, park', 1380),
      category('STNDRD', 1000, [], 'self'),
      category('Car', 250),
      category('Subscriptions', 0, [
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
      category('Food', 800),
      category('Haircut', 100),
      category('Medical', 100),
    ],
    projection: { start: 0, monthly: 3000, k401: 810, rate: 0.07, years: 30 },
  }
}

export function emptyBudget(): Budget {
  return {
    gross: 0,
    bonus: 0,
    paycheck: 0,
    cadence: 'semimonthly',
    investing: 0,
    steps: [],
    categories: [],
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

export function living(b: Budget): number {
  return roundCents(monthlyIncome(b) - b.investing)
}

/** Investing and Living as fractions of income, 0 when there's no income yet. */
export function shares(b: Budget): { investing: number; living: number } {
  const income = monthlyIncome(b)
  if (income <= 0) return { investing: 0, living: 0 }
  return { investing: b.investing / income, living: living(b) / income }
}

/** A monthly amount per paycheck. */
export function perPaycheck(b: Budget, monthly = monthlyIncome(b)): number {
  return roundCents(monthly / paychecksPerMonth(b))
}

/** Living expenses: every category paid from Living. */
export function expensesTotal(b: Budget): number {
  return sum(b.categories.filter((c) => c.bucket === 'living').map(categoryTotal))
}

/** Self investment: the categories paid from Investing. */
export function selfTotal(b: Budget): number {
  return sum(b.categories.filter((c) => c.bucket === 'self').map(categoryTotal))
}

/** What's left of Investing for the markets once self investment is paid. */
export function marketInvesting(b: Budget): number {
  return roundCents(b.investing - selfTotal(b))
}

/** Living left after the expenses: negative when they come to more. */
export function livingLeft(b: Budget): number {
  return roundCents(living(b) - expensesTotal(b))
}

/**
 * The paycheck as it's worked through: what it starts at, what's left after
 * each step in order (null for a step taken out before the paycheck, which
 * doesn't come out of it), and what no step accounts for (negative when the
 * steps ask for more than the paycheck).
 */
export function paycheckRun(b: Budget): { start: number; after: (number | null)[]; leftOver: number } {
  const start = b.paycheck
  let left = start
  const after = b.steps.map((s) => (s.beforePay ? null : (left = roundCents(left - s.amount))))
  return { start, after, leftOver: left }
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

export const setInvesting = (b: Budget, investing: number): Budget => ({
  ...b,
  investing: Math.max(0, roundCents(investing)),
})

/** Living is the rest of income, so setting it moves Investing. */
export const setLiving = (b: Budget, amount: number): Budget => setInvesting(b, monthlyIncome(b) - Math.max(0, amount))

export const setInvestingShare = (b: Budget, share: number): Budget =>
  setInvesting(b, monthlyIncome(b) * Math.min(1, Math.max(0, share)))

export const setLivingShare = (b: Budget, share: number): Budget =>
  setInvestingShare(b, 1 - Math.min(1, Math.max(0, share)))

// Steps

export function addStep(b: Budget): [Budget, string] {
  const s = step('', 0)
  return [{ ...b, steps: [...b.steps, s] }, s.id]
}

export const updateStep = (b: Budget, id: string, patch: Partial<Omit<Step, 'id'>>): Budget => ({
  ...b,
  steps: b.steps.map((s) => (s.id === id ? { ...s, ...patch, ...(patch.amount !== undefined && { amount: Math.max(0, roundCents(patch.amount)) }) } : s)),
})

export const removeStep = (b: Budget, id: string): Budget => ({ ...b, steps: b.steps.filter((s) => s.id !== id) })

/** Steps taken out before the paycheck come first, each group in its own order. */
const grouped = (steps: Step[]): Step[] => [...steps.filter((s) => s.beforePay), ...steps.filter((s) => !s.beforePay)]

/** Whether a step can move one place earlier (-1) or later (+1): only among steps on the same side of payday. */
export function canMoveStep(b: Budget, id: string, by: -1 | 1): boolean {
  const from = b.steps.findIndex((s) => s.id === id)
  const neighbour = b.steps[from + by]
  return from >= 0 && neighbour !== undefined && neighbour.beforePay === b.steps[from].beforePay
}

/** Moves a step one place earlier (-1) or later (+1) in the order. */
export function moveStep(b: Budget, id: string, by: -1 | 1): Budget {
  if (!canMoveStep(b, id, by)) return b
  const from = b.steps.findIndex((s) => s.id === id)
  const to = from + by
  const steps = [...b.steps]
  ;[steps[from], steps[to]] = [steps[to], steps[from]]
  return { ...b, steps }
}

export const toggleStep = (b: Budget, id: string): Budget => updateStep(b, id, { done: !b.steps.find((s) => s.id === id)?.done })

/** Marks a step as taken out before the paycheck (or not), moving it to that side of payday. */
export const setStepBeforePay = (b: Budget, id: string, beforePay: boolean): Budget => ({
  ...b,
  steps: grouped(b.steps.map((s) => (s.id === id ? { ...s, beforePay } : s))),
})

/** Clears the ticks for the next paycheck. */
export const resetSteps = (b: Budget): Budget => ({ ...b, steps: b.steps.map((s) => (s.done ? { ...s, done: false } : s)) })

// Categories and their items

export function addCategory(b: Budget, bucket: Bucket = 'living'): [Budget, string] {
  const c = category('', 0, [], bucket)
  return [{ ...b, categories: [...b.categories, c] }, c.id]
}

const withCategory = (b: Budget, id: string, change: (c: Category) => Category): Budget => ({
  ...b,
  categories: b.categories.map((c) => (c.id === id ? change(c) : c)),
})

/** Keeps a category's amount equal to its items whenever it has any. */
const settle = (c: Category): Category => (c.items.length ? { ...c, amount: categoryTotal(c) } : c)

export const updateCategory = (b: Budget, id: string, patch: Partial<Pick<Category, 'name' | 'amount' | 'note'>>): Budget =>
  withCategory(b, id, (c) =>
    settle({ ...c, ...patch, ...(patch.amount !== undefined && { amount: Math.max(0, roundCents(patch.amount)) }) }),
  )

/** Moves a category between Living and self investment. */
export const setCategoryBucket = (b: Budget, id: string, bucket: Bucket): Budget =>
  withCategory(b, id, (c) => ({ ...c, bucket }))

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
  const next = withCategory(b, categoryId, (c) =>
    settle({ ...c, items: [...c.items, c.items.length ? added : { ...added, amount: c.amount }] }),
  )
  return [next, added.id]
}

export const updateItem = (b: Budget, categoryId: string, itemId: string, patch: Partial<Omit<Item, 'id'>>): Budget =>
  withCategory(b, categoryId, (c) =>
    settle({
      ...c,
      items: c.items.map((i) =>
        i.id === itemId ? { ...i, ...patch, ...(patch.amount !== undefined && { amount: Math.max(0, roundCents(patch.amount)) }) } : i,
      ),
    }),
  )

/** Removing the last item leaves the category at what's left: $0. */
export const removeItem = (b: Budget, categoryId: string, itemId: string): Budget =>
  withCategory(b, categoryId, (c) => {
    const items = c.items.filter((i) => i.id !== itemId)
    return items.length ? settle({ ...c, items }) : { ...c, items, amount: 0 }
  })

/** A step or category opened, left blank and closed again isn't kept. */
export const isBlankStep = (s: Step) => !s.text.trim() && s.amount === 0
export const isBlankCategory = (c: Category) => !c.name.trim() && c.amount === 0 && !c.items.length && !c.note.trim()

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
  // The first version kept a monthly income and a count of paychecks a month
  // instead of the paycheck and its cadence; the month's income carries over.
  const perMonth = typeof raw.paychecks === 'number' && Number.isFinite(raw.paychecks) ? Math.round(raw.paychecks) : 2
  const cadence: Cadence = isCadence(raw.cadence) ? raw.cadence : perMonth <= 1 ? 'monthly' : perMonth === 2 ? 'semimonthly' : 'weekly'
  const perYear = CADENCES.find((c) => c.id === cadence)!.perYear
  const paycheck = 'paycheck' in raw ? amountOf(raw.paycheck) : roundCents((amountOf(raw.income) * 12) / perYear)

  // Before version 3 there was no way to mark a step as coming out before
  // the paycheck, and the 401k was taken from it; it comes out before.
  const version = typeof raw.version === 'number' ? raw.version : 1
  const steps: Step[] = grouped(
    (Array.isArray(raw.steps) ? raw.steps : []).filter(isObject).map((s) => ({
      id: idOf(s.id, seen),
      text: textOf(s.text),
      amount: amountOf(s.amount),
      done: s.done === true,
      beforePay: version < 3 ? /\b401\s*\(?k\)?/i.test(textOf(s.text)) : s.beforePay === true,
    })),
  )

  const categories: Category[] = (Array.isArray(raw.categories) ? raw.categories : []).filter(isObject).map((c) =>
    settle({
      id: idOf(c.id, seen),
      name: textOf(c.name),
      amount: amountOf(c.amount),
      note: textOf(c.note, 2000),
      items: (Array.isArray(c.items) ? c.items : [])
        .filter(isObject)
        .map((i) => ({ id: idOf(i.id, seen), name: textOf(i.name), amount: amountOf(i.amount) })),
      // Before version 4 there was no self investment, and STNDRD was in Living; it's self investment.
      bucket: c.bucket === 'self' || (version < 4 && /^\s*stndrd\s*$/i.test(textOf(c.name))) ? 'self' : 'living',
    }),
  )

  return {
    gross: amountOf(raw.gross),
    bonus: amountOf(raw.bonus),
    paycheck,
    cadence,
    investing: amountOf(raw.investing),
    steps,
    categories,
    // Saves from before the projection start it off contributing the Investing
    // amount, and the steps taken out before the paycheck as the 401k.
    projection: projectionFrom(raw, version, categories, steps, perYear),
  }
}

function projectionFrom(raw: Record<string, unknown>, version: number, categories: Category[], steps: Step[], perYear: number): Projection {
  const investing = amountOf(raw.investing)
  const self = sum(categories.filter((c) => c.bucket === 'self').map(categoryTotal))
  const projection = normalizeProjection(
    raw.projection,
    roundCents(investing - self),
    roundCents(sum(steps.filter((s) => s.beforePay).map((s) => s.amount)) * (perYear / 12)),
  )
  // A projection that followed the whole Investing amount before self
  // investment existed follows what's left for the markets.
  return version < 4 && projection.monthly === investing ? { ...projection, monthly: Math.max(0, roundCents(investing - self)) } : projection
}

/** A month of the steps taken out before the paycheck, like the 401k. */
export function beforePayMonthly(b: Budget): number {
  return roundCents(sum(b.steps.filter((s) => s.beforePay).map((s) => s.amount)) * paychecksPerMonth(b))
}

export const setProjection = (b: Budget, patch: Partial<Projection>): Budget => ({
  ...b,
  projection: normalizeProjection({ ...b.projection, ...patch }, b.projection.monthly, b.projection.k401),
})

/** Same numbers, names and order: a copy that changes nothing on screen. */
export function sameBudget(a: Budget | null, b: Budget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
