import { describe, expect, it } from 'vitest'
import { accrue, book, irr, waterfall, type WaterfallLedger } from './finance'

describe('irr', () => {
  it('annualizes a quarterly return', () => {
    // 100 in, 110.38 back a year later: 10.38% a year.
    expect(irr([-100, 0, 0, 0, 110.38])).toBeCloseTo(0.1038, 3)
  })

  it('handles a stream of distributions and a sale', () => {
    const flows = [-100, 2, 2, 2, 2, 2, 2, 2, 2, 120]
    const r = irr(flows)!
    // Check by discounting back at the answer.
    const q = Math.pow(1 + r, 0.25) - 1
    const npv = flows.reduce((sum, f, i) => sum + f / Math.pow(1 + q, i), 0)
    expect(Math.abs(npv)).toBeLessThan(1e-3)
  })

  it('is negative when you lose money', () => {
    expect(irr([-100, 0, 0, 0, 80])).toBeLessThan(0)
  })

  it('has no answer before anything comes back', () => {
    expect(irr([-100, -5, -5])).toBeNull()
    expect(irr([0, 0])).toBeNull()
  })
})

describe('the waterfall', () => {
  const fresh = (called: number): WaterfallLedger => ({ called, distributed: 0, carryPaid: 0, hurdle: called })

  it('returns capital and the pref before any carry', () => {
    const split = waterfall(80, fresh(100), 0.2)
    expect(split).toEqual({ lp: 80, gp: 0, toHurdle: 80 })
  })

  it('accrues the pref quarterly at 8% a year', () => {
    let h = 100
    for (let i = 0; i < 4; i++) h = accrue(h, 0.08)
    expect(h).toBeCloseTo(108, 6)
  })

  it('catches the GP up to 20% of the profit, then splits 80/20', () => {
    let ledger: WaterfallLedger = { called: 100, distributed: 0, carryPaid: 0, hurdle: 108 }
    const first = waterfall(108, ledger, 0.2)
    expect(first.gp).toBe(0)
    ledger = book(ledger, first)
    // 8 of profit to LPs so far; a full catch-up owes the GP 2.
    const second = waterfall(2, ledger, 0.2)
    expect(second.gp).toBeCloseTo(2, 6)
    ledger = book(ledger, second)
    const third = waterfall(100, ledger, 0.2)
    expect(third.gp).toBeCloseTo(20, 6)
    ledger = book(ledger, third)
    const profit = ledger.distributed + ledger.carryPaid - ledger.called
    expect(ledger.carryPaid / profit).toBeCloseTo(0.2, 6)
  })

  it('gives the GP nothing on a fund that loses money', () => {
    const split = waterfall(90, fresh(100), 0.2)
    expect(split.gp).toBe(0)
  })

  it('never splits more than it was given', () => {
    const ledger: WaterfallLedger = { called: 100, distributed: 60, carryPaid: 0, hurdle: 50 }
    for (const amount of [1, 10, 49.9, 50, 75, 500]) {
      const s = waterfall(amount, ledger, 0.2)
      expect(s.lp + s.gp).toBeCloseTo(amount, 9)
      expect(s.gp).toBeGreaterThanOrEqual(0)
    }
  })
})
