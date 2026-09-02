import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../lib/geo'
import type { RouteShape } from '../lib/routeSearch'
import { searchPlaces, type Place } from '../services/geocode'
import type { DistanceUnit, ElevationUnit } from '../lib/units'

export interface CriteriaForm {
  distance: number
  distanceUnit: DistanceUnit
  limitGain: boolean
  maxGain: number
  elevationUnit: ElevationUnit
  shape: RouteShape
  pace: string
}

interface ControlPanelProps {
  form: CriteriaForm
  onChange: (patch: Partial<CriteriaForm>) => void
  start: LatLng | null
  startLabel: string | null
  onPickStart: (point: LatLng, label: string | null) => void
  onLocate: () => void
  locating: boolean
  locationError: string | null
}

const DISTANCE_RANGE: Record<DistanceUnit, { min: number; max: number; step: number }> = {
  mi: { min: 1, max: 26, step: 0.25 },
  km: { min: 1, max: 42, step: 0.5 },
}

const GAIN_RANGE: Record<ElevationUnit, { min: number; max: number; step: number }> = {
  ft: { min: 0, max: 3000, step: 50 },
  m: { min: 0, max: 900, step: 10 },
}

export function ControlPanel({
  form,
  onChange,
  start,
  startLabel,
  onPickStart,
  onLocate,
  locating,
  locationError,
}: ControlPanelProps) {
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const querySelected = useRef(false)

  // Debounced geocoding; Nominatim is fair-use, so never per keystroke.
  useEffect(() => {
    if (querySelected.current) {
      querySelected.current = false
      return
    }
    if (query.trim().length < 3) {
      setPlaces([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        setSearchError(null)
        setPlaces(await searchPlaces(query, controller.signal))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setSearchError('Place search is unavailable.')
      }
    }, 450)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const distanceRange = DISTANCE_RANGE[form.distanceUnit]
  const gainRange = GAIN_RANGE[form.elevationUnit]

  return (
    <>
      <section className="panel-section">
        <h2>Start &amp; finish</h2>

        <button type="button" className="btn btn-secondary" onClick={onLocate} disabled={locating}>
          {locating ? <span className="spinner" /> : null}
          {locating ? 'Locating…' : 'Use my current location'}
        </button>

        <div className="field" style={{ marginTop: 12 }}>
          <input
            type="text"
            placeholder="…or search an address or park"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search for a starting location"
          />
          {places.length > 0 ? (
            <ul className="suggestions">
              {places.map((place) => (
                <li key={`${place.lat},${place.lng}`}>
                  <button
                    type="button"
                    onClick={() => {
                      querySelected.current = true
                      setQuery(place.label)
                      setPlaces([])
                      onPickStart({ lat: place.lat, lng: place.lng }, place.label)
                    }}
                  >
                    {place.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="hint">
          {start
            ? startLabel ?? `${start.lat.toFixed(5)}, ${start.lng.toFixed(5)}`
            : 'Or click anywhere on the map to drop your start.'}
        </p>
        {locationError ? <p className="notice">{locationError}</p> : null}
        {searchError ? <p className="notice">{searchError}</p> : null}
      </section>

      <section className="panel-section">
        <h2>Your run</h2>

        <div className="field">
          <div className="field-label">
            <label htmlFor="distance">Distance</label>
            <span className="field-value">
              {form.distance.toFixed(form.distanceUnit === 'mi' ? 2 : 1)} {form.distanceUnit}
            </span>
          </div>
          <input
            id="distance"
            type="range"
            min={distanceRange.min}
            max={distanceRange.max}
            step={distanceRange.step}
            value={form.distance}
            onChange={(event) => onChange({ distance: Number(event.target.value) })}
          />
          <div className="segmented" style={{ marginTop: 8 }}>
            {(['mi', 'km'] as DistanceUnit[]).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={form.distanceUnit === unit}
                onClick={() => onChange({ distanceUnit: unit })}
              >
                {unit === 'mi' ? 'Miles' : 'Kilometres'}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="field-label">
            <label htmlFor="gain">Total climbing</label>
            <span className="field-value">
              {form.limitGain ? `under ${Math.round(form.maxGain)} ${form.elevationUnit}` : 'any'}
            </span>
          </div>
          <input
            id="gain"
            type="range"
            min={gainRange.min}
            max={gainRange.max}
            step={gainRange.step}
            value={form.maxGain}
            disabled={!form.limitGain}
            onChange={(event) => onChange({ maxGain: Number(event.target.value) })}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <div className="segmented">
              {(['ft', 'm'] as ElevationUnit[]).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  aria-pressed={form.elevationUnit === unit}
                  onClick={() => onChange({ elevationUnit: unit })}
                >
                  {unit}
                </button>
              ))}
            </div>
            <div className="segmented">
              <button
                type="button"
                aria-pressed={form.limitGain}
                onClick={() => onChange({ limitGain: true })}
              >
                Limit
              </button>
              <button
                type="button"
                aria-pressed={!form.limitGain}
                onClick={() => onChange({ limitGain: false })}
              >
                No limit
              </button>
            </div>
          </div>
        </div>

        <div className="field">
          <div className="field-label">
            <label htmlFor="shape">Shape</label>
          </div>
          <div className="segmented" id="shape">
            <button
              type="button"
              aria-pressed={form.shape === 'loop'}
              onClick={() => onChange({ shape: 'loop' })}
            >
              Loop
            </button>
            <button
              type="button"
              aria-pressed={form.shape === 'out-and-back'}
              onClick={() => onChange({ shape: 'out-and-back' })}
            >
              Out &amp; back
            </button>
          </div>
        </div>

        <div className="field">
          <div className="field-label">
            <label htmlFor="pace">Easy pace</label>
            <span className="field-value">min /{form.distanceUnit}</span>
          </div>
          <input
            id="pace"
            type="text"
            inputMode="numeric"
            placeholder="9:00"
            value={form.pace}
            onChange={(event) => onChange({ pace: event.target.value })}
          />
          <p className="hint">Used only to estimate finish time.</p>
        </div>
      </section>
    </>
  )
}
