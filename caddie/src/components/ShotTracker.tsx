import { useState } from 'react'
import { clubName, type ClubId } from '../lib/clubs'
import type { Shot } from '../lib/shots'
import { formatDistance, fromUnit, toUnit, type Unit } from '../lib/units'

interface DockProps {
  shots: Shot[]
  bag: ClubId[]
  /** The club the caddie suggested; it wears a star and sits selected. */
  suggested: ClubId | null
  selected: ClubId | null
  onSelectClub: (club: ClubId) => void
  canMark: boolean
  onMark: () => void
  onHoleOut: () => void
  onUndo: () => void
}

/** Short enough to fit on a pill: "7i", "PW", "Dr". */
const SHORT: Partial<Record<ClubId, string>> = { D: 'Dr', '3W': '3W', '5W': '5W', '4H': '4H', P: 'Pt' }
const short = (club: ClubId) => SHORT[club] ?? club

/**
 * The three things a golfer does standing over the ball, always within reach.
 *
 * This is pinned to the bottom of the screen rather than living in the scroll,
 * because the primary action belongs in the thumb's easy zone and must never
 * need scrolling to find.
 */
export function ShotDock({ shots, bag, suggested, selected, onSelectClub, canMark, onMark, onHoleOut, onUndo }: DockProps) {
  const club = selected ?? suggested ?? bag[0]
  const inFlight = shots.length > 0 && shots[shots.length - 1].end === null

  return (
    <div className="dock">
      <div className="club-strip" role="radiogroup" aria-label="Club for this shot">
        {bag.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={club === c}
            aria-label={clubName(c)}
            title={clubName(c)}
            className={`club-pill${club === c ? ' on' : ''}${c === suggested ? ' starred' : ''}`}
            onClick={() => onSelectClub(c)}
          >
            {short(c)}
          </button>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="big" onClick={onMark} disabled={!canMark}>
          <span aria-hidden="true">🏌️</span>
          {inFlight ? 'Next shot' : 'Mark shot'}
        </button>
        <button type="button" className="minor" onClick={onHoleOut} disabled={!inFlight}>
          Holed
        </button>
        <button type="button" className="minor" onClick={onUndo} disabled={shots.length === 0} aria-label="Undo last shot">
          Undo
        </button>
      </div>
    </div>
  )
}

/** The shots already played on this hole, and what they measured. */
export function ShotList({
  shots,
  unit,
  onDistance,
  onDeleteShot,
}: {
  shots: Shot[]
  unit: Unit
  onDistance: (shotId: string, meters: number | null) => void
  onDeleteShot: (shotId: string) => void
}) {
  if (shots.length === 0) return null
  return (
    <section className="card">
      <ol className="shot-list bare">
        {shots.map((shot) => (
          <ShotRow key={shot.id} shot={shot} unit={unit} onDistance={onDistance} onDelete={onDeleteShot} />
        ))}
      </ol>
    </section>
  )
}

function ShotRow({
  shot,
  unit,
  onDistance,
  onDelete,
}: {
  shot: Shot
  unit: Unit
  onDistance: (id: string, m: number | null) => void
  onDelete: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const delta = shot.distance !== null && shot.plan ? shot.distance - shot.plan.expected : null

  const commit = () => {
    const value = parseFloat(draft)
    onDistance(shot.id, Number.isFinite(value) && value >= 0 ? fromUnit(value, unit) : null)
    setEditing(false)
  }

  return (
    <li>
      <span className="shot-no">{shot.number}</span>
      <span className="shot-club">{clubName(shot.club)}</span>
      {editing ? (
        <input
          type="number"
          inputMode="decimal"
          autoFocus
          value={draft}
          placeholder={unit}
          aria-label="Distance"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          type="button"
          className="shot-dist"
          title="Tap to type the real distance"
          onClick={() => {
            setDraft(shot.distance === null ? '' : String(Math.round(toUnit(shot.distance, unit))))
            setEditing(true)
          }}
        >
          {shot.distance === null ? '···' : formatDistance(shot.distance, unit)}
          {shot.manual ? '*' : ''}
        </button>
      )}
      {delta !== null && Math.abs(toUnit(delta, unit)) >= 5 && (
        <span className={`shot-delta ${delta > 0 ? 'long' : 'short'}`}>
          {delta > 0 ? '+' : '−'}
          {Math.round(Math.abs(toUnit(delta, unit)))}
        </span>
      )}
      <button type="button" className="shot-x" onClick={() => onDelete(shot.id)} aria-label={`Delete shot ${shot.number}`}>
        ×
      </button>
    </li>
  )
}
