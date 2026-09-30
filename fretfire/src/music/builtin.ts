import { emptyMeta, type Chart, type SongMeta } from '../chart/types'
import { arrange } from './arrange'
import { chartFromScore } from './autochart'
import { SongRenderer, type RenderedSong } from './render'
import { BUILTIN_SONGS } from './songs'
import type { SongDef } from './types'

/**
 * The built-in setlist as the song list sees it: metadata, a chart made on
 * demand, and audio rendered on demand in a worker, so the menus stay smooth.
 */

export interface BuiltinSong {
  id: string
  def: SongDef
  meta: SongMeta
}

/** Plenty for a phone speaker or earbuds, and a third faster to render than 48 kHz. */
export const BUILTIN_SAMPLE_RATE = 32000

export const BUILTIN: BuiltinSong[] = BUILTIN_SONGS.map((def) => ({ id: `builtin:${def.id}`, def, meta: metaFor(def) }))

function metaFor(def: SongDef): SongMeta {
  const score = arrange(def)
  const secondsPerBeat = 60 / def.bpm
  const chorus = score.sections.find((s) => /chorus/i.test(s.name))
  return {
    ...emptyMeta(),
    name: def.title,
    artist: def.artist,
    album: 'Fretfire Originals',
    genre: def.genre,
    year: def.year,
    charter: 'Fretfire',
    length: score.lengthBeats * secondsPerBeat,
    previewStart: chorus ? chorus.beat * secondsPerBeat : 20,
    intensity: { guitar: def.intensity },
  }
}

const charts = new Map<string, Chart>()

export function builtinChart(song: BuiltinSong): Chart {
  let chart = charts.get(song.id)
  if (!chart) {
    chart = chartFromScore(arrange(song.def))
    charts.set(song.id, chart)
  }
  return chart
}

interface RenderJob {
  promise: Promise<RenderedSong>
  listeners: Set<(fraction: number) => void>
  progress: number
}

/** Renders under way, so asking twice (preview, then Play) shares one job. */
const jobs = new Map<string, RenderJob>()

/**
 * The song's audio, rendered in a worker (or in slices on this thread when
 * workers are unavailable). Callers keep the result; nothing is cached here.
 */
export function renderBuiltin(song: BuiltinSong, onProgress?: (fraction: number) => void): Promise<RenderedSong> {
  let job = jobs.get(song.id)
  if (!job) {
    const record: RenderJob = { listeners: new Set(), progress: 0, promise: Promise.resolve(null as never) }
    const progress = (fraction: number) => {
      record.progress = fraction
      record.listeners.forEach((fn) => fn(fraction))
    }
    record.promise = renderInWorker(song.def, progress)
      .catch(() => renderHere(song.def, progress))
      .finally(() => jobs.delete(song.id))
    jobs.set(song.id, record)
    job = record
  }
  if (onProgress) {
    job.listeners.add(onProgress)
    onProgress(job.progress)
  }
  return job.promise
}

function renderInWorker(def: SongDef, progress: (f: number) => void): Promise<RenderedSong> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./renderWorker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      reject(error)
      return
    }
    worker.onmessage = (e: MessageEvent) => {
      const msg = e.data as { type: string; value?: number; song?: RenderedSong; message?: string }
      if (msg.type === 'progress') progress(msg.value ?? 0)
      else if (msg.type === 'done' && msg.song) {
        worker.terminate()
        progress(1)
        resolve(msg.song)
      } else if (msg.type === 'error') {
        worker.terminate()
        reject(new Error(msg.message ?? 'Render failed'))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message || 'Render worker failed'))
    }
    worker.postMessage({ id: def.id, sampleRate: BUILTIN_SAMPLE_RATE })
  })
}

/** Fallback when workers aren't available: render in slices between frames. */
async function renderHere(def: SongDef, progress: (f: number) => void): Promise<RenderedSong> {
  const renderer = new SongRenderer(arrange(def), BUILTIN_SAMPLE_RATE)
  while (!renderer.done) {
    renderer.step(BUILTIN_SAMPLE_RATE / 4)
    progress(renderer.progress)
    await new Promise((r) => setTimeout(r, 0))
  }
  renderer.normalize()
  return renderer.out
}
