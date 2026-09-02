import { bounds, destination, pathLength, resample, type LatLng } from './geo'
import { buildProfile, type ElevationProfile } from './elevation'

export interface RouteGeometry {
  path: LatLng[]
  /** Routed distance in meters, as reported by the routing engine. */
  distance: number
}

export interface RouteOptions {
  /**
   * Whether the engine may double back at a waypoint. Loops must not (or the
   * engine collapses them into an out-and-back); out-and-backs must, since
   * turning around at the far end is the whole point.
   */
  allowUTurns: boolean
}

export interface RoutingProvider {
  route(waypoints: LatLng[], signal?: AbortSignal, options?: RouteOptions): Promise<RouteGeometry>
}

export interface ElevationProvider {
  lookup(points: LatLng[], signal?: AbortSignal): Promise<number[]>
}

export type RouteShape = 'loop' | 'out-and-back'

export interface RouteCriteria {
  start: LatLng
  /** Target route length, meters. */
  targetDistance: number
  /** Acceptable deviation from target as a fraction, e.g. 0.08 = ±8%. */
  distanceTolerance: number
  /** Max total ascent in meters, or null for no limit. */
  maxGain: number | null
  shape: RouteShape
  /** How many independent directions to explore. */
  candidates: number
  /** How many routes to return. */
  results: number
  /** Changing the seed reshuffles the exploration for a fresh set of routes. */
  seed: number
}

export interface RouteResult {
  id: string
  path: LatLng[]
  distance: number
  profile: ElevationProfile
  /** Compass bearing the route heads out on, for labelling. */
  outboundBearing: number
  /** True when the route satisfies every stated constraint. */
  meetsCriteria: boolean
  distanceError: number
  score: number
}

export const DEFAULT_CRITERIA: Omit<RouteCriteria, 'start'> = {
  targetDistance: 8046.72, // 5 miles
  distanceTolerance: 0.08,
  maxGain: 152.4, // 500 ft
  shape: 'loop',
  candidates: 8,
  results: 4,
  seed: 1,
}

/** Deterministic PRNG so a given seed always reproduces the same route set. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const VERTICES = 5 // waypoints forming the loop, including the start

/**
 * Radius of a circle whose inscribed `VERTICES`-gon has the given perimeter,
 * scaled down by an assumed street-network detour factor. Roads never follow
 * the ideal polygon, so the first guess deliberately undershoots and the
 * refinement loop grows it to fit.
 */
export function initialRadius(targetDistance: number, shape: RouteShape): number {
  if (shape === 'out-and-back') return (targetDistance / 2) * 0.75
  const perimeterPerRadius = 2 * VERTICES * Math.sin(Math.PI / VERTICES)
  return targetDistance / (perimeterPerRadius * 1.2)
}

/**
 * Waypoints for one candidate. `jitter` (0..1) pushes vertices off the perfect
 * circle so successive candidates explore genuinely different streets rather
 * than returning near-identical rings.
 */
export function buildWaypoints(
  start: LatLng,
  radius: number,
  bearing: number,
  shape: RouteShape,
  jitter: (magnitude: number) => number = () => 0,
): LatLng[] {
  if (shape === 'out-and-back') {
    const heading = bearing + jitter(10)
    return [
      start,
      destination(start, heading, radius * 0.5),
      destination(start, heading + jitter(12), radius),
      start,
    ]
  }

  // Place the loop's centre one radius away along `bearing`, then walk
  // vertices around that centre so the run leaves and returns from the start.
  const centre = destination(start, bearing, radius)
  const waypoints: LatLng[] = [start]
  for (let i = 1; i < VERTICES; i++) {
    const angle = bearing + 180 + (360 / VERTICES) * i + jitter(18)
    waypoints.push(destination(centre, angle, radius * (1 + jitter(0.18))))
  }
  waypoints.push(start)
  return waypoints
}

function centroid(path: LatLng[]): LatLng {
  const [sw, ne] = bounds(path)
  return { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 }
}

/** Two routes are "the same run" if they cover the same ground at the same length. */
export function isDuplicate(a: RouteResult, b: RouteResult): boolean {
  const ca = centroid(a.path)
  const cb = centroid(b.path)
  const near = Math.hypot(ca.lat - cb.lat, ca.lng - cb.lng) < 0.0015 // ~165 m
  const similarLength = Math.abs(a.distance - b.distance) / Math.max(a.distance, b.distance) < 0.05
  return near && similarLength
}

export function scoreRoute(
  distance: number,
  gain: number,
  criteria: RouteCriteria,
): { distanceError: number; meetsCriteria: boolean; score: number } {
  const distanceError = Math.abs(distance - criteria.targetDistance) / criteria.targetDistance
  const overage =
    criteria.maxGain === null ? 0 : Math.max(0, gain - criteria.maxGain) / Math.max(criteria.maxGain, 1)
  const meetsCriteria = distanceError <= criteria.distanceTolerance && overage === 0
  // Distance is the constraint runners feel most, so it dominates the score;
  // climbing over the cap is penalised harder still because it's a hard "no".
  return { distanceError, meetsCriteria, score: distanceError * 2 + overage * 3 }
}

export interface SearchProgress {
  completed: number
  total: number
}

export interface SearchOptions {
  routing: RoutingProvider
  elevation: ElevationProvider
  criteria: RouteCriteria
  signal?: AbortSignal
  onProgress?: (progress: SearchProgress) => void
  /** Refinement passes per candidate before accepting its best attempt. */
  maxRefinements?: number
  /** Elevation samples per route; keep within the provider's request budget. */
  elevationSamples?: number
  /** Parallel routing requests. Public routing servers are fair-use. */
  concurrency?: number
}

/** Refine one candidate's radius until its routed distance lands on target. */
async function exploreCandidate(
  bearing: number,
  options: SearchOptions,
  rng: () => number,
): Promise<RouteGeometry | null> {
  const { routing, criteria, signal } = options
  const maxRefinements = options.maxRefinements ?? 4
  const jitter = (magnitude: number) => (rng() * 2 - 1) * magnitude

  let radius = initialRadius(criteria.targetDistance, criteria.shape)
  let best: RouteGeometry | null = null
  let bestError = Infinity

  for (let attempt = 0; attempt < maxRefinements; attempt++) {
    if (signal?.aborted) break
    const waypoints = buildWaypoints(criteria.start, radius, bearing, criteria.shape, jitter)

    let geometry: RouteGeometry
    try {
      geometry = await routing.route(waypoints, signal, {
        allowUTurns: criteria.shape === 'out-and-back',
      })
    } catch {
      // A single failed leg shouldn't kill the whole search; try a tighter radius.
      radius *= 0.85
      continue
    }

    if (geometry.path.length < 2 || geometry.distance <= 0) {
      radius *= 0.85
      continue
    }

    const error = Math.abs(geometry.distance - criteria.targetDistance) / criteria.targetDistance
    if (error < bestError) {
      bestError = error
      best = geometry
    }
    if (error <= criteria.distanceTolerance) break

    // Scale the radius by how far off we landed, clamped so one wild routing
    // result can't send the next attempt somewhere unrecoverable.
    const correction = Math.min(1.7, Math.max(0.55, criteria.targetDistance / geometry.distance))
    radius *= correction
  }

  return best
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * Explore candidate loops in evenly spread directions, refine each toward the
 * target distance, attach an elevation profile, then rank and de-duplicate.
 */
export async function findRoutes(options: SearchOptions): Promise<RouteResult[]> {
  const { criteria, elevation, signal, onProgress } = options
  const sampleCount = options.elevationSamples ?? 100
  const rng = mulberry32(criteria.seed)

  // Spread candidates around the compass, offset by the seed so a re-roll
  // sends the runner down different streets.
  const startAngle = rng() * 360
  const bearings = Array.from(
    { length: criteria.candidates },
    (_, i) => (startAngle + (360 / criteria.candidates) * i) % 360,
  )

  let completed = 0
  const total = bearings.length
  onProgress?.({ completed, total })

  const geometries = await mapWithConcurrency(
    bearings,
    options.concurrency ?? 3,
    async (bearing) => {
      const geometry = await exploreCandidate(bearing, options, mulberry32(criteria.seed + bearing))
      completed++
      onProgress?.({ completed, total })
      return { bearing, geometry }
    },
  )

  if (signal?.aborted) return []

  const found: RouteResult[] = []
  for (const { bearing, geometry } of geometries) {
    if (!geometry) continue
    const samples = resample(geometry.path, Math.min(sampleCount, Math.max(2, geometry.path.length)))

    let profile: ElevationProfile
    try {
      const elevations = await elevation.lookup(samples, signal)
      profile = buildProfile(samples, elevations)
    } catch {
      continue // no elevation data means we can't honour the climb constraint
    }

    const distance = geometry.distance || pathLength(geometry.path)
    const { distanceError, meetsCriteria, score } = scoreRoute(distance, profile.gain, criteria)

    found.push({
      id: `${criteria.seed}-${Math.round(bearing)}`,
      path: geometry.path,
      distance,
      profile,
      outboundBearing: bearing,
      meetsCriteria,
      distanceError,
      score,
    })
  }

  found.sort((a, b) => {
    if (a.meetsCriteria !== b.meetsCriteria) return a.meetsCriteria ? -1 : 1
    return a.score - b.score
  })

  const unique: RouteResult[] = []
  for (const route of found) {
    if (unique.some((kept) => isDuplicate(kept, route))) continue
    unique.push(route)
    if (unique.length >= criteria.results) break
  }
  return unique
}

/** Compass label for a bearing, e.g. 200 -> "SSW". */
export function compassLabel(bearing: number): string {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
  return points[Math.round(((bearing % 360) + 360) % 360 / 22.5) % 16]
}
