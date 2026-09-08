/**
 * Working out where a runner is relative to the route they chose.
 *
 * A loop passes close to itself at the start and finish, and often crosses its
 * own path partway round, so "nearest point on the line" alone would teleport
 * your progress backwards. Every fix is therefore matched within a window
 * around the last one, which keeps progress moving forwards.
 */
import { cumulativeDistances, haversine, type LatLng } from './geo'

export interface RouteProgress {
  /** How far off the line you are, in meters. */
  offRouteBy: number
  /** Distance covered along the route, in meters. */
  distanceAlong: number
  distanceRemaining: number
  /** Progress through the route, 0-1. */
  fraction: number
  /** The matched point on the route itself. */
  snapped: LatLng
  /** Index of the matched segment, to seed the next fix. */
  segment: number
  /**
   * True when this fix was matched by searching the whole route rather than
   * near the previous one. A caller should want more than one of these in a row
   * before believing it.
   */
  relocated: boolean
}

/** Beyond this you're not on the route any more, you're near it. */
export const OFF_ROUTE_METERS = 35

/**
 * When the best match near your last fix is this far away, the window may be
 * wrong rather than you: GPS dropped out under a bridge and came back half a
 * mile along, or you rejoined the loop somewhere else entirely.
 *
 * The bar is high on purpose. A city loop runs along streets a block apart and
 * often crosses itself, so a poor fix near a junction can genuinely sit closer
 * to a different part of the route than to the part you are on. Relocating on
 * that is what throws a runner blocks away from themselves.
 */
export const RELOCATE_METERS = 130

/**
 * A relocation also has to be a decisive improvement, not a marginal one — the
 * far-off candidate must be this much closer than staying put, and close enough
 * in absolute terms to be a real match rather than the least bad guess.
 */
export const RELOCATE_IMPROVEMENT = 0.4
export const RELOCATE_MAX_DISTANCE = 45

const R_EARTH = 6371008.8
const toRad = (deg: number) => (deg * Math.PI) / 180

/**
 * Perpendicular projection of `point` onto segment `a`-`b`, using a local flat
 * approximation. Over a segment a few tens of metres long the error is far
 * below GPS noise.
 */
export function projectOntoSegment(
  a: LatLng,
  b: LatLng,
  point: LatLng,
): { t: number; distance: number; snapped: LatLng } {
  const latScale = R_EARTH * toRad(1)
  const lngScale = latScale * Math.cos(toRad(point.lat))

  const ax = a.lng * lngScale
  const ay = a.lat * latScale
  const bx = b.lng * lngScale
  const by = b.lat * latScale
  const px = point.lng * lngScale
  const py = point.lat * latScale

  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy

  // Degenerate segment: both ends are the same place.
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  const snapped = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
  return { t, distance: haversine(point, snapped), snapped }
}

export interface LocateOptions {
  /** Segment index of the previous fix, so matching stays local. */
  fromSegment?: number
  /** How far ahead of the last fix to look, in meters. */
  lookAhead?: number
  /** How far behind the last fix to look, in meters. */
  lookBehind?: number
}

export function locateOnRoute(
  path: LatLng[],
  position: LatLng,
  options: LocateOptions = {},
  cumulative: number[] = cumulativeDistances(path),
): RouteProgress {
  if (path.length < 2) {
    return {
      offRouteBy: path.length === 1 ? haversine(path[0], position) : 0,
      distanceAlong: 0,
      distanceRemaining: 0,
      fraction: 0,
      snapped: path[0] ?? position,
      segment: 0,
      relocated: false,
    }
  }

  const total = cumulative[cumulative.length - 1]
  const { fromSegment, lookAhead = 300, lookBehind = 120 } = options

  // First fix searches everywhere; later ones only near where you just were.
  let first = 0
  let last = path.length - 2
  if (fromSegment !== undefined) {
    const anchor = cumulative[Math.min(fromSegment, cumulative.length - 1)]
    while (first < last && cumulative[first + 1] < anchor - lookBehind) first++
    let end = first
    while (end < path.length - 2 && cumulative[end] < anchor + lookAhead) end++
    last = end
  }

  // A loop's first and last segments both touch the start, so standing there
  // matches each equally well. Ties go to the earlier segment — you haven't run
  // it yet — and a previous fix resolves it properly via the window above.
  const TIE_METERS = 0.5

  const search = (from: number, to: number) => {
    let best = { distance: Infinity, index: from, t: 0, snapped: path[from] }
    for (let i = from; i <= to; i++) {
      const candidate = projectOntoSegment(path[i], path[i + 1], position)
      if (candidate.distance < best.distance - TIE_METERS) {
        best = { distance: candidate.distance, index: i, t: candidate.t, snapped: candidate.snapped }
      }
    }
    return best
  }

  let best = search(first, last)

  // Nothing near the last fix fits: consider re-acquiring against the whole
  // route, but only on overwhelming evidence.
  let relocated = false
  const windowed = first > 0 || last < path.length - 2
  if (windowed && best.distance > RELOCATE_METERS) {
    const global = search(0, path.length - 2)
    if (
      global.distance < RELOCATE_MAX_DISTANCE &&
      global.distance < best.distance * RELOCATE_IMPROVEMENT
    ) {
      best = global
      relocated = true
    }
  }

  const segmentLength = cumulative[best.index + 1] - cumulative[best.index]
  const distanceAlong = cumulative[best.index] + segmentLength * best.t

  return {
    offRouteBy: best.distance,
    distanceAlong,
    distanceRemaining: Math.max(0, total - distanceAlong),
    fraction: total === 0 ? 0 : distanceAlong / total,
    snapped: best.snapped,
    segment: best.index,
    relocated,
  }
}

export function isOffRoute(progress: RouteProgress, tolerance = OFF_ROUTE_METERS): boolean {
  return progress.offRouteBy > tolerance
}

/** True once you're back at the start having covered essentially the whole route. */
export function hasFinished(progress: RouteProgress, totalDistance: number): boolean {
  return progress.distanceAlong >= totalDistance * 0.97
}
