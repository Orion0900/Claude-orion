import { orionBudget, normalizeBudget, setProjection } from './budget'
import { compactMoney, inTodaysDollars, niceTicks, pointsInTodaysDollars, project } from './projection'

describe('project', () => {
  it('grows nothing without a return: the total is what was put in', () => {
    const points = project({ start: 1000, monthly: 100, k401: 0, rate: 0, years: 2 })
    expect(points).toEqual([
      { year: 0, value: 1000, contributed: 1000 },
      { year: 1, value: 2200, contributed: 2200 },
      { year: 2, value: 3400, contributed: 3400 },
    ])
  })

  it('compounds monthly', () => {
    // $10,000 at 12% a year, 1% a month, for a year: 10,000 × 1.01^12.
    expect(project({ start: 10000, monthly: 0, k401: 0, rate: 0.12, years: 1 })[1].value).toBe(11268.25)
  })

  it("projects Orion's $2,900 a month plus $810 into the 401k at 7% for 30 years", () => {
    const last = project(orionBudget().projection).at(-1)!
    expect(last.contributed).toBe(1335600)
    const without401k = project({ ...orionBudget().projection, k401: 0 }).at(-1)!
    expect(without401k.contributed).toBe(1044000)
    expect(last.value).toBeGreaterThan(without401k.value)
  })

  it('adds the 401k to what goes in each month', () => {
    expect(project({ start: 0, monthly: 100, k401: 50, rate: 0, years: 1 })[1]).toEqual({ year: 1, value: 1800, contributed: 1800 })
  })
})

describe('projection settings', () => {
  it('starts older saves contributing the markets investing', () => {
    expect(normalizeBudget({ investing: 3500 })!.projection).toEqual({ start: 0, monthly: 2900, k401: 0, rate: 0.07, years: 30, inflation: 0.03, real: false })
    // ...and the steps taken out before the paycheck as the 401k: $405 twice a month.
    const v3 = { version: 3, paycheck: 3900, cadence: 'semimonthly', investing: 4000, steps: [{ text: '401k', amount: 405, beforePay: true }] }
    expect(normalizeBudget(v3)!.projection.k401).toBe(810)
  })

  it('keeps settings in range', () => {
    const b = setProjection(orionBudget(), { rate: 2, years: 500, start: -5 })
    expect(b.projection).toEqual({ start: 0, monthly: 2900, k401: 810, rate: 0.3, years: 60, inflation: 0.03, real: false })
    expect(setProjection(b, { years: 0 }).projection.years).toBe(1)
  })
})

describe("today's dollars", () => {
  it('discounts a future amount by inflation', () => {
    expect(inTodaysDollars(1000, 0, 0.03)).toBe(1000)
    expect(inTodaysDollars(1000, 1, 0.03)).toBe(970.87)
    // 3% a year roughly halves spending power in 24 years.
    expect(inTodaysDollars(1_000_000, 24, 0.03)).toBeCloseTo(491_934, -1)
  })

  it('turns the whole projection into today\'s dollars', () => {
    const pts = pointsInTodaysDollars(project(orionBudget().projection), 0.03)
    const nominal = project(orionBudget().projection)
    expect(pts[0]).toEqual(nominal[0])
    expect(pts[30].value).toBeCloseTo(nominal[30].value / 1.03 ** 30, 0)
    expect(pts[30].contributed).toBeLessThan(nominal[30].contributed)
  })

  it('keeps inflation in range and the switch off unless set', () => {
    const b = setProjection(orionBudget(), { inflation: 0.5, real: true })
    expect(b.projection).toMatchObject({ inflation: 0.15, real: true })
    expect(setProjection(b, { inflation: -1 }).projection.inflation).toBe(0)
    expect(normalizeBudget({ version: 5, projection: { real: 'yes' } })!.projection.real).toBe(false)
  })
})

describe('axis helpers', () => {
  it('picks round ticks that reach past the top', () => {
    expect(niceTicks(4_850_000)).toEqual([0, 2_000_000, 4_000_000, 6_000_000])
    expect(niceTicks(950)).toEqual([0, 250, 500, 750, 1000])
    expect(niceTicks(0)).toEqual([0])
  })

  it('writes short amounts', () => {
    expect(compactMoney(4_860_000)).toBe('$4.9M')
    expect(compactMoney(250_000)).toBe('$250k')
    expect(compactMoney(12_500)).toBe('$12.5k')
    expect(compactMoney(4000)).toBe('$4,000')
  })
})
