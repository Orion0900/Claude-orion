import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJson, HttpError } from './http'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** A unique host per test, so one test's queue can't leak into the next. */
let hostCounter = 0
const freshHost = () => `https://host-${++hostCounter}.test`

function mockFetch(handler: (url: string) => unknown) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => ({
    ok: true,
    status: 200,
    json: async () => handler(url),
  }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('fetchJson', () => {
  it('returns the parsed body', async () => {
    mockFetch(() => ({ hello: 'world' }))
    expect(await fetchJson(`${freshHost()}/a`)).toEqual({ hello: 'world' })
  })

  it('leaves a gap between requests to the same host', async () => {
    const started: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        started.push(Date.now())
        return { ok: true, status: 200, json: async () => ({}) }
      }),
    )

    const host = freshHost()
    const begun = Date.now()
    await Promise.all([
      fetchJson(`${host}/1`, { minGapMs: 40 }),
      fetchJson(`${host}/2`, { minGapMs: 40 }),
      fetchJson(`${host}/3`, { minGapMs: 40 }),
    ])

    expect(started).toHaveLength(3)
    // The gap must hold between every pair, not just the first: storing a copy
    // of the queue state would freeze the clock and let requests bunch up.
    expect(started[1] - started[0]).toBeGreaterThanOrEqual(35)
    expect(started[2] - started[1]).toBeGreaterThanOrEqual(35)
    expect(started[2] - begun).toBeGreaterThanOrEqual(70)
  })

  it('does not make one host wait for another', async () => {
    mockFetch(() => ({}))
    const a = freshHost()
    const b = freshHost()
    const begun = Date.now()
    await Promise.all([fetchJson(`${a}/1`, { minGapMs: 60 }), fetchJson(`${b}/1`, { minGapMs: 60 })])
    expect(Date.now() - begun).toBeLessThan(50)
  })

  it('keeps serving a host after one of its requests fails', async () => {
    const host = freshHost()
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++
        if (call === 1) throw new Error('connection reset')
        return { ok: true, status: 200, json: async () => ({ ok: true }) }
      }),
    )

    await expect(fetchJson(`${host}/fails`, { minGapMs: 1, retries: 0 })).rejects.toThrow()
    expect(await fetchJson(`${host}/works`, { minGapMs: 1 })).toEqual({ ok: true })
  })

  it('gives up on a client error rather than retrying it', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchJson(`${freshHost()}/missing`, { minGapMs: 1 })).rejects.toBeInstanceOf(HttpError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a server error', async () => {
    let call = 0
    const fetchMock = vi.fn(async () => {
      call++
      return call === 1
        ? { ok: false, status: 503, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ recovered: true }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await fetchJson(`${freshHost()}/flaky`, { minGapMs: 1, retries: 2 })).toEqual({ recovered: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sends a body as a POST when one is given', async () => {
    const fetchMock = mockFetch(() => ({}))
    await fetchJson(`${freshHost()}/post`, { body: '{"a":1}', minGapMs: 1 })
    const init = fetchMock.mock.calls[0][1] as unknown as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('refuses to start once already aborted', async () => {
    const fetchMock = mockFetch(() => ({}))
    const controller = new AbortController()
    controller.abort()
    await expect(fetchJson(`${freshHost()}/x`, { signal: controller.signal, minGapMs: 1 })).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
