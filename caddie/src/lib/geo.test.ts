import { describe, expect, it } from 'vitest'
import { bearingTo, centroid, destination, haversine, pointInPolygon, polygonCrossings } from './geo'

const TEE = { lat: 42.3601, lng: -71.0589 }

describe('haversine and destination', () => {
  it('round-trips a golf-length distance', () => {
    const green = destination(TEE, 30, 350)
    expect(haversine(TEE, green)).toBeCloseTo(350, 1)
    expect(bearingTo(TEE, green)).toBeCloseTo(30, 3)
  })
})

describe('centroid', () => {
  it('ignores a repeated closing point', () => {
    const square = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 2 },
      { lat: 2, lng: 2 },
      { lat: 2, lng: 0 },
      { lat: 0, lng: 0 },
    ]
    expect(centroid(square)).toEqual({ lat: 1, lng: 1 })
  })
})

describe('pointInPolygon', () => {
  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ]
  it('finds inside and outside', () => {
    expect(pointInPolygon({ lat: 0.5, lng: 0.5 }, square)).toBe(true)
    expect(pointInPolygon({ lat: 1.5, lng: 0.5 }, square)).toBe(false)
  })
})

describe('polygonCrossings', () => {
  it('reports where a straight shot passes over a pond', () => {
    // A pond 100–140 m out along a due-north line.
    const near = destination(TEE, 0, 100)
    const far = destination(TEE, 0, 140)
    const pond = [
      destination(near, 270, 30),
      destination(near, 90, 30),
      destination(far, 90, 30),
      destination(far, 270, 30),
    ]
    const target = destination(TEE, 0, 200)
    const crossings = polygonCrossings(TEE, target, pond)
    expect(crossings).toHaveLength(1)
    expect(crossings[0][0]).toBeCloseTo(100, -1)
    expect(crossings[0][1]).toBeCloseTo(140, -1)
  })

  it('is empty when the line misses', () => {
    const pond = [
      destination(TEE, 90, 50),
      destination(TEE, 90, 80),
      destination(TEE, 45, 80),
    ]
    expect(polygonCrossings(TEE, destination(TEE, 0, 200), pond)).toEqual([])
  })
})
