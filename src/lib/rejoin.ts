/**
 * Getting back on route after leaving it, the way a navigation app does.
 *
 * Miss a turn, or take a detour round roadworks, and a line on the map is not
 * enough: the runner wants to be told which way to go. So once they are clearly
 * off the route, a short walking route is fetched from where they are back to
 * the loop, and followed with its own instructions until they rejoin it.
 *
 * Where to rejoin matters. The nearest point on the whole loop could be a part
 * already run, or the far side of it — cutting the run short. So the search
 * only looks ahead of the last point they were on route, and mildly prefers
 * rejoining sooner, so a missed turn leads back to that turn rather than
 * somewhere half a mile on.
 */
import { haversine, interpolate, type LatLng } from './geo'
import { OFF_ROUTE_METERS } from './follow'

/** Off by more than this, repeatedly, and the runner has left the route. */
export const DETOUR_AFTER_METERS = 50
/** That many accepted fixes in a row, so one bad fix doesn't trigger it. */
export const DETOUR_CONFIRM_FIXES = 3
/** How far along the route to look for somewhere to rejoin. */
export const REJOIN_SEARCH_METERS = 900
/** Rejoin a little past the nearest point, so arriving doesn't mean turning back. */
export const REJOIN_AHEAD_METERS = 20
/** Don't ask again sooner than this, however lost things look. */
export const DETOUR_MIN_INTERVAL_MS = 15_000
/** Straying this far from the detour itself means it needs redoing. */
export const DETOUR_ABANDON_METERS = 45
/**
 * Cost per metre of route skipped, relative to a metre of running to get
 * there. Below 1, so the nearest way back still wins over a long detour; above
 * 0, so of two similar ways back the one that skips less of the loop wins.
 */
const SKIP_PENALTY = 0.3

export interface RejoinTarget {
  point: LatLng
  /** Where on the route it is, in meters from the start. */
  distanceAlong: number
}

/** Point `meters` along the path, given its cumulative distances. */
function pointAlong(path: LatLng[], cumulative: number[], meters: number): LatLng {
  const total = cumulative[cumulative.length - 1]
  const target = Math.min(Math.max(0, meters), total)
  let i = 1
  while (i < cumulative.length - 1 && cumulative[i] < target) i++
  const span = cumulative[i] - cumulative[i - 1]
  return interpolate(path[i - 1], path[i], span === 0 ? 0 : (target - cumulative[i - 1]) / span)
}

export function rejoinTarget(
  path: LatLng[],
  cumulative: number[],
  fromDistance: number,
  here: LatLng,
): RejoinTarget | null {
  if (path.length < 2) return null
  const total = cumulative[cumulative.length - 1]
  const end = Math.min(total, fromDistance + REJOIN_SEARCH_METERS)

  let best: { cost: number; along: number } | null = null
  // Every 10 m is far finer than the choice needs to be.
  for (let along = Math.max(0, fromDistance); along <= end; along += 10) {
    const cost = haversine(here, pointAlong(path, cumulative, along)) + (along - fromDistance) * SKIP_PENALTY
    if (!best || cost < best.cost) best = { cost, along }
  }
  if (!best) return null

  const along = Math.min(total, best.along + REJOIN_AHEAD_METERS)
  return { point: pointAlong(path, cumulative, along), distanceAlong: along }
}

export interface DetourDecision {
  /** Off-route fixes in a row so far. */
  offStreak: number
  /** How far off the route the latest fix is. */
  offRouteBy: number
  /** Whether a detour is already being followed, and how far off it they are. */
  offDetourBy: number | null
  /** Milliseconds since the last request, or Infinity if none. */
  sinceLastRequest: number
  online: boolean
  inFlight: boolean
}

/** Whether to fetch a (new) way back to the route now. */
export function shouldRequestDetour(state: DetourDecision): boolean {
  if (!state.online || state.inFlight) return false
  if (state.sinceLastRequest < DETOUR_MIN_INTERVAL_MS) return false
  if (state.offRouteBy <= DETOUR_AFTER_METERS || state.offStreak < DETOUR_CONFIRM_FIXES) return false
  // Already guided back and still following that guidance: leave it be.
  if (state.offDetourBy !== null && state.offDetourBy <= DETOUR_ABANDON_METERS) return false
  return true
}

/** Back on the loop, so the detour has served its purpose. */
export function hasRejoined(offRouteBy: number): boolean {
  return offRouteBy <= OFF_ROUTE_METERS
}
