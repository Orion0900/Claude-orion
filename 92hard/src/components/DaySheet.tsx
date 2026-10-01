import { useEffect } from 'react'
import { dayNumber, logFor, type Attempt } from '../lib/challenge'
import { shortDate, type DateKey } from '../lib/dates'
import { TASKS, isDayComplete, tasksDone } from '../lib/tasks'
import { Icon } from './Icons'
import { TaskList, type LogChange } from './TaskList'

/** A past day's log, open for the ticks that were forgotten at the time. */
export function DaySheet({
  attempt,
  date,
  onChange,
  onClose,
}: {
  attempt: Attempt
  date: DateKey
  onChange: LogChange
  onClose: () => void
}) {
  const day = dayNumber(attempt, date)
  const carried = day <= attempt.carried
  const log = logFor(attempt, date)
  const complete = carried || isDayComplete(log)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={`Day ${day}`} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <div>
            <span className="sheet-day">Day {day}</span>
            <span className="sheet-date">{shortDate(date)}</span>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <p className={complete ? 'sheet-status done' : 'sheet-status'}>
          {carried
            ? 'Done before 92 Hard was keeping count.'
            : complete
              ? 'All four done.'
              : `${tasksDone(log)} of ${TASKS.length} done.`}
        </p>
        {!carried && <TaskList key={date} log={log} onChange={onChange} />}
      </div>
    </div>
  )
}
