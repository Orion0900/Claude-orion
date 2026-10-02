import { describe, expect, it } from 'vitest'
import { appraise, noiAt } from './asset'
import { botQuarter, playCareer } from './bot'
import { investingFund } from './funds'
import { closeDeal, decide, endQuarter, equityCheck, newGame, pending, placeBid, score, type NewGameOptions } from './game'
import { underwrite } from './underwrite'
import type { GameState } from './types'

const OPTIONS: NewGameOptions = { firmName: 'Sana Capital Partners', founder: 'Sana', difficulty: 'normal', years: 10, strategy: 'valueadd', seed: 11 }

/** Every number anywhere in the state is a real number. */
function badNumbers(value: unknown, path = 'state', out: string[] = []): string[] {
  if (typeof value === 'number' && !Number.isFinite(value)) out.push(path)
  else if (Array.isArray(value)) value.forEach((v, i) => badNumbers(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) badNumbers(v, `${path}.${k}`, out)
  return out
}

/** Buys the first deal the fund can afford, paying well over what any rival would. */
function buyOne(s: GameState): GameState {
  for (const d of s.deals) {
    const price = Math.max(d.ask, d.clearing) * 1.05
    const check = equityCheck(s, d, price, 'hold', 0.6, 'fixed')
    if (check.total > (investingFund(s)?.size ?? 0) * 0.3) continue
    const bid = placeBid(s, d.id, { price, plan: 'hold', ltv: 0.6, loan: 'fixed' })
    if (bid.state.deals.find((x) => x.id === d.id)?.status !== 'contract') continue
    return closeDeal(bid.state, d.id).state
  }
  throw new Error('No affordable deal in the pipeline')
}

describe('a new career', () => {
  it('opens with Fund I, some cash and a pipeline of deals', () => {
    const s = newGame(OPTIONS)
    expect(s.funds).toHaveLength(1)
    expect(s.funds[0].size).toBe(150e6)
    expect(s.funds[0].name).toBe('Sana Capital Partners Fund I')
    expect(s.firm.cash).toBe(3.5e6)
    expect(s.deals.length).toBeGreaterThanOrEqual(4)
    expect(badNumbers(s)).toEqual([])
  })

  it('replays exactly from the same seed', () => {
    let a = newGame(OPTIONS)
    let b = newGame(OPTIONS)
    for (let i = 0; i < 8; i++) {
      a = botQuarter(a)
      b = botQuarter(b)
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('survives a save and a load', () => {
    const s = botQuarter(botQuarter(newGame(OPTIONS)))
    const loaded = JSON.parse(JSON.stringify(s)) as GameState
    expect(endQuarter(loaded).state).toEqual(endQuarter(s).state)
  })
})

describe('the market', () => {
  it('prices buildings near real cap rates', () => {
    const s = newGame(OPTIONS)
    for (const d of s.deals) {
      const ap = appraise(d.asset, s.macro)
      expect(ap.cap).toBeGreaterThan(0.04)
      expect(ap.cap).toBeLessThan(0.11)
      expect(d.ask / ap.value).toBeGreaterThan(0.7)
      expect(d.ask / ap.value).toBeLessThan(1.4)
    }
  })

  it('makes a renovation pay for itself on a tired building', () => {
    const s = newGame(OPTIONS)
    const d = s.deals.find((x) => x.asset.maxQuality - x.asset.quality > 20)
    if (!d) return
    const hold = underwrite(d.asset, s.macro, 0, { price: d.ask, plan: 'hold', ltv: 0, loan: 'fixed', years: 5 })
    const reno = underwrite(d.asset, s.macro, 0, { price: d.ask, plan: 'valueadd', ltv: 0, loan: 'fixed', years: 5 })
    expect(reno.exitValue).toBeGreaterThan(hold.exitValue)
  })

  it('caps a fixed-rate loan at what the income can cover', () => {
    const s = newGame(OPTIONS)
    for (const d of s.deals) {
      const check = equityCheck(s, d, d.ask, 'hold', 0.75, 'fixed')
      const noi = noiAt(d.asset, s.macro)
      expect(check.loan).toBeLessThanOrEqual(Math.max(0, noi / (1.25 * check.rate)) + 1)
    }
  })
})

describe('buying a building', () => {
  it('calls the equity from the fund and the GP pays its 2%', () => {
    const s0 = newGame(OPTIONS)
    const s = buyOne(s0)
    const fund = s.funds[0]
    expect(s.properties).toHaveLength(1)
    expect(s.tombstones).toHaveLength(1)
    expect(fund.called).toBeCloseTo(s.properties[0].equity, 0)
    expect(s0.firm.cash - s.firm.cash).toBeCloseTo(fund.called * 0.02, 0)
  })

  it('refuses a deal bigger than the fund allows', () => {
    const s = newGame(OPTIONS)
    const d = s.deals[0]
    const result = placeBid(s, d.id, { price: 1e9, plan: 'hold', ltv: 0, loan: 'fixed' })
    expect(result.state).toBe(s)
    expect(result.tone).toBe('bad')
  })
})

describe('the quarter', () => {
  it('waits for decisions before it ends', () => {
    const s0 = newGame(OPTIONS)
    const s: GameState = {
      ...s0,
      events: [{ id: 'e1', kind: 'press', q: 0, title: 'A test decision', body: '', options: [{ label: 'OK', hint: '', effect: { rep: 1 } }] }],
    }
    expect(pending(s)).toHaveLength(1)
    expect(endQuarter(s).state).toBe(s)
    const decided = decide(s, 'e1', 0).state
    expect(decided.firm.reputation).toBe(s.firm.reputation + 1)
    expect(endQuarter(decided).state.q).toBe(1)
  })

  it('collects rent, pays the loan and charges the fee', () => {
    const s = buyOne(newGame(OPTIONS))
    const next = endQuarter(s).state
    const report = next.reports[0]
    expect(report.fees).toBeCloseTo((150e6 * 0.015) / 4, 0)
    expect(next.properties[0].history.length).toBe(2)
    expect(next.funds[0].curve.length).toBeGreaterThanOrEqual(2)
  })
})

describe('a whole career', () => {
  it('runs to retirement with every number intact', () => {
    const s = playCareer(newGame({ ...OPTIONS, seed: 5 }))
    expect(s.status).toBe('ended')
    expect(s.endReason).toBe('retired')
    expect(s.q).toBe(40)
    expect(badNumbers(s)).toEqual([])
    expect(s.tombstones.length).toBeGreaterThan(3)
    const result = score(s)
    expect(result.netWorth).toBeGreaterThan(0)
    expect(result.title).toBeTruthy()
  })

  it('ends the career when the firm runs out of money', () => {
    let s = newGame({ ...OPTIONS, seed: 9 })
    s = { ...s, firm: { ...s.firm, cash: -1e6, staff: { acquisitions: 12, assetMgmt: 12, investorRelations: 12, research: 12 } } }
    s = endQuarter(s).state
    s = endQuarter({ ...s, events: [] }).state
    expect(s.status).toBe('ended')
    expect(s.endReason).toBe('bankrupt')
  })
})
