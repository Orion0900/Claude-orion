import type { Hole } from '../lib/course'
import { useEffect, useRef, useState } from 'react'
import { worthFlagging } from '../lib/motion'
import { toUnit, type Unit } from '../lib/units'

interface HoleHeaderProps {
  hole: Hole | null
  distance: number | null
  green: { front: number; back: number } | null
  unit: Unit
  /** Meters of GPS error, or null when the position was placed by hand. */
  accuracy: number | null
  live: boolean
  onPrev: () => void
  onNext: () => void
  onFrame: () => void
}

/**
 * The number, and almost nothing else.
 *
 * This sits over the map, so every word competes with the hole itself for
 * attention. Hole number, par, yardage, and the two green edges — that's the
 * whole vocabulary.
 */
export function HoleHeader({ hole, distance, green, unit, accuracy, live, onPrev, onNext, onFrame }: HoleHeaderProps) {
  const shown = distance === null ? null : Math.round(toUnit(distance, unit))
  const flash = useFlashOnChange(shown)

  return (
    <div className="hud">
      <div className="hud-top">
        <button type="button" className="round ghost" onClick={onPrev} aria-label="Previous hole" disabled={!hole}>
          ‹
        </button>
        <button type="button" className="hole-chip" onClick={onFrame} title="Centre the hole">
          <strong>{hole ? hole.number : '–'}</strong>
          {hole?.par ? <span>par {hole.par}</span> : <span>hole</span>}
        </button>
        <button type="button" className="round ghost" onClick={onNext} aria-label="Next hole" disabled={!hole}>
          ›
        </button>
      </div>

      <button type="button" className="yardage" onClick={onFrame} aria-label="Distance to the flag">
        <span className={`yardage-big${flash ? ' flash' : ''}`}>{shown === null ? '–' : shown}</span>
        <span className="yardage-unit">{unit}</span>
      </button>

      <div className="hud-row">
        {green && (
          <div className="edges">
            <span>{Math.round(toUnit(green.front, unit))}</span>
            <em>front · back</em>
            <span>{Math.round(toUnit(green.back, unit))}</span>
          </div>
        )}
        <div
          className={`gps${live ? ' live' : ''}`}
          title={accuracy === null ? 'Placed by hand' : `Accurate to about ${Math.round(accuracy)} m`}
        >
          <i aria-hidden="true" />
          {accuracy === null ? 'by hand' : `±${Math.round(accuracy)} m`}
        </div>
      </div>

    </div>
  )
}

/**
 * True for a moment after the number changes meaningfully, so the readout can
 * flash rather than roll. Rolling digits are unreadable exactly when the
 * player is reading them.
 */
function useFlashOnChange(value: number | null): boolean {
  const [flash, setFlash] = useState(false)
  const previous = useRef(value)

  useEffect(() => {
    const changed = worthFlagging(previous.current, value)
    previous.current = value
    if (!changed) return
    setFlash(true)
    const timer = setTimeout(() => setFlash(false), 420)
    return () => clearTimeout(timer)
  }, [value])

  return flash
}
