import { afterEach, describe, expect, it, vi } from 'vitest'
import { createValhallaRouter, createValhallaWays, maneuverToStep } from './valhalla'
import { encodePolyline } from '../lib/polyline'
import { destination } from '../lib/geo'

const from = { lat: 42.36, lng: -71.06 }
const to = destination(from, 90, 1000)
const shapePoints = [from, destination(from, 90, 300), destination(from, 90, 600), to]
const shape = encodePolyline(shapePoints)

const trip = (length: number, streets: string[][] = [['Home Street'], ['Mill Road', 'A21'], []]) => ({
  status: 0,
  summary: { length, time: 240 },
  legs: [
    {
      shape,
      summary: { length },
      maneuvers: [
        { type: 1, begin_shape_index: 0, end_shape_index: 1, street_names: streets[0], length: 0.3 },
        { type: 15, begin_shape_index: 1, end_shape_index: 3, street_names: streets[1], length: 0.6 },
        { type: 4, begin_shape_index: 3, end_shape_index: 3, street_names: streets[2], length: 0 },
      ],
    },
  ],
})

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: async () => body })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('maneuverToStep', () => {
  it('maps starts and destinations', () => {
    expect(maneuverToStep(1).type).toBe('depart')
    expect(maneuverToStep(3).type).toBe('depart')
    expect(maneuverToStep(4).type).toBe('arrive')
    expect(maneuverToStep(6).type).toBe('arrive')
  })

  it('maps turns to left and right of every sharpness', () => {
    expect(maneuverToStep(9)).toEqual({ type: 'turn', modifier: 'slight right' })
    expect(maneuverToStep(10)).toEqual({ type: 'turn', modifier: 'right' })
    expect(maneuverToStep(11)).toEqual({ type: 'turn', modifier: 'sharp right' })
    expect(maneuverToStep(14)).toEqual({ type: 'turn', modifier: 'sharp left' })
    expect(maneuverToStep(15)).toEqual({ type: 'turn', modifier: 'left' })
    expect(maneuverToStep(16)).toEqual({ type: 'turn', modifier: 'slight left' })
    expect(maneuverToStep(12).modifier).toBe('uturn')
  })

  it('maps forks, merges, ramps and roundabouts', () => {
    expect(maneuverToStep(23)).toEqual({ type: 'fork', modifier: 'slight right' })
    expect(maneuverToStep(25).type).toBe('merge')
    expect(maneuverToStep(18)).toEqual({ type: 'on ramp', modifier: 'right' })
    expect(maneuverToStep(26).type).toBe('roundabout')
    expect(maneuverToStep(27).type).toBe('exit roundabout')
  })

  it('turns the exotic ones into a quiet continue', () => {
    expect(maneuverToStep(30)).toEqual({ type: 'continue' })
    expect(maneuverToStep(999)).toEqual({ type: 'continue' })
  })
})

describe('createValhallaRouter', () => {
  it('asks for bicycle routing with the profile’s road and hill preferences', async () => {
    const fetchMock = mockFetch({ trip: trip(1.0) })
    await createValhallaRouter().route(from, to, { useRoads: 0.05, useHills: 0.3 })

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('valhalla1.openstreetmap.de/route?json=')
    const request = JSON.parse(decodeURIComponent(url.split('json=')[1]))
    expect(request.costing).toBe('bicycle')
    expect(request.costing_options.bicycle.use_roads).toBe(0.05)
    expect(request.costing_options.bicycle.use_hills).toBe(0.3)
    expect(request.costing_options.bicycle.use_ferry).toBe(0)
    expect(request.locations[0]).toMatchObject({ lat: from.lat, lon: from.lng })
    expect(request.locations[1]).toMatchObject({ lat: to.lat, lon: to.lng })
    expect(request.units).toBe('kilometers')
    expect(request.alternates).toBeGreaterThan(0)
  })

  it('decodes the shape and reports the distance in metres', async () => {
    mockFetch({ trip: trip(1.0) })
    const [route] = await createValhallaRouter().route(from, to, { useRoads: 0.1, useHills: 0.1 })
    expect(route.distance).toBeCloseTo(1000, 5)
    expect(route.path).toHaveLength(shapePoints.length)
    expect(route.path[0].lat).toBeCloseTo(from.lat, 5)
    expect(route.path[3].lng).toBeCloseTo(to.lng, 5)
    expect(route.shape).toBe(shape)
  })

  it('turns maneuvers into steps with names, refs and locations', async () => {
    mockFetch({ trip: trip(1.0) })
    const [route] = await createValhallaRouter().route(from, to, { useRoads: 0.1, useHills: 0.1 })
    expect(route.steps).toHaveLength(3)
    expect(route.steps?.[0]).toMatchObject({ type: 'depart', name: 'Home Street', length: 300 })
    expect(route.steps?.[1]).toMatchObject({ type: 'turn', modifier: 'left', name: 'Mill Road', ref: 'A21' })
    expect(route.steps?.[1].location.lng).toBeCloseTo(shapePoints[1].lng, 5)
    expect(route.steps?.[2].type).toBe('arrive')
    expect(route.turns).toBe(1)
  })

  it('includes the alternatives after the main route', async () => {
    mockFetch({ trip: trip(1.0), alternates: [{ trip: trip(1.4) }] })
    const routes = await createValhallaRouter().route(from, to, { useRoads: 0.1, useHills: 0.1 })
    expect(routes).toHaveLength(2)
    expect(routes[1].distance).toBeCloseTo(1400, 5)
  })

  it('raises the engine’s own error message', async () => {
    mockFetch({ error: 'No path could be found for input', error_code: 442 })
    await expect(
      createValhallaRouter().route(from, to, { useRoads: 0.1, useHills: 0.1 }),
    ).rejects.toThrow('No path could be found')
  })

  it('keeps preferences inside the engine’s 0-1 range', async () => {
    const fetchMock = mockFetch({ trip: trip(1.0) })
    await createValhallaRouter().route(from, to, { useRoads: -1, useHills: 7 })
    const request = JSON.parse(decodeURIComponent((fetchMock.mock.calls[0][0] as string).split('json=')[1]))
    expect(request.costing_options.bicycle.use_roads).toBe(0)
    expect(request.costing_options.bicycle.use_hills).toBe(1)
  })
})

describe('createValhallaWays', () => {
  const traceResponse = {
    units: 'kilometers',
    shape,
    edges: [
      { begin_shape_index: 0, end_shape_index: 1, length: 0.3, road_class: 'residential', use: 'road', cycle_lane: 'none' },
      { begin_shape_index: 1, end_shape_index: 3, length: 0.7, road_class: 'service_other', use: 'cycleway', cycle_lane: 'none', bicycle_network: 2 },
    ],
  }

  it('sends the route’s own encoded shape back to be walked', async () => {
    const fetchMock = mockFetch(traceResponse)
    await createValhallaWays().describe({ path: shapePoints, distance: 1000, shape })
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/trace_attributes?json=')
    const request = JSON.parse(decodeURIComponent(url.split('json=')[1]))
    expect(request.encoded_polyline).toBe(shape)
    expect(request.costing).toBe('bicycle')
    expect(request.filters.attributes).toContain('edge.cycle_lane')
  })

  it('falls back to the raw points when there is no encoded shape', async () => {
    const fetchMock = mockFetch(traceResponse)
    await createValhallaWays().describe({ path: shapePoints, distance: 1000 })
    const request = JSON.parse(decodeURIComponent((fetchMock.mock.calls[0][0] as string).split('json=')[1]))
    expect(request.shape).toHaveLength(shapePoints.length)
    expect(request.shape[0]).toEqual({ lat: from.lat, lon: from.lng })
  })

  it('returns each edge with its tags, length in metres and its slice of the shape', async () => {
    mockFetch(traceResponse)
    const edges = await createValhallaWays().describe({ path: shapePoints, distance: 1000, shape })
    expect(edges).toHaveLength(2)
    expect(edges[0]).toMatchObject({ use: 'road', roadClass: 'residential', cycleLane: 'none', onCycleNetwork: false })
    expect(edges[0].length).toBeCloseTo(300, 5)
    expect(edges[0].path).toHaveLength(2)
    expect(edges[1]).toMatchObject({ use: 'cycleway', onCycleNetwork: true })
    expect(edges[1].path).toHaveLength(3)
  })

  it('posts a long shape instead of squeezing it into the URL', async () => {
    const fetchMock = mockFetch(traceResponse)
    const long = Array.from({ length: 3000 }, (_, i) => destination(from, 90, i * 7))
    await createValhallaWays().describe({ path: long, distance: 21000, shape: encodePolyline(long) })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url.endsWith('/trace_attributes')).toBe(true)
    expect(init.method).toBe('POST')
    expect(typeof init.body).toBe('string')
  })

  it('raises when the engine cannot match the shape', async () => {
    mockFetch({ error: 'Could not find matching edge' })
    await expect(createValhallaWays().describe({ path: shapePoints, distance: 1000, shape })).rejects.toThrow()
  })
})
