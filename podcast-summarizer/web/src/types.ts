/** Mirrors the server's API shapes (server/jobs.ts, server/lib/summarize.ts). */
export type Stage = 'queued' | 'resolving' | 'finding_audio' | 'needs_source' | 'transcribing' | 'summarizing' | 'done' | 'failed'

export interface EpisodeMeta {
  spotifyId: string
  title: string
  description: string
  showName?: string
  publisher?: string
  publishedAt?: string
  durationMs?: number
  imageUrl?: string
  spotifyUrl: string
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
  episode?: EpisodeMeta
  feedUrl?: string
  audioUrl?: string
  transcriptSource?: 'feed' | 'assemblyai' | 'openai' | 'manual'
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
