import {
  AudioSampleSink,
  BufferTarget,
  Conversion,
  FlacOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  Output,
  WavOutputFormat,
  WebMOutputFormat,
  type AudioSample,
  type Input,
  type InputAudioTrack,
  type OutputFormat,
} from 'mediabunny'
import { abortError, audioCodecError, MediaError, unsupportedFileError } from './errors'
import { downmixToMono, Resampler } from './dsp'
import { decodedAudioReader, type AudioReader, type DecodedAudio } from './mix'
import { openInput } from './probe'

export type { DecodedAudio } from './mix'
export { analyzeLoudness } from './dsp'

/** Decoders need a little audio before a seek point to settle (Opus asks for 80 ms); decoding starts this much early and throws it away. */
const PREROLL = 0.1

/** Copies the part of a decoded sample that overlaps [start, start + frames) into `out`. */
function copySample(sample: AudioSample, out: Float32Array[], start: number, rate: number): void {
  const frames = out[0].length
  const offset = Math.round((sample.timestamp - start) * rate)
  const srcFrom = Math.max(0, -offset)
  const dstFrom = Math.max(0, offset)
  const count = Math.min(sample.numberOfFrames - srcFrom, frames - dstFrom)
  if (count <= 0) return
  for (let c = 0; c < out.length; c++) {
    sample.copyTo(out[c].subarray(dstFrom, dstFrom + count), {
      planeIndex: Math.min(c, sample.numberOfChannels - 1),
      format: 'f32-planar',
      frameOffset: srcFrom,
      frameCount: count,
    })
  }
}

/** Whether WebCodecs (or mediabunny's own PCM decoder) can decode this track. */
export async function canDecodeAudioTrack(track: InputAudioTrack): Promise<boolean> {
  return track.canDecode().catch(() => false)
}

/**
 * The real rate and channel count, from the decoder's first output rather
 * than the container: HE-AAC, for one, can decode at twice the stated rate.
 */
async function decodedFormat(track: InputAudioTrack): Promise<{ sampleRate: number; channelCount: number }> {
  const sink = new AudioSampleSink(track)
  const sample = await sink.getSample(await track.getFirstTimestamp())
  if (!sample) return { sampleRate: await track.getSampleRate(), channelCount: await track.getNumberOfChannels() }
  const format = { sampleRate: sample.sampleRate, channelCount: sample.numberOfChannels }
  sample.close()
  return format
}

/** Reads any span of the track by decoding just that span. */
export async function webCodecsAudioReader(track: InputAudioTrack): Promise<AudioReader> {
  const { sampleRate, channelCount } = await decodedFormat(track)
  const sink = new AudioSampleSink(track)
  return {
    sampleRate,
    channelCount,
    async read(start, frames) {
      const out = Array.from({ length: channelCount }, () => new Float32Array(frames))
      const end = start + frames / sampleRate
      if (frames <= 0) return out
      for await (const sample of sink.samples(Math.max(0, start - PREROLL), end)) {
        try {
          copySample(sample, out, start, sampleRate)
        } finally {
          sample.close()
        }
      }
      return out
    },
  }
}

/** The whole track through WebCodecs, placed on the source clock. */
async function decodeWholeTrack(track: InputAudioTrack, duration: number, signal?: AbortSignal, onProgress?: (fraction: number) => void): Promise<DecodedAudio> {
  const { sampleRate, channelCount } = await decodedFormat(track)
  let channels = Array.from({ length: channelCount }, () => new Float32Array(Math.ceil(duration * sampleRate) + 1))
  let written = 0
  const sink = new AudioSampleSink(track)
  const iterator = sink.samples()
  try {
    for await (const sample of iterator) {
      try {
        signal?.throwIfAborted()
        const end = Math.round((sample.timestamp + sample.duration) * sampleRate)
        if (end > channels[0].length) {
          // Longer than the container said: grow rather than drop the tail.
          channels = channels.map((c) => {
            const grown = new Float32Array(Math.max(end, Math.ceil(c.length * 1.25)))
            grown.set(c)
            return grown
          })
        }
        copySample(sample, channels, 0, sampleRate)
        written = Math.max(written, end)
        onProgress?.(Math.min(1, (sample.timestamp + sample.duration) / duration))
      } finally {
        sample.close()
      }
    }
  } finally {
    await iterator.return(undefined)
  }
  const length = Math.min(written, channels[0].length)
  return { sampleRate, channels: channels.map((c) => (c.length === length ? c : c.slice(0, length))), duration: length / sampleRate }
}

/** A small audio-only file holding just this track's packets, in a container decodeAudioData accepts. */
function formatFor(codec: string | null): OutputFormat {
  switch (codec) {
    case 'mp3':
      return new Mp3OutputFormat()
    case 'opus':
    case 'vorbis':
      return new WebMOutputFormat()
    case 'flac':
      return new FlacOutputFormat()
    default:
      if (codec?.startsWith('pcm') || codec === 'ulaw' || codec === 'alaw') return new WavOutputFormat()
      return new Mp4OutputFormat({ fastStart: 'in-memory' })
  }
}

async function extractAudioTrack(input: Input, track: InputAudioTrack): Promise<ArrayBuffer | null> {
  const output = new Output({ format: formatFor(await track.getCodec()), target: new BufferTarget() })
  const conversion = await Conversion.init({
    input,
    output,
    video: { discard: true },
    audio: (t) => (t.id === track.id ? {} : { discard: true }),
    copy: { mode: 'forced', shiftTolerance: Infinity },
    tags: {},
    showWarnings: false,
  })
  if (!conversion.isValid) return null
  await conversion.execute()
  return output.target.buffer
}

/**
 * Without WebCodecs audio (Safari before 26) or for codecs it lacks, the
 * browser's own decodeAudioData still decodes most audio, but wants a whole
 * file in memory. Rather than read a gigabyte of 4K video for its soundtrack,
 * the audio packets are copied, undecoded, into a small audio-only file first
 * (a few MB for minutes of AAC), and only that is handed over.
 */
async function decodeWithAudioContext(input: Input, track: InputAudioTrack, file: Blob, signal?: AbortSignal): Promise<DecodedAudio> {
  const Context = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null
  const codec = await track.getCodec()
  if (!Context) throw audioCodecError(codec)
  let bytes: ArrayBuffer | null = null
  try {
    bytes = await extractAudioTrack(input, track)
  } catch {
    bytes = null
  }
  signal?.throwIfAborted()
  if (!bytes && file.size <= 100 * 1024 * 1024) bytes = await file.arrayBuffer()
  if (!bytes) throw audioCodecError(codec)
  const sampleRate = await track.getSampleRate()
  const channelCount = Math.max(1, Math.min(2, await track.getNumberOfChannels()))
  let context: OfflineAudioContext
  try {
    context = new Context(channelCount, 1, sampleRate)
  } catch {
    context = new Context(channelCount, 1, 48000)
  }
  let buffer: AudioBuffer
  try {
    buffer = await context.decodeAudioData(bytes)
  } catch (error) {
    throw audioCodecError(codec, error)
  }
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c))
  return { sampleRate: buffer.sampleRate, channels, duration: buffer.length / buffer.sampleRate }
}

/** An AudioReader for the track, by WebCodecs when it can decode it, else from a decodeAudioData of the whole track. */
export async function openAudioReader(input: Input, track: InputAudioTrack, file: Blob, signal?: AbortSignal): Promise<AudioReader> {
  if (await canDecodeAudioTrack(track)) return webCodecsAudioReader(track)
  return decodedAudioReader(await decodeWithAudioContext(input, track, file, signal))
}

/**
 * The whole audio track, decoded, index 0 at source time 0 (so word times
 * from it line up with the video). WebCodecs through mediabunny where it can,
 * else the browser's decodeAudioData. null when there's no audio track.
 */
export async function decodeAudio(file: Blob, options: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}): Promise<DecodedAudio | null> {
  const { signal, onProgress } = options
  signal?.throwIfAborted()
  const input = openInput(file)
  const onAbort = () => input.dispose()
  signal?.addEventListener('abort', onAbort, { once: true })
  try {
    let track: InputAudioTrack | null
    try {
      track = await input.getPrimaryAudioTrack()
    } catch (error) {
      throw unsupportedFileError(error)
    }
    if (!track) return null
    const duration = await input.computeDuration()
    if (await canDecodeAudioTrack(track)) {
      try {
        const decoded = await decodeWholeTrack(track, duration, signal, onProgress)
        onProgress?.(1)
        return decoded
      } catch (error) {
        if (signal?.aborted) throw error
        console.warn('WebCodecs audio decode failed, trying decodeAudioData', error)
      }
    }
    const decoded = await decodeWithAudioContext(input, track, file, signal)
    onProgress?.(1)
    return decoded
  } catch (error) {
    if (signal?.aborted) throw abortError()
    if (error instanceof MediaError) throw error
    throw new MediaError('failed', "The sound in this video couldn't be decoded.", { cause: error })
  } finally {
    signal?.removeEventListener('abort', onAbort)
    input.dispose()
  }
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * Mono at 16 kHz for speech recognition: channels averaged, then a proper
 * low-passed resample (straight decimation would fold everything above
 * 8 kHz back into the speech band). Works in slices so a long clip doesn't
 * freeze the page.
 */
export async function toMono16k(audio: DecodedAudio): Promise<Float32Array> {
  const mono = downmixToMono(audio.channels)
  if (audio.sampleRate === 16000) return mono
  const resampler = new Resampler(audio.sampleRate, 16000)
  const length = resampler.outputLength(mono.length)
  const out = new Float32Array(length)
  const slice = 16000 * 5
  for (let from = 0; from < length; from += slice) {
    const to = Math.min(length, from + slice)
    resampler.process(mono, out.subarray(from, to), from, to)
    if (to < length) await yieldToEventLoop()
  }
  return out
}
