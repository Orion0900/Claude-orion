/**
 * Turning what you type into a place, and a place back into an address.
 *
 * The search box asks as you type, and Nominatim's usage policy explicitly
 * rules that out — it is built for one-off lookups, and clients that
 * type-ahead against it get blocked. Photon exists for exactly this job: same
 * OpenStreetMap data, keyless, CORS-open, and designed to be queried on every
 * keystroke pause. So Photon leads and Nominatim stands in only when Photon
 * cannot be reached, which is rare and not per-keystroke.
 */
import type { LatLng } from '../lib/geo'
import { fetchJson } from './http'

export const PHOTON_URL = 'https://photon.komoot.io'
export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org'

export interface Place extends LatLng {
  /** What to show in the list: the place itself. */
  label: string
  /** Where it is, for telling two streets of the same name apart. */
  detail?: string
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] }
  properties?: {
    name?: string
    housenumber?: string
    street?: string
    district?: string
    locality?: string
    city?: string
    county?: string
    state?: string
    postcode?: string
    country?: string
    countrycode?: string
    osm_key?: string
    osm_value?: string
  }
}

interface PhotonResponse {
  features?: PhotonFeature[]
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

/**
 * The name of the thing itself. A house number belongs in front of its street;
 * a named place speaks for itself; failing both, the street alone will do.
 */
export function placeName(properties: NonNullable<PhotonFeature['properties']>): string | null {
  const { name, housenumber, street } = properties
  if (housenumber && street) return `${housenumber} ${street}`
  if (name) return name
  if (street) return street
  return null
}

/**
 * Where the place is, nearest ring outward, without repeating the name or
 * saying the same thing twice — "Cambridge, Cambridge, Massachusetts" reads
 * like a bug even when the data really is shaped that way.
 */
export function placeDetail(
  properties: NonNullable<PhotonFeature['properties']>,
  name: string | null,
): string {
  const rings = [
    properties.street && properties.housenumber ? undefined : properties.street,
    properties.district,
    properties.city ?? properties.locality,
    properties.state,
    // A country is only worth saying when it isn't the one you're standing in;
    // there is no way to know that here, so it stays as the last resort ring.
    properties.country,
  ]

  const seen = new Set<string>()
  if (name) seen.add(name.toLowerCase())
  const parts: string[] = []
  for (const ring of rings) {
    if (!ring) continue
    const key = ring.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(ring)
  }
  return parts.slice(0, 3).join(', ')
}

function fromPhoton(feature: PhotonFeature): Place | null {
  const coordinates = feature.geometry?.coordinates
  const properties = feature.properties
  if (!coordinates || !properties) return null
  const [lng, lat] = coordinates
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const name = placeName(properties)
  const detail = placeDetail(properties, name)
  if (!name && !detail) return null
  return { lat, lng, label: name ?? detail, detail: name ? detail || undefined : undefined }
}

/** Two suggestions that read identically are one suggestion. */
function dedupe(places: Place[], limit: number): Place[] {
  const seen = new Set<string>()
  const out: Place[] = []
  for (const place of places) {
    const key = `${place.label}|${place.detail ?? ''}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(place)
    if (out.length >= limit) break
  }
  return out
}

const aborted = (error: unknown) => (error as Error)?.name === 'AbortError'

export interface SearchOptions {
  signal?: AbortSignal
  /** Bias results toward here, so "Main St" means the one near you. */
  near?: LatLng | null
  limit?: number
  photonBase?: string
  nominatimBase?: string
}

/** Places matching what has been typed, best first. */
export async function searchPlaces(query: string, options: SearchOptions = {}): Promise<Place[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []

  const { signal, near } = options
  const limit = options.limit ?? 6
  const photonBase = options.photonBase ?? PHOTON_URL
  const nominatimBase = options.nominatimBase ?? NOMINATIM_URL

  const bias = near ? `&lat=${near.lat.toFixed(5)}&lon=${near.lng.toFixed(5)}` : ''
  try {
    const data = await fetchJson<PhotonResponse>(
      `${photonBase}/api?q=${encodeURIComponent(trimmed)}&limit=${limit}&lang=en${bias}`,
      // Someone is waiting mid-word: fall straight through to the other
      // geocoder rather than spending seconds backing off and retrying.
      { signal, minGapMs: 300, retries: 0, timeoutMs: 8000 },
    )
    const places = (data.features ?? []).flatMap((feature) => fromPhoton(feature) ?? [])
    if (places.length > 0) return dedupe(places, limit)
  } catch (error) {
    if (aborted(error)) throw error
    // Fall through: a search that finds nothing is better than a broken box.
  }

  const results = await fetchJson<NominatimResult[]>(
    `${nominatimBase}/search?q=${encodeURIComponent(trimmed)}&format=jsonv2&limit=${limit}&addressdetails=0`,
    { signal, minGapMs: 1100, retries: 1, timeoutMs: 8000 },
  )
  return dedupe(
    results.map((result) => {
      const [first, ...rest] = result.display_name.split(',')
      return {
        lat: Number.parseFloat(result.lat),
        lng: Number.parseFloat(result.lon),
        label: first.trim(),
        detail: rest.slice(0, 3).join(',').trim() || undefined,
      }
    }),
    limit,
  )
}

export interface ReverseOptions {
  signal?: AbortSignal
  photonBase?: string
  nominatimBase?: string
}

/**
 * What is at these coordinates, as an address someone would recognise.
 * Returns null rather than throwing: a pin without a name is still a pin, and
 * the map already shows where it is.
 */
export async function describePoint(point: LatLng, options: ReverseOptions = {}): Promise<string | null> {
  const { signal } = options
  const photonBase = options.photonBase ?? PHOTON_URL
  const nominatimBase = options.nominatimBase ?? NOMINATIM_URL

  try {
    const data = await fetchJson<PhotonResponse>(
      `${photonBase}/reverse?lat=${point.lat.toFixed(6)}&lon=${point.lng.toFixed(6)}&limit=1&lang=en`,
      { signal, minGapMs: 300, retries: 0, timeoutMs: 8000 },
    )
    const place = (data.features ?? []).flatMap((feature) => fromPhoton(feature) ?? [])[0]
    if (place) return place.detail ? `${place.label}, ${place.detail}` : place.label
  } catch (error) {
    if (aborted(error)) throw error
  }

  try {
    const data = await fetchJson<NominatimResult>(
      `${nominatimBase}/reverse?lat=${point.lat.toFixed(6)}&lon=${point.lng.toFixed(6)}&format=jsonv2`,
      { signal, minGapMs: 1100, retries: 1, timeoutMs: 8000 },
    )
    return data.display_name?.split(',').slice(0, 4).join(',').trim() || null
  } catch (error) {
    if (aborted(error)) throw error
    return null
  }
}
