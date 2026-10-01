/*
 * The game loop and every action a player can take. Each function takes a
 * state and returns a new one; nothing here touches the screen.
 */
import { appraise, appraiseHeld, equityValue, newLoan, noiAt, occupancyTarget, operate, planSpec, sizeLoan, startPlanOn } from './asset'
import { DEPTS, DEPT_ORDER, DIFFICULTIES, PHASES, RIVALS, SEED_LPS, STRATEGIES, TYPES } from './data'
import { bidEdge, dealsPerQuarter, detectionOdds, makeDeal } from './deals'
import { rollEvents } from './events'
import { clamp, sum } from './finance'
import {
  callCapital, canLaunch, closeFundQuarter, creditLimit, dryPowder, investingFund, latestFund, makeFund, money, newRaise,
  roman, singleAssetLimit, tickRaise, updateMetrics, type RaiseTerms,
} from './funds'
import { tickMacro, newMacro } from './macro'
import {
  bestOffer, dealReturns, foreclose, fundOf, logOn, note, propertyCash, refiQuote, refinance, sellProperty,
} from './portfolio'
import { Rng } from './rng'
import type {
  ActionResult, Deal, Dept, Difficulty, Effect, Fund, GameEvent, GameState, HiddenIssue, HistoryPoint,
  LoanKind, NewsItem, PlanKind, Property, QuarterReport, Strategy, Tone, TurnLedger,
} from './types'

export const START_YEAR = 2027

export function quarterLabel(q: number): string {
  return `Q${(q % 4) + 1} ${START_YEAR + Math.floor(q / 4)}`
}

function emptyTurn(cash: number): TurnLedger {
  return { cashStart: cash, calls: 0, distributions: 0, fees: 0, carry: 0, gpIncome: 0, gpCalls: 0, dealCosts: 0, other: 0, notes: [] }
}

function nextId(s: GameState, prefix: string): string {
  return `${prefix}${s.nextId++}`
}

function fail(state: GameState, message: string): ActionResult {
  return { state, message, tone: 'bad' }
}

export interface NewGameOptions {
  firmName: string
  founder: string
  difficulty: Difficulty
  years: number
  strategy: Strategy
  seed?: number
}

export function newGame(o: NewGameOptions): GameState {
  const seed = (o.seed ?? Math.floor(Math.random() * 4294967295)) >>> 0
  const rng = new Rng(seed)
  const diff = DIFFICULTIES[o.difficulty]
  const strat = STRATEGIES[o.strategy]
  const firmName = o.firmName.trim() || 'Sana Capital Partners'
  const s: GameState = {
    version: 1,
    seed,
    rng: 0,
    q: 0,
    quarters: o.years * 4,
    difficulty: o.difficulty,
    firm: {
      name: firmName,
      founder: o.founder.trim() || 'Sana',
      cash: diff.cash,
      reputation: diff.rep,
      staff: { ...diff.staff },
      stakeSold: 0,
      carryReceived: 0,
      feesReceived: 0,
      fre: [],
      lastPnl: { fees: 0, carry: 0, gpIncome: 0, gpCalls: 0, salaries: 0, overhead: 0, dealCosts: 0, other: 0 },
      brokeQuarters: 0,
      fundraise: null,
      gpInvested: 0,
      gpReturned: 0,
    },
    macro: newMacro(rng),
    properties: [],
    sold: [],
    tombstones: [],
    funds: [],
    deals: [],
    events: [],
    news: [],
    rivals: RIVALS.map((r) => ({ ...r, focus: [...r.focus] })),
    reports: [],
    history: [],
    achievements: [],
    stats: { bids: 0, wins: 0, losses: 0, closings: 0, sales: 0, foreclosures: 0, refis: 0, recessionBuys: 0, cashOutRefis: 0, cleanCycles: 0, recessionMark: -1, peakAum: 0 },
    status: 'playing',
    endReason: null,
    nextId: 1,
    turn: emptyTurn(diff.cash),
  }
  const lps = SEED_LPS.map((name, i) => ({ name, amount: Math.round((diff.fund * [0.4, 0.25, 0.2, 0.15][i]) / 1e6) * 1e6 }))
  s.funds.push(makeFund({ id: nextId(s, 'f'), number: 1, firm: firmName, strategy: o.strategy, size: diff.fund, feeRate: strat.fee, carry: strat.carry, pref: strat.pref, q: 0, lps }))
  refillDeals(s, rng, 4)
  s.news = [
    { q: 0, text: `${firmName} opens its doors with a ${money(diff.fund)} first fund. The brokers are already calling.`, tone: 'good', tag: 'firm' },
    ...s.macro.storylines.map((st) => ({ q: 0, text: `${st.title}.`, tone: (st.growth >= 0 ? 'good' : 'bad') as Tone, tag: 'sector' as const })),
  ]
  s.history.push(snapshot(s))
  s.rng = rng.state
  return s
}

// ---------------------------------------------------------------------------
// Readings the screens and the loop share

export function amSkill(s: GameState): number {
  const n = s.properties.length
  const coverage = n ? (4 * s.firm.staff.assetMgmt + 2) / n : 2
  return clamp(0.7 + 0.35 * coverage, 0.7, 1.15)
}

export function headcount(s: GameState): number {
  return DEPT_ORDER.reduce((sum, d) => sum + s.firm.staff[d], 0)
}

export function salaries(s: GameState): number {
  return DEPT_ORDER.reduce((sum, d) => sum + s.firm.staff[d] * DEPTS[d].salary, 0)
}

/** Office, systems, audit and fund administration, a year. */
export function overhead(s: GameState): number {
  return 200000 + 55000 * headcount(s) + aum(s) * 0.0004
}

/** Gross real estate value plus capital committed but not yet invested. */
export function aum(s: GameState): number {
  const buildings = sum(s.properties.map((p) => p.value))
  const uncalled = sum(s.funds.filter((f) => f.status === 'investing').map((f) => Math.max(0, f.size - f.called)))
  return buildings + uncalled
}

function snapshot(s: GameState): HistoryPoint {
  return {
    q: s.q,
    aum: aum(s),
    nav: sum(s.funds.map((f) => f.nav)),
    cash: s.firm.cash,
    tenYear: s.macro.tenYear,
    policyRate: s.macro.policyRate,
    reputation: s.firm.reputation,
  }
}

export interface Pending {
  kind: 'event' | 'deal'
  id: string
  label: string
}

/** Decisions that have to be made before the quarter can end. */
export function pending(s: GameState): Pending[] {
  const out: Pending[] = s.events.map((e) => ({ kind: 'event' as const, id: e.id, label: e.title }))
  for (const d of s.deals) {
    if (d.status === 'contract') out.push({ kind: 'deal', id: d.id, label: `${d.asset.name} is under contract` })
    if (d.status === 'bestfinal') out.push({ kind: 'deal', id: d.id, label: `Best and final on ${d.asset.name}` })
  }
  return out
}

export interface Score {
  netWorth: number
  cash: number
  gpNav: number
  carry: number
  franchise: number
  title: string
  blurb: string
}

/** Net worth needed for each title in a 15-year career; shorter and longer careers scale it. */
const TITLES: Array<[number, string, string]> = [
  [5e9, 'Real Estate Legend', 'A household name in every allocator\'s office. Your tombstones fill a wall.'],
  [1.5e9, 'Industry Titan', 'One of the platforms everyone benchmarks against.'],
  [400e6, 'Institutional Manager', 'A real franchise with repeat LPs and a deep bench.'],
  [100e6, 'Boutique Sponsor', 'A respected shop with a loyal following.'],
  [20e6, 'Emerging Manager', 'You built something. The next career is the bigger one.'],
  [-Infinity, 'Back to the Brokerage', 'Not much to show for it yet. The brokers will take you back.'],
]

/** A firm compounds, so each extra five years roughly quadruples what a good career builds. */
export function titleBar(index: number, years: number): number {
  const f = Math.pow(4, (years - 15) / 5)
  return TITLES[index][0] * (index <= 2 ? f : Math.sqrt(f))
}

/**
 * What the founder walks away with: the firm's cash, the GP's own stake in
 * its funds, carry earned but not yet paid, and the management company,
 * valued at eight times fee-related earnings.
 */
export function score(s: GameState): Score {
  const keep = 1 - s.firm.stakeSold
  const gpNav = sum(s.funds.map((f) => (f.nav * f.gpCommit) / Math.max(1, f.size)))
  const carry = sum(s.funds.map((f) => f.accruedCarry)) * keep
  const fre = sum(s.firm.fre.slice(-4)) * (4 / Math.max(1, Math.min(4, s.firm.fre.length)))
  const franchise = s.endReason === 'bankrupt' ? 0 : Math.max(0, fre) * 8
  const netWorth = s.firm.cash + gpNav + carry + franchise
  const years = s.quarters / 4
  const [, title, blurb] = TITLES.find((_, i) => netWorth >= titleBar(i, years)) ?? TITLES[TITLES.length - 1]
  if (s.endReason === 'bankrupt') {
    return { netWorth, cash: s.firm.cash, gpNav, carry, franchise, title: 'Back to the Brokerage', blurb: 'The firm ran out of money. Brokers are always hiring.' }
  }
  return { netWorth, cash: s.firm.cash, gpNav, carry, franchise, title, blurb }
}

export interface Achievement {
  id: string
  title: string
  desc: string
  check: (s: GameState) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-close', title: 'First Close', desc: 'Close your first acquisition.', check: (s) => s.tombstones.length >= 1 },
  { id: 'shelf', title: 'Lucite Shelf', desc: 'Close ten acquisitions.', check: (s) => s.tombstones.length >= 10 },
  { id: 'two-bagger', title: 'Two-Bagger', desc: 'Sell a building for twice your equity.', check: (s) => s.sold.some((x) => !x.foreclosed && x.multiple >= 2) },
  { id: 'home-run', title: 'Home Run', desc: 'Realize a 30% IRR on a deal.', check: (s) => s.sold.some((x) => !x.foreclosed && (x.irr ?? 0) >= 0.3) },
  { id: 'bottom-fisher', title: 'Bottom Fisher', desc: 'Buy a building in a recession.', check: (s) => s.stats.recessionBuys >= 1 },
  { id: 'carry', title: 'Carry On', desc: 'Earn your first carried interest.', check: (s) => s.firm.carryReceived > 0 },
  { id: 'fund-ii', title: 'Sophomore Fund', desc: 'Close Fund II.', check: (s) => s.funds.length >= 2 },
  { id: 'billion', title: 'Billion-Dollar Fund', desc: 'Close a fund of $1 billion or more.', check: (s) => s.funds.some((f) => f.size >= 1e9) },
  { id: 'ten-billion', title: 'Ten Billion', desc: 'Reach $10 billion under management.', check: (s) => aum(s) >= 10e9 },
  { id: 'diversified', title: 'Diversified', desc: 'Own five property types at once.', check: (s) => new Set(s.properties.map((p) => p.type)).size >= 5 },
  { id: 'cash-out', title: 'Return of Capital', desc: 'Pull cash out with a refinancing.', check: (s) => s.stats.cashOutRefis >= 1 },
  { id: 'clean-cycle', title: 'Through the Storm', desc: 'Come out of a recession without a foreclosure.', check: (s) => s.stats.cleanCycles >= 1 },
  { id: 'top-quartile', title: 'Top Quartile', desc: 'Fully realize a fund at a 15% net IRR or better.', check: (s) => s.funds.some((f) => f.status === 'liquidated' && (f.netIrr ?? 0) >= 0.15) },
  { id: 'league', title: 'League Leader', desc: 'Pass every rival in assets under management.', check: (s) => s.rivals.every((r) => r.aum < aum(s)) },
  { id: 'jingle-mail', title: 'Jingle Mail', desc: 'Hand the keys back to a lender. It happens to everyone.', check: (s) => s.stats.foreclosures >= 1 },
]

/** Unlocks anything newly earned; returns the titles for a toast. */
function award(s: GameState): string[] {
  const fresh: string[] = []
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.includes(a.id) && a.check(s)) {
      s.achievements.push(a.id)
      fresh.push(a.title)
    }
  }
  for (const t of fresh) note(s, `Achievement unlocked: ${t}.`, 'good')
  return fresh
}

function withAwards(result: ActionResult): ActionResult {
  const fresh = award(result.state)
  if (!fresh.length) return result
  const extra = `Achievement: ${fresh.join(', ')}.`
  return { ...result, message: result.message ? `${result.message} ${extra}` : extra }
}

// ---------------------------------------------------------------------------
// Deals

function refillDeals(s: GameState, rng: Rng, count: number) {
  const fund = investingFund(s) ?? latestFund(s)
  const ctx = {
    macro: s.macro,
    q: s.q,
    scale: fund?.size ?? DIFFICULTIES[s.difficulty].fund,
    acquisitions: s.firm.staff.acquisitions,
    reputation: s.firm.reputation,
    rivalEdge: DIFFICULTIES[s.difficulty].rivalEdge,
    nextId: () => nextId(s, 'd'),
  }
  const open = s.deals.filter((d) => d.status === 'open').length
  for (let i = 0; i < Math.min(count, 9 - open); i++) s.deals.push(makeDeal(rng, ctx))
}

export interface EquityCheck {
  price: number
  closing: number
  loan: number
  maxLoan: number
  limitedBy: string
  rate: number
  knownCosts: number
  equity: number
  planBudget: number
  total: number
  gpShare: number
}

/** The money a bid needs from the fund, the plan reserve included. */
export function equityCheck(s: GameState, deal: Deal, price: number, plan: PlanKind, ltv: number, loan: LoanKind): EquityCheck {
  const net = price - deal.credit
  const closing = net * 0.015 + (deal.ddDone ? deal.ddCost : 0)
  const sizing = sizeLoan(deal.asset, s.macro, loan, net)
  const loanAmount = Math.max(0, Math.min(ltv * net, sizing.max))
  const knownCosts = sum(deal.ddFound.map((i) => i.cost))
  const equity = net + closing + knownCosts - loanAmount
  const planBudget = planSpec(deal.asset, s.macro, plan)?.budget ?? 0
  const fund = investingFund(s)
  const total = equity + planBudget
  return {
    price: net, closing, loan: loanAmount, maxLoan: sizing.max, limitedBy: sizing.limitedBy, rate: sizing.rate,
    knownCosts, equity, planBudget, total, gpShare: fund ? (total * fund.gpCommit) / fund.size : 0,
  }
}

function capacityError(s: GameState, check: EquityCheck): string | null {
  const fund = investingFund(s)
  if (!fund) return 'No fund is investing right now. Raise your next fund to buy.'
  if (check.total > dryPowder(s, fund) + 1) return `${fund.name} has ${money(dryPowder(s, fund))} of dry powder; this deal needs ${money(check.total)} with the business plan.`
  if (check.total > singleAssetLimit(fund) + 1) return `That's more than 30% of ${fund.name} in one building, the most its LPs allow.`
  return null
}

function rivalFor(rng: Rng, deal: Deal): string {
  const keen = RIVALS.filter((r) => r.focus.includes(deal.asset.type))
  return rng.pick(keen.length ? keen : RIVALS).name
}

export interface BidTermsInput {
  price: number
  plan: PlanKind
  ltv: number
  loan: LoanKind
}

function resolveBid(s: GameState, deal: Deal, rng: Rng, price: number, final: boolean): ActionResult {
  const effective = price * (1 + bidEdge(s.firm.reputation, s.firm.staff.acquisitions))
  if (effective >= deal.clearing) {
    deal.status = 'contract'
    s.stats.wins += 1
    const extra = deal.asIs ? 'It sells as-is: no diligence period.' : 'Order diligence or close as-is.'
    return { state: s, message: `The seller accepted ${money(price)}. ${deal.asset.name} is under contract. ${extra}`, tone: 'good' }
  }
  if (!final && effective >= deal.clearing * 0.975) {
    deal.status = 'bestfinal'
    deal.clearing *= rng.range(1, 1.012)
    return { state: s, message: `Close, but not the top bid. The broker is calling for best and final offers on ${deal.asset.name}.`, tone: 'neutral' }
  }
  deal.status = 'lost'
  deal.lostTo = rivalFor(rng, deal)
  deal.lostAt = deal.clearing
  s.stats.losses += 1
  return { state: s, message: `Lost ${deal.asset.name} to ${deal.lostTo} at ${money(deal.clearing)}, ${Math.round((deal.clearing / deal.ask) * 100)}% of the asking price.`, tone: 'bad' }
}

export function placeBid(state: GameState, dealId: string, terms: BidTermsInput): ActionResult {
  const s = structuredClone(state)
  const deal = s.deals.find((d) => d.id === dealId)
  if (!deal || deal.status !== 'open') return fail(state, 'That deal is no longer available.')
  const check = equityCheck(s, deal, terms.price, terms.plan, terms.ltv, terms.loan)
  const error = capacityError(s, check)
  if (error) return fail(state, error)
  const rng = new Rng(s.rng)
  deal.bid = terms.price
  deal.terms = { ...terms }
  s.stats.bids += 1
  const result = resolveBid(s, deal, rng, terms.price, false)
  s.rng = rng.state
  return result
}

export function bestAndFinal(state: GameState, dealId: string, price: number): ActionResult {
  const s = structuredClone(state)
  const deal = s.deals.find((d) => d.id === dealId)
  if (!deal || deal.status !== 'bestfinal' || !deal.terms) return fail(state, 'That round is over.')
  if (price < (deal.bid ?? 0)) return fail(state, 'A best and final offer can\'t be lower than your first bid.')
  const check = equityCheck(s, deal, price, deal.terms.plan, deal.terms.ltv, deal.terms.loan)
  const error = capacityError(s, check)
  if (error) return fail(state, error)
  const rng = new Rng(s.rng)
  deal.bid = price
  deal.terms = { ...deal.terms, price }
  const result = resolveBid(s, deal, rng, price, true)
  s.rng = rng.state
  return result
}

export function withdraw(state: GameState, dealId: string): ActionResult {
  const s = structuredClone(state)
  const deal = s.deals.find((d) => d.id === dealId)
  if (!deal) return fail(state, 'That deal is gone.')
  if (deal.status === 'open') {
    deal.status = 'passed'
    return { state: s, message: `You passed on ${deal.asset.name}.` }
  }
  if (deal.status === 'bestfinal') {
    deal.status = 'passed'
    return { state: s, message: `You stepped back from ${deal.asset.name}.` }
  }
  return fail(state, 'You can\'t pass on that deal now.')
}

export function diligence(state: GameState, dealId: string): ActionResult {
  const s = structuredClone(state)
  const deal = s.deals.find((d) => d.id === dealId)
  if (!deal || deal.status !== 'contract') return fail(state, 'That deal isn\'t under contract.')
  if (deal.asIs) return fail(state, 'This one sells as-is. There is no diligence period.')
  if (deal.ddDone) return fail(state, 'Diligence is already done.')
  const rng = new Rng(s.rng)
  s.firm.cash -= deal.ddCost
  s.turn.dealCosts += deal.ddCost
  const odds = detectionOdds(s.firm.staff.research)
  const found: HiddenIssue[] = []
  const missed: HiddenIssue[] = []
  for (const issue of deal.asset.hidden) (rng.chance(odds) ? found : missed).push(issue)
  deal.asset.hidden = missed
  deal.ddFound = found
  deal.ddDone = true
  s.rng = rng.state
  if (!found.length) return { state: s, message: `Diligence on ${deal.asset.name} came back clean.`, tone: 'good' }
  return { state: s, message: `Diligence found ${found.length === 1 ? 'a problem' : `${found.length} problems`} at ${deal.asset.name}.`, tone: 'bad' }
}

/** What a found problem is worth off the price. */
export function issueImpact(s: GameState, deal: Deal, issue: HiddenIssue): number {
  const a = deal.asset
  const value = appraise(a, s.macro)
  let impact = issue.cost
  if (issue.opexHit !== 1) impact += ((issue.opexHit - 1) * a.size * TYPES[a.type].opexFixed * s.macro.costIndex) / value.cap
  if (issue.occHit > 0) impact += (issue.occHit * a.size * a.inPlaceRent * (1 - TYPES[a.type].opexVar)) / value.cap
  if (issue.valueHit !== 1) impact += (1 - issue.valueHit) * value.value
  return impact
}

export function retrade(state: GameState, dealId: string): ActionResult {
  const s = structuredClone(state)
  const deal = s.deals.find((d) => d.id === dealId)
  if (!deal || deal.status !== 'contract' || !deal.ddFound.length || deal.retraded) return fail(state, 'There is nothing to re-trade.')
  const rng = new Rng(s.rng)
  const credit = sum(deal.ddFound.map((i) => issueImpact(s, deal, i)))
  const odds: Record<Deal['seller'], number> = { motivated: 0.8, distressed: 0.8, recap: 0.75, estate: 0.7, offmarket: 0.65, developer: 0.6, auction: 0.5 }
  deal.retraded = true
  const ok = rng.chance(odds[deal.seller])
  s.rng = rng.state
  if (ok) {
    deal.credit = credit
    return { state: s, message: `The seller agreed to take ${money(credit)} off the price.`, tone: 'good' }
  }
  return { state: s, message: `The seller refused to re-trade. Close at ${money(deal.bid ?? 0)} or walk away.`, tone: 'bad' }
}

export function walkAway(state: GameState, dealId: string): ActionResult {
  const s = structuredClone(state)
  const deal = s.deals.find((d) => d.id === dealId)
  if (!deal || deal.status !== 'contract') return fail(state, 'That deal isn\'t under contract.')
  deal.status = 'walked'
  // Brokers remember buyers who walk from a clean deal.
  if (!deal.ddFound.length) s.firm.reputation = clamp(s.firm.reputation - 2, 0, 100)
  const cost = deal.ddDone ? ` The firm eats ${money(deal.ddCost)} of dead deal costs.` : ''
  return { state: s, message: `You walked away from ${deal.asset.name}.${cost}`, tone: 'neutral' }
}

export function closeDeal(state: GameState, dealId: string): ActionResult {
  const s = structuredClone(state)
  const deal = s.deals.find((d) => d.id === dealId)
  if (!deal || deal.status !== 'contract' || !deal.terms || deal.bid === null) return fail(state, 'That deal isn\'t under contract.')
  const terms = deal.terms
  const check = equityCheck(s, deal, deal.bid, terms.plan, terms.ltv, terms.loan)
  const error = capacityError(s, check)
  if (error) return fail(state, error)
  const fund = investingFund(s)!
  // The fund reimburses the firm for diligence it paid for at closing.
  if (deal.ddDone) {
    s.firm.cash += deal.ddCost
    s.turn.dealCosts -= deal.ddCost
  }
  callCapital(s, fund, check.equity)
  const a = deal.asset
  const id = nextId(s, 'p')
  const p: Property = {
    ...structuredClone(a),
    id,
    fundId: fund.id,
    acquiredQ: s.q,
    purchasePrice: check.price,
    closingCosts: check.closing,
    equity: check.equity,
    distributions: 0,
    flows: [-check.equity],
    loan: check.loan > 0 ? newLoan(s.macro, terms.loan, a, check.loan, s.q) : null,
    plan: null,
    value: check.price,
    noi: 0,
    lastCashFlow: 0,
    history: [],
    offer: null,
    log: [],
    boughtInPhase: s.macro.phase,
  }
  for (const issue of deal.ddFound) {
    p.occupancy = clamp(p.occupancy - issue.occHit, 0.02, 0.99)
    p.opexAdj *= issue.opexHit
    p.premium *= issue.valueHit
  }
  const spec = planSpec(p, s.macro, terms.plan)
  if (spec) startPlanOn(p, spec)
  const ap = appraiseHeld(p, s.macro)
  p.value = ap.value
  p.noi = noiAt(p, s.macro)
  p.history.push({ q: s.q, value: p.value, noi: p.noi, occ: p.occupancy })
  logOn(s, p, `Bought for ${money(check.price)}${check.loan > 0 ? ` with a ${money(check.loan)} loan` : ', all cash'}.`, 'good')
  if (spec) logOn(s, p, `Started a ${spec.kind === 'valueadd' ? 'value-add program' : 'repositioning'}: ${money(spec.budget)} over ${spec.quarters} quarters.`)
  s.properties.push(p)
  s.tombstones.push({ id, name: a.name, type: a.type, market: a.market, price: check.price, q: s.q, fundNumber: fund.number })
  deal.status = 'closed'
  deal.propertyId = id
  s.stats.closings += 1
  if (s.macro.phase === 'recession') s.stats.recessionBuys += 1
  note(s, `Closed ${a.name} for ${money(check.price)}.`, 'good')
  s.news.unshift({ q: s.q, text: `${s.firm.name} buys ${a.name} in ${a.market.toUpperCase()} for ${money(check.price)}.`, tone: 'good', tag: 'deal' })
  updateMetrics(s, fund)
  return withAwards({ state: s, message: `Closed. ${a.name} is yours.`, tone: 'good' })
}

// ---------------------------------------------------------------------------
// Asset management

function findProperty(s: GameState, id: string): Property | undefined {
  return s.properties.find((p) => p.id === id)
}

export function startPlan(state: GameState, propertyId: string, kind: PlanKind): ActionResult {
  const s = structuredClone(state)
  const p = findProperty(s, propertyId)
  if (!p) return fail(state, 'That building is gone.')
  if (p.plan) return fail(state, 'A business plan is already under way.')
  const spec = planSpec(p, s.macro, kind)
  if (!spec) return fail(state, 'There isn\'t enough upside left in the building for that plan.')
  const fund = fundOf(s, p)
  if (dryPowder(s, fund) < spec.budget) return fail(state, `${fund.name} has only ${money(dryPowder(s, fund))} of uncalled capital; the plan needs ${money(spec.budget)}.`)
  startPlanOn(p, spec)
  p.offer = null
  const label = kind === 'valueadd' ? 'value-add program' : 'repositioning'
  logOn(s, p, `Started a ${label}: ${money(spec.budget)} over ${spec.quarters} quarters.`)
  note(s, `Started a ${label} at ${p.name}.`)
  return { state: s, message: `The ${label} at ${p.name} is under way.`, tone: 'good' }
}

export function requestOffers(state: GameState, propertyId: string): ActionResult {
  const s = structuredClone(state)
  const p = findProperty(s, propertyId)
  if (!p) return fail(state, 'That building is gone.')
  if (p.offer && p.offer.q === s.q) return { state }
  const rng = new Rng(s.rng)
  const { price, buyer } = bestOffer(s, p, rng)
  p.offer = { price, buyer, q: s.q }
  s.rng = rng.state
  return { state: s, message: `Best offer for ${p.name}: ${money(price)} from ${buyer}.` }
}

export function acceptOffer(state: GameState, propertyId: string): ActionResult {
  const s = structuredClone(state)
  const p = findProperty(s, propertyId)
  if (!p || !p.offer || p.offer.q !== s.q) return fail(state, 'That offer has expired.')
  const fund = fundOf(s, p)
  const record = sellProperty(s, p, p.offer.price)
  updateMetrics(s, fund)
  return withAwards({ state: s, message: `Sold ${record.name} for ${money(record.salePrice)}: ${record.multiple.toFixed(2)}x.`, tone: record.multiple >= 1 ? 'good' : 'bad' })
}

export function refinanceProperty(state: GameState, propertyId: string, kind: LoanKind, ltv: number): ActionResult {
  const s = structuredClone(state)
  const p = findProperty(s, propertyId)
  if (!p) return fail(state, 'That building is gone.')
  const quote = refiQuote(s, p, kind, ltv)
  if (quote.amount <= 0 && !p.loan) return fail(state, 'There is no loan to pay off and none on offer.')
  refinance(s, p, quote)
  if (quote.net > 0 && quote.amount > 0) s.stats.cashOutRefis += 1
  updateMetrics(s, fundOf(s, p))
  return withAwards({ state: s, message: quote.net >= 0 ? `Refinanced. ${money(quote.net)} goes back to the fund.` : `Refinanced. The fund put in ${money(-quote.net)}.`, tone: 'good' })
}

export function handBackKeys(state: GameState, propertyId: string): ActionResult {
  const s = structuredClone(state)
  const p = findProperty(s, propertyId)
  if (!p || !p.loan) return fail(state, 'Only a building with a loan can be handed to its lender.')
  const fund = fundOf(s, p)
  foreclose(s, p)
  s.events = s.events.filter((e) => e.propertyId !== propertyId)
  updateMetrics(s, fund)
  return withAwards({ state: s, message: `${p.name} now belongs to its lender.`, tone: 'bad' })
}

// ---------------------------------------------------------------------------
// The firm

export function setStaff(state: GameState, dept: Dept, delta: number): ActionResult {
  const s = structuredClone(state)
  const now = s.firm.staff[dept]
  const next = clamp(now + delta, 0, 12)
  if (next === now) return { state }
  s.firm.staff[dept] = next
  if (next < now) {
    const severance = DEPTS[dept].salary / 4
    s.firm.cash -= severance
    s.turn.other -= severance
    s.firm.reputation = clamp(s.firm.reputation - 0.5, 0, 100)
    return { state: s, message: `One ${DEPTS[dept].label.toLowerCase()} role cut. Severance: ${money(severance)}.` }
  }
  return { state: s, message: `Hired into ${DEPTS[dept].label.toLowerCase()}: ${money(DEPTS[dept].salary)} a year.`, tone: 'good' }
}

export function launchRaise(state: GameState, terms: RaiseTerms): ActionResult {
  const ok = canLaunch(state)
  if (!ok.ok) return fail(state, ok.reason ?? 'You can\'t raise right now.')
  const s = structuredClone(state)
  const raise = newRaise(s, terms)
  const cost = 150000 + terms.target * 0.0005
  s.firm.cash -= cost
  s.turn.other -= cost
  s.firm.fundraise = raise
  note(s, `Launched Fund ${roman(raise.number)} with a ${money(terms.target)} target.`)
  return { state: s, message: `Fund ${roman(raise.number)} is on the road. Legal and marketing cost ${money(cost)}.`, tone: 'good' }
}

function finalClose(s: GameState, news: NewsItem[]) {
  const raise = s.firm.fundraise
  if (!raise) return
  s.firm.fundraise = null
  const total = raise.committed
  const label = `Fund ${roman(raise.number)}`
  if (total < 25e6 || total < raise.target * 0.25) {
    s.firm.reputation = clamp(s.firm.reputation - 5, 0, 100)
    news.push({ q: s.q, text: `${label} failed to reach a first close. LPs aren't ready to back ${s.firm.name} again yet.`, tone: 'bad', tag: 'firm' })
    return
  }
  const merged = new Map<string, number>()
  for (const lp of raise.lps) merged.set(lp.name, (merged.get(lp.name) ?? 0) + lp.amount)
  const prev = investingFund(s)
  if (prev) {
    prev.status = 'harvesting'
    news.push({ q: s.q, text: `${prev.name} stops buying now that ${label} has closed.`, tone: 'neutral', tag: 'firm' })
  }
  const fund = makeFund({
    id: nextId(s, 'f'), number: raise.number, firm: s.firm.name, strategy: raise.strategy, size: total,
    feeRate: raise.feeRate, carry: raise.carry, pref: raise.pref, q: s.q,
    lps: [...merged].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
  })
  s.funds.push(fund)
  if (raise.placementAgent) {
    const fee = total * 0.0075
    s.firm.cash -= fee
    s.turn.other -= fee
  }
  const vs = total >= raise.target ? `above its ${money(raise.target)} target` : `short of its ${money(raise.target)} target`
  s.firm.reputation = clamp(s.firm.reputation + (total >= raise.target ? 4 : total < raise.target * 0.6 ? -4 : 0), 0, 100)
  news.push({ q: s.q, text: `${s.firm.name} holds the final close of ${label} at ${money(total)}, ${vs}.`, tone: total >= raise.target ? 'good' : 'neutral', tag: 'firm' })
  note(s, `${label} closed at ${money(total)}.`, 'good')
}

export function holdFinalClose(state: GameState): ActionResult {
  const raise = state.firm.fundraise
  if (!raise || raise.elapsed < 1) return fail(state, 'There is nothing to close yet.')
  const s = structuredClone(state)
  const news: NewsItem[] = []
  finalClose(s, news)
  s.news.unshift(...news)
  return withAwards({ state: s, message: news[0]?.text, tone: 'good' })
}

export function retire(state: GameState): ActionResult {
  const s = structuredClone(state)
  s.status = 'ended'
  s.endReason = 'retired'
  return { state: s }
}

// ---------------------------------------------------------------------------
// Decisions

function applyEffect(s: GameState, e: Effect, rng: Rng, p: Property | undefined, fund: Fund | undefined): Array<{ text: string; tone: Tone }> {
  const out: Array<{ text: string; tone: Tone }> = []
  if (e.cash) {
    s.firm.cash += e.cash
    s.turn.other += e.cash
  }
  if (p && s.properties.includes(p)) {
    if (e.fundCost) propertyCash(s, p, -e.fundCost)
    if (e.quality) p.quality = clamp(p.quality + e.quality, 5, Math.max(p.maxQuality, p.quality))
    if (e.occ) p.occupancy = clamp(p.occupancy + e.occ, 0.02, 0.99)
    if (e.rentMult) p.inPlaceRent *= e.rentMult
    if (e.opexMult) p.opexAdj *= e.opexMult
    if (e.premium) p.premium *= e.premium
    if (e.concentration) p.concentration = clamp(p.concentration + e.concentration, 0, 1)
    if (e.sizeMult) {
      const ap = appraise(p, s.macro)
      p.inPlaceRent = (p.inPlaceRent + ap.marketRent * (e.sizeMult - 1)) / e.sizeMult
      p.size *= e.sizeMult
    }
    if (e.rateBump && p.loan) {
      p.loan.rate += e.rateBump
      p.loan.spread += e.rateBump
    }
    if (e.extendLoan && p.loan) {
      p.loan.maturityQ += 4
      propertyCash(s, p, -p.loan.balance * 0.005)
      logOn(s, p, 'The lender extended the loan a year.')
    }
    if (e.refi) refinance(s, p, refiQuote(s, p, e.refi.kind, e.refi.ltv))
    p.value = appraiseHeld(p, s.macro).value
    if (e.foreclose) foreclose(s, p)
    else if (e.sellAt) sellProperty(s, p, e.sellAt)
  }
  if (e.rep) s.firm.reputation = clamp(s.firm.reputation + e.rep, 0, 100)
  if (e.staff) s.firm.staff[e.staff.dept] = clamp(s.firm.staff[e.staff.dept] + e.staff.n, 0, 12)
  if (e.gpStake) s.firm.stakeSold = Math.min(0.6, s.firm.stakeSold + e.gpStake)
  if (e.raiseCommit && s.firm.fundraise) {
    s.firm.fundraise.lps.push({ ...e.raiseCommit })
    s.firm.fundraise.committed += e.raiseCommit.amount
  }
  if (e.raiseFee && s.firm.fundraise) s.firm.fundraise.feeRate = Math.max(0.005, s.firm.fundraise.feeRate + e.raiseFee)
  if (e.extendFund) {
    const f = s.funds.find((x) => x.id === e.extendFund)
    if (f) {
      f.termEndQ += 4
      f.extensions += 1
    }
  }
  if (e.liquidateFund) {
    for (const x of s.properties.filter((pp) => pp.fundId === e.liquidateFund)) sellProperty(s, x, appraiseHeld(x, s.macro).value * 0.95)
  }
  if (e.text) out.push({ text: e.text, tone: e.tone ?? 'neutral' })
  if (e.odds) out.push(...applyEffect(s, rng.chance(e.odds.p) ? e.odds.win : e.odds.lose, rng, p, fund))
  return out
}

export function decide(state: GameState, eventId: string, option: number): ActionResult {
  const s = structuredClone(state)
  const event = s.events.find((e) => e.id === eventId)
  if (!event || !event.options[option]) return fail(state, 'That decision is gone.')
  const rng = new Rng(s.rng)
  const p = event.propertyId ? findProperty(s, event.propertyId) : undefined
  const fund = event.fundId ? s.funds.find((f) => f.id === event.fundId) : p ? fundOf(s, p) : undefined
  s.events = s.events.filter((e) => e.id !== eventId)
  const out = applyEffect(s, event.options[option].effect, rng, p, fund)
  for (const o of out) note(s, o.text, o.tone)
  if (p) for (const o of out) if (s.properties.includes(p)) logOn(s, p, o.text, o.tone)
  for (const f of s.funds) if (f.status !== 'liquidated') updateMetrics(s, f)
  s.rng = rng.state
  const last = out[out.length - 1]
  return withAwards({ state: s, message: last?.text, tone: last?.tone })
}

// ---------------------------------------------------------------------------
// The quarter

function maturityEvent(s: GameState, p: Property): GameEvent {
  const loan = p.loan!
  const value = appraiseHeld(p, s.macro).value
  const fixed = refiQuote(s, p, 'fixed', 0.75)
  const bridge = refiQuote(s, p, 'bridge', 0.75)
  const describe = (q: typeof fixed) => (q.net >= 0 ? `${money(q.net)} back to the fund` : `the fund puts in ${money(-q.net)}`)
  const options: GameEvent['options'] = [
    { label: 'Refinance, fixed rate', hint: `${money(fixed.amount)} at ${(fixed.rate * 100).toFixed(2)}%; ${describe(fixed)}`, effect: { refi: { kind: 'fixed', ltv: 0.75 } } },
    { label: 'Refinance, bridge loan', hint: `${money(bridge.amount)} at ${(bridge.rate * 100).toFixed(2)}%; ${describe(bridge)}`, effect: { refi: { kind: 'bridge', ltv: 0.75 } } },
    { label: 'Sell it now', hint: `About ${money(value * 0.97)} in a quick sale`, effect: { sellAt: value * 0.97 } },
  ]
  if (value < loan.balance * 1.1) options.push({ label: 'Hand back the keys', hint: 'Lose the equity and some reputation', effect: { foreclose: true } })
  return {
    id: nextId(s, 'e'), kind: 'maturity', q: s.q + 1, propertyId: p.id,
    title: `The loan on ${p.name} is due`,
    body: `${money(loan.balance)} matures this quarter. The building appraises at ${money(value)} and lenders will size a new loan on today's income and rates.`,
    options,
  }
}

function termEvent(s: GameState, f: Fund): GameEvent {
  const left = s.properties.filter((p) => p.fundId === f.id)
  const options: GameEvent['options'] = []
  if (f.extensions < 2) options.push({ label: 'Ask LPs for a one-year extension', hint: 'Reputation down a little', effect: { extendFund: f.id, rep: -2, text: `LPs granted ${f.name} a one-year extension.` } })
  options.push({ label: 'Sell everything now', hint: `${left.length} building${left.length === 1 ? '' : 's'} at a 5% discount`, effect: { liquidateFund: f.id, text: `${f.name} sold its last buildings.` } })
  return {
    id: nextId(s, 'e'), kind: 'term', q: s.q + 1, fundId: f.id,
    title: `${f.name} has reached the end of its term`,
    body: f.extensions < 2
      ? `${f.name} still owns ${left.length} building${left.length === 1 ? '' : 's'}. LPs want their money back, but they'll grant an extension if you ask.`
      : `${f.name} has used both of its extensions. Whatever is left has to be sold.`,
    options,
  }
}

function repTarget(s: GameState): number {
  let perf = 0
  let n = 0
  for (const f of s.funds) {
    if (s.q - f.vintageQ < 8 || f.called <= 0) continue
    const years = Math.max(1, (s.q - f.vintageQ) / 4)
    const r = f.netIrr ?? (f.tvpi - 1) / years
    perf += clamp((r - STRATEGIES[f.strategy].target) * 300, -25, 25)
    n += 1
  }
  const scale = clamp(10 * Math.log10(Math.max(1, aum(s) / 100e6)), 0, 22)
  const ir = 2 * Math.min(5, s.firm.staff.investorRelations)
  const track = Math.min(10, s.sold.filter((x) => !x.foreclosed && x.multiple >= 1).length)
  return clamp(DIFFICULTIES[s.difficulty].rep * 0.6 + 12 + (n ? perf / n : 0) + scale + ir + track, 0, 100)
}

const RIVAL_GROWTH = { recovery: 0.012, expansion: 0.022, late: 0.018, recession: -0.012 }

function tickRivals(s: GameState, rng: Rng, news: NewsItem[]) {
  for (const r of s.rivals) r.aum *= 1 + RIVAL_GROWTH[s.macro.phase] + rng.normal(0, 0.025)
  if (!rng.chance(0.22)) return
  const r = rng.pick(s.rivals)
  const bad = s.macro.phase === 'recession' || s.macro.phase === 'late'
  const t = TYPES[rng.pick(r.focus)].short.toLowerCase()
  const lines = bad
    ? [`${r.name} hands back the keys on a portfolio of ${t}.`, `${r.name} marks its flagship fund down 12%.`, `${r.name} gates redemptions from its open-ended fund.`]
    : [`${r.name} closes a ${money(r.aum * rng.range(0.08, 0.15))} flagship fund.`, `${r.name} buys a ${money(r.aum * rng.range(0.01, 0.03))} portfolio of ${t}.`, `${r.name} poaches a team of ${t} specialists.`]
  news.push({ q: s.q, text: rng.pick(lines), tone: 'neutral', tag: 'rival' })
}

function surfaceIssues(s: GameState, p: Property) {
  const age = s.q - p.acquiredQ
  const due = p.hidden.filter((i) => age >= i.surfacesIn)
  if (!due.length) return
  p.hidden = p.hidden.filter((i) => age < i.surfacesIn)
  for (const issue of due) {
    if (issue.cost > 0) propertyCash(s, p, -issue.cost)
    p.occupancy = clamp(p.occupancy - issue.occHit, 0.02, 0.99)
    p.opexAdj *= issue.opexHit
    p.premium *= issue.valueHit
    const cost = issue.cost > 0 ? ` It will cost ${money(issue.cost)}.` : ''
    note(s, `A surprise at ${p.name}: ${issue.label.charAt(0).toLowerCase()}${issue.label.slice(1)}.${cost}`, 'bad')
    logOn(s, p, `Surprise: ${issue.label}.`, 'bad')
  }
}

function letterFor(s: GameState, r: Omit<QuarterReport, 'letter'>): string[] {
  const lines: string[] = []
  const phase = PHASES[s.macro.phase].label.toLowerCase()
  const prevTen = s.history[s.history.length - 1]?.tenYear ?? s.macro.tenYear
  const bp = Math.round((s.macro.tenYear - prevTen) * 10000)
  lines.push(`The economy is in ${phase === 'late cycle' ? 'the late stage of the cycle' : phase}. The 10-year Treasury ended the quarter at ${(s.macro.tenYear * 100).toFixed(2)}%${bp ? `, ${bp > 0 ? 'up' : 'down'} ${Math.abs(bp)} bp` : ', unchanged'}.`)
  if (s.properties.length) {
    const change = r.noiPrev > 0 ? (r.noi - r.noiPrev) / r.noiPrev : 0
    lines.push(`Our ${s.properties.length} building${s.properties.length === 1 ? '' : 's'} earned ${money(r.noi)} of annualized NOI${r.noiPrev > 0 ? `, ${change >= 0 ? 'up' : 'down'} ${Math.abs(change * 100).toFixed(1)}%` : ''}, and are ${(r.occupancy * 100).toFixed(1)}% leased.`)
  } else {
    lines.push('We have not bought anything yet. We are being patient, and the pipeline is full.')
  }
  if (r.calls || r.distributions) lines.push(`We called ${money(r.calls)} of capital and distributed ${money(r.distributions)}.`)
  const fund = s.funds.filter((f) => f.called > 0).slice(-1)[0]
  if (fund) lines.push(`${fund.name} is marked at ${fund.tvpi.toFixed(2)}x${fund.netIrr !== null && s.q - fund.vintageQ >= 8 ? ` with a ${(fund.netIrr * 100).toFixed(1)}% net IRR` : ''}.`)
  return lines
}

export function endQuarter(state: GameState): ActionResult {
  if (state.status !== 'playing') return { state }
  const blocking = pending(state)
  if (blocking.length) return fail(state, `First: ${blocking[0].label}.`)
  const s = structuredClone(state)
  const rng = new Rng(s.rng)
  const diff = DIFFICULTIES[s.difficulty]
  const news: NewsItem[] = []
  const noiPrev = sum(s.properties.map((p) => p.noi))
  const valuePrev = new Map(s.properties.map((p) => [p.id, p.value]))
  const wasRecession = s.macro.phase === 'recession'

  news.push(...tickMacro(s.macro, rng, s.q, diff.vol))
  if (!wasRecession && s.macro.phase === 'recession') s.stats.recessionMark = s.stats.foreclosures
  if (wasRecession && s.macro.phase !== 'recession') {
    if (s.stats.recessionMark >= 0 && s.stats.foreclosures === s.stats.recessionMark && s.properties.length) s.stats.cleanCycles += 1
    s.stats.recessionMark = -1
  }

  const skill = amSkill(s)
  for (const p of [...s.properties]) {
    if (p.loan?.kind === 'bridge') p.loan.rate = s.macro.policyRate + p.loan.spread
    const ops = operate(p, s.macro, rng, skill)
    for (const n of ops.notes) {
      note(s, n.text, n.tone)
      logOn(s, p, n.text, n.tone)
    }
    if (ops.planDone && p.plan) {
      const label = p.plan.kind === 'valueadd' ? 'value-add program' : 'repositioning'
      note(s, `The ${label} at ${p.name} is finished, ${money(p.plan.spent)} spent.`, 'good')
      logOn(s, p, `Finished the ${label}.`, 'good')
      p.plan = null
    }
    surfaceIssues(s, p)
    propertyCash(s, p, ops.cashFlow)
    p.noi = ops.noi * 4
    p.lastCashFlow = ops.cashFlow
    p.value = appraiseHeld(p, s.macro).value
    p.history.push({ q: s.q, value: p.value, noi: p.noi, occ: p.occupancy })
    if (p.history.length > 48) p.history.shift()
    p.offer = null
  }

  // A fund that has drawn its credit line past the limit gets a call from the bank: it sells, or its lenders take buildings.
  for (const f of s.funds) {
    for (let guard = 0; f.creditLine > creditLimit(f) && guard < 12; guard++) {
      const held = s.properties.filter((p) => p.fundId === f.id)
      if (!held.length) break
      const worst = held.sort((a, b) => a.lastCashFlow - b.lastCashFlow)[0]
      const equity = equityValue(worst, s.macro, s.q)
      if (equity > 0 || !worst.loan) {
        note(s, `${f.name} hit its credit limit. The bank forced a quick sale of ${worst.name}.`, 'bad')
        sellProperty(s, worst, worst.value * 0.93)
        const repay = Math.min(f.cash, f.creditLine)
        f.cash -= repay
        f.creditLine -= repay
      } else {
        note(s, `${f.name} hit its credit limit and couldn't carry ${worst.name}.`, 'bad')
        foreclose(s, worst)
      }
    }
  }

  for (const f of s.funds) closeFundQuarter(s, f, news)

  if (s.firm.fundraise && tickRaise(s, rng, news)) finalClose(s, news)

  const pay = salaries(s) / 4
  const office = overhead(s) / 4
  s.firm.cash -= pay + office
  s.firm.lastPnl = {
    fees: s.turn.fees, carry: s.turn.carry, gpIncome: s.turn.gpIncome, gpCalls: s.turn.gpCalls,
    salaries: pay, overhead: office, dealCosts: s.turn.dealCosts, other: s.turn.other,
  }
  s.firm.fre.push(s.turn.fees - pay - office)
  if (s.firm.fre.length > 4) s.firm.fre.shift()

  s.firm.reputation = clamp(s.firm.reputation + 0.1 * (repTarget(s) - s.firm.reputation), 0, 100)
  tickRivals(s, rng, news)

  if (s.firm.cash < 0) {
    s.firm.brokeQuarters += 1
    if (s.firm.brokeQuarters === 1) note(s, 'The firm is out of cash. Cut costs, sell something or sell a stake before next quarter, or the firm folds.', 'bad')
  } else s.firm.brokeQuarters = 0

  // Loans coming due and funds at the end of their term need a decision next quarter.
  const fresh: GameEvent[] = []
  for (const p of s.properties) {
    const loan = p.loan
    if (!loan || loan.maturityQ > s.q + 1 || s.events.some((e) => e.kind === 'maturity' && e.propertyId === p.id)) continue
    const dscr = p.noi / Math.max(1, loan.balance * loan.rate)
    if (loan.kind === 'bridge' && loan.extensionsLeft > 0 && dscr >= 1.1 && loan.balance <= p.value * 0.75) {
      loan.extensionsLeft -= 1
      loan.maturityQ += 4
      propertyCash(s, p, -loan.balance * 0.0025)
      logOn(s, p, 'Exercised a one-year extension on the bridge loan.')
      note(s, `Extended the bridge loan on ${p.name} by a year.`)
    } else fresh.push(maturityEvent(s, p))
  }
  for (const f of s.funds) {
    if (f.status === 'liquidated' || s.q + 1 < f.termEndQ || s.events.some((e) => e.kind === 'term' && e.fundId === f.id)) continue
    if (s.properties.some((p) => p.fundId === f.id)) fresh.push(termEvent(s, f))
  }

  const reportBase = {
    q: s.q,
    headlines: news,
    noi: sum(s.properties.map((p) => p.noi)),
    noiPrev,
    valueChange: sum(s.properties.filter((p) => valuePrev.has(p.id)).map((p) => p.value - (valuePrev.get(p.id) ?? p.value))),
    occupancy: s.properties.length ? sum(s.properties.map((p) => p.occupancy * p.value)) / Math.max(1, sum(s.properties.map((p) => p.value))) : 0,
    calls: s.turn.calls,
    distributions: s.turn.distributions,
    fees: s.turn.fees,
    carry: s.turn.carry,
    expenses: pay + office + s.turn.dealCosts,
    gpFlows: s.turn.gpIncome - s.turn.gpCalls,
    cashBefore: s.turn.cashStart,
    cashAfter: s.firm.cash,
    newDeals: 0,
    notes: s.turn.notes,
  }
  award(s)

  // Next quarter.
  s.q += 1
  s.deals = s.deals.filter((d) => d.status === 'open' && d.expiresQ >= s.q)
  const before = s.deals.length
  refillDeals(s, rng, dealsPerQuarter(rng, s.firm.staff.acquisitions, s.firm.reputation, s.macro.phase))
  reportBase.newDeals = s.deals.length - before
  s.events = [...s.events, ...fresh, ...rollEvents(s, rng, () => nextId(s, 'e'))]
  const report: QuarterReport = { ...reportBase, letter: letterFor(s, reportBase) }
  s.reports.unshift(report)
  if (s.reports.length > 8) s.reports.length = 8
  s.news = [...news.reverse(), ...s.news].slice(0, 40)
  s.history.push(snapshot(s))
  s.stats.peakAum = Math.max(s.stats.peakAum, aum(s))

  if (s.firm.brokeQuarters >= 2) {
    s.status = 'ended'
    s.endReason = 'bankrupt'
  } else if (s.q >= s.quarters) {
    s.status = 'ended'
    s.endReason = 'retired'
  }
  s.turn = emptyTurn(s.firm.cash)
  s.rng = rng.state
  return { state: s }
}

/** Equity in a building today and the deal's returns so far, as the asset screen shows them. */
export function holdingNow(s: GameState, p: Property) {
  const equityNow = equityValue(p, s.macro, s.q)
  return { equityNow, ...dealReturns(s, p, equityNow), occTarget: occupancyTarget(p, s.macro) }
}
