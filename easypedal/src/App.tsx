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
  type SearchFailure,
  type SearchProgress,
} from './lib/routeSearch'
import { createValhallaRouter, createValhallaWays } from './services/valhalla'
import { createOpenMeteoProvider } from './services/openMeteo'
import { describePoint } from './services/geocode'

/** Shown while the address for a GPS fix is still being looked up. */
const CURRENT_LOCATION = 'Your current location'

/**
 * Why nothing came back, in words that say what to do about it. Coming back
 * empty because a service is down is a wait-and-retry; coming back empty
 * because there is no safe way through is a move-the-pin. Saying the wrong
 * one sends the rider off fixing something that was never broken.
 */
const FAILURE_MESSAGES: Record<SearchFailure, string> = {
  'routing-unavailable':
    'Could not reach the route planner. Check your connection and try again — your pins are still set.',
  'no-route':
    'No cycling route between these two points. One end may be away from any road the map knows — try moving a pin.',
  'elevation-unavailable':
    'Found routes, but the hill data service did not answer, so the climbing could not be checked. Try again in a moment.',
  'unsafe-only':
    'Every route between these points uses a highway, so none is safe to ride. Try moving a pin, or picking a nearer destination.',
}

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

  // Each end's newest pin wins. Dragging a pin around the map would otherwise
  // leave a queue of address lookups, each answering a question the rider has
  // already moved on from, so the previous one is cancelled outright.
  const pinLookup = useRef<Record<Endpoint, AbortController | null>>({ from: null, to: null })

  const cancelLookup = useCallback((which: Endpoint) => {
    pinLookup.current[which]?.abort()
    pinLookup.current[which] = null
  }, [])

  const setEndpoint = useCallback((which: Endpoint, point: LatLng, label: string | null) => {
    const apply = which === 'from' ? setFrom : setTo
    apply({ point, label })
    if (which === 'from') {
      // Having set the start, the next tap is almost certainly the finish.
      setPicking('to')
    }

    cancelLookup(which)

    // A pin dropped on the map, or taken from GPS, arrives as bare
    // coordinates. Ask what is actually there, so the panel and the saved
    // ride name read as an address rather than six decimal places.
    if (label !== null && label !== CURRENT_LOCATION) return

    const controller = new AbortController()
    pinLookup.current[which] = controller
    void describePoint(point, { signal: controller.signal })
      .then((address) => {
        if (!address || controller.signal.aborted) return
        apply({ point, label: label === CURRENT_LOCATION ? `${CURRENT_LOCATION} · ${address}` : address })
      })
      .catch(() => {
        // The pin still works without a name; the map shows where it is.
      })
  }, [cancelLookup])

  // A lookup in flight when the app closes has nowhere to deliver its answer.
  useEffect(() => {
    const lookups = pinLookup.current
    return () => {
      lookups.from?.abort()
      lookups.to?.abort()
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
        setEndpoint('from', { lat: position.coords.latitude, lng: position.coords.longitude }, CURRENT_LOCATION)
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

      setRoutes(found.routes)
      setSelectedId(found.routes[0]?.id ?? null)
      if (found.failure) {
        setError(FAILURE_MESSAGES[found.failure])
      } else if (found.waysUnavailable) {
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
              // An address lookup still running would otherwise land later and
              // drag an end of this saved ride back to a pin dropped earlier.
              cancelLookup('from')
              cancelLookup('to')
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
              cancelLookup('from')
              cancelLookup('to')
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
              priority={form.priority}
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
        paint={form.priority}
        onPick={(point) => setEndpoint(picking, point, null)}
      />
    </div>
  )
}
