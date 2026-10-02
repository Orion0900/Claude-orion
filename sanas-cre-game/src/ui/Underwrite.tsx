/*
 * The acquisitions model for one deal. Inputs are blue, the way every
 * real estate model marks them; everything else is a formula.
 */
import { useMemo, useState } from 'react'
import { appraise, ltvLimit, planSpec, qualityClass, sizeLoan } from '../engine/asset'
import { MARKETS, SELLERS, TYPES } from '../engine/data'
import { bestPlan } from '../engine/deals'
import { dryPowder, investingFund, singleAssetLimit } from '../engine/funds'
import {
  amSkill, bestAndFinal, closeDeal, diligence, equityCheck, issueImpact, placeBid, retrade, walkAway, withdraw,
  type BidTermsInput,
} from '../engine/game'
import { SENSITIVITY_CAPS, SENSITIVITY_GROWTH, sensitivity, underwrite } from '../engine/underwrite'
import type { ActionResult, Deal, GameState, LoanKind, PlanKind } from '../engine/types'
import { bp, money, mult, pct, perUnit, rentLabel, sizeLabel } from '../lib/format'
import { CashBars } from './Charts'
import { BuildingGlyph } from './Icons'
import { Chip, InputCell, Meter, Segmented, Sheet, Stat, Term } from './Shared'

type Debt = LoanKind | 'none'

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/** What the market whispers about where a deal will trade. A bigger deal team hears it more precisely. */
function guidance(s: GameState, d: Deal): string {
  const acq = s.firm.staff.acquisitions
  if (acq === 0) return 'Nobody on your team has a read on pricing.'
  const width = acq >= 3 ? 0.02 : acq === 2 ? 0.035 : 0.06
  const center = d.clearing / d.ask + (hash(d.id) - 0.5) * width
  const lo = Math.round((center - width / 2) * 100)
  const hi = Math.round((center + width / 2) * 100)
  return `Whispers say it trades at ${lo}–${hi}% of the ask.`
}

export function UnderwriteSheet({ s, deal, run, onClose, onViewProperty }: {
  s: GameState
  deal: Deal
  run: (fn: (s: GameState) => ActionResult) => ActionResult
  onClose: () => void
  onViewProperty: (id: string) => void
}) {
  const a = deal.asset
  const spec = TYPES[a.type]
  const locked = deal.status !== 'open'
  const suggestion = useMemo(() => bestPlan(a, s.macro).plan, [a, s.macro])
  const [ratio, setRatio] = useState(deal.terms ? deal.terms.price / deal.ask : 1)
  const [plan, setPlan] = useState<PlanKind>(deal.terms?.plan ?? suggestion)
  const [debt, setDebt] = useState<Debt>(deal.terms ? (deal.terms.ltv > 0 ? deal.terms.loan : 'none') : suggestion === 'hold' ? 'fixed' : 'bridge')
  const [ltv, setLtv] = useState(deal.terms?.ltv ?? 0.6)
  const [years, setYears] = useState(5)
  const [finalRatio, setFinalRatio] = useState((deal.bid ?? deal.ask) / deal.ask + 0.02)

  const price = locked && deal.bid !== null ? deal.bid : Math.round((deal.ask * ratio) / 1e4) * 1e4
  const kind: LoanKind = debt === 'none' ? 'fixed' : debt
  const useLtv = debt === 'none' ? 0 : ltv
  const ap = appraise(a, s.macro)
  const fund = investingFund(s)
  const powder = fund ? dryPowder(s, fund) : 0
  const skill = amSkill(s)

  const model = useMemo(() => {
    const net = price - deal.credit
    const extra = (deal.ddDone ? deal.ddCost : 0) + deal.ddFound.reduce((sum, i) => sum + i.cost, 0)
    const input = { price: net, plan, ltv: useLtv, loan: kind, years, skill, extraCosts: extra }
    return {
      uw: underwrite(a, s.macro, s.q, input),
      grid: sensitivity(a, s.macro, s.q, input),
      check: equityCheck(s, deal, price, plan, useLtv, kind),
      sizing: sizeLoan(a, s.macro, kind, net),
    }
  }, [a, s, deal, price, plan, useLtv, kind, years, skill])
  const { uw, grid, check, sizing } = model

  const plans: PlanKind[] = ['hold', 'valueadd', 'reposition']
  const planInfo = (p: PlanKind) => planSpec(a, s.macro, p)
  const chosen = planInfo(plan)
  const lenderMax = Math.min(ltvLimit(s.macro, kind), sizing.max / Math.max(1, price))
  const overPowder = !!fund && check.total > powder + 1
  const overLimit = !!fund && check.total > singleAssetLimit(fund) + 1

  const terms: BidTermsInput = { price, plan, ltv: useLtv, loan: kind }
  const act = (fn: (x: GameState) => ActionResult) => run(fn)

  const footer = (() => {
    switch (deal.status) {
      case 'open':
        return (
          <>
            {(!fund || overPowder || overLimit) && (
              <p className="foot-note">
                {!fund ? 'No fund is investing. Raise one first.' : overPowder ? `Needs ${money(check.total)}; ${fund.name} has ${money(powder)} left.` : `Needs ${money(check.total)}, over the 30% single-asset limit. Bid less, borrow more or pick a lighter plan.`}
              </p>
            )}
            <button type="button" className="btn ghost" onClick={() => { act((x) => withdraw(x, deal.id)); onClose() }}>
              Pass
            </button>
            <button type="button" className="btn primary" disabled={!fund || overPowder || overLimit} onClick={() => act((x) => placeBid(x, deal.id, terms))}>
              Submit bid · {money(price)}
            </button>
          </>
        )
      case 'bestfinal': {
        const finalPrice = Math.round((deal.ask * finalRatio) / 1e4) * 1e4
        return (
          <>
            <button type="button" className="btn ghost" onClick={() => act((x) => withdraw(x, deal.id))}>
              Withdraw
            </button>
            <button type="button" className="btn primary" onClick={() => act((x) => bestAndFinal(x, deal.id, finalPrice))}>
              Best and final · {money(finalPrice)}
            </button>
          </>
        )
      }
      case 'contract':
        return (
          <>
            <button type="button" className="btn ghost" onClick={() => act((x) => walkAway(x, deal.id))}>
              Walk away
            </button>
            {!deal.asIs && !deal.ddDone && (
              <button type="button" className="btn" onClick={() => act((x) => diligence(x, deal.id))}>
                Order diligence · {money(deal.ddCost)}
              </button>
            )}
            {deal.ddFound.length > 0 && !deal.retraded && (
              <button type="button" className="btn" onClick={() => act((x) => retrade(x, deal.id))}>
                Re-trade
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const r = act((x) => closeDeal(x, deal.id))
                const id = r.state.deals.find((x) => x.id === deal.id)?.propertyId
                if (id) onViewProperty(id)
              }}
            >
              {deal.ddDone || deal.asIs ? 'Close' : 'Close as-is'} · {money(check.equity)} equity
            </button>
          </>
        )
      case 'closed': {
        const id = deal.propertyId
        return id && s.properties.some((x) => x.id === id) ? (
          <button type="button" className="btn primary" onClick={() => onViewProperty(id)}>
            See the building
          </button>
        ) : null
      }
      default:
        return null
    }
  })()

  return (
    <Sheet
      wide
      onClose={onClose}
      kicker={`${spec.label} · ${MARKETS[a.market].name}`}
      title={
        <span className="title-with-glyph">
          <BuildingGlyph type={a.type} size={34} />
          {a.name}
        </span>
      }
      footer={footer}
    >
      <StatusBanner s={s} deal={deal} />

      <section className="panel">
        <h3 className="panel-title">The building</h3>
        <div className="stat-grid">
          <Stat label="Size" value={sizeLabel(a)} sub={`Built ${a.yearBuilt}`} />
          <Stat label="Quality" term="quality" value={`Class ${qualityClass(a.quality)} · ${Math.round(a.quality)}`} sub={`Could reach ${a.maxQuality}`} />
          <Stat label="Leased" term="occupancy" value={pct(a.occupancy, 1)} sub={`Market holds ${pct(ap.occTarget, 0)}`} />
          <Stat label="Rent in place" term="loss-to-lease" value={rentLabel(a.inPlaceRent, a)} sub={`Market ${rentLabel(ap.marketRent, a)}`} />
          <Stat label="NOI in place" term="noi" value={money(ap.noi)} sub={`Stabilized ${money(ap.stabNoi)}`} />
          <Stat label="Market cap rate" term="cap rate" value={pct(ap.cap, 2)} sub={`Appraised ${money(ap.value)}`} />
        </div>
        <Meter value={a.occupancy} target={ap.occTarget} label="Occupancy against what the market will lease" />
      </section>

      <section className="panel">
        <h3 className="panel-title">The seller</h3>
        <p className="story">{deal.story}</p>
        <div className="chip-row">
          <Chip tone="info">{SELLERS[deal.seller].label}</Chip>
          <Chip>{deal.bidders === 1 ? '1 other bidder' : `${deal.bidders} other bidders`}</Chip>
          {deal.asIs && <Chip tone="warn"><Term t="as-is">As-is, no diligence</Term></Chip>}
        </div>
        <p className="aside">
          Asking {money(deal.ask)} ({perUnit(deal.ask, a)}). {guidance(s, deal)} The broker's pro forma shows a {pct(deal.brokerIrr, 1)} IRR. Every offering memorandum has one.
        </p>
      </section>

      <section className="panel model">
        <h3 className="panel-title">
          Your model <span className="input-key">Blue = your inputs</span>
        </h3>
        {deal.status === 'bestfinal' ? (
          <InputCell
            id={`final-${deal.id}`}
            label="Best and final offer"
            value={finalRatio}
            min={(deal.bid ?? deal.ask) / deal.ask}
            max={(deal.bid ?? deal.ask) / deal.ask + 0.1}
            step={0.0025}
            onChange={setFinalRatio}
            format={(v) => `${money(deal.ask * v)} · ${pct(v, 1)} of ask`}
          />
        ) : (
          <InputCell
            id={`bid-${deal.id}`}
            label="Your bid"
            value={locked ? price / deal.ask : ratio}
            min={0.85}
            max={1.25}
            step={0.005}
            onChange={(v) => !locked && setRatio(v)}
            format={(v) => `${money(locked ? price : deal.ask * v)} · ${pct(locked ? price / deal.ask : v, 1)} of ask`}
          />
        )}
        <fieldset className="field" disabled={locked}>
          <legend>
            Business plan{suggestion !== 'hold' && !locked && <span className="hint"> · your analyst suggests {suggestion === 'valueadd' ? 'value-add' : 'repositioning'}</span>}
          </legend>
          <Segmented<PlanKind>
            label="Business plan"
            value={plan}
            onChange={setPlan}
            options={plans.map((p) => {
              const info = planInfo(p)
              return {
                value: p,
                label: p === 'hold' ? 'Hold' : p === 'valueadd' ? 'Value-add' : 'Reposition',
                sub: p === 'hold' ? 'Maintain' : info ? money(info.budget) : 'No upside',
                disabled: p !== 'hold' && !info,
              }
            })}
          />
          <p className="field-note">
            {chosen
              ? `${chosen.quarters} quarters and ${money(chosen.budget)} to take quality from ${Math.round(a.quality)} to ${Math.round(Math.min(chosen.maxQuality, a.quality + chosen.qualityGain))}, with about ${pct(chosen.drag, 0)} of the building offline while the work goes on.`
              : 'Keep the building running and collect the income. Quality slips a little every year.'}{' '}
            <Term t={plan === 'reposition' ? 'repositioning' : 'value-add'}>What's this?</Term>
          </p>
        </fieldset>
        <fieldset className="field" disabled={locked}>
          <legend>Debt</legend>
          <Segmented<Debt>
            label="Debt"
            value={debt}
            onChange={setDebt}
            options={[
              { value: 'fixed', label: 'Fixed, 7 yr', sub: pct(sizeLoan(a, s.macro, 'fixed', price).rate, 2) },
              { value: 'bridge', label: 'Bridge, 3+1+1', sub: pct(sizeLoan(a, s.macro, 'bridge', price).rate, 2) },
              { value: 'none', label: 'All cash', sub: 'No loan' },
            ]}
          />
          {debt !== 'none' && (
            <InputCell
              id={`ltv-${deal.id}`}
              label={<Term t="ltv">Loan-to-value</Term>}
              value={Math.min(ltv, Math.max(0.05, lenderMax))}
              min={0.05}
              max={Math.max(0.05, Math.round(lenderMax * 100) / 100)}
              step={0.01}
              onChange={(v) => !locked && setLtv(v)}
              format={(v) => `${pct(v, 0)} · ${money(check.loan)}`}
            />
          )}
          {debt !== 'none' && (
            <p className="field-note">
              Lenders will go to {pct(lenderMax, 0)}
              {sizing.limitedBy !== 'ltv' && (
                <>
                  , held back by <Term t={sizing.limitedBy === 'dscr' ? 'dscr' : 'debt yield'}>{sizing.limitedBy === 'dscr' ? 'coverage' : 'debt yield'}</Term>
                </>
              )}
              . <Term t={debt === 'fixed' ? 'fixed-rate loan' : 'bridge loan'}>How this loan works</Term>
            </p>
          )}
        </fieldset>
        <fieldset className="field">
          <legend>Hold period for the model</legend>
          <Segmented<string> label="Hold period" value={String(years)} onChange={(v) => setYears(Number(v))} options={[3, 5, 7].map((y) => ({ value: String(y), label: `${y} years` }))} />
        </fieldset>
      </section>

      <section className="panel">
        <h3 className="panel-title">Sources and uses</h3>
        <div className="su">
          <table className="ledger">
            <caption>Uses</caption>
            <tbody>
              <tr><th>Purchase price{deal.credit > 0 ? ' (after credit)' : ''}</th><td>{money(check.price)}</td></tr>
              <tr><th>Closing costs</th><td>{money(check.closing)}</td></tr>
              {check.knownCosts > 0 && <tr><th>Known repairs</th><td>{money(check.knownCosts)}</td></tr>}
              <tr><th>Business plan reserve</th><td>{money(check.planBudget)}</td></tr>
              <tr className="total"><th>Total</th><td>{money(check.price + check.closing + check.knownCosts + check.planBudget)}</td></tr>
            </tbody>
          </table>
          <table className="ledger">
            <caption>Sources</caption>
            <tbody>
              <tr><th>Senior loan</th><td>{money(check.loan)}</td></tr>
              <tr><th>Fund equity</th><td>{money(check.total)}</td></tr>
              <tr className="sub"><th>Your 2% <Term t="gp commitment">GP share</Term></th><td>{money(check.gpShare)}</td></tr>
              <tr className="total"><th>Total</th><td>{money(check.loan + check.total)}</td></tr>
            </tbody>
          </table>
        </div>
        {fund ? (
          <p className={overPowder || overLimit ? 'warning' : 'aside'}>
            {overPowder
              ? `${fund.name} has only ${money(powder)} of dry powder left.`
              : overLimit
                ? `More than 30% of ${fund.name} in one building. The LPA won't allow it.`
                : `Uses ${pct(check.total / Math.max(1, powder), 0)} of ${fund.name}'s ${money(powder)} of dry powder.`}
          </p>
        ) : (
          <p className="warning">No fund is investing. Raise your next fund before you bid.</p>
        )}
      </section>

      <section className="panel">
        <h3 className="panel-title">Returns, {years}-year hold</h3>
        <div className="stat-grid returns">
          <Stat big label="Levered IRR" term="levered irr" value={pct(uw.irr, 1)} tone={(uw.irr ?? -1) >= 0.15 ? 'good' : (uw.irr ?? -1) < 0.08 ? 'bad' : 'neutral'} />
          <Stat big label="Equity multiple" term="equity multiple" value={mult(uw.multiple)} sub={`Profit ${money(uw.profit)}`} />
          <Stat label="Going-in cap" term="going-in cap" value={pct(uw.entryCap, 2)} />
          <Stat label="Yield on cost" value={pct(uw.yieldOnCost, 2)} sub="Stabilized NOI over all-in cost" />
          <Stat label="Year-one DSCR" term="dscr" value={uw.dscr === null ? 'No debt' : `${uw.dscr.toFixed(2)}x`} tone={uw.dscr !== null && uw.dscr < 1 ? 'bad' : undefined} />
          <Stat label="Exit" term="exit cap" value={money(uw.exitValue)} sub={`At a ${pct(uw.exitCap, 2)} cap`} />
        </div>
        <CashBars years={uw.years} sale={uw.sale} />
        <div className="table-scroll">
          <table className="sens">
            <caption>
              Levered IRR by <Term t="exit cap">exit cap</Term> (across) and rent growth (down)
            </caption>
            <thead>
              <tr>
                <th />
                {SENSITIVITY_CAPS.map((c) => (
                  <th key={c} scope="col">{c === 0 ? 'Entry cap' : bp(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, i) => (
                <tr key={SENSITIVITY_GROWTH[i]}>
                  <th scope="row">{SENSITIVITY_GROWTH[i] === 0 ? 'Base' : `${SENSITIVITY_GROWTH[i] > 0 ? '+' : '−'}1% a year`}</th>
                  {row.map((v, j) => (
                    <td key={j} className={`${i === 1 && j === 1 ? 'base ' : ''}${(v ?? -1) >= 0.15 ? 'good' : (v ?? -1) < 0.08 ? 'bad' : ''}`}>
                      {pct(v, 1)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="aside">The house view holds today's rates, lets rent growth fade to its long-run trend and sells 25 bp wider than today. The market will do something else.</p>
      </section>
    </Sheet>
  )
}

function StatusBanner({ s, deal }: { s: GameState; deal: Deal }) {
  if (deal.status === 'lost')
    return (
      <p className="banner bad">
        Lost to {deal.lostTo} at {money(deal.lostAt ?? 0)}, {pct((deal.lostAt ?? 0) / deal.ask, 1)} of the ask.
      </p>
    )
  if (deal.status === 'bestfinal') return <p className="banner warn">You're close. The broker wants best and final offers from the last few bidders. One more shot.</p>
  if (deal.status === 'passed' || deal.status === 'walked') return <p className="banner">You passed on this one.</p>
  if (deal.status === 'closed') return <p className="banner good">Closed. It's in your portfolio.</p>
  if (deal.status !== 'contract') return null
  return (
    <div className="banner good">
      <p>
        Under contract at {money(deal.bid ?? 0)}
        {deal.credit > 0 ? `, less a ${money(deal.credit)} credit` : ''}.{' '}
        {deal.asIs
          ? 'It sells as-is: close it or walk away.'
          : deal.ddDone
            ? deal.ddFound.length
              ? 'Diligence found problems:'
              : 'Diligence came back clean.'
            : 'Order diligence to look for problems, or close as-is and hope.'}
      </p>
      {deal.ddFound.length > 0 && (
        <ul className="issues">
          {deal.ddFound.map((i, n) => (
            <li key={n}>
              {i.label}. <strong>About {money(issueImpact(s, deal, i))}</strong> off the value.
            </li>
          ))}
        </ul>
      )}
      {deal.retraded && deal.ddFound.length > 0 && <p className="aside">{deal.credit > 0 ? 'The seller agreed to the re-trade.' : 'The seller refused to re-trade.'}</p>}
    </div>
  )
}
