import { CLUBS, SKILL_LEVELS, defaultBag, type ClubId, type SkillLevel } from '../lib/clubs'
import type { Course } from '../lib/course'
import type { Profile } from '../lib/profile'
import type { Unit } from '../lib/units'

interface SettingsViewProps {
  profile: Profile
  course: Course | null
  holeNumber: number
  hasPosition: boolean
  usingManualPosition: boolean
  tapMode: 'none' | 'pin' | 'tee' | 'me'
  onProfile: (patch: Partial<Profile>) => void
  onSkill: (skill: SkillLevel) => void
  onChangeCourse: () => void
  onTapMode: (mode: 'none' | 'pin' | 'tee' | 'me') => void
  onTeeHere: () => void
  onPar: (par: number | null) => void
  onUseGps: () => void
  onNewRound: () => void
  onClearHistory: () => void
}

/** Everything that isn't the next shot lives here, out of the way. */
export function SettingsView(p: SettingsViewProps) {
  const hole = p.course?.holes.find((h) => h.number === p.holeNumber) ?? null

  const toggleClub = (club: ClubId) => {
    const has = p.profile.bag.includes(club)
    const bag = has
      ? p.profile.bag.filter((c) => c !== club)
      : CLUBS.map((c) => c.id).filter((c) => c === club || p.profile.bag.includes(c))
    if (bag.length > 0) p.onProfile({ bag })
  }

  return (
    <div className="stack">
      <section className="card">
        <h3 className="section-title">
          <span aria-hidden="true">🏌️</span> You
        </h3>
        <span className="label">Level</span>
        <div className="pick">
          {SKILL_LEVELS.map((s) => (
            <button key={s.id} type="button" title={s.hint} className={p.profile.skill === s.id ? 'on' : ''} onClick={() => p.onSkill(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <span className="label">Units</span>
        <div className="pick">
          {(['yd', 'm'] as Unit[]).map((u) => (
            <button key={u} type="button" className={p.profile.unit === u ? 'on' : ''} onClick={() => p.onProfile({ unit: u })}>
              {u === 'yd' ? 'Yards' : 'Metres'}
            </button>
          ))}
        </div>
        <span className="label">Bag</span>
        <div className="pick">
          {CLUBS.filter((c) => c.id !== 'P').map((c) => (
            <button key={c.id} type="button" className={p.profile.bag.includes(c.id) ? 'on' : ''} onClick={() => toggleClub(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="plain" onClick={() => p.onProfile({ bag: defaultBag(p.profile.skill) })}>
            Reset bag
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">
          <span aria-hidden="true">⛳</span> Hole {p.holeNumber}
        </h3>
        <span className="label">Par</span>
        <div className="pick">
          {[3, 4, 5].map((par) => (
            <button key={par} type="button" disabled={!hole} className={hole?.par === par ? 'on' : ''} onClick={() => p.onPar(hole?.par === par ? null : par)}>
              {par}
            </button>
          ))}
        </div>
        <div className="row">
          <button type="button" className={`plain${p.tapMode === 'pin' ? ' strong' : ''}`} onClick={() => p.onTapMode(p.tapMode === 'pin' ? 'none' : 'pin')}>
            {p.tapMode === 'pin' ? 'Cancel' : '📍 Move flag'}
          </button>
          <button type="button" className="plain" onClick={p.onTeeHere} disabled={!hole || !p.hasPosition}>
            Tee is here
          </button>
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">
          <span aria-hidden="true">🗺️</span> Course &amp; round
        </h3>
        <p className="note">{p.course ? `${p.course.name} · ${p.course.holes.length} holes` : 'No course yet.'}</p>
        <div className="row">
          <button type="button" className="plain strong" onClick={p.onChangeCourse}>
            Change course
          </button>
          <button type="button" className="plain" onClick={p.onNewRound}>
            New round
          </button>
        </div>
        <div className="row">
          <button type="button" className={`plain${p.tapMode === 'me' ? ' strong' : ''}`} onClick={() => p.onTapMode(p.tapMode === 'me' ? 'none' : 'me')}>
            {p.tapMode === 'me' ? 'Cancel' : '🚶 Place me'}
          </button>
          <button type="button" className="plain" onClick={p.onUseGps} disabled={!p.usingManualPosition}>
            Back to GPS
          </button>
        </div>
        <div className="row">
          <button type="button" className="plain danger" onClick={p.onClearHistory}>
            Forget all shots
          </button>
        </div>
      </section>
    </div>
  )
}
