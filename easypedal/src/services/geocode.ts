import type { LatLng } from '../lib/geo'
import { fetchJson } from './http'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export interface Place extends LatLng {
  label: string
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

/** Forward geocoding via Nominatim. Fair-use: one request per keystroke pause. */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
  base = NOMINATIM_URL,
): Promise<Place[]> {
  const trimmed = query.trim()
  if (trimmed.length < 3) return []
  const url = `${base}?q=${encodeURIComponent(trimmed)}&format=jsonv2&limit=5&addressdetails=0`
  const results = await fetchJson<NominatimResult[]>(url, { signal, minGapMs: 1100 })
  return results.map((r) => ({
    lat: Number.parseFloat(r.lat),
    lng: Number.parseFloat(r.lon),
    label: r.display_name,
  }))
}
