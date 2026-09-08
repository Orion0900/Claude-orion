/**
 * Valhalla, the routing engine behind the public OpenStreetMap bicycle
 * router. Two things make it the right engine here: its bicycle costing can
 * be told how much to avoid roads and how much to avoid hills, and it will
 * describe every stretch of a route — road class, use, whether there's a
 * cycle lane — which is what the lane coverage figures are built from.
 */
import type { LatLng } from '../lib/geo'
import type { RawStep } from '../lib/navigation'
import { countTurns, type Maneuver } from '../lib/turns'
import { decodePolyline } from '../lib/polyline'
import type { RoadEdge } from '../lib/bikeway'
import type { CostingProfile, RouteGeometry, RoutingProvider, WayProvider } from '../lib/routeSearch'
import { fetchJson, HttpError } from './http'

/** FOSSGIS-hosted Valhalla, the public instance the OSM website's bike directions use. */
export const VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'

/** Beyond this a request goes in the body rather than the query string. */
const MAX_QUERY_BYTES = 6000

interface ValhallaManeuver {
  type: number
  instruction?: string
  street_names?: string[]
  begin_street_names?: string[]
  begin_shape_index: number
  end_shape_index: number
  /** Kilometres, given the units requested below. */
  length?: number
  roundabout_exit_count?: number
  sign?: { exit_number_elements?: Array<{ text: string }>; exit_toward_elements?: Array<{ text: string }> }
}

interface ValhallaTrip {
  status?: number
  status_message?: string
  summary?: { length: number; time: number }
  legs?: Array<{ shape: string; maneuvers?: ValhallaManeuver[]; summary?: { length: number } }>
}

interface RouteResponse {
  trip?: ValhallaTrip
  alternates?: Array<{ trip?: ValhallaTrip }>
  error?: string
  error_code?: number
}

interface TraceEdge {
  begin_shape_index: number
  end_shape_index: number
  /** Kilometres. */
  length: number
  road_class?: string
  use?: string
  cycle_lane?: string
  bicycle_network?: number
}

interface TraceResponse {
  shape?: string
  edges?: TraceEdge[]
  error?: string
}

/**
 * Valhalla numbers its maneuvers; the navigation code speaks OSRM's vocabulary
 * of a type and a modifier. This is the translation.
 */
export function maneuverToStep(type: number): Maneuver {
  switch (type) {
    case 1:
    case 2:
    case 3:
      return { type: 'depart' }
    case 4:
    case 5:
    case 6:
      return { type: 'arrive' }
    case 7:
      return { type: 'new name', modifier: 'straight' }
    case 8:
      return { type: 'continue', modifier: 'straight' }
    case 9:
      return { type: 'turn', modifier: 'slight right' }
    case 10:
      return { type: 'turn', modifier: 'right' }
    case 11:
      return { type: 'turn', modifier: 'sharp right' }
    case 12:
    case 13:
      return { type: 'turn', modifier: 'uturn' }
    case 14:
      return { type: 'turn', modifier: 'sharp left' }
    case 15:
      return { type: 'turn', modifier: 'left' }
    case 16:
      return { type: 'turn', modifier: 'slight left' }
    case 17:
      return { type: 'on ramp', modifier: 'straight' }
    case 18:
      return { type: 'on ramp', modifier: 'right' }
    case 19:
      return { type: 'on ramp', modifier: 'left' }
    case 20:
      return { type: 'off ramp', modifier: 'right' }
    case 21:
      return { type: 'off ramp', modifier: 'left' }
    case 22:
      return { type: 'fork', modifier: 'straight' }
    case 23:
      return { type: 'fork', modifier: 'slight right' }
    case 24:
      return { type: 'fork', modifier: 'slight left' }
    case 25:
      return { type: 'merge', modifier: 'straight' }
    case 37:
      return { type: 'merge', modifier: 'slight right' }
    case 38:
      return { type: 'merge', modifier: 'slight left' }
    case 26:
      return { type: 'roundabout' }
    case 27:
      return { type: 'exit roundabout' }
    case 40:
      return { type: 'steps' }
    default:
      // Ferries, transit, lifts and the like: nothing a bike ride needs saying.
      return { type: 'continue' }
  }
}

/** A road number looks like "A21", "US 1" or "SR 99"; a name doesn't. */
function looksLikeRef(name: string): boolean {
  return /^[A-Z]{1,3}[ -]?\d+[A-Z]?$/.test(name.trim())
}

function stepsFrom(maneuvers: ValhallaManeuver[], shape: LatLng[]): RawStep[] {
  return maneuvers.flatMap((maneuver) => {
    const location = shape[Math.min(maneuver.begin_shape_index, shape.length - 1)]
    if (!location) return []
    const names = maneuver.street_names ?? []
    const name = names.find((candidate) => !looksLikeRef(candidate))
    const ref = names.find(looksLikeRef)
    const toward = maneuver.sign?.exit_toward_elements?.map((item) => item.text).join(', ')
    return [{
      ...maneuverToStep(maneuver.type),
      location,
      name: name || undefined,
      ref: ref || undefined,
      destinations: toward || undefined,
      exit: maneuver.roundabout_exit_count || undefined,
      length: maneuver.length === undefined ? undefined : maneuver.length * 1000,
    }]
  })
}

function geometryFrom(trip: ValhallaTrip): RouteGeometry | null {
  const legs = trip.legs ?? []
  if (legs.length === 0) return null
  const path: LatLng[] = []
  const steps: RawStep[] = []
  const maneuvers: Maneuver[] = []

  for (const leg of legs) {
    const shape = decodePolyline(leg.shape)
    // Legs share their junction point; keep it once.
    path.push(...(path.length && shape.length ? shape.slice(1) : shape))
    const legSteps = stepsFrom(leg.maneuvers ?? [], shape)
    steps.push(...legSteps)
    maneuvers.push(...legSteps.map(({ type, modifier }) => ({ type, modifier })))
  }
  if (path.length < 2) return null

  const km = trip.summary?.length ?? legs.reduce((sum, leg) => sum + (leg.summary?.length ?? 0), 0)
  return {
    path,
    distance: km * 1000,
    turns: countTurns(maneuvers),
    steps,
    shape: legs.length === 1 ? legs[0].shape : undefined,
  }
}

/**
 * GET with the request in the query where it fits, which needs no CORS
 * preflight; POST for the long ones, which is how a whole route's shape is
 * sent back to be described.
 */
async function call<T>(base: string, endpoint: string, request: unknown, signal?: AbortSignal): Promise<T> {
  const json = JSON.stringify(request)
  if (json.length <= MAX_QUERY_BYTES) {
    return fetchJson<T>(`${base}/${endpoint}?json=${encodeURIComponent(json)}`, { signal, minGapMs: 300 })
  }
  return fetchJson<T>(`${base}/${endpoint}`, {
    signal,
    minGapMs: 300,
    method: 'POST',
    body: json,
  })
}

export interface ValhallaOptions {
  base?: string
  /** Road, Hybrid, City, Cross or Mountain — sets the engine's speed and surface assumptions. */
  bicycleType?: string
  /** How many alternatives to ask for on top of the best route. */
  alternates?: number
}

export function createValhallaRouter(options: ValhallaOptions = {}): RoutingProvider {
  const base = options.base ?? VALHALLA_BASE
  return {
    async route(from, to, profile: CostingProfile, signal?): Promise<RouteGeometry[]> {
      const request = {
        locations: [
          { lat: from.lat, lon: from.lng, type: 'break' },
          { lat: to.lat, lon: to.lng, type: 'break' },
        ],
        costing: 'bicycle',
        costing_options: {
          bicycle: {
            bicycle_type: options.bicycleType ?? 'Hybrid',
            use_roads: clamp(profile.useRoads),
            use_hills: clamp(profile.useHills),
            // Gravel and cobbles are hard work; a ferry is not a ride.
            avoid_bad_surfaces: 0.6,
            use_ferry: 0,
          },
        },
        alternates: options.alternates ?? 1,
        units: 'kilometers',
        language: 'en-US',
      }
      const data = await call<RouteResponse>(base, 'route', request, signal)
      if (data.error || !data.trip) {
        throw new HttpError(data.error ?? 'Routing failed')
      }
      const trips = [data.trip, ...(data.alternates ?? []).map((alternate) => alternate.trip)]
      return trips.flatMap((trip) => {
        const geometry = trip ? geometryFrom(trip) : null
        return geometry ? [geometry] : []
      })
    },
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, Number(value.toFixed(2))))

/**
 * Ask the engine what the route it just produced actually runs along. The
 * route's own shape is walked edge by edge, so every stretch comes back with
 * the tags that decide whether it counts as a bike lane.
 */
export function createValhallaWays(options: Pick<ValhallaOptions, 'base'> = {}): WayProvider {
  const base = options.base ?? VALHALLA_BASE
  return {
    async describe(geometry, signal?): Promise<RoadEdge[]> {
      const request = {
        ...(geometry.shape
          ? { encoded_polyline: geometry.shape }
          : { shape: geometry.path.map((p) => ({ lat: p.lat, lon: p.lng })) }),
        costing: 'bicycle',
        shape_match: 'walk_or_snap',
        units: 'kilometers',
        filters: {
          attributes: [
            'edge.begin_shape_index',
            'edge.end_shape_index',
            'edge.length',
            'edge.road_class',
            'edge.use',
            'edge.cycle_lane',
            'edge.bicycle_network',
            'shape',
          ],
          action: 'include',
        },
      }
      const data = await call<TraceResponse>(base, 'trace_attributes', request, signal)
      if (data.error || !data.edges) throw new HttpError(data.error ?? 'Road lookup failed')

      const shape = data.shape ? decodePolyline(data.shape) : geometry.path
      return data.edges.map((edge) => ({
        path: shape.slice(edge.begin_shape_index, edge.end_shape_index + 1),
        length: edge.length * 1000,
        use: edge.use ?? 'road',
        roadClass: edge.road_class ?? 'unclassified',
        cycleLane: edge.cycle_lane ?? 'none',
        onCycleNetwork: (edge.bicycle_network ?? 0) > 0,
      }))
    },
  }
}
