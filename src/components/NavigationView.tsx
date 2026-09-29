import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bearingTo, cumulativeDistances, type LatLng } from '../lib/geo'
import {
  hasFinished,
  isOffRoute,
  locateOnRoute,
  lookAheadAfter,
  OFF_ROUTE_METERS,
  type RouteProgress,
} from '../lib/follow'
import {
  announcementFor,
  bandFor,
  distancePhrase,
  headingBetween,
  instructionFor,
  nextStep,
  placeSteps,
  turnAngle,
  type RouteStep,
} from '../lib/navigation'
import { angleDifference, chooseHeading, headingChanged, smoothHeading } from '../lib/heading'
import { detectDirection, type RunDirection } from '../lib/direction'
import { createFixFilter } from '../lib/gpsFilter'
import type { MapPerspective } from '../lib/preferences'
import { hasRejoined, rejoinTarget, shouldRequestDetour } from '../lib/rejoin'
import { watchCompass } from '../services/compass'
import { watchGps, type GpsStatus } from '../services/gpsWatch'
import { primeSpeech, silence, speak } from '../services/speech'
import { estimateDuration } from '../lib/effort'
import { buildRunSummary, runShareText, summaryHeadline } from '../lib/runSummary'
import type { Achievement } from '../lib/achievements'
import { coachCues, INITIAL_COACH, type CoachState } from '../lib/coach'
import { createMotionDetector } from '../lib/motion'
import { createPreference } from '../lib/preferences'
import {
  isPaused,
  movingSeconds as movingSecondsOf,
  normaliseClock,
  pauseClock,
  resumeClock,
  startClock,
  type RunClock,
} from '../lib/runClock'
import { MIN_DISTANCE_TO_RECORD, type RunRecord } from '../lib/runHistory'
import { Confetti } from './Confetti'
import { formatPace } from '../lib/units'
import type { RouteResult, RoutingProvider } from '../lib/routeSearch'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  type DistanceUnit,
  type ElevationUnit,
} from '../lib/units'

/** Where an interrupted run had got to, to carry on from. */
export interface RunResume {
  startedAt: number
  /** The stopwatch as it was, pauses included. */
  clock?: RunClock
  distanceAlong: number
  segment: number | null
  directionSettled: boolean
  /** When that progress was recorded, to size the search for where they are now. */
  updatedAt: number
}

/** A way back to the route, with its own directions. */
interface Detour {
  path: LatLng[]
  cumulative: number[]
  steps: RouteStep[]
  /** Where it meets the route, in meters along the route. */
  rejoinAlong: number
}

interface NavigationViewProps {
  route: RouteResult
  /** Identifies this run in the history. */
  runId: string
  /** The stopwatch changed (started, paused, resumed): worth saving. */
  onClock: (clock: RunClock) => void
  /** Log the run; returns what it earned against the runs before it. */
  onRecord: (record: RunRecord) => Achievement[]
  /** For fetching a way back after straying off the route. */
  routing: RoutingProvider
  /** Set when this run is being picked back up after the app was reloaded. */
  resume: RunResume | null
  /** Progress worth keeping, so a reload can carry on from it. */
  onCheckpoint: (checkpoint: { distanceAlong: number; segment: number }) => void
  /** The way back to the route while off it, for the map to draw. */
  onDetour: (path: LatLng[] | null) => void
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

/** How often progress is written down, at most. */
const CHECKPOINT_EVERY_MS = 4000
/** How long "End" waits for a second tap before forgetting the first. */
const CONFIRM_END_MS = 3500
/** 3, 2, 1 — while GPS settles, like the countdown every running app opens with. */
const COUNTDOWN_FROM = 3

type StatsView = 'left' | 'run'
const statsPreference = createPreference<StatsView>('loopmaker.navStats.v1', ['left', 'run'], 'left')

/** Pause and play, drawn to match the other footer icons. */
function PauseIcon({ paused }: { paused: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paused ? (
        <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
      ) : (
        <path d="M7 5.5h3.5v13H7zM13.5 5.5H17v13h-3.5z" fill="currentColor" />
      )}
    </svg>
  )
}

export function NavigationView({
  route,
  runId,
  onClock,
  onRecord,
  routing,
  resume,
  onCheckpoint,
  onDetour,
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
  const [gps, setGps] = useState<GpsStatus>('ok')
  const [muted, setMuted] = useState(false)
  const [dismissedSummary, setDismissedSummary] = useState(false)
  const [confirmingEnd, setConfirmingEnd] = useState(false)
  // Ended by hand, far enough to be worth a summary.
  const [ended, setEnded] = useState(false)
  // A fresh run opens with a countdown; a resumed one carries straight on.
  const [countdown, setCountdown] = useState<number | null>(resume ? null : COUNTDOWN_FROM)
  const [clock, setClock] = useState<RunClock>(() =>
    resume ? normaliseClock(resume.clock, resume.startedAt) : startClock(Date.now()),
  )
  // Why the clock is stopped: a tap, or the runner standing still.
  const [pausedBy, setPausedBy] = useState<'manual' | 'auto' | null>(() =>
    resume?.clock?.pausedAt != null ? 'manual' : null,
  )
  const [statsView, setStatsView] = useState<StatsView>(() => statsPreference.read())
  const [earned, setEarned] = useState<Achievement[]>([])
  const [shareNote, setShareNote] = useState<string | null>(null)
  // Where the runner actually is, as opposed to where they match on the route.
  const [here, setHere] = useState<LatLng | null>(null)
  const [detour, setDetour] = useState<Detour | null>(null)
  const [now, setNow] = useState(() => Date.now())
  // For the GPS callback, which outlives any one render.
  const clockRef = useRef(clock)
  clockRef.current = clock
  const pausedByRef = useRef(pausedBy)
  pausedByRef.current = pausedBy
  const countingDownRef = useRef(countdown !== null)
  countingDownRef.current = countdown !== null
  const motionRef = useRef(createMotionDetector())
  const coachRef = useRef<CoachState | null>(null)

  const segmentRef = useRef<number | undefined>(resume?.segment ?? undefined)
  // When the last fix was used, to widen the search after a gap in GPS.
  const lastAcceptedAtRef = useRef<number | null>(resume?.updatedAt ?? null)
  const lastCheckpointRef = useRef(0)
  const latestCheckpointRef = useRef<{ distanceAlong: number; segment: number } | null>(null)
  const offStreakRef = useRef(0)
  const detourRef = useRef<Detour | null>(null)
  const detourRequestRef = useRef<{ at: number; controller: AbortController | null }>({ at: -Infinity, controller: null })
  const lastFixRef = useRef<LatLng | null>(null)
  // The latest reading from each source, and the smoothed value on screen.
  const compassRef = useRef<number | null>(null)
  const courseRef = useRef<number | null>(null)
  const speedRef = useRef<number | null>(null)
  const derivedRef = useRef<number | null>(null)
  const shownHeadingRef = useRef<number | null>(null)
  // Where the run began, and whether the way round has been settled yet.
  const originRef = useRef<LatLng | null>(null)
  const directionSettledRef = useRef(resume?.directionSettled ?? false)
  // Bad fixes cluster at junctions, so they are screened before use.
  // Navigation wants live positions, so nothing from before the run counts.
  const filterRef = useRef(createFixFilter({ notBefore: Date.now() }))
  // A single far-off match is not evidence; two in a row is.
  const relocateStreakRef = useRef(0)
  // Which maneuver has been announced at which band, so nothing repeats.
  const spokenRef = useRef(new Map<string, number>())
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
    setDismissedSummary(false)
    originRef.current = null
    directionSettledRef.current = resume?.directionSettled ?? false
    filterRef.current = createFixFilter({ notBefore: Date.now() })
    relocateStreakRef.current = 0
    // Resumed without a tap, so speech is primed on the first touch instead.
    if (!resume) return
    const prime = () => primeSpeech('Picking up your run')
    document.addEventListener('pointerdown', prime, { once: true, capture: true })
    return () => document.removeEventListener('pointerdown', prime, { capture: true })
    // Mount only: `resume` describes how this run began, not how it's going.
  }, [])

  // New geometry does mean progress has to be re-acquired from scratch — but
  // only on a genuine change, not on mount, where a resumed run's position
  // along the route is exactly what is wanted.
  const routeIdRef = useRef(route.id)
  useEffect(() => {
    if (routeIdRef.current === route.id) return
    routeIdRef.current = route.id
    segmentRef.current = undefined
    lastFixRef.current = null
    relocateStreakRef.current = 0
  }, [route.id])

  // iOS evicts a backgrounded app without warning, but always hides it first —
  // so the moment it's hidden is the moment to write down exactly where the
  // runner is, rather than wherever the last periodic save happened to be.
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === 'visible' && document.hasFocus?.() !== false) return
      if (latestCheckpointRef.current) onCheckpoint(latestCheckpointRef.current)
    }
    const flushNow = () => {
      if (latestCheckpointRef.current) onCheckpoint(latestCheckpointRef.current)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flushNow)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flushNow)
    }
  }, [onCheckpoint])

  // Any way back belongs to the geometry it was planned against.
  const clearDetour = useCallback(() => {
    detourRequestRef.current.controller?.abort()
    detourRequestRef.current.controller = null
    detourRef.current = null
    setDetour(null)
    onDetour(null)
  }, [onDetour])

  useEffect(() => clearDetour, [route.id, clearDetour])

  /** Fetch a walking route from here back onto the loop. */
  const requestDetour = useCallback(
    (from: LatLng, fromDistance: number) => {
      const target = rejoinTarget(route.path, cumulative, fromDistance, from)
      if (!target) return
      const controller = new AbortController()
      detourRequestRef.current = { at: Date.now(), controller }
      routing
        .route([from, target.point], controller.signal, { allowUTurns: true })
        .then((geometry) => {
          if (controller.signal.aborted || geometry.path.length < 2) return
          const next: Detour = {
            path: geometry.path,
            cumulative: cumulativeDistances(geometry.path),
            steps: placeSteps(geometry.path, geometry.steps ?? []),
            rejoinAlong: target.distanceAlong,
          }
          detourRef.current = next
          setDetour(next)
          onDetour(next.path)
          const first = nextStep(next.steps, 0)
          // The rerouting line already includes the first instruction, so it
          // counts as that instruction's announcement at this distance.
          const band = first ? bandFor(first.distanceAlong) : null
          if (first && band !== null) spokenRef.current.set(`detour:${Math.round(first.distanceAlong)}`, band)
          if (!mutedRef.current) {
            speak(
              first
                ? `Rerouting. ${announcementFor(first, first.distanceAlong, distanceUnit)}`
                : 'Rerouting. Head back to the route.',
            )
          }
        })
        .catch(() => {
          // Offline or the service is down: the arrow back to the line stands in.
        })
        .finally(() => {
          if (detourRequestRef.current.controller === controller) detourRequestRef.current.controller = null
        })
    },
    [route.path, cumulative, routing, onDetour, distanceUnit],
  )

  const pause = useCallback((reason: 'manual' | 'auto') => {
    setClock((current) => pauseClock(current, Date.now()))
    setPausedBy(reason)
  }, [])
  const unpause = useCallback(() => {
    setClock((current) => resumeClock(current, Date.now()))
    setPausedBy(null)
    motionRef.current.reset()
  }, [])

  // Every change to the stopwatch is saved, so a reload mid-pause stays paused.
  useEffect(() => {
    if (countdown === null) onClock(clock)
  }, [clock, countdown, onClock])

  // 3, 2, 1, go. The clock starts on "go", not on the tap.
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      if (!mutedRef.current) speak('Go!')
      setClock(startClock(Date.now()))
      setCountdown(null)
      return
    }
    if (!mutedRef.current) speak(String(countdown))
    const timer = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  const skipCountdown = () => {
    silence()
    setClock(startClock(Date.now()))
    setCountdown(null)
  }

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
    const onFix = (fix: GeolocationPosition) => {
      const position = { lat: fix.coords.latitude, lng: fix.coords.longitude }

      // Accuracy collapses between buildings, which is where junctions are —
      // so the worst fixes arrive exactly when a runner turns.
      const verdict = filterRef.current.accept({
        position,
        accuracy: typeof fix.coords.accuracy === 'number' ? fix.coords.accuracy : 0,
        timestamp: fix.timestamp,
      })
      if (!verdict.accepted) return

      // Which way round the loop are we actually going? Decided once, from
      // the first real movement away from the start.
      if (originRef.current === null) originRef.current = position
      if (!directionSettledRef.current) {
        const direction = detectDirection(route.path, originRef.current, position)
        if (direction !== null) {
          directionSettledRef.current = true
          onDirection(direction)
          // The route may be about to be swapped underneath us, so this fix
          // is left to the next render rather than measured against the old one.
          if (direction === 'reverse') return
        }
      }

      // After a gap — screen off, a tunnel, the app in the background — the
      // runner may be far beyond the usual window. And while following a way
      // back, the window has to reach where it rejoins.
      const gapSeconds =
        lastAcceptedAtRef.current === null ? 0 : (fix.timestamp - lastAcceptedAtRef.current) / 1000
      const anchor = segmentRef.current === undefined ? 0 : cumulative[Math.min(segmentRef.current, cumulative.length - 1)]
      const toRejoin = detourRef.current ? detourRef.current.rejoinAlong - anchor + 150 : 0
      const next = locateOnRoute(
        route.path,
        position,
        { fromSegment: segmentRef.current, lookAhead: Math.max(lookAheadAfter(gapSeconds), toRejoin) },
        cumulative,
      )

      // Wait for a second far-off match before believing the runner really is
      // somewhere else on the route; one is usually a bad fix at a junction.
      if (next.relocated) {
        relocateStreakRef.current += 1
        if (relocateStreakRef.current < 2) return
      } else {
        relocateStreakRef.current = 0
      }

      lastAcceptedAtRef.current = fix.timestamp
      segmentRef.current = next.segment
      setProgress(next)
      setHere(position)

      // Auto-pause: standing still at a crossing stops the clock, and setting
      // off again starts it. A pause the runner chose is theirs to end.
      if (!countingDownRef.current) {
        const motion = motionRef.current.update(position, fix.timestamp)
        const paused = isPaused(clockRef.current)
        if (motion === 'stopped' && !paused) {
          pause('auto')
          if (!mutedRef.current) speak('Run paused.')
        } else if (motion === 'moving' && paused && pausedByRef.current === 'auto') {
          unpause()
          if (!mutedRef.current) speak('Run resumed.')
        }
      }
      const strayed = isOffRoute(next)
      // On the route, the runner is drawn on it: raw fixes jitter by metres
      // even when good, and a puck that twitches off the line reads as broken.
      onPosition(strayed ? position : next.snapped)
      onProgress(next.fraction)

      // Off the route: once it's clear they've left it, plan a way back.
      offStreakRef.current = strayed ? offStreakRef.current + 1 : 0
      const current = detourRef.current
      if (current && hasRejoined(next.offRouteBy)) {
        clearDetour()
      } else if (strayed) {
        const offDetourBy = current
          ? locateOnRoute(current.path, position, {}, current.cumulative).offRouteBy
          : null
        if (
          shouldRequestDetour({
            offStreak: offStreakRef.current,
            offRouteBy: next.offRouteBy,
            offDetourBy,
            sinceLastRequest: Date.now() - detourRequestRef.current.at,
            online: typeof navigator === 'undefined' || navigator.onLine !== false,
            inFlight: detourRequestRef.current.controller !== null,
          })
        ) {
          requestDetour(position, next.distanceAlong)
        }
      }

      latestCheckpointRef.current = { distanceAlong: next.distanceAlong, segment: next.segment }
      if (Date.now() - lastCheckpointRef.current > CHECKPOINT_EVERY_MS) {
        lastCheckpointRef.current = Date.now()
        onCheckpoint(latestCheckpointRef.current)
      }

      // Satellites only contribute course over ground here; which way the
      // runner is facing comes from the compass, above.
      courseRef.current =
        typeof fix.coords.heading === 'number' && !Number.isNaN(fix.coords.heading)
          ? fix.coords.heading
          : null
      speedRef.current = typeof fix.coords.speed === 'number' ? fix.coords.speed : null
      derivedRef.current = lastFixRef.current ? headingBetween(lastFixRef.current, position) : null
      publishHeading()
      lastFixRef.current = position
    }

    const stop = watchGps({ onFix, onStatus: setGps })

    return () => {
      stop()
      onPosition(null)
      onHeading(null)
    }
  }, [
    route,
    cumulative,
    onPosition,
    onHeading,
    onProgress,
    onDirection,
    onCheckpoint,
    publishHeading,
    requestDetour,
    clearDetour,
    pause,
    unpause,
  ])

  const finished = progress ? hasFinished(progress) : false
  const strayed = progress ? isOffRoute(progress) : false

  // While following a way back, its directions take over the banner.
  const detourAlong = detour && here ? locateOnRoute(detour.path, here, {}, detour.cumulative).distanceAlong : null
  const detourStep = detour && detourAlong !== null ? nextStep(detour.steps, detourAlong) : null
  const detourStepIsFinal = detourStep?.type === 'arrive'
  const upcoming = detour
    ? detourStepIsFinal
      ? null
      : detourStep
    : progress
      ? nextStep(route.steps, progress.distanceAlong)
      : null
  const metersToTurn =
    upcoming && detour && detourAlong !== null
      ? Math.max(0, upcoming.distanceAlong - detourAlong)
      : upcoming && progress
        ? Math.max(0, upcoming.distanceAlong - progress.distanceAlong)
        : null
  const metersToRejoin =
    detour && detourAlong !== null ? Math.max(0, detour.cumulative[detour.cumulative.length - 1] - detourAlong) : null

  // Speak each maneuver once per distance band as it approaches.
  const guidanceKey = upcoming ? `${detour ? 'detour' : 'route'}:${Math.round(upcoming.distanceAlong)}` : null
  useEffect(() => {
    if (mutedRef.current || !upcoming || metersToTurn === null || guidanceKey === null) return
    const band = bandFor(metersToTurn)
    if (band === null) return
    if (spokenRef.current.get(guidanceKey) === band) return
    spokenRef.current.set(guidanceKey, band)
    speak(announcementFor(upcoming, metersToTurn, distanceUnit))
  }, [upcoming, metersToTurn, distanceUnit, guidanceKey])

  // Arriving is announced once, the way a navigation app says you're there.
  const announcedFinishRef = useRef(false)
  useEffect(() => {
    if (!finished || announcedFinishRef.current) return
    announcedFinishRef.current = true
    if (!mutedRef.current) speak('You’re back at the start. Nice run.')
  }, [finished])

  useEffect(() => silence, [])

  // A single stray tap on End shouldn't throw away a run.
  useEffect(() => {
    if (!confirmingEnd) return
    const timer = setTimeout(() => setConfirmingEnd(false), CONFIRM_END_MS)
    return () => clearTimeout(timer)
  }, [confirmingEnd])

  // Before the first fix after a reload, show where the run had got to.
  const covered = progress?.distanceAlong ?? resume?.distanceAlong ?? 0
  const moving = countdown !== null ? 0 : movingSecondsOf(clock, now)
  const paused = isPaused(clock)

  // Splits, halfway and the last stretch, spoken between the turns.
  useEffect(() => {
    if (!progress || countdown !== null) return
    const total = cumulative[cumulative.length - 1] ?? route.distance
    // A resumed run has already heard everything up to where it was.
    if (coachRef.current === null) {
      coachRef.current = coachCues({
        distanceAlong: progress.distanceAlong,
        total,
        movingSeconds: movingSecondsOf(clockRef.current, Date.now()),
        unit: distanceUnit,
        state: INITIAL_COACH,
      }).state
      if (resume) return
    }
    const out = coachCues({
      distanceAlong: progress.distanceAlong,
      total,
      movingSeconds: movingSecondsOf(clockRef.current, Date.now()),
      unit: distanceUnit,
      state: coachRef.current,
    })
    coachRef.current = out.state
    if (!mutedRef.current) for (const cue of out.cues) speak(cue)
  }, [progress, countdown, cumulative, route.distance, distanceUnit, resume])
  const remaining = progress?.distanceRemaining ?? Math.max(0, route.distance - covered)
  const timeLeft = estimateDuration(
    remaining,
    route.profile.gain * (remaining / Math.max(route.distance, 1)),
    paceSeconds,
    distanceUnit,
  )

  const summary = buildRunSummary({
    distanceCovered: covered,
    // Pace and time are for running, not for waiting at crossings.
    elapsedSeconds: moving,
    routeDistance: route.distance,
    routeGain: route.profile.gain,
    unit: distanceUnit,
  })

  const showingSummary = (finished && !dismissedSummary) || ended

  // Log the run the moment its summary appears — once per appearance, not on
  // every fix that arrives while it's on screen. Saved by run id, so "keep
  // running" and ending later updates the same entry rather than adding one.
  const recordedRef = useRef(false)
  useEffect(() => {
    if (!showingSummary) {
      recordedRef.current = false
      return
    }
    if (recordedRef.current || covered < MIN_DISTANCE_TO_RECORD) return
    recordedRef.current = true
    try {
      setEarned(
        onRecord({
          id: runId,
          finishedAt: new Date().toISOString(),
          distance: covered,
          movingSeconds: summary.elapsedSeconds,
          gain: summary.gain,
          completed: summary.completed,
        }),
      )
    } catch {
      // A log that can't be written mustn't take the summary down with it.
    }
  }, [showingSummary, covered, onRecord, runId, summary.elapsedSeconds, summary.gain, summary.completed])

  const share = async () => {
    const text = runShareText(summary, distanceUnit)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text })
        return
      }
      await navigator.clipboard.writeText(text)
      setShareNote('Copied — paste it anywhere')
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') setShareNote('Couldn’t share from this browser')
    }
  }

  // The end of a run is the one moment a runner is certain to look at the
  // screen, so it gets the whole of it.
  if (showingSummary) {
    const celebrate = summary.completed || earned.length > 0
    return (
      <section className="nav nav-finished" aria-label="Run summary">
        {celebrate ? <Confetti /> : null}
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

          {earned.length > 0 ? (
            <ul className="finish-badges" aria-label="Achievements">
              {earned.slice(0, 3).map((badge) => (
                <li key={badge.id} className="finish-badge">
                  <span className="finish-badge-emoji" aria-hidden="true">
                    {badge.emoji}
                  </span>
                  <span>
                    <strong>{badge.title}</strong>
                    <span className="finish-badge-detail">{badge.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="finish-actions">
            <button type="button" className="btn" onClick={onToggleSaved}>
              {isRouteSaved ? 'Saved ✓' : 'Save route'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void share()}>
              Share
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
          {shareNote ? <p className="finish-note">{shareNote}</p> : null}

          <button
            type="button"
            className="btn-link finish-continue"
            onClick={() => {
              setDismissedSummary(true)
              if (ended) {
                setEnded(false)
                unpause()
              }
            }}
          >
            Keep running
          </button>
        </div>
      </section>
    )
  }

  // Off the route with no way back fetched (offline, or still asking): point
  // at the line, relative to the way the runner is facing.
  const backToLine =
    strayed && !detour && progress && here
      ? angleDifference(shownHeadingRef.current ?? 0, bearingTo(here, progress.snapped))
      : null

  let banner: { arrow: number | null; distance: string | null; instruction: string }
  if (detour && (upcoming || metersToRejoin !== null)) {
    banner =
      upcoming && metersToTurn !== null
        ? { arrow: turnAngle(upcoming), distance: distancePhrase(metersToTurn, distanceUnit), instruction: instructionFor(upcoming) }
        : { arrow: 0, distance: distancePhrase(metersToRejoin ?? 0, distanceUnit), instruction: 'Rejoin your route' }
  } else if (backToLine !== null && progress) {
    banner = {
      arrow: backToLine,
      distance: distancePhrase(progress.offRouteBy, distanceUnit),
      instruction: 'Head back to your route',
    }
  } else if (upcoming && metersToTurn !== null) {
    banner = { arrow: turnAngle(upcoming), distance: distancePhrase(metersToTurn, distanceUnit), instruction: instructionFor(upcoming) }
  } else {
    banner = {
      arrow: null,
      distance: null,
      instruction: finished
        ? 'You’re back at the start — nice run'
        : progress
          ? 'Carry on'
          : gps === 'denied'
            ? 'Location is off'
            : resume
              ? 'Picking your run back up…'
              : 'Finding you…',
    }
  }

  const gpsNotice =
    gps === 'denied'
      ? 'Location access is off. Turn it on in Settings to keep navigating.'
      : gps === 'unsupported'
        ? 'This browser cannot follow your position.'
        : gps === 'searching' && progress
          ? 'Searching for GPS…'
          : null

  return (
    <section className="nav" aria-label="Run navigation">
      <div className={strayed || detour ? 'nav-banner astray' : 'nav-banner'}>
        {banner.arrow !== null ? <TurnArrow angle={banner.arrow} /> : null}
        <div className="nav-banner-text">
          {banner.distance ? <span className="nav-distance">{banner.distance}</span> : null}
          <span className="nav-instruction">{banner.instruction}</span>
        </div>
      </div>

      {reversed ? (
        <p className="nav-note">Going round the other way — directions flipped</p>
      ) : null}
      {resume && !progress ? <p className="nav-note">Picked up where you left off</p> : null}

      {strayed && progress && progress.offRouteBy > OFF_ROUTE_METERS && !detour ? (
        <p className="nav-alert">{Math.round(progress.offRouteBy)} m off route</p>
      ) : null}
      {gpsNotice ? <p className="nav-alert">{gpsNotice}</p> : null}
      {paused && countdown === null ? (
        <div className="nav-paused">
          <span>{pausedBy === 'auto' ? 'Auto-paused — you’ve stopped' : 'Paused'}</span>
          <button type="button" className="btn nav-resume" onClick={unpause}>
            Resume
          </button>
        </div>
      ) : null}
      {countdown !== null ? (
        <button type="button" className="nav-countdown" onClick={skipCountdown} aria-label="Skip the countdown">
          <span key={countdown} className="nav-countdown-number">
            {countdown === 0 ? 'Go!' : countdown}
          </span>
          <span className="nav-countdown-hint">
            {progress ? 'GPS locked — tap to skip' : 'Finding GPS… tap to skip'}
          </span>
        </button>
      ) : null}

      {/* The map owns this space, so it must not swallow pans and pinches. */}
      <div className="nav-spacer" style={{ pointerEvents: 'none' }}>
        <div className="nav-float">
          <button
            type="button"
            className="nav-icon-btn"
            aria-pressed={muted}
            aria-label={muted ? 'Turn voice directions on' : 'Turn voice directions off'}
            onClick={() => {
              setMuted((was) => !was)
              silence()
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
            aria-label={perspective === '3d' ? 'Switch to a flat map' : 'Switch to the tilted view'}
            onClick={onTogglePerspective}
          >
            {perspective === '3d' ? '3D' : '2D'}
          </button>
        </div>
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
        {/* Tap to switch between what's left and how the run is going. */}
        <button
          type="button"
          className="nav-summary"
          aria-label={statsView === 'left' ? 'Show run time and pace' : 'Show time and distance left'}
          onClick={() => {
            const next = statsView === 'left' ? 'run' : 'left'
            setStatsView(next)
            statsPreference.write(next)
          }}
        >
          {statsView === 'left' ? (
            <>
              <span className="nav-eta">{formatDuration(timeLeft)}</span>
              <span className="nav-sub">
                {formatDistance(remaining, distanceUnit)} left · {formatDistance(covered, distanceUnit)} done
              </span>
            </>
          ) : (
            <>
              <span className={paused ? 'nav-eta is-paused' : 'nav-eta'}>{formatDuration(moving)}</span>
              <span className="nav-sub">
                {summary.paceSecondsPerUnit === null
                  ? 'pace after the first few hundred metres'
                  : `${formatPace(summary.paceSecondsPerUnit, distanceUnit)} avg`}{' '}
                · {formatDistance(covered, distanceUnit)}
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          className={paused ? 'nav-icon-btn nav-pause is-paused' : 'nav-icon-btn nav-pause'}
          aria-label={paused ? 'Resume the run' : 'Pause the run'}
          disabled={countdown !== null}
          onClick={() => (paused ? unpause() : pause('manual'))}
        >
          <PauseIcon paused={paused} />
        </button>
        <button
          type="button"
          className={confirmingEnd ? 'nav-end confirming' : 'nav-end'}
          onClick={() => {
            if (!confirmingEnd) {
              setConfirmingEnd(true)
              return
            }
            setConfirmingEnd(false)
            // Far enough to be a run: show how it went. Otherwise just leave.
            if (covered >= MIN_DISTANCE_TO_RECORD) {
              if (!paused) pause('manual')
              setEnded(true)
            } else {
              onExit()
            }
          }}
        >
          {confirmingEnd ? 'Tap to end' : 'End'}
        </button>
      </div>
      <p className="nav-attribution">Map data © OpenStreetMap contributors</p>
    </section>
  )
}
