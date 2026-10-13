import {
  addCategory,
  addItem,
  addStep,
  categoryTotal,
  emptyBudget,
  expensesTotal,
  isBlankCategory,
  isBlankStep,
  living,
  livingLeft,
  moveStep,
  normalizeBudget,
  orionBudget,
  paycheckRun,
  perPaycheck,
  removeCategory,
  removeItem,
  removeStep,
  resetSteps,
  sameBudget,
  setIncome,
  setInvesting,
  setInvestingShare,
  setLiving,
  setLivingShare,
  setPaychecks,
  shares,
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
    expect(b.income).toBe(7800)
    expect(b.investing).toBe(4000)
    expect(living(b)).toBe(3800)
    expect(shares(b).investing).toBeCloseTo(0.5128, 4)
    expect(shares(b).living).toBeCloseTo(0.4872, 4)
  })

  it('comes in two paychecks of $3,900', () => {
    expect(b.paychecks).toBe(2)
    expect(perPaycheck(b)).toBe(3900)
    expect(perPaycheck(b, living(b))).toBe(1900)
  })

  it('adds the subscriptions up to $223', () => {
    const subscriptions = byName(b, 'Subscriptions')
    expect(subscriptions.items).toHaveLength(10)
    expect(categoryTotal(subscriptions)).toBe(223)
    expect(subscriptions.amount).toBe(223)
  })

  it('puts living expenses at $3,853, which is $53 more than Living', () => {
    expect(expensesTotal(b)).toBe(3853)
    expect(livingLeft(b)).toBe(-53)
  })

  it('works the paycheck down step by step and leaves $95 over', () => {
    expect(paycheckRun(b)).toEqual({ start: 3900, after: [3495, 1995, 95], leftOver: 95 })
  })

  it('gives every step, category and item its own id', () => {
    const ids = [...b.steps, ...b.categories, ...b.categories.flatMap((c) => c.items)].map((x) => x.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the split', () => {
  const b = orionBudget()

  it('keeps Investing in dollars when income changes, so Living takes the difference', () => {
    const raised = setIncome(b, 8200)
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
    expect(setIncome(b, -1).income).toBe(0)
    expect(setInvesting(b, 10.556).investing).toBe(10.56)
  })

  it('shows Living below zero when Investing is set above income', () => {
    expect(living(setInvesting(b, 9000))).toBe(-1200)
  })

  it('has no shares with no income', () => {
    expect(shares(emptyBudget())).toEqual({ investing: 0, living: 0 })
  })

  it('keeps paychecks between 1 and 5', () => {
    expect(setPaychecks(b, 0).paychecks).toBe(1)
    expect(setPaychecks(b, 9).paychecks).toBe(5)
    expect(perPaycheck(setPaychecks(b, 3))).toBe(2600)
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
    const [first, second] = b.steps
    b = updateStep(b, second.id, { amount: 1600, text: 'Invest in VTI and VXUS' })
    expect(paycheckRun(b).leftOver).toBe(-5)
    b = moveStep(b, second.id, -1)
    expect(b.steps.map((s) => s.id).slice(0, 2)).toEqual([second.id, first.id])
    expect(moveStep(b, second.id, -1)).toBe(b)
    b = removeStep(b, first.id)
    expect(b.steps).toHaveLength(2)
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
    expect(livingLeft(next)).toBe(-3)
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
    expect(expensesTotal(b)).toBe(3838)
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
    expect(expensesTotal(next)).toBe(3753)
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

  it('repairs what it can', () => {
    const b = normalizeBudget({
      income: '7800',
      paychecks: 12,
      investing: -4,
      steps: [{ text: 'Invest', amount: 1500.123, done: 'yes' }, 'junk'],
      categories: [
        { id: 'a', name: 'Food', amount: Infinity, items: 'none' },
        { id: 'a', name: 'Subs', amount: 1, items: [{ name: 'HBO', amount: 20 }, { name: 'Max', amount: 5 }] },
      ],
    })!
    expect(b.income).toBe(0)
    expect(b.paychecks).toBe(5)
    expect(b.investing).toBe(0)
    expect(b.steps).toEqual([{ id: expect.any(String), text: 'Invest', amount: 1500.12, done: false }])
    expect(b.categories[0]).toMatchObject({ id: 'a', amount: 0, items: [], note: '' })
    // A repeated id gets a fresh one, and an item list sets the amount.
    expect(b.categories[1].id).not.toBe('a')
    expect(b.categories[1].amount).toBe(25)
  })

  it('fills in an empty object as an empty budget', () => {
    expect(normalizeBudget({})).toEqual(emptyBudget())
  })
})
