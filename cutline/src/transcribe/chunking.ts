/**
 * Loudness through the recording, and where to cut it into windows Whisper
 * can hear in one go. Pure functions, so they're easy to test.
 */

/** Whisper hears 16 kHz mono. */
export const SAMPLE_RATE = 16000

/** Loudness is measured in 10 ms frames: fine enough to place a cut or a word edge. */
export const FRAME_SECONDS = 0.01

// Mean square below this (-90 dBFS) is digital silence: padding or a muted
// stretch, which says nothing about how noisy the room is.
const DIGITAL_SILENCE = 1e-9
// Speech has to stand at least this far above the room's noise floor, or a
// quarter of the way from the floor up to the speech level if that's more:
// frame-to-frame, room noise wanders a few dB, and a margin it can reach
// fills every pause with "speech".
const SPEECH_ABOVE_FLOOR_DB = 6
const SPEECH_SHARE_OF_RANGE = 0.25
// Loud for less than this is a blip of noise, not a syllable.
const MIN_LOUD_SECONDS = 0.03
// ...and above this absolute level, so a near-silent file isn't read as speech.
const MIN_SPEECH_DB = -60
// Less sound than this in a window is a click or a bump, not words.
const MIN_SPEECH_SECONDS = 0.15
// A window with a tenth of a second louder than this (-35 dBFS) is
// transcribed even when nothing in it stands out from the noise floor, as
// with a voice over loud background sound. Skipping speech is worse than a
// wasted pass.
const ALWAYS_HEARD = 10 ** (-35 / 10)
// Speech comes and goes: its loudest tenth of a second is well above its
// typical one. Steady sound like hiss or a fan stays within this (2 dB).
const STEADY_RATIO = 10 ** (2 / 10)
const STEADY_WINDOW_SECONDS = 0.1

export interface SpeechProfile {
  /** Mean square of each frame. */
  power: Float32Array
  frameSeconds: number
  /** Frames at or above this mean square are loud enough to be speech. */
  threshold: number
}

export interface Chunk {
  /** Seconds from the start of the audio. */
  start: number
  end: number
  /** False when there's clearly no speech in the window: silence, or steady noise. */
  speech: boolean
}

export interface ChunkOptions {
  /** Longest window handed to Whisper, which hears 30 s at a time. */
  maxSeconds: number
  /** How far either side of the ideal cut to look for a quiet place. */
  searchSeconds: number
  /** Length of the quiet stretch a cut is centred in. */
  quietSeconds: number
}

const DEFAULT_OPTIONS: ChunkOptions = { maxSeconds: 28, searchSeconds: 8, quietSeconds: 0.1 }

/** Measures the loudness of 16 kHz mono audio, frame by frame. */
export function analyse(audio: Float32Array, sampleRate = SAMPLE_RATE): SpeechProfile {
  const frame = Math.max(1, Math.round(sampleRate * FRAME_SECONDS))
  const count = Math.ceil(audio.length / frame)
  const power = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const from = i * frame
    const to = Math.min(audio.length, from + frame)
    let sum = 0
    for (let k = from; k < to; k++) sum += audio[k] * audio[k]
    power[i] = sum / (to - from)
  }
  return { power, frameSeconds: frame / sampleRate, threshold: speechThreshold(power) }
}

/**
 * How loud a frame must be to count as speech: a little above the noise
 * floor, taken as the quietest tenth of the frames that aren't digital
 * silence. Infinity when there is no sound at all.
 */
export function speechThreshold(power: Float32Array): number {
  const sounding = power.filter((p) => p > DIGITAL_SILENCE).sort()
  if (sounding.length === 0) return Infinity
  const floorDb = 10 * Math.log10(sounding[Math.floor(sounding.length * 0.1)])
  const speechDb = 10 * Math.log10(sounding[Math.floor(sounding.length * 0.95)])
  const margin = Math.max(SPEECH_ABOVE_FLOOR_DB, SPEECH_SHARE_OF_RANGE * (speechDb - floorDb))
  const db = Math.max(MIN_SPEECH_DB, floorDb + margin)
  return 10 ** (db / 10)
}

/** Seconds of speech-loud frames between start and end. */
export function speechSeconds(profile: SpeechProfile, start: number, end: number): number {
  const [from, to] = frameRange(profile, start, end)
  let count = 0
  for (let i = from; i < to; i++) if (profile.power[i] >= profile.threshold) count++
  return count * profile.frameSeconds
}

export interface Island {
  start: number
  end: number
  /** Seconds of speech-loud frames in it. */
  loud: number
}

/**
 * The stretches of speech-loud audio between start and end, split wherever
 * there are at least `gap` seconds of quiet.
 */
export function speechIslands(profile: SpeechProfile, start: number, end: number, gap: number): Island[] {
  const { power, threshold, frameSeconds } = profile
  const [from, to] = frameRange(profile, start, end)
  const gapFrames = Math.max(1, Math.round(gap / frameSeconds))
  const blip = Math.max(1, Math.round(MIN_LOUD_SECONDS / frameSeconds))
  // A run of loud frames too short to be a syllable doesn't break a pause.
  const voiced = new Uint8Array(to - from)
  for (let i = from; i < to; ) {
    if (power[i] < threshold) {
      i++
      continue
    }
    let j = i
    while (j < to && power[j] >= threshold) j++
    if (j - i >= blip || i === from || j === to) voiced.fill(1, i - from, j - from)
    i = j
  }
  const islands: Island[] = []
  let current: Island | null = null
  let quiet = 0
  for (let i = from; i < to; i++) {
    if (!voiced[i - from]) {
      quiet++
      continue
    }
    if (current && quiet >= gapFrames) {
      islands.push(current)
      current = null
    }
    current ??= { start: i * frameSeconds, end: 0, loud: 0 }
    current.end = (i + 1) * frameSeconds
    current.loud += frameSeconds
    quiet = 0
  }
  if (current) islands.push(current)
  return islands
}

/**
 * Where the run of speech-loud frames touching `time` ends, looking forward
 * (direction 1) or back (-1) by at most `limit` seconds. `time` itself when
 * the audio next to it is quiet.
 */
export function loudUntil(profile: SpeechProfile, time: number, direction: 1 | -1, limit: number): number {
  const { power, threshold, frameSeconds } = profile
  const steps = Math.round(limit / frameSeconds)
  // The frame just after `time`, or just before it, allowing for rounding.
  let frame = direction > 0 ? Math.floor(time / frameSeconds + 1e-6) : Math.ceil(time / frameSeconds - 1e-6) - 1
  let edge = time
  for (let k = 0; k < steps && frame >= 0 && frame < power.length; k++, frame += direction) {
    if (power[frame] < threshold) break
    edge = (direction > 0 ? frame + 1 : frame) * frameSeconds
  }
  return edge
}

/**
 * The start of speech-loud audio after `from` when at least `minimum`
 * seconds of it come before `to`, else null. Finds speech the model skipped.
 */
export function speechAfter(profile: SpeechProfile, from: number, to: number, minimum: number): number | null {
  if (speechSeconds(profile, from, to) < minimum) return null
  return speechIslands(profile, from, to, profile.frameSeconds)[0]?.start ?? null
}

/**
 * Whether the sound between start and end holds steady, as noise does and
 * speech never does: no tenth of a second is much louder than the typical
 * one. Too short a stretch to tell counts as not steady.
 */
export function isSteady(profile: SpeechProfile, start: number, end: number): boolean {
  const { power, frameSeconds } = profile
  const [from, to] = frameRange(profile, start, end)
  const width = Math.max(1, Math.round(STEADY_WINDOW_SECONDS / frameSeconds))
  const step = Math.max(1, Math.floor(width / 2))
  const means: number[] = []
  for (let frame = from; frame + width <= to; frame += step) {
    let sum = 0
    for (let k = frame; k < frame + width; k++) sum += power[k]
    means.push(sum / width)
  }
  if (means.length < 3) return false
  means.sort((a, b) => a - b)
  const loudest = means[means.length - 1]
  return loudest <= DIGITAL_SILENCE || loudest < means[Math.floor(means.length / 2)] * STEADY_RATIO
}

/**
 * Splits the audio into windows of at most maxSeconds. What's left is
 * divided into equal parts, so no window ends up a stub, and each cut is
 * moved to the quietest stretch near its ideal place, so no word is split.
 */
export function planChunks(profile: SpeechProfile, duration: number, options: Partial<ChunkOptions> = {}): Chunk[] {
  if (!(duration > 0)) return []
  const { maxSeconds, searchSeconds, quietSeconds } = { ...DEFAULT_OPTIONS, ...options }
  const { power, frameSeconds } = profile

  // Running sums make the average of any stretch a subtraction.
  const sums = new Float64Array(power.length + 1)
  for (let i = 0; i < power.length; i++) sums[i + 1] = sums[i] + power[i]
  const quiet = Math.max(1, Math.round(quietSeconds / frameSeconds))
  // Mean square of the quietSeconds centred on a frame boundary.
  const around = (frame: number) => {
    const from = Math.max(0, Math.min(power.length - quiet, frame - Math.floor(quiet / 2)))
    const to = Math.min(power.length, from + quiet)
    return to > from ? (sums[to] - sums[from]) / (to - from) : 0
  }

  const total = duration / frameSeconds
  const longest = Math.max(quiet + 1, Math.floor(maxSeconds / frameSeconds))
  const reach = Math.round(searchSeconds / frameSeconds)
  const cuts: number[] = []
  let start = 0
  while (total - start > longest) {
    const remaining = total - start
    const target = start + remaining / Math.ceil(remaining / longest)
    const latest = Math.min(start + longest, Math.floor(target + reach / 2))
    const earliest = Math.max(start + quiet, latest - reach)
    const candidates: number[] = []
    let quietest = Infinity
    for (let frame = earliest; frame <= latest; frame++) {
      const p = around(frame)
      candidates.push(p)
      quietest = Math.min(quietest, p)
    }
    // Several places can be about as quiet, like a long silent gap: cut in
    // the middle of the quiet run nearest the ideal place.
    const tolerance = quietest * 1e-3 + 1e-12
    let best = latest
    let bestDistance = Infinity
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i] > quietest + tolerance) continue
      let j = i
      while (j + 1 < candidates.length && candidates[j + 1] <= quietest + tolerance) j++
      const middle = earliest + Math.floor((i + j) / 2)
      const distance = Math.max(0, earliest + i - target, target - (earliest + j))
      if (distance < bestDistance) {
        best = middle
        bestDistance = distance
      }
      i = j
    }
    cuts.push(best)
    start = best
  }

  const bounds = [0, ...cuts.map((frame) => frame * frameSeconds), duration]
  const chunks: Chunk[] = []
  for (let i = 1; i < bounds.length; i++) {
    const chunkStart = bounds[i - 1]
    const chunkEnd = bounds[i]
    const [from, to] = frameRange(profile, chunkStart, chunkEnd)
    let loudest = 0
    for (let frame = from; frame < to; frame += Math.max(1, Math.floor(quiet / 2))) {
      loudest = Math.max(loudest, around(frame))
    }
    const heard = speechSeconds(profile, chunkStart, chunkEnd) >= MIN_SPEECH_SECONDS || loudest >= ALWAYS_HEARD
    chunks.push({ start: chunkStart, end: chunkEnd, speech: heard && !isSteady(profile, chunkStart, chunkEnd) })
  }
  return chunks
}

function frameRange(profile: SpeechProfile, start: number, end: number): [number, number] {
  // A small epsilon keeps a time sitting exactly on a frame edge in that frame.
  const from = Math.max(0, Math.floor(start / profile.frameSeconds + 1e-6))
  const to = Math.min(profile.power.length, Math.ceil(end / profile.frameSeconds - 1e-6))
  return [from, Math.max(from, to)]
}
