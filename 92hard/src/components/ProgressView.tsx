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
import { monthDay, type DateKey } from '../lib/dates'
import { StatTiles } from './Shared'

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
}: {
  state: AppState
  attempt: Attempt
  today: DateKey
  onOpenDay: (date: DateKey) => void
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
      </section>

      <section className="section">
        <h2 className="section-label">This run</h2>
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
