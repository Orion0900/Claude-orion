/**
 * A job is one "summarize this Spotify link" request. Jobs run in the
 * background and the phone polls for progress; that keeps a slow transcription
 * from being tied to an HTTP request that iOS Safari would happily drop the
 * moment the screen locks.
 *
 * Finished jobs are written to a JSON file so summaries survive a restart.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { EpisodeMeta } from './lib/spotify.js'
import { expandShortLink, fetchEpisodeMeta, isSpotifyShortLink, parseSpotifyUrl, type SpotifyCredentials } from './lib/spotify.js'
import { fetchFeed, matchEpisode, pickFeed, searchFeeds, type FeedItem } from './lib/feeds.js'
import { fetchFeedTranscript, renderTranscript, transcribeWithAssemblyAI, transcribeWithOpenAI, wordCount, type Transcript } from './lib/transcribe.js'
import type { Summarizer, Summary } from './lib/summarize.js'

export type Stage = 'queued' | 'resolving' | 'finding_audio' | 'needs_source' | 'transcribing' | 'summarizing' | 'done' | 'failed'

export interface Job {
  id: string
  input: string
  createdAt: string
  updatedAt: string
  stage: Stage
  /** Human-readable line for the progress screen. */
  message: string
  episode?: EpisodeMeta
  feedUrl?: string
  audioUrl?: string
  transcriptSource?: Transcript['source']
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
  fetch?: typeof fetch
}

export class JobStore {
  private jobs = new Map<string, Job>()
  private loaded: Promise<void>

  constructor(private opts: JobStoreOptions) {
    this.loaded = this.load()
  }

  private async load() {
    try {
      const raw = JSON.parse(await readFile(this.opts.file, 'utf8')) as Job[]
      for (const job of raw) {
        // Anything that was mid-flight when the process died is not coming back.
        if (job.stage !== 'done' && job.stage !== 'failed' && job.stage !== 'needs_source') {
          job.stage = 'failed'
          job.error = 'The server restarted while this was running.'
        }
        this.jobs.set(job.id, job)
      }
    } catch {
      /* first run */
    }
  }

  private writing: Promise<void> = Promise.resolve()

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
    if (job.stage !== 'needs_source' && job.stage !== 'failed') throw new Error('This job is not waiting for a source.')
    this.update(job, { stage: 'finding_audio', message: 'Using the link you provided…', error: undefined })
    void this.run(job, source)
    return job
  }

  private async run(job: Job, provided?: { feedUrl?: string; audioUrl?: string }) {
    const fetchImpl = this.opts.fetch ?? fetch
    try {
      // 1. What episode is this?
      if (!job.episode) {
        this.update(job, { stage: 'resolving', message: 'Reading the Spotify link…' })
        let input = job.input
        if (isSpotifyShortLink(input)) input = await expandShortLink(input, fetchImpl)
        const ref = parseSpotifyUrl(input)
        if (!ref) throw new Error('That does not look like a Spotify link. Paste a link to a podcast episode.')
        if (ref.kind === 'show') throw new Error('That is a link to a whole show. Open an episode and share that link instead.')
        const episode = await fetchEpisodeMeta(ref.id, { fetch: fetchImpl, credentials: this.opts.spotify })
        this.update(job, { episode, message: `Found “${episode.title}”` })
      }
      const episode = job.episode!

      // 2. Where is the audio?
      let item: FeedItem | undefined
      let audioUrl = provided?.audioUrl ?? job.audioUrl
      if (!audioUrl) {
        this.update(job, { stage: 'finding_audio', message: 'Looking up the show’s RSS feed…' })
        let feedUrl = provided?.feedUrl ?? job.feedUrl
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
      this.update(job, { stage: 'transcribing', message: 'Checking for a published transcript…' })
      let transcript: Transcript | undefined
      if (item && item.transcripts.length > 0) transcript = await fetchFeedTranscript(item.transcripts, fetchImpl)
      const onProgress = (message: string) => this.update(job, { message })
      if (!transcript) {
        if (this.opts.assemblyAiKey) {
          onProgress('Sending audio for transcription…')
          transcript = await transcribeWithAssemblyAI(audioUrl, this.opts.assemblyAiKey, { fetch: fetchImpl, onProgress })
        } else if (this.opts.openAiKey) {
          transcript = await transcribeWithOpenAI(audioUrl, this.opts.openAiKey, { fetch: fetchImpl, onProgress })
        } else {
          throw new Error('No transcript in the feed and no transcription service configured. Set ASSEMBLYAI_API_KEY or OPENAI_API_KEY on the server.')
        }
      }
      const words = wordCount(transcript.segments)
      if (words < 50) throw new Error('The transcript came back nearly empty. The audio link may be wrong or protected.')
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
