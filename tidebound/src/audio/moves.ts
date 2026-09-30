import type { TypeId } from '../data/types'
import type { MoveSoundSpec } from './api'
import type { ChipSynth, FilterOpts } from './synth'

/**
 * The sound of a move, from its type and category. Each type has its own
 * material (flame crackles, tide splashes, volt zaps...) and the category
 * shapes it: physical moves are short and land with an impact, special
 * moves are longer and more tonal, status moves are soft and shimmer.
 */
type Category = MoveSoundSpec['category']
type MoveRecipe = (s: ChipSynth, out: AudioNode, t: number, c: Category) => void

const lowpass = (freq: number, to?: number): FilterOpts => ({ type: 'lowpass', freq, to })
const highpass = (freq: number): FilterOpts => ({ type: 'highpass', freq })
const band = (freq: number, to: number | undefined, q: number): FilterOpts => ({ type: 'bandpass', freq, to, q })

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/** Where a physical move lands: a thump and a crack. */
function impact(s: ChipSynth, out: AudioNode, t: number, weight = 1): void {
  s.tone(out, t, { wave: 'triangle', freq: 200, to: 48, glide: 0.1, dur: 0.15, gain: 0.44 * weight })
  s.noise(out, t, { dur: 0.12, gain: 0.32 * weight, filter: lowpass(3600, 600) })
}

/** A quick rush of air before a blow. */
function windup(s: ChipSynth, out: AudioNode, t: number): void {
  s.noise(out, t, { dur: 0.12, gain: 0.16, attack: 0.06, filter: band(600, 2400, 2) })
}

/** Soft rising notes: the glow of a status move. */
function aura(s: ChipSynth, out: AudioNode, t: number, notes: readonly number[], wave: 'pulse12' | 'soft' = 'pulse12'): void {
  notes.forEach((f, i) => s.tone(out, t + i * 0.07, { wave, freq: f, dur: 0.28, hold: 0.05, attack: 0.02, gain: 0.085 }))
}

function bubbles(s: ChipSynth, out: AudioNode, t: number, n: number, low: number, high: number, span: number): void {
  for (let i = 0; i < n; i++) {
    const f = rand(low, high)
    s.tone(out, t + (i / n) * span + rand(0, 0.03), { wave: 'sine', freq: f, to: f * 1.8, dur: 0.05, gain: 0.1 })
  }
}

const MOVES: Readonly<Record<TypeId, MoveRecipe>> = {
  /** A plain thud, a beam, or a bright chime. */
  normal(s, out, t, c) {
    if (c === 'physical') {
      windup(s, out, t)
      impact(s, out, t + 0.1)
    } else if (c === 'special') {
      s.tone(out, t, { wave: 'pulse25', freq: 1400, to: 350, glide: 0.3, steps: 14, dur: 0.34, gain: 0.08 })
      s.noise(out, t, { dur: 0.3, gain: 0.1, filter: highpass(4000) })
    } else aura(s, out, t, [523, 659, 784, 1047])
  },

  /** Crackle and whoomp. */
  flame(s, out, t, c) {
    const len = c === 'special' ? 0.72 : c === 'status' ? 0.5 : 0.34
    s.noise(out, t, { dur: len, gain: c === 'status' ? 0.14 : 0.26, attack: 0.04, crackle: Math.round(len * 45), filter: band(1300, 2800, 0.8) })
    if (c !== 'status') s.noise(out, t, { dur: len, gain: 0.3, attack: 0.07, filter: { type: 'lowpass', freq: 250, to: 2200, sweep: len * 0.4, q: 2 } })
    if (c === 'physical') impact(s, out, t + 0.18, 0.8)
    else if (c === 'special') s.tone(out, t, { wave: 'saw', freq: 95, to: 58, dur: len, attack: 0.1, gain: 0.12, vibrato: { rate: 9, depth: 40 }, filter: lowpass(700) })
    else s.tone(out, t, { wave: 'soft', freq: 220, to: 440, dur: len, attack: 0.1, gain: 0.07 })
  },

  /** Splash and bubbles. */
  tide(s, out, t, c) {
    if (c === 'physical') {
      s.noise(out, t, { dur: 0.3, gain: 0.3, filter: { type: 'lowpass', freq: 5000, to: 500, q: 0.8 } })
      bubbles(s, out, t + 0.06, 3, 500, 900, 0.15)
      impact(s, out, t + 0.02, 0.6)
    } else if (c === 'special') {
      s.noise(out, t, { dur: 0.85, gain: 0.3, attack: 0.25, hold: 0.2, filter: band(300, 1800, 1.2) })
      s.tone(out, t, { wave: 'pulse50', freq: 180, to: 260, dur: 0.8, attack: 0.2, gain: 0.05, vibrato: { rate: 5, depth: 80 }, filter: lowpass(1200) })
      bubbles(s, out, t + 0.3, 6, 400, 1000, 0.5)
    } else bubbles(s, out, t, 7, 400, 1200, 0.45)
  },

  /** Rustling leaves. */
  leaf(s, out, t, c) {
    if (c === 'physical') {
      s.noise(out, t, { dur: 0.12, gain: 0.24, attack: 0.03, filter: band(2000, 6000, 1.5) })
      s.noise(out, t + 0.08, { dur: 0.18, gain: 0.18, crackle: 9, filter: band(3500, undefined, 0.9) })
      impact(s, out, t + 0.12, 0.55)
    } else if (c === 'special') {
      s.noise(out, t, { dur: 0.65, gain: 0.32, attack: 0.15, crackle: 26, filter: band(2500, 6000, 1.5) })
      s.tone(out, t, { wave: 'pulse12', freq: 1175, dur: 0.6, gain: 0.06, points: [[0, 1175], [0.15, 1397], [0.3, 1175], [0.45, 1568], [0.6, 1319]], stepped: true })
    } else aura(s, out, t, [784, 880, 1175, 1319, 1568])
  },

  /** Zap and crackle. */
  volt(s, out, t, c) {
    if (c === 'status') {
      s.tone(out, t, { wave: 'pulse50', freq: 120, dur: 0.5, hold: 0.3, gain: 0.09, tremolo: { rate: 25, depth: 0.9 }, filter: lowpass(3000) })
      s.noise(out, t, { dur: 0.45, gain: 0.08, crackle: 18, filter: highpass(3500) })
      return
    }
    const len = c === 'special' ? 0.55 : 0.2
    s.noise(out, t, { dur: len, gain: 0.26, crackle: Math.round(len * 60), filter: band(3600, undefined, 0.8) })
    s.tone(out, t, { wave: 'saw', freq: 1800, to: 180, dur: Math.min(len, 0.25), gain: 0.08, vibrato: { rate: 45, depth: 120 }, filter: lowpass(4000) })
    if (c === 'special') {
      const path: Array<[number, number]> = []
      for (let i = 0; i < 12; i++) path.push([i * 0.045, rand(600, 2400)])
      s.tone(out, t, { wave: 'pulse12', freq: path[0][1], points: path, stepped: true, dur: len, gain: 0.05 })
      s.tone(out, t, { wave: 'saw', freq: 110, dur: len, gain: 0.07, tremolo: { rate: 30, depth: 0.8 }, filter: lowpass(1500) })
    } else impact(s, out, t + 0.06, 0.7)
  },

  /** Glassy chimes. */
  frost(s, out, t, c) {
    const notes = c === 'status' ? [3136, 2637, 2093] : [2093, 2637, 3136, 3520, 4186, 2794, 3729]
    const count = c === 'physical' ? 3 : notes.length
    for (let i = 0; i < count; i++) {
      s.tone(out, t + i * (c === 'status' ? 0.11 : 0.07) + rand(0, 0.02), { wave: i % 2 ? 'soft' : 'pulse12', freq: notes[i], dur: 0.35, gain: c === 'status' ? 0.09 : 0.06 })
    }
    if (c === 'physical') {
      s.noise(out, t, { dur: 0.08, gain: 0.25, color: 'metal', rate: 6, filter: band(5000, undefined, 1.5) })
      impact(s, out, t + 0.03, 0.6)
    } else if (c === 'special') s.noise(out, t, { dur: 0.6, gain: 0.07, attack: 0.15, filter: highpass(6500) })
  },

  /** Thumps: a jab-jab-cross, a charged punch, or a grunt. */
  brawl(s, out, t, c) {
    if (c === 'physical') {
      impact(s, out, t, 0.6)
      impact(s, out, t + 0.1, 0.7)
      impact(s, out, t + 0.22, 1.1)
    } else if (c === 'special') {
      s.tone(out, t, { wave: 'pulse25', freq: 200, to: 800, glide: 0.25, steps: 10, dur: 0.26, gain: 0.07 })
      windup(s, out, t + 0.12)
      impact(s, out, t + 0.28, 1.2)
    } else {
      s.tone(out, t, { wave: 'saw', freq: 220, to: 160, dur: 0.14, gain: 0.08, filter: lowpass(1200) })
      impact(s, out, t + 0.18, 0.4)
    }
  },

  /** Gurgling bubbles. */
  toxic(s, out, t, c) {
    if (c === 'physical') {
      s.noise(out, t, { dur: 0.16, gain: 0.26, filter: lowpass(900) })
      s.tone(out, t, { wave: 'pulse50', freq: 220, to: 100, dur: 0.18, gain: 0.07, vibrato: { rate: 18, depth: 200 }, filter: lowpass(1500) })
      impact(s, out, t + 0.05, 0.6)
    } else {
      const len = c === 'special' ? 0.65 : 0.45
      bubbles(s, out, t, c === 'special' ? 9 : 5, 150, 520, len)
      s.tone(out, t, { wave: 'pulse50', freq: 180, dur: len, hold: len * 0.5, gain: 0.06, tremolo: { rate: 12, depth: 0.7 }, vibrato: { rate: 6, depth: 300 }, filter: lowpass(1200) })
    }
  },

  /** A rumble underfoot. */
  earth(s, out, t, c) {
    if (c === 'status') {
      s.noise(out, t, { dur: 0.5, gain: 0.45, crackle: 22, filter: band(1200, undefined, 1) })
      s.tone(out, t, { wave: 'triangle', freq: 70, to: 50, dur: 0.45, attack: 0.08, gain: 0.2 })
      return
    }
    const len = c === 'special' ? 0.9 : 0.45
    s.noise(out, t, { dur: len, gain: 0.36, attack: 0.03, crackle: Math.round(len * 28), filter: lowpass(320) })
    s.tone(out, t, { wave: 'triangle', freq: 85, to: 36, dur: len, gain: 0.4, tremolo: { rate: 8, depth: 0.5 } })
    if (c === 'physical') impact(s, out, t, 1)
  },

  /** A gust of wind. */
  gale(s, out, t, c) {
    if (c === 'physical') {
      s.noise(out, t, { dur: 0.26, gain: 0.26, attack: 0.08, filter: band(600, 3000, 2.5) })
      impact(s, out, t + 0.18, 0.55)
    } else {
      const len = c === 'special' ? 0.8 : 0.6
      const gain = c === 'special' ? 0.4 : 0.28
      s.noise(out, t, { dur: len / 2, gain, attack: len / 4, filter: band(400, 2800, 4) })
      s.noise(out, t + len / 2, { dur: len / 2, gain, filter: band(2800, 500, 4) })
      s.tone(out, t, { wave: 'pulse12', freq: 1200, points: [[0, 1200], [len * 0.4, 1800], [len, 1300]], dur: len, attack: 0.1, gain: 0.05 })
    }
  },

  /** A warbling, bending tone. */
  mind(s, out, t, c) {
    if (c === 'physical') {
      s.tone(out, t, { wave: 'soft', freq: 600, dur: 0.22, gain: 0.1, vibrato: { rate: 9, depth: 400 } })
      impact(s, out, t + 0.16, 0.7)
    } else if (c === 'special') {
      s.tone(out, t, { wave: 'soft', freq: 440, to: 880, dur: 0.8, attack: 0.08, hold: 0.3, gain: 0.1, vibrato: { rate: 5, depth: 90 } })
      s.tone(out, t, { wave: 'soft', freq: 554, to: 1109, dur: 0.8, attack: 0.08, hold: 0.3, gain: 0.07, vibrato: { rate: 5.6, depth: 90 } })
      s.tone(out, t + 0.1, { wave: 'pulse12', freq: 1760, to: 3520, dur: 0.6, gain: 0.025 })
    } else s.tone(out, t, { wave: 'soft', freq: 330, points: [[0, 330], [0.35, 660], [0.7, 330]], dur: 0.7, attack: 0.05, hold: 0.3, gain: 0.09, vibrato: { rate: 6, depth: 60 } })
  },

  /** A buzz and a chitter. */
  bug(s, out, t, c) {
    if (c === 'physical') {
      s.tone(out, t, { wave: 'pulse12', freq: 1800, dur: 0.14, gain: 0.05, tremolo: { rate: 40, depth: 1 } })
      for (let i = 0; i < 3; i++) s.noise(out, t + i * 0.04, { dur: 0.015, gain: 0.14, filter: highpass(4000) })
      impact(s, out, t + 0.12, 0.55)
    } else {
      const len = c === 'special' ? 0.6 : 0.3
      s.tone(out, t, { wave: 'pulse12', freq: 260, dur: len, hold: len * 0.6, gain: 0.16, tremolo: { rate: 30, depth: 0.9 }, filter: band(900, undefined, 1) })
      if (c === 'special') s.tone(out, t, { wave: 'pulse12', freq: 277, dur: len, hold: len * 0.6, gain: 0.13, tremolo: { rate: 35, depth: 0.9 }, filter: band(1100, undefined, 1) })
    }
  },

  /** Cracking and tumbling rock. */
  stone(s, out, t, c) {
    if (c === 'status') {
      s.noise(out, t, { dur: 0.5, gain: 0.2, color: 'metal', rate: 0.5, filter: lowpass(800) })
      return
    }
    const hits = c === 'special' ? 8 : 3
    const span = c === 'special' ? 0.7 : 0.18
    for (let i = 0; i < hits; i++) {
      const at = t + (i / hits) * span + rand(0, 0.02)
      s.noise(out, at, { dur: 0.06, gain: 0.26, color: 'metal', rate: rand(1, 2.5), filter: band(1500, undefined, 1) })
      s.tone(out, at, { wave: 'triangle', freq: rand(100, 160), to: 40, dur: 0.1, gain: 0.3 })
    }
    if (c === 'physical') impact(s, out, t, 0.9)
  },

  /** A ghostly wail. */
  spirit(s, out, t, c) {
    if (c === 'physical') {
      s.tone(out, t, { wave: 'soft', freq: 900, to: 300, dur: 0.26, gain: 0.1, vibrato: { rate: 6, depth: 80 } })
      s.noise(out, t, { dur: 0.25, gain: 0.08, filter: highpass(5000) })
      impact(s, out, t + 0.2, 0.5)
    } else if (c === 'special') {
      const path: Array<[number, number]> = [[0, 300], [0.3, 700], [0.6, 520], [0.9, 250]]
      s.tone(out, t, { wave: 'soft', freq: 300, points: path, dur: 0.9, attack: 0.1, hold: 0.4, gain: 0.1, vibrato: { rate: 5, depth: 60 } })
      s.tone(out, t, { wave: 'soft', freq: 300, points: path, dur: 0.9, attack: 0.1, hold: 0.4, gain: 0.07, detune: 25, vibrato: { rate: 4.4, depth: 60 } })
      s.noise(out, t, { dur: 0.9, gain: 0.05, attack: 0.3, filter: highpass(5000) })
    } else {
      s.tone(out, t, { wave: 'soft', freq: 440, dur: 0.7, attack: 0.15, hold: 0.3, gain: 0.07, vibrato: { rate: 3, depth: 50 } })
      s.tone(out, t, { wave: 'soft', freq: 622, dur: 0.7, attack: 0.15, hold: 0.3, gain: 0.06, vibrato: { rate: 3.4, depth: 50 } })
    }
  },

  /** A dragon's roar. */
  wyrm(s, out, t, c) {
    if (c === 'status') {
      s.tone(out, t, { wave: 'saw', freq: 90, dur: 0.5, hold: 0.25, gain: 0.12, tremolo: { rate: 18, depth: 0.6 }, filter: lowpass(900) })
      return
    }
    const len = c === 'special' ? 0.9 : 0.34
    for (const [detune, gain] of [[0, 0.13], [18, 0.1]] as const) {
      s.tone(out, t, { wave: 'saw', freq: c === 'special' ? 115 : 180, to: c === 'special' ? 68 : 90, dur: len, attack: 0.05, hold: len * 0.4, gain, detune, vibrato: { rate: 7, depth: 40 }, filter: lowpass(1300, 500) })
    }
    s.noise(out, t, { dur: len, gain: 0.26, attack: 0.05, filter: band(750, undefined, 0.8) })
    if (c === 'special') s.tone(out, t, { wave: 'triangle', freq: 55, dur: len, gain: 0.3 })
    else impact(s, out, t + 0.22, 0.9)
  },

  /** A ringing clang: inharmonic partials, like struck plate. */
  metal(s, out, t, c) {
    if (c === 'status') {
      s.tone(out, t, { wave: 'pulse12', freq: 2600, dur: 0.5, hold: 0.15, gain: 0.1, tremolo: { rate: 8, depth: 0.6 } })
      s.tone(out, t, { wave: 'pulse12', freq: 2600 * 1.414, dur: 0.5, hold: 0.15, gain: 0.08, tremolo: { rate: 9, depth: 0.6 } })
      return
    }
    const base = c === 'special' ? 780 : 520
    const ring = c === 'special' ? 0.9 : 0.6
    for (const [ratio, gain] of [[1, 0.1], [2.76, 0.06], [5.4, 0.035]] as const) {
      s.tone(out, t, { wave: 'soft', freq: base * ratio, dur: ring / ratio ** 0.3, gain })
    }
    s.noise(out, t, { dur: 0.05, gain: 0.25, color: 'metal', rate: 5, filter: highpass(3000) })
    if (c === 'special') s.tone(out, t, { wave: 'pulse12', freq: 2400, to: 600, glide: 0.3, steps: 12, dur: 0.32, gain: 0.05 })
    else impact(s, out, t, 0.7)
  },

  /** A whisper in the dark. */
  shade(s, out, t, c) {
    if (c === 'physical') {
      s.noise(out, t, { dur: 0.16, gain: 0.2, filter: band(3500, undefined, 4) })
      impact(s, out, t + 0.1, 0.8)
    } else if (c === 'special') {
      s.noise(out, t, { dur: 0.8, gain: 0.26, attack: 0.2, crackle: 30, filter: band(2800, 1800, 6) })
      s.tone(out, t, { wave: 'pulse50', freq: 92, to: 68, dur: 0.8, attack: 0.1, gain: 0.08, detune: 12, filter: lowpass(600) })
    } else {
      s.noise(out, t, { dur: 0.6, gain: 0.06, attack: 0.2, filter: highpass(5000) })
      s.tone(out, t, { wave: 'soft', freq: 110, to: 80, dur: 0.6, attack: 0.1, gain: 0.1 })
    }
  },
}

export function playMove(s: ChipSynth, out: AudioNode, t: number, spec: MoveSoundSpec): void {
  const recipe = MOVES[spec.type] ?? MOVES.normal
  recipe(s, out, t, spec.category)
}

export const MOVE_TYPES = Object.keys(MOVES) as readonly TypeId[]
