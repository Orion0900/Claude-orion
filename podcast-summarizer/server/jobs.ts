/**
 * A job is one "summarize this link" request. Jobs run in the background and
 * the phone polls for progress; that keeps a slow step from being tied to an
 * HTTP request that iOS Safari would drop the moment the screen locks.
 *
 * Two kinds of link are accepted:
 *   - YouTube: captions are read straight from YouTube. Free, no audio.
 *   - Spotify: the episode's RSS feed is found and the audio transcribed.
 *
 * Finished jobs are written to a JSON file so summaries survive a restart.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { expandShortLink, fetchEpisodeMeta, isSpotifyShortLink, parseSpotifyUrl, type SpotifyCredentials } from './lib/spotify.js'
import { fetchFeed, matchEpisode, pickFeed, searchFeeds, type FeedItem } from './lib/feeds.js'
import { fetchFeedTranscript, parseTranscriptFile, renderTranscript, transcribeWithAssemblyAI, transcribeWithOpenAI, wordCount, type Segment } from './lib/transcribe.js'
import { fetchYouTube, parseYouTubeUrl, type YouTubeResult } from './lib/youtube.js'
import type { Summarizer, Summary } from './lib/summarize.js'

export type Stage = 'queued' | 'resolving' | 'finding_audio' | 'needs_source' | 'needs_transcript' | 'transcribing' | 'summarizing' | 'done' | 'failed'

export type TranscriptSource = 'youtube' | 'feed' | 'assemblyai' | 'openai' | 'phone' | 'manual'

/** What the UI needs to know about the thing being summarized, whatever its origin. */
export interface Episode {
  source: 'youtube' | 'spotify'
  id: string
  title: string
  description: string
  /** Podcast show, or YouTube channel. */
  showName?: string
  publisher?: string
  publishedAt?: string
  durationMs?: number
  imageUrl?: string
  /** Link back to the episode. Timestamps are appended by the client. */
  url: string
}

export interface Job {
  id: string
  input: string
  createdAt: string
  updatedAt: string
  stage: Stage
  /** Human-readable line for the progress screen. */
  message: string
  episode?: Episode
  feedUrl?: string
  audioUrl?: string
  transcriptSource?: TranscriptSource
  transcriptWords?: number
  summary?: Summary
  model?: string
  error?: string
}

export interface JobStoreOptions {
  file: string
  summarizer: Summarizer
  spotify?: SpotifyCredentials
  assemblyAiKey?: string
  openAiKey?: string
  youtubeMirrors?: string[]
  fetch?: typeof fetch
}

interface Resume {
  feedUrl?: string
  audioUrl?: string
  transcript?: { segments: Segment[]; source: TranscriptSource }
}

const WAITING: Stage[] = ['needs_source', 'needs_transcript']

export class JobStore {
  private jobs = new Map<string, Job>()
  private loaded: Promise<void>
  private writing: Promise<void> = Promise.resolve()

  constructor(private opts: JobStoreOptions) {
    this.loaded = this.load()
  }

  private async load() {
    try {
      const raw = JSON.parse(await readFile(this.opts.file, 'utf8')) as Job[]
      for (const job of raw) {
        // Anything that was mid-flight when the process died is not coming back.
        if (job.stage !== 'done' && job.stage !== 'failed' && !WAITING.includes(job.stage)) {
          job.stage = 'failed'
          job.error = 'The server restarted while this was running.'
        }
        this.jobs.set(job.id, job)
      }
    } catch {
      /* first run */
    }
  }

  /**
   * Saves are serialized and written to a temp file first, so two updates
   * landing at once can't interleave and a crash mid-write can't leave a
   * half-written file behind.
   */
  private persist(): Promise<void> {
    this.writing = this.writing
      .then(async () => {
        await mkdir(dirname(this.opts.file), { recursive: true })
        const tmp = `${this.opts.file}.tmp`
        await writeFile(tmp, JSON.stringify([...this.jobs.values()], null, 2))
        await rename(tmp, this.opts.file)
      })
      .catch((err) => console.error('[jobs] could not save:', err))
    return this.writing
  }

  /** Resolves once every pending save has hit disk. */
  flush(): Promise<void> {
    return this.writing
  }

  async list(): Promise<Job[]> {
    await this.loaded
    return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(id: string): Promise<Job | undefined> {
    await this.loaded
    return this.jobs.get(id)
  }

  async remove(id: string): Promise<boolean> {
    await this.loaded
    const had = this.jobs.delete(id)
    if (had) await this.persist()
    return had
  }

  private update(job: Job, patch: Partial<Job>) {
    Object.assign(job, patch, { updatedAt: new Date().toISOString() })
    void this.persist()
  }

  async create(input: string): Promise<Job> {
    await this.loaded
    const now = new Date().toISOString()
    const job: Job = { id: randomUUID(), input: input.trim(), createdAt: now, updatedAt: now, stage: 'queued', message: 'Queued' }
    this.jobs.set(job.id, job)
    await this.persist()
    void this.run(job)
    return job
  }

  /** The user supplied the feed or audio we could not find. Pick up from there. */
  async provideSource(id: string, source: { feedUrl?: string; audioUrl?: string }): Promise<Job | undefined> {
    const job = await this.get(id)
    if (!job) return undefined
    if (!WAITING.includes(job.stage) && job.stage !== 'failed') throw new Error('This job is not waiting for input.')
    this.update(job, { stage: 'finding_audio', message: 'Using the link you provided…', error: undefined })
    void this.run(job, source)
    return job
  }

  /**
   * A transcript arrived from outside: fetched by the phone from a mirror
   * when this server was blocked, or pasted by hand.
   */
  async provideTranscript(id: string, text: string, format: string | undefined, source: TranscriptSource): Promise<Job | undefined> {
    const job = await this.get(id)
    if (!job) return undefined
    if (!WAITING.includes(job.stage) && job.stage !== 'failed') throw new Error('This job is not waiting for input.')
    const segments = parseTranscriptFile(text, format)
    if (wordCount(segments) < 50) throw new Error('That transcript is too short to be the episode.')
    this.update(job, { stage: 'summarizing', message: 'Got the transcript…', error: undefined })
    void this.run(job, { transcript: { segments, source } })
    return job
  }

  private async run(job: Job, resume: Resume = {}) {
    const fetchImpl = this.opts.fetch ?? fetch
    try {
      let transcript = resume.transcript
      let item: FeedItem | undefined

      // 1. What is this, and (for YouTube) can we read its captions right away?
      if (!job.episode) {
        this.update(job, { stage: 'resolving', message: 'Reading the link…' })
        let input = job.input
        if (isSpotifyShortLink(input)) input = await expandShortLink(input, fetchImpl)
        const yt = parseYouTubeUrl(input)
        const sp = parseSpotifyUrl(input)
        if (yt) {
          // A thrown error here (DNS, TLS, a mirror hanging) must still leave
          // the user with the paste route, so treat it as "blocked", not failed.
          const result: YouTubeResult = await fetchYouTube(yt.videoId, { fetch: fetchImpl, mirrors: this.opts.youtubeMirrors }).catch((err: Error) => ({
            meta: { videoId: yt.videoId, title: `YouTube video ${yt.videoId}`, url: `https://www.youtube.com/watch?v=${yt.videoId}` },
            reasons: [err.message],
            blocked: `Couldn’t reach YouTube from the server (${err.message}).`,
          }))
          const m = result.meta
          const episode: Episode = {
            source: 'youtube',
            id: m.videoId,
            title: m.title,
            description: m.description ?? '',
            showName: m.channel,
            publishedAt: m.publishedAt,
            durationMs: m.durationMs,
            imageUrl: m.thumbnailUrl,
            url: m.url,
          }
          this.update(job, { episode, message: `Found “${episode.title}”` })
          if (result.segments) transcript = { segments: result.segments, source: 'youtube' }
          else {
            this.update(job, { stage: 'needs_transcript', message: result.blocked ?? 'Captions unavailable.' })
            return
          }
        } else if (sp) {
          if (sp.kind === 'show') throw new Error('That is a link to a whole show. Open an episode and share that link instead.')
          const m = await fetchEpisodeMeta(sp.id, { fetch: fetchImpl, credentials: this.opts.spotify })
          const episode: Episode = {
            source: 'spotify',
            id: m.spotifyId,
            title: m.title,
            description: m.description,
            showName: m.showName,
            publisher: m.publisher,
            publishedAt: m.publishedAt,
            durationMs: m.durationMs,
            imageUrl: m.imageUrl,
            url: m.spotifyUrl,
          }
          this.update(job, { episode, message: `Found “${episode.title}”` })
        } else {
          throw new Error('That does not look like a YouTube or Spotify link. Share an episode from either app and paste the link.')
        }
      }
      const episode = job.episode!

      if (!transcript && episode.source === 'youtube') {
        // Resumed without a transcript: the caller wants another server-side try.
        const result: YouTubeResult = await fetchYouTube(episode.id, { fetch: fetchImpl, mirrors: this.opts.youtubeMirrors }).catch((err: Error) => ({
          meta: { videoId: episode.id, title: episode.title, url: episode.url },
          reasons: [err.message],
          blocked: `Couldn’t reach YouTube from the server (${err.message}).`,
        }))
        if (!result.segments) {
          this.update(job, { stage: 'needs_transcript', message: result.blocked ?? 'Captions unavailable.' })
          return
        }
        transcript = { segments: result.segments, source: 'youtube' }
      }

      // 2. Spotify: where is the audio?
      let audioUrl = resume.audioUrl ?? job.audioUrl
      if (!transcript && !audioUrl) {
        this.update(job, { stage: 'finding_audio', message: 'Looking up the show’s RSS feed…' })
        let feedUrl = resume.feedUrl ?? job.feedUrl
        if (!feedUrl && episode.showName) {
          const candidates = await searchFeeds(episode.showName, fetchImpl)
          feedUrl = pickFeed(candidates, episode.showName, episode.publisher)?.feedUrl
        }
        if (!feedUrl) {
          this.update(job, {
            stage: 'needs_source',
            message: episode.showName
              ? `Couldn’t find the RSS feed for “${episode.showName}”. Paste the show’s RSS feed or the episode’s audio URL.`
              : 'Couldn’t tell which show this episode belongs to. Paste the show’s RSS feed or the episode’s audio URL.',
          })
          return
        }
        this.update(job, { feedUrl, message: 'Matching the episode in the feed…' })
        const feed = await fetchFeed(feedUrl, fetchImpl)
        item = matchEpisode(feed.items, { title: episode.title, publishedAt: episode.publishedAt, durationMs: episode.durationMs })
        if (!item?.audioUrl) {
          this.update(job, {
            stage: 'needs_source',
            message: `The feed for “${feed.title ?? episode.showName}” doesn’t list this episode. Paste the episode’s audio URL, or a different feed.`,
          })
          return
        }
        audioUrl = item.audioUrl
        this.update(job, { audioUrl })
      }

      // 3. Words.
      const onProgress = (message: string) => this.update(job, { message })
      if (!transcript) {
        this.update(job, { stage: 'transcribing', message: 'Checking for a published transcript…' })
        if (item && item.transcripts.length > 0) {
          const t = await fetchFeedTranscript(item.transcripts, fetchImpl)
          if (t) transcript = { segments: t.segments, source: 'feed' }
        }
        if (!transcript) {
          if (this.opts.assemblyAiKey) {
            onProgress('Sending audio for transcription…')
            const t = await transcribeWithAssemblyAI(audioUrl!, this.opts.assemblyAiKey, { fetch: fetchImpl, onProgress })
            transcript = { segments: t.segments, source: 'assemblyai' }
          } else if (this.opts.openAiKey) {
            const t = await transcribeWithOpenAI(audioUrl!, this.opts.openAiKey, { fetch: fetchImpl, onProgress })
            transcript = { segments: t.segments, source: 'openai' }
          } else {
            throw new Error(
              'No transcript in the feed and no transcription service configured. Share the YouTube version of this episode instead (captions are free), or set ASSEMBLYAI_API_KEY or OPENAI_API_KEY on the server.',
            )
          }
        }
      }
      const words = wordCount(transcript.segments)
      if (words < 50) throw new Error('The transcript came back nearly empty.')
      this.update(job, { transcriptSource: transcript.source, transcriptWords: words })

      // 4. The summary.
      this.update(job, { stage: 'summarizing', message: `Summarizing ${words.toLocaleString()} words…` })
      const result = await this.opts.summarizer.summarize(
        {
          showName: episode.showName,
          episodeTitle: episode.title,
          description: item?.description ?? episode.description,
          transcript: renderTranscript(transcript.segments),
        },
        onProgress,
      )
      this.update(job, { stage: 'done', message: 'Done', summary: result.summary, model: result.model })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[job ${job.id}] failed:`, message)
      this.update(job, { stage: 'failed', message: 'Failed', error: message })
    }
  }
}
