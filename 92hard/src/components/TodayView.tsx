import {
  CHALLENGE_DAYS,
  dateOfDay,
  dayTasks,
  finishDate,
  logFor,
  streak,
  totals,
  weekHyperextensions,
  weekOf,
  type Attempt,
  type Status,
} from '../lib/challenge'
import { monthDay, shortDate, type DateKey } from '../lib/dates'
import { WHY } from '../lib/plan'
import { HYPEREXTENSIONS_PER_WEEK, isBlank, type TaskId } from '../lib/tasks'
import { Confetti } from './Confetti'
import { useConfirm } from './Confirm'
import { Icon } from './Icons'
import { Ring } from './Ring'
import { RoutineNow } from './Routine'
import { RulesList, StatTiles } from './Shared'
import { TaskList, type LogChange } from './TaskList'

interface Props {
  attempt: Attempt
  status: Exclude<Status, { kind: 'none' }>
  today: DateKey
  onChange: (date: DateKey) => LogChange
  onOpenDay: (date: DateKey) => void
  onOpenPlan: () => void
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

function ActiveDay({ attempt, today, day, onChange, onOpenDay, onOpenPlan }: Props & { day: number }) {
  const tasks = dayTasks(attempt, day)
  const done = tasks.filter((task) => task.done).length
  const complete = done === tasks.length
  const daysDone = streak(attempt, day)
  return (
    <>
      <section className={complete ? 'hero complete' : 'hero'}>
        <div className="hero-day">
          <span className="hero-label">Day</span>
          <span className="hero-number">{day}</span>
          <span className="hero-of">of {CHALLENGE_DAYS}</span>
        </div>
        <Ring done={done} total={tasks.length}>
          {complete ? (
            <span className="ring-done">
              <Icon name="check" size={44} />
            </span>
          ) : (
            <>
              <span className="ring-num">
                {done}/{tasks.length}
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
      <RoutineNow today={today} onOpen={onOpenPlan} />
      <TaskList key={today} attempt={attempt} date={today} today={today} onChange={onChange(today)} />
      {day > 1 && (
        <button className="earlier-btn" onClick={() => onOpenDay(dateOfDay(attempt, day - 1))}>
          <Icon name="pencil" size={16} />
          Fill in an earlier day
        </button>
      )}
      <p className="why-foot">{WHY}</p>
    </>
  )
}

/** What a day that wasn't done was missing, in a few words. */
function missing(attempt: Attempt, day: number, id: TaskId): string {
  const log = logFor(attempt, dateOfDay(attempt, day))
  switch (id) {
    case 'lift':
      return log.rest ? 'A second rest day in one week' : 'No lift, no rest day'
    case 'halfMarathon':
      return 'No half marathon'
    case 'hyperextensions': {
      const week = weekOf(day)
      return `Week ${week} ended at ${weekHyperextensions(attempt, week)} of ${HYPEREXTENSIONS_PER_WEEK} hyperextensions`
    }
    case 'makerSchool':
      return 'No Maker School'
    case 'vlog':
      return 'No vlog'
  }
}

function MissedDay({ attempt, missed, onOpenDay, onEnd }: Props & { missed: number }) {
  const date = dateOfDay(attempt, missed)
  const made = streak(attempt, missed)
  const gaps = dayTasks(attempt, missed).filter((task) => !task.done)
  // Nothing logged at all: most likely a day before the app was keeping count, still to fill in.
  const blank = isBlank(logFor(attempt, date))
  const [confirmSheet, ask] = useConfirm()
  const end = async () => {
    const ok = await ask({
      title: 'Start over at Day 1?',
      body: `This run ends at ${made} ${made === 1 ? 'day' : 'days'} and goes into your attempts.`,
      action: 'Start over',
      danger: true,
    })
    if (ok) onEnd()
  }
  return (
    <section className="missed-view">
      <span className={blank ? 'missed-mark blank' : 'missed-mark'}>
        <Icon name={blank ? 'pencil' : 'x'} size={blank ? 40 : 44} />
      </span>
      <h1 className="missed-title">{blank ? `Fill in Day ${missed}` : `Day ${missed} isn't done`}</h1>
      {!blank && (
        <ul className="missing" aria-label={`What ${shortDate(date)} was missing`}>
          {gaps.map((task) => (
            <li key={task.id}>{missing(attempt, missed, task.id)}</li>
          ))}
        </ul>
      )}
      <p className="missed-copy">
        {blank
          ? `Nothing's logged for ${shortDate(date)} yet. Fill in what you did. If you missed something: Fail = Start Over.`
          : `${shortDate(date)}. Did it and forgot to tick it? Log it now. If not: Fail = Start Over.`}
      </p>
      <button className="btn primary" onClick={() => onOpenDay(date)}>
        {blank ? 'Fill it in' : `Log Day ${missed}`}
      </button>
      <button className="btn danger" onClick={end}>
        Start over at Day 1
      </button>
      {made > 0 && (
        <p className="fine">
          {made} {made === 1 ? 'day' : 'days'} in a row before it.
        </p>
      )}
      {confirmSheet}
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
        {monthDay(attempt.start)} to {monthDay(finishDate(attempt))}. You went for it.
      </p>
      <StatTiles totals={totals(attempt, today)} />
      <button className="btn primary" onClick={onEnd}>
        Start another 92
      </button>
    </section>
  )
}
