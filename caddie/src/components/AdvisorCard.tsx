import type { Advice } from '../lib/advisor'
import { clubName, SKILL_LEVELS, type SkillLevel } from '../lib/clubs'
import { AGGRESSIVENESS, type Aggressiveness, type Profile } from '../lib/profile'
import { LIES, type Lie } from '../lib/shots'
import { formatDistance, formatSpread } from '../lib/units'

interface AdvisorCardProps {
  advice: Advice | null
  profile: Profile
  lie: Lie
  onLie: (lie: Lie) => void
  onSkill: (skill: SkillLevel) => void
  onAggressiveness: (a: Aggressiveness) => void
}

const MODE_LABEL: Record<Advice['mode'], string> = { attack: 'Go for it', layup: 'Lay up', putt: 'Putt', pitch: 'Pitch' }

export function AdvisorCard({ advice, profile, lie, onLie, onSkill, onAggressiveness }: AdvisorCardProps) {
  const unit = profile.unit
  return (
    <section className="card advisor">
      <div className="segmented" role="radiogroup" aria-label="Lie">
        {LIES.map((l) => (
          <button key={l.id} type="button" role="radio" aria-checked={lie === l.id} className={lie === l.id ? 'on' : ''} onClick={() => onLie(l.id)}>
            {l.label}
          </button>
        ))}
      </div>

      {advice ? (
        <div className="advice">
          <div className="advice-main">
            <span className={`mode mode-${advice.mode}`}>{MODE_LABEL[advice.mode]}</span>
            <h2>{clubName(advice.club)}</h2>
            {advice.mode !== 'putt' && advice.mode !== 'pitch' && (
              <p className="advice-numbers">
                {formatDistance(advice.expected, unit)} {formatSpread(advice.spread, unit)}
                {advice.mode === 'layup' ? ` · lands ${formatDistance(advice.aim, unit)} out` : ` · target ${formatDistance(advice.aim, unit)}`}
                {advice.risk > 0.01 ? ` · ${Math.round(advice.risk * 100)}% hazard` : ''}
                {advice.greenOdds !== null ? ` · ${Math.round(advice.greenOdds * 100)}% on the green` : ''}
              </p>
            )}
            {(advice.longer || advice.shorter) && (
              <p className="advice-alt">
                {advice.longer ? `More: ${clubName(advice.longer)}` : ''}
                {advice.longer && advice.shorter ? ' · ' : ''}
                {advice.shorter ? `Less: ${clubName(advice.shorter)}` : ''}
              </p>
            )}
          </div>
          <ul className="coach-notes">
            {advice.notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">Pick a hole and let the GPS find you to get a club.</p>
      )}

      <div className="toggles">
        <label>
          <span>Player</span>
          <div className="segmented small" role="radiogroup" aria-label="Skill level">
            {SKILL_LEVELS.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={profile.skill === s.id} className={profile.skill === s.id ? 'on' : ''} title={s.hint} onClick={() => onSkill(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </label>
        <label>
          <span>Mindset</span>
          <div className="segmented small" role="radiogroup" aria-label="Aggressiveness">
            {AGGRESSIVENESS.map((a) => (
              <button key={a.id} type="button" role="radio" aria-checked={profile.aggressiveness === a.id} className={profile.aggressiveness === a.id ? 'on' : ''} title={a.hint} onClick={() => onAggressiveness(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        </label>
      </div>
    </section>
  )
}
