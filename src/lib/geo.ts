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
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Point reached by travelling `distance` meters from `origin` along `bearing`. */
export function destination(origin: LatLng, bearing: number, distance: number): LatLng {
  const d = distance / R_EARTH
  const brng = toRad(bearing)
  const lat1 = toRad(origin.lat)
  const lng1 = toRad(origin.lng)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  )
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    )

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

/** Total length of a polyline, in meters. */
export function pathLength(path: LatLng[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += haversine(path[i - 1], path[i])
  return total
}

/** Cumulative distance at each vertex of a polyline. */
export function cumulativeDistances(path: LatLng[]): number[] {
  const out = new Array<number>(path.length)
  out[0] = 0
  for (let i = 1; i < path.length; i++) out[i] = out[i - 1] + haversine(path[i - 1], path[i])
  return out
}

/**
 * Resample a polyline to exactly `count` points spaced evenly by distance
 * along the path (endpoints always included). Used to keep elevation
 * lookups within the provider's per-request point budget.
 */
export function resample(path: LatLng[], count: number): LatLng[] {
  if (path.length === 0) return []
  if (count <= 1 || path.length === 1) return [path[0]]
  if (path.length === 2 && count === 2) return [path[0], path[1]]

  const cum = cumulativeDistances(path)
  const total = cum[cum.length - 1]
  if (total === 0) return new Array(count).fill(path[0])

  const step = total / (count - 1)
  const out: LatLng[] = [path[0]]
  let seg = 1

  for (let i = 1; i < count - 1; i++) {
    const target = step * i
    while (seg < cum.length - 1 && cum[seg] < target) seg++
    const spanStart = cum[seg - 1]
    const spanLen = cum[seg] - spanStart
    const t = spanLen === 0 ? 0 : (target - spanStart) / spanLen
    out.push(interpolate(path[seg - 1], path[seg], t))
  }

  out.push(path[path.length - 1])
  return out
}

/** Linear interpolation between two nearby points (fine at running scale). */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }
}

/** Bounding box of a path as [southWest, northEast]. */
export function bounds(path: LatLng[]): [LatLng, LatLng] {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  for (const p of path) {
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

/** Point a given fraction (0-1) of the way along a polyline, by distance. */
export function pointAtFraction(path: LatLng[], fraction: number): LatLng {
  if (path.length === 0) throw new Error('pointAtFraction: empty path')
  if (path.length === 1) return path[0]

  const cum = cumulativeDistances(path)
  const total = cum[cum.length - 1]
  if (total === 0) return path[0]

  const target = Math.min(1, Math.max(0, fraction)) * total
  let i = 1
  while (i < cum.length - 1 && cum[i] < target) i++
  const spanLen = cum[i] - cum[i - 1]
  const t = spanLen === 0 ? 0 : (target - cum[i - 1]) / spanLen
  return interpolate(path[i - 1], path[i], t)
}
