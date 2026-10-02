/*
 * The acquisitions model: run a building forward on the house view with a
 * chosen price, business plan and loan, sell it at the end, and report the
 * levered returns. It uses the same operating model the game itself runs,
 * just without the surprises.
 */
import { appraise, newLoan, noiAt, operate, planSpec, prepayCost, sizeLoan, startPlanOn, type Sizing } from './asset'
import { irr } from './finance'
import { comboKey, tickExpected } from './macro'
import type { Asset, Loan, LoanKind, Macro, Plan, PlanKind } from './types'

export interface UwInput {
  price: number
  plan: PlanKind
  /** Requested loan-to-value; the lender may cap it. 0 is all cash. */
  ltv: number
  loan: LoanKind
  years: number
  /** Added to the exit cap rate. The house view sells 25 bp wider than it would buy. */
  exitCapDelta?: number
  /** Added to annual rent growth for this building's market. */
  growthDelta?: number
  skill?: number
  /** Costs on top of the standard 1.5% of price for closing: diligence, mostly. */
  extraCosts?: number
}

export interface UwYear {
  year: number
  noi: number
  cashFlow: number
  dscr: number | null
  occ: number
}

export interface Underwriting {
  irr: number | null
  multiple: number
  profit: number
  equity: number
  peakEquity: number
  loan: number
  rate: number
  sizing: Sizing
  /** In-place NOI over price. */
  entryCap: number
  exitCap: number
  exitValue: number
  /** Stabilized NOI at exit over all-in cost. */
  yieldOnCost: number
  cashOnCash: number
  dscr: number | null
  capex: number
  closing: number
  /** Net proceeds from the sale after costs and the loan payoff. */
  sale: number
  years: UwYear[]
  flows: number[]
}

export const BASE_EXIT_SPREAD = 0.0025

export function underwrite(asset: Asset, macro: Macro, q: number, input: UwInput): Underwriting {
  const m: Macro = structuredClone(macro)
  const a: Asset & { plan: Plan | null; loan: Loan | null } = { ...structuredClone(asset), plan: null, loan: null }
  const closing = input.price * 0.015 + (input.extraCosts ?? 0)
  const spec = planSpec(a, m, input.plan)
  if (spec) startPlanOn(a, spec)
  const sizing = sizeLoan(a, m, input.loan, input.price)
  const loanAmount = Math.max(0, Math.min(input.ltv * input.price, sizing.max))
  if (loanAmount > 0) a.loan = newLoan(m, input.loan, a, loanAmount, q)
  const equity = input.price + closing - loanAmount
  const flows = [-equity]
  const years: UwYear[] = []
  const quarters = Math.max(4, Math.round(input.years * 4))
  const key = comboKey(a.type, a.market)
  let year = { noi: 0, cf: 0, ds: 0 }
  let outstanding = equity
  let peakEquity = equity
  let capex = 0
  let exitValue = 0
  let exitCap = 0
  let exitNoi = 0
  let sale = 0
  for (let i = 1; i <= quarters; i++) {
    tickExpected(m)
    if (input.growthDelta) m.rents[key] *= 1 + input.growthDelta / 4
    const ops = operate(a, m, null, input.skill ?? 1)
    if (ops.planDone) a.plan = null
    capex += ops.capex
    year.noi += ops.noi
    year.cf += ops.cashFlow
    year.ds += ops.debtService
    let cf = ops.cashFlow
    if (i === quarters) {
      const exit = appraise(a, m, input.exitCapDelta ?? BASE_EXIT_SPREAD)
      exitValue = exit.value
      exitCap = exit.cap
      exitNoi = exit.stabNoi
      const payoff = a.loan ? a.loan.balance + prepayCost(a.loan, m, q + i) : 0
      sale = exitValue * 0.985 - payoff
      cf += sale
    }
    flows.push(cf)
    if (i < quarters) {
      outstanding -= ops.cashFlow
      peakEquity = Math.max(peakEquity, outstanding)
    }
    if (i % 4 === 0 || i === quarters) {
      years.push({ year: Math.ceil(i / 4), noi: year.noi, cashFlow: year.cf, dscr: year.ds > 0 ? year.noi / year.ds : null, occ: a.occupancy })
      year = { noi: 0, cf: 0, ds: 0 }
    }
  }
  let invested = 0
  let returned = 0
  for (const f of flows) {
    if (f < 0) invested -= f
    else returned += f
  }
  const opsYears = years.length
  const cashOnCash = opsYears ? years.reduce((sum, y) => sum + y.cashFlow, 0) / opsYears / Math.max(1, equity) : 0
  return {
    irr: irr(flows),
    multiple: invested > 0 ? returned / invested : 0,
    profit: returned - invested,
    equity,
    peakEquity,
    loan: loanAmount,
    rate: a.loan?.rate ?? sizing.rate,
    sizing,
    entryCap: noiAt(asset, macro) / input.price,
    exitCap,
    exitValue,
    yieldOnCost: exitNoi / (input.price + closing + (spec?.budget ?? 0)),
    cashOnCash,
    dscr: years[0]?.dscr ?? null,
    capex,
    closing,
    sale,
    years,
    flows,
  }
}

export const SENSITIVITY_CAPS = [0, BASE_EXIT_SPREAD, 0.005, 0.0075]
export const SENSITIVITY_GROWTH = [-0.01, 0, 0.01]

/** Levered IRR across exit cap rates (columns) and rent growth (rows), the grid every IC memo has. */
export function sensitivity(asset: Asset, macro: Macro, q: number, input: UwInput): Array<Array<number | null>> {
  return SENSITIVITY_GROWTH.map((g) =>
    SENSITIVITY_CAPS.map((c) => underwrite(asset, macro, q, { ...input, exitCapDelta: c, growthDelta: g }).irr),
  )
}

/**
 * The most someone could pay and still earn `target`: how rival bidders
 * set their price. IRR falls as price rises, so a bisection finds it.
 */
export function priceForIrr(asset: Asset, macro: Macro, q: number, plan: PlanKind, target: number, around: number): number {
  let lo = around * 0.5
  let hi = around * 1.6
  for (let i = 0; i < 11; i++) {
    const mid = (lo + hi) / 2
    const r = underwrite(asset, macro, q, { price: mid, plan, ltv: 0.6, loan: plan === 'hold' ? 'fixed' : 'bridge', years: 5 }).irr ?? -1
    if (r > target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** The broker's pro forma: a little more rent growth and a tighter exit. Every offering memorandum has one. */
export function brokerCase(asset: Asset, macro: Macro, q: number, price: number, plan: PlanKind): number | null {
  return underwrite(asset, macro, q, { price, plan, ltv: 0.65, loan: 'bridge', years: 5, growthDelta: 0.015, exitCapDelta: -0.0025 }).irr
}
