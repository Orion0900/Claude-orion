/** Selling, refinancing and handing back the keys: the ways a building leaves the books or changes its debt. */
import { appraiseHeld, newLoan, prepayCost, sizeLoan } from './asset'
import { BUYERS, RIVALS } from './data'
import { clamp, irr } from './finance'
import { fundPays, money } from './funds'
import type { Rng } from './rng'
import type { Fund, GameState, LoanKind, Property, SoldRecord, Tone } from './types'

export function fundOf(s: GameState, p: Property): Fund {
  const fund = s.funds.find((f) => f.id === p.fundId)
  if (!fund) throw new Error(`No fund for ${p.name}`)
  return fund
}

export function note(s: GameState, text: string, tone: Tone = 'neutral') {
  s.turn.notes.push({ text, tone })
}

export function logOn(s: GameState, p: Property, text: string, tone: Tone = 'neutral') {
  p.log.unshift({ q: s.q, text, tone })
  if (p.log.length > 12) p.log.length = 12
}

function addPropertyFlow(s: GameState, p: Property, amount: number) {
  const i = Math.max(0, s.q - p.acquiredQ)
  while (p.flows.length <= i) p.flows.push(0)
  p.flows[i] += amount
  if (amount > 0) p.distributions += amount
  else p.equity -= amount
}

/** Cash from a building to its fund (or from the fund into it, when negative). */
export function propertyCash(s: GameState, p: Property, amount: number) {
  const fund = fundOf(s, p)
  if (amount >= 0) fund.cash += amount
  else fundPays(s, fund, -amount)
  addPropertyFlow(s, p, amount)
}

/** The deal's return: what came back over what went in, with what's left valued as of today. */
export function dealReturns(s: GameState, p: Property, equityNow: number): { multiple: number; irr: number | null } {
  const flows = [...p.flows]
  const i = Math.max(0, s.q - p.acquiredQ)
  while (flows.length <= i) flows.push(0)
  flows[i] += equityNow
  return { multiple: p.equity > 0 ? (p.distributions + equityNow) / p.equity : 0, irr: irr(flows) }
}

function removeProperty(s: GameState, p: Property, record: SoldRecord) {
  s.properties = s.properties.filter((x) => x.id !== p.id)
  // Decisions about a building you no longer own go with it.
  s.events = s.events.filter((e) => e.propertyId !== p.id)
  s.sold.push(record)
}

export function sellProperty(s: GameState, p: Property, price: number): SoldRecord {
  const payoff = p.loan ? p.loan.balance + prepayCost(p.loan, s.macro, s.q) : 0
  const net = price * 0.985 - payoff
  propertyCash(s, p, net)
  const returns = dealReturns(s, p, 0)
  const record: SoldRecord = {
    id: p.id, name: p.name, type: p.type, market: p.market, fundId: p.fundId, acquiredQ: p.acquiredQ, soldQ: s.q,
    purchasePrice: p.purchasePrice, salePrice: price, equity: p.equity, proceeds: p.distributions,
    multiple: returns.multiple, irr: returns.irr, foreclosed: false,
  }
  removeProperty(s, p, record)
  s.stats.sales += 1
  const irrText = record.irr === null ? '' : `, a ${(record.irr * 100).toFixed(1)}% IRR`
  note(s, `Sold ${p.name} for ${money(price)}: ${record.multiple.toFixed(2)}x your equity${irrText}.`, record.multiple >= 1 ? 'good' : 'bad')
  s.news.unshift({ q: s.q, text: `${s.firm.name} sells ${p.name} for ${money(price)}.`, tone: record.multiple >= 1 ? 'good' : 'bad', tag: 'deal' })
  return record
}

/** A deed in lieu: the lender takes the building and the debt goes with it. The equity is gone. */
export function foreclose(s: GameState, p: Property): SoldRecord {
  addPropertyFlow(s, p, 0)
  const returns = dealReturns(s, p, 0)
  const record: SoldRecord = {
    id: p.id, name: p.name, type: p.type, market: p.market, fundId: p.fundId, acquiredQ: p.acquiredQ, soldQ: s.q,
    purchasePrice: p.purchasePrice, salePrice: p.loan?.balance ?? 0, equity: p.equity, proceeds: p.distributions,
    multiple: returns.multiple, irr: returns.irr, foreclosed: true,
  }
  removeProperty(s, p, record)
  s.stats.foreclosures += 1
  s.firm.reputation = clamp(s.firm.reputation - 7, 0, 100)
  note(s, `You handed the keys for ${p.name} to the lender. ${money(p.equity)} of equity is gone.`, 'bad')
  s.news.unshift({ q: s.q, text: `${s.firm.name} hands back the keys on ${p.name}.`, tone: 'bad', tag: 'deal' })
  return record
}

export interface RefiQuote {
  kind: LoanKind
  amount: number
  max: number
  rate: number
  payoff: number
  penalty: number
  fees: number
  /** Positive: cash out to the fund. Negative: equity the fund must put in. */
  net: number
}

export function refiQuote(s: GameState, p: Property, kind: LoanKind, ltv: number): RefiQuote {
  const value = appraiseHeld(p, s.macro).value
  const sizing = sizeLoan(p, s.macro, kind, value)
  const amount = Math.max(0, Math.min(ltv * value, sizing.max))
  const penalty = p.loan ? prepayCost(p.loan, s.macro, s.q) : 0
  const payoff = p.loan ? p.loan.balance : 0
  const fees = amount * 0.01
  return { kind, amount, max: sizing.max, rate: sizing.rate, payoff, penalty, fees, net: amount - payoff - penalty - fees }
}

export function refinance(s: GameState, p: Property, quote: RefiQuote) {
  propertyCash(s, p, quote.net)
  p.loan = quote.amount > 0 ? newLoan(s.macro, quote.kind, p, quote.amount, s.q) : null
  s.stats.refis += 1
  const what = quote.amount > 0 ? `a ${money(quote.amount)} ${quote.kind === 'fixed' ? 'fixed-rate' : 'bridge'} loan at ${(quote.rate * 100).toFixed(2)}%` : 'no debt'
  const cash = quote.net >= 0 ? `${money(quote.net)} came back to the fund.` : `The fund put in ${money(-quote.net)}.`
  logOn(s, p, `Refinanced into ${what}.`)
  note(s, `Refinanced ${p.name} into ${what}. ${cash}`, quote.net >= 0 ? 'good' : 'neutral')
}

/** Who turns up to buy, and at what price. */
export function bestOffer(s: GameState, p: Property, rng: Rng): { price: number; buyer: string } {
  const value = appraiseHeld(p, s.macro).value
  const liquidity = s.macro.phase === 'recession' ? 0.95 : s.macro.phase === 'late' ? 1.02 : s.macro.phase === 'expansion' ? 1.01 : 0.98
  const price = value * liquidity * rng.range(0.96, 1.04)
  const rival = RIVALS.filter((r) => r.focus.includes(p.type))
  const buyer = rng.chance(0.4) && rival.length ? rng.pick(rival).name : rng.pick(BUYERS)
  return { price, buyer }
}
