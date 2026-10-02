/**
 * Getting a video from the camera roll to captions: read it, keep a copy on
 * the phone, then listen to it and transcribe. Each step reports progress so
 * the screen can say what's happening, and each can be cancelled.
 */
import { presetStyle } from '../captions/presets'
import { suggestEmojis, suggestEmphasis } from '../lib/emoji'
import { newProject } from '../lib/project'
import type { AudioAnalysis, Project, Word } from '../lib/types'
import { analyzeLoudness, decodeAudio, toMono16k } from '../media/audio'
import { makeThumbnail, probeMedia } from '../media/probe'
import { packAnalysis, persistStorage, putFile, saveProject } from '../store/db'
import { transcribe, type TranscribeProgress } from '../transcribe/client'
import type { AppSettings } from './settings'

/** Read a picked or recorded video and store it as a new project. */
export async function importVideo(file: Blob, fileName: string, settings: AppSettings): Promise<Project> {
  const media = await probeMedia(file, fileName)
  const thumbnail = await makeThumbnail(file, Math.min(1, media.duration / 3)).catch(() => null)
  const project = newProject(media, presetStyle(settings.preset), thumbnail)
  void persistStorage()
  try {
    await putFile(project.id, 'source', file)
    await saveProject(project)
  } catch (error) {
    throw new Error(
      `Couldn't keep a copy of this video on the phone${
        error instanceof Error && /quota|space|full/i.test(error.message) ? ' — it looks full' : ''
      }. Free up some space and try again.`,
    )
  }
  return project
}

export type PrepareStep =
  | { step: 'audio'; fraction: number }
  | { step: 'model'; loaded: number; total: number }
  | { step: 'loading-model' }
  | { step: 'transcribe'; done: number; total: number }

export interface Transcribed {
  words: Word[]
  language: string | null
  model: string
  analysis: AudioAnalysis | null
}

/**
 * Decode the audio, measure its loudness (kept for cutting pauses cleanly)
 * and transcribe it. A video without sound comes back with no words.
 */
export async function transcribeProject(
  project: Project,
  source: Blob,
  settings: Pick<AppSettings, 'model' | 'language'>,
  onStep: (step: PrepareStep) => void,
  signal: AbortSignal,
): Promise<Transcribed> {
  onStep({ step: 'audio', fraction: 0 })
  const decoded = await decodeAudio(source, { signal, onProgress: (fraction) => onStep({ step: 'audio', fraction }) })
  throwIfAborted(signal)
  if (!decoded) return { words: [], language: null, model: settings.model, analysis: null }
  const mono = await toMono16k(decoded)
  throwIfAborted(signal)
  const analysis = analyzeLoudness(mono, 16000, 0.01)
  await putFile(project.id, 'analysis', packAnalysis(analysis)).catch(() => {
    // Pauses can still be cut from word timings alone.
  })

  const result = await transcribe(mono, {
    model: settings.model,
    language: settings.language,
    signal,
    onProgress: (p: TranscribeProgress) => {
      if (p.phase === 'download') onStep({ step: 'model', loaded: p.loaded, total: p.total })
      else if (p.phase === 'load') onStep({ step: 'loading-model' })
      else onStep({ step: 'transcribe', done: p.done, total: p.total })
    },
  })
  return { words: decorate(result.words), language: result.language, model: result.model, analysis }
}

/** Fresh words get the free, on-device emphasis and emoji picks so captions look finished from the start. */
export function decorate(words: Word[]): Word[] {
  const emphasis = suggestEmphasis(words)
  const emojis = suggestEmojis(words)
  return words.map((w) => {
    const next: Word = { ...w }
    if (emphasis.has(w.id)) next.emphasis = true
    const emoji = emojis.get(w.id)
    if (emoji) next.emoji = emoji
    return next
  })
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('Cancelled')
    error.name = 'AbortError'
    throw error
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}
