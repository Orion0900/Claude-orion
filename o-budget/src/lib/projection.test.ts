import { orionBudget, normalizeBudget, setProjection } from './budget'
import { compactMoney, niceTicks, project } from './projection'

describe('project', () => {
  it('grows nothing without a return: the total is what was put in', () => {
    const points = project({ start: 1000, monthly: 100, rate: 0, years: 2 })
    expect(points).toEqual([
      { year: 0, value: 1000, contributed: 1000 },
      { year: 1, value: 2200, contributed: 2200 },
      { year: 2, value: 3400, contributed: 3400 },
    ])
  })

  it('compounds monthly', () => {
    // $10,000 at 12% a year, 1% a month, for a year: 10,000 × 1.01^12.
    expect(project({ start: 10000, monthly: 0, rate: 0.12, years: 1 })[1].value).toBe(11268.25)
  })

  it("projects Orion's $4,000 a month at 7% for 30 years", () => {
    const last = project(orionBudget().projection).at(-1)!
    expect(last.contributed).toBe(1440000)
    expect(last.value).toBeGreaterThan(4_800_000)
    expect(last.value).toBeLessThan(4_900_000)
  })
})

describe('projection settings', () => {
  it('starts older saves contributing the Investing amount', () => {
    expect(normalizeBudget({ investing: 3500 })!.projection).toEqual({ start: 0, monthly: 3500, rate: 0.07, years: 30 })
  })

  it('keeps settings in range', () => {
    const b = setProjection(orionBudget(), { rate: 2, years: 500, start: -5 })
    expect(b.projection).toEqual({ start: 0, monthly: 4000, rate: 0.3, years: 60 })
    expect(setProjection(b, { years: 0 }).projection.years).toBe(1)
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
