import { clubName } from '../lib/clubs'
import { insights } from '../lib/coach'
import { bagEstimates, clubStats } from '../lib/learning'
import type { Profile } from '../lib/profile'
import type { Shot } from '../lib/shots'
import { toUnit } from '../lib/units'

interface StatsViewProps {
  shots: Shot[]
  profile: Profile
}

const EMOJI = { distance: '📏', tendency: '🎯', consistency: '🎚️', progress: '🌱' } as const

/**
 * What the caddie has learned, as a picture.
 *
 * A table of five columns was a spreadsheet. The same truth fits in a bar per
 * club: how far it goes, and whether that number is yours yet.
 */
export function StatsView({ shots, profile }: StatsViewProps) {
  const estimates = bagEstimates(profile, shots)
  // Bars are scaled across the bag's own range, not from zero: every club in
  // a bag carries a long way, so from zero they'd all look the same length.
  const longest = estimates[0]?.distance ?? 1
  const shortest = estimates[estimates.length - 1]?.distance ?? 0
  const span = Math.max(1, longest - shortest)
  const width = (metres: number) => 18 + ((metres - shortest) / span) * 82

  return (
    <div className="stack">
      <section className="card">
        <h3 className="section-title">
          <span aria-hidden="true">🧠</span> Coach
        </h3>
        <ul className="insights">
          {insights(shots, profile).map((tip, i) => (
            <li key={i} className="insight" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="emoji" aria-hidden="true">
                {EMOJI[tip.kind]}
              </span>
              <div>
                <strong>{tip.title}</strong>
                <p>{tip.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3 className="section-title">
          <span aria-hidden="true">🏌️</span> Your bag
        </h3>
        <ul className="bars">
          {estimates.map((e, i) => {
            const stats = clubStats(shots, e.club, profile)
            return (
              <li key={e.club}>
                <span className="name">{clubName(e.club)}</span>
                <span className="track">
                  <span
                    className={`fill${e.source === 'learned' ? ' learned' : ''}`}
                    style={{ width: `${width(e.distance)}%`, animationDelay: `${i * 45}ms` }}
                  />
                </span>
                <span className="num">
                  {Math.round(toUnit(e.distance, profile.unit))}
                  {stats ? <small> ·{stats.count}</small> : null}
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
