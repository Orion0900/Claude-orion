import { useState } from 'react'
import { backupFileName, toBackup } from '../lib/backup'
import {
  CHALLENGE_DAYS,
  bestStreak,
  dateOfDay,
  dayNumber,
  dayState,
  finishDate,
  streak,
  totals,
  type AppState,
  type Attempt,
  type DayState,
} from '../lib/challenge'
import { monthDay, shortDate, type DateKey } from '../lib/dates'
import { isInstalled } from '../hooks'
import { saveFile } from '../services/files'
import { useConfirm } from './Confirm'
import { RestoreButton, StatTiles } from './Shared'

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

const STATE_LABEL: Record<DayState, string> = {
  done: 'done',
  carried: 'done',
  open: 'today, not done yet',
  missed: 'missed',
  future: 'still to come',
}

export function ProgressView({
  state,
  attempt,
  today,
  onOpenDay,
  onEnd,
  onReplace,
}: {
  state: AppState
  attempt: Attempt
  today: DateKey
  onOpenDay: (date: DateKey) => void
  onEnd: () => void
  onReplace: (state: AppState) => void
}) {
  const t = totals(attempt, today)
  const current = dayNumber(attempt, today)
  const best = bestStreak(state, today)
  const attemptNumber = state.history.length + 1
  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Progress</h1>
        <span className="pill">Attempt {attemptNumber}</span>
      </header>

      <section className="card summary">
        <div className="summary-top">
          <span className="summary-num">
            {t.daysDone}
            <small>/{CHALLENGE_DAYS}</small>
          </span>
          <span className="summary-pct">{Math.round((t.daysDone / CHALLENGE_DAYS) * 100)}%</span>
        </div>
        <div className="run-bar">
          <div className="run-fill" style={{ width: `${(t.daysDone / CHALLENGE_DAYS) * 100}%` }} />
        </div>
        <div className="summary-dates">
          <span>Day 1 · {monthDay(attempt.start)}</span>
          <span>Day 92 · {monthDay(finishDate(attempt))}</span>
        </div>
      </section>

      <section className="section">
        <h2 className="section-label">The 92</h2>
        <Board attempt={attempt} today={today} current={current} onOpenDay={onOpenDay} />
        <ul className="legend" aria-hidden="true">
          <li>
            <span className="cell done" /> Done
          </li>
          <li>
            <span className="cell open today" /> Today
          </li>
          <li>
            <span className="cell missed" /> Missed
          </li>
          <li>
            <span className="cell future" /> To come
          </li>
        </ul>
        <p className="fine left">Each row is a week. Tap a day to see or fix its log.</p>
      </section>

      <section className="section">
        <h2 className="section-label">Totals</h2>
        <StatTiles totals={t} />
      </section>

      <section className="section">
        <h2 className="section-label">Attempts</h2>
        <ul className="history">
          <li className="history-item now">
            <span className="history-n">#{attemptNumber}</span>
            <span className="history-when">{current >= 1 ? `Now, Day ${Math.min(current, CHALLENGE_DAYS)}` : 'Starting soon'}</span>
            <span className="history-days">{days(streak(attempt, current))}</span>
          </li>
          {state.history.map((past, i) => (
            <li className="history-item" key={`${past.start}-${i}`}>
              <span className="history-n">#{state.history.length - i}</span>
              <span className="history-when">
                {monthDay(past.start)} – {monthDay(past.end)}
              </span>
              <span className={past.outcome === 'finished' ? 'history-days finished' : 'history-days'}>
                {past.outcome === 'finished' ? 'Finished' : days(past.completed)}
              </span>
            </li>
          ))}
        </ul>
        {state.history.length > 0 && <p className="fine">Longest run: {days(best)} in a row.</p>}
      </section>

      <RunControls state={state} attempt={attempt} onEnd={onEnd} onReplace={onReplace} />
    </>
  )
}

/** All 92 days, a week to a row, each one a button into that day's log. */
function Board({
  attempt,
  today,
  current,
  onOpenDay,
}: {
  attempt: Attempt
  today: DateKey
  current: number
  onOpenDay: (date: DateKey) => void
}) {
  const weeks = Math.ceil(CHALLENGE_DAYS / 7)
  return (
    <div className="board">
      {Array.from({ length: weeks }, (_, w) => (
        <div className="board-row" key={w}>
          <span className="board-week" aria-hidden="true">
            W{w + 1}
          </span>
          {Array.from({ length: 7 }, (_, i) => {
            const day = w * 7 + i + 1
            if (day > CHALLENGE_DAYS) return <span className="cell blank" key={day} />
            const s = dayState(attempt, day, today)
            const isToday = day === current
            return (
              <button
                key={day}
                className={`cell ${s}${isToday ? ' today' : ''}`}
                disabled={s === 'future'}
                aria-label={`Day ${day}, ${monthDay(dateOfDay(attempt, day))}, ${STATE_LABEL[s]}`}
                onClick={() => onOpenDay(dateOfDay(attempt, day))}
              >
                {day}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/** Starting over, backups, and the rarely needed rest. */
function RunControls({
  state,
  attempt,
  onEnd,
  onReplace,
}: {
  state: AppState
  attempt: Attempt
  onEnd: () => void
  onReplace: (state: AppState) => void
}) {
  const [message, setMessage] = useState<string | null>(null)
  const [confirmSheet, ask] = useConfirm()

  const backUp = async () => {
    const now = new Date()
    await saveFile(backupFileName(now), toBackup(state, now))
  }
  const startOver = async () => {
    const ok = await ask({
      title: 'Start over at Day 1?',
      body: 'This run ends here and goes into your attempts.',
      action: 'Start over',
      danger: true,
    })
    if (ok) onEnd()
  }
  const erase = async () => {
    const ok = await ask({
      title: 'Erase everything?',
      body: 'Every run and every log on this phone goes, and there is no undo.',
      action: 'Erase everything',
      danger: true,
    })
    if (ok) onReplace({ attempt: null, history: [] })
  }

  return (
    <>
      <section className="card">
        <h2 className="section-label">This run</h2>
        <dl className="facts">
          <div>
            <dt>Day 1</dt>
            <dd>{shortDate(attempt.start)}</dd>
          </div>
          <div>
            <dt>Day 92</dt>
            <dd>{shortDate(finishDate(attempt))}</dd>
          </div>
          <div>
            <dt>Attempt</dt>
            <dd>{state.history.length + 1}</dd>
          </div>
        </dl>
        <button className="btn danger" onClick={startOver}>
          Start over at Day 1
        </button>
      </section>

      <section className="card">
        <h2 className="section-label">Your data</h2>
        <p className="card-copy">
          Everything stays on this phone. Back up now and then — it's also how you move a run to a new phone.
        </p>
        <div className="btn-row">
          <button className="btn backup-btn" onClick={backUp}>
            Back up
          </button>
          <RestoreButton
            className="btn"
            confirm={{ title: 'Restore this backup?', body: 'It replaces everything on this phone.', action: 'Restore' }}
            onRestore={(next) => {
              onReplace(next)
              setMessage('Backup restored.')
            }}
          >
            Restore
          </RestoreButton>
        </div>
        {message && (
          <p className="card-copy ok" role="status">
            {message}
          </p>
        )}
        <button className="text-btn danger" onClick={erase}>
          Erase everything
        </button>
      </section>

      {!isInstalled() && (
        <section className="card">
          <h2 className="section-label">Put it on your Home Screen</h2>
          <p className="card-copy">
            In Safari, tap Share, then Add to Home Screen. It gets its own icon, opens full screen and works with no
            signal.
          </p>
        </section>
      )}
      {confirmSheet}
    </>
  )
}
