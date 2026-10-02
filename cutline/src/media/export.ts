import {
  AudioSample,
  AudioSampleSource,
  CanvasSink,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  StreamTarget,
  WebMOutputFormat,
  type Input,
  type InputAudioTrack,
  type InputVideoTrack,
} from 'mediabunny'
import type { Range } from '../lib/types'
import { openAudioReader } from './audio'
import { hasWebCodecsEncoders, planEncode, videoBitrate, type EncodePlan } from './codecs'
import { ChunkCollector } from './collector'
import { abortError, isAbortError, MediaError, unsupportedFileError, videoCodecError } from './errors'
import { renderEditedAudio, type AudioReader, type DecodedAudio } from './mix'
import { openInput, trackCodec } from './probe'
import { buildTimeline, frameCount, frameSourceTimes, type Timeline } from './ranges'
import { createExportAudioContext, recordExport, recorderAvailable, recorderMimeType } from './recorder'

export type DrawFrame = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  /** The source picture at this moment, rotation applied; null if none. */
  frame: CanvasImageSource | null,
  /** Size of `frame`. */
  frameSize: { width: number; height: number },
  editedTime: number,
) => void

export interface ExportOptions {
  source: Blob
  /** Source-time spans to keep, sorted and disjoint. The output is these, back to back. */
  ranges: Range[]
  width: number
  height: number
  /** Default 30. */
  fps?: number
  /** Largest source frame size worth decoding (the composition may zoom in); frames are downscaled to fit inside this. */
  decodeSize?: { width: number; height: number }
  draw: DrawFrame
  /** Background music mixed under the speech. */
  music?: { audio: DecodedAudio; volume: number; ducking: boolean }
  /** Force the realtime MediaRecorder path (testing, or when WebCodecs fails). */
  method?: 'auto' | 'webcodecs' | 'recorder'
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export interface ExportResult {
  blob: Blob
  mimeType: string
  extension: 'mp4' | 'webm'
  method: 'webcodecs' | 'recorder'
}

type Size = { width: number; height: number }

/** Each frame's lookup lands this much after its exact time; see frameSourceTimes. */
const LOOKUP_NUDGE = 0.001
/** Share of the progress bar the soundtrack takes in the fast path (it decodes ~50x faster than the picture). */
const AUDIO_SHARE = 0.05
/** Seconds of sound handed to the encoder at a time, kept just ahead of the picture. */
const AUDIO_CHUNK = 0.5

/** Wraps an error thrown by the caller's draw callback, so it isn't mistaken for a codec failure and retried. */
class DrawError extends Error {
  constructor(readonly original: unknown) {
    super('The draw callback threw.')
  }
}

interface Source {
  input: Input
  duration: number
  video: InputVideoTrack | null
  videoCodec: string | null
  videoDecodable: boolean
  audio: InputAudioTrack | null
}

async function inspectSource(blob: Blob): Promise<Source> {
  const input = openInput(blob)
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()])
    if (!video && !audio) throw new MediaError('no-media', "This file doesn't have any video or sound in it.")
    return {
      input,
      duration: await input.computeDuration(),
      video,
      videoCodec: video ? await trackCodec(video) : null,
      videoDecodable: video ? await video.canDecode().catch(() => false) : false,
      audio,
    }
  } catch (error) {
    input.dispose()
    if (error instanceof MediaError) throw error
    throw unsupportedFileError(error)
  }
}

/** Display size the decoder should hand frames over at: inside `box`, aspect kept, never enlarged. */
export function decodeFrameSize(display: Size, output: Size, box?: Size): Size {
  // Without a box: enough to cover the output with 25% to spare for punch-in zooms.
  const scale = box
    ? Math.min(1, box.width / display.width, box.height / display.height)
    : Math.min(1, Math.max(output.width / display.width, output.height / display.height) * 1.25)
  return { width: Math.max(2, Math.round(display.width * scale)), height: Math.max(2, Math.round(display.height * scale)) }
}

/** A canvas to compose on. A real <canvas> wherever there's a document, so text draws with the page's loaded web fonts (an OffscreenCanvas may not see them in every browser); OffscreenCanvas only in workers. */
function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  return new OffscreenCanvas(width, height)
}

function makePainter(draw: DrawFrame, width: number, height: number) {
  return (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frame: CanvasImageSource | null, frameSize: Size, editedTime: number) => {
    ctx.save()
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)
    try {
      draw(ctx, frame, frameSize, editedTime)
    } catch (error) {
      throw new DrawError(error)
    } finally {
      ctx.restore()
    }
  }
}

/** Calls through only on a 0.25% change, so a fast export doesn't re-render the UI for every frame. */
function throttleProgress(onProgress?: (fraction: number) => void) {
  let last = -1
  return (fraction: number) => {
    if (!onProgress) return
    const f = Math.min(1, Math.max(0, fraction))
    if (Math.abs(f - last) >= 0.0025 || (f === 1 && last !== 1)) {
      last = f
      onProgress(f)
    }
  }
}

function audioChunk(channels: Float32Array[], from: number, to: number, sampleRate: number): AudioSample {
  const n = to - from
  const data = new Float32Array(n * channels.length)
  channels.forEach((channel, c) => data.set(channel.subarray(from, to), c * n))
  return new AudioSample({ data, format: 'f32-planar', numberOfChannels: channels.length, sampleRate, timestamp: from / sampleRate })
}

interface FastJob {
  options: ExportOptions
  source: Source
  timeline: Timeline
  plan: EncodePlan
  reader: AudioReader | null
  fps: number
  width: number
  height: number
  report: (fraction: number) => void
}

/**
 * Decode, draw and encode as fast as the hardware goes, typically several
 * times realtime. The source is read lazily from the Blob, frames are
 * decoded once each in order (canvasesAtTimestamps over the whole edited
 * sequence) and downscaled by the decoder's canvas, and the soundtrack is
 * prepared up front and fed to the encoder just ahead of the picture.
 */
async function exportFast(job: FastJob): Promise<ExportResult> {
  const { options, source, timeline, plan, fps, width, height, report } = job
  const signal = options.signal
  const count = frameCount(timeline.duration, fps)

  let soundtrack: Float32Array[] | null = null
  if (plan.audio) {
    soundtrack = await renderEditedAudio(job.reader, timeline, {
      sampleRate: plan.sampleRate,
      channelCount: plan.channels,
      length: Math.round((count / fps) * plan.sampleRate),
      music: options.music,
      signal,
      onProgress: (f) => report(f * AUDIO_SHARE),
    })
  }

  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!ctx) throw new MediaError('failed', "The export couldn't start: the browser refused a drawing canvas.")
  const paint = makePainter(options.draw, width, height)

  const collector = new ChunkCollector(plan.container === 'mp4')
  const output = new Output({
    format: plan.container === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new StreamTarget(collector.writable),
  })
  const videoSource = new CanvasSource(canvas, {
    codec: plan.video,
    quality: new Quality({ bitrate: plan.videoBitrate }),
    fullCodecString: plan.videoCodecString,
    keyFrameInterval: 2,
    latencyMode: 'quality',
  })
  output.addVideoTrack(videoSource, { frameRate: fps })
  const audioSource = soundtrack && plan.audio ? new AudioSampleSource({ codec: plan.audio, quality: new Quality({ bitrate: plan.audioBitrate }) }) : null
  if (audioSource) output.addAudioTrack(audioSource)

  const onAbort = () => void output.cancel().catch(() => {})
  signal?.addEventListener('abort', onAbort, { once: true })
  let finalized = false
  try {
    await output.start()

    let sink: CanvasSink | null = null
    let frameSize: Size = { width: 0, height: 0 }
    let times = frameSourceTimes(timeline, fps, count, LOOKUP_NUDGE)
    if (source.video) {
      const display = { width: await source.video.getDisplayWidth(), height: await source.video.getDisplayHeight() }
      frameSize = decodeFrameSize(display, { width, height }, options.decodeSize)
      sink = new CanvasSink(source.video, { ...frameSize, fit: 'fill', poolSize: 2 })
      // Nothing to show before the first frame; ask for the first frame instead of getting null.
      const first = await source.video.getFirstTimestamp()
      times = times.map((t) => Math.max(t, first))
    }
    const frames = sink?.canvasesAtTimestamps(times) ?? null

    const rate = plan.sampleRate
    let fed = 0
    const feedUntil = async (seconds: number) => {
      if (!audioSource || !soundtrack) return
      const until = Math.min(soundtrack[0].length, Math.round(seconds * rate))
      while (fed < until) {
        const to = Math.min(until, fed + Math.round(AUDIO_CHUNK * rate))
        const sample = audioChunk(soundtrack, fed, to, rate)
        try {
          await audioSource.add(sample)
        } finally {
          sample.close()
        }
        fed = to
      }
    }

    let last: CanvasImageSource | null = null
    try {
      for (let k = 0; k < count; k++) {
        signal?.throwIfAborted()
        const t = k / fps
        if (frames) {
          const next = await frames.next()
          if (!next.done && next.value) last = next.value.canvas
        }
        paint(ctx, last, frameSize, t)
        await videoSource.add(t, 1 / fps)
        await feedUntil(t + AUDIO_CHUNK)
        report(AUDIO_SHARE + (1 - AUDIO_SHARE - 0.02) * ((k + 1) / count))
      }
    } finally {
      await frames?.return(undefined)
    }
    await feedUntil(Infinity)
    videoSource.close()
    audioSource?.close()
    await output.finalize()
    finalized = true
  } finally {
    signal?.removeEventListener('abort', onAbort)
    if (!finalized) await output.cancel().catch(() => {})
  }
  const blob = collector.toBlob(plan.mimeType)
  report(1)
  return { blob, mimeType: plan.mimeType, extension: plan.container, method: 'webcodecs' }
}

/** What the soundtrack is made at: the source's rate and channels (at most stereo), widened for stereo music. */
function soundtrackFormat(reader: AudioReader | null, music: ExportOptions['music']): { sampleRate: number; channels: number } | null {
  if (!reader && !music) return null
  const sampleRate = reader?.sampleRate ?? music?.audio.sampleRate ?? 48000
  const channels = Math.min(2, Math.max(reader?.channelCount ?? 1, music?.audio.channels.length ?? 1))
  return { sampleRate, channels }
}

let primed: AudioContext | null = null

function takePrimedContext(): AudioContext | null {
  const context = primed
  primed = null
  return context && context.state !== 'closed' ? context : null
}

/**
 * Call synchronously at the very start of the tap that starts an export,
 * before awaiting anything (fonts, music): where the export may have to
 * record in realtime (iOS before 26), it starts the audio the recording
 * needs while the tap still counts. exportVideo picks it up; a no-op where
 * WebCodecs will do the work.
 */
export function prepareExport(method: ExportOptions['method'] = 'auto'): void {
  const mayRecord = method === 'recorder' || (method === 'auto' && !hasWebCodecsEncoders(true))
  if (!mayRecord) return
  if (primed && primed.state !== 'closed') void primed.resume().catch(() => {})
  else primed = createExportAudioContext()
}

/**
 * Renders the edited video: the kept ranges back to back, every frame passed
 * through `draw`, the speech crossfaded at each cut, optional music under it.
 *
 * 'auto' encodes with WebCodecs (H.264/AAC in MP4 where possible, else
 * VP9/Opus in WebM) and falls back to realtime recording when the browser
 * lacks the encoders or they fail; call it straight from the tap that starts
 * the export so the fallback may use sound on iOS. Cancelling via `signal`
 * rejects with an AbortError; anything else rejects with a MediaError whose
 * message can be shown as is (or with what `draw` threw).
 */
export async function exportVideo(options: ExportOptions): Promise<ExportResult> {
  const method = options.method ?? 'auto'
  // Before any await: see createExportAudioContext.
  const mayRecord = method === 'recorder' || (method === 'auto' && !hasWebCodecsEncoders(true))
  const earlyContext = mayRecord ? (takePrimedContext() ?? createExportAudioContext()) : takePrimedContext()
  const signal = options.signal
  const report = throttleProgress(options.onProgress)
  let source: Source | null = null
  try {
    signal?.throwIfAborted()
    if (!Number.isFinite(options.width) || !Number.isFinite(options.height) || options.width < 2 || options.height < 2) {
      throw new TypeError(`Bad export size ${options.width}x${options.height}`)
    }
    // H.264 and HEVC need even sides.
    const width = Math.floor(options.width / 2) * 2
    const height = Math.floor(options.height / 2) * 2
    const fps = Math.min(120, Math.max(1, options.fps ?? 30))

    source = await inspectSource(options.source)
    const src = source
    const timeline = buildTimeline(options.ranges, src.duration)
    if (timeline.segments.length === 0) throw new MediaError('empty', 'Nothing is left to export: every part of the video has been cut.')
    const onAbort = () => src.input.dispose()
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      if (method !== 'recorder') {
        const needAudio = !!src.audio || !!options.music
        const fastPossible = hasWebCodecsEncoders(needAudio) && (!src.video || src.videoDecodable)
        if (fastPossible) {
          try {
            const reader = src.audio ? await openAudioReader(src.input, src.audio, options.source, signal) : null
            const plan = await planEncode({ width, height, fps, audio: soundtrackFormat(reader, options.music) })
            if (plan) return await exportFast({ options, source: src, timeline, plan, reader, fps, width, height, report })
            if (method === 'webcodecs') throw new MediaError('unsupported-browser', "This browser can't encode video here. Update to the latest iOS, or open Cutline in Safari or Chrome.")
          } catch (error) {
            if (signal?.aborted || error instanceof DrawError || method === 'webcodecs' || !recorderAvailable()) throw error
            // The realtime path decodes with the browser's own player, which can manage what WebCodecs couldn't.
            console.warn('WebCodecs export failed; recording in realtime instead', error)
            report(0)
          }
        } else if (method === 'webcodecs') {
          if (src.video && !src.videoDecodable) throw videoCodecError(src.videoCodec)
          throw new MediaError('unsupported-browser', "This browser can't encode video here. Update to the latest iOS, or open Cutline in Safari or Chrome.")
        }
      }

      const { blob, mimeType } = await recordExport({
        source: options.source,
        timeline,
        width,
        height,
        fps,
        videoBitrate: videoBitrate('avc', width, height, fps),
        hasVideo: !!src.video,
        videoCodec: src.videoCodec,
        audioContext: earlyContext,
        paint: makePainter(options.draw, width, height),
        signal,
        onProgress: report,
        soundtrack: async () => {
          const reader = src.audio ? await openAudioReader(src.input, src.audio, options.source, signal) : null
          const format = soundtrackFormat(reader, options.music)
          if (!format) return null
          const channels = await renderEditedAudio(reader, timeline, {
            sampleRate: format.sampleRate,
            channelCount: format.channels,
            length: Math.round(timeline.duration * format.sampleRate),
            music: options.music,
            signal,
          })
          return { channels, sampleRate: format.sampleRate }
        },
      })
      return { blob, mimeType, extension: mimeType === 'video/mp4' ? 'mp4' : 'webm', method: 'recorder' }
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw abortError()
    if (error instanceof DrawError) throw error.original
    if (error instanceof MediaError || error instanceof TypeError) throw error
    throw new MediaError('failed', 'The export failed. Try again, or restart Cutline if it keeps happening.', { cause: error })
  } finally {
    source?.input.dispose()
    if (earlyContext) void earlyContext.close().catch(() => {})
  }
}

/**
 * What this browser can do, for the export screen: whether the fast WebCodecs
 * path is available and with which codecs (mediabunny ids, e.g. 'avc' and
 * 'aac' for an MP4 that Photos takes), and what the realtime fallback would
 * record (a MediaRecorder MIME type), or null for none.
 */
export async function exportSupport(): Promise<{ webcodecs: boolean; video: string | null; audio: string | null; recorder: string | null }> {
  const plan = await planEncode({ width: 1080, height: 1920, fps: 30, audio: { sampleRate: 48000, channels: 2 } }).catch(() => null)
  return {
    webcodecs: plan !== null,
    video: plan?.video ?? null,
    audio: plan?.audio ?? null,
    recorder: recorderAvailable() ? recorderMimeType() : null,
  }
}
