import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { chooseHeading, headingChanged, smoothHeading } from '../lib/heading'
import { detectDirection, type RunDirection } from '../lib/direction'
import { createFixFilter } from '../lib/gpsFilter'
import type { MapPerspective } from '../lib/preferences'
import { watchCompass } from '../services/compass'
import { estimateDuration } from '../lib/effort'
import { buildRunSummary, summaryHeadline } from '../lib/runSummary'
import { formatPace } from '../lib/units'
import type { RouteResult } from '../lib/routeSearch'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  type DistanceUnit,
  type ElevationUnit,
} from '../lib/units'

interface NavigationViewProps {
  route: RouteResult
  distanceUnit: DistanceUnit
  elevationUnit: ElevationUnit
  paceSeconds: number
  onHeading: (heading: number | null) => void
  onPosition: (position: LatLng | null) => void
  onProgress: (fraction: number) => void
  /** True while the runner has dragged the map away to look around. */
  browsing: boolean
  onRecenter: () => void
  /** Told which way round the loop the runner actually set off. */
  onDirection: (direction: RunDirection) => void
  /** True once the instructions have been flipped to match. */
  reversed: boolean
  /** Third-person tilted view, or flat on. */
  perspective: MapPerspective
  onTogglePerspective: () => void
  /** Whether this route is already kept, and how to keep it. */
  isRouteSaved: boolean
  onToggleSaved: () => void
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
  elevationUnit,
  paceSeconds,
  onHeading,
  onPosition,
  onProgress,
  browsing,
  onRecenter,
  onDirection,
  reversed,
  perspective,
  onTogglePerspective,
  isRouteSaved,
  onToggleSaved,
  onExit,
}: NavigationViewProps) {
  const [progress, setProgress] = useState<RouteProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [dismissedSummary, setDismissedSummary] = useState(false)
  // Wall-clock start, so the summary reports time actually spent running.
  const startedAtRef = useRef(Date.now())
  const [now, setNow] = useState(() => Date.now())

  const segmentRef = useRef<number | undefined>(undefined)
  const lastFixRef = useRef<LatLng | null>(null)
  // The latest reading from each source, and the smoothed value on screen.
  const compassRef = useRef<number | null>(null)
  const courseRef = useRef<number | null>(null)
  const speedRef = useRef<number | null>(null)
  const derivedRef = useRef<number | null>(null)
  const shownHeadingRef = useRef<number | null>(null)
  // Where the run began, and whether the way round has been settled yet.
  const originRef = useRef<LatLng | null>(null)
  const directionSettledRef = useRef(false)
  // Bad fixes cluster at junctions, so they are screened before use.
  // Navigation wants live positions, so nothing from before the run counts.
  const filterRef = useRef(createFixFilter({ notBefore: Date.now() }))
  // A single far-off match is not evidence; two in a row is.
  const relocateStreakRef = useRef(0)
  // Which maneuver has been announced at which band, so nothing repeats.
  const spokenRef = useRef(new Map<number, number>())
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  const cumulative = useMemo(() => cumulativeDistances(route.path), [route])

  /**
   * Once per run, not per route.
   *
   * Flipping the loop hands back a route with a different id. If that reset the
   * detector, it would immediately decide the runner was going "forwards" along
   * the flipped route and flip it back, over and over. The run is one mount of
   * this component, so mount is the right scope.
   */
  useEffect(() => {
    startedAtRef.current = Date.now()
    setDismissedSummary(false)
    originRef.current = null
    directionSettledRef.current = false
    filterRef.current = createFixFilter({ notBefore: Date.now() })
    relocateStreakRef.current = 0
  }, [])

  // New geometry does mean progress has to be re-acquired from scratch.
  useEffect(() => {
    segmentRef.current = undefined
    lastFixRef.current = null
    relocateStreakRef.current = 0
  }, [route.id])

  // A ticking clock, so elapsed time moves even when GPS is quiet.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  /**
   * Settle on a heading from whichever source is most trustworthy, ease toward
   * it the short way round, and only redraw when it has actually moved.
   */
  const publishHeading = useCallback(() => {
    const target = chooseHeading({
      compass: compassRef.current,
      course: courseRef.current,
      speed: speedRef.current,
      derived: derivedRef.current,
    })
    if (target === null) return
    const smoothed = smoothHeading(shownHeadingRef.current, target)
    if (!headingChanged(shownHeadingRef.current, smoothed)) return
    shownHeadingRef.current = smoothed
    onHeading(smoothed)
  }, [onHeading])

  // The compass is what makes the map turn as you turn, standing still
  // included. Permission was asked for on the tap that started the run.
  useEffect(() => {
    const stop = watchCompass({
      onHeading: (heading) => {
        compassRef.current = heading
        publishHeading()
      },
    })
    return stop
  }, [publishHeading])

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('This browser cannot follow your position.')
      return
    }

    const watch = navigator.geolocation.watchPosition(
      (fix) => {
        const here = { lat: fix.coords.latitude, lng: fix.coords.longitude }

        // Accuracy collapses between buildings, which is where junctions are —
        // so the worst fixes arrive exactly when a runner turns.
        const verdict = filterRef.current.accept({
          position: here,
          accuracy: typeof fix.coords.accuracy === 'number' ? fix.coords.accuracy : 0,
          timestamp: fix.timestamp,
        })
        if (!verdict.accepted) return

        // Which way round the loop are we actually going? Decided once, from
        // the first real movement away from the start.
        if (originRef.current === null) originRef.current = here
        if (!directionSettledRef.current) {
          const direction = detectDirection(route.path, originRef.current, here)
          if (direction !== null) {
            directionSettledRef.current = true
            onDirection(direction)
            // The route may be about to be swapped underneath us, so this fix
            // is left to the next render rather than measured against the old one.
            if (direction === 'reverse') return
          }
        }

        const next = locateOnRoute(route.path, here, { fromSegment: segmentRef.current }, cumulative)

        // Wait for a second far-off match before believing the runner really is
        // somewhere else on the route; one is usually a bad fix at a junction.
        if (next.relocated) {
          relocateStreakRef.current += 1
          if (relocateStreakRef.current < 2) return
        } else {
          relocateStreakRef.current = 0
        }

        segmentRef.current = next.segment
        setError(null)
        setProgress(next)
        // On the route, the runner is drawn on it: raw fixes jitter by metres
        // even when good, and a puck that twitches off the line reads as broken.
        onPosition(isOffRoute(next) ? here : next.snapped)
        onProgress(next.fraction)

        // Satellites only contribute course over ground here; which way the
        // runner is facing comes from the compass, below.
        courseRef.current =
          typeof fix.coords.heading === 'number' && !Number.isNaN(fix.coords.heading)
            ? fix.coords.heading
            : null
        speedRef.current = typeof fix.coords.speed === 'number' ? fix.coords.speed : null
        derivedRef.current = lastFixRef.current ? headingBetween(lastFixRef.current, here) : null
        publishHeading()
        lastFixRef.current = here
      },
      () => setError('Lost your location. Check that location access is allowed.'),
      // maximumAge 0: never satisfy this watch from the browser's cache. A run
      // started soon after another would otherwise open on the previous run's
      // final position.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 },
    )

    return () => {
      navigator.geolocation.clearWatch(watch)
      onPosition(null)
      onHeading(null)
    }
  }, [route, cumulative, onPosition, onHeading, onProgress, onDirection])

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

  const elapsedSeconds = Math.max(0, (now - startedAtRef.current) / 1000)
  const summary = buildRunSummary({
    distanceCovered: progress?.distanceAlong ?? 0,
    elapsedSeconds,
    routeDistance: route.distance,
    routeGain: route.profile.gain,
    unit: distanceUnit,
  })

  // The end of a run is the one moment a runner is certain to look at the
  // screen, so it gets the whole of it.
  if (finished && !dismissedSummary) {
    return (
      <div className="nav nav-finished">
        <div className="finish-card">
          <p className="finish-eyebrow">{summaryHeadline(summary)}</p>
          <h2 className="finish-distance">{formatDistance(summary.distance, distanceUnit)}</h2>

          <dl className="finish-stats">
            <div>
              <dt>Time</dt>
              <dd>{formatDuration(summary.elapsedSeconds)}</dd>
            </div>
            <div>
              <dt>Pace</dt>
              <dd>
                {summary.paceSecondsPerUnit === null
                  ? '—'
                  : formatPace(summary.paceSecondsPerUnit, distanceUnit)}
              </dd>
            </div>
            <div>
              <dt>Climb</dt>
              <dd>{formatElevation(summary.gain, elevationUnit)}</dd>
            </div>
          </dl>

          <div className="finish-actions">
            <button type="button" className="btn" onClick={onToggleSaved}>
              {isRouteSaved ? 'Saved ✓' : 'Save this route'}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setDismissedSummary(true)
                onExit()
              }}
            >
              Done
            </button>
          </div>

          <button type="button" className="btn-link finish-continue" onClick={() => setDismissedSummary(true)}>
            Keep running
          </button>
        </div>
      </div>
    )
  }

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

      {reversed ? (
        <p className="nav-note">Going round the other way — directions flipped</p>
      ) : null}

      {strayed && progress ? (
        <p className="nav-alert">
          {Math.round(progress.offRouteBy)} m off route — head back to the green line
        </p>
      ) : null}
      {error ? <p className="nav-alert">{error}</p> : null}

      {/* The map owns this space, so it must not swallow pans and pinches. */}
      <div className="nav-spacer" style={{ pointerEvents: 'none' }}>
        {browsing ? (
          <button type="button" className="nav-recenter" onClick={onRecenter}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="4" fill="currentColor" />
              <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Re-centre
          </button>
        ) : null}
      </div>

      <div className="nav-footer">
        <div className="nav-summary">
          <span className="nav-eta">{formatDuration(timeLeft)}</span>
          <span className="nav-sub">
            {formatDistance(remaining, distanceUnit)} left · {formatDistance(progress?.distanceAlong ?? 0, distanceUnit)} done
          </span>
        </div>
        <button
          type="button"
          className="nav-icon-btn"
          aria-pressed={muted}
          aria-label={muted ? 'Turn voice directions on' : 'Turn voice directions off'}
          onClick={() => {
            setMuted((was) => !was)
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor" />
            {muted ? (
              <path d="M16 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
            ) : (
              <path
                d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            )}
          </svg>
        </button>
        <button
          type="button"
          className="nav-icon-btn nav-perspective"
          aria-pressed={perspective === '3d'}
          aria-label={
            perspective === '3d' ? 'Switch to a flat map' : 'Switch to the tilted view'
          }
          onClick={onTogglePerspective}
        >
          {perspective === '3d' ? '3D' : '2D'}
        </button>
        <button type="button" className="nav-end" onClick={onExit}>
          End
        </button>
      </div>
      <p className="nav-attribution">Map data © OpenStreetMap contributors</p>
    </div>
  )
}
