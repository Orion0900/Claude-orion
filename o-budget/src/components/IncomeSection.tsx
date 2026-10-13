import type { CSSProperties } from 'react'
import {
  living,
  livingLeft,
  MAX_PAYCHECKS,
  perPaycheck,
  setIncome,
  setInvesting,
  setInvestingShare,
  setLiving,
  setLivingShare,
  setPaychecks,
  shares,
  type Budget,
} from '../lib/budget'
import { money } from '../lib/money'
import { MoneyInput, PercentInput, Stepper } from './Fields'
import { Guilloche } from './Marks'
import { StatusPill } from './StatusPill'

type Update = (change: (b: Budget) => Budget) => void

/** Income for the month, the paychecks it comes in, and the Investing / Living split. */
export function IncomeSection({ budget: b, update }: { budget: Budget; update: Update }) {
  const livingAmount = living(b)
  const split = shares(b)
  const hasIncome = b.income > 0
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

      <div className="hero">
        <MoneyInput id="income" className="hero-money" value={b.income} label="Income a month" onChange={(n) => update((x) => setIncome(x, n))} />
        <span className="hero-unit">a month</span>
      </div>

      <div className="paychecks">
        <span>Paychecks</span>
        <Stepper value={b.paychecks} min={1} max={MAX_PAYCHECKS} label="Paychecks a month" onChange={(n) => update((x) => setPaychecks(x, n))} />
        <span className="each num">{money(perPaycheck(b))} each</span>
      </div>

      <Guilloche />

      <input
        id="split"
        className={`split${hasIncome ? '' : ' empty'}`}
        type="range"
        min={0}
        max={hasIncome ? b.income : 1}
        step={10}
        value={hasIncome ? Math.min(b.investing, b.income) : 0}
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
          <div className="bucket-line num">{money(perPaycheck(b, b.investing))} a paycheck</div>
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
          <div className="bucket-line num">{money(perPaycheck(b, livingAmount))} a paycheck</div>
        </div>
      </div>

      {!hasIncome && <p className="note-line">Enter what comes in each month to start.</p>}
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
