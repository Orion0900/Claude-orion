import { useState, type ReactNode } from 'react'
import {
  CHALLENGE_DAYS,
  dateOfDay,
  dayNumber,
  hyperextensionsDue,
  logFor,
  restDay,
  weekHyperextensions,
  weekLifts,
  weekOf,
  weekSpan,
  WEEK,
  type Attempt,
} from '../lib/challenge'
import { SATURDAY, dayName, weekday, type DateKey } from '../lib/dates'
import {
  HALF_MARATHON_MILES,
  HYPEREXTENSIONS_PER_WEEK,
  LIFTS_PER_WEEK,
  SETS_TARGET,
  VLOG_FROM,
  cleanCount,
  type DayLog,
} from '../lib/tasks'
import { Icon } from './Icons'

export type LogChange = (change: (log: DayLog) => DayLog) => void

interface Props {
  attempt: Attempt
  /** The day these cards log. */
  date: DateKey
  today: DateKey
  onChange: LogChange
}

/** One day's cards, in the whiteboard's order. Keyed by date, so undo never crosses days. */
export function TaskList(props: Props) {
  const { attempt, date, onChange } = props
  const log = logFor(attempt, date)
  return (
    <div className="tasks">
      <LiftCard {...props} />
      {weekday(date) === SATURDAY && (
        <ToggleCard
          title="Half marathon"
          detail={`${HALF_MARATHON_MILES} miles · Saturdays`}
          done={log.halfMarathon}
          onToggle={() => onChange((l) => ({ ...l, halfMarathon: !l.halfMarathon }))}
        />
      )}
      <HyperextensionsCard {...props} />
      <ToggleCard
        title="Maker School"
        detail="1× a day"
        done={log.makerSchool}
        onToggle={() => onChange((l) => ({ ...l, makerSchool: !l.makerSchool }))}
      />
      {date >= VLOG_FROM && (
        <ToggleCard
          title="Vlog"
          detail="1× a day"
          done={log.vlog}
          onToggle={() => onChange((l) => ({ ...l, vlog: !l.vlog }))}
        />
      )}
    </div>
  )
}

function TaskHead({ done, title, detail, count }: { done: boolean; title: string; detail: ReactNode; count?: ReactNode }) {
  return (
    <span className="task-head">
      <span className={done ? 'check on' : 'check'} aria-hidden="true">
        <Icon name="check" size={18} />
      </span>
      <span className="task-titles">
        <span className="task-title">{title}</span>
        <span className="task-detail">{detail}</span>
      </span>
      {count !== undefined && <span className="task-count">{count}</span>}
    </span>
  )
}

/** One tick once the day's 15 sets are in. Or the week's one rest day. */
function LiftCard({ attempt, date, onChange }: Props) {
  const log = logFor(attempt, date)
  const day = dayNumber(attempt, date)
  const week = weekOf(day)
  const rested = restDay(attempt, week)
  const [first, last] = weekSpan(week)
  // "Of 6" only means something in a whole week this app saw all of.
  const fullWeek = last - first + 1 === WEEK && first > attempt.carried
  const lifts = weekLifts(attempt, week)

  if (log.rest) {
    const counts = rested === day
    return (
      <article className={counts ? 'task done' : 'task'} aria-label="Lift">
        <TaskHead
          done={counts}
          title="Rest day"
          detail={counts ? 'Your one day off lifting this week' : `Week ${week}'s rest day was ${dayName(dateOfDay(attempt, rested ?? day))}`}
        />
        <button className="text-btn" onClick={() => onChange((l) => ({ ...l, rest: false }))}>
          Undo — I'm lifting
        </button>
      </article>
    )
  }

  return (
    <article className={log.lifted ? 'task lift done' : 'task lift'} aria-label="Lift">
      <button
        className="task-check"
        role="checkbox"
        aria-checked={log.lifted}
        onClick={() => onChange((l) => ({ ...l, lifted: !l.lifted }))}
      >
        <TaskHead done={log.lifted} title="Lift" detail={`${SETS_TARGET} sets · neck on uppers`} />
      </button>
      <div className="week-line">
        <span>
          {fullWeek ? `${lifts} of ${LIFTS_PER_WEEK} lifts this week` : `${lifts} ${lifts === 1 ? 'lift' : 'lifts'} this week`}
        </span>
        {rested === null ? (
          !log.lifted && (
            <button className="rest-btn" onClick={() => onChange((l) => ({ ...l, rest: true }))}>
              Rest day
            </button>
          )
        ) : (
          <span>Rested {dayName(dateOfDay(attempt, rested))}</span>
        )}
      </div>
    </article>
  )
}

const STEPS = [10, 15, 20, 25]

/** A hundred a week, logged by the set on whichever days they happen. */
function HyperextensionsCard({ attempt, date, today, onChange }: Props) {
  const [history, setHistory] = useState<number[]>([])
  const [editing, setEditing] = useState(false)
  const log = logFor(attempt, date)
  const day = dayNumber(attempt, date)
  const week = weekOf(day)
  const total = weekHyperextensions(attempt, week)
  const due = hyperextensionsDue(attempt, week)
  const end = weekSpan(week)[1]
  const met = total >= HYPEREXTENSIONS_PER_WEEK
  const add = (n: number) => {
    setHistory((h) => [...h, n])
    onChange((l) => ({ ...l, hyperextensions: cleanCount(l.hyperextensions + n) }))
  }
  const undo = () => {
    const last = history[history.length - 1]
    if (last === undefined) return
    setHistory((h) => h.slice(0, -1))
    onChange((l) => ({ ...l, hyperextensions: cleanCount(l.hyperextensions - last) }))
  }
  const set = (n: number) => {
    setEditing(false)
    setHistory([])
    onChange((l) => ({ ...l, hyperextensions: cleanCount(n) }))
  }

  const detail = !due
    ? day === CHALLENGE_DAYS
      ? 'Nothing owed on Day 92'
      : 'Not counted in a week begun before the app'
    : `100 a week · ${end === day && date === today ? 'due today' : `due ${dayName(dateOfDay(attempt, end))}`}`
  const count = editing ? (
    <span className="count-edit">
      <small>Today</small>
      <CountInput value={log.hyperextensions} onDone={set} label="Hyperextensions today" />
    </span>
  ) : (
    <button
      className="count-btn"
      onClick={() => setEditing(true)}
      aria-label={`${total} of ${HYPEREXTENSIONS_PER_WEEK} this week, ${log.hyperextensions} today. Change today's count`}
    >
      {total}/{HYPEREXTENSIONS_PER_WEEK}
    </button>
  )

  return (
    <article className={met ? 'task done' : 'task'} aria-label="Hyperextensions">
      <TaskHead done={met} title="Hyperextensions" detail={detail} count={count} />
      <div className="bar" aria-hidden="true">
        <div className="bar-fill" style={{ width: `${Math.min(100, (total / HYPEREXTENSIONS_PER_WEEK) * 100)}%` }} />
      </div>
      <div className="steps">
        {STEPS.map((n) => (
          <button key={n} className="step" onClick={() => add(n)} aria-label={`Add ${n}`}>
            +{n}
          </button>
        ))}
        <button className="icon-btn" aria-label="Undo" disabled={history.length === 0} onClick={undo}>
          <Icon name="undo" />
        </button>
      </div>
    </article>
  )
}

function CountInput({ value, onDone, label }: { value: number; onDone: (n: number) => void; label: string }) {
  const [text, setText] = useState(String(value))
  const commit = () => {
    const n = Number.parseInt(text, 10)
    onDone(Number.isFinite(n) ? n : value)
  }
  return (
    <input
      className="count-input"
      type="number"
      inputMode="numeric"
      pattern="[0-9]*"
      min={0}
      autoFocus
      aria-label={label}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

function ToggleCard({ title, detail, done, onToggle }: { title: string; detail: string; done: boolean; onToggle: () => void }) {
  return (
    <button className={done ? 'task task-toggle done' : 'task task-toggle'} role="checkbox" aria-checked={done} onClick={onToggle}>
      <TaskHead
        done={done}
        title={title}
        detail={detail}
        count={
          <>
            1<span className="times">×</span>
          </>
        }
      />
    </button>
  )
}
