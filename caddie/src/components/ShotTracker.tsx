import { useState } from 'react'
import { clubName, type ClubId } from '../lib/clubs'
import type { Shot } from '../lib/shots'
import { formatDistance, fromUnit, toUnit, type Unit } from '../lib/units'

interface ShotTrackerProps {
  shots: Shot[]
  bag: ClubId[]
  /** The club the advisor suggested; the picker starts on it. */
  suggested: ClubId | null
  selected: ClubId | null
  onSelectClub: (club: ClubId) => void
  unit: Unit
  canMark: boolean
  onMark: () => void
  onHoleOut: () => void
  onUndo: () => void
  onDistance: (shotId: string, meters: number | null) => void
  onDeleteShot: (shotId: string) => void
}

export function ShotTracker({ shots, bag, suggested, selected, onSelectClub, unit, canMark, onMark, onHoleOut, onUndo, onDistance, onDeleteShot }: ShotTrackerProps) {
  const club = selected ?? suggested ?? bag[0]
  const open = shots[shots.length - 1]?.end === null
  return (
    <section className="card tracker">
      <div className="tracker-row">
        <select className="club-select" value={club} onChange={(e) => onSelectClub(e.target.value as ClubId)} aria-label="Club for this shot">
          {bag.map((c) => (
            <option key={c} value={c}>
              {clubName(c)}
              {c === suggested ? ' (caddie)' : ''}
            </option>
          ))}
        </select>
        <button type="button" className="primary" onClick={onMark} disabled={!canMark} title={canMark ? '' : 'Waiting for your position'}>
          {open ? 'Mark next shot' : 'Mark shot'}
        </button>
      </div>
      <div className="tracker-row secondary">
        <button type="button" onClick={onHoleOut} disabled={!open}>
          Holed out
        </button>
        <button type="button" onClick={onUndo} disabled={shots.length === 0}>
          Undo
        </button>
      </div>
      {shots.length > 0 && (
        <ol className="shot-list">
          {shots.map((shot) => (
            <ShotRow key={shot.id} shot={shot} unit={unit} onDistance={onDistance} onDelete={onDeleteShot} />
          ))}
        </ol>
      )}
      {shots.length === 0 && <p className="muted small">Mark a shot when you're standing over the ball. The next mark measures how far it went.</p>}
    </section>
  )
}

function ShotRow({ shot, unit, onDistance, onDelete }: { shot: Shot; unit: Unit; onDistance: (id: string, m: number | null) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const planned = shot.plan
  const delta = shot.distance !== null && planned ? shot.distance - planned.expected : null
  const gap = shot.toHole !== null && shot.distance !== null && shot.lie !== 'green' ? shot.distance - shot.toHole : null

  const commit = () => {
    const value = parseFloat(draft)
    onDistance(shot.id, Number.isFinite(value) && value >= 0 ? fromUnit(value, unit) : null)
    setEditing(false)
  }

  return (
    <li>
      <span className="shot-no">{shot.number}</span>
      <span className="shot-club">
        {clubName(shot.club)}
        {planned && planned.club !== shot.club ? <em> (caddie said {clubName(planned.club)})</em> : null}
      </span>
      <span className="shot-dist">
        {editing ? (
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={draft}
            placeholder={unit}
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
            className="link"
            onClick={() => {
              setDraft(shot.distance === null ? '' : String(Math.round(toUnit(shot.distance, unit))))
              setEditing(true)
            }}
            title="Type the distance if GPS got it wrong"
          >
            {shot.distance === null ? 'in flight' : formatDistance(shot.distance, unit)}
            {shot.manual ? '*' : ''}
          </button>
        )}
      </span>
      <span className="shot-note">
        {delta !== null && shot.lie !== 'green' ? `${delta >= 0 ? '+' : '−'}${formatDistance(Math.abs(delta), unit)} vs plan` : ''}
        {gap !== null && delta === null ? `${gap >= 0 ? 'long' : 'short'} by ${formatDistance(Math.abs(gap), unit)}` : ''}
      </span>
      <button type="button" className="icon" onClick={() => onDelete(shot.id)} aria-label="Delete shot">
        ×
      </button>
    </li>
  )
}
