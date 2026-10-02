import { canEncodeAudio, canEncodeVideo, Quality, type AudioCodec, type VideoCodec } from 'mediabunny'

export type Container = 'mp4' | 'webm'

/** What the WebCodecs export will write, settled before anything is decoded. */
export interface EncodePlan {
  container: Container
  mimeType: 'video/mp4' | 'video/webm'
  video: VideoCodec
  videoBitrate: number
  /** Set when we pick the codec string ourselves (H.264 level by frame rate). */
  videoCodecString?: string
  /** null: the output has no audio track. */
  audio: AudioCodec | null
  audioBitrate: number
  sampleRate: number
  channels: number
}

const BITS_PER_PIXEL: Record<VideoCodec, number> = { avc: 0.16, hevc: 0.1, vp9: 0.1, av1: 0.08, vp8: 0.18, prores: 2 }

/**
 * Bits per second for a sharp upload: 1080x1920 at 30 fps comes to ~10 Mbps
 * in H.264, what TikTok and Reels recommend; higher frame rates get more,
 * but less than proportionally, as consecutive frames share more.
 */
export function videoBitrate(codec: VideoCodec, width: number, height: number, fps: number): number {
  const raw = width * height * BITS_PER_PIXEL[codec] * 30 * Math.pow(fps / 30, 0.6)
  return Math.round(Math.min(Math.max(raw, 1_000_000), 24_000_000) / 1000) * 1000
}

// H.264 levels: macroblocks per frame, per second, and bitrate ceilings (Annex A).
const AVC_LEVELS = [
  { level: 0x1e, frame: 1620, rate: 40500, bitrate: 10_000_000 },
  { level: 0x1f, frame: 3600, rate: 108000, bitrate: 14_000_000 },
  { level: 0x20, frame: 5120, rate: 216000, bitrate: 20_000_000 },
  { level: 0x28, frame: 8192, rate: 245760, bitrate: 20_000_000 },
  { level: 0x2a, frame: 8704, rate: 522240, bitrate: 50_000_000 },
  { level: 0x32, frame: 22080, rate: 589824, bitrate: 135_000_000 },
  { level: 0x33, frame: 36864, rate: 983040, bitrate: 240_000_000 },
  { level: 0x34, frame: 36864, rate: 2073600, bitrate: 240_000_000 },
]

/** H.264 profiles to offer an encoder, best first: High, Main, Constrained Baseline. */
const AVC_PROFILES = ['6400', '4d00', '42e0'] as const

/**
 * H.264 codec string with a level that covers the frame rate too: 1080x1920
 * at 60 fps needs level 4.2, where size and bitrate alone say 4.0, and some
 * encoders refuse a level their input exceeds.
 */
export function avcCodecString(width: number, height: number, fps: number, bitrate: number, profile: (typeof AVC_PROFILES)[number] = '6400'): string {
  const frame = Math.ceil(width / 16) * Math.ceil(height / 16)
  const found = AVC_LEVELS.find((l) => frame <= l.frame && frame * fps <= l.rate && bitrate <= l.bitrate) ?? AVC_LEVELS[AVC_LEVELS.length - 1]
  return `avc1.${profile}${found.level.toString(16).padStart(2, '0')}`
}

export function audioBitrate(codec: AudioCodec, channels: number): number {
  if (codec === 'aac') return channels > 1 ? 128_000 : 96_000
  return channels > 1 ? 96_000 : 64_000
}

/** The first sample rate this codec will encode at, starting with the source's own. */
async function encodableRate(codec: AudioCodec, preferred: number, channels: number): Promise<number | null> {
  const rates = codec === 'opus' ? [48000] : [preferred, 48000, 44100]
  for (const sampleRate of [...new Set(rates)]) {
    const ok = await canEncodeAudio(codec, { sampleRate, numberOfChannels: channels, quality: new Quality({ bitrate: audioBitrate(codec, channels) }) }).catch(() => false)
    if (ok) return sampleRate
  }
  return null
}

export interface Candidate {
  container: Container
  video: VideoCodec[]
  audio: AudioCodec
}

// MP4 with H.264 + AAC first: it's what Photos, TikTok and Reels take without
// a second thought. WebM (VP9/VP8 + Opus) for browsers without those encoders.
const CANDIDATES: Candidate[] = [
  { container: 'mp4', video: ['avc'], audio: 'aac' },
  { container: 'webm', video: ['vp9', 'vp8', 'av1'], audio: 'opus' },
  { container: 'mp4', video: ['hevc', 'avc'], audio: 'aac' },
  { container: 'mp4', video: ['avc', 'hevc'], audio: 'opus' },
]

/**
 * Safari, and every browser on iOS (they're all WebKit). The vendor string
 * decides when there is one, since a user-agent override doesn't touch it
 * (test rigs pose Chromium as an iPhone); the user agent only when it's blank.
 */
export function isAppleBrowser(nav: { vendor?: string; userAgent?: string } | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  if (!nav) return false
  if (nav.vendor) return nav.vendor === 'Apple Computer, Inc.'
  const ua = nav.userAgent ?? ''
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Firefox|Edg|Android/.test(ua))
}

/**
 * The pairings worth trying, best first. On Apple browsers only MP4 with AAC
 * (H.264, else HEVC, which mediabunny tags hvc1 as Apple's players want):
 * "Save Video" won't put WebM or Opus into Photos, so there a slower realtime
 * recording (MP4/AAC on Safari) beats a fast file that can't be kept.
 */
export function encodeCandidates(apple: boolean): Candidate[] {
  return apple ? CANDIDATES.filter((c) => c.container === 'mp4' && c.audio === 'aac') : CANDIDATES
}

export function hasWebCodecsEncoders(needAudio: boolean): boolean {
  return typeof VideoEncoder !== 'undefined' && (!needAudio || typeof AudioEncoder !== 'undefined')
}

/** The first container/codec pairing this browser can encode at this size, or null for none (use the recorder). */
export async function planEncode(
  o: { width: number; height: number; fps: number; audio: { sampleRate: number; channels: number } | null },
  apple = isAppleBrowser(),
): Promise<EncodePlan | null> {
  if (!hasWebCodecsEncoders(o.audio !== null)) return null
  const videoOk = new Map<VideoCodec, { bitrate: number; codecString?: string } | null>()
  const tryVideo = async (codec: VideoCodec) => {
    if (!videoOk.has(codec)) {
      const bitrate = videoBitrate(codec, o.width, o.height, o.fps)
      const strings = codec === 'avc' ? AVC_PROFILES.map((p) => avcCodecString(o.width, o.height, o.fps, bitrate, p)) : [undefined]
      let found: { bitrate: number; codecString?: string } | null = null
      for (const codecString of strings) {
        const options = { width: o.width, height: o.height, frameRate: o.fps, quality: new Quality({ bitrate }), fullCodecString: codecString }
        if (await canEncodeVideo(codec, options).catch(() => false)) {
          found = { bitrate, codecString }
          break
        }
      }
      videoOk.set(codec, found)
    }
    return videoOk.get(codec) ?? null
  }

  for (const candidate of encodeCandidates(apple)) {
    let audio: { codec: AudioCodec; sampleRate: number } | null = null
    if (o.audio) {
      const sampleRate = await encodableRate(candidate.audio, o.audio.sampleRate, o.audio.channels)
      if (sampleRate === null) continue
      audio = { codec: candidate.audio, sampleRate }
    }
    for (const codec of candidate.video) {
      const video = await tryVideo(codec)
      if (!video) continue
      return {
        container: candidate.container,
        mimeType: candidate.container === 'mp4' ? 'video/mp4' : 'video/webm',
        video: codec,
        videoBitrate: video.bitrate,
        videoCodecString: video.codecString,
        audio: audio?.codec ?? null,
        audioBitrate: audio ? audioBitrate(audio.codec, o.audio!.channels) : 0,
        sampleRate: audio?.sampleRate ?? 0,
        channels: o.audio?.channels ?? 0,
      }
    }
  }
  return null
}
