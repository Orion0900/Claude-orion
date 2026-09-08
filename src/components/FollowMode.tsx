import { useEffect, useRef, useState } from 'react'
import { cumulativeDistances, type LatLng } from '../lib/geo'
import { hasFinished, isOffRoute, locateOnRoute, type RouteProgress } from '../lib/follow'
import type { RouteResult } from '../lib/routeSearch'
import { formatDistance, type DistanceUnit } from '../lib/units'

interface FollowModeProps {
  route: RouteResult
  distanceUnit: DistanceUnit
  onPosition: (position: LatLng | null) => void
  onExit: () => void
}

type Fix = { progress: RouteProgress; accuracy: number }

export function FollowMode({ route, distanceUnit, onPosition, onExit }: FollowModeProps) {
  const [fix, setFix] = useState<Fix | null>(null)
  const [error, setError] = useState<string | null>(null)
  const segmentRef = useRef<number | undefined>(undefined)
  const cumulativeRef = useRef(cumulativeDistances(route.path))

  useEffect(() => {
    cumulativeRef.current = cumulativeDistances(route.path)
    segmentRef.current = undefined
  }, [route])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot follow your position.')
      return
    }

    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const here = { lat: position.coords.latitude, lng: position.coords.longitude }
        const progress = locateOnRoute(
          route.path,
          here,
          { fromSegment: segmentRef.current },
          cumulativeRef.current,
        )
        segmentRef.current = progress.segment
        setError(null)
        setFix({ progress, accuracy: position.coords.accuracy })
        onPosition(here)
      },
      () => setError('Lost your location. Check that location access is allowed.'),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )

    return () => {
      navigator.geolocation.clearWatch(watch)
      onPosition(null)
    }
  }, [route, onPosition])

  // Keep the screen on while running; not every browser allows it.
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null
    let cancelled = false
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<typeof sentinel> } })
      .wakeLock

    wakeLock
      ?.request('screen')
      .then((lock) => {
        if (cancelled) void lock?.release()
        else sentinel = lock
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
      void sentinel?.release().catch(() => undefined)
    }
  }, [])

  const progress = fix?.progress
  const finished = progress ? hasFinished(progress, route.distance) : false
  const strayed = progress ? isOffRoute(progress) : false

  return (
    <section className="follow" aria-live="polite">
      <div className="follow-head">
        <h2>{finished ? 'Back at the start' : 'Following route'}</h2>
        <button type="button" className="btn-link" onClick={onExit}>
          Stop
        </button>
      </div>

      {progress ? (
        <>
          <div className="follow-bar" role="img" aria-label={`${Math.round(progress.fraction * 100)}% complete`}>
            <span style={{ width: `${Math.min(100, progress.fraction * 100)}%` }} />
          </div>
          <div className="follow-stats">
            <div>
              <dt>Done</dt>
              <dd>{formatDistance(progress.distanceAlong, distanceUnit)}</dd>
            </div>
            <div>
              <dt>Left</dt>
              <dd>{formatDistance(progress.distanceRemaining, distanceUnit)}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>±{Math.round(fix.accuracy)} m</dd>
            </div>
          </div>
          {strayed ? (
            <p className="notice">
              You're {Math.round(progress.offRouteBy)} m off the route — head back to the green line.
            </p>
          ) : null}
        </>
      ) : (
        <p className="hint">
          <span className="spinner" />
          Waiting for a GPS fix…
        </p>
      )}

      {error ? <p className="notice">{error}</p> : null}
    </section>
  )
}
