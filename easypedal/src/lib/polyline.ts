/**
 * Google's encoded polyline format, as Valhalla emits it: six decimal places
 * of precision rather than the five the original scheme used.
 */
import type { LatLng } from './geo'

export function decodePolyline(encoded: string, precision = 6): LatLng[] {
  const factor = 10 ** precision
  const points: LatLng[] = []
  let index = 0
  let lat = 0
  let lng = 0

  const readDelta = (): number => {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return result & 1 ? ~(result >> 1) : result >> 1
  }

  while (index < encoded.length) {
    lat += readDelta()
    lng += readDelta()
    points.push({ lat: lat / factor, lng: lng / factor })
  }
  return points
}

export function encodePolyline(points: LatLng[], precision = 6): string {
  const factor = 10 ** precision
  let out = ''
  let previousLat = 0
  let previousLng = 0

  const write = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1
    while (v >= 0x20) {
      out += String.fromCharCode((0x20 | (v & 0x1f)) + 63)
      v >>= 5
    }
    out += String.fromCharCode(v + 63)
  }

  for (const point of points) {
    const lat = Math.round(point.lat * factor)
    const lng = Math.round(point.lng * factor)
    write(lat - previousLat)
    write(lng - previousLng)
    previousLat = lat
    previousLng = lng
  }
  return out
}
