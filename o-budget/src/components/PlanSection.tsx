import {
  bucketTotal,
  checkHistory,
  currentChecks,
  inBucket,
  investPerPaycheck,
  paycheckPlan,
  periodKey,
  periodLabel,
  toggleCheck,
  variableCheck,
  type Budget,
  type CheckKey,
} from '../lib/budget'
import { money } from '../lib/money'
import { CheckIcon, CloseIcon } from './Icons'

type Update = (change: (b: Budget) => Budget) => void

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

/**
 * Each paycheck, dollar by dollar: built from the categories, so it always
 * matches the budget. The system it follows is spelled out on top, and a
 * short checklist below starts over on the 1st and the 15th, keeping every
 * earlier pay period's answers as history.
 */
export function PlanSection({ budget: b, update, now = new Date() }: { budget: Budget; update: Update; now?: Date }) {
  const plan = paycheckPlan(b)
  const checks = currentChecks(b, now)
  const done = checks.length
  const short = plan.leftOver < 0
  const invest = inBucket(b, 'invest')
  const variable = inBucket(b, 'variable')
  const self = inBucket(b, 'self')

  return (
    <section id="plan" className="section process" aria-labelledby="plan-title">
      <div className="section-head">
        <h2 className="eyebrow" id="plan-title">
          Each paycheck
        </h2>
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
          <strong>{b.cards.fixed}</strong> for fixed bills{self.length ? ` and ${self.map((c) => c.name.trim() || 'self investment').join(', ')}` : ''},{' '}
          {money(bucketTotal(b, 'fixed', 'self'))} a month.
        </li>
        <li>
          <strong>{b.cards.variable}</strong> for everything variable{variable.length ? ` (${variable.map((c) => c.name.toLowerCase()).join(', ')})` : ''}, {money(bucketTotal(b, 'variable'))} a
          month. It's the only one to watch.
        </li>
      </ol>

      <ol className="steps">
        <li className="step-edge lands">
          <span className="edge-dot" aria-hidden="true" />
          <div className="edge-row">
            <span className="edge-text">Paycheck lands</span>
            <span className="step-amount num">{money(plan.start)}</span>
          </div>
        </li>
        {plan.rows.map((r, i) => {
          const after = plan.after[i]
          return (
            <li key={r.key} className={`step plan-${r.bucket}`}>
              <span className="step-check" aria-hidden="true">
                <span className="step-dot" />
              </span>
              <button
                type="button"
                className="step-main"
                onClick={() => go(r.bucket === 'invest' ? 'investing' : 'living')}
              >
                <span className="step-text">{r.label}</span>
                <span className="step-amount num">{money(r.amount)}</span>
                <span className="step-left num">
                  {r.detail}
                  {after < 0 ? ` · ${money(-after)} short` : ` · then ${money(after)} left`}
                </span>
              </button>
            </li>
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

      <Checklist budget={b} update={update} now={now} done={done} checks={checks} />
    </section>
  )
}

const CHECK_TEXT: Record<CheckKey, string> = { invest: '', fixed: 'Fixed expenses as expected', variable: 'Under variable budget' }

function Checklist({ budget: b, update, now, done, checks }: { budget: Budget; update: Update; now: Date; done: number; checks: CheckKey[] }) {
  const invest = inBucket(b, 'invest')
  const v = variableCheck(b, now)
  const history = checkHistory(b, now)
  const investName = invest.map((c) => c.name.trim() || 'investing').join(' + ') || 'investing'
  const items: { key: CheckKey; text: string; hint: string }[] = [
    { key: 'invest', text: `${money(investPerPaycheck(b))} ${investName}`, hint: 'Deposited this paycheck' },
    { key: 'fixed', text: CHECK_TEXT.fixed, hint: `${b.cards.fixed} bills, no surprises` },
    { key: 'variable', text: CHECK_TEXT.variable, hint: `${b.cards.variable}: ${money(v.spent)} of ${money(v.budget)} so far` },
  ]
  const label = (key: CheckKey, invested: number) => (key === 'invest' ? `${money(invested)} ${investName}` : CHECK_TEXT[key])

  return (
    <div className="checklist">
      <div className="checklist-head">
        <h3 className="eyebrow">This pay period</h3>
        <span className="section-aside num">
          {periodLabel(periodKey(now))} · {done === items.length ? 'All done' : `${done} of ${items.length}`}
        </span>
      </div>
      <ul className="checks">
        {items.map((it) => {
          const on = checks.includes(it.key)
          return (
            <li key={it.key}>
              <button
                type="button"
                id={`check-${it.key}`}
                className={`check${on ? ' on' : ''}`}
                role="checkbox"
                aria-checked={on}
                onClick={() => update((x) => toggleCheck(x, it.key, now))}
              >
                <span className="check-box" aria-hidden="true">
                  {on && <CheckIcon />}
                </span>
                <span className="check-text">{it.text}</span>
                <span className="check-hint num">{it.hint}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="note-line">Starts over on the 1st and the 15th.</p>

      {history.length > 0 && (
        <details className="history">
          <summary>
            History <span className="muted num">· {history.length} pay period{history.length === 1 ? '' : 's'}</span>
          </summary>
          <ul className="history-list">
            {history.map((h) => (
              <li key={h.period}>
                <span className="history-period num">{periodLabel(h.period)}</span>
                <span className="history-marks">
                  {(['invest', 'fixed', 'variable'] as CheckKey[]).map((k) => {
                    const ok = h.done.includes(k)
                    return (
                      <span key={k} className={`mark${ok ? ' ok' : ' miss'}`}>
                        {ok ? <CheckIcon /> : <CloseIcon />}
                        <span className="num">{label(k, h.invest)}</span>
                      </span>
                    )
                  })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
