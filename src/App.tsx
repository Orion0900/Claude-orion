import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addRoute,
  createLocalStore,
  isSaved,
  removeRoute,
  StorageFullError,
  suggestName,
  type SavedRoute,
} from './lib/savedRoutes'
import { SavedRoutes } from './components/SavedRoutes'
import { requestCompassPermission } from './services/compass'
import { compassLabel } from './lib/routeSearch'
import { formatDistance } from './lib/units'
import { ControlPanel, type CriteriaForm } from './components/ControlPanel'
import { NavigationView } from './components/NavigationView'
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
  simplicity: 0.5,
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
  const [followingId, setFollowingId] = useState<string | null>(null)
  const [livePosition, setLivePosition] = useState<LatLng | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [traveled, setTraveled] = useState(0)
  const [browsing, setBrowsing] = useState(false)

  const store = useMemo(() => createLocalStore(), [])
  const [saved, setSaved] = useState<SavedRoute[]>(() => store.read())
  const [saveError, setSaveError] = useState<string | null>(null)

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

  const paceSeconds = parsePace(form.pace) ?? 540

  const persist = useCallback(
    (next: SavedRoute[]) => {
      try {
        store.write(next)
        setSaved(next)
        setSaveError(null)
      } catch {
        setSaveError('No room left to save routes. Remove one and try again.')
      }
    },
    [store],
  )

  const routeLabel = useCallback(
    (route: RouteResult) =>
      `${formatDistance(route.distance, form.distanceUnit)} ${compassLabel(route.outboundBearing)} loop`,
    [form.distanceUnit],
  )

  const toggleSaved = useCallback(
    (route: RouteResult) => {
      const existing = saved.find((item) => isSaved([item], route))
      if (existing) {
        persist(removeRoute(saved, existing.id))
        return
      }
      try {
        persist(addRoute(saved, route, suggestName(routeLabel(route))))
      } catch (error) {
        setSaveError(
          error instanceof StorageFullError
            ? 'That is as many routes as the app will keep. Remove one first.'
            : 'Could not save that route.',
        )
      }
    },
    [persist, routeLabel, saved],
  )

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
        simplicity: form.simplicity,
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
  const following = routes.find((route) => route.id === followingId) ?? null
  const cursor = selected && scrub !== null ? pointAtFraction(selected.path, scrub) : null

  const status = searching
    ? `Exploring routes… ${progress ? `${progress.completed}/${progress.total}` : ''}`
    : !start
      ? 'Tap the map to set where your run starts'
      : null

  const stopRun = () => {
    setFollowingId(null)
    setLivePosition(null)
    setHeading(null)
    setTraveled(0)
    setBrowsing(false)
  }

  return (
    <div className={following ? 'app navigating' : 'app'}>
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <header className="brand">
            <h1>LoopMaker</h1>
            <p>Runs that start and finish at your door, sized to your legs.</p>
          </header>

          <SavedRoutes
            routes={saved}
            distanceUnit={form.distanceUnit}
            elevationUnit={form.elevationUnit}
            onOpen={(route) => {
              setRoutes([route])
              setSelectedId(route.id)
              setStart(route.path[0])
              setStartLabel('Start of a saved route')
              setScrub(null)
            }}
            onRemove={(id) => persist(removeRoute(saved, id))}
          />

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
              savedRoutes={saved}
              onToggleSaved={toggleSaved}
              followingId={followingId}
              onFollow={(id) => {
                // iOS only grants the compass from inside a gesture, so the ask
                // happens here rather than once the navigation view mounts.
                void requestCompassPermission()
                setFollowingId(id)
                setSelectedId(id)
              }}
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
          {saveError ? <p className="notice">{saveError}</p> : null}
        </div>
      </aside>

      {following ? (
        <NavigationView
          route={following}
          distanceUnit={form.distanceUnit}
          elevationUnit={form.elevationUnit}
          paceSeconds={paceSeconds}
          onPosition={setLivePosition}
          onHeading={setHeading}
          onProgress={setTraveled}
          browsing={browsing}
          onRecenter={() => setBrowsing(false)}
          isRouteSaved={isSaved(saved, following)}
          onToggleSaved={() => toggleSaved(following)}
          onExit={stopRun}
        />
      ) : null}

      <MapView
        start={start}
        routes={routes}
        selectedId={selectedId}
        cursor={cursor}
        position={livePosition}
        navigating={following !== null}
        heading={heading}
        traveled={traveled}
        browsing={browsing}
        onBrowse={() => {
          if (following) setBrowsing(true)
        }}
        onRecenter={() => setBrowsing(false)}
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
