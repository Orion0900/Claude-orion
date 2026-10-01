/*
 * How a building earns and what it's worth. Rents reprice as leases roll,
 * occupancy drifts toward what the market will lease, renovations raise the
 * quality a building can charge for, and an appraiser capitalizes the result.
 */
import { MARKETS, TYPES } from './data'
import { clamp } from './finance'
import { capAnchor, comboKey, localStories } from './macro'
import type { Rng } from './rng'
import type { Asset, Loan, LoanKind, Macro, Phase, Plan, PlanKind, Tone } from './types'

/** Rent multiplier for quality: average (60) is 1, a top building gets about 17% more. */
export function qualityRent(quality: number): number {
  return 1 + (0.42 * (quality - 60)) / 100
}

export function qualityClass(quality: number): 'A' | 'B' | 'C' {
  return quality >= 75 ? 'A' : quality >= 45 ? 'B' : 'C'
}

/** What a vacant unit in this building would lease for today, per unit per year. */
export function marketRent(asset: Asset, macro: Macro): number {
  return TYPES[asset.type].rent * MARKETS[asset.market].rent * macro.rents[comboKey(asset.type, asset.market)] * qualityRent(asset.quality)
}

/** The occupancy this building can hold in today's market. */
export function occupancyTarget(asset: Asset, macro: Macro): number {
  const local = localStories(macro, asset.type, asset.market).reduce((sum, s) => sum + s.occ, 0)
  return clamp(macro.sectors[asset.type].occ + local + (TYPES[asset.type].qualityOcc * (asset.quality - 60)) / 100, 0.25, 0.985)
}

export function capRate(asset: Asset, macro: Macro): number {
  const spec = TYPES[asset.type]
  const local = localStories(macro, asset.type, asset.market).reduce((sum, s) => sum + s.spread, 0)
  const risk = macro.sentiment * (0.5 + 0.5 * spec.beta)
  // Tenants and lenders care about quality most in offices: the flight to quality.
  const quality = ((60 - asset.quality) / 100) * (asset.type === 'office' ? 0.025 : 0.01)
  return Math.max(0.035, capAnchor(macro) + macro.sectors[asset.type].capSpread + MARKETS[asset.market].cap + local + risk + quality)
}

/** Annual operating expenses at a given annual revenue. */
export function opex(asset: Asset, macro: Macro, revenue: number): number {
  const spec = TYPES[asset.type]
  return asset.size * spec.opexFixed * macro.costIndex * asset.opexAdj + revenue * spec.opexVar
}

/** Annual net operating income at a given occupancy and rent. */
export function noiAt(asset: Asset, macro: Macro, occ = asset.occupancy, rent = asset.inPlaceRent): number {
  const revenue = asset.size * occ * rent
  return revenue - opex(asset, macro, revenue)
}

export interface Appraisal {
  value: number
  cap: number
  noi: number
  stabNoi: number
  marketRent: number
  occTarget: number
}

/** How much of the climb to stabilized income buyers pay for: more where buildings lease up fast. */
export function upsideCredit(asset: Asset): number {
  return 0.35 + 0.5 * Math.sqrt(TYPES[asset.type].leaseSpeed)
}

/**
 * As-is value. Buyers capitalize the income in place plus part of the
 * upside to a stabilized building (more of it where buildings lease up
 * quickly, and more of the downside when the rent roll is above market),
 * net of the cost of leasing the vacancy.
 */
export function appraise(asset: Asset, macro: Macro, capDelta = 0, offline = 0): Appraisal {
  const spec = TYPES[asset.type]
  const mr = marketRent(asset, macro)
  const occT = occupancyTarget(asset, macro)
  // Space taken offline for a renovation is valued as if it were leased, less a haircut: buyers know it comes back.
  const leasable = offline > 0 ? Math.min(occT, asset.occupancy + offline) : asset.occupancy
  const noi = offline > 0 ? noiAt(asset, macro, leasable) * 0.95 : noiAt(asset, macro)
  const stabNoi = noiAt(asset, macro, occT, mr)
  const cap = Math.max(0.03, capRate(asset, macro) + capDelta)
  const credit = stabNoi > noi ? upsideCredit(asset) : 0.65
  let value = (noi + credit * (stabNoi - noi)) / cap
  value -= Math.max(0, occT - leasable) * asset.size * mr * spec.leasingCost * 0.6
  const land = asset.size * spec.rent * MARKETS[asset.market].rent * 0.6 * macro.costIndex
  value = Math.max(value, land + (0.2 * Math.max(0, stabNoi)) / cap) * asset.premium
  return { value, cap, noi, stabNoi, marketRent: mr, occTarget: occT }
}

/** A building you own, valued with any renovation in progress taken into account. */
export function appraiseHeld(p: Asset & { plan: Plan | null }, macro: Macro): Appraisal {
  return appraise(p, macro, 0, p.plan ? p.plan.drag : 0)
}

/** The quality a building could ever reach without a full repositioning. */
export function vintageCap(yearBuilt: number): number {
  return yearBuilt < 1980 ? 70 : yearBuilt < 2000 ? 82 : yearBuilt < 2015 ? 92 : 100
}

/** Construction costs run higher where rents do. */
function costFactor(asset: Asset, macro: Macro): number {
  return Math.sqrt(MARKETS[asset.market].rent) * macro.costIndex
}

export interface PlanSpec {
  kind: Exclude<PlanKind, 'hold'>
  budget: number
  quarters: number
  qualityGain: number
  drag: number
  /** For a repositioning: the new ceiling on quality. */
  maxQuality: number
}

export function planSpec(asset: Asset, macro: Macro, kind: PlanKind): PlanSpec | null {
  if (kind === 'hold') return null
  const spec = TYPES[asset.type]
  if (kind === 'valueadd') {
    const gain = Math.min(22, asset.maxQuality - asset.quality)
    if (gain < 6) return null
    return {
      kind, quarters: 6, qualityGain: gain, drag: spec.drag, maxQuality: asset.maxQuality,
      budget: gain * spec.renoCost * asset.size * costFactor(asset, macro),
    }
  }
  // A repositioning lifts the ceiling once: an old building never becomes a new one.
  const ceiling = Math.min(100, vintageCap(asset.yearBuilt) + 15)
  const gain = Math.min(45, ceiling - asset.quality)
  if (gain < 15) return null
  return {
    kind, quarters: 10, qualityGain: gain, drag: Math.min(0.35, spec.drag * 3 + 0.05), maxQuality: ceiling,
    budget: gain * spec.renoCost * 1.3 * asset.size * costFactor(asset, macro),
  }
}

export function startPlanOn(asset: Asset & { plan: Plan | null }, spec: PlanSpec) {
  asset.maxQuality = spec.maxQuality
  asset.plan = { kind: spec.kind, budget: spec.budget, spent: 0, quarters: spec.quarters, elapsed: 0, qualityGain: spec.qualityGain, drag: spec.drag }
}

/** Leasing gets easier in good times. */
function leasingClimate(phase: Phase): number {
  return phase === 'recession' ? 0.6 : phase === 'recovery' ? 0.85 : phase === 'expansion' ? 1.1 : 1
}

export interface QuarterOps {
  revenue: number
  opex: number
  noi: number
  capex: number
  leasing: number
  debtService: number
  cashFlow: number
  planDone: boolean
  notes: Array<{ text: string; tone: Tone }>
}

/**
 * One quarter of operations. With an Rng it is the real thing, tenant
 * defaults and cost overruns included; without one it is the expected case
 * an underwriting model would draw. `skill` is the asset management team's
 * effectiveness, around 1.
 */
export function operate(
  asset: Asset & { plan: Plan | null; loan: Loan | null },
  macro: Macro,
  rng: Rng | null,
  skill = 1,
): QuarterOps {
  const spec = TYPES[asset.type]
  const notes: QuarterOps['notes'] = []
  const mr = marketRent(asset, macro)
  let target = occupancyTarget(asset, macro)
  let capex = 0
  let planDone = false

  if (asset.plan) {
    const plan = asset.plan
    const share = 1 / plan.quarters
    const overrun = rng ? Math.max(0.9, rng.normal(1.04 - 0.08 * (skill - 1), 0.07)) : 1
    const spend = plan.budget * share * overrun
    capex += spend
    plan.spent += spend
    plan.elapsed += 1
    asset.quality = Math.min(asset.maxQuality, asset.quality + plan.qualityGain * share)
    target = Math.max(0.2, target - plan.drag)
    if (plan.elapsed >= plan.quarters) planDone = true
  } else {
    asset.quality = Math.max(5, asset.quality - 0.45)
  }

  const before = asset.occupancy
  asset.inPlaceRent += (mr - asset.inPlaceRent) * spec.rollover
  const speed = clamp(spec.leaseSpeed * skill * leasingClimate(macro.phase), 0.02, 0.95)
  const gap = target - before
  let occ = before + gap * (gap > 0 ? speed : Math.min(1, speed * 1.6))
  if (rng) {
    occ += rng.normal(0, 0.006)
    const stress = macro.phase === 'recession' ? 3 : macro.phase === 'late' ? 1.3 : 1
    if (asset.concentration > 0.05 && rng.chance(0.014 * stress * (0.4 + asset.concentration))) {
      const hit = Math.min(occ - 0.02, asset.concentration * rng.range(0.25, 0.7))
      if (hit > 0.01) {
        occ -= hit
        notes.push({ text: `A tenant defaulted at ${asset.name}, taking ${Math.round(hit * 100)}% of the building with it.`, tone: 'bad' })
      }
    }
  }
  occ = clamp(occ, 0.02, 0.99)
  const leased = Math.max(0, occ - before)
  if (leased > 0) asset.inPlaceRent = (asset.inPlaceRent * before + mr * leased) / occ
  asset.occupancy = occ

  const leasing = leased * asset.size * mr * spec.leasingCost + before * spec.rollover * asset.size * mr * spec.leasingCost * 0.3
  const revenue = (asset.size * occ * asset.inPlaceRent) / 4
  const efficiency = 1.06 - 0.06 * skill
  const opexQ = (opex(asset, macro, revenue * 4) / 4) * efficiency
  const noi = revenue - opexQ
  const reserve = revenue * (asset.type === 'hotel' ? 0.04 : 0.015)
  capex += reserve
  const debtService = asset.loan ? (asset.loan.balance * asset.loan.rate) / 4 : 0
  return {
    revenue,
    opex: opexQ,
    noi,
    capex,
    leasing,
    debtService,
    cashFlow: noi - debtService - leasing - capex,
    planDone,
    notes,
  }
}

// ---------------------------------------------------------------------------
// Debt

export function loanTerms(macro: Macro, kind: LoanKind, asset: Pick<Asset, 'type'>): { rate: number; spread: number } {
  const adj = TYPES[asset.type].debtAdj
  if (kind === 'fixed') {
    const spread = macro.creditSpread + adj
    return { rate: macro.tenYear + spread, spread }
  }
  const spread = macro.creditSpread + 0.009 + adj
  return { rate: macro.policyRate + spread, spread }
}

export function ltvLimit(macro: Macro, kind: LoanKind): number {
  return kind === 'fixed' ? macro.maxLtv - 0.05 : Math.min(0.75, macro.maxLtv + 0.03)
}

export interface Sizing {
  max: number
  limitedBy: 'ltv' | 'dscr' | 'debt yield'
  rate: number
  spread: number
  ltvMax: number
}

/**
 * The biggest loan a lender would write: fixed-rate lenders need the income
 * in place to cover interest 1.25 times; bridge lenders lend against the
 * stabilized income, at a 7.5% debt yield.
 */
export function sizeLoan(asset: Asset, macro: Macro, kind: LoanKind, value: number): Sizing {
  const { rate, spread } = loanTerms(macro, kind, asset)
  const ltvMax = ltvLimit(macro, kind)
  const byLtv = ltvMax * value
  if (kind === 'fixed') {
    const noi = noiAt(asset, macro)
    const byDscr = noi > 0 ? noi / (1.25 * rate) : 0
    return byDscr < byLtv ? { max: Math.max(0, byDscr), limitedBy: 'dscr', rate, spread, ltvMax } : { max: byLtv, limitedBy: 'ltv', rate, spread, ltvMax }
  }
  const stab = noiAt(asset, macro, occupancyTarget(asset, macro), marketRent(asset, macro))
  const byYield = stab > 0 ? stab / 0.075 : 0
  return byYield < byLtv ? { max: Math.max(0, byYield), limitedBy: 'debt yield', rate, spread, ltvMax } : { max: byLtv, limitedBy: 'ltv', rate, spread, ltvMax }
}

export function newLoan(macro: Macro, kind: LoanKind, asset: Asset, amount: number, q: number): Loan {
  const { rate, spread } = loanTerms(macro, kind, asset)
  return {
    kind, balance: amount, rate, spread, startQ: q,
    maturityQ: q + (kind === 'fixed' ? 28 : 12),
    extensionsLeft: kind === 'bridge' ? 2 : 0,
  }
}

/**
 * What it costs to repay early. Fixed-rate loans carry yield maintenance
 * (at least 1%, more when rates have fallen since the loan was written);
 * bridge loans charge a small exit fee.
 */
export function prepayCost(loan: Loan, macro: Macro, q: number): number {
  if (q >= loan.maturityQ) return 0
  if (loan.kind === 'bridge') return loan.balance * 0.005
  const years = (loan.maturityQ - q) / 4
  const today = macro.tenYear + loan.spread
  return loan.balance * Math.max(0.01, (loan.rate - today) * years * 0.9)
}

/** Equity left in a building if it sold today, after costs and the loan. Never below zero: the debt is non-recourse. */
export function equityValue(asset: { value: number; loan: Loan | null }, macro: Macro, q: number): number {
  const debt = asset.loan ? asset.loan.balance + prepayCost(asset.loan, macro, q) : 0
  return Math.max(0, asset.value * 0.985 - debt)
}
