/** Geodesy helpers. All angles in degrees, all distances in meters. */

export interface LatLng {
  lat: number
  lng: number
}

const R_EARTH = 6371008.8 // mean Earth radius (meters), IUGG
const toRad = (deg: number) => (deg * Math.PI) / 180
const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Great-circle distance between two points, in meters. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Point reached by travelling `distance` meters from `origin` along `bearing`. */
export function destination(origin: LatLng, bearing: number, distance: number): LatLng {
  const d = distance / R_EARTH
  const brng = toRad(bearing)
  const lat1 = toRad(origin.lat)
  const lng1 = toRad(origin.lng)
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng))
  const lng2 =
    lng1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return { lat: toDeg(lat2), lng: ((toDeg(lng2) + 540) % 360) - 180 }
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north. */
export function bearingTo(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (toDeg(Math.atan2(y, x)) + 360) % 360
}

/** Linear interpolation between two nearby points (fine at golf-hole scale). */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

/** Bounding box of a set of points as [southWest, northEast]. */
export function bounds(points: LatLng[]): [LatLng, LatLng] {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }
  return [
    { lat: minLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
  ]
}

/** Plain average of a polygon's vertices; good enough to mark a green's centre. */
export function centroid(points: LatLng[]): LatLng {
  if (points.length === 0) throw new Error('centroid: no points')
  // A closed ring repeats its first point; don't count it twice.
  const ring =
    points.length > 1 && points[0].lat === points[points.length - 1].lat && points[0].lng === points[points.length - 1].lng
      ? points.slice(0, -1)
      : points
  let lat = 0
  let lng = 0
  for (const p of ring) {
    lat += p.lat
    lng += p.lng
  }
  return { lat: lat / ring.length, lng: lng / ring.length }
}

/** Ray-casting point-in-polygon. Fine for the small, flat shapes on a course. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.lat > point.lat !== b.lat > point.lat
    if (!crosses) continue
    const x = ((b.lng - a.lng) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lng
    if (point.lng < x) inside = !inside
  }
  return inside
}

/**
 * Where a straight line from `from` to `to` passes through a polygon, as
 * distances along the line in meters: `[from, to]` pairs, one per crossing.
 * The line is sampled every `step` meters, which at 2 m is finer than any
 * bunker and far finer than GPS.
 */
export function polygonCrossings(from: LatLng, to: LatLng, polygon: LatLng[], step = 2): Array<[number, number]> {
  const length = haversine(from, to)
  if (length === 0) return pointInPolygon(from, polygon) ? [[0, 0]] : []
  const out: Array<[number, number]> = []
  let open: number | null = null
  const n = Math.ceil(length / step)
  for (let i = 0; i <= n; i++) {
    const d = Math.min(length, i * step)
    const inside = pointInPolygon(interpolate(from, to, d / length), polygon)
    if (inside && open === null) open = d
    if (!inside && open !== null) {
      out.push([open, d])
      open = null
    }
  }
  if (open !== null) out.push([open, length])
  return out
}
