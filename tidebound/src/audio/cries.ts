import { dex, preEvolution, type SpeciesId } from '../data/dex'
import type { TypeId } from '../data/types'
import type { ChipSynth } from './synth'

/**
 * Beast cries, generated from the species so each is distinct and always
 * the same. A cry is one to three syllables of chirp, trill or growl:
 *
 * - The *shape* (how many syllables, whether each rises, falls, arches or
 *   trills, and their rhythm) comes from a hash of the evolution line's
 *   first member, so a whole family shares a voice.
 * - The *pitch and length* come from the beast's size (dex height and
 *   weight) and how far along its line it is: evolved forms are deeper and
 *   longer, like bigger relatives.
 * - The *timbre* comes from its types: tide warbles, volt buzzes, flame
 *   crackles, frost rings glassy, wyrm and brawl growl, spirit wails...
 * - A second hash of the species itself nudges pitch, length and vibrato
 *   so no two beasts sound alike.
 *
 * `cryParams` is pure and tested; `renderCry` plays the result.
 */

export type CryWave = 'pulse12' | 'pulse25' | 'pulse50' | 'tri' | 'saw' | 'soft'
type Contour = 'rise' | 'fall' | 'arch' | 'dip' | 'trill' | 'flat'

export interface CryVoice {
  wave: CryWave
  /** Seconds from the start of the cry. */
  at: number
  dur: number
  /** Pitch as [seconds from `at`, Hz] points, glided between (or jumped, when `stepped`). */
  path: Array<[number, number]>
  stepped: boolean
  gain: number
  /** Cents. */
  detune: number
  vibRate: number
  /** Cents either side. */
  vibDepth: number
  tremRate: number
  /** 0-1. */
  tremDepth: number
}

export interface CryNoise {
  at: number
  dur: number
  gain: number
  /** Band-pass centre, sweeping to `to`. */
  freq: number
  to: number
  q: number
  crackle: number
  metal: boolean
}

export interface Cry {
  species: SpeciesId
  faint: boolean
  /** Seconds until the last sound has finished. */
  duration: number
  /** The main pitch in Hz. */
  pitch: number
  /** 0 (tiny) to 1 (enormous), from height and weight. */
  size: number
  /** Steps from the first member of its evolution line. */
  stage: number
  contours: Contour[]
  voices: CryVoice[]
  noise: CryNoise[]
}

interface Timbre {
  wave: CryWave
  /** Vibrato Hz and cents. */
  vib: readonly [number, number]
  /** Tremolo Hz and depth. */
  trem: readonly [number, number]
  noise?: { freq: number; to?: number; q: number; gain: number; crackle?: number; metal?: boolean }
  /** A rasping undertone an octave down, 0-1. */
  growl: number
  /** Pitch multiplier. */
  bright: number
  /** How far the pitch swoops within a syllable. */
  span: number
}

const TIMBRE: Readonly<Record<TypeId, Timbre>> = {
  normal: { wave: 'pulse25', vib: [6, 20], trem: [0, 0], growl: 0.1, bright: 1, span: 1 },
  flame: { wave: 'saw', vib: [7, 30], trem: [0, 0], noise: { freq: 2200, q: 0.9, gain: 0.14, crackle: 18 }, growl: 0.3, bright: 1, span: 1 },
  tide: { wave: 'pulse50', vib: [10, 90], trem: [0, 0], growl: 0, bright: 1.05, span: 0.9 },
  leaf: { wave: 'pulse25', vib: [5, 15], trem: [0, 0], noise: { freq: 5200, q: 0.8, gain: 0.07 }, growl: 0, bright: 1.08, span: 1.1 },
  volt: { wave: 'pulse12', vib: [8, 25], trem: [28, 0.6], noise: { freq: 6000, q: 1, gain: 0.06, crackle: 24 }, growl: 0, bright: 1.1, span: 1 },
  frost: { wave: 'soft', vib: [6, 10], trem: [0, 0], noise: { freq: 8000, q: 2, gain: 0.04 }, growl: 0, bright: 1.25, span: 0.8 },
  brawl: { wave: 'saw', vib: [5, 20], trem: [0, 0], noise: { freq: 600, q: 1, gain: 0.1 }, growl: 0.5, bright: 0.9, span: 0.8 },
  toxic: { wave: 'pulse50', vib: [4, 40], trem: [12, 0.5], growl: 0.15, bright: 0.95, span: 1 },
  earth: { wave: 'tri', vib: [5, 15], trem: [0, 0], noise: { freq: 450, q: 0.8, gain: 0.14, crackle: 10 }, growl: 0.4, bright: 0.85, span: 0.8 },
  gale: { wave: 'pulse12', vib: [6, 20], trem: [0, 0], noise: { freq: 1200, to: 3200, q: 1.6, gain: 0.1 }, growl: 0, bright: 1.15, span: 1.4 },
  mind: { wave: 'soft', vib: [4.5, 120], trem: [0, 0], growl: 0, bright: 1.05, span: 1.2 },
  bug: { wave: 'pulse12', vib: [10, 20], trem: [34, 0.7], growl: 0, bright: 1.2, span: 0.9 },
  stone: { wave: 'tri', vib: [5, 10], trem: [0, 0], noise: { freq: 1400, q: 1, gain: 0.12, metal: true }, growl: 0.35, bright: 0.9, span: 0.7 },
  spirit: { wave: 'soft', vib: [3, 180], trem: [5, 0.3], growl: 0, bright: 1, span: 1.6 },
  wyrm: { wave: 'saw', vib: [6, 35], trem: [0, 0], noise: { freq: 850, q: 0.9, gain: 0.16 }, growl: 0.7, bright: 0.8, span: 1.1 },
  metal: { wave: 'pulse12', vib: [7, 8], trem: [0, 0], noise: { freq: 4000, q: 3, gain: 0.05, metal: true }, growl: 0, bright: 1.05, span: 0.8 },
  shade: { wave: 'pulse50', vib: [5, 30], trem: [0, 0], noise: { freq: 3500, q: 3, gain: 0.12 }, growl: 0.2, bright: 0.9, span: 1 },
}

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32: a small seeded generator in [0, 1). */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), s | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v))

/**
 * Gain per waveform so every cry sits at about the same loudness: WebAudio
 * scales waves to equal peaks, which leaves a square far heavier than a
 * thin pulse.
 */
const LOUDNESS: Readonly<Record<CryWave, number>> = { pulse12: 1.45, pulse25: 1, pulse50: 0.65, tri: 1, saw: 0.95, soft: 0.85 }

/** Cry voices stay between these pitches. */
const MIN_HZ = 35
const MAX_HZ = 3500

/** 0-1 from a height of 0.3 m to 10 m and a weight of 0.1 kg to 1000 kg (logarithmic). */
export function sizeOf(height: number, weight: number): number {
  const h = clamp01(Math.log(Math.max(0.01, height) / 0.3) / Math.log(10 / 0.3))
  const w = clamp01(Math.log(Math.max(0.01, weight) / 0.1) / Math.log(1000 / 0.1))
  return clamp01(0.45 * h + 0.55 * w)
}

interface Shape {
  contours: Contour[]
  /** Semitones each syllable sits above the first. */
  offsets: number[]
  /** Relative syllable lengths. */
  weights: number[]
  /** Share of each syllable left silent before the next. */
  gaps: number[]
  /** Semitones of swoop. */
  spans: number[]
  /** Where an arch or dip turns, 0-1. */
  turns: number[]
}

const CONTOURS: ReadonlyArray<[Contour, number]> = [
  ['arch', 3],
  ['fall', 3],
  ['rise', 2],
  ['dip', 2],
  ['trill', 1],
  ['flat', 1],
]

function pickContour(r: () => number): Contour {
  let roll = r() * CONTOURS.reduce((a, [, w]) => a + w, 0)
  for (const [c, w] of CONTOURS) {
    if (roll < w) return c
    roll -= w
  }
  return 'arch'
}

/** The voice an evolution line shares. */
function familyShape(root: SpeciesId): Shape {
  const r = seeded(hashString(`cry-shape:${root}`))
  const roll = r()
  const n = roll < 0.35 ? 1 : roll < 0.8 ? 2 : 3
  const shape: Shape = { contours: [], offsets: [], weights: [], gaps: [], spans: [], turns: [] }
  for (let i = 0; i < n; i++) {
    shape.contours.push(pickContour(r))
    shape.offsets.push(i === 0 ? 0 : Math.round((r() < 0.5 ? -1 : 1) * (2 + r() * 5)))
    shape.weights.push(0.6 + r() * 0.8)
    shape.gaps.push(i === n - 1 ? 0 : 0.06 + r() * 0.18)
    shape.spans.push(3 + r() * 7)
    shape.turns.push(0.25 + r() * 0.45)
  }
  return shape
}

const semis = (n: number): number => Math.pow(2, n / 12)

function contourPath(c: Contour, dur: number, p: number, span: number, turn: number): { path: Array<[number, number]>; stepped: boolean } {
  switch (c) {
    case 'rise':
      return { path: [[0, p * semis(-span)], [dur * turn, p], [dur, p * semis(span / 2)]], stepped: false }
    case 'fall':
      return { path: [[0, p * semis(span / 2)], [dur * turn * 0.5, p * semis(span)], [dur, p * semis(-span)]], stepped: false }
    case 'arch':
      return { path: [[0, p], [dur * turn, p * semis(span)], [dur, p * semis(-span / 2)]], stepped: false }
    case 'dip':
      return { path: [[0, p * semis(span / 2)], [dur * turn, p * semis(-span)], [dur, p]], stepped: false }
    case 'flat':
      return { path: [[0, p * semis(-1)], [dur * 0.2, p], [dur, p * semis(-2)]], stepped: false }
    case 'trill': {
      const path: Array<[number, number]> = []
      const step = 0.045
      for (let k = 0; k * step < dur; k++) path.push([k * step, k % 2 ? p * semis(span / 2) : p])
      return { path, stepped: true }
    }
  }
}

/** Where a species sits in its line: the line's first member and how many steps along. */
export function lineage(id: SpeciesId): { root: SpeciesId; stage: number } {
  let root = id
  let stage = 0
  for (let pre = preEvolution(root); pre !== null && stage < 8; pre = preEvolution(root)) {
    root = pre
    stage++
  }
  return { root, stage }
}

export function cryParams(id: SpeciesId, faint = false): Cry {
  const entry = dex(id)
  const { root, stage } = lineage(id)
  const shape = familyShape(root)
  const own = seeded(hashString(`cry-voice:${id}`))
  const size = sizeOf(entry.height, entry.weight)
  const a = TIMBRE[entry.types[0]]
  const b = entry.types[1] ? TIMBRE[entry.types[1]] : null

  // Pitch: small beasts squeak, big ones boom; each evolution drops a few semitones more.
  const bright = a.bright * (b ? Math.sqrt(b.bright) : 1)
  const quirk = semis(own() * 2 - 1)
  const pitch = 1500 * Math.pow(2, -3.3 * size) * Math.pow(2, -0.35 * stage) * bright * quirk
  const length = Math.min(1.5, (0.32 + 0.75 * Math.pow(size, 0.9)) * (0.92 + 0.16 * own()) * (1 + 0.08 * stage))

  const vibRate = a.vib[0] * (0.9 + 0.2 * own())
  const vibDepth = a.vib[1] + (b ? b.vib[1] * 0.5 : 0)
  const trem = b && b.trem[1] * 0.7 > a.trem[1] ? ([b.trem[0], b.trem[1] * 0.7] as const) : a.trem
  const growl = Math.max(a.growl, b ? b.growl * 0.7 : 0) + size * 0.3
  const spanScale = a.span * (b ? 0.5 + b.span / 2 : 1)
  const loud = LOUDNESS[a.wave]

  // Fainting: lower, slower, sagging at the end of every syllable.
  const f = faint ? { pitch: 0.78, time: 1.45, sag: 0.5, gain: 0.85, vibRate: 0.7, vibDepth: 1.4 } : { pitch: 1, time: 1, sag: 1, gain: 1, vibRate: 1, vibDepth: 1 }
  const base = pitch * f.pitch
  const total = length * f.time

  const voices: CryVoice[] = []
  const sum = shape.weights.reduce((x, y) => x + y, 0)
  let at = 0
  shape.contours.forEach((contour, i) => {
    const full = (total * shape.weights[i]) / sum
    const dur = full * (1 - shape.gaps[i])
    const p = base * semis(shape.offsets[i])
    const { path, stepped } = contourPath(contour, dur, p, shape.spans[i] * spanScale, shape.turns[i])
    if (f.sag !== 1) path[path.length - 1] = [dur, path[path.length - 1][1] * f.sag]
    const voice: CryVoice = {
      wave: a.wave,
      at,
      dur,
      path,
      stepped,
      // A tremolo spends half its time quiet; make up for it.
      gain: 0.19 * loud * (1 + trem[1] * 0.6) * f.gain,
      detune: 0,
      vibRate: vibRate * f.vibRate,
      vibDepth: vibDepth * f.vibDepth,
      tremRate: trem[0],
      tremDepth: trem[1],
    }
    voices.push(voice)
    // Bigger beasts get a second, slightly detuned voice: a thicker sound.
    if (size > 0.55) voices.push({ ...voice, path: path.map(([s, hz]) => [s, hz] as [number, number]), gain: voice.gain * 0.5, detune: 12 })
    // A rasp an octave down for growlers.
    if (growl > 0.3) {
      voices.push({
        ...voice,
        wave: 'saw',
        path: path.map(([s, hz]) => [s, hz / 2] as [number, number]),
        gain: 0.1 * Math.min(1, growl) * f.gain,
        detune: 15,
        vibRate: 22,
        vibDepth: 25,
      })
    }
    // Metal rings with an inharmonic overtone, like a struck bell.
    if (entry.types.includes('metal')) {
      voices.push({ ...voice, wave: 'soft', path: path.map(([s, hz]) => [s * 0.6, hz * 2.76] as [number, number]), dur: dur * 0.6, gain: 0.06 * f.gain, vibDepth: 0 })
    }
    at += full
  })

  const noise: CryNoise[] = []
  const layers: Array<[Timbre, number]> = [[a, 1]]
  if (b) layers.push([b, 0.6])
  for (const [timbre, share] of layers) {
    const n = timbre.noise
    if (!n) continue
    noise.push({
      at: 0,
      dur: total,
      gain: n.gain * share * (0.7 + 0.6 * size) * (faint ? 0.6 : 1),
      freq: n.freq,
      to: n.to ?? n.freq * 0.8,
      q: n.q,
      crackle: n.crackle ? Math.round(n.crackle * total * 2) : 0,
      metal: n.metal === true,
    })
  }

  // Keep every voice audible and short of shrill: rasps an octave down can dip very low.
  for (const v of voices) v.path = v.path.map(([at, hz]) => [at, Math.min(MAX_HZ, Math.max(MIN_HZ, hz))])

  let duration = 0
  for (const v of voices) duration = Math.max(duration, v.at + v.dur)
  for (const n of noise) duration = Math.max(duration, n.at + n.dur)
  return { species: id, faint, duration, pitch: base, size, stage, contours: [...shape.contours], voices, noise }
}

export function renderCry(s: ChipSynth, out: AudioNode, t: number, cry: Cry): void {
  for (const v of cry.voices) {
    s.tone(out, t + v.at, {
      wave: v.wave,
      freq: v.path[0][1],
      points: v.path,
      stepped: v.stepped,
      dur: v.dur,
      gain: v.gain,
      attack: Math.min(0.02, v.dur * 0.2),
      hold: v.dur * 0.45,
      detune: v.detune,
      vibrato: v.vibDepth > 0 ? { rate: v.vibRate, depth: v.vibDepth } : undefined,
      tremolo: v.tremDepth > 0 ? { rate: v.tremRate, depth: v.tremDepth } : undefined,
    })
  }
  for (const n of cry.noise) {
    s.noise(out, t + n.at, {
      dur: n.dur,
      gain: n.gain,
      attack: 0.02,
      hold: n.dur * 0.3,
      color: n.metal ? 'metal' : 'white',
      rate: n.metal ? 2 : undefined,
      crackle: n.crackle > 0 ? n.crackle : undefined,
      filter: { type: 'bandpass', freq: n.freq, to: n.to, q: n.q },
    })
  }
}
