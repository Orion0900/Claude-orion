/**
 * A synthetic town for the route-search tests. Three named ways link the
 * same two points, each easy in a different sense:
 *
 *   - "greenway": a long, flat, car-free cycleway that swings north
 *   - "backstreets": quiet residential streets, fairly direct, over a hill
 *   - "highway": the shortest way, along a trunk road — never acceptable
 *   - "mainroad": direct, on a busy road without a lane, over the same hill
 *
 * The fake engine answers each costing profile with the routes that profile
 * would plausibly favour, so ranking and filtering are exercised end to end
 * without touching the network.
 */
import { destination, pathLength, type LatLng } from '../geo'
import type { RoadEdge } from '../bikeway'
import type { CostingProfile, ElevationProvider, RouteGeometry, RoutingProvider, WayProvider } from '../routeSearch'

export const FROM: LatLng = { lat: 42.36, lng: -71.06 }
export const TO: LatLng = destination(FROM, 90, 4000)

export type WayName = 'greenway' | 'backstreets' | 'highway' | 'mainroad'

function line(points: LatLng[], spacing = 50): LatLng[] {
  const out: LatLng[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const steps = Math.max(1, Math.ceil(pathLength([a, b]) / spacing))
    for (let s = 1; s <= steps; s++) {
      out.push({ lat: a.lat + ((b.lat - a.lat) * s) / steps, lng: a.lng + ((b.lng - a.lng) * s) / steps })
    }
  }
  return out
}

export const WAYS: Record<WayName, LatLng[]> = {
  greenway: line([FROM, destination(FROM, 0, 1200), destination(TO, 0, 1200), TO]),
  backstreets: line([FROM, destination(FROM, 45, 700), destination(TO, 135, 700), TO]),
  highway: line([FROM, TO]),
  mainroad: line([FROM, destination(FROM, 100, 2000), TO]),
}

const TAGS: Record<WayName, Pick<RoadEdge, 'use' | 'roadClass' | 'cycleLane'>> = {
  greenway: { use: 'cycleway', roadClass: 'service_other', cycleLane: 'none' },
  backstreets: { use: 'road', roadClass: 'residential', cycleLane: 'none' },
  highway: { use: 'road', roadClass: 'trunk', cycleLane: 'none' },
  mainroad: { use: 'road', roadClass: 'primary', cycleLane: 'none' },
}

/** A hill in the middle, which the greenway's northern swing goes round. */
export function terrainElevation(p: LatLng): number {
  const centre = destination(FROM, 90, 2000)
  const dx = (p.lng - centre.lng) * 111320 * Math.cos((p.lat * Math.PI) / 180)
  const dy = (p.lat - centre.lat) * 111320
  const distance = Math.hypot(dx, dy)
  return Math.max(0, 80 - distance / 12)
}

export function geometryFor(name: WayName): RouteGeometry {
  const path = WAYS[name]
  return { path, distance: pathLength(path), turns: name === 'highway' ? 0 : 2, shape: name }
}

export interface FakeEngineOptions {
  /** Which ways each profile returns; defaults to a plausible spread. */
  answer?: (profile: CostingProfile) => WayName[]
  onRoute?: (profile: CostingProfile) => void
}

export function createFakeEngine(options: FakeEngineOptions = {}): RoutingProvider {
  const answer =
    options.answer ??
    ((profile: CostingProfile): WayName[] => {
      if (profile.useRoads <= 0.05) return ['greenway', 'backstreets']
      if (profile.useHills <= 0.05) return ['backstreets', 'mainroad']
      return ['mainroad', 'greenway']
    })
  return {
    async route(_from, _to, profile) {
      options.onRoute?.(profile)
      return answer(profile).map(geometryFor)
    },
  }
}

/** Describes each fake way as a single edge per vertex pair. */
export function createFakeWays(options: { fail?: boolean } = {}): WayProvider {
  return {
    async describe(geometry) {
      if (options.fail) throw new Error('trace unavailable')
      const tags = TAGS[geometry.shape as WayName] ?? TAGS.backstreets
      const edges: RoadEdge[] = []
      for (let i = 1; i < geometry.path.length; i++) {
        const path = [geometry.path[i - 1], geometry.path[i]]
        edges.push({ ...tags, path, length: pathLength(path) })
      }
      return edges
    },
  }
}

export function createTerrainElevation(): ElevationProvider {
  return {
    async lookup(points) {
      return points.map(terrainElevation)
    },
  }
}
