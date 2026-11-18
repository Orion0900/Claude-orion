import {
  addCategory,
  addItem,
  bucketTotal,
  CADENCES,
  cardHistory,
  cardRecord,
  categoryTotal,
  emptyBudget,
  investingTotal,
  isBlankCategory,
  k401Monthly,
  leftOver,
  livingTotal,
  monthKey,
  monthLabel,
  monthlyIncome,
  normalizeBudget,
  orionBudget,
  paycheckPlan,
  paychecksPerMonth,
  perPaycheck,
  removeCategory,
  removeItem,
  restoreCategory,
  restoreItem,
  sameBudget,
  setBonus,
  setBonusShare,
  setCadence,
  setCard,
  setCategoryBucket,
  setGross,
  setK401,
  setPaycheck,
  setMonthlyIncome,
  setSpent,
  spentThisMonth,
  takeHomeShare,
  takeHomeYear,
  toggleCheck,
  currentChecks,
  checkHistory,
  holdCardBudget,
  periodKey,
  periodLabel,
  investPerPaycheck,
  updateCategory,
  updateItem,
  variableCheck,
  type Budget,
} from './budget'

const byName = (b: Budget, name: string) => b.categories.find((c) => c.name === name)!
const names = (b: Budget, bucket: string) => b.categories.filter((c) => c.bucket === bucket).map((c) => c.name)

describe("Orion's budget", () => {
  const b = orionBudget()

  it('makes $7,800 a month from $3,900 twice a month', () => {
    expect(monthlyIncome(b)).toBe(7800)
    expect(takeHomeYear(b)).toBe(93600)
    expect(paychecksPerMonth(b)).toBe(2)
  })

  it('sorts every category into markets, self investment, fixed or variable', () => {
    expect(names(b, 'invest')).toEqual(['VTI'])
    expect(names(b, 'self')).toEqual(['STNDRD'])
    expect(names(b, 'fixed')).toEqual(['Rent, utils, park', 'Car', 'Subscriptions', 'Haircut', 'Medical'])
    expect(names(b, 'variable')).toEqual(['Food', 'Gas', 'Random'])
  })

  it('splits into $3,900 Investing and $3,053 Living, $847 left over', () => {
    expect(bucketTotal(b, 'invest')).toBe(2900)
    expect(bucketTotal(b, 'self')).toBe(1000)
    expect(investingTotal(b)).toBe(3900)
    expect(bucketTotal(b, 'fixed')).toBe(2053)
    expect(bucketTotal(b, 'variable')).toBe(1000)
    expect(livingTotal(b)).toBe(3053)
    expect(leftOver(b)).toBe(847)
  })

  it('adds up the subscriptions', () => {
    expect(categoryTotal(byName(b, 'Subscriptions'))).toBe(223)
    expect(byName(b, 'Subscriptions').items).toHaveLength(10)
  })

  it('puts $405 a paycheck in the 401k, $810 a month', () => {
    expect(b.k401).toBe(405)
    expect(k401Monthly(b)).toBe(810)
    expect(b.projection).toMatchObject({ monthly: 2900, k401: 810 })
  })

  it('names the cards', () => {
    expect(b.cards).toEqual({ fixed: 'Chase Sapphire', variable: 'Amazon card' })
  })
})

describe('paycheck plan', () => {
  it('starts at the paycheck: VTI, then each card, with STNDRD on the fixed card', () => {
    const plan = paycheckPlan(orionBudget())
    expect(plan.rows.map((r) => [r.label, r.amount, r.bucket])).toEqual([
      ['Deposit into VTI', 1450, 'invest'],
      ['Set aside for Chase Sapphire', 1527, 'fixed'],
      ['Set aside for Amazon card', 500, 'variable'],
    ])
    expect(plan.rows[1].detail).toBe('Fixed: Rent, utils, park, Car, Subscriptions, Haircut, Medical, plus STNDRD')
    expect(plan.start).toBe(3900)
    expect(plan.after).toEqual([2450, 923, 423])
    expect(plan.leftOver).toBe(423)
  })

  it('names what each card covers', () => {
    const plan = paycheckPlan(orionBudget())
    expect(plan.rows.find((r) => r.key === 'variable')!.detail).toBe('Variable: Food, Gas, Random')
  })

  it('follows the categories and the card names', () => {
    let b = orionBudget()
    b = updateCategory(b, byName(b, 'Food').id, { amount: 800 })
    b = setCard(b, 'variable', 'Prime Visa')
    const row = paycheckPlan(b).rows.find((r) => r.key === 'variable')!
    expect(row).toMatchObject({ label: 'Set aside for Prime Visa', amount: 600 })
  })

  it('shows short when the paycheck runs out', () => {
    const plan = paycheckPlan({ ...orionBudget(), paycheck: 3000 })
    expect(plan.leftOver).toBe(-477)
  })

  it('leaves the 401k out: it comes out before the paycheck', () => {
    expect(paycheckPlan(orionBudget()).rows.some((r) => r.label.includes('401k'))).toBe(false)
  })

})

describe('payday checklist', () => {
  const oct3 = new Date(2026, 9, 3)
  const oct14 = new Date(2026, 9, 14)
  const oct15 = new Date(2026, 9, 15)
  const nov1 = new Date(2026, 10, 1)

  it('splits the month at the 15th', () => {
    expect(periodKey(oct3)).toBe('2026-10-1')
    expect(periodKey(oct14)).toBe('2026-10-1')
    expect(periodKey(oct15)).toBe('2026-10-15')
    expect(periodLabel('2026-10-1')).toBe('Oct 1–14, 2026')
    expect(periodLabel('2026-10-15')).toBe('Oct 15–31, 2026')
    expect(periodLabel('2027-02-15')).toBe('Feb 15–28, 2027')
  })

  it('ticks items for the period, in a fixed order, with what went into VTI', () => {
    expect(investPerPaycheck(orionBudget())).toBe(1450)
    let b = toggleCheck(orionBudget(), 'variable', oct3)
    b = toggleCheck(b, 'invest', oct3)
    expect(currentChecks(b, oct14)).toEqual(['invest', 'variable'])
    expect(b.checks['2026-10-1']).toEqual({ done: ['invest', 'variable'], invest: 1450 })
    b = toggleCheck(b, 'variable', oct3)
    expect(currentChecks(b, oct3)).toEqual(['invest'])
  })

  it('starts over on the 1st and the 15th and keeps the rest as history', () => {
    let b = toggleCheck(orionBudget(), 'invest', oct3)
    expect(currentChecks(b, oct15)).toEqual([])
    b = toggleCheck(b, 'fixed', oct15)
    expect(currentChecks(b, nov1)).toEqual([])
    expect(checkHistory(b, nov1).map((h) => [h.period, h.done])).toEqual([
      ['2026-10-15', ['fixed']],
      ['2026-10-1', ['invest']],
    ])
    expect(checkHistory(b, oct15).map((h) => h.period)).toEqual(['2026-10-1'])
  })
})

describe('variable card check-in', () => {
  const oct10 = new Date(2026, 9, 10)

  it('measures this month against the $1,000 budget', () => {
    const b = setSpent(orionBudget(), 400, oct10)
    expect(b.cardMonths).toEqual({ '2026-10': { spent: 400, day: 10, budget: 1000 } })
    const v = variableCheck(b, oct10)
    expect(v).toMatchObject({ budget: 1000, spent: 400, left: 600, days: 31, day: 10, daysLeft: 22, checked: 10 })
    expect(v.pace).toBe(322.58)
    expect(v.aheadOfPace).toBe(-77.42)
    expect(v.perDay).toBeCloseTo(27.27, 2)
  })

  it('knows when it has not been checked this month', () => {
    expect(variableCheck(orionBudget(), oct10).checked).toBeNull()
    const b = setSpent(orionBudget(), 400, oct10)
    expect(variableCheck(b, new Date(2026, 9, 17)).checked).toBe(10)
    expect(variableCheck(b, new Date(2026, 10, 2)).checked).toBeNull()
  })

  it('starts each month from nothing', () => {
    const b = setSpent(orionBudget(), 400, oct10)
    expect(spentThisMonth(b, new Date(2026, 10, 1))).toBe(0)
    expect(monthKey(new Date(2026, 0, 31))).toBe('2026-01')
  })

  it('keeps every month: the last figure typed, the day, and the budget it had', () => {
    let b = setSpent(orionBudget(), 400, new Date(2026, 8, 12))
    b = setSpent(b, 1080, new Date(2026, 8, 30))
    b = updateCategory(b, byName(b, 'Food').id, { amount: 700 })
    b = setSpent(b, 950, new Date(2026, 9, 28))
    b = setSpent(b, 120, new Date(2026, 10, 4))
    const nov = new Date(2026, 10, 18)
    expect(spentThisMonth(b, nov)).toBe(120)
    const history = cardHistory(b, nov)
    expect(history).toEqual([
      { month: '2026-10', spent: 950, day: 28, budget: 1100, left: 150, days: 31 },
      { month: '2026-09', spent: 1080, day: 30, budget: 1000, left: -80, days: 30 },
    ])
    expect(cardRecord(history)).toEqual({ months: 2, under: 1, average: 1015 })
    expect(cardRecord([])).toEqual({ months: 0, under: 0, average: 0 })
    expect(monthLabel('2026-09')).toBe('September 2026')
  })

  it('holds this month to the budget as it stands, and earlier months to the one they ended with', () => {
    let b = setSpent(orionBudget(), 900, new Date(2026, 8, 20))
    b = setSpent(b, 400, oct10)
    b = updateCategory(b, byName(b, 'Gas').id, { amount: 250 })
    const held = holdCardBudget(b, oct10)
    expect(held.cardMonths).toEqual({ '2026-09': { spent: 900, day: 20, budget: 1000 }, '2026-10': { spent: 400, day: 10, budget: 1100 } })
    expect(holdCardBudget(held, oct10)).toBe(held)
    // Not checked yet this month: nothing to hold.
    expect(holdCardBudget(b, new Date(2026, 10, 3))).toBe(b)
  })

  it('counts a month right on budget as under it', () => {
    const b = setSpent(orionBudget(), 1000, oct10)
    expect(cardRecord(cardHistory(b, new Date(2026, 10, 1))).under).toBe(1)
  })

  it('shows over the budget', () => {
    const v = variableCheck(setSpent(orionBudget(), 1100, oct10), oct10)
    expect(v.left).toBe(-100)
    expect(v.perDay).toBe(0)
  })
})

describe('paycheck and gross pay', () => {
  it('fills income from the paycheck and its cadence', () => {
    const b = orionBudget()
    // A new cadence keeps the month's income and reworks the paycheck.
    expect(monthlyIncome(setCadence(b, 'biweekly'))).toBe(7800)
    expect(setCadence(b, 'biweekly').paycheck).toBeCloseTo(3600)
    expect(setCadence(b, 'monthly').paycheck).toBe(7800)
    expect(setCadence(b, 'yearly' as never)).toBe(b)
    expect(CADENCES.map((c) => c.perYear)).toEqual([52, 26, 24, 12])
  })

  it('works per paycheck on any cadence', () => {
    expect(perPaycheck(setCadence(orionBudget(), 'biweekly'), 1300)).toBe(600)
    expect(perPaycheck({ ...orionBudget(), cadence: 'biweekly' }, 1300)).toBe(600)
  })

  it('keeps gross pay and bonus beside the budget', () => {
    let b = setGross(orionBudget(), 120000)
    expect(takeHomeShare(b)).toBeCloseTo(0.78)
    b = setBonusShare(b, 0.1)
    expect(b.bonus).toBe(12000)
    expect(monthlyIncome(b)).toBe(7800)
    expect(setBonus(b, -5).bonus).toBe(0)
    expect(takeHomeShare(emptyBudget())).toBeNull()
  })

  it('puts a raise into VTI and leaves Living alone', () => {
    const b = orionBudget()
    const raised = setMonthlyIncome(b, 8800)
    expect(raised.paycheck).toBe(4400)
    expect(monthlyIncome(raised)).toBe(8800)
    expect(byName(raised, 'VTI').amount).toBe(3900)
    expect(livingTotal(raised)).toBe(livingTotal(b))
    expect(leftOver(raised)).toBe(leftOver(b))
    expect(paycheckPlan(raised).rows[0]).toMatchObject({ label: 'Deposit into VTI', amount: 1950 })
    expect(raised.projection.monthly).toBe(3900)
    // A cut comes out of VTI, never below $0.
    expect(byName(setMonthlyIncome(b, 7000), 'VTI').amount).toBe(2100)
    expect(byName(setMonthlyIncome(b, 1000), 'VTI').amount).toBe(0)
    // Typing the paycheck does the same.
    expect(byName(setPaycheck(b, 4100), 'VTI').amount).toBe(3300)
    // A projection set by hand stays.
    const custom = setMonthlyIncome({ ...b, projection: { ...b.projection, monthly: 2000 } }, 8800)
    expect(custom.projection.monthly).toBe(2000)
  })

  it('works out the paycheck from monthly net on any cadence', () => {
    const b = setMonthlyIncome(setCadence(orionBudget(), 'biweekly'), 8800)
    expect(b.paycheck).toBeCloseTo(4061.54, 2)
    expect(monthlyIncome(b)).toBe(8800)
  })

  it('never goes negative', () => {
    expect(setPaycheck(orionBudget(), -1).paycheck).toBe(0)
    expect(setK401(orionBudget(), -1).k401).toBe(0)
  })
})

describe('categories', () => {
  it('adds a blank category to a bucket and knows it is blank', () => {
    const [b, id] = addCategory(orionBudget(), 'variable')
    const c = b.categories.find((x) => x.id === id)!
    expect(c.bucket).toBe('variable')
    expect(isBlankCategory(c)).toBe(true)
    expect(isBlankCategory(byName(b, 'Car'))).toBe(false)
  })

  it('moves a category between buckets', () => {
    const b = orionBudget()
    const moved = setCategoryBucket(b, byName(b, 'Car').id, 'variable')
    expect(bucketTotal(moved, 'fixed')).toBe(1803)
    expect(bucketTotal(moved, 'variable')).toBe(1250)
    expect(names(moved, 'variable').at(-1)).toBe('Car')
    expect(setCategoryBucket(b, byName(b, 'Car').id, 'fixed')).toBe(b)
  })

  it('starts the first item at the whole amount so the total holds', () => {
    let b = orionBudget()
    const car = byName(b, 'Car')
    let itemId: string
    ;[b, itemId] = addItem(b, car.id)
    expect(byName(b, 'Car').items[0]).toMatchObject({ id: itemId, amount: 250 })
    b = updateItem(b, car.id, itemId, { name: 'Insurance', amount: 150 })
    ;[b] = addItem(b, car.id)
    b = updateItem(b, car.id, byName(b, 'Car').items[1].id, { name: 'Gas', amount: 100 })
    expect(byName(b, 'Car').amount).toBe(250)
  })

  it('updates the total when a subscription changes or goes', () => {
    let b = orionBudget()
    const subs = byName(b, 'Subscriptions')
    const spotify = subs.items.find((i) => i.name === 'Spotify')!
    b = updateItem(b, subs.id, spotify.id, { amount: 17 })
    expect(byName(b, 'Subscriptions').amount).toBe(225)
    b = removeItem(b, subs.id, spotify.id)
    expect(byName(b, 'Subscriptions').amount).toBe(208)
    expect(bucketTotal(b, 'fixed')).toBe(2038)
  })

  it('removes a category', () => {
    const b = orionBudget()
    expect(investingTotal(removeCategory(b, byName(b, 'VTI').id))).toBe(1000)
  })

  it('puts a removed category back in its place, keeping edits made since', () => {
    const b = orionBudget()
    const car = byName(b, 'Car')
    const index = b.categories.indexOf(car)
    let after = removeCategory(b, car.id)
    after = updateCategory(after, byName(after, 'Food').id, { amount: 650 })
    const back = restoreCategory(after, car, index)
    expect(back.categories.map((c) => c.name)).toEqual(b.categories.map((c) => c.name))
    expect(byName(back, 'Food').amount).toBe(650)
    expect(restoreCategory(back, car, index)).toBe(back)
  })

  it('puts a removed item back in its place, and the total with it', () => {
    const b = orionBudget()
    const subs = byName(b, 'Subscriptions')
    const hbo = subs.items[3]
    let after = removeItem(b, subs.id, hbo.id)
    expect(byName(after, 'Subscriptions').amount).toBe(203)
    after = updateItem(after, subs.id, subs.items[0].id, { amount: 70 })
    const back = restoreItem(after, subs.id, hbo, 3)
    expect(byName(back, 'Subscriptions').items.map((i) => i.name)).toEqual(subs.items.map((i) => i.name))
    expect(byName(back, 'Subscriptions').amount).toBe(228)
    expect(restoreItem(back, subs.id, hbo, 3)).toBe(back)
    expect(restoreItem(removeCategory(after, subs.id), subs.id, hbo, 3).categories.some((c) => c.id === subs.id)).toBe(false)
  })

  it('brings back the last item of a category, and its amount', () => {
    let b = orionBudget()
    const car = byName(b, 'Car')
    ;[b] = addItem(b, car.id)
    const only = byName(b, 'Car').items[0]
    const emptied = removeItem(b, car.id, only.id)
    expect(byName(emptied, 'Car').amount).toBe(0)
    expect(byName(restoreItem(emptied, car.id, only, 0), 'Car').amount).toBe(250)
  })
})

describe('normalizeBudget', () => {
  it('round-trips a budget unchanged', () => {
    const b = toggleCheck(setSpent(orionBudget(), 300, new Date(2026, 9, 1)), 'fixed', new Date(2026, 9, 1))
    const back = normalizeBudget({ version: 6, ...JSON.parse(JSON.stringify(b)) })
    expect(sameBudget(back, b)).toBe(true)
  })

  it('rejects things that are not budgets', () => {
    expect(normalizeBudget(null)).toBeNull()
    expect(normalizeBudget('budget')).toBeNull()
    expect(normalizeBudget([1, 2])).toBeNull()
  })

  it('fills in an empty object as an empty budget', () => {
    expect(normalizeBudget({})).toEqual(emptyBudget())
  })

  it('repairs what it can', () => {
    const b = normalizeBudget({
      version: 5,
      gross: '120000',
      bonus: -5,
      paycheck: 3900.4,
      cadence: 'yearly',
      paychecks: 12,
      k401: -1,
      cards: { fixed: '', variable: 7 },
      checks: { '2026-10-15': { done: ['fixed', 'nope', 'invest'], invest: 1450 }, '2026-10-7': { done: [] }, '2026-13-1': { done: [] }, junk: 1 },
      cardMonths: {
        '2026-09': { spent: 900, day: 30, budget: 1000 },
        '2026-10': { spent: -5, day: 40, budget: 'lots' },
        '2026-13': { spent: 1, day: 1, budget: 1 },
        October: { spent: 50 },
        '2026-11': 7,
      },
      categories: [
        { id: 'a', name: 'Food', amount: Infinity, items: 'none', bucket: 'nope' },
        { id: 'a', name: 'Subs', amount: 1, items: [{ name: 'HBO', amount: 20 }, { name: 'Max', amount: 5 }], bucket: 'variable' },
      ],
    })!
    expect(b).toMatchObject({ gross: 0, bonus: 0, paycheck: 3900.4, cadence: 'weekly', k401: 0 })
    expect(b.checks).toEqual({ '2026-10-15': { done: ['invest', 'fixed'], invest: 1450 } })
    expect(b.cards).toEqual({ fixed: 'Chase Sapphire', variable: 'Amazon card' })
    expect(b.cardMonths).toEqual({
      '2026-09': { spent: 900, day: 30, budget: 1000 },
      '2026-10': { spent: 0, day: 0, budget: 25 },
    })
    expect(b.categories[0]).toMatchObject({ id: 'a', amount: 0, items: [], note: '', bucket: 'fixed' })
    expect(b.categories[1].id).not.toBe('a')
    expect(b.categories[1]).toMatchObject({ amount: 25, bucket: 'variable' })
  })

  it("carries over the card's figure from before every month was kept", () => {
    const v5 = { ...JSON.parse(JSON.stringify(orionBudget())), version: 5, spent: { month: '2026-10', amount: 640 } }
    delete v5.cardMonths
    expect(normalizeBudget(v5)!.cardMonths).toEqual({ '2026-10': { spent: 640, day: 0, budget: 1000 } })
    // Nothing typed yet, or a month that isn't one: nothing kept.
    expect(normalizeBudget({ ...v5, spent: { month: '', amount: 0 } })!.cardMonths).toEqual({})
    expect(normalizeBudget({ ...v5, spent: { month: '2026-10x', amount: 9 } })!.cardMonths).toEqual({})
    // Its day isn't known, so it reads as checked earlier in the month.
    expect(variableCheck(normalizeBudget(v5)!, new Date(2026, 9, 20)).checked).toBe(0)
  })

  it('carries a first-version budget over, keeping its monthly income', () => {
    const v1 = { version: 1, income: 7800, paychecks: 2, investing: 4000, steps: [], categories: [] }
    expect(normalizeBudget(v1)).toMatchObject({ paycheck: 3900, cadence: 'semimonthly' })
    expect(normalizeBudget({ ...v1, paychecks: 4 })).toMatchObject({ paycheck: 1800, cadence: 'weekly' })
  })

  it('moves an older budget onto the card system', () => {
    const v4 = {
      version: 4,
      paycheck: 3900,
      cadence: 'semimonthly',
      investing: 4000,
      steps: [
        { id: 's1', text: '401k', amount: 405, beforePay: true },
        { id: 's2', text: 'VTI', amount: 1500 },
      ],
      categories: [
        { id: 'a', name: 'STNDRD', amount: 1000, items: [], bucket: 'self' },
        { id: 'b', name: 'Rent, utils, park', amount: 1380, items: [], bucket: 'living' },
        { id: 'c', name: 'Food', amount: 800, items: [], bucket: 'living' },
      ],
      projection: { start: 5000, monthly: 3000, k401: 810, rate: 0.07, years: 30 },
    }
    const b = normalizeBudget(v4)!
    expect(b.k401).toBe(405)
    expect(b.checks).toEqual({})
    expect(b.categories.map((c) => [c.name, c.amount, c.bucket])).toEqual([
      ['VTI', 2900, 'invest'],
      ['STNDRD', 1000, 'self'],
      ['Rent, utils, park', 1380, 'fixed'],
      ['Food', 600, 'variable'],
      ['Gas', 150, 'variable'],
      ['Random', 250, 'variable'],
    ])
    expect(bucketTotal(b, 'variable')).toBe(1000)
    expect(b.projection).toMatchObject({ start: 5000, monthly: 2900, k401: 810 })
  })

  it('finds the 401k in a step from before steps could be marked', () => {
    const v2 = { version: 2, paycheck: 3900, steps: [{ text: 'Goes into 401(k)', amount: 405 }] }
    expect(normalizeBudget(v2)!.k401).toBe(405)
  })
})
