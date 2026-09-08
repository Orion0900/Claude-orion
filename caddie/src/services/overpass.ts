/**
 * Course data from OpenStreetMap, via the public Overpass API.
 *
 * One query pulls every golf feature within reach of the player, plus the
 * course outlines that say which course each hole belongs to. Two mirrors are
 * tried in turn, because each has its off days.
 */
import { parseOverpassCourses, type Course, type OverpassResponse } from '../lib/course'
import { haversine, type LatLng } from '../lib/geo'
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
out body geom;
relation${around}["leisure"="golf_course"];
out tags center;`
}

export interface NearbyCourse {
  course: Course
  /** Meters from the player to the middle of the course's holes. */
  distance: number
}

/**
 * Every mapped course within reach of the player, nearest first, so they can
 * say which one they're standing on rather than being handed a guess.
 */
export async function findNearbyCourses(centre: LatLng, signal?: AbortSignal): Promise<NearbyCourse[]> {
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
      return rankByDistance(parseOverpassCourses(response), centre)
    } catch (error) {
      if (signal?.aborted) throw error
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Course lookup failed')
}

/** Sort courses by how far the player is from the nearest hole on each. */
export function rankByDistance(courses: Course[], from: LatLng): NearbyCourse[] {
  return courses
    .map((course) => ({
      course,
      distance: Math.min(...course.holes.map((hole) => haversine(from, hole.tee ?? hole.green))),
    }))
    .sort((a, b) => a.distance - b.distance)
}
