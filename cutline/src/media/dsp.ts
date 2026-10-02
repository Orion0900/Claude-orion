import type { AudioAnalysis } from '../lib/types'

/* ---------- Loudness ---------- */

/** Plain RMS of each frame of `frameDuration` seconds; the last frame may be short. */
export function rmsEnvelope(samples: Float32Array, sampleRate: number, frameDuration = 0.01): Float32Array {
  const frameLength = Math.max(1, Math.round(frameDuration * sampleRate))
  const frames = Math.ceil(samples.length / frameLength)
  const out = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    const from = f * frameLength
    const to = Math.min(samples.length, from + frameLength)
    let sum = 0
    for (let i = from; i < to; i++) sum += samples[i] * samples[i]
    out[f] = Math.sqrt(sum / (to - from))
  }
  return out
}

/** The value below which `fraction` of the values lie. */
export function percentile(values: ArrayLike<number>, fraction: number): number {
  if (values.length === 0) return 0
  const sorted = Float32Array.from(values).sort()
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))))
  return sorted[index]
}

/**
 * RMS loudness per frame, scaled so the loud parts of speech sit near 1 and
 * silence near 0, whatever the recording level. The reference is the 99th
 * percentile frame (one pop or bump can't squash everything else) but never
 * under half the peak, and never below -60 dBFS, so a silent or empty track
 * stays near 0 rather than having its hiss blown up to full scale.
 */
export function analyzeLoudness(samples: Float32Array, sampleRate: number, frameDuration = 0.01): AudioAnalysis {
  const envelope = rmsEnvelope(samples, sampleRate, frameDuration)
  let peak = 0
  for (const v of envelope) peak = Math.max(peak, v)
  const reference = Math.max(percentile(envelope, 0.99), peak * 0.5, 1e-3)
  for (let i = 0; i < envelope.length; i++) envelope[i] = Math.min(1, envelope[i] / reference)
  const frameLength = Math.max(1, Math.round(frameDuration * sampleRate))
  return { envelope, frameDuration: frameLength / sampleRate }
}

/* ---------- Channels ---------- */

export function downmixToMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice()
  const length = channels.reduce((n, c) => Math.max(n, c.length), 0)
  const out = new Float32Array(length)
  const scale = 1 / channels.length
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) out[i] += channel[i] * scale
  }
  return out
}

/**
 * Up- or downmixes to `count` channels. Mono spreads to every channel; more
 * channels than wanted fold together by position (even ones left, odd ones
 * right), which is right for stereo pairs and good enough for anything else.
 */
export function remixChannels(channels: readonly Float32Array[], count: number): Float32Array[] {
  if (channels.length === count) return [...channels]
  if (channels.length === 1) return Array.from({ length: count }, () => channels[0])
  if (count === 1) return [downmixToMono(channels)]
  const length = channels[0].length
  const out = Array.from({ length: count }, () => new Float32Array(length))
  const used = new Array<number>(count).fill(0)
  channels.forEach((channel, i) => {
    const target = out[i % count]
    used[i % count]++
    for (let n = 0; n < length; n++) target[n] += channel[n]
  })
  out.forEach((target, i) => {
    if (used[i] > 1) for (let n = 0; n < length; n++) target[n] /= used[i]
  })
  return out
}

/* ---------- Resampling ---------- */

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** Modified Bessel function of the first kind, order 0, for the Kaiser window. */
function besselI0(x: number): number {
  let sum = 1
  let term = 1
  const half = x / 2
  for (let k = 1; k < 32; k++) {
    term *= (half / k) * (half / k)
    sum += term
    if (term < sum * 1e-12) break
  }
  return sum
}

/**
 * A windowed-sinc polyphase resampler. Each output sample is a weighted sum of
 * the input around its position, low-passed below the lower of the two
 * Nyquist rates so downsampling (48 kHz speech to Whisper's 16 kHz) doesn't
 * alias. Phase tables are exact for the usual rate pairs (48k/44.1k/16k all
 * reduce to a few hundred phases) and nearest-of-1024 otherwise.
 */
export class Resampler {
  readonly fromRate: number
  readonly toRate: number
  private readonly up: number
  private readonly down: number
  private readonly phases: number
  private readonly taps: number
  private readonly half: number
  private readonly table: Float32Array

  constructor(fromRate: number, toRate: number, zeroCrossings = 12) {
    this.fromRate = Math.round(fromRate)
    this.toRate = Math.round(toRate)
    const g = gcd(this.fromRate, this.toRate)
    this.up = this.toRate / g
    this.down = this.fromRate / g
    this.phases = Math.min(this.up, 1024)
    // Cutoff in cycles per input sample, a little inside Nyquist for the transition band.
    const cutoff = 0.5 * Math.min(1, this.toRate / this.fromRate) * 0.91
    const width = zeroCrossings / (2 * cutoff)
    this.half = Math.ceil(width)
    this.taps = this.half * 2
    this.table = new Float32Array(this.phases * this.taps)
    const beta = 8
    const norm = besselI0(beta)
    for (let p = 0; p < this.phases; p++) {
      const frac = p / this.phases
      let sum = 0
      for (let m = 0; m < this.taps; m++) {
        const x = m - this.half + 1 - frac
        const r = x / width
        const window = Math.abs(r) >= 1 ? 0 : besselI0(beta * Math.sqrt(1 - r * r)) / norm
        const arg = 2 * cutoff * x
        const sinc = arg === 0 ? 1 : Math.sin(Math.PI * arg) / (Math.PI * arg)
        const w = 2 * cutoff * sinc * window
        this.table[p * this.taps + m] = w
        sum += w
      }
      // Unity gain at DC for every phase, so a constant stays exactly constant.
      for (let m = 0; m < this.taps; m++) this.table[p * this.taps + m] /= sum
    }
  }

  /** Output length for an input of `inputLength` samples. */
  outputLength(inputLength: number): number {
    return Math.round((inputLength * this.toRate) / this.fromRate)
  }

  /** Writes output samples [from, to) of the resampled `input` into `out` starting at out[0]. Samples outside the input count as silence. */
  process(input: Float32Array, out: Float32Array, from = 0, to = this.outputLength(input.length)): Float32Array {
    const { up, down, phases, taps, half, table } = this
    const exact = phases === up
    const last = input.length - 1
    for (let j = from; j < to; j++) {
      let base: number
      let phase: number
      if (exact) {
        const pos = j * down
        base = Math.floor(pos / up)
        phase = pos - base * up
      } else {
        const pos = (j * down) / up
        base = Math.floor(pos)
        phase = Math.round((pos - base) * phases)
        if (phase === phases) {
          base++
          phase = 0
        }
      }
      const start = base - half + 1
      const row = phase * taps
      let acc = 0
      if (start >= 0 && start + taps - 1 <= last) {
        for (let m = 0; m < taps; m++) acc += input[start + m] * table[row + m]
      } else {
        for (let m = 0; m < taps; m++) {
          const n = start + m
          if (n >= 0 && n <= last) acc += input[n] * table[row + m]
        }
      }
      out[j - from] = acc
    }
    return out
  }
}

export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (Math.round(fromRate) === Math.round(toRate)) return input.slice()
  const resampler = new Resampler(fromRate, toRate)
  const length = resampler.outputLength(input.length)
  return resampler.process(input, new Float32Array(length), 0, length)
}

/* ---------- Joins and fades ---------- */

/** Rising half of a raised cosine: 0 at the start of a fade of `length` samples, 1 at its end. Sample-centred so a rising and a falling edge over the same samples sum to exactly 1. */
export function fadeInGain(index: number, length: number): number {
  return 0.5 - 0.5 * Math.cos((Math.PI * (index + 0.5)) / length)
}

/**
 * Adds a segment into `out` with its first sample at output index `at` (may be
 * negative: the part before 0 is dropped). `fadeIn`/`fadeOut` are raised-cosine
 * edges in samples; a neighbour's opposite edge over the same samples makes an
 * equal-gain crossfade, which also reproduces a continuous signal exactly.
 */
export function addSegment(out: Float32Array[], segment: readonly Float32Array[], at: number, fadeIn = 0, fadeOut = 0): void {
  const length = segment[0]?.length ?? 0
  const outLength = out[0]?.length ?? 0
  const from = Math.max(0, -at)
  const to = Math.min(length, outLength - at)
  for (let c = 0; c < out.length; c++) {
    const src = segment[Math.min(c, segment.length - 1)]
    const dst = out[c]
    for (let i = from; i < to; i++) {
      let g = 1
      if (i < fadeIn) g = fadeInGain(i, fadeIn)
      const fromEnd = length - 1 - i
      if (fromEnd < fadeOut) g *= fadeInGain(fromEnd, fadeOut)
      dst[at + i] += src[i] * g
    }
  }
}

/** Short fades at the very start and end, so a cut that lands mid-sound doesn't click. */
export function fadeEdges(channels: Float32Array[], fadeIn: number, fadeOut: number): void {
  for (const channel of channels) {
    const n = channel.length
    for (let i = 0; i < Math.min(fadeIn, n); i++) channel[i] *= fadeInGain(i, fadeIn)
    for (let i = 0; i < Math.min(fadeOut, n); i++) channel[n - 1 - i] *= fadeInGain(i, fadeOut)
  }
}

/* ---------- Music ---------- */

export interface DuckingOptions {
  /** Music gain while speech is loud. */
  level?: number
  /** Seconds to settle down when speech starts. */
  attack?: number
  /** Seconds to come back up when it stops. */
  release?: number
  /** Seconds the duck starts ahead of the speech, so the first word isn't fighting the music. */
  lookahead?: number
}

/**
 * Music gain per envelope frame, 1 = untouched, `level` = ducked under speech.
 * "Speech is loud" is judged against this recording's own speech level (its
 * 90th-percentile frame), so a quiet recording ducks as well as a loud one;
 * frames from 18 dB under that level fade the duck in over 8 dB, and nothing
 * under -50 dBFS counts. Then it's smoothed with a one-pole attack/release
 * after a lookahead minimum, so the music dips just before a phrase and
 * swells back gently after it.
 */
export function duckingGains(envelope: Float32Array, frameDuration: number, options: DuckingOptions = {}): Float32Array {
  const { level = 0.25, attack = 0.08, release = 0.3, lookahead = 0.08 } = options
  const n = envelope.length
  const toDb = (v: number) => 20 * Math.log10(Math.max(v, 1e-9))
  const speechDb = toDb(percentile(envelope, 0.9))
  const full = Math.max(speechDb - 18, -50)
  const onset = full - 8
  const target = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const amount = Math.min(1, Math.max(0, (toDb(envelope[i]) - onset) / (full - onset)))
    target[i] = 1 - (1 - level) * amount
  }
  const ahead = Math.max(0, Math.round(lookahead / frameDuration))
  const gains = new Float32Array(n)
  const attackK = 1 - Math.exp(-frameDuration / attack)
  const releaseK = 1 - Math.exp(-frameDuration / release)
  let g = 1
  for (let i = 0; i < n; i++) {
    let want = target[i]
    for (let j = i + 1; j <= Math.min(n - 1, i + ahead); j++) want = Math.min(want, target[j])
    g += (want - g) * (want < g ? attackK : releaseK)
    gains[i] = g
  }
  return gains
}

export interface MusicMix {
  /** At the output's rate, any channel count. */
  channels: readonly Float32Array[]
  volume: number
  /** Per-frame gains from duckingGains, or null for none. */
  ducking: Float32Array | null
  /** Samples per ducking frame. */
  frameLength: number
  /** Raised-cosine edges in samples: at loop seams, and the fade-out at the end. */
  seamFade: number
  endFade: number
}

/** Adds looped music under whatever `out` already holds. */
export function mixMusic(out: Float32Array[], music: MusicMix): void {
  const length = out[0]?.length ?? 0
  const musicLength = music.channels[0]?.length ?? 0
  if (length === 0 || musicLength === 0) return
  const loops = musicLength < length
  const seam = Math.min(music.seamFade, Math.floor(musicLength / 4))
  const endFade = Math.min(music.endFade, length)
  const { ducking, frameLength } = music
  for (let c = 0; c < out.length; c++) {
    const src = music.channels[Math.min(c, music.channels.length - 1)]
    const dst = out[c]
    for (let n = 0; n < length; n++) {
      const m = n % musicLength
      let g = music.volume
      if (loops) {
        if (m < seam && n >= musicLength) g *= fadeInGain(m, seam)
        if (musicLength - 1 - m < seam) g *= fadeInGain(musicLength - 1 - m, seam)
      }
      if (length - 1 - n < endFade) g *= fadeInGain(length - 1 - n, endFade)
      if (ducking && ducking.length > 0) {
        const pos = n / frameLength - 0.5
        const i = Math.floor(pos)
        const a = ducking[Math.min(Math.max(i, 0), ducking.length - 1)]
        const b = ducking[Math.min(Math.max(i + 1, 0), ducking.length - 1)]
        g *= a + (b - a) * (pos - i)
      }
      dst[n] += src[m] * g
    }
  }
}

/**
 * Leaves everything under `knee` alone and bends anything louder smoothly
 * toward full scale, so speech plus music can't clip in the encoder.
 * Returns how many samples it touched.
 */
export function softLimit(channels: Float32Array[], knee = 0.9): number {
  let touched = 0
  const room = 1 - knee
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      const v = channel[i]
      const a = Math.abs(v)
      if (a > knee) {
        channel[i] = Math.sign(v) * (knee + room * Math.tanh((a - knee) / room))
        touched++
      }
    }
  }
  return touched
}
