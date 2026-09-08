/**
 * Finding the easiest ride from A to B.
 *
 * "Easiest" has two halves — as much of the way as possible on bike lanes and
 * paths, and as little climbing as possible — and the rider says which half
 * matters more. The routing engine is asked several times with its own
 * preferences tuned differently each time, every answer is measured for lane
 * coverage and climbing, and the candidates are ranked by the rider's
 * priority. Anything that would put them on a highway is dropped outright.
 */
import { pathLength, resample, resampleWithDistances, haversine, type LatLng } from './geo'
import { buildProfile, type ElevationProfile } from './elevation'
import { placeSteps, type RawStep, type RouteStep } from './navigation'
import {
  bikewayShare,
  breakdownEdges,
  busyShare,
  isSafe,
  type RoadEdge,
  type WayBreakdown,
} from './bikeway'

export type Priority = 'lanes' | 'hills'

/** How the routing engine should weigh roads and hills for one attempt. */
export interface CostingProfile {
  /** 0 keeps to cycleways and paths at any cost; 1 is happy on any road. */
  useRoads: number
  /** 0 avoids hills at any cost; 1 doesn't mind them. */
  useHills: number
}

export interface RouteGeometry {
  path: LatLng[]
  /** Routed distance in meters, as reported by the routing engine. */
  distance: number
  /** Turns a rider has to remember, when the engine reports its steps. */
  turns?: number
  /** Turn-by-turn maneuvers, when the engine describes them. */
  steps?: RawStep[]
  /** The engine's own encoded shape, handed back when asking about its roads. */
  shape?: string
}

/**
 * Thrown by a routing provider that reached its engine and was told there is
 * no way through. It is the opposite of a network failure, and calls for the
 * opposite response from the rider — move a pin, rather than try again — so
 * the two must never be reported as one.
 */
export class NoRouteError extends Error {
  constructor(message = 'No route between these points') {
    super(message)
    this.name = 'NoRouteError'
  }
}

export interface RoutingProvider {
  /**
   * The engine's best route and any alternatives it offers, best first.
   * Throws `NoRouteError` when the engine answered but knows no way through.
   */
  route(from: LatLng, to: LatLng, profile: CostingProfile, signal?: AbortSignal): Promise<RouteGeometry[]>
}

/** Describes the roads a route runs along, stretch by stretch. */
export interface WayProvider {
  describe(geometry: RouteGeometry, signal?: AbortSignal): Promise<RoadEdge[]>
}

export interface ElevationProvider {
  lookup(points: LatLng[], signal?: AbortSignal): Promise<number[]>
}

export interface RideCriteria {
  from: LatLng
  to: LatLng
  priority: Priority
  /** How many routes to return. */
  results: number
}

export type Highlight = 'recommended' | 'most-lanes' | 'flattest' | 'shortest'

export interface RouteResult {
  id: string
  path: LatLng[]
  distance: number
  profile: ElevationProfile
  /** Turns to remember; null when the engine didn't report its steps. */
  turns: number | null
  /** Turn-by-turn instructions, each placed at its distance along the route. */
  steps: RouteStep[]
  /** What kind of roads the ride is on; null when that lookup failed. */
  ways: WayBreakdown | null
  /** Share of the ride on bike lanes and paths, 0-1. Zero when unknown. */
  bikewayShare: number
  /** What this route is best at, for labelling. */
  highlights: Highlight[]
  /** Lower is easier, by the rider's own priority. */
  score: number
}

export const DEFAULT_CRITERIA: Omit<RideCriteria, 'from' | 'to'> = {
  priority: 'lanes',
  results: 4,
}

/**
 * The engine settings to try. The first leans hard on the rider's priority,
 * the second leans harder still, and the third gives the other half of
 * "easy" its turn — so a flat route through quiet streets can still surface
 * when the lanes go the long way round, and vice versa.
 */
export function costingProfiles(priority: Priority): CostingProfile[] {
  if (priority === 'hills') {
    return [
      { useRoads: 0.2, useHills: 0.05 },
      { useRoads: 0.4, useHills: 0 },
      { useRoads: 0.05, useHills: 0.2 },
    ]
  }
  return [
    { useRoads: 0.05, useHills: 0.3 },
    { useRoads: 0, useHills: 0.5 },
    { useRoads: 0.2, useHills: 0.05 },
  ]
}

/** Two candidates are "the same ride" when they follow the same ground at the same length. */
export function isDuplicate(a: Pick<RouteGeometry, 'path' | 'distance'>, b: Pick<RouteGeometry, 'path' | 'distance'>): boolean {
  const longer = Math.max(a.distance, b.distance)
  if (longer === 0) return true
  if (Math.abs(a.distance - b.distance) / longer > 0.03) return false
  const SAMPLES = 24
  const pa = resample(a.path, SAMPLES)
  const pb = resample(b.path, SAMPLES)
  let total = 0
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) total += haversine(pa[i], pb[i])
  return total / SAMPLES < 50
}

export interface ScoreContext {
  /** Shortest routed distance among the candidates, meters. */
  shortest: number
  /** Most climbing among the candidates, meters. */
  mostGain: number
}

/**
 * Rank a candidate by the rider's priority. Lower is better.
 *
 * Both halves of "easy" always count; the priority only decides which one
 * leads. A detour is charged a little too, so a route twice as long never wins
 * on a technicality, and busy roads are penalised on top of not being lanes.
 */
export function scoreRoute(
  candidate: { distance: number; gain: number; ways: WayBreakdown | null },
  context: ScoreContext,
  priority: Priority,
): number {
  const laneScore = candidate.ways
    ? bikewayShare(candidate.ways) + 0.4 * (candidate.ways.meters.quiet / Math.max(1, candidate.ways.total))
    : 0
  const busy = candidate.ways ? busyShare(candidate.ways) : 0
  const hill = context.mostGain <= 0 ? 0 : candidate.gain / context.mostGain
  const detour = context.shortest <= 0 ? 0 : Math.min(1, (candidate.distance / context.shortest - 1) / 0.5)

  const [laneWeight, hillWeight] = priority === 'lanes' ? [0.6, 0.25] : [0.25, 0.6]
  return laneWeight * (1 - laneScore) + hillWeight * hill + 0.15 * detour + 0.2 * busy
}

export interface SearchProgress {
  completed: number
  total: number
}

export interface SearchOptions {
  routing: RoutingProvider
  ways: WayProvider
  elevation: ElevationProvider
  criteria: RideCriteria
  signal?: AbortSignal
  onProgress?: (progress: SearchProgress) => void
  /** Elevation samples per route; keep within the provider's request budget. */
  elevationSamples?: number
  /** Candidates measured in detail, at most. Each costs two more requests. */
  maxCandidates?: number
}

interface Measured {
  geometry: RouteGeometry
  profile: ElevationProfile
  ways: WayBreakdown | null
}

/**
 * Why a search came back with nothing. Coming back empty is not one problem
 * but four, and they call for four different things from the rider — move a
 * pin, wait and retry, or accept there is no safe way through — so the search
 * says which it hit rather than leaving the screen to guess.
 */
export type SearchFailure =
  /** Every attempt to reach the routing engine failed. */
  | 'routing-unavailable'
  /** The engine answered, but knows no way between these two points. */
  | 'no-route'
  /** Routes were found, but their climbing could not be measured. */
  | 'elevation-unavailable'
  /** Every route found puts the rider on a highway. */
  | 'unsafe-only'

export interface SearchOutcome {
  routes: RouteResult[]
  /** Why `routes` is empty; null whenever it isn't. */
  failure: SearchFailure | null
  /** True when routes came back but no road types could be looked up. */
  waysUnavailable: boolean
}

interface Candidates {
  geometries: RouteGeometry[]
  /** True when every attempt failed to reach the engine at all. */
  unreachable: boolean
}

/** Ask the engine with each profile in turn and keep every distinct answer. */
async function collectCandidates(options: SearchOptions, report: () => void): Promise<Candidates> {
  const { routing, criteria, signal } = options
  const geometries: RouteGeometry[] = []
  let attempts = 0
  let unreachable = 0

  for (const profile of costingProfiles(criteria.priority)) {
    if (signal?.aborted) break
    let found: RouteGeometry[] = []
    attempts++
    try {
      found = await routing.route(criteria.from, criteria.to, profile, signal)
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw error
      // One profile failing is not the end of the search. An engine that
      // answered "no way through" is not an engine that could not be reached.
      if (!(error instanceof NoRouteError)) unreachable++
    }
    report()
    for (const geometry of found) {
      if (geometry.path.length < 2 || geometry.distance <= 0) continue
      if (geometries.some((kept) => isDuplicate(kept, geometry))) continue
      geometries.push(geometry)
    }
  }
  return { geometries, unreachable: attempts > 0 && unreachable === attempts }
}

async function measure(geometry: RouteGeometry, options: SearchOptions): Promise<Measured | null> {
  const { ways, elevation, signal } = options
  const sampleCount = options.elevationSamples ?? 100

  let breakdown: WayBreakdown | null = null
  try {
    breakdown = breakdownEdges(await ways.describe(geometry, signal))
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    // Without road data the route still stands; it just can't claim any lanes.
  }

  const samples = resampleWithDistances(
    geometry.path,
    Math.min(sampleCount, Math.max(2, geometry.path.length)),
  )
  try {
    const elevations = await elevation.lookup(samples.points, signal)
    return {
      geometry,
      profile: buildProfile(samples.points, elevations, { distances: samples.distances }),
      ways: breakdown,
    }
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    return null // no elevation data means the climbing half of "easy" can't be judged
  }
}

const EMPTY: SearchOutcome = { routes: [], failure: null, waysUnavailable: false }

const gaveUp = (failure: SearchFailure): SearchOutcome => ({ routes: [], failure, waysUnavailable: false })

/**
 * Find the easiest rides between two points: ask the engine several ways,
 * measure lanes and climbing for each distinct answer, drop anything unsafe,
 * rank by the rider's priority and return the best few.
 */
export async function findRoutes(options: SearchOptions): Promise<SearchOutcome> {
  const { criteria, signal, onProgress } = options
  const maxCandidates = options.maxCandidates ?? 6
  const profiles = costingProfiles(criteria.priority).length

  let completed = 0
  let total = profiles + maxCandidates
  const report = () => onProgress?.({ completed, total })
  report()

  const collected = await collectCandidates(options, () => {
    completed++
    report()
  })
  const candidates = collected.geometries.slice(0, maxCandidates)
  if (signal?.aborted) return EMPTY
  if (candidates.length === 0) {
    return gaveUp(collected.unreachable ? 'routing-unavailable' : 'no-route')
  }

  total = profiles + candidates.length
  report()

  const measured: Measured[] = []
  for (const geometry of candidates) {
    const result = await measure(geometry, options)
    completed++
    report()
    if (result) measured.push(result)
  }
  if (signal?.aborted) return EMPTY
  // Candidates existed but none could be measured: the terrain service is the
  // only thing that stops a route here, and that is a wait-and-retry, not a
  // reason to move a pin.
  if (measured.length === 0) return gaveUp('elevation-unavailable')

  // A highway is never on offer, however good the rest of the route is.
  const safe = measured.filter((item) => item.ways === null || isSafe(item.ways))
  if (safe.length === 0) return gaveUp('unsafe-only')

  const context: ScoreContext = {
    shortest: Math.min(...safe.map((item) => item.geometry.distance)),
    mostGain: Math.max(...safe.map((item) => item.profile.gain)),
  }

  const results: RouteResult[] = safe.map((item, index) => ({
    id: `${criteria.priority}-${index}-${Math.round(item.geometry.distance)}`,
    path: item.geometry.path,
    distance: item.geometry.distance || pathLength(item.geometry.path),
    profile: item.profile,
    turns: item.geometry.turns ?? null,
    steps: item.geometry.steps ? placeSteps(item.geometry.path, item.geometry.steps) : [],
    ways: item.ways,
    bikewayShare: item.ways ? bikewayShare(item.ways) : 0,
    highlights: [],
    score: scoreRoute(
      { distance: item.geometry.distance, gain: item.profile.gain, ways: item.ways },
      context,
      criteria.priority,
    ),
  }))

  results.sort((a, b) => a.score - b.score)
  const kept = assignHighlights(results.slice(0, criteria.results))
  return { routes: kept, failure: null, waysUnavailable: kept.every((route) => route.ways === null) }
}

/** Label what each route is best at, so the list reads as choices rather than a ranking. */
export function assignHighlights(routes: RouteResult[]): RouteResult[] {
  if (routes.length === 0) return routes
  const labelled = routes.map((route) => ({ ...route, highlights: [] as Highlight[] }))
  labelled[0].highlights.push('recommended')

  const best = (pick: (route: RouteResult) => number, lowest: boolean): RouteResult | null => {
    let chosen: RouteResult | null = null
    for (const route of labelled) {
      const value = pick(route)
      if (chosen === null) chosen = route
      else if (lowest ? value < pick(chosen) : value > pick(chosen)) chosen = route
    }
    return chosen
  }

  const mostLanes = best((route) => route.bikewayShare, false)
  if (mostLanes && mostLanes.bikewayShare > 0) mostLanes.highlights.push('most-lanes')
  best((route) => route.profile.gain, true)?.highlights.push('flattest')
  best((route) => route.distance, true)?.highlights.push('shortest')
  return labelled
}

export const HIGHLIGHT_LABELS: Record<Highlight, string> = {
  recommended: 'Recommended',
  'most-lanes': 'Most bike lanes',
  flattest: 'Flattest',
  shortest: 'Shortest',
}

/** The street the ride spends longest on, to tell options apart: "via Mill Road". */
export function viaLabel(steps: Array<Pick<RawStep, 'name' | 'length'>>): string | null {
  let longest: { name: string; length: number } | null = null
  for (const step of steps) {
    if (!step.name || step.length === undefined) continue
    if (longest === null || step.length > longest.length) longest = { name: step.name, length: step.length }
  }
  return longest ? `via ${longest.name}` : null
}
