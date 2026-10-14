import { Fragment } from 'react'
import { bucketTotal, inBucket, paycheckPlan, resetPaid, togglePaid, type Budget } from '../lib/budget'
import { money } from '../lib/money'
import { CheckIcon, ResetIcon } from './Icons'

type Update = (change: (b: Budget) => Budget) => void

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/**
 * Each paycheck, dollar by dollar: built from the categories, so it always
 * matches the budget. The system it follows is spelled out on top, the
 * steps tick off on payday, and "Start next paycheck" clears them.
 */
export function PlanSection({ budget: b, update }: { budget: Budget; update: Update }) {
  const plan = paycheckPlan(b)
  const done = plan.rows.filter((r) => b.paid.includes(r.key)).length
  const short = plan.leftOver < 0
  const lands = plan.rows.filter((r) => r.bucket === 'before').length
  const invest = inBucket(b, 'invest')
  const variable = inBucket(b, 'variable')
  const landsRow = (
    <li className="step-edge lands">
      <span className="edge-dot" aria-hidden="true" />
      <div className="edge-row">
        <span className="edge-text">Paycheck lands</span>
        <span className="step-amount num">{money(plan.start)}</span>
      </div>
    </li>
  )

  return (
    <section id="plan" className="section process" aria-labelledby="plan-title">
      <div className="section-head">
        <h2 className="eyebrow" id="plan-title">
          Each paycheck
        </h2>
        {done > 0 && <span className="progress num">{done === plan.rows.length ? 'All done' : `${done} of ${plan.rows.length} done`}</span>}
      </div>

      <ol className="rules">
        {invest.map((c) => (
          <li key={c.id}>
            <strong className="num">
              {money(plan.rows.find((r) => r.key === c.id)?.amount ?? 0)} into {c.name || 'investing'}
            </strong>{' '}
            the day it lands.
          </li>
        ))}
        <li>
          <strong>{b.cards.fixed}</strong> for fixed bills only, {money(bucketTotal(b, 'fixed'))} a month.
        </li>
        <li>
          <strong>{b.cards.variable}</strong> for everything variable{variable.length ? ` (${variable.map((c) => c.name.toLowerCase()).join(', ')})` : ''}, {money(bucketTotal(b, 'variable'))} a
          month. It's the only one to watch.
        </li>
      </ol>

      <ol className="steps">
        {lands === 0 && landsRow}
        {plan.rows.map((r, i) => {
          const paid = b.paid.includes(r.key)
          const after = plan.after[i]
          return (
            <Fragment key={r.key}>
              <li className={`step${paid ? ' done' : ''}${r.bucket === 'before' ? ' before-pay' : ''} plan-${r.bucket}`}>
                <button
                  type="button"
                  className="step-check"
                  role="checkbox"
                  aria-checked={paid}
                  aria-label={`${r.label}, ${money(r.amount)}`}
                  onClick={() => update((x) => togglePaid(x, r.key))}
                >
                  {paid ? <CheckIcon /> : <span className="step-dot" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  className="step-main"
                  onClick={() => go(r.bucket === 'invest' || r.bucket === 'self' ? 'investing' : r.bucket === 'before' ? 'pay' : 'living')}
                >
                  <span className="step-text">{r.label}</span>
                  <span className="step-amount num">{money(r.amount)}</span>
                  <span className="step-left num">
                    {r.detail}
                    {after === null ? '' : after < 0 ? ` · ${money(-after)} short` : ` · then ${money(after)} left`}
                  </span>
                </button>
              </li>
              {i === lands - 1 && landsRow}
            </Fragment>
          )
        })}
        <li className={`step-edge end${short ? ' short' : ''}`}>
          <span className="edge-dot" aria-hidden="true" />
          <div className="edge-row">
            <span className="edge-text">{short ? 'Short' : 'Left in checking'}</span>
            <span className="step-amount num">{money(Math.abs(plan.leftOver))}</span>
          </div>
        </li>
      </ol>

      {done > 0 && (
        <div className="actions">
          <button type="button" className="btn quiet" onClick={() => update(resetPaid)}>
            <ResetIcon />
            Start next paycheck
          </button>
        </div>
      )}
    </section>
  )
}
