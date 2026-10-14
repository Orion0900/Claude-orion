import { inBucket, categoryTotal, setSpent, variableCheck, type Budget } from '../lib/budget'
import { money } from '../lib/money'
import { MoneyInput } from './Fields'
import { AlertIcon, OkIcon } from './Icons'

type Update = (change: (b: Budget) => Budget) => void

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * The one number to watch: what's on the variable card this month against
 * the variable budget. Type in the card's balance whenever you look (daily,
 * weekly, monthly) and see what's left, a day for the rest of the month,
 * and whether spending is ahead of an even pace.
 */
export function CardCheck({ budget: b, update, now = new Date() }: { budget: Budget; update: Update; now?: Date }) {
  const v = variableCheck(b, now)
  const over = v.left < 0
  const scale = Math.max(v.budget, v.spent, 1)
  const within = Math.min(v.spent, v.budget) / scale
  const past = over ? (v.spent - v.budget) / scale : 0
  const pace = v.budget > 0 ? v.pace / scale : 0
  const parts = inBucket(b, 'variable')

  return (
    <section id="card" className="section card-check" aria-labelledby="card-title">
      <div className="section-head">
        <h2 className="eyebrow" id="card-title">
          {b.cards.variable} check-in
        </h2>
        <span className="section-aside">{MONTHS[now.getMonth()]}</span>
      </div>

      <div className="pay-row">
        <div className="pay-field">
          <span className="field-label">Spent so far this month</span>
          <MoneyInput id="spent" className="well-money" value={v.spent} label={`Spent on ${b.cards.variable} this month`} onChange={(n) => update((x) => setSpent(x, n, now))} />
        </div>
        <div className="pay-field">
          <span className="field-label">{over ? 'Over by' : 'Left'}</span>
          <output className={`check-left num${over ? ' over' : ''}`}>{money(Math.abs(v.left))}</output>
        </div>
      </div>

      <div
        className="meter check-meter"
        role="img"
        aria-label={`${money(v.spent)} of ${money(v.budget)} spent; an even pace would be ${money(v.pace)} by today`}
      >
        <div className="meter-track">
          {within > 0 && <span className="meter-fill" style={{ width: `${within * 100}%` }} />}
          {past > 0 && <span className="meter-over" style={{ left: `${within * 100}%`, width: `${past * 100}%` }} />}
        </div>
        {v.budget > 0 && <span className="meter-mark pace-mark" style={{ left: `${pace * 100}%` }} />}
      </div>
      <p className="check-scale num">
        <span>$0</span>
        <span>today's pace {money(v.pace)}</span>
        <span>{money(v.budget)}</span>
      </p>

      <p className={`check-line num${v.aheadOfPace < 0 || over ? ' warn' : ''}`}>
        {v.aheadOfPace < 0 || over ? <AlertIcon /> : <OkIcon />}
        <span>
          {over
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
    </section>
  )
}
