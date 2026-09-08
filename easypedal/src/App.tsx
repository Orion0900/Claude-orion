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
import { formatDistance } from './lib/units'
import { ControlPanel, shortPlaceName, type Endpoint, type RideForm } from './components/ControlPanel'
import { NavigationView } from './components/NavigationView'
import { MapView } from './components/MapView'
import { RouteList } from './components/RouteList'
import { pointAtFraction, type LatLng } from './lib/geo'
import { DEFAULT_SPEED } from './lib/effort'
import {
  DEFAULT_CRITERIA,
  findRoutes,
  type RideCriteria,
  type RouteResult,
  type SearchProgress,
} from './lib/routeSearch'
import { createValhallaRouter, createValhallaWays } from './services/valhalla'
import { createOpenMeteoProvider } from './services/openMeteo'

const INITIAL_FORM: RideForm = {
  priority: 'lanes',
  distanceUnit: 'mi',
  elevationUnit: 'ft',
  speed: DEFAULT_SPEED.mi,
}

interface Place {
  point: LatLng
  label: string | null
}

export default function App() {
  const [form, setForm] = useState<RideForm>(INITIAL_FORM)
  const [from, setFrom] = useState<Place | null>(null)
  const [to, setTo] = useState<Place | null>(null)
  // Which end the next tap on the map sets.
  const [picking, setPicking] = useState<Endpoint>('from')
  const [routes, setRoutes] = useState<RouteResult[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [progress, setProgress] = useState<SearchProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [followingId, setFollowingId] = useState<string | null>(null)
  const [livePosition, setLivePosition] = useState<LatLng | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [traveled, setTraveled] = useState(0)
  const [browsing, setBrowsing] = useState(false)

  const store = useMemo(() => createLocalStore(), [])
  const [saved, setSaved] = useState<SavedRoute[]>(() => store.read())
  const [saveError, setSaveError] = useState<string | null>(null)

  const searchRef = useRef<AbortController | null>(null)
  const routing = useMemo(() => createValhallaRouter(), [])
  const ways = useMemo(() => createValhallaWays(), [])
  const elevation = useMemo(() => createOpenMeteoProvider(), [])

  const setEndpoint = useCallback((which: Endpoint, point: LatLng, label: string | null) => {
    const place = { point, label }
    if (which === 'from') {
      setFrom(place)
      // Having set the start, the next tap is almost certainly the finish.
      setPicking('to')
    } else {
      setTo(place)
    }
  }, [])

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot share your location. Search or tap the map instead.')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setEndpoint('from', { lat: position.coords.latitude, lng: position.coords.longitude }, 'Your current location')
        setLocating(false)
      },
      () => {
        setLocating(false)
        setLocationError('Location unavailable. Search for a place or tap the map instead.')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }, [setEndpoint])

  const persist = useCallback(
    (next: SavedRoute[]) => {
      try {
        store.write(next)
        setSaved(next)
        setSaveError(null)
      } catch {
        setSaveError('No room left to save rides. Remove one and try again.')
      }
    },
    [store],
  )

  const routeLabel = useCallback(
    (route: RouteResult) => {
      const start = shortPlaceName(from?.label ?? null)
      const finish = shortPlaceName(to?.label ?? null)
      if (start && finish) return `${start} to ${finish}`
      return `${formatDistance(route.distance, form.distanceUnit)} ride`
    },
    [form.distanceUnit, from, to],
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
      } catch (caught) {
        setSaveError(
          caught instanceof StorageFullError
            ? 'That is as many rides as the app will keep. Remove one first.'
            : 'Could not save that ride.',
        )
      }
    },
    [persist, routeLabel, saved],
  )

  const search = useCallback(async () => {
    if (!from || !to) return
    searchRef.current?.abort()
    const controller = new AbortController()
    searchRef.current = controller

    const criteria: RideCriteria = {
      ...DEFAULT_CRITERIA,
      from: from.point,
      to: to.point,
      priority: form.priority,
    }

    setSearching(true)
    setError(null)
    setProgress(null)
    setScrub(null)

    try {
      const found = await findRoutes({
        routing,
        ways,
        elevation,
        criteria,
        signal: controller.signal,
        onProgress: setProgress,
      })
      if (controller.signal.aborted) return

      setRoutes(found)
      setSelectedId(found[0]?.id ?? null)
      if (found.length === 0) {
        setError(
          'No safe route came back. Every way between these points uses a highway, or one end is off the road map — try moving a pin.',
        )
      } else if (found.every((route) => route.ways === null)) {
        setError('Routes found, but the road types could not be looked up, so lane coverage is unknown.')
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
  }, [from, to, form.priority, routing, ways, elevation])

  useEffect(() => () => searchRef.current?.abort(), [])

  const selected = routes.find((route) => route.id === selectedId) ?? null
  const following = routes.find((route) => route.id === followingId) ?? null
  const cursor = selected && scrub !== null ? pointAtFraction(selected.path, scrub) : null

  const status = searching
    ? `Finding the easiest way… ${progress ? `${progress.completed}/${progress.total}` : ''}`
    : !from
      ? 'Tap the map to set where you start'
      : !to
        ? 'Tap the map to set where you are going'
        : null

  const stopRide = () => {
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
            <h1>EasyPedal</h1>
            <p>The easiest ride from A to B: bike lanes where they exist, flat where they don't.</p>
          </header>

          <SavedRoutes
            routes={saved}
            distanceUnit={form.distanceUnit}
            elevationUnit={form.elevationUnit}
            onOpen={(route) => {
              setRoutes([route])
              setSelectedId(route.id)
              setFrom({ point: route.path[0], label: 'Start of a saved ride' })
              setTo({ point: route.path[route.path.length - 1], label: 'End of a saved ride' })
              setScrub(null)
            }}
            onRemove={(id) => persist(removeRoute(saved, id))}
          />

          <ControlPanel
            form={form}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            from={from?.point ?? null}
            fromLabel={from?.label ?? null}
            to={to?.point ?? null}
            toLabel={to?.label ?? null}
            picking={picking}
            onPick={setPicking}
            onPickPlace={setEndpoint}
            onSwap={() => {
              setFrom(to)
              setTo(from)
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
              speed={form.speed}
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
              Set where you start and where you're going, say whether bike lanes or fewer hills matter
              more, and pick from the routes that come back.
            </p>
          )}
        </div>

        <div className="sidebar-footer">
          <button type="button" className="btn" disabled={!from || !to || searching} onClick={() => void search()}>
            {searching ? <span className="spinner" /> : null}
            {searching ? 'Finding routes…' : routes.length ? 'Find routes again' : 'Find the easiest route'}
          </button>
          {!from || !to ? <p className="hint">Set both ends first.</p> : null}
          {error ? <p className={routes.length ? 'notice info' : 'notice'}>{error}</p> : null}
          {saveError ? <p className="notice">{saveError}</p> : null}
        </div>
      </aside>

      {following ? (
        <NavigationView
          route={following}
          distanceUnit={form.distanceUnit}
          elevationUnit={form.elevationUnit}
          speed={form.speed}
          onPosition={setLivePosition}
          onHeading={setHeading}
          onProgress={setTraveled}
          browsing={browsing}
          onRecenter={() => setBrowsing(false)}
          isRouteSaved={isSaved(saved, following)}
          onToggleSaved={() => toggleSaved(following)}
          onExit={stopRide}
        />
      ) : null}

      <MapView
        start={from?.point ?? null}
        finish={to?.point ?? null}
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
        onPick={(point) => setEndpoint(picking, point, null)}
      />
    </div>
  )
}
