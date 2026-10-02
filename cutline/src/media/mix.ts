import type { Seconds } from '../lib/types'
import { addSegment, downmixToMono, duckingGains, fadeEdges, mixMusic, remixChannels, Resampler, rmsEnvelope, softLimit } from './dsp'
import type { Timeline } from './ranges'

/** Decoded audio: one Float32Array per channel, index 0 at source time 0. */
export interface DecodedAudio {
  sampleRate: number
  channels: Float32Array[]
  duration: Seconds
}

/** Random access to a source's audio. */
export interface AudioReader {
  sampleRate: number
  channelCount: number
  /** `frames` samples per channel from source time `start`; silence wherever the recording has none. */
  read(start: Seconds, frames: number): Promise<Float32Array[]>
}

/** A reader over audio that's already decoded in memory. */
export function decodedAudioReader(audio: DecodedAudio): AudioReader {
  return {
    sampleRate: audio.sampleRate,
    channelCount: audio.channels.length,
    async read(start, frames) {
      const first = Math.round(start * audio.sampleRate)
      return audio.channels.map((channel) => {
        const out = new Float32Array(frames)
        const from = Math.max(0, first)
        const to = Math.min(channel.length, first + frames)
        if (to > from) out.set(channel.subarray(from, to), from - first)
        return out
      })
    },
  }
}

export interface RenderOptions {
  sampleRate: number
  channelCount: number
  /** Output length in samples (the video's frames/fps, so audio and video end together). */
  length: number
  music?: { audio: DecodedAudio; volume: number; ducking: boolean } | null
  /** Join crossfade, seconds. */
  crossfade?: Seconds
  signal?: AbortSignal
  onProgress?: (fraction: number) => void
}

/**
 * The finished video's soundtrack: each kept span of the source, back to back,
 * crossfaded over ~10 ms at every join (5 ms either side of the cut, read from
 * the source past the cut) so nothing clicks, faded at the very ends, with
 * optional music looped underneath and ducked under the speech.
 */
export async function renderEditedAudio(reader: AudioReader | null, timeline: Timeline, options: RenderOptions): Promise<Float32Array[]> {
  const { sampleRate: rate, channelCount, length, signal } = options
  const out = Array.from({ length: channelCount }, () => new Float32Array(length))
  const half = Math.max(1, Math.round(((options.crossfade ?? 0.01) / 2) * rate))
  const segments = timeline.segments

  if (reader) {
    const resampler = reader.sampleRate !== rate ? new Resampler(reader.sampleRate, rate) : null
    for (let i = 0; i < segments.length; i++) {
      signal?.throwIfAborted()
      const seg = segments[i]
      const first = i === 0
      const last = i === segments.length - 1
      // Output sample span this segment covers, including its share of each crossfade.
      const from = first ? 0 : Math.round(seg.offset * rate) - half
      const to = last ? length : Math.round((seg.offset + seg.end - seg.start) * rate) + half
      if (to <= from) continue
      const frames = to - from
      // Source time of the segment's first output sample.
      const start = seg.start + (from / rate - seg.offset)
      let data: Float32Array[]
      if (resampler) {
        // Read a little extra either side so the filter has real signal at the edges.
        const pad = 64
        const sourceFrames = Math.ceil((frames * reader.sampleRate) / rate) + pad * 2
        const raw = await reader.read(start - pad / reader.sampleRate, sourceFrames)
        const skip = Math.round((pad * rate) / reader.sampleRate)
        data = raw.map((channel) => resampler.process(channel, new Float32Array(frames), skip, skip + frames))
      } else {
        data = await reader.read(start, frames)
      }
      addSegment(out, remixChannels(data, channelCount), from, first ? 0 : half * 2, last ? 0 : half * 2)
      options.onProgress?.((i + 1) / segments.length)
    }
    fadeEdges(out, half, half)
  }

  const music = options.music
  if (music && music.volume > 0 && music.audio.channels.length > 0) {
    signal?.throwIfAborted()
    const frameLength = Math.max(1, Math.round(0.01 * rate))
    const ducking = music.ducking && reader ? duckingGains(rmsEnvelope(downmixToMono(out), rate, 0.01), frameLength / rate) : null
    mixMusic(out, {
      channels: musicAtRate(music.audio, rate, length),
      volume: music.volume,
      ducking,
      frameLength,
      seamFade: Math.round(0.02 * rate),
      endFade: Math.round(Math.min(0.5, length / rate / 4) * rate),
    })
    softLimit(out)
  }
  return out
}

/** The music at the output rate, resampling only as much as the video needs when it's longer than that. */
function musicAtRate(audio: DecodedAudio, rate: number, length: number): Float32Array[] {
  if (audio.sampleRate === rate) return audio.channels
  const resampler = new Resampler(audio.sampleRate, rate)
  const full = resampler.outputLength(audio.channels[0].length)
  const needed = Math.min(full, length)
  return audio.channels.map((channel) => resampler.process(channel, new Float32Array(needed), 0, needed))
}
