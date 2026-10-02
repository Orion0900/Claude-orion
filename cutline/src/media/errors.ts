export type MediaErrorCode =
  /** Not a video or audio file anything here can read. */
  | 'unsupported-file'
  /** A container with no video or audio track in it. */
  | 'no-media'
  /** The browser can't decode the video codec. */
  | 'video-codec'
  /** The browser can't decode the audio codec. */
  | 'audio-codec'
  /** This browser can't make a video at all (no encoder, no recorder). */
  | 'unsupported-browser'
  /** Nothing left after the cuts. */
  | 'empty'
  /** The page went to the background during a realtime export. */
  | 'interrupted'
  /** Anything else that went wrong mid-way. */
  | 'failed'

/** An error whose message can be shown to the person as it is. */
export class MediaError extends Error {
  readonly code: MediaErrorCode

  constructor(code: MediaErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MediaError'
    this.code = code
  }
}

/** The error every cancelled operation rejects with: check `error.name === 'AbortError'`. */
export function abortError(): DOMException {
  return new DOMException('Cancelled.', 'AbortError')
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error || error instanceof DOMException ? error.name === 'AbortError' : false
}

const LABELS: Record<string, string> = {
  avc: 'H.264',
  hevc: 'HEVC (H.265)',
  vp8: 'VP8',
  vp9: 'VP9',
  av1: 'AV1',
  prores: 'ProRes',
  aac: 'AAC',
  opus: 'Opus',
  mp3: 'MP3',
  vorbis: 'Vorbis',
  flac: 'FLAC',
  ac3: 'Dolby Digital',
  eac3: 'Dolby Digital Plus',
  dts: 'DTS',
}

/** A codec id as people know it: 'hevc' → 'HEVC (H.265)'. */
export function codecLabel(codec: string | null | undefined): string {
  if (!codec) return 'this kind of'
  return LABELS[codec] ?? (codec.startsWith('pcm') ? 'uncompressed' : codec.toUpperCase())
}

export function videoCodecError(codec: string | null, cause?: unknown): MediaError {
  const message =
    codec === 'hevc'
      ? "This phone can't decode HEVC video here. Update iOS, or save the clip as Most Compatible (H.264) — for example by exporting it from Photos — and try again."
      : codec === 'prores'
        ? "ProRes clips can't be edited in the browser. Export the clip from Photos first so it's saved as H.264 or HEVC."
        : `This browser can't decode ${codecLabel(codec)} video. Try the clip saved as H.264 (Most Compatible), or open Cutline in Safari.`
  return new MediaError('video-codec', message, { cause })
}

export function audioCodecError(codec: string | null, cause?: unknown): MediaError {
  return new MediaError('audio-codec', `This browser can't decode the ${codecLabel(codec)} audio in this video. Try the clip saved as Most Compatible, or open Cutline in Safari.`, { cause })
}

export function unsupportedFileError(cause?: unknown): MediaError {
  return new MediaError('unsupported-file', "This file isn't a video Cutline can read. Pick a video from your camera roll (MP4 or MOV).", { cause })
}
