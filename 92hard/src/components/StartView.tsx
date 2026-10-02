import { useState } from 'react'
import { finishDate, newAttempt, type AppState, type Attempt } from '../lib/challenge'
import { shortDate, type DateKey } from '../lib/dates'
import { WHY } from '../lib/plan'
import { isInstalled } from '../hooks'
import { RestoreButton, RulesList } from './Shared'
import { DayOnePicker, FillInNote } from './StartDate'

/** The commitment: why, the rules, Day 1, and one button. */
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
  const [start, setStart] = useState(today)
  const attempt = newAttempt(start)
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
        <p className="start-lede">{WHY}</p>
      )}

      <div className="card">
        <RulesList />
      </div>

      <div className="start-when">
        <span className="section-label">Day 1 is</span>
        <DayOnePicker today={today} value={start} onChange={setStart} />
        <p className="start-dates">
          Day 1 {shortDate(attempt.start)} <span aria-hidden="true">→</span> Day 92 {shortDate(finishDate(attempt))}
        </p>
        <FillInNote start={start} today={today} />
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
