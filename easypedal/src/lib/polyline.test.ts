import { describe, expect, it } from 'vitest'
import { decodePolyline, encodePolyline } from './polyline'

describe('polyline', () => {
  it('decodes the canonical Google example at precision 5', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5)
    expect(points).toHaveLength(3)
    expect(points[0].lat).toBeCloseTo(38.5, 5)
    expect(points[0].lng).toBeCloseTo(-120.2, 5)
    expect(points[2].lat).toBeCloseTo(43.252, 5)
    expect(points[2].lng).toBeCloseTo(-126.453, 5)
  })

  it('round-trips at Valhalla precision', () => {
    const original = [
      { lat: 42.360123, lng: -71.058912 },
      { lat: 42.361456, lng: -71.060001 },
      { lat: 42.359999, lng: -71.061234 },
    ]
    const decoded = decodePolyline(encodePolyline(original))
    decoded.forEach((point, i) => {
      expect(point.lat).toBeCloseTo(original[i].lat, 6)
      expect(point.lng).toBeCloseTo(original[i].lng, 6)
    })
  })

  it('returns nothing for an empty string', () => {
    expect(decodePolyline('')).toEqual([])
  })
})
