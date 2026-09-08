/**
 * Course data from OpenStreetMap, via the public Overpass API.
 *
 * One query pulls every golf feature within reach of the player, plus the
 * course outline for its name. Two mirrors are tried in turn, because each
 * has its off days.
 */
import { parseOverpass, type Course, type OverpassResponse } from '../lib/course'
import type { LatLng } from '../lib/geo'
import { fetchJson } from './http'

const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']

/** How far around the player to look. A course is rarely more than a mile across. */
export const SEARCH_RADIUS_M = 2500

function query(centre: LatLng, radius: number): string {
  const around = `(around:${radius},${centre.lat.toFixed(6)},${centre.lng.toFixed(6)})`
  return `[out:json][timeout:25];
(
  way${around}["golf"~"^(hole|green|tee|bunker|water_hazard|lateral_water_hazard)$"];
  node${around}["golf"="pin"];
  way${around}["natural"="water"];
  way${around}["leisure"="golf_course"];
);
out body geom;`
}

export async function loadNearbyCourse(centre: LatLng, signal?: AbortSignal): Promise<Course | null> {
  let lastError: unknown
  for (const mirror of MIRRORS) {
    try {
      const response = await fetchJson<OverpassResponse>(mirror, {
        method: 'POST',
        body: `data=${encodeURIComponent(query(centre, SEARCH_RADIUS_M))}`,
        signal,
        timeoutMs: 30000,
        retries: 0,
      })
      const parsed = parseOverpass(response)
      if (parsed.holes.length === 0) return null
      return {
        id: `osm-${centre.lat.toFixed(4)}-${centre.lng.toFixed(4)}`,
        name: parsed.name ?? 'Nearby course',
        holes: parsed.holes,
        hazards: parsed.hazards,
        source: 'osm',
      }
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Course lookup failed')
}
