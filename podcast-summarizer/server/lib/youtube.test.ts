import { describe, expect, it } from 'vitest'
import { discoverMirrors, extractPlayerResponse, fetchYouTube, metaFromPlayerResponse, parseJson3, parseTimedTextXml, parseYouTubeUrl, pickTrack, tracksFromPlayerResponse } from './youtube.js'

const ID = 'dQw4w9WgXcQ'

describe('parseYouTubeUrl', () => {
  it('reads every share form', () => {
    expect(parseYouTubeUrl(`https://www.youtube.com/watch?v=${ID}&t=120s`)).toEqual({ videoId: ID })
    expect(parseYouTubeUrl(`https://youtu.be/${ID}?si=abc`)).toEqual({ videoId: ID })
    expect(parseYouTubeUrl(`https://m.youtube.com/watch?feature=share&v=${ID}`)).toEqual({ videoId: ID })
    expect(parseYouTubeUrl(`https://www.youtube.com/live/${ID}`)).toEqual({ videoId: ID })
    expect(parseYouTubeUrl(`https://www.youtube.com/shorts/${ID}`)).toEqual({ videoId: ID })
    expect(parseYouTubeUrl(`youtube.com/watch?v=${ID}`)).toEqual({ videoId: ID })
  })
  it('rejects other things', () => {
    expect(parseYouTubeUrl('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk')).toBeNull()
    expect(parseYouTubeUrl('https://www.youtube.com/@channel')).toBeNull()
    expect(parseYouTubeUrl(ID)).toBeNull()
  })
})

const playerResponse = {
  playabilityStatus: { status: 'OK' },
  videoDetails: { videoId: ID, title: 'Deep Work Podcast #12', author: 'The Mind Lab', lengthSeconds: '5820', shortDescription: 'Focus.', thumbnail: { thumbnails: [{ url: 'small', width: 120 }, { url: 'big', width: 1280 }] } },
  microformat: { playerMicroformatRenderer: { publishDate: '2026-09-02' } },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: 'https://www.youtube.com/api/timedtext?v=x&lang=en&kind=asr', languageCode: 'en', kind: 'asr', name: { simpleText: 'English (auto-generated)' } },
        { baseUrl: 'https://www.youtube.com/api/timedtext?v=x&lang=de', languageCode: 'de', name: { runs: [{ text: 'German' }] } },
        { baseUrl: 'https://www.youtube.com/api/timedtext?v=x&lang=en-US', languageCode: 'en-US', name: { simpleText: 'English' } },
      ],
    },
  },
}

describe('player response parsing', () => {
  it('extracts the JSON blob from a watch page, even with braces in strings', () => {
    const html = `<html><script>var ytInitialPlayerResponse = ${JSON.stringify({ ...playerResponse, videoDetails: { ...playerResponse.videoDetails, shortDescription: 'has }; inside' } })};var meta = {};</script></html>`
    const pr = extractPlayerResponse(html)
    expect(pr?.videoDetails).toMatchObject({ title: 'Deep Work Podcast #12', shortDescription: 'has }; inside' })
  })
  it('maps metadata', () => {
    const meta = metaFromPlayerResponse(playerResponse as never, ID)
    expect(meta).toMatchObject({ title: 'Deep Work Podcast #12', channel: 'The Mind Lab', durationMs: 5820000, publishedAt: '2026-09-02', thumbnailUrl: 'big' })
  })
  it('prefers human captions in the requested language', () => {
    const tracks = tracksFromPlayerResponse(playerResponse as never)
    expect(tracks).toHaveLength(3)
    expect(pickTrack(tracks, 'en')?.languageCode).toBe('en-US')
    expect(pickTrack(tracks, 'de')?.languageCode).toBe('de')
    expect(pickTrack(tracks.filter((t) => t.kind === 'asr'))?.kind).toBe('asr')
  })
})

describe('caption formats', () => {
  it('parses timedtext xml with entities', () => {
    const xml = `<?xml version="1.0"?><transcript><text start="0.5" dur="2">Hello &amp;amp; welcome</text><text start="2.5" dur="1.5">to the &lt;b&gt;show&lt;/b&gt;</text></transcript>`
    expect(parseTimedTextXml(xml)).toEqual([
      { start: 0.5, end: 2.5, text: 'Hello & welcome' },
      { start: 2.5, end: 4, text: 'to the show' },
    ])
  })
  it('parses json3', () => {
    const json = JSON.stringify({ events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'Hi ' }, { utf8: 'there' }] }, { tStartMs: 1000 }, { tStartMs: 2000, segs: [{ utf8: '\n' }] }] })
    expect(parseJson3(json)).toEqual([{ start: 0, end: 1, text: 'Hi there' }])
  })
})

function fakeFetch(routes: Record<string, (url: string) => Response | undefined>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    for (const [prefix, handler] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        const r = handler(url)
        if (r) return r
      }
    }
    return new Response('nope', { status: 404 })
  }) as typeof fetch
}

const json3 = JSON.stringify({ events: Array.from({ length: 40 }, (_, i) => ({ tStartMs: i * 5000, dDurationMs: 4000, segs: [{ utf8: `Caption line ${i} about focus and attention` }] })) })

describe('fetchYouTube', () => {
  it('uses the watch page when it works', async () => {
    const f = fakeFetch({
      'https://www.youtube.com/watch': () => new Response(`<script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script>`),
      'https://www.youtube.com/api/timedtext': (url) => (url.includes('fmt=json3') ? new Response(json3) : undefined),
    })
    const r = await fetchYouTube(ID, { fetch: f, mirrors: [] })
    expect(r.via).toBe('watch')
    expect(r.meta.title).toBe('Deep Work Podcast #12')
    expect(r.segments).toHaveLength(40)
  })

  it('falls back to Innertube, then mirrors, then reports blocked with metadata from oEmbed', async () => {
    let innertubeCalled = false
    const blockedAll = fakeFetch({
      'https://www.youtube.com/watch': () => new Response('<html>bot check</html>', { status: 429 }),
      'https://www.youtube.com/youtubei': () => {
        innertubeCalled = true
        return new Response(JSON.stringify({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' } }))
      },
      'https://www.youtube.com/oembed': () => new Response(JSON.stringify({ title: 'From oEmbed', author_name: 'Chan' })),
    })
    const r = await fetchYouTube(ID, { fetch: blockedAll, mirrors: ['https://inv.example'] })
    expect(innertubeCalled).toBe(true)
    expect(r.segments).toBeUndefined()
    expect(r.blocked).toMatch(/would not serve captions/)
    expect(r.meta.title).toBe('From oEmbed')

    const viaMirror = fakeFetch({
      'https://www.youtube.com/watch': () => new Response('', { status: 429 }),
      'https://www.youtube.com/youtubei': () => new Response('', { status: 403 }),
      'https://inv.example/api/v1/captions/': (url) =>
        url.includes('?label')
          ? new Response('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nMirror line one\n\n00:00:03.000 --> 00:00:05.000\nMirror line two\n')
          : new Response(JSON.stringify({ captions: [{ label: 'English (auto-generated)', language_code: 'en', url: `/api/v1/captions/${ID}?label=English` }] })),
    })
    const m = await fetchYouTube(ID, { fetch: viaMirror, mirrors: ['https://inv.example'] })
    expect(m.via).toBe('mirror')
    expect(m.segments?.map((s) => s.text)).toEqual(['Mirror line one', 'Mirror line two'])
  })

  it('falls back to the legacy timedtext endpoint when the modern ones are gated', async () => {
    const f = fakeFetch({
      'https://www.youtube.com/watch': () => new Response('', { status: 429 }),
      'https://www.youtube.com/youtubei': () => new Response('', { status: 429 }),
      'https://www.youtube.com/api/timedtext?type=list': () =>
        new Response('<transcript_list><track id="0" name="" lang_code="en" lang_original="English"/><track id="1" lang_code="fr" kind="asr"/></transcript_list>'),
      'https://www.youtube.com/api/timedtext?v=': () => new Response(json3),
      'https://www.youtube.com/oembed': () => new Response(JSON.stringify({ title: 'Legacy Title' })),
    })
    const r = await fetchYouTube(ID, { fetch: f, mirrors: [] })
    expect(r.segments).toHaveLength(40)
    expect(r.reasons.some((x) => x.includes('watch'))).toBe(true)
  })

  it('reports every rung it tried', async () => {
    const f = fakeFetch({ 'https://www.youtube.com': () => new Response('', { status: 429 }) })
    const r = await fetchYouTube(ID, { fetch: f, mirrors: ['https://inv.example'] })
    expect(r.segments).toBeUndefined()
    expect(r.reasons.length).toBeGreaterThanOrEqual(4)
    expect(r.reasons.join(' ')).toMatch(/legacy timedtext/)
    expect(r.reasons.join(' ')).toMatch(/inv\.example/)
  })

  it('discovers live mirrors from the Invidious directory', async () => {
    const directory = JSON.stringify([
      ['dead.example', { type: 'https', api: true, uri: 'https://dead.example', monitor: { uptime: 40 } }],
      ['good.example', { type: 'https', api: true, uri: 'https://good.example/', monitor: { uptime: 99 } }],
      ['onion.example', { type: 'onion', api: true, uri: 'http://onion.example' }],
      ['noapi.example', { type: 'https', api: false, uri: 'https://noapi.example' }],
    ])
    const f = fakeFetch({ 'https://api.invidious.io/instances.json': () => new Response(directory) })
    expect(await discoverMirrors(f)).toEqual(['https://good.example'])
    const broken = fakeFetch({})
    expect(await discoverMirrors(broken)).toEqual([])
  })

  it('distinguishes a video with no captions from being blocked', async () => {
    const f = fakeFetch({
      'https://www.youtube.com/watch': () => new Response(`<script>var ytInitialPlayerResponse = ${JSON.stringify({ ...playerResponse, captions: undefined })};</script>`),
    })
    const r = await fetchYouTube(ID, { fetch: f, mirrors: [] })
    expect(r.blocked).toMatch(/no captions/)
    expect(r.meta.title).toBe('Deep Work Podcast #12')
  })
})
