import { useMemo, useState } from 'react'
import { STRATEGIES } from '../engine/data'
import {
  canLaunch, creditLimit, demandLabel, dryPowder, previousSize, raiseDemand, reservedCapex, roman, trackRecord, type RaiseTerms,
} from '../engine/funds'
import { holdFinalClose, launchRaise, quarterLabel } from '../engine/game'
import type { ActionResult, Fund, GameState, Strategy } from '../engine/types'
import { money, mult, pct } from '../lib/format'
import { JCurve } from './Charts'
import { Icon } from './Icons'
import { Chip, InputCell, Meter, Sheet, Stat, Term } from './Shared'

function WaterfallSteps({ f }: { f: Fund }) {
  const capitalBack = Math.min(1, f.distributed / Math.max(1, f.called))
  const prefMet = f.called > 0 && f.hurdle <= 1
  const profit = f.distributed - f.called
  const owed = profit > 0 ? (f.carry / (1 - f.carry)) * profit : 0
  const caughtUp = prefMet && f.carryPaid >= owed * 0.999 && f.carryPaid > 0
  const steps = [
    { name: 'Return of capital', done: capitalBack >= 0.999, detail: `${pct(capitalBack, 0)} of ${money(f.called)} returned` },
    { name: `${pct(f.pref, 0)} preferred return`, done: prefMet, detail: prefMet ? 'Paid' : `${money(f.hurdle)} still owed to LPs` },
    { name: 'GP catch-up', done: caughtUp, detail: caughtUp ? 'Caught up' : prefMet ? 'In progress' : 'Not reached' },
    { name: `${Math.round((1 - f.carry) * 100)}/${Math.round(f.carry * 100)} split`, done: caughtUp, detail: `${money(f.carryPaid)} of carry paid` },
  ]
  return (
    <ol className="waterfall" aria-label={`${f.name} distribution waterfall`}>
      {steps.map((st) => (
        <li key={st.name} className={st.done ? 'done' : ''}>
          <span className="wf-mark">{st.done ? <Icon name="check" size={14} /> : null}</span>
          <span className="wf-name">{st.name}</span>
          <span className="wf-detail">{st.detail}</span>
        </li>
      ))}
    </ol>
  )
}

function FundCard({ s, f }: { s: GameState; f: Fund }) {
  const [lps, setLps] = useState(false)
  const age = s.q - f.vintageQ
  const holdings = s.properties.filter((p) => p.fundId === f.id).length
  const status = f.status === 'investing' ? 'Investing' : f.status === 'harvesting' ? 'Harvesting' : 'Fully realized'
  return (
    <article className="card fund-card">
      <header className="fund-head">
        <div>
          <p className="kicker">
            {STRATEGIES[f.strategy].label} · vintage {quarterLabel(f.vintageQ)}
          </p>
          <h3>{f.name}</h3>
        </div>
        <Chip tone={f.status === 'investing' ? 'good' : f.status === 'liquidated' ? undefined : 'info'} solid={f.status === 'investing'}>
          {status}
        </Chip>
      </header>
      <div className="stat-grid">
        <Stat label="Commitments" value={money(f.size)} sub={`${pct(f.feeRate, 2)} fee · ${pct(f.carry, 0)} carry`} term="management fee" />
        <Stat label="Called" value={pct(f.called / f.size, 0)} sub={f.status === 'investing' ? `${money(dryPowder(s, f))} dry powder` : `${holdings} building${holdings === 1 ? '' : 's'} left`} />
        <Stat label="Net IRR" term="net irr" value={age < 8 ? 'Too early' : pct(f.netIrr, 1)} tone={f.netIrr === null || age < 8 ? undefined : f.netIrr >= STRATEGIES[f.strategy].target ? 'good' : f.netIrr < 0 ? 'bad' : 'neutral'} sub={`Target ${pct(STRATEGIES[f.strategy].target, 0)}`} />
        <Stat label="TVPI" term="tvpi" value={mult(f.tvpi)} />
        <Stat label="DPI" term="dpi" value={mult(f.dpi)} />
        <Stat label="NAV" term="nav" value={money(f.nav)} sub={f.accruedCarry > 0 ? `${money(f.accruedCarry)} carry accrued` : undefined} />
      </div>
      {f.status !== 'liquidated' && (
        <p className="aside">
          {f.status === 'investing' ? `Buys until ${quarterLabel(f.investEndQ)}. ` : ''}Term ends {quarterLabel(f.termEndQ)}
          {f.extensions ? ` after ${f.extensions} extension${f.extensions > 1 ? 's' : ''}` : ''}.
          {f.creditLine > 0 ? ` ${money(f.creditLine)} drawn on its credit line of ${money(creditLimit(f))}; past that, the bank forces sales.` : ''}
        </p>
      )}
      <h4 className="mini-title">
        <Term t="waterfall">Waterfall</Term>
      </h4>
      <WaterfallSteps f={f} />
      <h4 className="mini-title">
        <Term t="j-curve">J-curve</Term>
      </h4>
      <JCurve fund={f} />
      <button type="button" className="link-btn" onClick={() => setLps((v) => !v)} aria-expanded={lps}>
        {lps ? 'Hide' : 'Show'} the {f.lps.length} limited partners
      </button>
      {lps && (
        <ul className="lp-list">
          {f.lps.map((l) => (
            <li key={l.name}>
              <span>{l.name}</span>
              <span>{money(l.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  )
}

export function FundsView({ s, run, onRaise }: { s: GameState; run: (fn: (s: GameState) => ActionResult) => ActionResult; onRaise: () => void }) {
  const raise = s.firm.fundraise
  const launch = canLaunch(s)
  const track = trackRecord(s)
  const next = (s.funds[s.funds.length - 1]?.number ?? 0) + 1
  return (
    <div className="view">
      <header className="view-head">
        <div>
          <p className="kicker">Capital</p>
          <h1>Funds</h1>
        </div>
        <div className="view-head-stat">
          <span>Track record</span>
          <strong>{track.label}</strong>
        </div>
      </header>
      <p className="view-lede">{track.detail}</p>

      {raise ? (
        <article className="card raise-card">
          <header className="fund-head">
            <div>
              <p className="kicker">On the road · {STRATEGIES[raise.strategy].label}</p>
              <h3>Fund {roman(raise.number)}</h3>
            </div>
            <Chip tone="info" solid>
              Quarter {Math.min(raise.elapsed + 1, raise.quarters)} of {raise.quarters}
            </Chip>
          </header>
          <div className="raise-progress">
            <strong>{money(raise.committed)}</strong> of a {money(raise.target)} target
          </div>
          <Meter value={raise.committed / (raise.target * 1.25)} target={1 / 1.25} label="Commitments against the target" tone="good" />
          <p className="aside">The tick is the target; the bar ends at the 125% hard cap. Commitments come in at the end of each quarter.</p>
          {raise.lps.length > 0 && (
            <ul className="lp-list">
              {raise.lps.slice(-6).reverse().map((l, i) => (
                <li key={`${l.name}-${i}`}>
                  <span>{l.name}</span>
                  <span>{money(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          {raise.elapsed >= 1 && (
            <div className="btn-row">
              <button type="button" className="btn" onClick={() => run((x) => holdFinalClose(x))}>
                Hold the final close now · {money(raise.committed)}
              </button>
            </div>
          )}
        </article>
      ) : (
        <article className="card raise-card">
          <header className="fund-head">
            <div>
              <p className="kicker">Next fund</p>
              <h3>Fund {roman(next)}</h3>
            </div>
          </header>
          <p className="aside">{launch.ok ? 'LPs will take your meeting. A raise takes three quarters on the road.' : launch.reason}</p>
          <div className="btn-row">
            <button type="button" className="btn primary" disabled={!launch.ok} onClick={onRaise}>
              Plan Fund {roman(next)}
            </button>
          </div>
        </article>
      )}

      {[...s.funds].reverse().map((f) => (
        <FundCard key={f.id} s={s} f={f} />
      ))}
    </div>
  )
}

export function RaiseSheet({ s, run, onClose }: { s: GameState; run: (fn: (s: GameState) => ActionResult) => ActionResult; onClose: () => void }) {
  const prev = previousSize(s)
  const lastStrategy = s.funds[s.funds.length - 1]?.strategy ?? 'valueadd'
  const [strategy, setStrategy] = useState<Strategy>(lastStrategy)
  const [step, setStep] = useState(1.5)
  const [fee, setFee] = useState(STRATEGIES[lastStrategy].fee)
  const [carry, setCarry] = useState(STRATEGIES[lastStrategy].carry)
  const [agent, setAgent] = useState(false)
  const target = Math.round((prev * step) / 5e6) * 5e6
  const terms: RaiseTerms = { strategy, target, feeRate: fee, carry, placementAgent: agent }
  const demand = useMemo(() => raiseDemand(s, { strategy, target, feeRate: fee, carry, placementAgent: agent }), [s, strategy, target, fee, carry, agent])
  const ir = s.firm.staff.investorRelations
  const track = trackRecord(s)
  const number = (s.funds[s.funds.length - 1]?.number ?? 0) + 1
  const current = s.funds.find((f) => f.status === 'investing')
  const committed = current ? (current.called + reservedCapex(s, current)) / current.size : 1

  const pickStrategy = (k: Strategy) => {
    setStrategy(k)
    setFee(STRATEGIES[k].fee)
    setCarry(STRATEGIES[k].carry)
  }

  return (
    <Sheet
      onClose={onClose}
      kicker="Fundraising"
      title={`Plan Fund ${roman(number)}`}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Not yet
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const r = run((x) => launchRaise(x, terms))
              if (r.tone !== 'bad') onClose()
            }}
          >
            Launch · {money(target)} target
          </button>
        </>
      }
    >
      <section className="panel">
        <h3 className="panel-title">Strategy</h3>
        <div className="choice-grid">
          {(Object.keys(STRATEGIES) as Strategy[]).map((k) => (
            <button key={k} type="button" className={k === strategy ? 'choice on' : 'choice'} aria-pressed={k === strategy} onClick={() => pickStrategy(k)}>
              <strong>{STRATEGIES[k].label}</strong>
              <span>Targets {pct(STRATEGIES[k].target, 0)} net</span>
              <small>{STRATEGIES[k].blurb}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="panel model">
        <h3 className="panel-title">
          Terms <span className="input-key">Blue = your inputs</span>
        </h3>
        <InputCell id="raise-size" label="Target size" value={step} min={0.5} max={3} step={0.05} onChange={setStep} format={(v) => `${money(Math.round((prev * v) / 5e6) * 5e6)} · ${v.toFixed(2)}x the last fund`} />
        <InputCell id="raise-fee" label={<Term t="management fee">Management fee</Term>} value={fee} min={0.0075} max={0.02} step={0.0005} onChange={setFee} format={(v) => pct(v, 2)} />
        <InputCell id="raise-carry" label={<Term t="carry">Carried interest</Term>} value={carry} min={0.1} max={0.2} step={0.025} onChange={setCarry} format={(v) => `${pct(v, 1)} over a ${pct(STRATEGIES[strategy].pref, 0)} pref`} />
        <label className="toggle">
          <input type="checkbox" checked={agent} onChange={(e) => setAgent(e.target.checked)} />
          <span>
            Hire a placement agent: more LP meetings, for 0.75% of whatever you raise.
          </span>
        </label>
      </section>
      <section className="panel">
        <h3 className="panel-title">What LPs will think</h3>
        <div className="stat-grid">
          <Stat label="Track record" value={track.label} sub={track.detail} />
          <Stat label="LP appetite" value={ir === 0 ? 'Hard to read' : demandLabel(demand)} sub={ir >= 2 ? `About ${pct(Math.min(1.25, demand), 0)} of target` : ir === 0 ? 'Hire investor relations for a read' : 'Your IR team\'s read'} tone={ir === 0 ? undefined : demand >= 0.95 ? 'good' : demand < 0.6 ? 'bad' : 'neutral'} />
          <Stat label="Reputation" value={`${Math.round(s.firm.reputation)} / 100`} />
        </div>
        <p className="aside">
          LPs weigh your net returns against the strategy's target, cash actually returned, your reputation and how big a jump you're asking for. Legal and marketing cost {money(150000 + target * 0.0005)} up front.
          {current && committed < 1 ? ` ${current.name} stops buying when this fund closes, with ${money(dryPowder(s, current))} still uncalled.` : ''}
        </p>
      </section>
    </Sheet>
  )
}
