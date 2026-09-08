import { CLUBS, defaultBag, type ClubId } from '../lib/clubs'
import type { Course } from '../lib/course'
import type { Profile } from '../lib/profile'
import type { Unit } from '../lib/units'

interface SettingsViewProps {
  profile: Profile
  course: Course | null
  courseStatus: string | null
  /** True once the player's position is known, which "Tee is here" needs. */
  hasPosition: boolean
  tapMode: 'none' | 'pin' | 'tee' | 'me'
  holeNumber: number
  usingManualPosition: boolean
  onProfile: (patch: Partial<Profile>) => void
  onChangeCourse: () => void
  onTapMode: (mode: 'none' | 'pin' | 'tee' | 'me') => void
  onTeeHere: () => void
  onPar: (par: number | null) => void
  onUseGps: () => void
  onNewRound: () => void
  onClearHistory: () => void
}

export function SettingsView(p: SettingsViewProps) {
  const hole = p.course?.holes.find((h) => h.number === p.holeNumber) ?? null
  const toggleClub = (club: ClubId) => {
    const has = p.profile.bag.includes(club)
    const bag = has ? p.profile.bag.filter((c) => c !== club) : CLUBS.map((c) => c.id).filter((c) => c === club || p.profile.bag.includes(c))
    if (bag.length === 0) return
    p.onProfile({ bag })
  }
  const tapButton = (mode: 'pin' | 'tee' | 'me', label: string) => (
    <button type="button" className={p.tapMode === mode ? 'on' : ''} onClick={() => p.onTapMode(p.tapMode === mode ? 'none' : mode)}>
      {p.tapMode === mode ? 'Cancel' : label}
    </button>
  )

  return (
    <div className="stack">
      <section className="card">
        <h3>Course</h3>
        <p className="muted small">
          {p.course ? `${p.course.name} · ${p.course.holes.length} hole${p.course.holes.length === 1 ? '' : 's'} · ${p.course.source === 'osm' ? 'from OpenStreetMap' : 'set by hand'}` : 'No course loaded.'}
        </p>
        {p.courseStatus && <p className="status">{p.courseStatus}</p>}
        <div className="button-row">
          <button type="button" className="primary" onClick={p.onChangeCourse}>
            Change course
          </button>
        </div>
        <h4>Hole {p.holeNumber}</h4>
        <div className="button-row">
          {tapButton('pin', hole ? 'Move the flag' : 'Set the flag')}
          {tapButton('tee', 'Set tee by tap')}
          <button type="button" onClick={p.onTeeHere} disabled={!hole || !p.hasPosition}>
            Tee is here
          </button>
        </div>
        <label className="inline">
          <span>Par</span>
          <select value={hole?.par ?? ''} onChange={(e) => p.onPar(e.target.value ? parseInt(e.target.value, 10) : null)} disabled={!hole}>
            <option value="">—</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
        <p className="muted small">
          Any hole can be moved: the flag position from OpenStreetMap is the middle of the green, so set today's pin for exact numbers.
        </p>
      </section>

      <section className="card">
        <h3>Position</h3>
        <div className="button-row">
          {tapButton('me', 'Place me by tap')}
          <button type="button" onClick={p.onUseGps} disabled={!p.usingManualPosition}>
            Back to GPS
          </button>
        </div>
        <p className="muted small">Placing yourself by tap is for planning a hole from the couch, or when the phone has no GPS.</p>
      </section>

      <section className="card">
        <h3>Units</h3>
        <div className="segmented small">
          {(['yd', 'm'] as Unit[]).map((u) => (
            <button key={u} type="button" className={p.profile.unit === u ? 'on' : ''} onClick={() => p.onProfile({ unit: u })}>
              {u === 'yd' ? 'Yards' : 'Meters'}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>Bag</h3>
        <div className="bag">
          {CLUBS.filter((c) => c.id !== 'P').map((c) => (
            <button key={c.id} type="button" className={p.profile.bag.includes(c.id) ? 'on' : ''} onClick={() => toggleClub(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <button type="button" className="link" onClick={() => p.onProfile({ bag: defaultBag(p.profile.skill) })}>
          Reset to the usual {p.profile.skill} bag
        </button>
      </section>

      <section className="card">
        <h3>Rounds</h3>
        <div className="button-row">
          <button type="button" onClick={p.onNewRound}>
            Start a new round
          </button>
          <button type="button" className="danger" onClick={p.onClearHistory}>
            Forget all tracked shots
          </button>
        </div>
        <p className="muted small">
          A new round asks which hole you're starting on and keeps your history; the caddie learns across rounds.
        </p>
      </section>
    </div>
  )
}
