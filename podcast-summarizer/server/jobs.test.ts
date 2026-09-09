import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JobStore } from './jobs.js'
import type { Summarizer } from './lib/summarize.js'

const YT = 'dQw4w9WgXcQ'
const ytPlayer = {
  playabilityStatus: { status: 'OK' },
  videoDetails: { videoId: YT, title: 'Why We Sleep (video)', author: 'Huberman Lab', lengthSeconds: '3600', shortDescription: 'Sleep on YouTube.', thumbnail: { thumbnails: [{ url: 'thumb', width: 320 }] } },
  captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ baseUrl: 'https://www.youtube.com/api/timedtext?v=x&lang=en', languageCode: 'en' }] } },
}
const ytJson3 = JSON.stringify({ events: Array.from({ length: 80 }, (_, i) => ({ tStartMs: i * 30000, dDurationMs: 4000, segs: [{ utf8: `Sleep fact number ${i} about glucose and memory consolidation.` }] })) })

const EP = '4rOoJ6Egrf8K2IrywzwOMk'

const pageHtml = `<html><head>
<title>Why We Sleep - Huberman Lab | Podcast on Spotify</title>
<meta property="og:title" content="Why We Sleep"/>
<meta property="og:description" content="Sleep science."/>
<meta name="music:release_date" content="2024-03-04"/>
<meta name="music:duration" content="3600"/>
</head></html>`

const itunes = JSON.stringify({ results: [{ collectionName: 'Huberman Lab', artistName: 'Scicomm Media', feedUrl: 'https://feeds.example.com/huberman' }] })

const feedXml = `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><title>Huberman Lab</title>
<item><title>Why We Sleep</title><pubDate>Mon, 04 Mar 2024 09:00:00 +0000</pubDate><itunes:duration>3600</itunes:duration>
<enclosure url="https://cdn.example.com/sleep.mp3" type="audio/mpeg"/>
<podcast:transcript url="https://cdn.example.com/sleep.srt" type="application/x-subrip"/></item>
</channel></rss>`

const srt = Array.from({ length: 80 }, (_, i) => `${i + 1}\n00:${String(i).padStart(2, '0')}:00,000 --> 00:${String(i).padStart(2, '0')}:30,000\nHost: Sleep fact number ${i} about glucose and memory consolidation.\n`).join('\n')

function fakeFetch(routes: Record<string, string | (() => Response)>): typeof fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    for (const [prefix, body] of Object.entries(routes)) {
      if (url.startsWith(prefix)) return typeof body === 'function' ? body() : new Response(body, { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
}

const summarizer: Summarizer = {
  async summarize(input) {
    expect(input.showName).toBe('Huberman Lab')
    expect(input.transcript).toMatch(/\[0:00\] (Host: )?Sleep fact number 0/)
    return {
      model: 'test-model',
      usage: { input: 1, output: 1 },
      summary: { tldr: 'Sleep.', key_points: [], chapters: [], quotes: [], action_items: [], mentions: [], people: [] },
    }
  },
}

async function waitFor(store: JobStore, id: string, stages: string[]) {
  for (let i = 0; i < 200; i++) {
    const job = await store.get(id)
    if (job && stages.includes(job.stage)) return job
    await new Promise((r) => setTimeout(r, 10))
  }
  throw new Error(`job never reached ${stages.join('/')}: ${(await store.get(id))?.stage}`)
}

describe('JobStore pipeline', () => {
  let dir: string
  let stores: JobStore[]
  const mk = (opts: Omit<ConstructorParameters<typeof JobStore>[0], 'file'>) => {
    const store = new JobStore({ file: join(dir, 'jobs.json'), ...opts })
    stores.push(store)
    return store
  }
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jobs-'))
    stores = []
  })
  afterEach(async () => {
    // Let any in-flight save land before the directory goes away.
    await Promise.all(stores.map((s) => s.flush()))
    await rm(dir, { recursive: true, force: true })
  })

  it('goes from Spotify link to summary using a feed transcript', async () => {
    const store = mk({
      summarizer,
      fetch: fakeFetch({
        [`https://open.spotify.com/episode/${EP}`]: pageHtml,
        'https://itunes.apple.com/search': itunes,
        'https://feeds.example.com/huberman': feedXml,
        'https://cdn.example.com/sleep.srt': srt,
      }),
    })
    const job = await store.create(`https://open.spotify.com/episode/${EP}?si=xyz`)
    const done = await waitFor(store, job.id, ['done', 'failed'])
    expect(done.error).toBeUndefined()
    expect(done.stage).toBe('done')
    expect(done.episode?.showName).toBe('Huberman Lab')
    expect(done.feedUrl).toBe('https://feeds.example.com/huberman')
    expect(done.audioUrl).toBe('https://cdn.example.com/sleep.mp3')
    expect(done.transcriptSource).toBe('feed')
    expect(done.summary?.tldr).toBe('Sleep.')
    expect(done.model).toBe('test-model')

    // Persisted, and a fresh store reads it back.
    await store.flush()
    const persisted = JSON.parse(await readFile(join(dir, 'jobs.json'), 'utf8'))
    expect(persisted).toHaveLength(1)
    const again = mk({ summarizer, fetch: fakeFetch({}) })
    expect((await again.get(job.id))?.stage).toBe('done')
  })

  it('asks for a source when the directory has no match, then continues', async () => {
    const store = mk({
      summarizer,
      fetch: fakeFetch({
        [`https://open.spotify.com/episode/${EP}`]: pageHtml,
        'https://open.spotify.com/embed/episode/': '<html></html>',
        'https://itunes.apple.com/search': JSON.stringify({ results: [] }),
        'https://feeds.example.com/huberman': feedXml,
        'https://cdn.example.com/sleep.srt': srt,
      }),
    })
    const job = await store.create(`spotify:episode:${EP}`)
    const waiting = await waitFor(store, job.id, ['needs_source', 'failed'])
    expect(waiting.stage).toBe('needs_source')
    expect(waiting.message).toMatch(/RSS feed/)

    await store.provideSource(job.id, { feedUrl: 'https://feeds.example.com/huberman' })
    const done = await waitFor(store, job.id, ['done', 'failed'])
    expect(done.stage).toBe('done')
  })

  it('summarizes a YouTube link from its captions with no transcription service', async () => {
    const store = mk({
      summarizer,
      youtubeMirrors: [],
      fetch: fakeFetch({
        'https://www.youtube.com/watch': `<script>var ytInitialPlayerResponse = ${JSON.stringify(ytPlayer)};</script>`,
        'https://www.youtube.com/api/timedtext': ytJson3,
      }),
    })
    const job = await store.create(`https://youtu.be/${YT}?si=share`)
    const done = await waitFor(store, job.id, ['done', 'failed'])
    expect(done.error).toBeUndefined()
    expect(done.stage).toBe('done')
    expect(done.episode).toMatchObject({ source: 'youtube', id: YT, title: 'Why We Sleep (video)', showName: 'Huberman Lab', url: `https://www.youtube.com/watch?v=${YT}` })
    expect(done.transcriptSource).toBe('youtube')
    expect(done.transcriptWords).toBeGreaterThan(500)
  })

  it('pauses for a transcript when YouTube blocks the server, then accepts one from the phone', async () => {
    const store = mk({
      summarizer,
      youtubeMirrors: [],
      fetch: fakeFetch({
        'https://www.youtube.com/watch': () => new Response('', { status: 429 }),
        'https://www.youtube.com/youtubei': () => new Response('', { status: 429 }),
        'https://www.youtube.com/oembed': JSON.stringify({ title: 'Why We Sleep (video)', author_name: 'Huberman Lab' }),
      }),
    })
    const job = await store.create(`https://www.youtube.com/watch?v=${YT}`)
    const waiting = await waitFor(store, job.id, ['needs_transcript', 'failed'])
    expect(waiting.stage).toBe('needs_transcript')
    expect(waiting.episode?.title).toBe('Why We Sleep (video)')

    await expect(store.provideTranscript(job.id, 'too short', undefined, 'phone')).rejects.toThrow(/too short/)
    const vtt = 'WEBVTT\n\n' + Array.from({ length: 80 }, (_, i) => `00:${String(i).padStart(2, '0')}:00.000 --> 00:${String(i).padStart(2, '0')}:04.000\nSleep fact number ${i} about glucose and memory consolidation.\n`).join('\n')
    await store.provideTranscript(job.id, vtt, 'vtt', 'phone')
    const done = await waitFor(store, job.id, ['done', 'failed'])
    expect(done.stage).toBe('done')
    expect(done.transcriptSource).toBe('phone')
  })

  it('accepts a transcript with the link and skips the caption hunt', async () => {
    let ladderCalls = 0
    const store = mk({
      summarizer,
      youtubeMirrors: [],
      fetch: fakeFetch({
        'https://www.youtube.com/oembed': JSON.stringify({ title: 'Why We Sleep (video)', author_name: 'Huberman Lab' }),
        'https://www.youtube.com/watch': () => {
          ladderCalls++
          return new Response('', { status: 429 })
        },
        'https://www.youtube.com/youtubei': () => {
          ladderCalls++
          return new Response('', { status: 429 })
        },
      }),
    })
    const panel = Array.from({ length: 80 }, (_, i) => `0:${String(i).padStart(2, '0')}\nSleep fact number ${i} about glucose and memory consolidation.`).join('\n')
    const job = await store.create(`https://youtu.be/${YT}`, { text: panel, source: 'phone' })
    const done = await waitFor(store, job.id, ['done', 'failed'])
    expect(done.stage).toBe('done')
    expect(done.transcriptSource).toBe('phone')
    expect(done.transcriptWords).toBeGreaterThan(500)
    expect(done.episode?.title).toBe('Why We Sleep (video)')
    // The blocked endpoints are never asked when the words are already here.
    expect(ladderCalls).toBe(0)
  })

  it('rejects a too-short seeded transcript', async () => {
    const store = mk({ summarizer, youtubeMirrors: [], fetch: fakeFetch({}) })
    await expect(store.create(`https://youtu.be/${YT}`, { text: 'nope', source: 'phone' })).rejects.toThrow(/too short/)
  })

  it('never dead-ends when YouTube itself is unreachable', async () => {
    const store = mk({
      summarizer,
      youtubeMirrors: [],
      fetch: (async () => {
        throw new Error('getaddrinfo ENOTFOUND www.youtube.com')
      }) as typeof fetch,
    })
    const job = await store.create(`https://www.youtube.com/watch?v=${YT}`)
    const waiting = await waitFor(store, job.id, ['needs_transcript', 'failed'])
    // Every rung failing is still a paste-able job, not a dead end.
    expect(waiting.stage).toBe('needs_transcript')
    expect(waiting.message).toMatch(/ENOTFOUND|reach YouTube|would not serve/)
    expect(waiting.episode?.id).toBe(YT)
  })

  it('fails clearly on non-episode links', async () => {
    const store = mk({ summarizer, fetch: fakeFetch({}) })
    const show = await store.create(`https://open.spotify.com/show/${EP}`)
    expect((await waitFor(store, show.id, ['failed'])).error).toMatch(/whole show/)
    const junk = await store.create('https://example.com/nothing')
    expect((await waitFor(store, junk.id, ['failed'])).error).toMatch(/YouTube or Spotify link/)
  })

  it('fails when there is no transcript and no transcription service', async () => {
    const store = mk({
      summarizer,
      fetch: fakeFetch({
        [`https://open.spotify.com/episode/${EP}`]: pageHtml,
        'https://itunes.apple.com/search': itunes,
        'https://feeds.example.com/huberman': feedXml.replace(/<podcast:transcript[^>]*\/>/, ''),
      }),
    })
    const job = await store.create(`https://open.spotify.com/episode/${EP}`)
    const failed = await waitFor(store, job.id, ['done', 'failed'])
    expect(failed.stage).toBe('failed')
    expect(failed.error).toMatch(/ASSEMBLYAI_API_KEY or OPENAI_API_KEY/)
  })
})
