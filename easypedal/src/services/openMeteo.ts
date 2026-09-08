import type { LatLng } from '../lib/geo'
import type { ElevationProvider } from '../lib/routeSearch'
import { fetchJson, HttpError } from './http'

const ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation'
/** Open-Meteo accepts at most 100 coordinate pairs per request. */
const MAX_POINTS_PER_REQUEST = 100

interface ElevationResponse {
  elevation: number[]
}

/** Digital elevation lookups, cached per rounded coordinate across a session. */
export function createOpenMeteoProvider(base = ELEVATION_URL): ElevationProvider {
  const cache = new Map<string, number>()
  const key = (p: LatLng) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`

  return {
    async lookup(points: LatLng[], signal?: AbortSignal): Promise<number[]> {
      const misses = points.filter((p) => !cache.has(key(p)))
      const unique = [...new Map(misses.map((p) => [key(p), p])).values()]

      for (let i = 0; i < unique.length; i += MAX_POINTS_PER_REQUEST) {
        const chunk = unique.slice(i, i + MAX_POINTS_PER_REQUEST)
        const lat = chunk.map((p) => p.lat.toFixed(5)).join(',')
        const lng = chunk.map((p) => p.lng.toFixed(5)).join(',')
        const data = await fetchJson<ElevationResponse>(
          `${base}?latitude=${lat}&longitude=${lng}`,
          { signal, minGapMs: 150 },
        )
        // A short or missing answer is a failed lookup, not a route at sea
        // level. Filling the gap with zero would invent a cliff, inflate the
        // climbing that the ranking is built on, and cache the lie for the
        // rest of the session.
        if (!Array.isArray(data.elevation) || data.elevation.length < chunk.length) {
          throw new HttpError('Elevation service returned an incomplete answer')
        }
        chunk.forEach((p, index) => {
          const value = data.elevation[index]
          if (typeof value === 'number' && Number.isFinite(value)) cache.set(key(p), value)
        })
      }

      return points.map((p) => {
        const value = cache.get(key(p))
        if (value === undefined) throw new HttpError('Elevation service did not cover the whole route')
        return value
      })
    },
  }
}
