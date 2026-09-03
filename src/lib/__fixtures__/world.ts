/**
 * A synthetic city used by the route-search tests: streets on a 120 m lattice
 * and terrain that climbs steeply to the east while staying flat to the west.
 * It lets the search algorithm be tested end to end — convergence, constraint
 * filtering, determinism — without touching the public OSM services.
 */
import { pathLength, type LatLng } from '../geo'
import type { ElevationProvider, RouteGeometry, RouteOptions, RoutingProvider } from '../routeSearch'

export const ORIGIN: LatLng = { lat: 42.36, lng: -71.06 }
const METERS_PER_DEG_LAT = 111320
const metersPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)

export interface XY {
  x: number
  y: number
}

export function toXY(p: LatLng): XY {
  return {
    x: (p.lng - ORIGIN.lng) * metersPerDegLng(ORIGIN.lat),
    y: (p.lat - ORIGIN.lat) * METERS_PER_DEG_LAT,
  }
}

export function toLatLng({ x, y }: XY): LatLng {
  return {
    lat: ORIGIN.lat + y / METERS_PER_DEG_LAT,
    lng: ORIGIN.lng + x / metersPerDegLng(ORIGIN.lat),
  }
}

/** Flat west of the origin, a steady 30 m per km climb to the east. */
export function terrainElevation({ x, y }: XY): number {
  return (30 * Math.max(0, x)) / 1000 + 2 * Math.sin(y / 300)
}

const GRID = 120
const STEP = 25
const snap = (value: number) => Math.round(value / GRID) * GRID

function walk(from: XY, to: XY, out: XY[]): void {
  const pushLeg = (axis: 'x' | 'y', target: number) => {
    const current = { ...out[out.length - 1] }
    const delta = target - current[axis]
    const steps = Math.max(1, Math.ceil(Math.abs(delta) / STEP))
    for (let i = 1; i <= steps; i++) {
      out.push({ ...current, [axis]: current[axis] + (delta * i) / steps })
    }
  }
  if (out.length === 0) out.push(from)
  pushLeg('x', to.x)
  pushLeg('y', to.y)
}

export interface GridRouterOptions {
  /** Bearing sector (degrees from origin) where routing always fails, to
   *  simulate water, a motorway, or a gap in the map data. */
  deadZone?: { from: number; to: number }
  onRoute?: (waypoints: LatLng[], options?: RouteOptions) => void
}

/** Manhattan routing over the lattice: a realistic ~1.2-1.3x detour factor. */
export function createGridRouter(options: GridRouterOptions = {}): RoutingProvider {
  return {
    async route(
      waypoints: LatLng[],
      _signal?: AbortSignal,
      routeOptions?: RouteOptions,
    ): Promise<RouteGeometry> {
      options.onRoute?.(waypoints, routeOptions)

      if (options.deadZone) {
        for (const wp of waypoints.slice(1, -1)) {
          const { x, y } = toXY(wp)
          const bearing = (((Math.atan2(x, y) * 180) / Math.PI) + 360) % 360
          const { from, to } = options.deadZone
          const inZone = from <= to ? bearing >= from && bearing <= to : bearing >= from || bearing <= to
          if (inZone) throw new Error('no route: impassable terrain')
        }
      }

      const snapped = waypoints.map((wp) => {
        const { x, y } = toXY(wp)
        return { x: snap(x), y: snap(y) }
      })

      const points: XY[] = []
      for (let i = 1; i < snapped.length; i++) walk(snapped[i - 1], snapped[i], points)

      const path = points.map(toLatLng)
      return { path, distance: pathLength(path) }
    },
  }
}

export function createTerrainElevation(): ElevationProvider {
  return {
    async lookup(points: LatLng[]): Promise<number[]> {
      return points.map((p) => terrainElevation(toXY(p)))
    },
  }
}
