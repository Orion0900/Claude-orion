import { Conversion, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from 'mediabunny'
import { ChunkCollector } from './collector'
import { abortError, MediaError, videoCodecError } from './errors'
import { openInput, withTimeout } from './probe'
import type { Timeline } from './ranges'

type Size = { width: number; height: number }

export interface Soundtrack {
  channels: Float32Array[]
  sampleRate: number
}

export interface RecordJob {
  source: Blob
  timeline: Timeline
  width: number
  height: number
  fps: number
  videoBitrate: number
  hasVideo: boolean
  videoCodec: string | null
  /** The finished soundtrack (cut, crossfaded, music mixed), made once the picture is known to play; null for a silent video. */
  soundtrack: () => Promise<Soundtrack | null>
  /** Made before the export's first await, while the tap that started it still counts as a user gesture. */
  audioContext: AudioContext | null
  paint: (ctx: CanvasRenderingContext2D, frame: CanvasImageSource | null, frameSize: Size, editedTime: number) => void
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

const MP4_TYPES = ['video/mp4;codecs="avc1.640028,mp4a.40.2"', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4']
const WEBM_TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']

export function recorderAvailable(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype &&
    typeof AudioContext !== 'undefined'
  )
}

/**
 * The MediaRecorder type to record with. MP4 when the browser plays H.264
 * (Safari, Chrome with its proprietary codecs), since its MP4 recorder then
 * writes H.264/AAC that Photos and TikTok take; otherwise WebM, because
 * Chromium builds without H.264 still claim "video/mp4" and fill it with VP9.
 */
export function recorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') return null
  const h264 = document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"') !== ''
  const order = h264 ? [...MP4_TYPES, ...WEBM_TYPES] : [...WEBM_TYPES, ...MP4_TYPES]
  return order.find((type) => MediaRecorder.isTypeSupported(type)) ?? null
}

/**
 * An AudioContext started inside the tap that began the export. iOS only lets
 * audio run once the page has had a tap, and by the time the recorder needs
 * it the tap is long gone; one made and resumed synchronously here carries
 * it through.
 */
export function createExportAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  try {
    const context = new AudioContext()
    void context.resume().catch(() => {})
    return context
  } catch {
    return null
  }
}

function once(target: EventTarget, event: string): Promise<Event> {
  return new Promise((resolve) => target.addEventListener(event, resolve, { once: true }))
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** requestVideoFrameCallback arrived in Safari 15.4; typed as always there, so checked by hand. */
const hasFrameCallbacks = (video: HTMLVideoElement) => typeof (video as Partial<HTMLVideoElement>).requestVideoFrameCallback === 'function'

/** A muted, inline, invisible <video>, loaded. Muted so it may play without a fresh tap; its sound isn't used. */
async function openVideo(source: Blob, codec: string | null, cleanup: (() => void)[]): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(source)
  const video = document.createElement('video')
  video.muted = true
  video.defaultMuted = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.preload = 'auto'
  // In the document but out of sight: some browsers stop decoding detached or display:none videos.
  Object.assign(video.style, { position: 'fixed', left: '0', top: '0', width: '2px', height: '2px', opacity: '0', pointerEvents: 'none', zIndex: '-1' })
  document.body.appendChild(video)
  cleanup.push(() => {
    video.pause()
    video.removeAttribute('src')
    video.load()
    video.remove()
    URL.revokeObjectURL(url)
  })
  const loaded = Promise.race([
    once(video, 'loadeddata'),
    once(video, 'error').then(() => {
      throw videoCodecError(codec, video.error)
    }),
  ])
  video.src = url
  video.load()
  try {
    await withTimeout(loaded, 20000)
  } catch (error) {
    throw error instanceof MediaError ? error : videoCodecError(codec, error)
  }
  if (!video.videoWidth) throw videoCodecError(codec)
  return video
}

/** Seconds of cut material played, unrecorded, ahead of each span. */
const PREROLL = 0.25

/**
 * Resolves with the media time of the first frame presented at or after
 * `target` (by requestVideoFrameCallback where there is one, else by polling
 * currentTime each animation frame), or wherever playback ended.
 */
function untilMediaTime(video: HTMLVideoElement, target: number, halted: () => boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + (Math.max(0, target - video.currentTime) + 5) * 1000
    const step = (mediaTime: number) => {
      if (halted()) return
      if (mediaTime >= target || video.ended) return resolve(mediaTime)
      if (performance.now() > deadline) return reject(new MediaError('failed', 'The video stopped playing during the export. Try again.'))
      wait()
    }
    const wait = () => {
      if (hasFrameCallbacks(video)) video.requestVideoFrameCallback((_, meta) => step(meta.mediaTime))
      else requestAnimationFrame(() => step(video.currentTime))
    }
    wait()
  })
}

async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) > 0.0005 || video.seeking) {
    const seeked = once(video, 'seeked')
    video.currentTime = time
    await withTimeout(seeked, 15000)
  }
  // The picture after a seek can land a beat after 'seeked'; wait for it where we can tell.
  if (hasFrameCallbacks(video)) {
    await Promise.race([new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve())), sleep(250)])
  }
}

/**
 * Plays the kept spans in a hidden <video> and records the canvas the
 * composition is drawn on, at playback speed. For browsers without WebCodecs
 * encoders (iOS before 26), or when they fail.
 *
 * Each span: seek (recorder paused, so the jump isn't recorded), draw its
 * first frame, play, resume the recorder and start that span of the
 * pre-mixed soundtrack together, draw every new video frame, and pause it
 * all when the span's length has played on the audio clock.
 */
export async function recordExport(job: RecordJob): Promise<{ blob: Blob; mimeType: 'video/mp4' | 'video/webm' }> {
  const mimeType = recorderMimeType()
  if (!recorderAvailable() || !mimeType) {
    throw new MediaError('unsupported-browser', "This browser can't make videos. Update to the latest iOS, or open Cutline in Safari or Chrome.")
  }
  const { timeline, fps, signal } = job
  const cleanup: (() => void)[] = []
  let halted = false
  let stop: (reason: unknown) => void = () => {}
  const stopped = new Promise<never>((_, reject) => {
    stop = (reason) => {
      halted = true
      reject(reason)
    }
  })
  stopped.catch(() => {})
  const guard = <T>(promise: Promise<T>) => Promise.race([promise, stopped])

  const onAbort = () => stop(abortError())
  signal?.addEventListener('abort', onAbort, { once: true })
  cleanup.push(() => signal?.removeEventListener('abort', onAbort))
  const onVisibility = () => {
    if (document.hidden) stop(new MediaError('interrupted', 'The export stopped because Cutline left the screen. Keep it open until the export finishes.'))
  }
  document.addEventListener('visibilitychange', onVisibility)
  cleanup.push(() => document.removeEventListener('visibilitychange', onVisibility))

  let context = job.audioContext
  try {
    signal?.throwIfAborted()
    const video = job.hasVideo ? await guard(openVideo(job.source, job.videoCodec, cleanup)) : null
    const soundtrack = await guard(job.soundtrack())

    // Sound: the soundtrack, one span at a time, into a stream the recorder takes.
    let buffer: AudioBuffer | null = null
    let destination: MediaStreamAudioDestinationNode | null = null
    if (soundtrack && soundtrack.channels[0]?.length) {
      if (!context) context = new AudioContext()
      if (context.state !== 'running') await guard(withTimeout(context.resume(), 3000).catch(() => {}))
      if (context.state !== 'running') {
        throw new MediaError('failed', "The browser didn't allow sound for the export. Tap Export again and keep Cutline on screen while it runs.")
      }
      buffer = context.createBuffer(soundtrack.channels.length, soundtrack.channels[0].length, soundtrack.sampleRate)
      soundtrack.channels.forEach((channel, c) => buffer!.getChannelData(c).set(channel))
      destination = context.createMediaStreamDestination()
    }
    const audioClock = buffer && context ? context : null
    const now = () => (audioClock ? audioClock.currentTime : performance.now() / 1000)

    const canvas = document.createElement('canvas')
    canvas.width = job.width
    canvas.height = job.height
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) throw new MediaError('failed', "The export couldn't start: the browser refused a drawing canvas.")
    const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...(destination?.stream.getAudioTracks() ?? [])])
    cleanup.push(() => stream.getTracks().forEach((track) => track.stop()))
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: job.videoBitrate, audioBitsPerSecond: 128_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = (event) => stop(new MediaError('failed', 'Recording the export failed.', { cause: event }))
    cleanup.push(() => {
      if (recorder.state !== 'inactive') recorder.stop()
    })

    const frameSize = video ? { width: video.videoWidth, height: video.videoHeight } : { width: 0, height: 0 }
    const paint = (editedTime: number) => job.paint(ctx, video, frameSize, editedTime)
    const total = timeline.duration

    for (const seg of timeline.segments) {
      const length = seg.end - seg.start
      // How far into the span recording picks up: 0, or as close as playback allows.
      let into = 0
      if (video) {
        // Play into the span from a moment before it (unrecorded), so playback is already
        // running smoothly when its first frame comes up, and start recording on that frame.
        await guard(seekTo(video, Math.max(0, seg.start - PREROLL)))
        await guard(video.play())
        const reached = await guard(untilMediaTime(video, seg.start - 0.5 / 30, () => halted))
        into = Math.min(Math.max(reached - seg.start, 0), length)
      }
      if (length - into < 0.001) {
        video?.pause()
        continue
      }
      paint(seg.offset + into)
      const node = buffer && context && destination ? context.createBufferSource() : null
      const startedAt = now()
      if (node && destination) {
        node.buffer = buffer
        node.connect(destination)
        node.start(0, seg.offset + into, length - into)
      }
      if (recorder.state === 'inactive') recorder.start(1000)
      else recorder.resume()
      const span = length - into

      await guard(
        new Promise<void>((resolve, reject) => {
          let finished = false
          let timer = 0
          const finish = () => {
            if (finished) return
            finished = true
            clearTimeout(timer)
            recorder.pause()
            video?.pause()
            node?.stop()
            resolve()
          }
          const elapsed = () => now() - startedAt
          const frame = (mediaTime?: number) => {
            if (finished || halted) return
            try {
              const played = elapsed()
              if (played >= span) return finish()
              const local = video ? Math.min(Math.max((mediaTime ?? video.currentTime) - seg.start, into), length) : into + played
              paint(seg.offset + local)
              job.onProgress?.(Math.min(1, (seg.offset + local) / total))
              // A stalled decoder leaves the picture behind the sound; jump it back in step.
              if (video && played - (local - into) > 0.15) video.currentTime = seg.start + into + played
              next()
            } catch (error) {
              finished = true
              reject(error)
            }
          }
          const next = () => {
            if (video && hasFrameCallbacks(video)) video.requestVideoFrameCallback((_, meta) => frame(meta.mediaTime))
            else requestAnimationFrame(() => frame())
          }
          // The span ends on the audio clock even if no new frame comes (the clip ran out).
          const check = () => {
            if (finished || halted) return
            const left = span - elapsed()
            if (left <= 0.002) finish()
            else timer = window.setTimeout(check, Math.max(1, left * 1000))
          }
          timer = window.setTimeout(check, span * 1000)
          next()
        }),
      )
    }

    const ended = once(recorder, 'stop')
    recorder.stop()
    await guard(withTimeout(ended, 15000))
    job.onProgress?.(1)
    const container = recorder.mimeType.includes('mp4') || mimeType.includes('mp4') ? 'video/mp4' : 'video/webm'
    const raw = new Blob(chunks, { type: container })
    return { blob: await tidyRecording(raw, container), mimeType: container }
  } catch (error) {
    if (signal?.aborted) throw abortError()
    throw error
  } finally {
    halted = true
    for (const fn of cleanup.reverse()) {
      try {
        fn()
      } catch {
        // Keep cleaning up.
      }
    }
    if (context && context !== job.audioContext) void context.close().catch(() => {})
  }
}

/**
 * Recorders write files for streaming, not keeping: Chrome's WebM has no
 * duration or seek index, Safari's MP4 is fragmented. Copying the packets
 * (no re-encoding) into a fresh file fixes both. Best effort: on any doubt
 * the recording is returned as it came.
 */
async function tidyRecording(blob: Blob, type: 'video/mp4' | 'video/webm'): Promise<Blob> {
  const input = openInput(blob)
  try {
    const mp4 = type === 'video/mp4'
    const collector = new ChunkCollector(mp4)
    const output = new Output({
      format: mp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target: new StreamTarget(collector.writable),
    })
    const conversion = await Conversion.init({ input, output, copy: { mode: 'forced' }, showWarnings: false })
    if (!conversion.isValid || conversion.discardedTracks.length > 0) return blob
    await conversion.execute()
    const tidy = collector.toBlob(type)
    return tidy.size > 0 ? tidy : blob
  } catch (error) {
    console.warn('Kept the recording as recorded; tidying it failed', error)
    return blob
  } finally {
    input.dispose()
  }
}
