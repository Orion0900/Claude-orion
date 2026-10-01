import {
  CHALLENGE_DAYS,
  dateOfDay,
  finishDate,
  logFor,
  streak,
  totals,
  type Attempt,
  type Status,
} from '../lib/challenge'
import { monthDay, shortDate, type DateKey } from '../lib/dates'
import { TASKS, isDayComplete, tasksDone } from '../lib/tasks'
import { Confetti } from './Confetti'
import { Icon } from './Icons'
import { Ring } from './Ring'
import { RulesList, StatTiles } from './Shared'
import { TaskList, type LogChange } from './TaskList'

interface Props {
  attempt: Attempt
  status: Exclude<Status, { kind: 'none' }>
  today: DateKey
  onChange: (date: DateKey) => LogChange
  onOpenDay: (date: DateKey) => void
  /** Ends this run and goes back to the start screen. */
  onEnd: () => void
  onStartToday: () => void
}

export function TodayView(props: Props) {
  const { status } = props
  return (
    <>
      <header className="topbar">
        <span className="brand">
          92 <b>Hard</b>
        </span>
        <span className="topbar-date">{shortDate(props.today)}</span>
      </header>
      {status.kind === 'active' && <ActiveDay {...props} day={status.day} />}
      {status.kind === 'missed' && <MissedDay {...props} missed={status.missed} />}
      {status.kind === 'upcoming' && <Upcoming {...props} startsIn={status.startsIn} />}
      {status.kind === 'finished' && <Finished {...props} />}
    </>
  )
}

function ActiveDay({ attempt, today, day, onChange }: Props & { day: number }) {
  const log = logFor(attempt, today)
  const done = tasksDone(log)
  const complete = isDayComplete(log)
  const daysDone = streak(attempt, day)
  return (
    <>
      <section className={complete ? 'hero complete' : 'hero'}>
        <div className="hero-day">
          <span className="hero-label">Day</span>
          <span className="hero-number">{day}</span>
          <span className="hero-of">of {CHALLENGE_DAYS}</span>
        </div>
        <Ring done={done} total={TASKS.length}>
          {complete ? (
            <span className="ring-done">
              <Icon name="check" size={44} />
            </span>
          ) : (
            <>
              <span className="ring-num">
                {done}/{TASKS.length}
              </span>
              <span className="ring-label">today</span>
            </>
          )}
        </Ring>
      </section>
      <div className="run">
        <div className="run-bar">
          <div className="run-fill" style={{ width: `${(daysDone / CHALLENGE_DAYS) * 100}%` }} />
        </div>
        <p className="run-caption">
          <span>
            {complete
              ? `Day ${day} done. Rest up.`
              : day === CHALLENGE_DAYS
                ? 'Last day. Finish it.'
                : `${CHALLENGE_DAYS - day} to go after today`}
          </span>
          <span>Finish {monthDay(finishDate(attempt))}</span>
        </p>
      </div>
      <TaskList key={today} log={log} onChange={onChange(today)} />
    </>
  )
}

function MissedDay({ attempt, missed, onOpenDay, onEnd }: Props & { missed: number }) {
  const date = dateOfDay(attempt, missed)
  const made = streak(attempt, missed)
  const end = () => {
    if (window.confirm(`Start over at Day 1? This run ends at ${made} ${made === 1 ? 'day' : 'days'}.`)) onEnd()
  }
  return (
    <section className="missed-view">
      <span className="missed-mark">
        <Icon name="x" size={44} />
      </span>
      <h1 className="missed-title">Day {missed} isn't done</h1>
      <p className="missed-copy">
        {shortDate(date)} wasn't checked off. If you did all four and forgot to tick them, log it now. If you didn't,
        92 Hard starts over.
      </p>
      <button className="btn primary" onClick={() => onOpenDay(date)}>
        Log Day {missed}
      </button>
      <button className="btn danger" onClick={end}>
        Start over at Day 1
      </button>
      {made > 0 && (
        <p className="fine">
          {made} {made === 1 ? 'day' : 'days'} in a row before it.
        </p>
      )}
    </section>
  )
}

function Upcoming({ attempt, startsIn, onStartToday, onEnd }: Props & { startsIn: number }) {
  return (
    <section className="upcoming-view">
      <span className="hero-label">Day 1 is</span>
      <h1 className="upcoming-when">{startsIn === 1 ? 'Tomorrow' : `In ${startsIn} days`}</h1>
      <p className="upcoming-dates">
        {shortDate(attempt.start)} to {shortDate(finishDate(attempt))}
      </p>
      <div className="card">
        <RulesList />
      </div>
      <button className="btn primary" onClick={onStartToday}>
        Start today instead
      </button>
      <button className="text-btn" onClick={onEnd}>
        Pick a different day
      </button>
    </section>
  )
}

function Finished({ attempt, today, onEnd }: Props) {
  return (
    <section className="finished-view">
      <Confetti trigger={1} count={90} />
      <div className="finished-mark">
        <span className="hero-number">{CHALLENGE_DAYS}</span>
        <span className="hero-of">of {CHALLENGE_DAYS}</span>
      </div>
      <h1 className="finished-title">92 Hard. Done.</h1>
      <p className="finished-copy">
        {monthDay(attempt.start)} to {monthDay(finishDate(attempt))}. Every task, every day.
      </p>
      <StatTiles totals={totals(attempt, today)} />
      <button className="btn primary" onClick={onEnd}>
        Start another 92
      </button>
    </section>
  )
}
