import { clubName } from '../lib/clubs'
import { insights } from '../lib/coach'
import { bagEstimates, clubStats } from '../lib/learning'
import type { Profile } from '../lib/profile'
import type { Shot } from '../lib/shots'
import { formatDistance, formatSpread } from '../lib/units'

interface StatsViewProps {
  shots: Shot[]
  profile: Profile
}

const SOURCE_LABEL = { chart: 'chart', blended: 'blending', learned: 'yours' } as const

export function StatsView({ shots, profile }: StatsViewProps) {
  const unit = profile.unit
  const estimates = bagEstimates(profile, shots)
  const tips = insights(shots, profile)
  const tracked = shots.filter((s) => s.distance !== null).length

  return (
    <div className="stack">
      <section className="card">
        <h3>Coach</h3>
        <ul className="insights">
          {tips.map((tip, i) => (
            <li key={i} className={`insight insight-${tip.kind}`}>
              <strong>{tip.title}</strong>
              <p>{tip.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Your distances</h3>
        <p className="muted small">
          {tracked} tracked shot{tracked === 1 ? '' : 's'}. The caddie plans with the middle column; it starts on the {profile.skill} chart and moves to your real numbers as you track.
        </p>
        <div className="table-wrap">
          <table className="club-table">
            <thead>
              <tr>
                <th>Club</th>
                <th>Plans on</th>
                <th>Chart</th>
                <th>Tracked</th>
                <th>Range</th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((e) => {
                const stats = clubStats(shots, e.club, profile)
                return (
                  <tr key={e.club} className={`source-${e.source}`}>
                    <td>{clubName(e.club)}</td>
                    <td>
                      <strong>{formatDistance(e.distance, unit)}</strong> {formatSpread(e.spread, unit)}
                      <small> {SOURCE_LABEL[e.source]}</small>
                    </td>
                    <td>{formatDistance(e.chart, unit)}</td>
                    <td>{stats ? `${stats.count} · avg ${formatDistance(stats.mean, unit)}` : '—'}</td>
                    <td>{stats && stats.count > 1 ? `${formatDistance(stats.shortest, unit)} – ${formatDistance(stats.longest, unit)}` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
