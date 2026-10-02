import { CHALLENGE_DAYS, dayNumber, dayTasks, type Attempt } from '../lib/challenge'
import { addDays, shortDate, type DateKey } from '../lib/dates'
import { useConfirm } from './Confirm'
import { Icon } from './Icons'
import { Sheet } from './Sheet'
import { TaskList, type LogChange } from './TaskList'

/** A past day's log, to fill in after the fact or fix. The arrows step to the days either side. */
export function DaySheet({
  attempt,
  date,
  today,
  onChange,
  onNavigate,
  onFillIn,
  onClose,
}: {
  attempt: Attempt
  date: DateKey
  today: DateKey
  onChange: LogChange
  onNavigate: (date: DateKey) => void
  /** Opens a day counted as done without a log, and the counted days after it, to be filled in. */
  onFillIn: (day: number) => void
  onClose: () => void
}) {
  const day = dayNumber(attempt, date)
  const last = Math.min(dayNumber(attempt, today), CHALLENGE_DAYS)
  const carried = day <= attempt.carried
  const tasks = dayTasks(attempt, day)
  const done = tasks.filter((task) => task.done).length
  const complete = carried || done === tasks.length
  const [confirmSheet, ask] = useConfirm()

  const fillIn = async () => {
    const through = attempt.carried
    const ok =
      through === day ||
      (await ask({
        title: `Fill in Days ${day}–${through}?`,
        body: `They stop counting as done until each one is filled in.`,
        action: 'Fill them in',
      }))
    if (ok) onFillIn(day)
  }

  return (
    <Sheet label={`Day ${day}`} onClose={onClose}>
      <header className="sheet-head">
        <div>
          <span className="sheet-day">Day {day}</span>
          <span className="sheet-date">{shortDate(date)}</span>
        </div>
        <div className="sheet-nav">
          <button className="icon-btn" aria-label="Day before" disabled={day <= 1} onClick={() => onNavigate(addDays(date, -1))}>
            <Icon name="back" />
          </button>
          <button className="icon-btn" aria-label="Day after" disabled={day >= last} onClick={() => onNavigate(addDays(date, 1))}>
            <Icon name="forward" />
          </button>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
      </header>
      <p className={complete ? 'sheet-status done' : 'sheet-status'}>
        {carried ? 'Counted as done, with nothing logged.' : complete ? 'All done.' : `${done} of ${tasks.length} done.`}
      </p>
      {carried ? (
        <button className="btn fill-btn" onClick={fillIn}>
          Fill it in
        </button>
      ) : (
        <TaskList key={date} attempt={attempt} date={date} today={today} onChange={onChange} />
      )}
      {confirmSheet}
    </Sheet>
  )
}
