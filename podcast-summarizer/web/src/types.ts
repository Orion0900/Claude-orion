/** Mirrors the server's API shapes (server/jobs.ts, server/lib/summarize.ts). */
export type Stage = 'queued' | 'resolving' | 'finding_audio' | 'needs_source' | 'needs_transcript' | 'transcribing' | 'summarizing' | 'done' | 'failed'

export type TranscriptSource = 'youtube' | 'feed' | 'assemblyai' | 'openai' | 'phone' | 'manual'

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
  url: string
}

export interface Summary {
  tldr: string
  key_points: { point: string; detail: string; timestamp: string }[]
  chapters: { title: string; start: string; summary: string }[]
  quotes: { text: string; speaker: string; timestamp: string }[]
  action_items: string[]
  mentions: string[]
  people: string[]
}

export interface Job {
  id: string
  input: string
  createdAt: string
  updatedAt: string
  stage: Stage
  message: string
  episode?: Episode
  feedUrl?: string
  audioUrl?: string
  transcriptSource?: TranscriptSource
  transcriptWords?: number
  summary?: Summary
  model?: string
  error?: string
  /** Present on list responses, which omit the summary body. */
  hasSummary?: boolean
}

export interface Health {
  ok: boolean
  model: string
  providers: { anthropic: boolean; spotifyApi: boolean; assemblyai: boolean; openai: boolean }
}

export const ACTIVE_STAGES: Stage[] = ['queued', 'resolving', 'finding_audio', 'transcribing', 'summarizing']
export const isActive = (stage: Stage) => ACTIVE_STAGES.includes(stage)
export const isWaiting = (stage: Stage) => stage === 'needs_source' || stage === 'needs_transcript'

/** Link into the episode at a point in time. */
export function linkAt(episode: Episode | undefined, seconds: number | undefined): string | undefined {
  if (!episode) return undefined
  if (seconds === undefined) return episode.url
  if (episode.source === 'youtube') return `${episode.url}${episode.url.includes('?') ? '&' : '?'}t=${seconds}s`
  return `${episode.url}?t=${seconds}`
}

export const TRANSCRIPT_LABEL: Record<TranscriptSource, string> = {
  youtube: 'YouTube captions',
  feed: 'the publisher’s transcript',
  assemblyai: 'AssemblyAI',
  openai: 'OpenAI Whisper',
  phone: 'captions fetched by your phone',
  manual: 'a pasted transcript',
}
