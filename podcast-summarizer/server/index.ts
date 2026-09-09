import express from 'express'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JobStore } from './jobs.js'
import { createSummarizer, DEFAULT_MODEL } from './lib/summarize.js'
import { fetchYouTube, parseYouTubeUrl } from './lib/youtube.js'

const here = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 8787)
const dataDir = resolve(process.env.DATA_DIR ?? join(here, '..', '..', 'data'))

const spotify =
  process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
    ? { clientId: process.env.SPOTIFY_CLIENT_ID, clientSecret: process.env.SPOTIFY_CLIENT_SECRET }
    : undefined

const youtubeMirrors = process.env.YOUTUBE_MIRRORS?.split(',').map((s) => s.trim()).filter(Boolean)

const store = new JobStore({
  file: join(dataDir, 'jobs.json'),
  summarizer: createSummarizer({ model: process.env.CLAUDE_MODEL ?? DEFAULT_MODEL }),
  spotify,
  assemblyAiKey: process.env.ASSEMBLYAI_API_KEY,
  openAiKey: process.env.OPENAI_API_KEY,
  youtubeMirrors,
})

const app = express()
app.disable('x-powered-by')
// Pasted transcripts of long episodes can run to a few MB.
app.use(express.json({ limit: '8mb' }))

// The PWA may be served from elsewhere (GitHub Pages, a dev server); let it call us.
app.use('/api', (req, res, next) => {
  res.setHeader('access-control-allow-origin', req.headers.origin ?? '*')
  res.setHeader('access-control-allow-methods', 'GET,POST,DELETE,OPTIONS')
  res.setHeader('access-control-allow-headers', 'content-type')
  // The bookmarklet calls this API from youtube.com. When PodBrief is hosted
  // on a home machine, that is a public page reaching a private address, which
  // Chrome blocks under Private Network Access unless this is answered.
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('access-control-allow-private-network', 'true')
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: process.env.CLAUDE_MODEL ?? DEFAULT_MODEL,
    providers: {
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      spotifyApi: Boolean(spotify),
      assemblyai: Boolean(process.env.ASSEMBLYAI_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
    },
  })
})

/**
 * Why did a link fail? Open this in a browser with ?url=… and it reports
 * every rung of the caption ladder and what each one said.
 */
app.get('/api/diagnose', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : ''
  const ref = parseYouTubeUrl(url)
  if (!ref) return res.status(400).json({ error: 'Add ?url=<a YouTube link> to this address.' })
  try {
    const result = await fetchYouTube(ref.videoId, { mirrors: youtubeMirrors })
    res.json({
      videoId: ref.videoId,
      title: result.meta.title,
      channel: result.meta.channel,
      gotCaptions: Boolean(result.segments),
      via: result.via,
      segments: result.segments?.length ?? 0,
      blocked: result.blocked,
      tried: result.reasons,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

app.get('/api/jobs', async (_req, res) => {
  const jobs = await store.list()
  // The list view does not need whole summaries.
  res.json(jobs.map(({ summary, ...rest }) => ({ ...rest, hasSummary: Boolean(summary) })))
})

app.post('/api/jobs', async (req, res) => {
  const url = typeof req.body?.url === 'string' ? req.body.url.trim() : ''
  if (!url) return res.status(400).json({ error: 'Send { "url": "https://open.spotify.com/episode/…" }' })
  // The bookmarklet sends the transcript with the link, in one request.
  const text = typeof req.body?.transcript === 'string' ? req.body.transcript : undefined
  const format = typeof req.body?.transcriptFormat === 'string' ? req.body.transcriptFormat : undefined
  const source = req.body?.transcriptSource === 'phone' ? 'phone' : 'manual'
  try {
    const job = await store.create(url, text ? { text, format, source } : undefined)
    res.status(202).json(job)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

app.get('/api/jobs/:id', async (req, res) => {
  const job = await store.get(req.params.id)
  if (!job) return res.status(404).json({ error: 'No such job' })
  res.json(job)
})

app.post('/api/jobs/:id/source', async (req, res) => {
  const feedUrl = typeof req.body?.feedUrl === 'string' ? req.body.feedUrl.trim() : undefined
  const audioUrl = typeof req.body?.audioUrl === 'string' ? req.body.audioUrl.trim() : undefined
  if (!feedUrl && !audioUrl) return res.status(400).json({ error: 'Send feedUrl or audioUrl' })
  try {
    const job = await store.provideSource(req.params.id, { feedUrl: feedUrl || undefined, audioUrl: audioUrl || undefined })
    if (!job) return res.status(404).json({ error: 'No such job' })
    res.status(202).json(job)
  } catch (err) {
    res.status(409).json({ error: (err as Error).message })
  }
})

app.post('/api/jobs/:id/transcript', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text : ''
  const format = typeof req.body?.format === 'string' ? req.body.format : undefined
  const source = req.body?.source === 'phone' ? 'phone' : 'manual'
  if (text.trim().length < 200) return res.status(400).json({ error: 'Send the transcript as { "text": "…" }' })
  try {
    const job = await store.provideTranscript(req.params.id, text, format, source)
    if (!job) return res.status(404).json({ error: 'No such job' })
    res.status(202).json(job)
  } catch (err) {
    res.status(409).json({ error: (err as Error).message })
  }
})

app.delete('/api/jobs/:id', async (req, res) => {
  res.status((await store.remove(req.params.id)) ? 204 : 404).end()
})

// In production the built web app is served from the same origin, which is
// what lets iOS install it as a standalone app with no CORS or config.
const webDir = join(here, '..', 'web')
if (existsSync(join(webDir, 'index.html'))) {
  app.use(express.static(webDir, { index: 'index.html', maxAge: '1h', setHeaders: (res, path) => {
    if (path.endsWith('sw.js') || path.endsWith('index.html')) res.setHeader('cache-control', 'no-cache')
  } }))
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(join(webDir, 'index.html')))
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Podcast summarizer listening on http://0.0.0.0:${port}`)
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) console.warn('ANTHROPIC_API_KEY is not set; summaries will fail.')
  if (!process.env.ASSEMBLYAI_API_KEY && !process.env.OPENAI_API_KEY) console.warn('No transcription key set; YouTube links work, Spotify links only when the feed publishes transcripts.')
})
