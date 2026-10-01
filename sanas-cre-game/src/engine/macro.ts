/*
 * The economy: a business cycle that moves the central bank, the 10-year
 * yield, lenders and LPs; sector storylines that bend rents and occupancy;
 * and the occasional black swan.
 */
import { FOLLOW_ONS, MARKETS, MARKET_ORDER, OPENING_STORYLINES, PHASES, STORYLINE_POOL, TYPES, TYPE_ORDER } from './data'
import { clamp } from './finance'
import type { Rng } from './rng'
import type { Macro, MarketId, NewsItem, Phase, PropertyType, SectorState, Storyline } from './types'

/** The long-run 10-year yield the curve leans toward. */
const NEUTRAL_LONG = 0.044

export const comboKey = (type: PropertyType, market: MarketId) => `${type}:${market}`

export function newMacro(rng: Rng): Macro {
  const sectors = {} as Record<PropertyType, SectorState>
  for (const t of TYPE_ORDER) sectors[t] = { level: 1, growth: TYPES[t].growth, capSpread: TYPES[t].spread, occ: TYPES[t].occ }
  const markets = {} as Macro['markets']
  for (const m of MARKET_ORDER) markets[m] = { level: 1, local: rng.normal(0, 0.003) }
  const rents: Record<string, number> = {}
  for (const t of TYPE_ORDER) for (const m of MARKET_ORDER) rents[comboKey(t, m)] = 1
  const macro: Macro = {
    phase: 'recovery',
    phaseAge: rng.int(1, 3),
    policyRate: 0.0375,
    tenYear: 0.0425,
    termPremium: 0.002,
    inflation: 0.027,
    creditSpread: 0.021,
    maxLtv: 0.64,
    lpAppetite: 0.9,
    sentiment: 0.002,
    costIndex: 1,
    sectors,
    markets,
    rents,
    storylines: OPENING_STORYLINES.map((s) => ({ ...s, markets: s.markets ? [...s.markets] : undefined })),
    shocks: {},
  }
  // Start the sectors where their opening storylines have already pushed them.
  for (const t of TYPE_ORDER) {
    const s = macro.sectors[t]
    s.growth = growthTarget(macro, t)
    s.occ = occTarget(macro, t)
    s.capSpread = spreadTarget(macro, t)
  }
  return macro
}

function national(macro: Macro, type: PropertyType): Storyline[] {
  return macro.storylines.filter((s) => !s.markets && (s.sector === type || s.sector === 'all'))
}

/** Storylines that only touch some markets, for one building's type and market. */
export function localStories(macro: Macro, type: PropertyType, market: MarketId): Storyline[] {
  return macro.storylines.filter((s) => s.markets?.includes(market) && (s.sector === type || s.sector === 'all'))
}

function shockGrowth(macro: Macro, type: PropertyType): number {
  if (!macro.shocks.pandemic) return 0
  return type === 'hotel' ? -0.12 : type === 'office' || type === 'retail' ? -0.03 : 0
}

function shockOcc(macro: Macro, type: PropertyType): number {
  if (!macro.shocks.pandemic) return 0
  return type === 'hotel' ? -0.3 : type === 'office' ? -0.05 : type === 'retail' ? -0.06 : 0
}

function growthTarget(macro: Macro, type: PropertyType): number {
  const spec = TYPES[type]
  const story = national(macro, type).reduce((sum, s) => sum + s.growth, 0)
  return spec.growth + PHASES[macro.phase].growth * spec.beta + story + shockGrowth(macro, type)
}

function occTarget(macro: Macro, type: PropertyType): number {
  const spec = TYPES[type]
  const story = national(macro, type).reduce((sum, s) => sum + s.occ, 0)
  return clamp(spec.occ + PHASES[macro.phase].occ * spec.beta + story + shockOcc(macro, type), 0.35, 0.985)
}

function spreadTarget(macro: Macro, type: PropertyType): number {
  const story = national(macro, type).reduce((sum, s) => sum + s.spread, 0)
  return TYPES[type].spread + story
}

/** Annual rent growth right now for one type in one market. */
export function comboGrowth(macro: Macro, type: PropertyType, market: MarketId): number {
  const m = MARKETS[market]
  const local = localStories(macro, type, market).reduce((sum, s) => sum + s.growth, 0)
  return macro.sectors[type].growth + m.growth + macro.markets[market].local + local
}

/** The interest rate cap rates key off: they move with the 10-year, but only about two-thirds as much. */
export function capAnchor(macro: Macro): number {
  return 0.65 * macro.tenYear + 0.35 * 0.0425
}

function phaseNews(from: Phase, to: Phase): string {
  if (to === 'expansion' && from === 'late') return 'Soft landing: inflation cools without a recession, and the expansion rolls on.'
  if (to === 'expansion') return 'The recovery broadens into a full expansion as hiring picks up everywhere.'
  if (to === 'late') return 'Inflation runs hot and the Fed turns hawkish. Economists say the cycle is getting late.'
  if (to === 'recession') return 'Recession: the economy shrinks for a second straight quarter and layoffs spread.'
  return 'The recession is over. Credit markets begin to thaw.'
}

function pct(x: number, digits = 2): string {
  return `${(x * 100).toFixed(digits)}%`
}

/** One quarter of weather. `vol` scales the randomness for the difficulty. */
export function tickMacro(macro: Macro, rng: Rng, q: number, vol: number): NewsItem[] {
  const news: NewsItem[] = []
  const say = (text: string, tone: NewsItem['tone'], tag: NewsItem['tag'] = 'macro') => news.push({ q, text, tone, tag })

  // Black swans first, since they can push the cycle.
  for (const key of Object.keys(macro.shocks)) {
    macro.shocks[key] -= 1
    if (macro.shocks[key] <= 0) delete macro.shocks[key]
  }
  let forceRecession = false
  if (q > 4 && !macro.shocks.pandemic && rng.chance(0.004 * vol)) {
    macro.shocks.pandemic = 5
    forceRecession = true
    say('A new pandemic shuts down travel and offices. Hotels empty overnight.', 'bad')
  } else if (q > 2 && !macro.shocks.banking && macro.phase !== 'recession' && rng.chance(0.007 * vol)) {
    macro.shocks.banking = 6
    forceRecession = macro.phase === 'late' && rng.chance(0.5)
    say('Regional bank failures: lenders pull back from commercial real estate and spreads blow out.', 'bad')
  } else if (q > 2 && !macro.shocks.inflation && rng.chance(0.006 * vol)) {
    macro.shocks.inflation = 6
    say('An inflation scare: prices jump and markets price in more rate hikes.', 'bad')
  }

  // The cycle.
  const spec = PHASES[macro.phase]
  macro.phaseAge += 1
  let next: Phase | null = forceRecession && macro.phase !== 'recession' ? 'recession' : null
  if (!next && macro.phaseAge >= spec.minAge) {
    // Expansions die of old age: the odds of the turn rise every quarter after six years.
    const age = macro.phase === 'expansion' ? Math.max(0, macro.phaseAge - 24) * 0.02 : 0
    for (const [to, p] of spec.next) {
      if (rng.chance(p + age)) {
        next = to
        break
      }
    }
  }
  if (next && next !== macro.phase) {
    say(phaseNews(macro.phase, next), next === 'recession' || next === 'late' ? 'bad' : 'good')
    macro.phase = next
    macro.phaseAge = 0
  }
  const phase = PHASES[macro.phase]

  // The central bank moves in quarter points toward where the phase wants it.
  let target = phase.rate + (macro.shocks.inflation ? 0.015 : 0) - (macro.shocks.pandemic ? 0.015 : 0)
  target = Math.max(0.0025, target)
  const gap = target - macro.policyRate
  const maxCut = macro.phase === 'recession' ? 0.0075 : 0.005
  let move = clamp(gap * 0.6, -maxCut, 0.005)
  move = Math.round(move / 0.0025) * 0.0025
  if (move === 0 && rng.chance(0.08)) move = rng.chance(0.5) ? 0.0025 : -0.0025
  const before = macro.policyRate
  macro.policyRate = Math.max(0.0025, Math.round((macro.policyRate + move) / 0.0025) * 0.0025)
  const moved = macro.policyRate - before
  if (Math.abs(moved) >= 0.0024) {
    const bp = Math.round(Math.abs(moved) * 10000)
    say(
      moved > 0
        ? `The Fed raises rates ${bp} bp to ${pct(macro.policyRate)}.`
        : `The Fed cuts rates ${bp} bp to ${pct(macro.policyRate)}.`,
      moved > 0 ? 'bad' : 'good',
    )
  }

  macro.termPremium += 0.25 * (0.002 - macro.termPremium) + rng.normal(0, 0.0011 * vol)
  macro.termPremium = clamp(macro.termPremium, -0.008, 0.015)
  const tenBefore = macro.tenYear
  macro.tenYear = clamp(0.5 * macro.policyRate + 0.5 * NEUTRAL_LONG + macro.termPremium + (macro.shocks.inflation ? 0.006 : 0), 0.012, 0.09)
  const tenMove = macro.tenYear - tenBefore
  if (Math.abs(tenMove) >= 0.0025) {
    say(
      `The 10-year Treasury yield ${tenMove > 0 ? 'climbs' : 'falls'} to ${pct(macro.tenYear)}${tenMove > 0 ? '; cap rates feel it' : ', a tailwind for values'}.`,
      tenMove > 0 ? 'bad' : 'good',
    )
  }

  macro.inflation += 0.3 * (phase.inflation + (macro.shocks.inflation ? 0.03 : 0) - macro.inflation) + rng.normal(0, 0.002 * vol)
  macro.inflation = clamp(macro.inflation, -0.01, 0.1)
  macro.costIndex *= 1 + macro.inflation / 4

  const bankStress = macro.shocks.banking ? 1 : 0
  macro.creditSpread += 0.35 * (phase.spread + bankStress * 0.015 - macro.creditSpread) + rng.normal(0, 0.0008 * vol)
  macro.creditSpread = clamp(macro.creditSpread, 0.012, 0.06)
  macro.maxLtv += 0.4 * (phase.ltv - bankStress * 0.1 - macro.maxLtv)
  macro.maxLtv = clamp(Math.round(macro.maxLtv * 200) / 200, 0.4, 0.75)
  macro.lpAppetite += 0.3 * (phase.lp - bankStress * 0.3 - (macro.shocks.pandemic ? 0.3 : 0) - macro.lpAppetite) + rng.normal(0, 0.03 * vol)
  macro.lpAppetite = clamp(macro.lpAppetite, 0.3, 1.5)
  macro.sentiment += 0.3 * (phase.sentiment + bankStress * 0.004 + (macro.shocks.pandemic ? 0.004 : 0) - macro.sentiment) + rng.normal(0, 0.0007 * vol)
  macro.sentiment = clamp(macro.sentiment, -0.008, 0.025)

  tickStorylines(macro, rng, q, vol, say)

  for (const t of TYPE_ORDER) {
    const s = macro.sectors[t]
    const typeSpec = TYPES[t]
    s.growth += 0.5 * (growthTarget(macro, t) - s.growth) + rng.normal(0, typeSpec.vol * vol)
    s.occ += 0.35 * (occTarget(macro, t) - s.occ) + rng.normal(0, 0.002 * vol)
    s.occ = clamp(s.occ, 0.3, 0.99)
    s.capSpread += 0.3 * (spreadTarget(macro, t) - s.capSpread) + rng.normal(0, 0.0005 * vol)
    s.capSpread = clamp(s.capSpread, 0.002, 0.08)
    s.level *= 1 + s.growth / 4
  }
  for (const m of MARKET_ORDER) {
    const ms = macro.markets[m]
    ms.local += 0.15 * (0 - ms.local) + rng.normal(0, 0.0025 * vol)
    ms.level *= 1 + (MARKETS[m].growth + ms.local) / 4
    for (const t of TYPE_ORDER) {
      const key = comboKey(t, m)
      macro.rents[key] *= 1 + comboGrowth(macro, t, m) / 4
    }
  }
  return news
}

function tickStorylines(
  macro: Macro,
  rng: Rng,
  q: number,
  vol: number,
  say: (text: string, tone: NewsItem['tone'], tag?: NewsItem['tag']) => void,
) {
  const ended: Storyline[] = []
  for (const s of macro.storylines) {
    s.quartersLeft -= 1
    if (s.quartersLeft <= 0) ended.push(s)
  }
  macro.storylines = macro.storylines.filter((s) => s.quartersLeft > 0)
  for (const s of ended) {
    const follow = s.then ? FOLLOW_ONS[s.then] : undefined
    if (follow) {
      macro.storylines.push({ ...follow, markets: s.markets ? [...s.markets] : undefined })
      say(follow.title + '.', follow.growth >= 0 ? 'good' : 'bad', 'sector')
    }
  }
  if (q < 2 || macro.storylines.length >= 7 || !rng.chance(0.16 * vol)) return
  const active = new Set(macro.storylines.map((s) => s.id))
  const options = STORYLINE_POOL.filter(
    (s) =>
      !active.has(s.id) &&
      // Never run a boom and a bust for the same sector at once.
      !macro.storylines.some((o) => !o.markets && !s.pickMarkets && o.sector === s.sector && Math.sign(o.growth) !== Math.sign(s.growth)),
  )
  if (!options.length) return
  const pick = rng.pick(options)
  let markets: MarketId[] | undefined
  if (pick.pickMarkets) {
    const pool = [...pick.pickMarkets]
    markets = []
    for (let i = 0; i < (pick.pickCount ?? 1) && pool.length; i++) markets.push(pool.splice(rng.int(0, pool.length - 1), 1)[0])
  }
  const names = markets?.map((m) => MARKETS[m].name).join(' and ') ?? ''
  const story: Storyline = {
    id: pick.id,
    title: pick.title.replace('{city}', names),
    sector: pick.sector,
    markets,
    growth: pick.growth,
    occ: pick.occ,
    spread: pick.spread,
    quartersLeft: pick.quartersLeft + rng.int(-2, 3),
    then: pick.then,
  }
  macro.storylines.push(story)
  say(story.title + '.', story.growth >= 0 ? 'good' : 'bad', 'sector')
}

/**
 * The house view for underwriting: no surprises, rates where they are,
 * growth fading toward its long-run trend as the storylines play out.
 */
export function tickExpected(macro: Macro) {
  for (const s of macro.storylines) s.quartersLeft -= 1
  macro.storylines = macro.storylines.filter((s) => s.quartersLeft > 0)
  macro.costIndex *= 1 + macro.inflation / 4
  for (const t of TYPE_ORDER) {
    const s = macro.sectors[t]
    const spec = TYPES[t]
    const story = national(macro, t).reduce((sum, st) => sum + st.growth, 0)
    // Analysts assume the phase's pull fades: next year looks like the long run.
    s.growth += 0.35 * (spec.growth + story - s.growth)
    s.occ += 0.25 * (spec.occ + national(macro, t).reduce((sum, st) => sum + st.occ, 0) - s.occ)
  }
  for (const m of MARKET_ORDER) {
    macro.markets[m].local *= 0.85
    for (const t of TYPE_ORDER) macro.rents[comboKey(t, m)] *= 1 + comboGrowth(macro, t, m) / 4
  }
}

/** Chance of a recession starting within four quarters, as a research team would estimate it. */
export function recessionOdds(macro: Macro): number {
  if (macro.phase === 'recession') return 1
  const late = 1 - Math.pow(1 - 0.2, 4)
  if (macro.phase === 'late') return clamp(late + (macro.shocks.banking ? 0.2 : 0), 0, 0.95)
  if (macro.phase === 'expansion') {
    const toLate = macro.phaseAge >= 6 ? 0.07 : 0.03
    return clamp(toLate * 2 * 0.2 + 0.02 + (macro.shocks.banking ? 0.1 : 0), 0, 0.6)
  }
  return 0.03
}
