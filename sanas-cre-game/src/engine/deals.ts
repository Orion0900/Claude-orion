/*
 * Deal flow: who is selling what, why, and for how much. Sellers in a wide
 * auction charge for part of the business plan; motivated, distressed and
 * off-market sellers don't. Some buildings hide problems that only
 * diligence finds.
 */
import { appraise, marketRent, occupancyTarget, planSpec, vintageCap } from './asset'
import { MARKETS, MARKET_ORDER, PHASES, SELLERS, TYPES, TYPE_ORDER } from './data'
import { clamp } from './finance'
import { propertyName } from './names'
import type { Rng } from './rng'
import { brokerCase, priceForIrr } from './underwrite'
import type { Asset, Deal, HiddenIssue, Macro, MarketId, Phase, PlanKind, PropertyType, SellerKind } from './types'

const BIDDERS: Record<SellerKind, readonly [number, number]> = {
  auction: [4, 9], offmarket: [1, 2], motivated: [2, 5], distressed: [3, 7], estate: [2, 4], developer: [3, 6], recap: [2, 4],
}
/**
 * The levered return the keenest rival will accept. A wide auction finds
 * someone happy with less; an off-market or as-is deal doesn't.
 */
const RIVAL_HURDLE: Record<SellerKind, number> = {
  auction: 0.115, developer: 0.12, estate: 0.135, motivated: 0.14, recap: 0.14, offmarket: 0.165, distressed: 0.17,
}
/** Rivals accept less at the top of the cycle and demand more at the bottom. */
const HEAT: Record<Phase, number> = { recovery: 0.01, expansion: -0.01, late: -0.015, recession: 0.025 }
/** How far over the ask the best rival will go: a wide auction can run away, a quiet sale can't. */
const CEILING: Record<SellerKind, number> = {
  auction: 1.15, developer: 1.1, distressed: 1.12, offmarket: 1.06, motivated: 1.08, estate: 1.08, recap: 1.08,
}
const ASK: Record<SellerKind, readonly [number, number]> = {
  auction: [1.0, 1.05], offmarket: [0.93, 0.99], motivated: [0.89, 0.96], distressed: [0.8, 0.92],
  estate: [0.91, 0.98], developer: [0.98, 1.04], recap: [0.87, 0.95],
}
/** How much of the renovation upside each kind of seller manages to charge for. */
const UPSIDE_SHARE: Record<SellerKind, number> = {
  auction: 0.2, developer: 0.1, offmarket: 0.08, motivated: 0.05, distressed: 0.03, estate: 0.06, recap: 0.06,
}
const ISSUE_CHANCE: Record<SellerKind, number> = {
  distressed: 0.65, estate: 0.5, motivated: 0.3, auction: 0.2, offmarket: 0.22, developer: 0.15, recap: 0.28,
}

/** Rounds a price the way a broker quotes it: three significant figures. */
export function roundPrice(x: number): number {
  if (x <= 0) return 0
  const mag = Math.pow(10, Math.floor(Math.log10(x)) - 2)
  return Math.round(x / mag) * mag
}

function pickType(rng: Rng, phase: Phase): PropertyType {
  return rng.weighted(
    TYPE_ORDER.map((t) => {
      let w = TYPES[t].weight
      if (phase === 'recession' && (t === 'office' || t === 'hotel' || t === 'retail')) w *= 1.3
      return [t, w] as const
    }),
  )
}

function pickMarket(rng: Rng, type: PropertyType): MarketId {
  return rng.weighted(MARKET_ORDER.map((m) => [m, MARKETS[m].weights[type] ?? 1] as const))
}

function pickSeller(rng: Rng, macro: Macro, type: PropertyType, acquisitions: number, reputation: number): SellerKind {
  const phase = PHASES[macro.phase]
  const oldStock = type !== 'datacenter' && type !== 'lifescience'
  return rng.weighted<SellerKind>([
    ['auction', 0.42],
    ['offmarket', 0.06 + 0.035 * acquisitions + reputation / 700],
    ['motivated', 0.11],
    ['distressed', phase.distress * 1.1],
    ['estate', oldStock ? 0.08 : 0.01],
    ['developer', macro.phase === 'expansion' || macro.phase === 'late' ? 0.12 : 0.06],
    ['recap', 0.05 + (macro.tenYear > 0.045 ? 0.07 : 0)],
  ])
}

function makeIssue(rng: Rng, asset: Asset, price: number): HiddenIssue {
  const base = { cost: 0, occHit: 0, opexHit: 1, valueHit: 1, surfacesIn: rng.int(1, 6) }
  const kinds: Array<() => HiddenIssue> = [
    () => ({ ...base, kind: 'roof', label: asset.type === 'datacenter' ? 'The cooling plant is near the end of its life' : 'The roof and HVAC are at the end of their lives', cost: price * rng.range(0.012, 0.03) }),
    () => ({ ...base, kind: 'environmental', label: rng.pick(['Soil contamination from a former dry cleaner', 'Asbestos above the ceilings', 'A leaking underground fuel tank']), cost: price * rng.range(0.015, 0.05) }),
    () => ({ ...base, kind: 'structural', label: rng.pick(['Concrete spalling in the parking structure', 'Foundation settlement along one wall', 'Corroded rebar in the balconies']), cost: price * rng.range(0.01, 0.035) }),
    () => ({ ...base, kind: 'taxes', label: 'The county will reassess at the sale price and taxes will jump', opexHit: rng.range(1.05, 1.12) }),
    () => ({ ...base, kind: 'title', label: 'An unrecorded easement limits what can ever be built on the site', valueHit: rng.range(0.94, 0.98) }),
  ]
  if (asset.concentration > 0.15) {
    kinds.push(() => ({ ...base, kind: 'tenant', label: 'The largest tenant has quietly signed a lease somewhere else', occHit: Math.min(asset.occupancy - 0.05, asset.concentration * rng.range(0.4, 0.8)) }))
  }
  if (asset.type === 'multifamily') {
    kinds.push(() => ({ ...base, kind: 'structural', label: 'Dozens of units were renovated without permits and must be redone', cost: price * rng.range(0.008, 0.02) }))
  }
  return rng.pick(kinds)()
}

function roundSize(size: number, unit: string): number {
  if (unit === 'SF') return size > 200000 ? Math.round(size / 5000) * 5000 : Math.max(1000, Math.round(size / 1000) * 1000)
  if (unit === 'MW') return size > 10 ? Math.round(size) : Math.max(1, Math.round(size * 2) / 2)
  if (unit === 'units') return Math.max(2, Math.round(size / 2) * 2)
  return Math.max(1, Math.round(size))
}

/** Value of the building once a business plan is finished and it's leased up, in today's market. */
export function stabilizedAfter(asset: Asset, macro: Macro, plan: PlanKind): number {
  const spec = planSpec(asset, macro, plan)
  const a: Asset = { ...asset, hidden: [] }
  if (spec) {
    a.quality = Math.min(spec.maxQuality, a.quality + spec.qualityGain)
    a.maxQuality = spec.maxQuality
  }
  a.occupancy = occupancyTarget(a, macro)
  a.inPlaceRent = marketRent(a, macro)
  return appraise(a, macro).value
}

/** The business plan that adds the most value net of its cost, for the seller to price and the analyst to suggest. */
export function bestPlan(asset: Asset, macro: Macro): { plan: PlanKind; upside: number } {
  const now = appraise(asset, macro).value
  let best: { plan: PlanKind; upside: number } = { plan: 'hold', upside: 0 }
  for (const plan of ['valueadd', 'reposition'] as const) {
    const spec = planSpec(asset, macro, plan)
    if (!spec) continue
    const after = { ...asset, quality: Math.min(spec.maxQuality, asset.quality + spec.qualityGain) }
    const fill = Math.max(0, occupancyTarget(after, macro) - asset.occupancy) * asset.size * marketRent(after, macro) * TYPES[asset.type].leasingCost
    // Discounted for the years of work and risk between here and there.
    const upside = (stabilizedAfter(asset, macro, plan) - now - spec.budget - fill) * 0.7
    if (upside > best.upside * 1.15) best = { plan, upside }
  }
  return best
}

export interface DealContext {
  macro: Macro
  q: number
  /** Fund size the deal sizes scale with. */
  scale: number
  acquisitions: number
  reputation: number
  rivalEdge: number
  nextId: () => string
}

export function makeDeal(rng: Rng, ctx: DealContext): Deal {
  const { macro, q } = ctx
  const type = pickType(rng, macro.phase)
  const market = pickMarket(rng, type)
  const seller = pickSeller(rng, macro, type, ctx.acquisitions, ctx.reputation)
  const spec = TYPES[type]
  const year = 2027 + Math.floor(q / 4)

  let yearBuilt: number
  if (seller === 'developer') yearBuilt = year - rng.int(0, 1)
  else if (seller === 'estate') yearBuilt = rng.int(1962, 1996)
  else if (seller === 'distressed') yearBuilt = rng.int(1972, year - 5)
  else yearBuilt = rng.chance(0.25) ? rng.int(1965, 1989) : rng.int(1990, year - 2)
  if (type === 'datacenter' || type === 'lifescience') yearBuilt = Math.max(yearBuilt, 2002)
  const maxQuality = vintageCap(yearBuilt)

  const roll: Record<SellerKind, readonly [number, number]> = {
    developer: [92, 98], estate: [22, 42], distressed: [22, 50], auction: [45, 80], offmarket: [38, 72], motivated: [38, 70], recap: [48, 80],
  }
  const quality = Math.min(rng.range(...roll[seller]), seller === 'developer' ? 98 : maxQuality - rng.range(2, 10))
  const [cLo, cHi] = spec.concentration
  const asset: Asset = {
    name: '', type, market, size: 1, count: 1, yearBuilt, quality: Math.max(15, quality), maxQuality,
    occupancy: 0.9, inPlaceRent: 0, opexAdj: 1, concentration: rng.range(cLo, cHi), premium: 1, hidden: [],
  }

  const occT = occupancyTarget(asset, macro)
  const occRoll: Record<SellerKind, readonly [number, number]> = {
    developer: [0.35, 0.7], distressed: [0.45, 0.82], estate: [0.85, 1], motivated: [0.75, 0.98],
    auction: [0.9, 1.03], offmarket: [0.82, 1], recap: [0.78, 0.98],
  }
  // A hotel's occupancy is mostly its market's; only a new or broken one runs far below.
  const hotelRoll: Record<SellerKind, readonly [number, number]> = {
    developer: [0.75, 0.9], distressed: [0.7, 0.9], estate: [0.88, 1], motivated: [0.88, 1], auction: [0.94, 1.03], offmarket: [0.9, 1.01], recap: [0.88, 1],
  }
  asset.occupancy = clamp(occT * rng.range(...(type === 'hotel' ? hotelRoll : occRoll)[seller]), 0.05, 0.99)
  const rentRoll: Record<SellerKind, readonly [number, number]> = {
    estate: [0.76, 0.88], developer: [0.96, 1], distressed: [0.85, 1.05], auction: [0.92, 1.04], offmarket: [0.86, 1], motivated: [0.86, 1], recap: [0.88, 1.02],
  }
  asset.inPlaceRent = marketRent(asset, macro) * (spec.rollover >= 1 ? 1 : rng.range(...rentRoll[seller]))
  asset.opexAdj = seller === 'estate' ? rng.range(1.05, 1.15) : seller === 'distressed' ? rng.range(1, 1.12) : rng.range(0.95, 1.05)

  // Size the building so the equity check, business plan included, suits the
  // fund: mostly comfortable, now and then a stretch near the single-asset limit.
  const equityShare = rng.chance(0.12) ? rng.range(0.17, 0.3) : rng.range(0.04, 0.17)
  const targetPrice = Math.max(8e6, (ctx.scale * equityShare) / 0.5)
  const perUnit = appraise(asset, macro).value
  let size = clamp(targetPrice / Math.max(1, perUnit), spec.sizeMin, spec.portfolioMax)
  if (size > spec.sizeMax) {
    asset.count = Math.ceil(size / (spec.sizeMax * 0.6))
    asset.concentration *= 0.5
  }
  size = roundSize(size, spec.unit)
  asset.size = size
  asset.name = propertyName(rng, type, market, asset.count)

  const value = appraise(asset, macro).value
  const { plan, upside } = bestPlan(asset, macro)
  const ask = roundPrice((value + Math.max(0, upside) * UPSIDE_SHARE[seller]) * rng.range(...ASK[seller]) * PHASES[macro.phase].pricing)

  if (rng.chance(ISSUE_CHANCE[seller])) {
    asset.hidden.push(makeIssue(rng, asset, ask))
    if (rng.chance(0.3)) asset.hidden.push(makeIssue(rng, asset, ask))
  }

  const [bLo, bHi] = BIDDERS[seller]
  const bidders = rng.int(bLo, bHi)
  // The best rival bids what it takes to earn its hurdle; the seller won't go far under the ask.
  const hurdle = RIVAL_HURDLE[seller] + HEAT[macro.phase] - ctx.rivalEdge - 0.002 * (bidders - 3) + rng.normal(0, 0.012)
  const rival = priceForIrr(asset, macro, q, plan, hurdle, ask)
  const reserve = ask * (seller === 'distressed' ? 0.88 : 0.95)
  const clearing = clamp(rival, reserve, ask * CEILING[seller])
  const story = rng.pick(SELLERS[seller].stories).replace('{n}', String(bidders + 1))

  return {
    id: ctx.nextId(),
    asset,
    seller,
    story,
    ask,
    bidders,
    clearing,
    postedQ: q,
    expiresQ: q + 1,
    status: 'open',
    asIs: seller === 'distressed',
    bid: null,
    terms: null,
    ddCost: Math.max(60000, ask * 0.0015),
    ddDone: false,
    ddFound: [],
    retraded: false,
    credit: 0,
    lostTo: null,
    lostAt: null,
    brokerIrr: brokerCase(asset, macro, q, ask, plan) ?? 0,
    propertyId: null,
  }
}

/** How much a seller favors your bid for certainty of closing: reputation and a bigger deal team help. */
export function bidEdge(reputation: number, acquisitions: number): number {
  return 0.003 * ((reputation - 40) / 10) + 0.002 * acquisitions
}

/** Each issue diligence might catch, caught with this probability. */
export function detectionOdds(research: number): number {
  return Math.min(0.95, 0.6 + 0.12 * research)
}

export function dealsPerQuarter(rng: Rng, acquisitions: number, reputation: number, phase: Phase): number {
  const base = 2.2 + 0.9 * acquisitions + reputation / 45 + (phase === 'recession' || phase === 'recovery' ? 0.6 : 0)
  return clamp(Math.round(base + rng.normal(0, 0.7)), 1, 9)
}
