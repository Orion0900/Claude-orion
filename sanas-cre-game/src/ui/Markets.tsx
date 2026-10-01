import { useState } from 'react'
import { capRate, loanTerms, occupancyTarget } from '../engine/asset'
import { MARKETS, MARKET_ORDER, PHASES, PHASE_ORDER, TYPES, TYPE_ORDER } from '../engine/data'
import { comboGrowth, localStories, recessionOdds } from '../engine/macro'
import type { Asset, GameState, MarketId, PropertyType } from '../engine/types'
import { money, pct } from '../lib/format'
import { RatesChart } from './Charts'
import { BuildingGlyph } from './Icons'
import { Sheet, Stat, Term } from './Shared'
import { UsMap } from './UsMap'

/** An average building, for quoting market-wide numbers. */
function typical(type: PropertyType, market: MarketId): Asset {
  return {
    name: '', type, market, size: TYPES[type].sizeMin, count: 1, yearBuilt: 2000, quality: 60, maxQuality: 82,
    occupancy: 0.9, inPlaceRent: 0, opexAdj: 1, concentration: 0, premium: 1, hidden: [],
  }
}

/** The national average across markets, weighted by where each sector trades. */
function national(type: PropertyType, fn: (m: MarketId) => number): number {
  let total = 0
  let weights = 0
  for (const m of MARKET_ORDER) {
    const w = MARKETS[m].weights[type] ?? 1
    total += fn(m) * w
    weights += w
  }
  return total / weights
}

export function CycleDial({ s }: { s: GameState }) {
  return (
    <ol className="cycle" aria-label="Business cycle">
      {PHASE_ORDER.map((p) => (
        <li key={p} className={`${p === s.macro.phase ? 'now ' : ''}c-${p}`} aria-current={p === s.macro.phase ? 'step' : undefined}>
          {PHASES[p].label}
        </li>
      ))}
    </ol>
  )
}

export function MarketsSheet({ s, onClose }: { s: GameState; onClose: () => void }) {
  const research = s.firm.staff.research
  const [market, setMarket] = useState<MarketId | null>(null)
  const exposure: Partial<Record<MarketId, number>> = {}
  for (const p of s.properties) exposure[p.market] = (exposure[p.market] ?? 0) + p.value
  const mf = typical('multifamily', 'dal')
  const fixed = loanTerms(s.macro, 'fixed', mf)
  const bridge = loanTerms(s.macro, 'bridge', mf)
  const odds = recessionOdds(s.macro)
  return (
    <Sheet wide onClose={onClose} kicker="Research" title="The market">
      <section className="panel">
        <h3 className="panel-title">The cycle</h3>
        <CycleDial s={s} />
        <p className="story">{PHASES[s.macro.phase].blurb}</p>
        <p className="aside">
          {research >= 2
            ? `Your research team puts the odds of a recession in the next year at ${pct(odds, 0)}.`
            : 'Hire a second research analyst to get recession odds.'}
        </p>
      </section>

      <section className="panel">
        <h3 className="panel-title">Rates and credit</h3>
        <div className="stat-grid">
          <Stat label="10-year Treasury" value={pct(s.macro.tenYear, 2)} />
          <Stat label="Fed funds" value={pct(s.macro.policyRate, 2)} />
          <Stat label="Fixed-rate loan" term="fixed-rate loan" value={pct(fixed.rate, 2)} sub="Apartments, 7 years" />
          <Stat label="Bridge loan" term="bridge loan" value={pct(bridge.rate, 2)} sub="Floating" />
          <Stat label="Lenders' max LTV" term="ltv" value={pct(s.macro.maxLtv, 0)} />
          <Stat label="Inflation" value={pct(s.macro.inflation, 1)} />
        </div>
        <RatesChart history={s.history} />
      </section>

      <section className="panel">
        <h3 className="panel-title">Sectors</h3>
        <div className="table-scroll">
          <table className="list-table">
            <thead>
              <tr>
                <th scope="col">Sector</th>
                <th scope="col">
                  <Term t="cap rate">Cap rate</Term>
                </th>
                <th scope="col">Growth</th>
                <th scope="col">
                  <Term t="occupancy">Leased</Term>
                </th>
              </tr>
            </thead>
            <tbody>
              {TYPE_ORDER.map((t) => (
                <tr key={t}>
                  <th scope="row">
                    <span className="row-glyph">
                      <BuildingGlyph type={t} size={22} /> {TYPES[t].label}
                    </span>
                  </th>
                  <td>{pct(national(t, (m) => capRate(typical(t, m), s.macro)), 2)}</td>
                  <td className={s.macro.sectors[t].growth >= 0 ? 'good' : 'bad'}>{pct(s.macro.sectors[t].growth, 1)}</td>
                  <td>{pct(national(t, (m) => occupancyTarget(typical(t, m), s.macro)), 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aside">Class B buildings in an average market. Growth is national rent growth this quarter, annualized; leased is what the market will hold.</p>
      </section>

      <section className="panel">
        <h3 className="panel-title">Storylines</h3>
        {research >= 1 ? (
          <ul className="stories">
            {s.macro.storylines.map((st) => (
              <li key={st.id + (st.markets?.join() ?? '')} className={st.growth >= 0 ? 'good' : 'bad'}>
                <strong>{st.title}</strong>
                <span>
                  {st.sector === 'all' ? 'Every sector' : TYPES[st.sector].label}
                  {st.markets ? ` in ${st.markets.map((m) => MARKETS[m].name).join(', ')}` : ', nationwide'}
                  {research >= 2 ? ` · about ${st.quartersLeft} more quarter${st.quartersLeft === 1 ? '' : 's'}` : ''}
                </span>
              </li>
            ))}
            {!s.macro.storylines.length && <li>No big stories right now. Fundamentals rule.</li>}
          </ul>
        ) : (
          <p className="aside">Hire a research analyst to track the stories moving each sector.</p>
        )}
      </section>

      <section className="panel">
        <h3 className="panel-title">Markets</h3>
        <UsMap exposure={exposure} onPick={setMarket} selected={market} />
        {market ? (
          <MarketDetail s={s} m={market} />
        ) : (
          <p className="aside">The dots are your exposure by value. Tap a market for its numbers.</p>
        )}
      </section>
    </Sheet>
  )
}

function MarketDetail({ s, m }: { s: GameState; m: MarketId }) {
  const spec = MARKETS[m]
  const owned = s.properties.filter((p) => p.market === m)
  const stories = s.firm.staff.research >= 1 ? TYPE_ORDER.flatMap((t) => localStories(s.macro, t, m)).filter((st, i, all) => all.indexOf(st) === i) : []
  return (
    <div className="market-detail">
      <h4>
        {spec.name} <small>{spec.region}</small>
      </h4>
      <div className="table-scroll">
        <table className="list-table compact">
          <thead>
            <tr>
              <th scope="col">Sector</th>
              <th scope="col">Cap rate</th>
              <th scope="col">Rent growth</th>
            </tr>
          </thead>
          <tbody>
            {TYPE_ORDER.filter((t) => (spec.weights[t] ?? 1) >= 0.5).map((t) => (
              <tr key={t}>
                <th scope="row">{TYPES[t].label}</th>
                <td>{pct(capRate(typical(t, m), s.macro), 2)}</td>
                <td className={comboGrowth(s.macro, t, m) >= 0 ? 'good' : 'bad'}>{pct(comboGrowth(s.macro, t, m), 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {stories.map((st) => (
        <p key={st.id} className={`story ${st.growth >= 0 ? 'good' : 'bad'}`}>
          {st.title}.
        </p>
      ))}
      <p className="aside">
        {owned.length ? `You own ${owned.length} building${owned.length === 1 ? '' : 's'} here worth ${money(owned.reduce((a, p) => a + p.value, 0))}.` : 'You own nothing here yet.'}
        {spec.hurricane ? ' Hurricane country: insurance is expensive and storms happen.' : ''}
        {spec.rentControl ? ' Rent regulation is always on the ballot.' : ''}
      </p>
    </div>
  )
}
