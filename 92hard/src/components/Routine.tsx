import { weekday, type DateKey } from '../lib/dates'
import { ROUTINE, SLEEP, clock, slotTime, timeSpan, upNext } from '../lib/plan'
import { useMinutes } from '../hooks'

/** One glance at the routine on Today: what's on now, and what's next. */
export function RoutineNow({ today, onOpen }: { today: DateKey; onOpen: () => void }) {
  const minutes = useMinutes()
  const { now, next } = upNext(weekday(today), minutes)
  return (
    <button className="routine-now" onClick={onOpen} aria-label={`${now ? `Now: ${now.what}. ` : ''}Next: ${next.what}. Open the routine`}>
      {now && now.end !== undefined && (
        <span className="rn-row">
          <span className="rn-tag now">Now</span>
          <span className="rn-what">{now.what}</span>
          <span className="rn-time">till {clock(now.end)}</span>
        </span>
      )}
      <span className="rn-row">
        <span className="rn-tag">Next</span>
        <span className="rn-what">{next.what}</span>
        <span className="rn-time">{next.start === null ? 'Tonight' : clock(next.start)}</span>
      </span>
    </button>
  )
}

/** The routine as written, with today's part marked. */
export function RoutineList({ today }: { today: DateKey }) {
  const day = weekday(today)
  return (
    <div className="routine">
      <div className="routine-group">
        <div className="routine-row">
          <span className="routine-label">Sleep</span>
          <span className="routine-time">{timeSpan(SLEEP.start, SLEEP.end)}</span>
        </div>
      </div>
      {ROUTINE.map((group) => {
        const isToday = group.days.includes(day)
        return (
          <div className={isToday ? 'routine-group today' : 'routine-group'} key={group.label}>
            <span className="routine-label">
              {group.label}
              {isToday && <span className="routine-today">Today</span>}
            </span>
            <ul className="routine-slots">
              {group.slots.map((slot) => (
                <li key={slot.what}>
                  <span className="routine-time">{slotTime(slot)}</span>
                  <span className="routine-what">
                    {slot.what}
                    {slot.note && <span className="routine-note">{slot.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
