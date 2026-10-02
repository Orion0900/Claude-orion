/**
 * On-device speech to text, with a time for every word. Whisper runs in a
 * Web Worker through transformers.js; the model is downloaded once and then
 * kept in the browser's cache.
 */

import { DEFAULT_REMOTE_HOST, MODEL_FILES, normalizeLanguage, repoFor } from './models.ts'
import type { ModelSize } from './models.ts'
import type { ModelSource, TranscribeProgress, TranscribeRequest, TranscribeResult, WorkerReply } from './protocol.ts'

export { LANGUAGES, MODELS } from './models.ts'
export type { ModelSize } from './models.ts'
export type { ModelSource, TranscribeProgress, TranscribeResult } from './protocol.ts'

export interface TranscribeOptions {
  model: ModelSize
  /** ISO 639-1 code such as 'en', or null to auto-detect. English uses the .en model of that size. */
  language: string | null
  onProgress?: (p: TranscribeProgress) => void
  signal?: AbortSignal
}

// Where transformers.js keeps downloaded files, in Cache Storage.
const CACHE_NAME = 'transformers-cache'

let source: ModelSource = {}
let worker: Worker | null = null
let queue: Promise<unknown> = Promise.resolve()
let nextId = 1

/**
 * 16 kHz mono PCM in, words on the source clock out. Calls run one after
 * another; abort one through `signal` and it rejects with an AbortError.
 */
export function transcribe(audio: Float32Array, options: TranscribeOptions): Promise<TranscribeResult> {
  const { signal } = options
  if (signal?.aborted) return Promise.reject(abortError())
  // A copy, because it's handed over to the worker and the caller keeps theirs.
  const copy = audio.slice()
  const job = queue.then(() => run(copy, options))
  queue = job.catch(() => undefined)
  if (!signal) return job
  // Settle as soon as the signal fires, even while waiting for an earlier call.
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError())
    signal.addEventListener('abort', onAbort, { once: true })
    job.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/** For tests and self-hosting: where model files come from. */
export function configureModelSource(next: ModelSource): void {
  source = { ...next }
}

/**
 * Whether a model's files are already in the browser cache, so using it
 * won't download anything. False when that can't be told.
 */
export async function isModelCached(model: ModelSize, language: string | null): Promise<boolean> {
  try {
    if (typeof caches === 'undefined' || !(await caches.has(CACHE_NAME))) return false
    const cache = await caches.open(CACHE_NAME)
    const repo = repoFor(model, language)
    const base = pageBase()
    // The cache is keyed by the URL each file was fetched from.
    const remote = new URL(`${repo}/resolve/main/`, withSlash(new URL(source.remoteHost ?? DEFAULT_REMOTE_HOST, base).href))
    const local = source.localModelPath ? new URL(`${repo}/`, withSlash(new URL(source.localModelPath, base).href)) : null
    const found = await Promise.all(
      MODEL_FILES.map(
        async (file) =>
          Boolean(await cache.match(new URL(file, remote).href)) ||
          (local !== null && Boolean(await cache.match(new URL(file, local).href))),
      ),
    )
    return found.every(Boolean)
  } catch {
    return false
  }
}

function run(audio: Float32Array, options: TranscribeOptions): Promise<TranscribeResult> {
  const { signal, onProgress } = options
  if (signal?.aborted) return Promise.reject(abortError())
  const language = normalizeLanguage(options.language)
  const request: TranscribeRequest = {
    type: 'transcribe',
    id: nextId++,
    audio,
    repo: repoFor(options.model, language),
    language,
    source,
    base: pageBase(),
  }
  const target = getWorker()

  return new Promise((resolve, reject) => {
    const finish = () => {
      target.removeEventListener('message', onMessage)
      target.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
    }
    const onMessage = (event: MessageEvent<WorkerReply>) => {
      const reply = event.data
      if (reply.id !== request.id) return
      if (reply.type === 'progress') {
        onProgress?.(reply.progress)
        return
      }
      finish()
      if (reply.type === 'result') resolve(reply.result)
      else reject(new Error(reply.message, { cause: reply.detail }))
    }
    // The worker itself failed, e.g. its script didn't load. Start afresh next time.
    const onError = (event: ErrorEvent) => {
      finish()
      discardWorker()
      reject(new Error('The transcriber stopped unexpectedly.', { cause: event.message }))
    }
    // Whisper can't be interrupted mid-step, so the worker goes, and the model
    // with it; the next call loads it again from the browser cache.
    const onAbort = () => {
      finish()
      discardWorker()
      reject(abortError())
    }
    target.addEventListener('message', onMessage)
    target.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })
    target.postMessage(request, [audio.buffer])
  })
}

function getWorker(): Worker {
  worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'transcribe' })
  return worker
}

function discardWorker(): void {
  worker?.terminate()
  worker = null
}

// A plain Error named AbortError: instanceof Error holds everywhere, which
// isn't a given for DOMException in every engine.
function abortError(): Error {
  const error = new Error('Transcription was cancelled.')
  error.name = 'AbortError'
  return error
}

function pageBase(): string {
  return typeof document === 'undefined' ? location.href : document.baseURI
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
