import type { LatLng } from '../lib/geo'
import type { RouteGeometry, RouteOptions, RoutingProvider } from '../lib/routeSearch'
import { countTurns, type Maneuver } from '../lib/turns'
import type { RawStep } from '../lib/navigation'
import { fetchJson, HttpError } from './http'

/** FOSSGIS-hosted OSRM, the public instance that exposes a walking profile. */
const OSRM_BASE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot'

interface OsrmResponse {
  code: string
  message?: string
  routes?: Array<{
    distance: number
    geometry: { coordinates: [number, number][] }
    legs?: Array<{
      steps?: Array<{
        name?: string
        ref?: string
        destinations?: string
        pronunciation?: string
        rotary_name?: string
        maneuver?: Maneuver & { location?: [number, number]; exit?: number }
      }>
    }>
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
      // `steps` costs a little response size and buys the turn-by-turn
      // maneuvers, which is how route simplicity gets measured.
      const url =
        `${base}/${coordinates}?overview=full&geometries=geojson` +
        `&continue_straight=${continueStraight}&steps=true`
      const data = await fetchJson<OsrmResponse>(url, { signal, minGapMs: 220 })

      if (data.code !== 'Ok' || !data.routes?.length) {
        throw new HttpError(data.message ?? `Routing failed (${data.code})`)
      }
      const route = data.routes[0]
      const rawSteps = (route.legs ?? []).flatMap((leg) => leg.steps ?? [])
      const maneuvers = rawSteps
        .map((step) => step.maneuver)
        .filter((maneuver): maneuver is Maneuver => maneuver !== undefined)

      const steps: RawStep[] = rawSteps.flatMap((step) => {
        const location = step.maneuver?.location
        if (!step.maneuver || !location) return []
        return [{
          type: step.maneuver.type,
          modifier: step.maneuver.modifier,
          exit: step.maneuver.exit,
          // A rotary's own name beats the road you leave it on.
          name: step.rotary_name || step.name || undefined,
          ref: step.ref || undefined,
          destinations: step.destinations || undefined,
          pronunciation: step.pronunciation || undefined,
          location: { lat: location[1], lng: location[0] },
        }]
      })

      return {
        distance: route.distance,
        path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        turns: countTurns(maneuvers),
        steps,
      }
    },
  }
}
