import { toGpx } from './gpx'
import type { RouteResult } from './routeSearch'

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'unsupported'

/** Filesystem- and share-sheet-safe name for a route. */
export function gpxFilename(name: string): string {
  const slug = name
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
  return `${slug || 'route'}.gpx`
}

function gpxFile(route: RouteResult, name: string): File {
  return new File([toGpx(route, name)], gpxFilename(name), { type: 'application/gpx+xml' })
}

/**
 * Hand the route to the phone's own share sheet, which is how a GPX gets from
 * a browser into Strava, Garmin, Files or AirDrop on iOS. Falls back to a plain
 * download on desktop browsers, which have no share sheet.
 */
export async function shareRoute(route: RouteResult, name: string): Promise<ShareOutcome> {
  const file = gpxFile(route, name)

  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title: name })
      return 'shared'
    } catch (error) {
      // The user closing the sheet is a normal outcome, not a failure.
      if ((error as Error).name === 'AbortError') return 'cancelled'
      // Anything else (a share target that rejects files) still deserves the file.
      downloadRoute(route, name)
      return 'downloaded'
    }
  }

  downloadRoute(route, name)
  return 'downloaded'
}

export function downloadRoute(route: RouteResult, name: string): void {
  const url = URL.createObjectURL(gpxFile(route, name))
  const link = document.createElement('a')
  link.href = url
  link.download = gpxFilename(name)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Apple Maps walking directions to the start of a run.
 *
 * Apple's URL scheme carries a single destination — there is no way to hand it
 * a whole loop — so this gets you to the start line and the GPX handles the
 * route itself.
 */
export function appleMapsUrl(start: { lat: number; lng: number }, label = 'Run start'): string {
  const coords = `${start.lat.toFixed(6)},${start.lng.toFixed(6)}`
  const params = new URLSearchParams({ daddr: coords, dirflg: 'w', q: label })
  return `https://maps.apple.com/?${params.toString()}`
}

/** True on iOS and iPadOS, where the share sheet is the useful path. */
export function isAppleDevice(userAgent = navigator.userAgent, maxTouchPoints = navigator.maxTouchPoints): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true
  // iPadOS 13+ reports itself as a Mac; touch points give it away.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}
