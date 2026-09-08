/**
 * What kind of ground a route covers, from the point of view of someone on a
 * bike. The routing engine describes each stretch of road with OpenStreetMap
 * vocabulary — its use, its class, whether it carries a cycle lane. This turns
 * that into the handful of categories a rider actually cares about, and adds
 * them up along the route.
 */
import type { LatLng } from './geo'

/** One stretch of road as the routing engine describes it. */
export interface RoadEdge {
  /** Vertices of this stretch, in riding order. */
  path: LatLng[]
  /** Length in meters. */
  length: number
  /** OSM-style use: road, cycleway, path, footway, living_street, track ... */
  use: string
  /** OSM-style class: motorway, trunk, primary, secondary, tertiary, residential ... */
  roadClass: string
  /** none, shared, dedicated or separated. */
  cycleLane: string
  /** True where the way carries a signed cycle route (national, regional or local). */
  onCycleNetwork?: boolean
}

/**
 * The categories, from most to least comfortable.
 *
 *  - protected: a cycleway of its own, or a lane physically separated from cars
 *  - lane:      a painted bike lane on the road
 *  - path:      a car-free path shared with people walking, or a track
 *  - quiet:     a residential or service street with no lane, or shared markings
 *  - busy:      a through road (tertiary and up) with no lane
 *  - unsafe:    a trunk road or motorway — never offered
 */
export type WayKind = 'protected' | 'lane' | 'path' | 'quiet' | 'busy' | 'unsafe'

export const WAY_KINDS: WayKind[] = ['protected', 'lane', 'path', 'quiet', 'busy', 'unsafe']

const CAR_FREE_USES = new Set([
  'path',
  'footway',
  'sidewalk',
  'pedestrian',
  'pedestrian_crossing',
  'track',
  'steps',
  'bridleway',
])
const QUIET_CLASSES = new Set(['residential', 'service_other', 'unclassified', 'living_street'])
const UNSAFE_CLASSES = new Set(['motorway', 'trunk'])

export function classifyEdge(edge: Pick<RoadEdge, 'use' | 'roadClass' | 'cycleLane'>): WayKind {
  const use = edge.use.toLowerCase()
  const lane = edge.cycleLane.toLowerCase()
  const roadClass = edge.roadClass.toLowerCase()

  if (use === 'cycleway' || lane === 'separated') return 'protected'
  if (lane === 'dedicated') return 'lane'
  // A trunk road with only a shared marking is still a trunk road.
  if (UNSAFE_CLASSES.has(roadClass)) return 'unsafe'
  if (CAR_FREE_USES.has(use)) return 'path'
  if (use === 'living_street' || use === 'alley' || use === 'driveway' || use === 'parking_aisle') {
    return 'quiet'
  }
  if (lane === 'shared') return 'quiet'
  if (QUIET_CLASSES.has(roadClass)) return 'quiet'
  return 'busy'
}

/** A run of consecutive edges of one kind, ready to draw. */
export interface WaySegment {
  kind: WayKind
  path: LatLng[]
  length: number
}

export interface WayBreakdown {
  /** Meters covered by each kind. */
  meters: Record<WayKind, number>
  /** Meters covered in total, which may differ slightly from the routed distance. */
  total: number
  /** Consecutive stretches of a single kind, in riding order. */
  segments: WaySegment[]
}

export function emptyBreakdown(): WayBreakdown {
  return {
    meters: { protected: 0, lane: 0, path: 0, quiet: 0, busy: 0, unsafe: 0 },
    total: 0,
    segments: [],
  }
}

/** Classify every edge and merge neighbours of the same kind into segments. */
export function breakdownEdges(edges: RoadEdge[]): WayBreakdown {
  const result = emptyBreakdown()
  for (const edge of edges) {
    const kind = classifyEdge(edge)
    result.meters[kind] += edge.length
    result.total += edge.length

    const last = result.segments[result.segments.length - 1]
    if (last && last.kind === kind) {
      // Edges share their junction vertex; keep one copy so the line is continuous.
      const [first, ...rest] = edge.path
      const joined = last.path[last.path.length - 1]
      last.path.push(...(joined && first && samePoint(joined, first) ? rest : edge.path))
      last.length += edge.length
    } else {
      result.segments.push({ kind, path: [...edge.path], length: edge.length })
    }
  }
  return result
}

function samePoint(a: LatLng, b: LatLng): boolean {
  return Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7
}

/** The kinds that count as "bike lanes & paths": no cars, or a lane of your own. */
export function isBikeway(kind: WayKind): boolean {
  return kind === 'protected' || kind === 'lane' || kind === 'path'
}

/** Share of the route on infrastructure built for bikes: 0-1. */
export function bikewayShare(breakdown: WayBreakdown): number {
  if (breakdown.total <= 0) return 0
  return WAY_KINDS.filter(isBikeway).reduce((sum, kind) => sum + breakdown.meters[kind], 0) / breakdown.total
}

/** Share of the route on through roads with nothing for bikes: 0-1. */
export function busyShare(breakdown: WayBreakdown): number {
  if (breakdown.total <= 0) return 0
  return breakdown.meters.busy / breakdown.total
}

/**
 * A route is only offered if it never puts the rider on a road built for
 * fast traffic. A few metres is tolerated: a crossing, or an on-ramp stub the
 * map tags generously.
 */
export const UNSAFE_TOLERANCE_METERS = 40

export function isSafe(breakdown: WayBreakdown): boolean {
  return breakdown.meters.unsafe <= UNSAFE_TOLERANCE_METERS
}

/** Plain-language verdict on how much of the ride is on bike infrastructure. */
export function bikewayLabel(share: number): string {
  if (share >= 0.9) return 'Almost all on bike lanes & paths'
  if (share >= 0.7) return 'Mostly bike lanes & paths'
  if (share >= 0.4) return 'About half on bike lanes & paths'
  if (share >= 0.15) return 'Some bike lanes & paths'
  return 'Few bike lanes'
}

export const KIND_LABELS: Record<WayKind, string> = {
  protected: 'Protected bike path',
  lane: 'Bike lane',
  path: 'Shared path',
  quiet: 'Quiet street',
  busy: 'Busy road, no lane',
  unsafe: 'Highway',
}
