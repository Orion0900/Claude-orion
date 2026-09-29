/**
 * Keeping the screen on for the length of a run.
 *
 * On an iPhone, a web app whose screen locks is frozen: no GPS, no directions,
 * and a map that is minutes out of date when the runner looks again. So the
 * screen must stay on — and the ways a browser offers to do that are fragile:
 *
 *   - The Screen Wake Lock is dropped by the browser whenever the page is
 *     hidden, even for a moment (a notification pulled down, a glance at the
 *     music app), and nothing takes it back unless the page asks again.
 *   - Home-screen apps on iOS before 18.4 expose the API but it does nothing.
 *     There the old workaround — a silent, invisible video playing on a loop —
 *     is what actually works.
 *
 * `start` must be called from the tap that starts the run: iOS only lets media
 * play from inside a gesture. A run picked back up after a reload has no such
 * tap, so the next touch anywhere is used instead.
 */
import { SILENT_MP4 } from './silentVideo'

interface WakeLockSentinelLike {
  release(): Promise<void>
  addEventListener?(type: 'release', listener: () => void): void
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>
}

/** Parse "OS 17_4" out of an iOS user agent. */
export function iosVersion(userAgent: string): number | null {
  const match = /OS (\d+)[_.](\d+)/.exec(userAgent)
  if (!match || !/iPhone|iPad|iPod|Macintosh/.test(userAgent)) return null
  return Number(match[1]) + Number(match[2]) / 100
}

/**
 * Whether the video workaround is needed as well as (or instead of) the API.
 */
export function needsVideoFallback(input: {
  userAgent: string
  standalone: boolean
  hasWakeLock: boolean
}): boolean {
  if (!input.hasWakeLock) return true
  const version = iosVersion(input.userAgent)
  // Home-screen apps got a working wake lock in iOS 18.4.
  return input.standalone && version !== null && version < 18.04
}

export interface KeepAwake {
  start(): void
  stop(): void
}

export interface KeepAwakeEnvironment {
  wakeLock: WakeLockLike | null
  document: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> & {
    createElement?: Document['createElement']
    body?: HTMLElement | null
  }
  useVideo: boolean
}

function browserEnvironment(): KeepAwakeEnvironment | null {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return null
  const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock ?? null
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  return {
    wakeLock,
    document,
    useVideo: needsVideoFallback({ userAgent: navigator.userAgent, standalone, hasWakeLock: wakeLock !== null }),
  }
}

export function createKeepAwake(env: KeepAwakeEnvironment | null = browserEnvironment()): KeepAwake {
  let active = false
  let sentinel: WakeLockSentinelLike | null = null
  let requesting = false
  let video: HTMLVideoElement | null = null
  let useVideo = env?.useVideo ?? false

  const playVideo = () => {
    if (!env?.document.createElement || !env.document.body) return
    if (!video) {
      video = env.document.createElement('video')
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')
      video.muted = true
      video.loop = true
      video.setAttribute('aria-hidden', 'true')
      video.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0'
      video.src = SILENT_MP4
      env.document.body.appendChild(video)
    }
    void video.play()?.catch(() => undefined)
  }

  const lock = () => {
    if (!env?.wakeLock || sentinel || requesting || env.document.visibilityState !== 'visible') return
    requesting = true
    env.wakeLock
      .request('screen')
      .then((granted) => {
        requesting = false
        if (!active) {
          void granted.release().catch(() => undefined)
          return
        }
        sentinel = granted
        // The browser drops it on its own when the page is hidden.
        granted.addEventListener?.('release', () => {
          if (sentinel === granted) sentinel = null
        })
      })
      .catch(() => {
        requesting = false
        // Refused (low battery mode, no gesture): fall back to the video.
        if (active && !useVideo) {
          useVideo = true
          playVideo()
        }
      })
  }

  const engage = () => {
    if (!active) return
    lock()
    if (useVideo) playVideo()
  }

  const onVisibility = () => {
    if (env?.document.visibilityState === 'visible') engage()
  }

  return {
    start() {
      if (!env || active) return
      active = true
      engage()
      env.document.addEventListener('visibilitychange', onVisibility)
      // Every touch re-asserts it. Cheap, and covers a run resumed after a
      // reload, where there was no tap to start media from.
      env.document.addEventListener('pointerdown', engage, true)
    },
    stop() {
      if (!env || !active) return
      active = false
      env.document.removeEventListener('visibilitychange', onVisibility)
      env.document.removeEventListener('pointerdown', engage, true)
      void sentinel?.release().catch(() => undefined)
      sentinel = null
      if (video) {
        video.pause()
        video.remove()
        video = null
      }
    },
  }
}
