import {
  cardHistory,
  cardRecord,
  categoryTotal,
  inBucket,
  MONTH_FULL,
  MONTH_NAMES,
  monthLabel,
  setSpent,
  variableCheck,
  type Budget,
} from '../lib/budget'
import { money } from '../lib/money'
import { MoneyInput } from './Fields'
import { AlertIcon, CheckIcon, ClockIcon, CloseIcon, OkIcon } from './Icons'
import { useFold } from './Fold'

type Update = (change: (b: Budget) => Budget) => void

/** When this month's balance was typed in, so a figure from days ago reads as one. */
function checkedText(checked: number | null, now: Date): string {
  if (checked === null) return 'Not checked yet this month'
  if (checked === 0) return 'Checked earlier this month'
  if (checked === now.getDate()) return 'Checked today'
  if (checked === now.getDate() - 1) return 'Checked yesterday'
  return `Checked ${MONTH_NAMES[now.getMonth()]} ${checked}`
}

/**
 * The one number to watch: what's on the variable card this month against
 * the variable budget. Type in the card's balance whenever you look (daily,
 * weekly, monthly) and see what's left, a day for the rest of the month,
 * and whether spending is ahead of an even pace. Every month is kept, so
 * the months before show how each one ended up.
 */
export function CardCheck({ budget: b, update, now = new Date() }: { budget: Budget; update: Update; now?: Date }) {
  const v = variableCheck(b, now)
  const over = v.left < 0
  const scale = Math.max(v.budget, v.spent, 1)
  const within = Math.min(v.spent, v.budget) / scale
  const past = over ? (v.spent - v.budget) / scale : 0
  const pace = v.budget > 0 ? (v.pace / scale) * 100 : 0
  const parts = inBucket(b, 'variable')
  const unchecked = v.checked === null
  const warn = !unchecked && (over || v.aheadOfPace < 0)
  const history = cardHistory(b, now)

  const f = useFold('card')
  return (
    <section id="card" className={`section card-check${f.fold}`} aria-labelledby="card-title">
      <div {...f.headProps}>
        <h2 className="eyebrow" id="card-title">
          {b.cards.variable} check-in
        </h2>
        <span className="section-aside">{MONTH_FULL[now.getMonth()]}</span>
        {f.button('card check-in')}
      </div>

      <div className="pay-row">
        <div className="pay-field">
          <span className="field-label">Spent so far this month</span>
          <MoneyInput id="spent" className="well-money" value={v.spent} label={`Spent on ${b.cards.variable} this month`} onChange={(n) => update((x) => setSpent(x, n, now))} />
          <span id="checked" className="field-hint">
            {checkedText(v.checked, now)}
          </span>
        </div>
        <div className="pay-field">
          <span className="field-label">{over ? 'Over by' : 'Left'}</span>
          <output className={`check-left num${over ? ' over' : ''}`}>{money(Math.abs(v.left))}</output>
        </div>
      </div>

      <div className="check-gauge">
        {v.budget > 0 && (
          <div className="pace-row" aria-hidden="true">
            {/* Slid by its own share too, so it sits on the mark and never runs off either end. */}
            <span className="pace-label num" style={{ left: `${pace}%`, transform: `translateX(-${pace}%)` }}>
              today's pace {money(v.pace)}
            </span>
          </div>
        )}
        <div
          className="meter check-meter"
          role="img"
          aria-label={`${money(v.spent)} of ${money(v.budget)} spent; an even pace would be ${money(v.pace)} by today`}
        >
          <div className="meter-track">
            {within > 0 && <span className="meter-fill" style={{ width: `${within * 100}%` }} />}
            {past > 0 && <span className="meter-over" style={{ left: `${within * 100}%`, width: `${past * 100}%` }} />}
          </div>
          {v.budget > 0 && <span className="meter-mark pace-mark" style={{ left: `${pace}%` }} />}
        </div>
        <p className="check-scale num">
          <span>$0</span>
          <span>{money(v.budget)}</span>
        </p>
      </div>

      <p className={`check-line num${warn ? ' warn' : ''}${unchecked ? ' idle' : ''}`}>
        {unchecked ? <ClockIcon /> : warn ? <AlertIcon /> : <OkIcon />}
        <span>
          {unchecked
            ? `Type what's on the card so far to see where ${MONTH_FULL[now.getMonth()]} stands against its ${money(v.budget)}.`
            : over
              ? `${money(-v.left)} over the ${money(v.budget)} budget. Ease off till the 1st.`
              : v.aheadOfPace < 0
                ? `${money(-v.aheadOfPace)} ahead of pace. ${money(v.perDay)} a day for ${v.daysLeft} days keeps you on budget.`
                : `${money(v.aheadOfPace)} under pace. ${money(v.perDay)} a day for the ${v.daysLeft} days left.`}
        </span>
      </p>

      {parts.length > 0 && (
        <p className="check-parts num">
          Budget: {parts.map((c) => `${c.name.trim() || 'Untitled'} ${money(categoryTotal(c))}`).join(' · ')}
        </p>
      )}

      {history.length > 0 && <PastMonths history={history} />}
    </section>
  )
}

/** Each earlier month as it ended up, against the budget it had, newest first. */
function PastMonths({ history }: { history: ReturnType<typeof cardHistory> }) {
  const record = cardRecord(history)
  return (
    <details className="history past-months">
      <summary>
        Past months{' '}
        <span className="muted num">
          · {record.under} of {record.months} under budget
        </span>
      </summary>
      <p className="past-average num">{money(record.average)} a month on average</p>
      <ul className="history-list">
        {history.map((m) => {
          const over = m.left < 0
          const scale = Math.max(m.budget, m.spent, 1)
          const within = (Math.min(m.spent, m.budget) / scale) * 100
          const month = Number(m.month.slice(5))
          return (
            <li key={m.month} className="past-month">
              <span className="history-period">{monthLabel(m.month)}</span>
              <span className="past-spent num">
                {money(m.spent)} <span className="muted">of {money(m.budget)}</span>
              </span>
              <span className="past-bar" aria-hidden="true">
                {within > 0 && <span className="past-fill" style={{ width: `${within}%` }} />}
                {over && <span className="past-over" style={{ left: `${within}%`, width: `${100 - within}%` }} />}
              </span>
              <span className="past-note">
                <span className={`mark${over ? ' miss' : ' ok'}`}>
                  {over ? <CloseIcon /> : <CheckIcon />}
                  <span className="num">{over ? `${money(-m.left)} over` : m.left === 0 ? 'Right on budget' : `${money(m.left)} under`}</span>
                </span>
                {m.day > 0 && m.day < m.days && (
                  <span className="muted num">
                    last checked {MONTH_NAMES[month - 1]} {m.day}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
