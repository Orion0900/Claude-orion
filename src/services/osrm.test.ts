import { describe, expect, it, vi, afterEach } from 'vitest'
import { createOsrmProvider } from './osrm'

const okResponse = {
  code: 'Ok',
  routes: [{ distance: 8123.4, geometry: { coordinates: [[-71.06, 42.36], [-71.05, 42.37]] } }],
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
