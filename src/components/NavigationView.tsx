import { useEffect, useMemo, useRef, useState } from 'react'
import { cumulativeDistances, type LatLng } from '../lib/geo'
import { hasFinished, isOffRoute, locateOnRoute, type RouteProgress } from '../lib/follow'
import {
  announcementFor,
  bandFor,
  distancePhrase,
  headingBetween,
  instructionFor,
  nextStep,
  turnAngle,
} from '../lib/navigation'
import { estimateDuration } from '../lib/effort'
import type { RouteResult } from '../lib/routeSearch'
import { formatDistance, formatDuration, type DistanceUnit } from '../lib/units'

interface NavigationViewProps {
  route: RouteResult
  distanceUnit: DistanceUnit
  paceSeconds: number
  onHeading: (heading: number | null) => void
  onPosition: (position: LatLng | null) => void
  onExit: () => void
}

/** A single arrow, swung to match the maneuver. */
function TurnArrow({ angle }: { angle: number }) {
  return (
    <svg className="nav-arrow" viewBox="0 0 48 48" aria-hidden="true">
      <g transform={`rotate(${angle} 24 24)`}>
        <path
          d="M24 42 V14"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path d="M24 8 L36 22 H12 Z" fill="currentColor" />
      </g>
    </svg>
  )
}

export function NavigationView({
  route,
  distanceUnit,
  paceSeconds,
  onHeading,
  onPosition,
  onExit,
}: NavigationViewProps) {
  const [progress, setProgress] = useState<RouteProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)

  const segmentRef = useRef<number | undefined>(undefined)
  const lastFixRef = useRef<LatLng | null>(null)
  // Which maneuver has been announced at which band, so nothing repeats.
  const spokenRef = useRef(new Map<number, number>())
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const cumulative = useMemo(() => cumulativeDistances(route.path), [route])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot follow your position.')
      return
    }

    const watch = navigator.geolocation.watchPosition(
      (fix) => {
        const here = { lat: fix.coords.latitude, lng: fix.coords.longitude }
        const next = locateOnRoute(route.path, here, { fromSegment: segmentRef.current }, cumulative)
        segmentRef.current = next.segment
        setError(null)
        setProgress(next)
        onPosition(here)

        // Prefer the device's own heading; fall back to the way you just moved.
        const derived = lastFixRef.current ? headingBetween(lastFixRef.current, here) : null
        const heading = typeof fix.coords.heading === 'number' && !Number.isNaN(fix.coords.heading)
          ? fix.coords.heading
          : derived
        if (heading !== null) onHeading(heading)
        lastFixRef.current = here
      },
      () => setError('Lost your location. Check that location access is allowed.'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    )

    return () => {
      navigator.geolocation.clearWatch(watch)
      onPosition(null)
      onHeading(null)
    }
  }, [route, cumulative, onPosition, onHeading])

  // Keep the screen on; not every browser allows it.
  useEffect(() => {
    let sentinel: { release: () => Promise<void> } | null = null
    let cancelled = false
    const wakeLock = (navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<typeof sentinel> }
    }).wakeLock

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

  const upcoming = progress ? nextStep(route.steps, progress.distanceAlong) : null
  const metersToTurn = upcoming && progress ? Math.max(0, upcoming.distanceAlong - progress.distanceAlong) : null
  const finished = progress ? hasFinished(progress, route.distance) : false
  const strayed = progress ? isOffRoute(progress) : false

  // Speak each maneuver once per distance band as it approaches.
  useEffect(() => {
    if (mutedRef.current || !upcoming || metersToTurn === null) return
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const band = bandFor(metersToTurn)
    if (band === null) return
    const key = Math.round(upcoming.distanceAlong)
    if (spokenRef.current.get(key) === band) return
    spokenRef.current.set(key, band)

    try {
      const utterance = new SpeechSynthesisUtterance(
        announcementFor(upcoming, metersToTurn, distanceUnit),
      )
      utterance.rate = 1.05
      window.speechSynthesis.speak(utterance)
    } catch {
      // Speech is a courtesy; the banner still says everything.
    }
  }, [upcoming, metersToTurn, distanceUnit])

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  const remaining = progress?.distanceRemaining ?? route.distance
  const timeLeft = estimateDuration(
    remaining,
    route.profile.gain * (remaining / Math.max(route.distance, 1)),
    paceSeconds,
    distanceUnit,
  )

  return (
    <div className="nav">
      <div className={strayed ? 'nav-banner astray' : 'nav-banner'}>
        {upcoming && metersToTurn !== null ? (
          <>
            <TurnArrow angle={turnAngle(upcoming)} />
            <div className="nav-banner-text">
              <span className="nav-distance">{distancePhrase(metersToTurn, distanceUnit)}</span>
              <span className="nav-instruction">{instructionFor(upcoming)}</span>
            </div>
          </>
        ) : (
          <div className="nav-banner-text">
            <span className="nav-instruction">
              {finished ? 'You’re back at the start — nice run' : progress ? 'Carry on' : 'Finding you…'}
            </span>
          </div>
        )}
      </div>

      {strayed && progress ? (
        <p className="nav-alert">
          {Math.round(progress.offRouteBy)} m off route — head back to the green line
        </p>
      ) : null}
      {error ? <p className="nav-alert">{error}</p> : null}

      <div className="nav-footer">
        <div className="nav-stats">
          <div>
            <dt>Left</dt>
            <dd>{formatDistance(remaining, distanceUnit)}</dd>
          </div>
          <div>
            <dt>Done</dt>
            <dd>{formatDistance(progress?.distanceAlong ?? 0, distanceUnit)}</dd>
          </div>
          <div>
            <dt>To go</dt>
            <dd>{formatDuration(timeLeft)}</dd>
          </div>
        </div>
        <div className="nav-buttons">
          <button
            type="button"
            className="btn btn-secondary"
            aria-pressed={muted}
            onClick={() => {
              setMuted((was) => !was)
              if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
            }}
          >
            {muted ? 'Voice off' : 'Voice on'}
          </button>
          <button type="button" className="btn" onClick={onExit}>
            End run
          </button>
        </div>
        <p className="nav-attribution">Map data © OpenStreetMap contributors</p>
      </div>
    </div>
  )
}
