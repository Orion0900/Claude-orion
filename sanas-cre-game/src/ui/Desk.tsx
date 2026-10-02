import { loanTerms } from '../engine/asset'
import { MARKETS, PHASES, TYPES } from '../engine/data'
import { dryPowder, investingFund } from '../engine/funds'
import { aum, decide, pending, quarterLabel } from '../engine/game'
import type { ActionResult, GameEvent, GameState } from '../engine/types'
import { money, ordinal, pct } from '../lib/format'
import { RatesChart } from './Charts'
import { league, repTier } from './Firm'
import { BuildingGlyph, Icon } from './Icons'
import { Chip, Stat, Term } from './Shared'
import { Skyline } from './Skyline'

export type Open =
  | { kind: 'deal'; id: string }
  | { kind: 'asset'; id: string }
  | { kind: 'raise' }
  | { kind: 'markets' }
  | { kind: 'report' }
  | { kind: 'help' }

export function DecisionCard({ s, e, run }: { s: GameState; e: GameEvent; run: (fn: (s: GameState) => ActionResult) => ActionResult }) {
  const p = e.propertyId ? s.properties.find((x) => x.id === e.propertyId) : undefined
  return (
    <article className="card decision">
      <header>
        {p ? <BuildingGlyph type={p.type} size={30} /> : <span className="decision-mark"><Icon name="alert" size={18} /></span>}
        <div>
          <p className="kicker">{p ? `${p.name} · ${MARKETS[p.market].short}` : 'The firm'}</p>
          <h3>{e.title}</h3>
        </div>
      </header>
      <p>{e.body}</p>
      <div className="decision-options">
        {e.options.map((o, i) => (
          <button key={o.label} type="button" className="option" onClick={() => run((x) => decide(x, e.id, i))}>
            <strong>{o.label}</strong>
            <span>{o.hint}</span>
          </button>
        ))}
      </div>
    </article>
  )
}

export function DeskView({ s, run, open, goTo }: {
  s: GameState
  run: (fn: (s: GameState) => ActionResult) => ActionResult
  open: (o: Open) => void
  goTo: (tab: 'deals' | 'portfolio' | 'funds' | 'firm') => void
}) {
  const fund = investingFund(s)
  const value = s.properties.reduce((sum, p) => sum + p.value, 0)
  const leased = value > 0 ? s.properties.reduce((sum, p) => sum + p.occupancy * p.value, 0) / value : 0
  const judged = [...s.funds].reverse().find((f) => s.q - f.vintageQ >= 8 && f.called > 0)
  const { rank, rows } = league(s)
  const waiting = pending(s).filter((x) => x.kind === 'deal')
  const openDeals = s.deals.filter((d) => d.status === 'open')
  const mf = { type: 'multifamily' as const }
  const report = s.reports[0]
  return (
    <div className="view desk">
      <section className="hero">
        <Skyline
          buildings={s.properties.map((p) => ({ id: p.id, type: p.type, value: p.value, size: p.size, occupancy: p.occupancy, building: !!p.plan }))}
          phase={s.macro.phase}
          height={220}
          onPick={(id) => open({ kind: 'asset', id })}
          label={s.properties.length ? `Your ${s.properties.length} buildings, lit by occupancy` : 'An empty lot waiting for your first building'}
        />
        <div className="hero-cap">
          <p className="kicker">{s.firm.name}</p>
          <p className="hero-line">
            <strong>{money(aum(s))}</strong> under management
            {s.properties.length ? (
              <span>
                {' '}· {s.properties.length} building{s.properties.length === 1 ? '' : 's'} · {pct(leased, 0)} leased
              </span>
            ) : (
              <span> · your skyline is an empty lot</span>
            )}
          </p>
        </div>
      </section>

      {s.tombstones.length === 0 && s.q < 6 && (
        <section className="card intro">
          <h2>Your first quarter</h2>
          <ol>
            <li>
              Open <button type="button" className="link-btn" onClick={() => goTo('deals')}>Deals</button> and pick a building. Your model shows what it returns at your price, plan and loan.
            </li>
            <li>Bid. Win, order diligence, close. Off-market and distressed sellers are where the bargains are.</li>
            <li>Make any decisions waiting below, then end the quarter. Rent comes in, the market moves, new deals arrive.</li>
          </ol>
          <p className="aside">
            Raise bigger funds by beating your target return. Tap any <Term t="cap rate">dotted term</Term> for a definition.
          </p>
        </section>
      )}

      {(s.events.length > 0 || waiting.length > 0) && (
        <section>
          <h2 className="section-title">
            Needs a decision <Chip tone="warn" solid>{s.events.length + waiting.length}</Chip>
          </h2>
          <div className="inbox">
            {waiting.map((w) => (
              <button key={w.id} type="button" className="card reminder" onClick={() => open({ kind: 'deal', id: w.id })}>
                <Icon name="deals" />
                <span>{w.label}</span>
                <Icon name="chevron" />
              </button>
            ))}
            {s.events.map((e) => (
              <DecisionCard key={e.id} s={s} e={e} run={run} />
            ))}
          </div>
        </section>
      )}

      <section className="kpis">
        <Stat label="Firm cash" value={money(s.firm.cash)} tone={s.firm.cash < 0 ? 'bad' : undefined} sub={s.firm.brokeQuarters ? 'Out of cash: fix it this quarter' : 'Yours, after salaries'} />
        <Stat label="Dry powder" term="dry powder" value={fund ? money(dryPowder(s, fund)) : '–'} sub={fund ? `${fund.name.replace(s.firm.name + ' ', '')}, buying until ${quarterLabel(fund.investEndQ)}` : 'Raise a fund to keep buying'} />
        <Stat label="Net IRR" term="net irr" value={judged ? pct(judged.netIrr, 1) : 'Too early'} sub={judged ? `${judged.name.replace(s.firm.name + ' ', '')}, ${judged.tvpi.toFixed(2)}x TVPI` : 'Funds are judged after two years'} tone={judged?.netIrr === null || !judged ? undefined : (judged.netIrr ?? 0) >= 0.12 ? 'good' : (judged.netIrr ?? 0) < 0.05 ? 'bad' : 'neutral'} />
        <Stat label="Reputation" value={`${Math.round(s.firm.reputation)}`} sub={repTier(s.firm.reputation)} />
        <Stat label="League table" term="aum" value={`${ordinal(rank)} of ${rows.length}`} sub="By assets under management" />
      </section>

      <div className="desk-grid">
        <section className="card panel-card">
          <div className="card-head">
            <h2 className="section-title">The market</h2>
            <button type="button" className="link-btn" onClick={() => open({ kind: 'markets' })}>
              <Icon name="map" size={16} /> Research
            </button>
          </div>
          <div className="pulse">
            <Chip tone={s.macro.phase === 'recession' ? 'bad' : s.macro.phase === 'late' ? 'warn' : 'good'} solid>
              {PHASES[s.macro.phase].label}
            </Chip>
            <span>{PHASES[s.macro.phase].blurb}</span>
          </div>
          <div className="stat-grid">
            <Stat label="10-year" value={pct(s.macro.tenYear, 2)} />
            <Stat label="Fed funds" value={pct(s.macro.policyRate, 2)} />
            <Stat label="Fixed loan" term="fixed-rate loan" value={pct(loanTerms(s.macro, 'fixed', mf).rate, 2)} />
            <Stat label="Bridge loan" term="bridge loan" value={pct(loanTerms(s.macro, 'bridge', mf).rate, 2)} />
          </div>
          <RatesChart history={s.history} />
        </section>

        <section className="card panel-card">
          <div className="card-head">
            <h2 className="section-title">On the market</h2>
            <button type="button" className="link-btn" onClick={() => goTo('deals')}>
              All {openDeals.length} deals <Icon name="chevron" size={16} />
            </button>
          </div>
          <ul className="mini-deals">
            {openDeals.slice(0, 4).map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => open({ kind: 'deal', id: d.id })}>
                  <BuildingGlyph type={d.asset.type} size={28} />
                  <span>
                    <strong>{d.asset.name}</strong>
                    <small>
                      {TYPES[d.asset.type].label} · {MARKETS[d.asset.market].short}
                    </small>
                  </span>
                  <em>{money(d.ask)}</em>
                </button>
              </li>
            ))}
            {!openDeals.length && <li className="aside">Nothing new. More listings next quarter.</li>}
          </ul>
        </section>

        <section className="card panel-card">
          <div className="card-head">
            <h2 className="section-title">The tape</h2>
            {report && (
              <button type="button" className="link-btn" onClick={() => open({ kind: 'report' })}>
                <Icon name="letter" size={16} /> {quarterLabel(report.q)} letter
              </button>
            )}
          </div>
          <ul className="news">
            {s.news.slice(0, 8).map((n, i) => (
              <li key={i} className={`n-${n.tone}`}>
                <span>{quarterLabel(n.q)}</span>
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
