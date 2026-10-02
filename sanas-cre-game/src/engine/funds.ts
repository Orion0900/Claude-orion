/*
 * Funds: capital calls, the management fee, the distribution waterfall and
 * the numbers LPs judge you by (net IRR, TVPI, DPI). Then the next raise,
 * which those numbers decide.
 */
import { equityValue } from './asset'
import { DIFFICULTIES, LP_NAMES, STRATEGIES } from './data'
import { accrue, clamp, irr, waterfall } from './finance'
import type { Rng } from './rng'
import type { Fund, Fundraise, GameState, LpCommitment, NewsItem, Strategy } from './types'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

export function roman(n: number): string {
  return ROMAN[n - 1] ?? String(n)
}

export function fundName(firm: string, number: number): string {
  return `${firm} Fund ${roman(number)}`
}

export function makeFund(opts: {
  id: string
  number: number
  firm: string
  strategy: Strategy
  size: number
  feeRate: number
  carry: number
  pref: number
  q: number
  lps: LpCommitment[]
}): Fund {
  return {
    id: opts.id,
    number: opts.number,
    name: fundName(opts.firm, opts.number),
    strategy: opts.strategy,
    vintageQ: opts.q,
    size: opts.size,
    gpCommit: opts.size * 0.02,
    feeRate: opts.feeRate,
    carry: opts.carry,
    pref: opts.pref,
    investEndQ: opts.q + 12,
    termEndQ: opts.q + 28,
    extensions: 0,
    called: 0,
    distributed: 0,
    carryPaid: 0,
    hurdle: 0,
    feesPaid: 0,
    status: 'investing',
    cash: 0,
    creditLine: 0,
    accruedCarry: 0,
    flows: [0],
    lps: opts.lps,
    nav: 0,
    netIrr: null,
    tvpi: 1,
    dpi: 0,
    curve: [{ q: opts.q, net: 0, nav: 0 }],
  }
}

export function investingFund(s: GameState): Fund | undefined {
  return s.funds.find((f) => f.status === 'investing')
}

export function latestFund(s: GameState): Fund | undefined {
  return s.funds[s.funds.length - 1]
}

/** Capex still to spend on business plans already under way. */
export function reservedCapex(s: GameState, fund: Fund): number {
  return s.properties
    .filter((p) => p.fundId === fund.id && p.plan)
    .reduce((sum, p) => sum + Math.max(0, p.plan!.budget - p.plan!.spent), 0)
}

export function dryPowder(s: GameState, fund: Fund): number {
  return Math.max(0, fund.size - fund.called - reservedCapex(s, fund))
}

/** The most a fund's bank will lend it against its buildings. */
export function creditLimit(fund: Fund): number {
  return fund.size * 0.15
}

/** The equity a single deal may take: limited partnership agreements cap any one asset. */
export function singleAssetLimit(fund: Fund): number {
  return fund.size * 0.3
}

function addFlow(s: GameState, fund: Fund, amount: number) {
  const i = Math.max(0, s.q - fund.vintageQ)
  while (fund.flows.length <= i) fund.flows.push(0)
  fund.flows[i] += amount
}

/** Calls capital from the fund's investors; returns how much it could call. The GP pays its share. */
export function callCapital(s: GameState, fund: Fund, amount: number): number {
  const x = Math.min(Math.max(0, amount), Math.max(0, fund.size - fund.called))
  if (x <= 0) return 0
  fund.called += x
  fund.hurdle += x
  addFlow(s, fund, -x)
  const gp = (x * fund.gpCommit) / fund.size
  s.firm.cash -= gp
  s.firm.gpInvested += gp
  s.turn.calls += x
  s.turn.gpCalls += gp
  return x
}

/** Runs cash through the waterfall to investors and the GP. */
export function distribute(s: GameState, fund: Fund, amount: number) {
  if (amount <= 0) return
  const split = waterfall(amount, fund, fund.carry)
  fund.distributed += split.lp
  fund.carryPaid += split.gp
  fund.hurdle = Math.max(0, fund.hurdle - split.toHurdle)
  addFlow(s, fund, split.lp)
  const gpShare = (split.lp * fund.gpCommit) / fund.size
  s.firm.cash += gpShare
  s.firm.gpReturned += gpShare
  s.turn.gpIncome += gpShare
  const carry = split.gp * (1 - s.firm.stakeSold)
  if (carry > 0) {
    s.firm.cash += carry
    s.firm.carryReceived += carry
    s.turn.carry += carry
  }
  s.turn.distributions += split.lp
}

/**
 * Pays a building's cost from the fund: its cash first, then a capital
 * call, then, once the commitments are used up, its bank credit line.
 * Returns how much went on the credit line.
 */
export function fundPays(s: GameState, fund: Fund, amount: number): number {
  let need = Math.max(0, amount)
  const fromCash = Math.min(need, Math.max(0, fund.cash))
  fund.cash -= fromCash
  need -= fromCash
  if (need > 0) need -= callCapital(s, fund, need)
  if (need > 0) fund.creditLine += need
  return Math.max(0, need)
}

/** Cost basis of the buildings still held, which the fee is charged on after the investment period. */
export function investedCost(s: GameState, fund: Fund): number {
  return s.properties.filter((p) => p.fundId === fund.id).reduce((sum, p) => sum + p.equity, 0)
}

function chargeFee(s: GameState, fund: Fund) {
  const base = s.q < fund.investEndQ ? fund.size : investedCost(s, fund)
  const fee = (base * fund.feeRate) / 4
  if (fee <= 0) return
  let paid = Math.min(fee, Math.max(0, fund.cash))
  fund.cash -= paid
  if (paid < fee) paid += callCapital(s, fund, fee - paid)
  fund.feesPaid += paid
  const net = paid * (1 - s.firm.stakeSold)
  s.firm.cash += net
  s.firm.feesReceived += net
  s.turn.fees += net
}

export function updateMetrics(s: GameState, fund: Fund) {
  const held = s.properties.filter((p) => p.fundId === fund.id)
  const equity = held.reduce((sum, p) => sum + equityValue(p, s.macro, s.q), 0)
  const gross = Math.max(0, equity + fund.cash - fund.creditLine)
  const split = waterfall(gross, fund, fund.carry)
  fund.nav = split.lp
  fund.accruedCarry = split.gp
  fund.tvpi = fund.called > 0 ? (fund.distributed + split.lp) / fund.called : 1
  fund.dpi = fund.called > 0 ? fund.distributed / fund.called : 0
  const flows = [...fund.flows]
  const i = Math.max(0, s.q - fund.vintageQ)
  while (flows.length <= i) flows.push(0)
  flows[i] += split.lp
  fund.netIrr = irr(flows)
}

/** The fund's quarter-end: accrue the pref, take the fee, repay the firm, distribute, mark. */
export function closeFundQuarter(s: GameState, fund: Fund, news: NewsItem[]) {
  if (fund.status === 'liquidated') return
  fund.hurdle = accrue(fund.hurdle, fund.pref)
  chargeFee(s, fund)
  if (fund.creditLine > 0) {
    fund.creditLine *= 1 + (s.macro.policyRate + 0.025) / 4
    const repay = Math.min(fund.creditLine, Math.max(0, fund.cash))
    fund.creditLine -= repay
    fund.cash -= repay
  }
  if (fund.cash > 1000) {
    distribute(s, fund, fund.cash)
    fund.cash = 0
  }
  const held = s.properties.some((p) => p.fundId === fund.id)
  if (fund.status === 'investing' && s.q + 1 >= fund.investEndQ) {
    fund.status = 'harvesting'
    news.push({ q: s.q, text: `${fund.name}'s investment period is over. From here it only manages and sells.`, tone: 'neutral', tag: 'firm' })
  }
  updateMetrics(s, fund)
  // The J-curve, one point per quarter-end: net cash to investors so far, and what's left.
  fund.curve.push({ q: s.q + 1, net: fund.distributed - fund.called, nav: fund.nav })
  if (fund.status === 'harvesting' && !held && s.q + 1 >= fund.investEndQ) {
    fund.status = 'liquidated'
    const net = fund.netIrr === null ? 'n/a' : `${(fund.netIrr * 100).toFixed(1)}%`
    news.push({ q: s.q, text: `${fund.name} is fully realized: ${fund.tvpi.toFixed(2)}x net multiple, ${net} net IRR.`, tone: fund.tvpi >= 1.3 ? 'good' : fund.tvpi >= 1 ? 'neutral' : 'bad', tag: 'firm' })
  }
}

// ---------------------------------------------------------------------------
// Fundraising

export interface TrackRecord {
  score: number
  label: string
  detail: string
}

/** How LPs read your record: net returns against the strategy's target, with credit for money actually returned. */
export function trackRecord(s: GameState): TrackRecord {
  const judged = s.funds.filter((f) => s.q - f.vintageQ >= 8 && f.called > 0)
  if (!judged.length) {
    const deals = s.properties.length + s.sold.length
    return { score: deals >= 3 ? 0.9 : 0.8, label: 'Unproven', detail: 'Too early for LPs to judge your returns. They\'re backing you, not the numbers.' }
  }
  let total = 0
  let weights = 0
  judged.forEach((f, i) => {
    const weight = i === judged.length - 1 ? 0.6 : 0.4 / Math.max(1, judged.length - 1)
    const years = Math.max(1, (s.q - f.vintageQ) / 4)
    const perf = f.netIrr ?? (f.tvpi - 1) / years
    const excess = perf - STRATEGIES[f.strategy].target
    const realized = f.dpi >= 1 ? 0.15 : f.dpi >= 0.4 ? 0.07 : 0
    total += weight * (clamp(1 + 2.5 * excess, 0.4, 1.5) + realized)
    weights += weight
  })
  const score = total / weights
  const label = score >= 1.25 ? 'Top quartile' : score >= 1.05 ? 'Strong' : score >= 0.85 ? 'Middling' : score >= 0.6 ? 'Weak' : 'Poor'
  const best = judged[judged.length - 1]
  const irrText = best.netIrr === null ? 'no IRR yet' : `${(best.netIrr * 100).toFixed(1)}% net IRR`
  return { score, label, detail: `${best.name}: ${irrText}, ${best.tvpi.toFixed(2)}x TVPI, ${best.dpi.toFixed(2)}x DPI.` }
}

export interface RaiseTerms {
  strategy: Strategy
  target: number
  feeRate: number
  carry: number
  placementAgent: boolean
}

export function previousSize(s: GameState): number {
  return latestFund(s)?.size ?? DIFFICULTIES[s.difficulty].fund
}

/** Demand as a share of the target: 1 means fully subscribed. */
export function raiseDemand(s: GameState, terms: RaiseTerms): number {
  const track = trackRecord(s).score
  const rep = 0.55 + (s.firm.reputation / 100) * 0.9
  const ir = 1 + 0.08 * Math.min(6, s.firm.staff.investorRelations)
  const strat = STRATEGIES[terms.strategy]
  const fees = (1 + (strat.fee - terms.feeRate) * 30) * (1 + (strat.carry - terms.carry) * 1.5)
  const step = terms.target / previousSize(s)
  const stepF = step <= 1.5 ? 1 : Math.pow(1.5 / step, 1.2)
  const current = investingFund(s)
  const deployed = current ? (current.called + reservedCapex(s, current)) / current.size : 1
  const deployF = deployed >= 0.5 ? 1 : 0.6 + 0.8 * deployed
  return Math.max(0, track * rep * ir * fees * stepF * s.macro.lpAppetite * (terms.placementAgent ? 1.2 : 1) * deployF)
}

export function demandLabel(d: number): string {
  return d >= 1.15 ? 'Oversubscribed' : d >= 0.95 ? 'Strong' : d >= 0.75 ? 'Solid' : d >= 0.5 ? 'Mixed' : 'Soft'
}

export function canLaunch(s: GameState): { ok: boolean; reason?: string } {
  if (s.firm.fundraise) return { ok: false, reason: `You're already raising Fund ${roman(s.firm.fundraise.number)}.` }
  if (s.q >= s.quarters - 3) return { ok: false, reason: 'Too close to retirement to raise another fund.' }
  const current = investingFund(s)
  if (current && s.q < current.investEndQ - 4) {
    const committed = (current.called + reservedCapex(s, current)) / current.size
    if (committed < 0.7) {
      return { ok: false, reason: `${current.name} is ${Math.round(committed * 100)}% committed. LPs expect about 70% before you raise the next fund.` }
    }
    if (s.q - current.vintageQ < 8) {
      return { ok: false, reason: `${current.name} closed ${s.q - current.vintageQ} quarters ago. LPs won't look at a new fund until it's two years old.` }
    }
  }
  return { ok: true }
}

const QUARTER_SHARE = [0.45, 0.35, 0.2]

/** One quarter on the road. Returns true when the raise reaches its final close. */
export function tickRaise(s: GameState, rng: Rng, news: NewsItem[]): boolean {
  const raise = s.firm.fundraise
  if (!raise) return false
  const share = QUARTER_SHARE[raise.elapsed] ?? 0
  const hardCap = raise.target * 1.25
  let amount = raise.target * raise.demand * share * rng.range(0.85, 1.15)
  amount = Math.min(amount, hardCap - raise.committed)
  const fresh = commitments(rng, amount, raise.target)
  raise.lps.push(...fresh)
  raise.committed += fresh.reduce((sum, l) => sum + l.amount, 0)
  raise.elapsed += 1
  if (fresh.length) {
    const lead = [...fresh].sort((a, b) => b.amount - a.amount)[0]
    news.push({
      q: s.q,
      text: `Fund ${roman(raise.number)}: ${fresh.length} new commitment${fresh.length > 1 ? 's' : ''}, led by ${lead.name}. ${money(raise.committed)} of ${money(raise.target)} raised.`,
      tone: 'good',
      tag: 'firm',
    })
  } else {
    news.push({ q: s.q, text: `Fund ${roman(raise.number)}: a quiet quarter on the road. No new commitments.`, tone: 'bad', tag: 'firm' })
  }
  return raise.elapsed >= raise.quarters || raise.committed >= hardCap - 1
}

function commitments(rng: Rng, amount: number, target: number): LpCommitment[] {
  const out: LpCommitment[] = []
  let left = amount
  const groups = Object.values(LP_NAMES)
  while (left > target * 0.01) {
    const ticket = Math.min(left, target * rng.range(0.04, 0.14))
    const name = rng.pick(rng.pick(groups))
    const amountRounded = Math.max(1e6, Math.round(ticket / 1e6) * 1e6)
    out.push({ name, amount: Math.min(amountRounded, Math.max(left, 1e6)) })
    left -= amountRounded
  }
  return out
}

/** Short money for news copy. */
export function money(x: number): string {
  const a = Math.abs(x)
  const sign = x < 0 ? '-' : ''
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}K`
  return `${sign}$${Math.round(a)}`
}

export function newRaise(s: GameState, terms: RaiseTerms): Fundraise {
  const strat = STRATEGIES[terms.strategy]
  return {
    number: (latestFund(s)?.number ?? 0) + 1,
    strategy: terms.strategy,
    target: terms.target,
    feeRate: terms.feeRate,
    carry: terms.carry,
    pref: strat.pref,
    startQ: s.q,
    quarters: 3,
    elapsed: 0,
    committed: 0,
    demand: raiseDemand(s, terms),
    placementAgent: terms.placementAgent,
    lps: [],
  }
}
