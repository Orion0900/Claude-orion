import { ALL_FORMATS, BlobSource, CanvasSink, Input, UnsupportedInputFormatError, type InputTrack, type InputVideoTrack } from 'mediabunny'
import type { MediaInfo } from '../lib/types'
import { MediaError, unsupportedFileError } from './errors'

export function openInput(file: Blob): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
}

/** A codec id ('avc', 'hevc', 'aac'…), or the container's own name for one mediabunny doesn't know. */
export async function trackCodec(track: InputTrack): Promise<string | null> {
  const codec = await track.getCodec()
  if (codec) return codec
  const internal = await track.getInternalCodecId().catch(() => null)
  return typeof internal === 'string' || typeof internal === 'number' ? String(internal) : null
}

async function frameRate(track: InputVideoTrack): Promise<number | null> {
  try {
    const metrics = await track.computeFrameRateMetrics({ targetPacketCount: 120 })
    return Math.round(metrics.bestGuessFrameRate * 100) / 100
  } catch {
    try {
      const stats = await track.computePacketStats(120)
      return stats.averagePacketRate > 0 ? Math.round(stats.averagePacketRate * 100) / 100 : null
    } catch {
      return null
    }
  }
}

/**
 * What the file is. Only the container's index and a few packet headers are
 * read, never the media itself, so a 4K clip probes as fast as a small one.
 * Audio-only files are accepted, with a 0x0 picture.
 *
 * Throws a MediaError with a user-facing message for files that aren't a
 * readable video.
 */
export async function probeMedia(file: Blob, fileName?: string): Promise<MediaInfo> {
  const input = openInput(file)
  try {
    let format
    try {
      format = await input.getFormat()
    } catch (error) {
      if (error instanceof UnsupportedInputFormatError) throw unsupportedFileError(error)
      throw new MediaError('unsupported-file', "This video couldn't be read. It may be damaged, or still downloading from iCloud.", { cause: error })
    }
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()])
    if (!video && !audio) throw new MediaError('no-media', "This file doesn't have any video or sound in it.")

    const duration = await input.computeDuration()
    if (!(duration > 0)) throw new MediaError('no-media', 'This video is empty.')
    return {
      fileName: fileName ?? (typeof File !== 'undefined' && file instanceof File ? file.name : 'video'),
      mimeType: format.mimeType || file.type || 'application/octet-stream',
      size: file.size,
      duration,
      width: video ? await video.getDisplayWidth() : 0,
      height: video ? await video.getDisplayHeight() : 0,
      frameRate: video ? await frameRate(video) : null,
      hasAudio: audio !== null,
      videoCodec: video ? await trackCodec(video) : null,
      audioCodec: audio ? await trackCodec(audio) : null,
    }
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError('unsupported-file', "This video couldn't be read. It may be damaged, or still downloading from iCloud.", { cause: error })
  } finally {
    input.dispose()
  }
}

/** A JPEG data URL of a canvas, from either kind of canvas. */
export async function canvasToJpeg(canvas: HTMLCanvasElement | OffscreenCanvas, quality = 0.8): Promise<string> {
  if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) return canvas.toDataURL('image/jpeg', quality)
  const blob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Fits w×h inside a max×max box, never enlarging, with even sides. */
function fitInside(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(2, Math.round((width * scale) / 2) * 2), height: Math.max(2, Math.round((height * scale) / 2) * 2) }
}

/**
 * A small JPEG data URL of the frame at `atSeconds` (default: half a second
 * in, past the moment the phone was still being steadied), for the project
 * list. Decodes one frame with WebCodecs, or with a hidden <video> where
 * WebCodecs can't; null when neither can decode it.
 */
export async function makeThumbnail(file: Blob, atSeconds?: number, maxSize = 320): Promise<string | null> {
  const input = openInput(file)
  try {
    const track = await input.getPrimaryVideoTrack()
    if (!track) return null
    const first = await track.getFirstTimestamp()
    const end = await track.computeDuration()
    const at = Math.min(Math.max(atSeconds ?? Math.min(0.5, (end - first) / 2), first), Math.max(first, end - 0.001))
    if (await track.canDecode()) {
      const size = fitInside(await track.getDisplayWidth(), await track.getDisplayHeight(), maxSize)
      const sink = new CanvasSink(track, { ...size, fit: 'fill' })
      const wrapped = (await sink.getCanvas(at)) ?? (await sink.getCanvas(first))
      if (wrapped) return await canvasToJpeg(wrapped.canvas)
    }
  } catch {
    // Fall through to the <video> element.
  } finally {
    input.dispose()
  }
  return videoElementThumbnail(file, atSeconds ?? 0.5, maxSize)
}

/** The same through a hidden <video>, for browsers whose WebCodecs can't decode the clip but whose player can. */
async function videoElementThumbnail(file: Blob, at: number, maxSize: number): Promise<string | null> {
  if (typeof document === 'undefined') return null
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    const ready = new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('unplayable'))
    })
    video.src = url
    await withTimeout(ready, 8000)
    if (!video.videoWidth || !video.videoHeight) return null
    const seeked = new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve()
      video.onerror = () => reject(new Error('unplayable'))
    })
    video.currentTime = Math.min(at, Math.max(0, (video.duration || at) - 0.05))
    await withTimeout(seeked, 8000)
    const size = fitInside(video.videoWidth, video.videoHeight, maxSize)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(video, 0, 0, size.width, size.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } catch {
    return null
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}
