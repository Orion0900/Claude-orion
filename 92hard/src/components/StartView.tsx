import { useState } from 'react'
import { CHALLENGE_DAYS, attemptOnDay, finishDate, newAttempt, type AppState, type Attempt } from '../lib/challenge'
import { addDays, shortDate, type DateKey } from '../lib/dates'
import { isInstalled } from '../hooks'
import { Icon } from './Icons'
import { RestoreButton, RulesList } from './Shared'

type When = 'today' | 'tomorrow' | 'already'

const WHEN: Array<[When, string]> = [
  ['today', 'Today'],
  ['tomorrow', 'Tomorrow'],
  ['already', 'Earlier'],
]

/** The commitment: the rules, the start day, and one button. */
export function StartView({
  state,
  today,
  onBegin,
  onRestore,
}: {
  state: AppState
  today: DateKey
  onBegin: (attempt: Attempt) => void
  onRestore: (state: AppState) => void
}) {
  const [when, setWhen] = useState<When>('today')
  // Kept as typed so a two-digit day can be entered; clamped when used.
  const [dayText, setDayText] = useState('2')
  const clampDay = (n: number) => Math.min(CHALLENGE_DAYS, Math.max(2, Number.isFinite(n) ? Math.floor(n) : 2))
  const day = clampDay(Number.parseInt(dayText, 10))
  const attempt =
    when === 'today' ? newAttempt(today) : when === 'tomorrow' ? newAttempt(addDays(today, 1)) : attemptOnDay(today, day)
  const attemptNumber = state.history.length + 1
  const best = state.history.reduce((n, past) => Math.max(n, past.completed), 0)

  return (
    <main className="start">
      <div className="logo" aria-label="92 Hard">
        <span className="logo-num">92</span>
        <span className="logo-word">Hard</span>
      </div>
      {attemptNumber > 1 ? (
        <p className="start-lede">
          Attempt {attemptNumber}. {best > 0 ? `Your best is ${best} ${best === 1 ? 'day' : 'days'}. Beat it.` : 'Again.'}
        </p>
      ) : (
        <p className="start-lede">92 days. Four tasks. Every single day.</p>
      )}

      <div className="card">
        <RulesList />
        <p className="card-copy strong">Miss one, and you start over at Day 1.</p>
      </div>

      <div className="start-when">
        <span className="section-label" id="when-label">
          Day 1 is
        </span>
        <div className="seg" role="radiogroup" aria-labelledby="when-label">
          {WHEN.map(([id, label]) => (
            <button key={id} role="radio" aria-checked={when === id} className={when === id ? 'on' : ''} onClick={() => setWhen(id)}>
              {label}
            </button>
          ))}
        </div>
        {when === 'already' && (
          <div className="stepper">
            <span className="stepper-label">Today is day</span>
            <button className="icon-btn" aria-label="Earlier day" disabled={day <= 2} onClick={() => setDayText(String(clampDay(day - 1)))}>
              <Icon name="minus" />
            </button>
            <input
              className="stepper-input"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={2}
              max={CHALLENGE_DAYS}
              aria-label="Today is day"
              value={dayText}
              onFocus={(e) => e.target.select()}
              onChange={(e) => setDayText(e.target.value)}
              onBlur={() => setDayText(String(day))}
            />
            <button className="icon-btn" aria-label="Later day" disabled={day >= CHALLENGE_DAYS} onClick={() => setDayText(String(clampDay(day + 1)))}>
              <Icon name="plus" />
            </button>
          </div>
        )}
        <p className="start-dates">
          Day 1 {shortDate(attempt.start)} <span aria-hidden="true">→</span> Day 92 {shortDate(finishDate(attempt))}
        </p>
      </div>

      <button className="btn primary big" onClick={() => onBegin(attempt)}>
        I'm in
      </button>

      <div className="start-foot">
        <RestoreButton className="text-btn" onRestore={onRestore}>
          Restore a backup
        </RestoreButton>
        {!isInstalled() && <p className="fine">Tip: in Safari, tap Share → Add to Home Screen to install it.</p>}
      </div>
    </main>
  )
}
