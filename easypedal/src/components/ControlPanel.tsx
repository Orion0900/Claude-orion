import { useEffect, useRef, useState } from 'react'
import type { LatLng } from '../lib/geo'
import type { Priority } from '../lib/routeSearch'
import { DEFAULT_SPEED, SPEED_RANGE } from '../lib/effort'
import { searchPlaces, type Place } from '../services/geocode'
import type { DistanceUnit, ElevationUnit } from '../lib/units'

export type Endpoint = 'from' | 'to'

export interface RideForm {
  priority: Priority
  distanceUnit: DistanceUnit
  elevationUnit: ElevationUnit
  /** Easy cruising speed in miles or kilometres per hour, for the time estimate. */
  speed: number
}

const PRIORITY_CHOICES: Array<{ value: Priority; label: string; hint: string }> = [
  {
    value: 'lanes',
    label: 'Bike lanes first',
    hint: 'As much of the ride as possible on bike lanes and paths, then the fewest hills among those.',
  },
  {
    value: 'hills',
    label: 'Fewest hills first',
    hint: 'The least climbing possible, then the most bike lanes among the flat options.',
  },
]

/** The first part of a geocoder's long-winded label: "Central Library" not the whole address. */
export function shortPlaceName(label: string | null): string | null {
  if (!label) return null
  const first = label.split(',')[0].trim()
  return first || null
}

interface PlaceSearchProps {
  id: string
  placeholder: string
  onPick: (point: LatLng, label: string) => void
}

/** A search box that offers places as you pause typing. */
function PlaceSearch({ id, placeholder, onPick }: PlaceSearchProps) {
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

  return (
    <div className="field">
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label={placeholder}
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
                  onPick({ lat: place.lat, lng: place.lng }, place.label)
                }}
              >
                {place.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searchError ? <p className="notice">{searchError}</p> : null}
    </div>
  )
}

interface ControlPanelProps {
  form: RideForm
  onChange: (patch: Partial<RideForm>) => void
  from: LatLng | null
  fromLabel: string | null
  to: LatLng | null
  toLabel: string | null
  /** Which end the next tap on the map sets. */
  picking: Endpoint
  onPick: (which: Endpoint) => void
  onPickPlace: (which: Endpoint, point: LatLng, label: string | null) => void
  onSwap: () => void
  onLocate: () => void
  locating: boolean
  locationError: string | null
}

function describe(point: LatLng | null, label: string | null, fallback: string): string {
  if (!point) return fallback
  return label ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`
}

export function ControlPanel({
  form,
  onChange,
  from,
  fromLabel,
  to,
  toLabel,
  picking,
  onPick,
  onPickPlace,
  onSwap,
  onLocate,
  locating,
  locationError,
}: ControlPanelProps) {
  const speedRange = SPEED_RANGE[form.distanceUnit]

  return (
    <>
      <section className="panel-section">
        <h2>Where to</h2>

        {from && to ? null : (
          <p className="hint" style={{ margin: '0 0 10px' }}>
            Your location is only requested when you tap below, and never leaves your phone except to
            look up roads and hills.
          </p>
        )}

        <div className="endpoint" data-end="from">
          <span className="endpoint-dot start" aria-hidden="true" />
          <div className="endpoint-body">
            <div className="endpoint-head">
              <label htmlFor="from-search">Start</label>
              <button
                type="button"
                className="btn-link"
                aria-pressed={picking === 'from'}
                onClick={() => onPick('from')}
              >
                {picking === 'from' ? 'Tap the map to set' : 'Set on map'}
              </button>
            </div>
            <PlaceSearch
              id="from-search"
              placeholder="Search an address or place"
              onPick={(point, label) => onPickPlace('from', point, label)}
            />
            <button type="button" className="btn btn-secondary" onClick={onLocate} disabled={locating}>
              {locating ? <span className="spinner" /> : null}
              {locating ? 'Locating…' : 'Use my current location'}
            </button>
            <p className="hint">{describe(from, fromLabel, 'Not set yet.')}</p>
          </div>
        </div>

        <div className="endpoint" data-end="to">
          <span className="endpoint-dot finish" aria-hidden="true" />
          <div className="endpoint-body">
            <div className="endpoint-head">
              <label htmlFor="to-search">Destination</label>
              <button
                type="button"
                className="btn-link"
                aria-pressed={picking === 'to'}
                onClick={() => onPick('to')}
              >
                {picking === 'to' ? 'Tap the map to set' : 'Set on map'}
              </button>
            </div>
            <PlaceSearch
              id="to-search"
              placeholder="Search where you're going"
              onPick={(point, label) => onPickPlace('to', point, label)}
            />
            <p className="hint">{describe(to, toLabel, 'Not set yet.')}</p>
          </div>
        </div>

        {from && to ? (
          <button type="button" className="btn-link" onClick={onSwap}>
            Swap start and destination
          </button>
        ) : null}
        {locationError ? <p className="notice">{locationError}</p> : null}
      </section>

      <section className="panel-section">
        <h2>What matters most</h2>

        <div className="field">
          <div className="segmented" role="group" aria-label="Priority">
            {PRIORITY_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                aria-pressed={form.priority === choice.value}
                onClick={() => onChange({ priority: choice.value })}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <p className="hint">{PRIORITY_CHOICES.find((c) => c.value === form.priority)?.hint}</p>
          <p className="hint">Every route is checked so it never uses a highway.</p>
        </div>

        <div className="field">
          <div className="field-label">
            <label htmlFor="speed">Easy speed</label>
            <span className="field-value">
              {form.speed} {form.distanceUnit}/h
            </span>
          </div>
          <input
            id="speed"
            type="range"
            min={speedRange.min}
            max={speedRange.max}
            step={speedRange.step}
            value={form.speed}
            onChange={(event) => onChange({ speed: Number(event.target.value) })}
          />
          <p className="hint">Used only to estimate ride time.</p>
        </div>

        <div className="row">
          <div className="segmented">
            {(['mi', 'km'] as DistanceUnit[]).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={form.distanceUnit === unit}
                onClick={() =>
                  onChange({
                    distanceUnit: unit,
                    elevationUnit: unit === 'mi' ? 'ft' : 'm',
                    speed: DEFAULT_SPEED[unit],
                  })
                }
              >
                {unit === 'mi' ? 'Miles' : 'Kilometres'}
              </button>
            ))}
          </div>
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
        </div>
      </section>
    </>
  )
}
