import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ControlPanel, type CriteriaForm } from './components/ControlPanel'
import { MapView } from './components/MapView'
import { RouteList } from './components/RouteList'
import { pointAtFraction, type LatLng } from './lib/geo'
import { parsePace } from './lib/effort'
import {
  DEFAULT_CRITERIA,
  findRoutes,
  type RouteCriteria,
  type RouteResult,
  type SearchProgress,
} from './lib/routeSearch'
import { distanceToMeters, elevationToMeters } from './lib/units'
import { createOsrmProvider } from './services/osrm'
import { createOpenMeteoProvider } from './services/openMeteo'

const INITIAL_FORM: CriteriaForm = {
  distance: 5,
  distanceUnit: 'mi',
  limitGain: true,
  maxGain: 500,
  elevationUnit: 'ft',
  shape: 'loop',
  pace: '9:00',
}

export default function App() {
  const [form, setForm] = useState<CriteriaForm>(INITIAL_FORM)
  const [start, setStart] = useState<LatLng | null>(null)
  const [startLabel, setStartLabel] = useState<string | null>(null)
  const [routes, setRoutes] = useState<RouteResult[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [seed, setSeed] = useState(1)

  const searchRef = useRef<AbortController | null>(null)
  const routing = useMemo(() => createOsrmProvider(), [])
  const elevation = useMemo(() => createOpenMeteoProvider(), [])

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot share your location. Search or tap the map instead.')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStart({ lat: position.coords.latitude, lng: position.coords.longitude })
        setStartLabel('Your current location')
        setLocating(false)
      },
      () => {
        setLocating(false)
        setLocationError('Location unavailable. Search for a place or tap the map instead.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [])

  useEffect(() => {
    locate()
  }, [locate])

  const paceSeconds = parsePace(form.pace) ?? 540

  const search = useCallback(
    async (nextSeed: number) => {
      if (!start) return
      searchRef.current?.abort()
      const controller = new AbortController()
      searchRef.current = controller

      const criteria: RouteCriteria = {
        ...DEFAULT_CRITERIA,
        start,
        targetDistance: distanceToMeters(form.distance, form.distanceUnit),
        maxGain: form.limitGain ? elevationToMeters(form.maxGain, form.elevationUnit) : null,
        shape: form.shape,
        seed: nextSeed,
      }

      setSearching(true)
      setError(null)
      setProgress({ completed: 0, total: criteria.candidates })
      setScrub(null)

      try {
        const found = await findRoutes({
          routing,
          elevation,
          criteria,
          signal: controller.signal,
          onProgress: setProgress,
        })
        if (controller.signal.aborted) return

        setRoutes(found)
        setSelectedId(found[0]?.id ?? null)
        if (found.length === 0) {
          setError('No routes came back. Try a different distance, or a start closer to mapped roads.')
        } else if (!found.some((route) => route.meetsCriteria)) {
          setError('Nothing fit exactly — these are the closest options. Try relaxing the climb limit.')
        }
      } catch (caught) {
        if ((caught as Error).name === 'AbortError') return
        setError('Route service is unreachable right now. Check your connection and try again.')
      } finally {
        if (!controller.signal.aborted) {
          setSearching(false)
          setProgress(null)
        }
      }
    },
    [start, form, routing, elevation],
  )

  useEffect(() => () => searchRef.current?.abort(), [])

  const selected = routes.find((route) => route.id === selectedId) ?? null
  const cursor = selected && scrub !== null ? pointAtFraction(selected.path, scrub) : null

  const status = searching
    ? `Exploring routes… ${progress ? `${progress.completed}/${progress.total}` : ''}`
    : !start
      ? 'Tap the map to set where your run starts'
      : null

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <header className="brand">
            <h1>LoopMaker</h1>
            <p>Runs that start and finish at your door, sized to your legs.</p>
          </header>

          <ControlPanel
            form={form}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            start={start}
            startLabel={startLabel}
            onPickStart={(point, label) => {
              setStart(point)
              setStartLabel(label)
            }}
            onLocate={locate}
            locating={locating}
            locationError={locationError}
          />

          {routes.length > 0 ? (
            <RouteList
              routes={routes}
              selectedId={selectedId}
              distanceUnit={form.distanceUnit}
              elevationUnit={form.elevationUnit}
              paceSeconds={paceSeconds}
              scrub={scrub}
              onSelect={(id) => {
                setSelectedId(id)
                setScrub(null)
              }}
              onScrub={setScrub}
            />
          ) : (
            <p className="empty">
              Set your start, distance and climbing limit, then pick from the routes that come back.
            </p>
          )}
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="btn"
            disabled={!start || searching}
            onClick={() => {
              const next = seed + 1
              setSeed(next)
              void search(next)
            }}
          >
            {searching ? <span className="spinner" /> : null}
            {searching ? 'Finding routes…' : routes.length ? 'Find different routes' : 'Find routes'}
          </button>
          {!start ? <p className="hint">Set a start point first.</p> : null}
          {error ? <p className={routes.length ? 'notice info' : 'notice'}>{error}</p> : null}
        </div>
      </aside>

      <MapView
        start={start}
        routes={routes}
        selectedId={selectedId}
        cursor={cursor}
        status={status}
        onSelect={(id) => {
          setSelectedId(id)
          setScrub(null)
        }}
        onPickStart={(point) => {
          setStart(point)
          setStartLabel(null)
        }}
      />
    </div>
  )
}
