import type { CSSProperties } from 'react'
import {
  CADENCES,
  living,
  livingLeft,
  monthlyIncome,
  paychecksPerYear,
  perPaycheck,
  setCadence,
  setInvesting,
  setInvestingShare,
  setLiving,
  setLivingShare,
  setPaycheck,
  shares,
  takeHomeYear,
  type Budget,
  type Cadence,
} from '../lib/budget'
import { money, moneyField } from '../lib/money'
import { MoneyInput, PercentInput } from './Fields'
import { ChevronIcon } from './Icons'
import { Guilloche } from './Marks'
import { StatusPill } from './StatusPill'

type Update = (change: (b: Budget) => Budget) => void

/** Why the month's income is an average for cadences that don't divide the month evenly. */
const averaged = (b: Budget): string | null => {
  if (b.cadence === 'biweekly') return `Averaged over the year. Most months bring 2 paychecks (${money(b.paycheck * 2)}); two bring 3.`
  if (b.cadence === 'weekly') return `Averaged over the year. Most months bring 4 paychecks (${money(b.paycheck * 4)}); four bring 5.`
  return null
}

/** Per-paycheck shares are averages, so they round to whole dollars. */
const wholeDollars = (n: number) => money(Math.round(n))

/**
 * The month's income, made from the net paycheck and how often it comes,
 * and its split between Investing and Living.
 */
export function IncomeSection({ budget: b, update }: { budget: Budget; update: Update }) {
  const income = monthlyIncome(b)
  const livingAmount = living(b)
  const split = shares(b)
  const hasIncome = income > 0
  const perYear = paychecksPerYear(b)
  // The color change sits under the slider's thumb: its center runs from 14px to the width less 14px.
  const at = Math.min(1, Math.max(0, split.investing))
  const track = { '--at': `calc(14px + (100% - 28px) * ${at})` } as CSSProperties

  return (
    <section className="section income" aria-labelledby="income-title">
      <div className="section-head">
        <h2 className="eyebrow" id="income-title">
          Income
        </h2>
      </div>

      <div className="hero" aria-live="polite">
        <output className="hero-money" htmlFor="paycheck cadence" aria-label={`Income ${money(income)} a month`}>
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
        {perYear} paychecks a year · {money(takeHomeYear(b))} take-home
      </p>
      {averaged(b) && <p className="pay-note muted num">{averaged(b)}</p>}

      <Guilloche />

      <input
        id="split"
        className={`split${hasIncome ? '' : ' empty'}`}
        type="range"
        min={0}
        max={hasIncome ? income : 1}
        step={10}
        value={hasIncome ? Math.min(b.investing, income) : 0}
        disabled={!hasIncome}
        style={track}
        aria-label="Split between Investing and Living"
        aria-valuetext={`Investing ${money(b.investing)}, Living ${money(livingAmount)}`}
        onChange={(e) => update((x) => setInvesting(x, Number(e.target.value)))}
      />

      <div className="buckets">
        <div className="bucket invest">
          <div className="bucket-head">
            <span className="swatch" aria-hidden="true" />
            Investing
          </div>
          <MoneyInput id="investing" className="bucket-money" value={b.investing} label="Investing a month" onChange={(n) => update((x) => setInvesting(x, n))} />
          <div className="bucket-line">
            <PercentInput id="investing-pct" value={split.investing} label="Investing, percent of income" onChange={(n) => update((x) => setInvestingShare(x, n))} />
            <span>of income</span>
          </div>
          <div className="bucket-line num">{wholeDollars(perPaycheck(b, b.investing))} a paycheck</div>
        </div>

        <div className="bucket living">
          <div className="bucket-head">
            <span className="swatch" aria-hidden="true" />
            Living
          </div>
          <MoneyInput id="living" className="bucket-money" value={livingAmount} label="Living a month" onChange={(n) => update((x) => setLiving(x, n))} />
          <div className="bucket-line">
            <PercentInput id="living-pct" value={split.living} label="Living, percent of income" onChange={(n) => update((x) => setLivingShare(x, n))} />
            <span>of income</span>
          </div>
          <div className="bucket-line num">{wholeDollars(perPaycheck(b, livingAmount))} a paycheck</div>
        </div>
      </div>

      {!hasIncome && <p className="note-line">Enter your net paycheck and how often it comes to start.</p>}
      {livingAmount < 0 && <p className="note-line warn">Investing is more than income.</p>}
      {b.categories.length > 0 && livingAmount >= 0 && (
        <button
          type="button"
          className="income-status"
          onClick={() => document.getElementById('expenses')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span>Living expenses</span>
          <StatusPill left={livingLeft(b)} />
        </button>
      )}
    </section>
  )
}
