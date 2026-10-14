import {
  bucketTotal,
  CADENCES,
  investingTotal,
  leftOver,
  livingTotal,
  monthlyIncome,
  paychecksPerYear,
  setCadence,
  setPaycheck,
  takeHomeYear,
  type Budget,
  type Cadence,
} from '../lib/budget'
import { money, moneyField, percent } from '../lib/money'
import { MoneyInput } from './Fields'
import { ChevronIcon } from './Icons'

type Update = (change: (b: Budget) => Budget) => void

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/**
 * The month at a glance: income from the paycheck, and one bar of where it
 * goes, Investing against Living with what's left. Each side opens its
 * detail further down.
 */
export function Overview({ budget: b, update }: { budget: Budget; update: Update }) {
  const income = monthlyIncome(b)
  const investing = investingTotal(b)
  const living = livingTotal(b)
  const left = leftOver(b)
  const whole = Math.max(income, investing + living, 1)
  const width = (n: number) => `${(Math.max(0, n) / whole) * 100}%`
  const share = (n: number) => (income > 0 ? percent(n / income) : '–')

  return (
    <section className="section overview" aria-labelledby="overview-title">
      <div className="section-head">
        <h2 className="eyebrow" id="overview-title">
          This month
        </h2>
        <span className="section-aside">take-home</span>
      </div>

      <div className="hero" aria-live="polite">
        <output className="hero-money" aria-label={`Income ${money(income)} a month`}>
          <span className="money-sign" aria-hidden="true">
            $
          </span>
          <span className="num">{moneyField(income)}</span>
        </output>
        <span className="hero-unit">a month</span>
      </div>

      <div className="pay-row">
        <div className="pay-field">
          <span className="field-label">Net paycheck</span>
          <MoneyInput id="paycheck" className="well-money" value={b.paycheck} label="Net paycheck" onChange={(n) => update((x) => setPaycheck(x, n))} />
        </div>
        <label className="pay-field">
          <span className="field-label">Paid</span>
          <span className="select">
            <select id="cadence" value={b.cadence} onChange={(e) => update((x) => setCadence(x, e.target.value as Cadence))}>
              {CADENCES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <ChevronIcon />
          </span>
        </label>
      </div>
      <p className="pay-note num">
        {paychecksPerYear(b)} paychecks a year · {money(takeHomeYear(b))} take-home
        {b.k401 > 0 && (
          <>
            <br />
            After {money(b.k401)} into the 401k, taken out before each paycheck
          </>
        )}
      </p>

      <div
        className="split-bar"
        role="img"
        aria-label={`Of ${money(income)}: Investing ${money(investing)}, Living ${money(living)}, ${left < 0 ? `${money(-left)} short` : `${money(left)} left over`}`}
      >
        {investing > 0 && <span className="seg invest" style={{ width: width(investing) }} />}
        {living > 0 && <span className="seg living" style={{ width: width(living) }} />}
        {left > 0 && <span className="seg left" style={{ width: width(left) }} />}
      </div>

      <div className="buckets">
        <button type="button" className="bucket invest tile-btn" onClick={() => go('investing')}>
          <span className="bucket-head">
            <span className="swatch" aria-hidden="true" />
            Investing
            <ChevronIcon />
          </span>
          <span className="bucket-money num">{money(investing)}</span>
          <span className="bucket-line num">{share(investing)} of income</span>
          <span className="bucket-line num">
            {money(bucketTotal(b, 'invest'))} markets · {money(bucketTotal(b, 'self'))} self
          </span>
        </button>
        <button type="button" className="bucket living tile-btn" onClick={() => go('living')}>
          <span className="bucket-head">
            <span className="swatch" aria-hidden="true" />
            Living
            <ChevronIcon />
          </span>
          <span className="bucket-money num">{money(living)}</span>
          <span className="bucket-line num">{share(living)} of income</span>
          <span className="bucket-line num">
            {money(bucketTotal(b, 'fixed'))} fixed · {money(bucketTotal(b, 'variable'))} variable
          </span>
        </button>
      </div>

      <p className={`left-line num${left < 0 ? ' short' : ''}`}>
        <span className="swatch" aria-hidden="true" />
        {left < 0 ? `${money(-left)} more planned than comes in` : `${money(left)} left over, unplanned`}
        <span className="muted"> · {share(Math.abs(left))}</span>
      </p>
      {income <= 0 && <p className="note-line">Enter your net paycheck and how often it comes to start.</p>}
    </section>
  )
}
