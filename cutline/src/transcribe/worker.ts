/**
 * Runs Whisper off the main thread, so the app stays smooth while it works.
 * The last model used stays loaded, so the next transcription with it
 * starts straight away. Requests are handled one at a time.
 */

import { env, pipeline } from '@huggingface/transformers'
import type { ProgressInfo } from '@huggingface/transformers'
import { transcribeWith } from './engine.ts'
import type { WhisperPipeline } from './engine.ts'
import { DEFAULT_REMOTE_HOST } from './models.ts'
import type { ModelSource, TranscribeProgress, TranscribeRequest, WorkerReply } from './protocol.ts'

interface WorkerScope {
  onmessage: ((event: MessageEvent<TranscribeRequest>) => void) | null
  postMessage(message: WorkerReply): void
}

const scope = self as unknown as WorkerScope

let loaded: { repo: string; asr: WhisperPipeline } | null = null
let runtimeReady = false
let queue = Promise.resolve()

scope.onmessage = (event) => {
  const request = event.data
  if (request?.type !== 'transcribe') return
  queue = queue.then(() => handle(request))
}

// What went wrong, in words for the person using the app, by how far it got.
const FAILURES = {
  download: 'The speech model couldn’t be downloaded. Check the connection and try again.',
  load: 'The speech model couldn’t be started. Try again, or choose a smaller model in Settings.',
  transcribe: 'Something went wrong while transcribing.',
}

async function handle(request: TranscribeRequest): Promise<void> {
  const { id } = request
  let stage: keyof typeof FAILURES = 'download'
  const post = (progress: TranscribeProgress) => {
    if (progress.phase === 'load') stage = 'load'
    scope.postMessage({ type: 'progress', id, progress })
  }
  try {
    configure(request.source, request.base)
    const asr = await load(request.repo, post)
    stage = 'transcribe'
    const { words, language } = await transcribeWith(asr, request.audio, {
      language: request.language,
      onProgress: (done, total) => post({ phase: 'transcribe', done, total }),
    })
    scope.postMessage({ type: 'result', id, result: { words, language, model: request.repo } })
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id,
      message: FAILURES[stage],
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })
  }
}

function configure(source: ModelSource, base: string): void {
  const { wasm, versions } = env.backends.onnx
  // ONNX Runtime only reads these when it first starts.
  if (wasm && !runtimeReady) {
    // Its WebAssembly is served by the app itself (see vite.config.ts) rather
    // than a CDN, so transcription needs nothing else once the model is cached.
    // The paths never change, so the version goes in the query: otherwise the
    // browser's caches would hand an updated app the old runtime's files.
    const query = versions?.web ? `?v=${encodeURIComponent(versions.web)}` : ''
    wasm.wasmPaths = {
      mjs: new URL(`ort/ort-wasm-simd-threaded.mjs${query}`, base).href,
      wasm: new URL(`ort/ort-wasm-simd-threaded.wasm${query}`, base).href,
    }
    // Threads need cross-origin isolation, which GitHub Pages doesn't give
    // without help, so usually this is one.
    wasm.numThreads = crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
    runtimeReady = true
  }
  // The worker's own URL isn't the page's, so relative paths are resolved here.
  env.remoteHost = new URL(source.remoteHost ?? DEFAULT_REMOTE_HOST, base).href
  env.allowRemoteModels = source.allowRemote ?? true
  env.allowLocalModels = Boolean(source.localModelPath)
  if (source.localModelPath) env.localModelPath = new URL(source.localModelPath, base).href
}

async function load(repo: string, post: (progress: TranscribeProgress) => void): Promise<WhisperPipeline> {
  if (loaded?.repo === repo) return loaded.asr
  const previous = loaded
  loaded = null
  await previous?.asr.dispose().catch(() => undefined)

  const asr = (await pipeline('automatic-speech-recognition', repo, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: tracker(post),
  })) as unknown as WhisperPipeline
  loaded = { repo, asr }
  return asr
}

/**
 * Turns transformers.js's per-file events into one running total. Files
 * download side by side, so each file's latest count is kept and summed.
 */
function tracker(post: (progress: TranscribeProgress) => void): (info: ProgressInfo) => void {
  const files = new Map<string, { loaded: number; total: number }>()
  const unfinished = new Set<string>()
  let lastPost = 0
  let building = false
  return (info) => {
    if (info.status === 'initiate' && info.file.endsWith('.onnx')) unfinished.add(info.file)
    if (info.status === 'progress') {
      files.set(info.file, { loaded: info.loaded, total: info.total })
      let loaded = 0
      let total = 0
      for (const file of files.values()) {
        loaded += file.loaded
        total += file.total
      }
      const now = Date.now()
      // A post per network read would flood the main thread.
      if (now - lastPost >= 100 || (total > 0 && loaded >= total)) {
        lastPost = now
        post({ phase: 'download', loaded, total })
      }
    }
    if (info.status === 'done' && unfinished.delete(info.file) && unfinished.size === 0 && !building) {
      building = true
      post({ phase: 'load' })
    }
  }
}
