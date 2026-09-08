import type { Hole } from '../lib/course'
import { formatDistance, type Unit } from '../lib/units'

interface HoleHeaderProps {
  hole: Hole | null
  holeCount: number
  distance: number | null
  green: { front: number; back: number } | null
  unit: Unit
  gpsStatus: string
  onPrev: () => void
  onNext: () => void
  onFrame: () => void
}

export function HoleHeader({ hole, holeCount, distance, green, unit, gpsStatus, onPrev, onNext, onFrame }: HoleHeaderProps) {
  return (
    <header className="hole-header">
      <div className="hole-nav">
        <button type="button" onClick={onPrev} aria-label="Previous hole" disabled={!hole}>
          ‹
        </button>
        <div className="hole-title">
          <strong>{hole ? `Hole ${hole.number}` : 'No hole'}</strong>
          <span>
            {[hole?.par ? `Par ${hole.par}` : null, hole?.length ? formatDistance(hole.length, unit) : null, holeCount > 0 ? `${holeCount} holes` : null]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </div>
        <button type="button" onClick={onNext} aria-label="Next hole" disabled={!hole}>
          ›
        </button>
      </div>
      <button type="button" className="yardage" onClick={onFrame} title="Frame the hole on the map">
        <span className="yardage-big">{distance === null ? '—' : Math.round(unit === 'yd' ? distance / 0.9144 : distance)}</span>
        <span className="yardage-unit">{unit} to the flag</span>
        {green && (
          <span className="yardage-fcb">
            F {formatDistance(green.front, unit)} · B {formatDistance(green.back, unit)}
          </span>
        )}
        <span className="gps-status">{gpsStatus}</span>
      </button>
    </header>
  )
}
