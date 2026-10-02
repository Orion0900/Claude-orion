import { useMemo, useState } from 'react'
import { appraiseHeld, ltvLimit, planSpec, qualityClass, sizeLoan } from '../engine/asset'
import { MARKETS, TYPES } from '../engine/data'
import { roman } from '../engine/funds'
import {
  acceptOffer, handBackKeys, holdingNow, quarterLabel, refinanceProperty, requestOffers, startPlan,
} from '../engine/game'
import { refiQuote } from '../engine/portfolio'
import type { ActionResult, GameState, LoanKind, PlanKind, Property } from '../engine/types'
import { money, mult, pct, rentLabel, signedMoney, sizeLabel } from '../lib/format'
import { BuildingGlyph, Icon } from './Icons'
import { Chip, InputCell, Meter, Segmented, Sheet, Spark, Stat, Term, toneOf } from './Shared'

export function alertsFor(s: GameState, p: Property): Array<{ text: string; tone: 'bad' | 'warn' }> {
  const out: Array<{ text: string; tone: 'bad' | 'warn' }> = []
  if (p.loan) {
    const dscr = p.noi / Math.max(1, p.loan.balance * p.loan.rate)
    if (p.loan.maturityQ - s.q <= 2) out.push({ text: `Loan due ${quarterLabel(p.loan.maturityQ)}`, tone: 'warn' })
    if (p.value < p.loan.balance) out.push({ text: 'Underwater', tone: 'bad' })
    else if (dscr < 1) out.push({ text: 'Not covering interest', tone: 'bad' })
  }
  if (p.lastCashFlow < 0 && !p.plan) out.push({ text: 'Cash-negative', tone: 'warn' })
  return out
}

function PropertyCard({ s, p, onOpen }: { s: GameState; p: Property; onOpen: () => void }) {
  const now = holdingNow(s, p)
  const fund = s.funds.find((f) => f.id === p.fundId)
  return (
    <button type="button" className="card prop-card" onClick={onOpen}>
      <div className="deal-top">
        <BuildingGlyph type={p.type} size={40} />
        <div className="deal-id">
          <h3>{p.name}</h3>
          <p>
            {TYPES[p.type].label} · {MARKETS[p.market].name} · Fund {roman(fund?.number ?? 1)}
          </p>
        </div>
        <Spark values={p.history.map((h) => h.value)} width={72} height={30} tone={toneOf(p.value - (p.history[0]?.value ?? p.value))} />
      </div>
      <div className="deal-nums">
        <div>
          <span>Value</span>
          <strong>{money(p.value)}</strong>
          <small>{signedMoney(p.value - p.purchasePrice)} vs cost</small>
        </div>
        <div>
          <span>Multiple</span>
          <strong className={now.multiple >= 1 ? 'good' : 'bad'}>{mult(now.multiple)}</strong>
          <small>IRR {pct(now.irr, 1)}</small>
        </div>
        <div>
          <span>NOI</span>
          <strong>{money(p.noi)}</strong>
          <small>{pct(p.occupancy, 0)} leased</small>
        </div>
      </div>
      <Meter value={p.occupancy} target={now.occTarget} label={`${p.name} occupancy`} tone={p.occupancy < now.occTarget - 0.1 ? 'warn' : undefined} />
      <div className="deal-tags">
        {p.plan && (
          <Chip tone="info">
            <Icon name="crane" size={14} /> {p.plan.kind === 'valueadd' ? 'Value-add' : 'Repositioning'} {p.plan.elapsed}/{p.plan.quarters}
          </Chip>
        )}
        {p.loan ? <Chip>{p.loan.kind === 'fixed' ? 'Fixed' : 'Bridge'} {pct(p.loan.rate, 2)} · {pct(p.loan.balance / Math.max(1, p.value), 0)} LTV</Chip> : <Chip>No debt</Chip>}
        {alertsFor(s, p).map((a) => (
          <Chip key={a.text} tone={a.tone}>{a.text}</Chip>
        ))}
      </div>
    </button>
  )
}

export function PortfolioView({ s, onOpen }: { s: GameState; onOpen: (id: string) => void }) {
  const value = s.properties.reduce((sum, p) => sum + p.value, 0)
  const debt = s.properties.reduce((sum, p) => sum + (p.loan?.balance ?? 0), 0)
  const noi = s.properties.reduce((sum, p) => sum + p.noi, 0)
  const leased = value > 0 ? s.properties.reduce((sum, p) => sum + p.occupancy * p.value, 0) / value : 0
  const funds = s.funds.filter((f) => s.properties.some((p) => p.fundId === f.id))
  const sold = [...s.sold].reverse()
  return (
    <div className="view">
      <header className="view-head">
        <div>
          <p className="kicker">Asset management</p>
          <h1>Portfolio</h1>
        </div>
      </header>
      <div className="stat-strip">
        <Stat label="Buildings" value={String(s.properties.length)} />
        <Stat label="Gross value" value={money(value)} />
        <Stat label="Debt" term="ltv" value={money(debt)} sub={value ? `${pct(debt / value, 0)} LTV` : undefined} />
        <Stat label="NOI" term="noi" value={money(noi)} sub="Annualized" />
        <Stat label="Leased" term="occupancy" value={pct(leased, 1)} sub="By value" />
      </div>
      {!s.properties.length && <p className="empty">You don't own anything yet. Win a deal and it shows up here, and on your skyline.</p>}
      {funds.map((f) => (
        <section key={f.id}>
          <h2 className="section-title">
            {f.name} <Chip>{f.status === 'investing' ? 'Investing' : f.status === 'harvesting' ? 'Harvesting' : 'Realized'}</Chip>
          </h2>
          <div className="card-grid">
            {s.properties
              .filter((p) => p.fundId === f.id)
              .map((p) => (
                <PropertyCard key={p.id} s={s} p={p} onOpen={() => onOpen(p.id)} />
              ))}
          </div>
        </section>
      ))}
      {sold.length > 0 && (
        <section>
          <h2 className="section-title">Realized</h2>
          <div className="table-scroll">
            <table className="list-table">
              <thead>
                <tr>
                  <th scope="col">Building</th>
                  <th scope="col">Held</th>
                  <th scope="col">Bought</th>
                  <th scope="col">Sold</th>
                  <th scope="col">Multiple</th>
                  <th scope="col">IRR</th>
                </tr>
              </thead>
              <tbody>
                {sold.map((r) => (
                  <tr key={r.id}>
                    <th scope="row">
                      <span className="row-glyph"><BuildingGlyph type={r.type} size={22} /> {r.name}</span>
                    </th>
                    <td>{((r.soldQ - r.acquiredQ) / 4).toFixed(1)} yrs</td>
                    <td>{money(r.purchasePrice)}</td>
                    <td>{r.foreclosed ? 'Foreclosed' : money(r.salePrice)}</td>
                    <td className={r.multiple >= 1 ? 'good' : 'bad'}>{mult(r.multiple)}</td>
                    <td className={(r.irr ?? -1) >= 0 ? 'good' : 'bad'}>{pct(r.irr, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

export function AssetSheet({ s, p, run, onClose }: { s: GameState; p: Property; run: (fn: (s: GameState) => ActionResult) => ActionResult; onClose: () => void }) {
  const ap = appraiseHeld(p, s.macro)
  const now = holdingNow(s, p)
  const fund = s.funds.find((f) => f.id === p.fundId)
  const [refiKind, setRefiKind] = useState<LoanKind>(p.loan?.kind ?? 'fixed')
  const lenderMax = Math.min(ltvLimit(s.macro, refiKind), sizeLoan(p, s.macro, refiKind, ap.value).max / Math.max(1, ap.value))
  const [refiLtv, setRefiLtv] = useState(Math.max(0, Math.min(0.6, lenderMax)))
  const [showRefi, setShowRefi] = useState(false)
  const quote = useMemo(() => refiQuote(s, p, refiKind, Math.min(refiLtv, lenderMax)), [s, p, refiKind, refiLtv, lenderMax])
  const offer = p.offer && p.offer.q === s.q ? p.offer : null
  const dscr = p.loan ? p.noi / Math.max(1, p.loan.balance * p.loan.rate) : null
  const plans: Array<Exclude<PlanKind, 'hold'>> = ['valueadd', 'reposition']

  const saleEquity = offer ? Math.max(0, offer.price * 0.985 - (p.loan ? p.loan.balance + (quote.penalty || 0) : 0)) : 0
  const saleMultiple = offer && p.equity > 0 ? (p.distributions + saleEquity) / p.equity : 0

  return (
    <Sheet
      wide
      onClose={onClose}
      kicker={`${TYPES[p.type].label} · ${MARKETS[p.market].name} · Fund ${roman(fund?.number ?? 1)}`}
      title={
        <span className="title-with-glyph">
          <BuildingGlyph type={p.type} size={34} />
          {p.name}
        </span>
      }
    >
      <section className="panel">
        <div className="spark-row">
          <div>
            <span className="stat-label">Value</span>
            <Spark values={p.history.map((h) => h.value)} width={150} height={40} tone={toneOf(p.value - p.purchasePrice)} />
          </div>
          <div>
            <span className="stat-label">NOI</span>
            <Spark values={p.history.map((h) => h.noi)} width={150} height={40} tone={toneOf(p.noi - (p.history[0]?.noi ?? p.noi))} />
          </div>
          <div>
            <span className="stat-label">Leased</span>
            <Spark values={p.history.map((h) => h.occ)} width={150} height={40} tone={toneOf(p.occupancy - (p.history[0]?.occ ?? p.occupancy))} />
          </div>
        </div>
        <div className="stat-grid">
          <Stat label="Appraised value" value={money(ap.value)} sub={`Bought for ${money(p.purchasePrice)}`} />
          <Stat label="Cap rate" term="cap rate" value={pct(ap.cap, 2)} />
          <Stat label="NOI" term="noi" value={money(p.noi)} sub={`Stabilized ${money(ap.stabNoi)}`} />
          <Stat label="Leased" term="occupancy" value={pct(p.occupancy, 1)} sub={`Market holds ${pct(ap.occTarget, 0)}`} />
          <Stat label="Rent in place" term="loss-to-lease" value={rentLabel(p.inPlaceRent, p)} sub={`Market ${rentLabel(ap.marketRent, p)}`} />
          <Stat label="Quality" term="quality" value={`Class ${qualityClass(p.quality)} · ${Math.round(p.quality)}`} sub={`${sizeLabel(p)}, built ${p.yearBuilt}`} />
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Your investment</h3>
        <div className="stat-grid">
          <Stat label="Equity in" value={money(p.equity)} sub={`Since ${quarterLabel(p.acquiredQ)}`} />
          <Stat label="Cash returned" value={money(p.distributions)} />
          <Stat label="Equity value now" term="nav" value={money(now.equityNow)} />
          <Stat big label="Multiple to date" term="equity multiple" value={mult(now.multiple)} tone={now.multiple >= 1 ? 'good' : 'bad'} />
          <Stat big label="IRR to date" term="irr" value={pct(now.irr, 1)} tone={(now.irr ?? -1) >= 0 ? 'good' : 'bad'} />
          <Stat label="Last quarter's cash" value={signedMoney(p.lastCashFlow)} tone={toneOf(p.lastCashFlow)} />
        </div>
      </section>

      <section className="panel">
        <h3 className="panel-title">Debt</h3>
        {p.loan ? (
          <div className="stat-grid">
            <Stat label={p.loan.kind === 'fixed' ? 'Fixed-rate loan' : 'Bridge loan'} term={p.loan.kind === 'fixed' ? 'fixed-rate loan' : 'bridge loan'} value={money(p.loan.balance)} sub={`${pct(p.loan.balance / Math.max(1, ap.value), 0)} LTV`} />
            <Stat label="Rate" value={pct(p.loan.rate, 2)} sub={p.loan.kind === 'bridge' ? 'Floats with the Fed' : 'Locked'} />
            <Stat label="Coverage" term="dscr" value={dscr === null ? '–' : `${dscr.toFixed(2)}x`} tone={dscr !== null && dscr < 1 ? 'bad' : undefined} />
            <Stat label="Matures" value={quarterLabel(p.loan.maturityQ)} sub={p.loan.kind === 'bridge' ? `${p.loan.extensionsLeft} extension${p.loan.extensionsLeft === 1 ? '' : 's'} left` : undefined} />
          </div>
        ) : (
          <p className="aside">No debt on this building.</p>
        )}
        {!showRefi ? (
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setShowRefi(true)}>
              {p.loan ? 'Refinance' : 'Add a loan'}
            </button>
            {p.loan && ap.value < p.loan.balance * 1.1 && (
              <button type="button" className="btn danger" onClick={() => { run((x) => handBackKeys(x, p.id)); onClose() }}>
                Hand back the keys
              </button>
            )}
          </div>
        ) : (
          <div className="refi">
            <Segmented<LoanKind>
              label="New loan"
              value={refiKind}
              onChange={setRefiKind}
              options={[
                { value: 'fixed', label: 'Fixed, 7 yr', sub: pct(sizeLoan(p, s.macro, 'fixed', ap.value).rate, 2) },
                { value: 'bridge', label: 'Bridge, 3+1+1', sub: pct(sizeLoan(p, s.macro, 'bridge', ap.value).rate, 2) },
              ]}
            />
            <InputCell
              id={`refi-${p.id}`}
              label={<Term t="ltv">Loan-to-value</Term>}
              value={Math.min(refiLtv, lenderMax)}
              min={0}
              max={Math.max(0.01, Math.round(lenderMax * 100) / 100)}
              step={0.01}
              onChange={setRefiLtv}
              format={(v) => (v <= 0 ? 'Pay it off' : `${pct(v, 0)} · ${money(quote.amount)}`)}
            />
            <table className="ledger compact">
              <tbody>
                <tr><th>New loan</th><td>{money(quote.amount)}</td></tr>
                {p.loan && <tr><th>Pay off the old loan</th><td>−{money(quote.payoff)}</td></tr>}
                {quote.penalty > 0 && <tr><th><Term t="yield maintenance">Prepayment penalty</Term></th><td>−{money(quote.penalty)}</td></tr>}
                <tr><th>Lender fees</th><td>−{money(quote.fees)}</td></tr>
                <tr className="total"><th>{quote.net >= 0 ? 'Cash back to the fund' : 'The fund puts in'}</th><td className={quote.net >= 0 ? 'good' : 'bad'}>{money(Math.abs(quote.net))}</td></tr>
              </tbody>
            </table>
            <div className="btn-row">
              <button type="button" className="btn ghost" onClick={() => setShowRefi(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={quote.amount <= 0 && !p.loan}
                onClick={() => {
                  run((x) => refinanceProperty(x, p.id, refiKind, Math.min(refiLtv, lenderMax)))
                  setShowRefi(false)
                }}
              >
                {quote.amount > 0 ? 'Refinance' : 'Pay off the loan'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="panel-title">Business plan</h3>
        {p.plan ? (
          <>
            <p className="aside">
              <Icon name="crane" size={16} /> {p.plan.kind === 'valueadd' ? 'Value-add program' : 'Repositioning'}: quarter {p.plan.elapsed} of {p.plan.quarters}, {money(p.plan.spent)} of {money(p.plan.budget)} spent.
            </p>
            <Meter value={p.plan.elapsed / p.plan.quarters} label="Plan progress" />
          </>
        ) : (
          <div className="plan-options">
            {plans.map((k) => {
              const spec = planSpec(p, s.macro, k)
              return (
                <div key={k} className="plan-option">
                  <div>
                    <strong>{k === 'valueadd' ? 'Value-add program' : 'Full repositioning'}</strong>
                    <p>
                      {spec
                        ? `${money(spec.budget)} over ${spec.quarters} quarters. Quality ${Math.round(p.quality)} → ${Math.round(Math.min(spec.maxQuality, p.quality + spec.qualityGain))}, about ${pct(spec.drag, 0)} offline meanwhile.`
                        : 'Not enough upside left in the building.'}
                    </p>
                  </div>
                  <button type="button" className="btn" disabled={!spec} onClick={() => run((x) => startPlan(x, p.id, k))}>
                    Start
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <h3 className="panel-title">Sell</h3>
        {offer ? (
          <>
            <p className="story">
              Best offer: <strong>{money(offer.price)}</strong> from {offer.buyer}, a {pct(p.noi / offer.price, 2)} cap on today's income. After the loan and costs, about {money(saleEquity)} goes back to the fund: {mult(saleMultiple)} on this deal.
            </p>
            <div className="btn-row">
              <button type="button" className="btn primary" onClick={() => { run((x) => acceptOffer(x, p.id)); onClose() }}>
                Sell for {money(offer.price)}
              </button>
            </div>
            <p className="aside">The offer is good until the end of the quarter.</p>
          </>
        ) : (
          <>
            <p className="aside">
              Call a broker and you'll have a best offer by tonight. Buyers pay up in good times and disappear in bad ones{p.plan ? ', and they pay for a half-finished renovation as it stands' : ''}.
            </p>
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => run((x) => requestOffers(x, p.id))}>
                Get offers
              </button>
            </div>
          </>
        )}
      </section>

      {p.log.length > 0 && (
        <section className="panel">
          <h3 className="panel-title">History</h3>
          <ul className="log">
            {p.log.map((l, i) => (
              <li key={i} className={`n-${l.tone}`}>
                <span>{quarterLabel(l.q)}</span>
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      )}
    </Sheet>
  )
}
