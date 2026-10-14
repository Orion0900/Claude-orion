import {
  addCategory,
  addItem,
  addStep,
  CADENCES,
  canMoveStep,
  categoryTotal,
  emptyBudget,
  expensesTotal,
  isBlankCategory,
  isBlankStep,
  living,
  livingLeft,
  marketInvesting,
  selfTotal,
  setCategoryBucket,
  monthlyIncome,
  moveStep,
  normalizeBudget,
  orionBudget,
  paycheckRun,
  paychecksPerMonth,
  perPaycheck,
  removeCategory,
  removeItem,
  removeStep,
  resetSteps,
  sameBudget,
  setBonus,
  setBonusShare,
  setCadence,
  setGross,
  setInvesting,
  setInvestingShare,
  setLiving,
  setLivingShare,
  setPaycheck,
  setStepBeforePay,
  shares,
  takeHomeShare,
  takeHomeYear,
  toggleStep,
  updateCategory,
  updateItem,
  updateStep,
  type Budget,
} from './budget'

const byName = (b: Budget, name: string) => b.categories.find((c) => c.name === name)!

describe("Orion's budget", () => {
  const b = orionBudget()

  it('splits $7,800 into $4,000 Investing and $3,800 Living', () => {
    expect(monthlyIncome(b)).toBe(7800)
    expect(b.investing).toBe(4000)
    expect(living(b)).toBe(3800)
    expect(shares(b).investing).toBeCloseTo(0.5128, 4)
    expect(shares(b).living).toBeCloseTo(0.4872, 4)
  })

  it('comes in two paychecks of $3,900 a month', () => {
    expect(b.paycheck).toBe(3900)
    expect(b.cadence).toBe('semimonthly')
    expect(paychecksPerMonth(b)).toBe(2)
    expect(perPaycheck(b)).toBe(3900)
    expect(perPaycheck(b, living(b))).toBe(1900)
  })

  it('adds the subscriptions up to $223', () => {
    const subscriptions = byName(b, 'Subscriptions')
    expect(subscriptions.items).toHaveLength(10)
    expect(categoryTotal(subscriptions)).toBe(223)
    expect(subscriptions.amount).toBe(223)
  })

  it('puts living expenses at $2,853, leaving $947 of Living', () => {
    expect(expensesTotal(b)).toBe(2853)
    expect(livingLeft(b)).toBe(947)
  })

  it('pays STNDRD from Investing as self investment, leaving $3,000 for the markets', () => {
    expect(byName(b, 'STNDRD').bucket).toBe('self')
    expect(selfTotal(b)).toBe(1000)
    expect(marketInvesting(b)).toBe(3000)
    expect(b.projection.monthly).toBe(3000)
  })

  it('takes the 401k out before the paycheck lands', () => {
    expect(b.steps.map((s) => [s.text, s.beforePay])).toEqual([
      ['Goes into 401k', true],
      ['Invest in VTI', false],
      ['Remains for 2 wks', false],
    ])
  })

  it('works the paycheck down step by step and leaves $500 over', () => {
    expect(paycheckRun(b)).toEqual({ start: 3900, after: [null, 2400, 500], leftOver: 500 })
  })

  it('gives every step, category and item its own id', () => {
    const ids = [...b.steps, ...b.categories, ...b.categories.flatMap((c) => c.items)].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the split', () => {
  const b = orionBudget()

  it('keeps Investing in dollars when the paycheck changes, so Living takes the difference', () => {
    const raised = setPaycheck(b, 4100)
    expect(monthlyIncome(raised)).toBe(8200)
    expect(raised.investing).toBe(4000)
    expect(living(raised)).toBe(4200)
  })

  it('moves Investing when Living is set', () => {
    expect(setLiving(b, 3500).investing).toBe(4300)
    expect(setLiving(b, 9000).investing).toBe(0)
  })

  it('sets either side by percent', () => {
    expect(setInvestingShare(b, 0.5).investing).toBe(3900)
    expect(setLivingShare(b, 0.4).investing).toBe(4680)
    expect(setInvestingShare(b, 2).investing).toBe(7800)
    expect(setInvestingShare(b, -1).investing).toBe(0)
  })

  it('never goes negative or keeps fractions of a cent', () => {
    expect(setInvesting(b, -10).investing).toBe(0)
    expect(setPaycheck(b, -1).paycheck).toBe(0)
    expect(setInvesting(b, 10.556).investing).toBe(10.56)
  })

  it('shows Living below zero when Investing is set above income', () => {
    expect(living(setInvesting(b, 9000))).toBe(-1200)
  })

  it('has no shares with no income', () => {
    expect(shares(emptyBudget())).toEqual({ investing: 0, living: 0 })
  })

})

describe('the paycheck and its cadence', () => {
  const b = orionBudget()

  it('makes the month from the paychecks in a year', () => {
    expect(CADENCES.map((c) => [c.id, c.perYear])).toEqual([
      ['weekly', 52],
      ['biweekly', 26],
      ['semimonthly', 24],
      ['monthly', 12],
    ])
    expect(monthlyIncome(setCadence(b, 'biweekly'))).toBe(8450)
    expect(monthlyIncome(setCadence(b, 'weekly'))).toBe(16900)
    expect(monthlyIncome(setCadence(b, 'monthly'))).toBe(3900)
  })

  it('counts every two weeks as 26 paychecks a year, two months with three', () => {
    const biweekly = setCadence(b, 'biweekly')
    expect(paychecksPerMonth(biweekly)).toBeCloseTo(2.1667, 4)
    expect(takeHomeYear(biweekly)).toBe(101400)
    // A paycheck is still a paycheck: the process starts from it.
    expect(perPaycheck(biweekly)).toBe(3900)
    expect(paycheckRun(biweekly).start).toBe(3900)
    expect(perPaycheck(biweekly, 4000)).toBe(1846.15)
  })

  it('ignores a cadence it does not know', () => {
    expect(setCadence(b, 'yearly' as never)).toBe(b)
  })

  it('keeps cents on a paycheck and never goes below zero', () => {
    expect(setPaycheck(b, 3333.333).paycheck).toBe(3333.33)
    expect(monthlyIncome(setPaycheck(b, 0))).toBe(0)
  })
})

describe('gross pay and bonus', () => {
  const b = orionBudget()

  it('starts empty, with no take-home share until there is a gross income', () => {
    expect(b.gross).toBe(0)
    expect(b.bonus).toBe(0)
    expect(takeHomeShare(b)).toBeNull()
  })

  it('works out the share of gross that comes home', () => {
    const paid = setGross(b, 120000)
    expect(takeHomeYear(paid)).toBe(93600)
    expect(takeHomeShare(paid)).toBeCloseTo(0.78, 4)
  })

  it('takes the bonus in dollars or as a share of gross', () => {
    const paid = setGross(b, 120000)
    expect(setBonus(paid, 15000).bonus).toBe(15000)
    expect(setBonusShare(paid, 0.125).bonus).toBe(15000)
    expect(setBonusShare(paid, 1.5).bonus).toBe(180000)
    expect(setBonus(paid, -3).bonus).toBe(0)
  })

  it('leaves the month alone: the income comes from the paycheck', () => {
    const paid = setBonus(setGross(b, 120000), 15000)
    expect(monthlyIncome(paid)).toBe(7800)
  })
})

describe('steps', () => {
  it('adds a blank step at the end', () => {
    const [b, id] = addStep(orionBudget())
    expect(b.steps).toHaveLength(4)
    expect(b.steps[3]).toMatchObject({ id, text: '', amount: 0, done: false })
    expect(isBlankStep(b.steps[3])).toBe(true)
  })

  it('edits, reorders and removes', () => {
    let b = orionBudget()
    const [k401, vti, rest] = b.steps
    b = updateStep(b, vti.id, { amount: 2100, text: 'Invest in VTI and VXUS' })
    expect(paycheckRun(b).leftOver).toBe(-100)
    b = moveStep(b, rest.id, -1)
    expect(b.steps.map((s) => s.id)).toEqual([k401.id, rest.id, vti.id])
    expect(paycheckRun(b).after).toEqual([null, 2000, -100])
    b = removeStep(b, k401.id)
    expect(b.steps).toHaveLength(2)
  })

  it("keeps steps on their own side of payday when they're moved", () => {
    const b = orionBudget()
    const [k401, vti] = b.steps
    expect(canMoveStep(b, vti.id, -1)).toBe(false)
    expect(moveStep(b, vti.id, -1)).toBe(b)
    expect(canMoveStep(b, k401.id, 1)).toBe(false)
    expect(canMoveStep(b, vti.id, 1)).toBe(true)
  })

  it('moves a step marked before the paycheck in front of it, and back', () => {
    let b = orionBudget()
    const [k401, vti, rest] = b.steps
    b = setStepBeforePay(b, rest.id, true)
    expect(b.steps.map((s) => s.id)).toEqual([k401.id, rest.id, vti.id])
    expect(paycheckRun(b)).toEqual({ start: 3900, after: [null, null, 2400], leftOver: 2400 })
    b = setStepBeforePay(b, k401.id, false)
    expect(b.steps.map((s) => s.id)).toEqual([rest.id, k401.id, vti.id])
    expect(paycheckRun(b).leftOver).toBe(1995)
  })

  it('ticks steps off and clears them for the next paycheck', () => {
    let b = orionBudget()
    b = toggleStep(b, b.steps[0].id)
    b = toggleStep(b, b.steps[1].id)
    expect(b.steps.map((s) => s.done)).toEqual([true, true, false])
    b = toggleStep(b, b.steps[1].id)
    expect(b.steps.map((s) => s.done)).toEqual([true, false, false])
    expect(resetSteps(b).steps.every((s) => !s.done)).toBe(true)
  })
})

describe('categories and items', () => {
  it('adds a blank category that can be told apart from a real one', () => {
    const [b, id] = addCategory(orionBudget())
    const added = b.categories.find((c) => c.id === id)!
    expect(isBlankCategory(added)).toBe(true)
    expect(isBlankCategory(updateCategory(b, id, { name: 'Gifts' }).categories.at(-1)!)).toBe(false)
  })

  it('changes a plain amount and the totals follow', () => {
    const b = orionBudget()
    const food = byName(b, 'Food')
    const next = updateCategory(b, food.id, { amount: 750 })
    expect(byName(next, 'Food').amount).toBe(750)
    expect(livingLeft(next)).toBe(997)
  })

  it('totals a category from its items, ignoring an amount typed over them', () => {
    const b = orionBudget()
    const subs = byName(b, 'Subscriptions')
    const next = updateCategory(b, subs.id, { amount: 5 })
    expect(byName(next, 'Subscriptions').amount).toBe(223)
  })

  it('starts the first item at the whole amount so the total holds', () => {
    let b = orionBudget()
    const car = byName(b, 'Car')
    let itemId: string
    ;[b, itemId] = addItem(b, car.id)
    expect(byName(b, 'Car').items[0]).toMatchObject({ id: itemId, amount: 250 })
    expect(byName(b, 'Car').amount).toBe(250)
    b = updateItem(b, car.id, itemId, { name: 'Insurance', amount: 150 })
    ;[b] = addItem(b, car.id)
    expect(byName(b, 'Car').items[1].amount).toBe(0)
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
    expect(expensesTotal(b)).toBe(2838)
  })

  it('drops to $0 when the last item goes', () => {
    let b = orionBudget()
    const car = byName(b, 'Car')
    let itemId: string
    ;[b, itemId] = addItem(b, car.id)
    b = removeItem(b, car.id, itemId)
    expect(byName(b, 'Car')).toMatchObject({ amount: 0, items: [] })
  })

  it('removes a category', () => {
    const b = orionBudget()
    const next = removeCategory(b, byName(b, 'Haircut').id)
    expect(next.categories).toHaveLength(6)
    expect(expensesTotal(next)).toBe(2753)
    const moved = setCategoryBucket(b, byName(b, 'Car').id, 'self')
    expect(expensesTotal(moved)).toBe(2603)
    expect(marketInvesting(moved)).toBe(2750)
  })
})

describe('normalizeBudget', () => {
  it('round-trips a budget unchanged', () => {
    const b = orionBudget()
    const back = normalizeBudget(JSON.parse(JSON.stringify(b)))
    expect(sameBudget(back, b)).toBe(true)
  })

  it('ignores extra fields like the version and save time', () => {
    const b = orionBudget()
    expect(sameBudget(normalizeBudget({ version: 1, savedAt: 'now', ...b }), b)).toBe(true)
  })

  it('rejects things that are not budgets', () => {
    expect(normalizeBudget(null)).toBeNull()
    expect(normalizeBudget('budget')).toBeNull()
    expect(normalizeBudget([1, 2])).toBeNull()
  })

  it('carries a first-version budget over, keeping its monthly income', () => {
    const v1 = { version: 1, income: 7800, paychecks: 2, investing: 4000, steps: [], categories: [] }
    expect(normalizeBudget(v1)).toMatchObject({ paycheck: 3900, cadence: 'semimonthly', gross: 0, bonus: 0 })
    const monthly = normalizeBudget({ ...v1, paychecks: 1 })!
    expect(monthly).toMatchObject({ paycheck: 7800, cadence: 'monthly' })
    const weekly = normalizeBudget({ ...v1, paychecks: 4 })!
    expect(weekly).toMatchObject({ paycheck: 1800, cadence: 'weekly' })
    expect(monthlyIncome(weekly)).toBe(7800)
  })

  it('repairs what it can', () => {
    const b = normalizeBudget({
      gross: '120000',
      bonus: -5,
      paycheck: 3900.123,
      cadence: 'yearly',
      paychecks: 12,
      investing: -4,
      steps: [{ text: 'Invest', amount: 1500.123, done: 'yes' }, 'junk'],
      categories: [
        { id: 'a', name: 'Food', amount: Infinity, items: 'none' },
        { id: 'a', name: 'Subs', amount: 1, items: [{ name: 'HBO', amount: 20 }, { name: 'Max', amount: 5 }] },
      ],
    })!
    expect(b.gross).toBe(0)
    expect(b.bonus).toBe(0)
    expect(b.paycheck).toBe(3900.12)
    expect(b.cadence).toBe('weekly')
    expect(b.investing).toBe(0)
    expect(b.steps).toEqual([{ id: expect.any(String), text: 'Invest', amount: 1500.12, done: false, beforePay: false }])
    expect(b.categories[0]).toMatchObject({ id: 'a', amount: 0, items: [], note: '' })
    // A repeated id gets a fresh one, and an item list sets the amount.
    expect(b.categories[1].id).not.toBe('a')
    expect(b.categories[1].amount).toBe(25)
  })

  it('takes the 401k out before the paycheck in budgets saved before that could be marked', () => {
    const v2 = {
      version: 2,
      paycheck: 3900,
      cadence: 'semimonthly',
      steps: [
        { id: 'a', text: 'Invest in VTI', amount: 1500 },
        { id: 'b', text: 'Goes into 401(k)', amount: 405 },
      ],
    }
    const b = normalizeBudget(v2)!
    expect(b.steps.map((s) => [s.id, s.beforePay])).toEqual([
      ['b', true],
      ['a', false],
    ])
    expect(paycheckRun(b).leftOver).toBe(2400)
    // Once it can be marked, what was marked stands.
    const v3 = normalizeBudget({ ...v2, version: 3, steps: [{ id: 'b', text: 'Goes into 401k', amount: 405, beforePay: false }] })!
    expect(v3.steps[0].beforePay).toBe(false)
  })

  it('moves STNDRD to self investment in saves from before it existed, and the projection with it', () => {
    const v3 = {
      version: 3,
      investing: 4000,
      categories: [
        { id: 'a', name: 'STNDRD', amount: 1000, items: [] },
        { id: 'b', name: 'Food', amount: 800, items: [] },
      ],
      projection: { start: 0, monthly: 4000, k401: 810, rate: 0.07, years: 30 },
    }
    const b = normalizeBudget(v3)!
    expect(b.categories.map((c) => c.bucket)).toEqual(['self', 'living'])
    expect(b.projection.monthly).toBe(3000)
    // A monthly amount chosen by hand stays.
    expect(normalizeBudget({ ...v3, projection: { ...v3.projection, monthly: 2500 } })!.projection.monthly).toBe(2500)
    // Once self investment exists, a category is where it was put.
    expect(normalizeBudget({ ...v3, version: 4 })!.categories[0].bucket).toBe('living')
  })

  it('fills in an empty object as an empty budget', () => {
    expect(normalizeBudget({})).toEqual(emptyBudget())
  })
})
