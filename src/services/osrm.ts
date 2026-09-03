import type { LatLng } from '../lib/geo'
import type { RouteGeometry, RouteOptions, RoutingProvider } from '../lib/routeSearch'
import { fetchJson, HttpError } from './http'

/** FOSSGIS-hosted OSRM, the public instance that exposes a walking profile. */
const OSRM_BASE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

interface OsrmResponse {
  code: string
  message?: string
  routes?: Array<{
    distance: number
    geometry: { coordinates: [number, number][] }
  }>
}

export function createOsrmProvider(base = OSRM_BASE): RoutingProvider {
  return {
    async route(
      waypoints: LatLng[],
      signal?: AbortSignal,
      options?: RouteOptions,
    ): Promise<RouteGeometry> {
      const coordinates = waypoints.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';')
      // Forbidding U-turns is what keeps a loop from collapsing into an
      // out-and-back; an out-and-back needs the opposite.
      const continueStraight = options?.allowUTurns ? 'false' : 'true'
      const url = `${base}/${coordinates}?overview=full&geometries=geojson&continue_straight=${continueStraight}`
      const data = await fetchJson<OsrmResponse>(url, { signal, minGapMs: 220 })

      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new HttpError(data.message ?? `Routing failed (${data.code})`)
      }
      const route = data.routes[0]
      return {
        distance: route.distance,
        path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      }
    },
  }
}
