import { describe, expect, it, vi, afterEach } from 'vitest'
import { createOsrmProvider } from './osrm'

const okResponse = {
  code: 'Ok',
  routes: [
    {
      distance: 8123.4,
      geometry: { coordinates: [[-71.06, 42.36], [-71.05, 42.37]] },
      legs: [
        {
          steps: [
            { maneuver: { type: 'depart', modifier: 'left' } },
            { maneuver: { type: 'turn', modifier: 'right' } },
            { maneuver: { type: 'new name', modifier: 'straight' } },
            { maneuver: { type: 'turn', modifier: 'left' } },
            { maneuver: { type: 'arrive' } },
          ],
        },
      ],
    },
  ],
}

function mockFetch(body: unknown, ok = true, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => vi.unstubAllGlobals())

describe('createOsrmProvider', () => {
  const start = { lat: 42.36, lng: -71.06 }
  const end = { lat: 42.37, lng: -71.05 }

  it('converts GeoJSON coordinates into lat/lng order', async () => {
    mockFetch(okResponse)
    const result = await createOsrmProvider().route([start, end])

    expect(result.distance).toBe(8123.4)
    expect(result.path[0]).toEqual({ lat: 42.36, lng: -71.06 })
    expect(result.path[1]).toEqual({ lat: 42.37, lng: -71.05 })
  })

  it('forbids U-turns by default and permits them on request', async () => {
    const fetchMock = mockFetch(okResponse)
    const provider = createOsrmProvider()

    await provider.route([start, end])
    expect(fetchMock.mock.calls[0][0]).toContain('continue_straight=true')

    await provider.route([start, end], undefined, { allowUTurns: true })
    expect(fetchMock.mock.calls[1][0]).toContain('continue_straight=false')
  })

  it('sends every waypoint in order as lng,lat pairs', async () => {
    const fetchMock = mockFetch(okResponse)
    await createOsrmProvider().route([start, end, start])

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('-71.060000,42.360000;-71.050000,42.370000;-71.060000,42.360000')
  })

  it('counts the turns described by the route steps', async () => {
    mockFetch(okResponse)
    const result = await createOsrmProvider().route([start, end])
    expect(result.turns).toBe(2)
  })

  it('asks the engine for steps so turns can be counted', async () => {
    const fetchMock = mockFetch(okResponse)
    await createOsrmProvider().route([start, end])
    expect(fetchMock.mock.calls[0][0]).toContain('steps=true')
  })

  it('reports zero turns when the engine omits steps', async () => {
    mockFetch({
      code: 'Ok',
      routes: [{ distance: 500, geometry: { coordinates: [[-71.06, 42.36], [-71.05, 42.37]] } }],
    })
    const result = await createOsrmProvider().route([start, end])
    expect(result.turns).toBe(0)
  })

  it('adds up turns across every leg of a multi-waypoint loop', async () => {
    mockFetch({
      code: 'Ok',
      routes: [
        {
          distance: 500,
          geometry: { coordinates: [[-71.06, 42.36], [-71.05, 42.37]] },
          legs: [
            { steps: [{ maneuver: { type: 'turn', modifier: 'left' } }] },
            { steps: [{ maneuver: { type: 'turn', modifier: 'right' } }] },
          ],
        },
      ],
    })
    const result = await createOsrmProvider().route([start, end, start])
    expect(result.turns).toBe(2)
  })

  it('rejects when the engine reports no route', async () => {
    mockFetch({ code: 'NoRoute', message: 'Impassable' })
    await expect(createOsrmProvider().route([start, end])).rejects.toThrow('Impassable')
  })

  it('rejects on a client error without retrying', async () => {
    const fetchMock = mockFetch({}, false, 400)
    await expect(createOsrmProvider().route([start, end])).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('road naming from the engine', () => {
  const start = { lat: 42.36, lng: -71.06 }
  const end = { lat: 42.37, lng: -71.05 }

  function withSteps(steps: unknown[]) {
    return {
      code: 'Ok',
      routes: [
        {
          distance: 500,
          geometry: { coordinates: [[-71.06, 42.36], [-71.05, 42.37]] },
          legs: [{ steps }],
        },
      ],
    }
  }

  it('carries the street name through to the instruction data', async () => {
    mockFetch(withSteps([
      { name: 'Mill Road', maneuver: { type: 'turn', modifier: 'left', location: [-71.058, 42.362] } },
    ]))
    const result = await createOsrmProvider().route([start, end])
    expect(result.steps?.[0].name).toBe('Mill Road')
  })

  it('carries road numbers and signposted destinations', async () => {
    mockFetch(withSteps([
      {
        name: '',
        ref: 'A21',
        destinations: 'Town Centre',
        maneuver: { type: 'turn', modifier: 'right', location: [-71.058, 42.362] },
      },
    ]))
    const result = await createOsrmProvider().route([start, end])
    expect(result.steps?.[0].ref).toBe('A21')
    expect(result.steps?.[0].destinations).toBe('Town Centre')
    expect(result.steps?.[0].name).toBeUndefined()
  })

  it('prefers a rotary’s own name over the road leaving it', async () => {
    mockFetch(withSteps([
      {
        name: 'Exit Road',
        rotary_name: 'Market Roundabout',
        maneuver: { type: 'rotary', modifier: 'right', exit: 2, location: [-71.058, 42.362] },
      },
    ]))
    const result = await createOsrmProvider().route([start, end])
    expect(result.steps?.[0].name).toBe('Market Roundabout')
    expect(result.steps?.[0].exit).toBe(2)
  })

  it('drops steps the engine gave no location for', async () => {
    mockFetch(withSteps([
      { name: 'Nowhere', maneuver: { type: 'turn', modifier: 'left' } },
      { name: 'Mill Road', maneuver: { type: 'turn', modifier: 'left', location: [-71.058, 42.362] } },
    ]))
    const result = await createOsrmProvider().route([start, end])
    expect(result.steps).toHaveLength(1)
    expect(result.steps?.[0].name).toBe('Mill Road')
  })
})
