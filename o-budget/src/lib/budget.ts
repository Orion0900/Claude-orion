/**
 * The budget: what comes in a month, how it splits between Investing and
 * Living, the steps to run each payday, and where Living goes. Everything
 * here is plain data and pure functions, so the screens and the tests share
 * one set of sums.
 */
import { roundCents } from './money'

export interface Item {
  id: string
  name: string
  amount: number
}

export interface Category {
  id: string
  name: string
  /** A month. When the category has items this is their sum, kept in step by the edits below. */
  amount: number
  note: string
  items: Item[]
}

export interface Step {
  id: string
  text: string
  amount: number
  /** Ticked off for the paycheck in hand. */
  done: boolean
}

export interface Budget {
  /** A month. */
  income: number
  /** How many paychecks the month's income arrives in. */
  paychecks: number
  /** A month. Living is whatever income is left after it. */
  investing: number
  steps: Step[]
  categories: Category[]
}

export const MAX_PAYCHECKS = 5

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

const item = (name: string, amount: number): Item => ({ id: newId(), name, amount })
const category = (name: string, amount: number, items: Item[] = []): Category => ({
  id: newId(),
  name,
  amount: items.length ? sum(items.map((i) => i.amount)) : amount,
  note: '',
  items,
})
const step = (text: string, amount: number): Step => ({ id: newId(), text, amount, done: false })

/** Orion's budget as written down: $7,800 a month in two paychecks. */
export function orionBudget(): Budget {
  return {
    income: 7800,
    paychecks: 2,
    investing: 4000,
    steps: [step('Goes into 401k', 405), step('Invest in VTI', 1500), step('Remains for 2 wks', 1900)],
    categories: [
      category('Rent, utils, park', 1380),
      category('STNDRD', 1000),
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
  }
}

export function emptyBudget(): Budget {
  return { income: 0, paychecks: 2, investing: 0, steps: [], categories: [] }
}

// ---------------------------------------------------------------- the sums

export function sum(values: number[]): number {
  return roundCents(values.reduce((total, n) => total + n, 0))
}

export function categoryTotal(c: Category): number {
  return c.items.length ? sum(c.items.map((i) => i.amount)) : c.amount
}

export function living(b: Budget): number {
  return roundCents(b.income - b.investing)
}

/** Investing and Living as fractions of income, 0 when there's no income yet. */
export function shares(b: Budget): { investing: number; living: number } {
  if (b.income <= 0) return { investing: 0, living: 0 }
  return { investing: b.investing / b.income, living: living(b) / b.income }
}

export function perPaycheck(b: Budget, monthly = b.income): number {
  return roundCents(monthly / Math.max(1, b.paychecks))
}

export function expensesTotal(b: Budget): number {
  return sum(b.categories.map(categoryTotal))
}

/** Living left after the expenses: negative when they come to more. */
export function livingLeft(b: Budget): number {
  return roundCents(living(b) - expensesTotal(b))
}

/**
 * The paycheck as it's worked through: what it starts at, what's left after
 * each step in order, and what no step accounts for (negative when the steps
 * ask for more than the paycheck).
 */
export function paycheckRun(b: Budget): { start: number; after: number[]; leftOver: number } {
  const start = perPaycheck(b)
  let left = start
  const after = b.steps.map((s) => (left = roundCents(left - s.amount)))
  return { start, after, leftOver: left }
}

// --------------------------------------------------------------- the edits

export const setIncome = (b: Budget, income: number): Budget => ({ ...b, income: Math.max(0, roundCents(income)) })

export const setInvesting = (b: Budget, investing: number): Budget => ({
  ...b,
  investing: Math.max(0, roundCents(investing)),
})

/** Living is the rest of income, so setting it moves Investing. */
export const setLiving = (b: Budget, amount: number): Budget => setInvesting(b, b.income - Math.max(0, amount))

export const setInvestingShare = (b: Budget, share: number): Budget =>
  setInvesting(b, b.income * Math.min(1, Math.max(0, share)))

export const setLivingShare = (b: Budget, share: number): Budget =>
  setInvestingShare(b, 1 - Math.min(1, Math.max(0, share)))

export const setPaychecks = (b: Budget, paychecks: number): Budget => ({
  ...b,
  paychecks: Math.min(MAX_PAYCHECKS, Math.max(1, Math.round(paychecks))),
})

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

/** Moves a step one place earlier (-1) or later (+1) in the order. */
export function moveStep(b: Budget, id: string, by: -1 | 1): Budget {
  const from = b.steps.findIndex((s) => s.id === id)
  const to = from + by
  if (from < 0 || to < 0 || to >= b.steps.length) return b
  const steps = [...b.steps]
  ;[steps[from], steps[to]] = [steps[to], steps[from]]
  return { ...b, steps }
}

export const toggleStep = (b: Budget, id: string): Budget => updateStep(b, id, { done: !b.steps.find((s) => s.id === id)?.done })

/** Clears the ticks for the next paycheck. */
export const resetSteps = (b: Budget): Budget => ({ ...b, steps: b.steps.map((s) => (s.done ? { ...s, done: false } : s)) })

// Categories and their items

export function addCategory(b: Budget): [Budget, string] {
  const c = category('', 0)
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
  const paychecks = typeof raw.paychecks === 'number' && Number.isFinite(raw.paychecks) ? raw.paychecks : 2

  const steps: Step[] = (Array.isArray(raw.steps) ? raw.steps : []).filter(isObject).map((s) => ({
    id: idOf(s.id, seen),
    text: textOf(s.text),
    amount: amountOf(s.amount),
    done: s.done === true,
  }))

  const categories: Category[] = (Array.isArray(raw.categories) ? raw.categories : []).filter(isObject).map((c) =>
    settle({
      id: idOf(c.id, seen),
      name: textOf(c.name),
      amount: amountOf(c.amount),
      note: textOf(c.note, 2000),
      items: (Array.isArray(c.items) ? c.items : [])
        .filter(isObject)
        .map((i) => ({ id: idOf(i.id, seen), name: textOf(i.name), amount: amountOf(i.amount) })),
    }),
  )

  return {
    income: amountOf(raw.income),
    paychecks: Math.min(MAX_PAYCHECKS, Math.max(1, Math.round(paychecks))),
    investing: amountOf(raw.investing),
    steps,
    categories,
  }
}

/** Same numbers, names and order: a copy that changes nothing on screen. */
export function sameBudget(a: Budget | null, b: Budget | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
