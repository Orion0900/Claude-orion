/**
 * A simple, sensible player for tests and balance checks: buys deals its
 * model likes, runs the business plan, sells after a few years, staffs up
 * as the portfolio grows and raises the next fund when it can.
 */
import { appraiseHeld } from './asset'
import { STRATEGIES } from './data'
import { bestPlan } from './deals'
import { canLaunch, investingFund, previousSize } from './funds'
import {
  acceptOffer, bestAndFinal, closeDeal, decide, diligence, endQuarter, equityCheck, launchRaise, placeBid,
  requestOffers, retrade, setStaff,
} from './game'
import { underwrite } from './underwrite'
import type { GameState } from './types'

export interface BotOptions {
  /** Levered IRR the bot needs before it bids. */
  hurdle: number
  ltv: number
  /** How far over the asking price it will go. */
  stretch: number
  holdQuarters: number
}

export const DEFAULT_BOT: BotOptions = { hurdle: 0.125, ltv: 0.62, stretch: 1.09, holdQuarters: 18 }

function act(s: GameState, fn: (s: GameState) => { state: GameState }): GameState {
  return fn(s).state
}

export function botQuarter(state: GameState, o: BotOptions = DEFAULT_BOT): GameState {
  let s = state
  // Decisions first: take the first option, which is usually the prudent one.
  for (const e of [...s.events]) s = act(s, (x) => decide(x, e.id, 0))

  // Staff to the portfolio.
  const needAm = Math.ceil(Math.max(0, s.properties.length - 2) / 4)
  if (s.firm.staff.assetMgmt < needAm && s.firm.cash > 2e6) s = act(s, (x) => setStaff(x, 'assetMgmt', 1))
  const size = investingFund(s)?.size ?? 0
  if (size > 400e6 && s.firm.staff.acquisitions < 2 && s.firm.cash > 3e6) s = act(s, (x) => setStaff(x, 'acquisitions', 1))
  if (s.funds.length >= 2 && s.firm.staff.investorRelations < 1 && s.firm.cash > 3e6) s = act(s, (x) => setStaff(x, 'investorRelations', 1))

  // Deals.
  for (const d of s.deals.filter((x) => x.status === 'open')) {
    if (!investingFund(s)) break
    const { plan } = bestPlan(d.asset, s.macro)
    const loan = plan === 'hold' ? 'fixed' : 'bridge'
    // The most it can pay and still clear its hurdle, from the asking price up to the stretch.
    let price = 0
    for (let m = 0.96; m <= o.stretch + 1e-9; m += 0.03) {
      const uw = underwrite(d.asset, s.macro, s.q, { price: d.ask * m, plan, ltv: o.ltv, loan, years: 5 })
      if ((uw.irr ?? -1) >= o.hurdle) price = d.ask * m
    }
    if (!price) continue
    const check = equityCheck(s, d, price, plan, o.ltv, loan)
    if (check.gpShare > s.firm.cash * 0.5) continue
    s = act(s, (x) => placeBid(x, d.id, { price, plan, ltv: o.ltv, loan }))
  }
  for (const d of s.deals.filter((x) => x.status === 'bestfinal')) {
    s = act(s, (x) => bestAndFinal(x, d.id, (d.bid ?? d.ask) * 1.02))
  }
  for (const d of s.deals.filter((x) => x.status === 'contract')) {
    if (!d.asIs && !d.ddDone) s = act(s, (x) => diligence(x, d.id))
    const after = s.deals.find((x) => x.id === d.id)!
    if (after.ddFound.length && !after.retraded) s = act(s, (x) => retrade(x, d.id))
    s = act(s, (x) => closeDeal(x, d.id))
    // A deal it can no longer afford gets dropped.
    const left = s.deals.find((x) => x.id === d.id)
    if (left?.status === 'contract') s = { ...s, deals: s.deals.map((x) => (x.id === d.id ? { ...x, status: 'walked' as const } : x)) }
  }

  // Sell what has been held long enough, or anything in a fund near its end.
  for (const p of [...s.properties]) {
    const fund = s.funds.find((f) => f.id === p.fundId)!
    const old = s.q - p.acquiredQ >= o.holdQuarters && !p.plan
    const ending = s.q >= fund.termEndQ - 2
    if (!old && !ending) continue
    s = act(s, (x) => requestOffers(x, p.id))
    const offer = s.properties.find((x) => x.id === p.id)?.offer
    if (offer && (ending || offer.price >= appraiseHeld(p, s.macro).value * 0.98)) s = act(s, (x) => acceptOffer(x, p.id))
  }

  // The next fund.
  if (canLaunch(s).ok && s.q < s.quarters - 8) {
    const strategy = s.funds[s.funds.length - 1].strategy
    const st = STRATEGIES[strategy]
    s = act(s, (x) => launchRaise(x, { strategy, target: previousSize(x) * 1.8, feeRate: st.fee, carry: st.carry, placementAgent: false }))
  }

  return endQuarter(s).state
}

export function playCareer(state: GameState, o: BotOptions = DEFAULT_BOT): GameState {
  let s = state
  let guard = 0
  while (s.status === 'playing' && guard++ < 200) {
    const next = botQuarter(s, o)
    if (next.q === s.q && next.status === 'playing') {
      // Something blocked the quarter; clear it the blunt way.
      s = { ...next, events: [], deals: next.deals.map((d) => (d.status === 'contract' || d.status === 'bestfinal' ? { ...d, status: 'passed' as const } : d)) }
    } else s = next
  }
  return s
}
