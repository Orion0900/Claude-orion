/**
 * A GPS feed that keeps going for the length of a run.
 *
 * `watchPosition` on its own is not that. With a timeout set, standing at a
 * crossing for a few seconds produces a TIMEOUT error that reads as "lost your
 * location". After an error some browsers quietly stop delivering. And when an
 * iPhone comes back from a locked screen or another app, the watch can sit
 * silent for a long time before its first new fix.
 *
 * So this wraps it: no browser timeout, its own watchdog that notices silence
 * and restarts the watch, a restart on any recoverable error, and an immediate
 * restart whenever the page becomes visible again. The caller hears about
 * fixes, and about whether the signal is currently good.
 */
export type GpsStatus = 'ok' | 'searching' | 'denied' | 'unsupported'

/** Silence longer than this means the watch has stalled, not that you've stopped. */
export const STALE_AFTER_MS = 12_000
/** Pause before retrying after an error, so a failing receiver isn't hammered. */
export const RETRY_AFTER_MS = 2_500
const WATCHDOG_EVERY_MS = 3_000

export interface GpsWatchOptions {
  onFix(fix: GeolocationPosition): void
  onStatus(status: GpsStatus): void
}

export interface GpsEnvironment {
  geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'> | null
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> | null
  now(): number
}

function browserEnvironment(): GpsEnvironment {
  return {
    geolocation: typeof navigator !== 'undefined' && 'geolocation' in navigator ? navigator.geolocation : null,
    document: typeof document === 'undefined' ? null : document,
    now: () => Date.now(),
  }
}

const PERMISSION_DENIED = 1

export function watchGps(options: GpsWatchOptions, env: GpsEnvironment = browserEnvironment()): () => void {
  const { geolocation } = env
  if (!geolocation) {
    options.onStatus('unsupported')
    return () => undefined
  }

  let watchId: number | null = null
  let stopped = false
  let denied = false
  let status: GpsStatus | null = null
  let lastSignalAt = env.now()
  let retry: ReturnType<typeof setTimeout> | null = null

  const report = (next: GpsStatus) => {
    if (next === status) return
    status = next
    options.onStatus(next)
  }

  const clear = () => {
    if (watchId !== null) geolocation.clearWatch(watchId)
    watchId = null
  }

  const start = () => {
    if (stopped || denied) return
    clear()
    // Counted from the (re)start, so a fresh watch gets a fair chance to report.
    lastSignalAt = env.now()
    watchId = geolocation.watchPosition(
      (fix) => {
        if (stopped) return
        lastSignalAt = env.now()
        report('ok')
        options.onFix(fix)
      },
      (error) => {
        if (stopped) return
        if (error.code === PERMISSION_DENIED) {
          denied = true
          clear()
          report('denied')
          return
        }
        report('searching')
        if (retry === null) {
          retry = setTimeout(() => {
            retry = null
            start()
          }, RETRY_AFTER_MS)
        }
      },
      // No timeout: silence is handled by the watchdog below, which restarts
      // rather than giving up. maximumAge 0 so a fix is never served from a
      // previous run's cache.
      { enableHighAccuracy: true, maximumAge: 0 },
    )
  }

  const watchdog = setInterval(() => {
    if (stopped || denied) return
    if (env.now() - lastSignalAt > STALE_AFTER_MS) {
      report('searching')
      start()
    }
  }, WATCHDOG_EVERY_MS)

  const onVisibility = () => {
    if (env.document?.visibilityState === 'visible') start()
  }
  env.document?.addEventListener('visibilitychange', onVisibility)

  start()

  return () => {
    stopped = true
    clear()
    clearInterval(watchdog)
    if (retry !== null) clearTimeout(retry)
    env.document?.removeEventListener('visibilitychange', onVisibility)
  }
}
