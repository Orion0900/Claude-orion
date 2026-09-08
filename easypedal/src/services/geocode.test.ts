import { afterEach, describe, expect, it, vi } from 'vitest'
import { describePoint, placeDetail, placeName, searchPlaces } from './geocode'

/** A Photon feature, shaped exactly as the service returns them. */
const feature = (properties: Record<string, unknown>, coordinates: [number, number] = [-71.0589, 42.3601]) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties,
})

/**
 * Answers by which service was asked, so a retry inside the HTTP layer can't
 * accidentally be served the *other* geocoder's reply.
 */
function mockFetch(answers: { photon?: unknown; nominatim?: unknown }) {
  const fetchMock = vi.fn(async (url: string) => {
    const body = url.includes('photon') ? answers.photon : answers.nominatim
    if (body === undefined) throw new Error(`no mock for ${url}`)
    if (body instanceof Error) throw body
    return { ok: true, status: 200, json: async () => body }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const offline = () => new Error('network down')
const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' })

afterEach(() => vi.unstubAllGlobals())

describe('placeName', () => {
  it('puts the house number in front of its street', () => {
    expect(placeName({ housenumber: '221', street: 'Baker Street', name: 'Museum' })).toBe('221 Baker Street')
  })

  it('uses the name when there is no house number', () => {
    expect(placeName({ name: 'Boston Public Library', street: 'Boylston Street' })).toBe('Boston Public Library')
  })

  it('falls back to the street alone', () => {
    expect(placeName({ street: 'Massachusetts Avenue' })).toBe('Massachusetts Avenue')
  })

  it('has nothing to offer for an unnamed point', () => {
    expect(placeName({ city: 'Boston' })).toBeNull()
  })
})

describe('placeDetail', () => {
  it('reads from the nearest ring outward', () => {
    expect(
      placeDetail({ city: 'Cambridge', state: 'Massachusetts', country: 'United States', district: 'Mid-Cambridge' }, 'Somewhere'),
    ).toBe('Mid-Cambridge, Cambridge, Massachusetts')
  })

  it('never repeats the name it sits under', () => {
    expect(placeDetail({ city: 'Boston', state: 'Massachusetts' }, 'Boston')).toBe('Massachusetts')
  })

  it('never says the same ring twice', () => {
    expect(placeDetail({ district: 'Cambridge', city: 'Cambridge', state: 'Massachusetts' }, null)).toBe(
      'Cambridge, Massachusetts',
    )
  })

  it('drops the street when it is already part of the name', () => {
    expect(placeDetail({ housenumber: '10', street: 'Elm St', city: 'Boston' }, '10 Elm St')).toBe('Boston')
  })
})

describe('searchPlaces', () => {
  it('asks Photon, which is the geocoder built for typing', async () => {
    const fetchMock = mockFetch({ photon: { features: [feature({ name: 'Harvard Square', city: 'Cambridge', state: 'Massachusetts' })] } })
    const places = await searchPlaces('harvard sq')

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('photon.komoot.io/api?q=harvard%20sq')
    expect(url).toContain('limit=6')
    expect(places).toEqual([
      { lat: 42.3601, lng: -71.0589, label: 'Harvard Square', detail: 'Cambridge, Massachusetts' },
    ])
  })

  it('biases results toward where the rider already is', async () => {
    const fetchMock = mockFetch({ photon: { features: [] }, nominatim: [] })
    await searchPlaces('main street', { near: { lat: 42.3601, lng: -71.0589 } })
    expect(fetchMock.mock.calls[0][0]).toContain('lat=42.36010&lon=-71.05890')
  })

  it('says nothing for a query too short to mean anything', async () => {
    const fetchMock = mockFetch({ photon: { features: [] } })
    expect(await searchPlaces('ab')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to Nominatim when Photon cannot be reached', async () => {
    const fetchMock = mockFetch({
      photon: offline(),
      nominatim: [
        { lat: '42.3736', lon: '-71.1097', display_name: 'Harvard Square, Cambridge, Middlesex County, Massachusetts, USA' },
      ],
    })
    const places = await searchPlaces('harvard square')

    expect((fetchMock.mock.calls[0][0] as string)).toContain('photon')
    expect((fetchMock.mock.calls[1][0] as string)).toContain('nominatim.openstreetmap.org/search')
    expect(places[0].label).toBe('Harvard Square')
    expect(places[0].detail).toContain('Cambridge')
    expect(places[0].lat).toBeCloseTo(42.3736, 4)
  })

  it('falls back when Photon answers with nothing at all', async () => {
    const fetchMock = mockFetch({
      photon: { features: [] },
      nominatim: [{ lat: '42.37', lon: '-71.1', display_name: 'Somewhere, Boston, Massachusetts' }],
    })
    const places = await searchPlaces('somewhere')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(places).toHaveLength(1)
  })

  it('does not fall back when the rider has moved on', async () => {
    const fetchMock = mockFetch({ photon: abortError() })
    await expect(searchPlaces('harvard')).rejects.toThrow('Aborted')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('drops features with no usable coordinates or wording', async () => {
    mockFetch({
      photon: {
        features: [
          { properties: { name: 'No geometry' } },
          feature({}),
          feature({ name: 'Real Place', city: 'Boston' }),
        ],
      },
    })
    const places = await searchPlaces('anything')
    expect(places).toEqual([{ lat: 42.3601, lng: -71.0589, label: 'Real Place', detail: 'Boston' }])
  })

  it('collapses suggestions that read identically', async () => {
    mockFetch({
      photon: {
        features: [
          feature({ name: 'Cafe', city: 'Boston' }, [-71.05, 42.36]),
          feature({ name: 'Cafe', city: 'Boston' }, [-71.06, 42.37]),
          feature({ name: 'Cafe', city: 'Cambridge' }, [-71.11, 42.37]),
        ],
      },
    })
    const places = await searchPlaces('cafe')
    expect(places).toHaveLength(2)
    expect(places[1].detail).toBe('Cambridge')
  })
})

describe('describePoint', () => {
  const point = { lat: 42.3601, lng: -71.0589 }

  it('turns coordinates into an address', async () => {
    const fetchMock = mockFetch({
      photon: {
        features: [feature({ housenumber: '10', street: 'Beacon Street', city: 'Boston', state: 'Massachusetts' })],
      },
    })
    expect(await describePoint(point)).toBe('10 Beacon Street, Boston, Massachusetts')
    expect(fetchMock.mock.calls[0][0]).toContain('photon.komoot.io/reverse?lat=42.360100&lon=-71.058900')
  })

  it('falls back to Nominatim, trimmed to something readable', async () => {
    mockFetch({
      photon: offline(),
      nominatim: { display_name: '10, Beacon Street, Beacon Hill, Boston, Suffolk County, Massachusetts, 02108, USA' },
    })
    expect(await describePoint(point)).toBe('10, Beacon Street, Beacon Hill, Boston')
  })

  it('returns nothing rather than failing when neither service answers', async () => {
    mockFetch({ photon: offline(), nominatim: offline() })
    expect(await describePoint(point)).toBeNull()
  })

  it('gives up immediately when the lookup is abandoned', async () => {
    const fetchMock = mockFetch({ photon: abortError() })
    await expect(describePoint(point)).rejects.toThrow('Aborted')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
