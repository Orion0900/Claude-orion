/** What the main thread and the transcription worker say to each other. */

import type { Word } from '../lib/types.ts'

export type TranscribeProgress =
  /** Bytes, summed across the model files. */
  | { phase: 'download'; loaded: number; total: number }
  /** Files fetched, building the sessions. */
  | { phase: 'load' }
  /** Seconds of audio. */
  | { phase: 'transcribe'; done: number; total: number }

export interface TranscribeResult {
  words: Word[]
  /** ISO 639-1 code of the language transcribed, when known. */
  language: string | null
  /** The Hugging Face repo of the weights used, e.g. 'Xenova/whisper-base.en'. */
  model: string
}

/** Where model files come from. Defaults to Hugging Face. */
export interface ModelSource {
  /** Serves files at {remoteHost}{repo}/resolve/main/{file}, like huggingface.co. */
  remoteHost?: string
  /** Serves files at {localModelPath}{repo}/{file}; tried before remoteHost. */
  localModelPath?: string
  /** False to never fetch from remoteHost. */
  allowRemote?: boolean
}

export interface TranscribeRequest {
  type: 'transcribe'
  id: number
  /** 16 kHz mono. */
  audio: Float32Array
  repo: string
  /** ISO 639-1 code, or null to detect it. */
  language: string | null
  source: ModelSource
  /** The page's base URL, which the app's own files are found from. */
  base: string
}

export type WorkerReply =
  | { type: 'progress'; id: number; progress: TranscribeProgress }
  | { type: 'result'; id: number; result: TranscribeResult }
  | { type: 'error'; id: number; message: string; detail: string }
