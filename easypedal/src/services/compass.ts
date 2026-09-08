/**
 * The device compass.
 *
 * iOS gates the magnetometer behind a permission request that only works when
 * called straight from a tap, so asking is separated from listening: the run
 * button asks, and navigation listens afterwards.
 */
import { headingFromOrientation, type OrientationReading } from '../lib/heading'

export type CompassPermission = 'granted' | 'denied' | 'unsupported'

interface OrientationEventConstructor {
  requestPermission?: () => Promise<'granted' | 'denied'>
}

function orientationEvent(): OrientationEventConstructor | undefined {
  return typeof window === 'undefined'
    ? undefined
    : (window.DeviceOrientationEvent as unknown as OrientationEventConstructor | undefined)
}

export function isCompassSupported(): boolean {
  return orientationEvent() !== undefined
}

/**
 * Must be called from inside a user gesture on iOS, or the prompt never
 * appears and the request resolves as denied.
 */
export async function requestCompassPermission(): Promise<CompassPermission> {
  const target = orientationEvent()
  if (!target) return 'unsupported'
  // Browsers without the gate expose the events without asking.
  if (typeof target.requestPermission !== 'function') return 'granted'
  try {
    return await target.requestPermission()
  } catch {
    return 'denied'
  }
}

/** Screen rotation, needed to correct a heading when the phone is sideways. */
function screenAngle(): number {
  if (typeof window === 'undefined') return 0
  const angle = window.screen?.orientation?.angle
  return typeof angle === 'number' ? angle : 0
}

export interface CompassOptions {
  /** Called with a heading in degrees clockwise from north. */
  onHeading: (heading: number) => void
}

/**
 * Listen for compass headings until the returned function is called.
 *
 * Readings arrive far faster than a screen can usefully redraw, so the newest
 * is kept and delivered once per frame — the map turns immediately without the
 * sensor driving a render per event.
 */
export function watchCompass({ onHeading }: CompassOptions): () => void {
  if (typeof window === 'undefined') return () => undefined

  let latest: number | null = null
  let frame = 0

  const deliver = () => {
    frame = 0
    if (latest !== null) onHeading(latest)
  }

  const handle = (event: Event) => {
    const heading = headingFromOrientation(event as unknown as OrientationReading, screenAngle())
    if (heading === null) return
    latest = heading
    if (frame === 0) frame = window.requestAnimationFrame(deliver)
  }

  // Safari fires the absolute variant; other browsers use the plain one.
  window.addEventListener('deviceorientationabsolute', handle, true)
  window.addEventListener('deviceorientation', handle, true)

  return () => {
    window.removeEventListener('deviceorientationabsolute', handle, true)
    window.removeEventListener('deviceorientation', handle, true)
    if (frame !== 0) window.cancelAnimationFrame(frame)
  }
}
