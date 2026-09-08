import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JobStore } from './jobs.js'
import type { Summarizer } from './lib/summarize.js'

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
    expect(input.transcript).toContain('[0:00] Host: Sleep fact number 0')
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
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'jobs-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('goes from Spotify link to summary using a feed transcript', async () => {
    const store = new JobStore({
      file: join(dir, 'jobs.json'),
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
    const again = new JobStore({ file: join(dir, 'jobs.json'), summarizer, fetch: fakeFetch({}) })
    expect((await again.get(job.id))?.stage).toBe('done')
  })

  it('asks for a source when the directory has no match, then continues', async () => {
    const store = new JobStore({
      file: join(dir, 'jobs.json'),
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

  it('fails clearly on non-episode links', async () => {
    const store = new JobStore({ file: join(dir, 'jobs.json'), summarizer, fetch: fakeFetch({}) })
    const show = await store.create(`https://open.spotify.com/show/${EP}`)
    expect((await waitFor(store, show.id, ['failed'])).error).toMatch(/whole show/)
    const junk = await store.create('https://example.com/nothing')
    expect((await waitFor(store, junk.id, ['failed'])).error).toMatch(/Spotify link/)
  })

  it('fails when there is no transcript and no transcription service', async () => {
    const store = new JobStore({
      file: join(dir, 'jobs.json'),
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
