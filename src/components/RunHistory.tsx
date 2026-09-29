import { lifetimeTotals, weekStreak, weekTotals, type RunRecord } from '../lib/runHistory'
import { formatDistance, formatDuration, formatPace, metersToDistance, type DistanceUnit } from '../lib/units'

interface RunHistoryProps {
  runs: RunRecord[]
  distanceUnit: DistanceUnit
  now?: Date
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function shortDate(iso: string): string {
  const date = new Date(iso)
  return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** This week, the streak, and the last few runs — the log every running app leads with. */
export function RunHistory({ runs, distanceUnit, now = new Date() }: RunHistoryProps) {
  if (runs.length === 0) return null

  const week = weekTotals(runs, now)
  const streak = weekStreak(runs, now)
  const lifetime = lifetimeTotals(runs)

  return (
    <section className="panel-section run-history">
      <h2>Your running</h2>
      <div className="history-tiles">
        <div className="history-tile">
          <span className="history-value">{metersToDistance(week.distance, distanceUnit).toFixed(1)}</span>
          <span className="history-label">{distanceUnit} this week</span>
        </div>
        <div className="history-tile">
          <span className="history-value">{week.runs}</span>
          <span className="history-label">{week.runs === 1 ? 'run' : 'runs'} this week</span>
        </div>
        <div className="history-tile">
          <span className="history-value">
            {streak > 0 ? <span aria-hidden="true">🔥</span> : null}
            {streak}
          </span>
          <span className="history-label">week streak</span>
        </div>
      </div>

      <ul className="history-list">
        {runs.slice(0, 3).map((run) => (
          <li key={run.id}>
            <span className="history-date">{shortDate(run.finishedAt)}</span>
            <span className="history-stats">
              {formatDistance(run.distance, distanceUnit)} · {formatDuration(run.movingSeconds)}
              {run.distance >= 200 && run.movingSeconds > 0
                ? ` · ${formatPace(run.movingSeconds / metersToDistance(run.distance, distanceUnit), distanceUnit)}`
                : ''}
            </span>
          </li>
        ))}
      </ul>
      <p className="hint">
        {lifetime.runs} {lifetime.runs === 1 ? 'run' : 'runs'} · {formatDistance(lifetime.distance, distanceUnit)} all time
      </p>
    </section>
  )
}
