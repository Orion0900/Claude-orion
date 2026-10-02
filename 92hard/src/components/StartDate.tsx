import { useState } from 'react'
import { CHALLENGE_DAYS, finishDate, newAttempt, startRange, type Attempt } from '../lib/challenge'
import { addDays, daysBetween, isDateKey, shortDate, type DateKey } from '../lib/dates'
import { isBlank } from '../lib/tasks'
import { Icon } from './Icons'
import { Sheet } from './Sheet'

const QUICK: Array<[string, number]> = [
  ['Yesterday', -1],
  ['Today', 0],
  ['Tomorrow', 1],
]

/** Day 1: a tap for yesterday, today or tomorrow, or any date from the phone's own picker. */
export function DayOnePicker({ today, value, onChange }: { today: DateKey; value: DateKey; onChange: (date: DateKey) => void }) {
  const offset = daysBetween(today, value)
  const quick = QUICK.some(([, n]) => n === offset)
  const [other, setOther] = useState(!quick)
  const [min, max] = startRange(today)
  return (
    <div className="day-one">
      <div className="seg four" role="radiogroup" aria-label="Day 1">
        {QUICK.map(([label, n]) => {
          const on = !other && offset === n
          return (
            <button
              key={label}
              role="radio"
              aria-checked={on}
              className={on ? 'on' : ''}
              onClick={() => {
                setOther(false)
                onChange(addDays(today, n))
              }}
            >
              {label}
            </button>
          )
        })}
        <button role="radio" aria-checked={other} className={other ? 'on' : ''} onClick={() => setOther(true)}>
          Other
        </button>
      </div>
      {other && (
        <label className="date-field">
          <span>Day 1</span>
          <input
            type="date"
            value={value}
            min={min}
            max={max}
            onChange={(e) => {
              const date = e.target.value
              // The iPhone's picker doesn't hold to min and max, so they're held to here.
              if (isDateKey(date)) onChange(date < min ? min : date > max ? max : date)
            }}
          />
        </label>
      )}
    </div>
  )
}

/** Says which days from Day 1 up to yesterday are still to be filled in. */
export function FillInNote({ start, today, logs = {} }: { start: DateKey; today: DateKey; logs?: Attempt['logs'] }) {
  const blank: DateKey[] = []
  for (let date = start; date < today && blank.length < CHALLENGE_DAYS; date = addDays(date, 1)) {
    if (!logs[date] || isBlank(logs[date])) blank.push(date)
  }
  if (blank.length === 0) return null
  return (
    <p className="fill-note">
      <Icon name="pencil" size={16} />
      {blank.length === 1 ? `You'll fill in ${shortDate(blank[0])} next.` : `You'll fill in ${blank.length} earlier days next.`}
    </p>
  )
}

/** Moves Day 1 of the run under way. */
export function StartDateSheet({
  attempt,
  today,
  onSave,
  onClose,
}: {
  attempt: Attempt
  today: DateKey
  onSave: (start: DateKey) => void
  onClose: () => void
}) {
  const [start, setStart] = useState(attempt.start)
  // Logged days the new Day 1 would leave behind.
  const left = Object.entries(attempt.logs).filter(
    ([date, log]) => date >= attempt.start && date < start && !isBlank(log),
  ).length
  const changed = start !== attempt.start || attempt.carried > 0
  return (
    <Sheet label="Change Day 1" onClose={onClose}>
      <header className="sheet-head">
        <span className="sheet-day">Change Day 1</span>
        <button className="icon-btn" aria-label="Close" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="start-sheet">
        <DayOnePicker today={today} value={start} onChange={setStart} />
        <p className="start-dates">
          Day 1 {shortDate(start)} <span aria-hidden="true">→</span> Day 92 {shortDate(finishDate(newAttempt(start)))}
        </p>
        <p className="card-copy">
          Everything logged stays on the day it happened.
          {left > 0 && ` ${left} logged ${left === 1 ? 'day falls' : 'days fall'} before the new Day 1 and won't count.`}
        </p>
        <FillInNote start={start} today={today} logs={attempt.logs} />
        <button className="btn primary" disabled={!changed} onClick={() => onSave(start)}>
          Save
        </button>
      </div>
    </Sheet>
  )
}
