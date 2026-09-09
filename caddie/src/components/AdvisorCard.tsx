import type { Advice } from '../lib/advisor'
import { clubName } from '../lib/clubs'
import { AGGRESSIVENESS, type Aggressiveness, type Profile } from '../lib/profile'
import type { Lie } from '../lib/shots'
import { formatDistance } from '../lib/units'

interface AdvisorCardProps {
  advice: Advice | null
  profile: Profile
  lie: Lie
  onLie: (lie: Lie) => void
  onAggressiveness: (a: Aggressiveness) => void
}

/** How each call to action is dressed. Two words, never three. */
const MODE: Record<Advice['mode'], { label: string; tone: string }> = {
  attack: { label: 'Send it', tone: 'go' },
  layup: { label: 'Lay up', tone: 'wait' },
  pitch: { label: 'Little one', tone: 'soft' },
  putt: { label: 'Roll it', tone: 'soft' },
}

/** Lies are picked by picture: nobody reads a word list standing over a ball. */
const LIE_ICONS: Array<{ id: Lie; icon: string; label: string }> = [
  { id: 'tee', icon: '⛳', label: 'Tee' },
  { id: 'fairway', icon: '🟩', label: 'Fair' },
  { id: 'rough', icon: '🌾', label: 'Rough' },
  { id: 'sand', icon: '🏖️', label: 'Sand' },
  { id: 'green', icon: '🕳️', label: 'Green' },
]

const MOOD: Record<Aggressiveness, string> = { conservative: '🐢', balanced: '😎', aggressive: '🔥' }

/** "7 iron" reads better as a big 7 with a small word under it. */
function splitClub(name: string): { big: string; small: string } {
  const match = /^(\d+|Pitching|Gap|Sand|Lob)\s+(.*)$/.exec(name)
  if (!match) return { big: name, small: '' }
  return { big: match[1], small: match[2] }
}

export function AdvisorCard({ advice, profile, lie, onLie, onAggressiveness }: AdvisorCardProps) {
  return (
    <section className="card hero">
      <div className="lie-row" role="radiogroup" aria-label="How the ball is lying">
        {LIE_ICONS.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={lie === l.id}
            aria-label={l.label}
            title={l.label}
            className={`lie-pip${lie === l.id ? ' on' : ''}`}
            onClick={() => onLie(l.id)}
          >
            <span aria-hidden="true">{l.icon}</span>
            <em>{l.label}</em>
          </button>
        ))}
      </div>

      {advice ? (
        <>
          <div className="club-card" key={`${advice.club}-${advice.mode}`}>
            <span className={`mode mode-${MODE[advice.mode].tone}`}>{MODE[advice.mode].label}</span>
            <div className="club-name">
              {(() => {
                const { big, small } = splitClub(clubName(advice.club))
                return (
                  <>
                    <strong>{big}</strong>
                    {small && <span>{small}</span>}
                  </>
                )
              })()}
            </div>
            {advice.mode !== 'putt' && advice.mode !== 'pitch' && (
              <p className="club-carry">{formatDistance(advice.expected, profile.unit)}</p>
            )}
          </div>

          {advice.tips.length > 0 && (
            <ul className="chips">
              {advice.tips.map((tip, i) => (
                <li key={`${tip.icon}${tip.text}`} style={{ animationDelay: `${60 + i * 55}ms` }}>
                  <span aria-hidden="true">{tip.icon}</span>
                  {tip.text}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="empty">
          <span aria-hidden="true">🛰️</span> Finding you…
        </p>
      )}

      <div className="mood" role="radiogroup" aria-label="How aggressively to play">
        {AGGRESSIVENESS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="radio"
            aria-checked={profile.aggressiveness === a.id}
            aria-label={a.label}
            title={`${a.label} — ${a.hint}`}
            className={profile.aggressiveness === a.id ? 'on' : ''}
            onClick={() => onAggressiveness(a.id)}
          >
            <span aria-hidden="true">{MOOD[a.id]}</span>
            <em>{a.label}</em>
          </button>
        ))}
      </div>
    </section>
  )
}
