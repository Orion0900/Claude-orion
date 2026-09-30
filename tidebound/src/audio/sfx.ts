import type { SfxId } from './api'
import type { ChipSynth, FilterOpts } from './synth'

/**
 * One-shot sound effects in the chip's voice: pulse blips for the menus,
 * hardware-style stepped sweeps for stats and swooshes, shift-register noise
 * for footsteps, grass, water and hits.
 *
 * A recipe wires its voices into `out` starting at audio time `t`; `p`
 * scales pitch (1 = as designed; the xp tick rises with it).
 */
export type SfxRecipe = (s: ChipSynth, out: AudioNode, t: number, p: number) => void

const lowpass = (freq: number, to?: number): FilterOpts => ({ type: 'lowpass', freq, to })
const highpass = (freq: number): FilterOpts => ({ type: 'highpass', freq })
const band = (freq: number, to: number | undefined, q: number): FilterOpts => ({ type: 'bandpass', freq, to, q })

/** A quick run of bright pulse notes. */
function sparkle(s: ChipSynth, out: AudioNode, t: number, freqs: readonly number[], gap: number, gain: number): void {
  freqs.forEach((f, i) => s.tone(out, t + i * gap, { wave: 'pulse12', freq: f, dur: 0.12, gain }))
}

/** A thump underfoot or on impact. */
function thud(s: ChipSynth, out: AudioNode, t: number, gain: number, from = 150, dark = 700): void {
  s.tone(out, t, { wave: 'triangle', freq: from, to: 50, glide: 0.08, dur: 0.12, gain })
  s.noise(out, t, { dur: 0.05, gain: gain * 0.35, filter: lowpass(dark) })
}

export const SFX: Readonly<Record<SfxId, SfxRecipe>> = {
  cursor(s, out, t) {
    s.tone(out, t, { wave: 'pulse50', freq: 1568, dur: 0.035, hold: 0.015, gain: 0.1, filter: lowpass(6000) })
  },

  select(s, out, t) {
    s.tone(out, t, { wave: 'pulse25', freq: 1047, dur: 0.05, hold: 0.03, gain: 0.11 })
    s.tone(out, t + 0.05, { wave: 'pulse25', freq: 1568, dur: 0.09, hold: 0.03, gain: 0.11 })
  },

  cancel(s, out, t) {
    s.tone(out, t, { wave: 'pulse25', freq: 988, dur: 0.05, hold: 0.03, gain: 0.1 })
    s.tone(out, t + 0.05, { wave: 'pulse25', freq: 659, dur: 0.09, hold: 0.03, gain: 0.1 })
  },

  /** A low double buzz: can't do that. */
  error(s, out, t) {
    s.tone(out, t, { wave: 'pulse50', freq: 185, dur: 0.09, hold: 0.06, gain: 0.11, filter: lowpass(2500) })
    s.tone(out, t + 0.12, { wave: 'pulse50', freq: 147, dur: 0.14, hold: 0.09, gain: 0.11, filter: lowpass(2500) })
  },

  /** Walking into a wall. */
  bump(s, out, t) {
    thud(s, out, t, 0.42, 130, 500)
  },

  /** The latch, a soft swing, and a step through. */
  door(s, out, t) {
    s.noise(out, t, { dur: 0.02, gain: 0.18, filter: highpass(3000) })
    s.noise(out, t + 0.02, { dur: 0.24, gain: 0.22, attack: 0.06, filter: band(1000, 400, 1.5) })
    thud(s, out, t + 0.22, 0.26, 110)
  },

  /** Four footsteps, each a little lower. */
  stairs(s, out, t) {
    for (let i = 0; i < 4; i++) {
      const at = t + i * 0.085
      s.noise(out, at, { dur: 0.05, gain: 0.18 - i * 0.03, filter: lowpass(1800 - i * 300) })
      s.tone(out, at, { wave: 'triangle', freq: 180 - i * 22, to: 70, dur: 0.06, gain: 0.24 - i * 0.03 })
    }
  },

  /** A springy hop up and over, then the landing. */
  ledge(s, out, t) {
    s.tone(out, t, { wave: 'pulse25', freq: 392, to: 784, glide: 0.1, steps: 6, dur: 0.13, gain: 0.08 })
    thud(s, out, t + 0.2, 0.42)
  },

  /** Rustling through tall grass. */
  grass(s, out, t) {
    s.noise(out, t, { dur: 0.09, gain: 0.24, crackle: 7, filter: band(3800, undefined, 0.9) })
    s.noise(out, t + 0.05, { dur: 0.08, gain: 0.16, crackle: 5, filter: band(2600, undefined, 0.9) })
  },

  splash(s, out, t) {
    s.noise(out, t, { dur: 0.36, gain: 0.3, attack: 0.008, filter: { type: 'lowpass', freq: 5000, to: 500, q: 0.8 } })
    s.tone(out, t + 0.08, { wave: 'sine', freq: 700, to: 1300, dur: 0.06, gain: 0.08 })
    s.tone(out, t + 0.16, { wave: 'sine', freq: 900, to: 1600, dur: 0.05, gain: 0.06 })
  },

  /** The swoosh into battle: a stepped sweep climbing over widening noise. */
  encounter(s, out, t) {
    s.tone(out, t, { wave: 'pulse12', freq: 220, to: 1760, glide: 0.55, steps: 24, dur: 0.62, gain: 0.12 })
    s.tone(out, t + 0.03, { wave: 'pulse12', freq: 330, to: 2640, glide: 0.55, steps: 24, dur: 0.6, gain: 0.06 })
    s.noise(out, t, { dur: 0.72, gain: 0.26, attack: 0.3, filter: band(400, 5000, 2) })
  },

  /** The "!" over a trainer's head. */
  exclaim(s, out, t) {
    s.tone(out, t, { wave: 'pulse25', freq: 1319, dur: 0.06, hold: 0.04, gain: 0.12 })
    s.tone(out, t + 0.07, { wave: 'pulse25', freq: 1976, dur: 0.2, hold: 0.07, gain: 0.12 })
  },

  hit(s, out, t) {
    s.noise(out, t, { dur: 0.15, gain: 0.42, filter: lowpass(4000, 700) })
    s.tone(out, t, { wave: 'triangle', freq: 200, to: 55, glide: 0.1, dur: 0.14, gain: 0.48 })
  },

  hitWeak(s, out, t) {
    s.noise(out, t, { dur: 0.1, gain: 0.24, filter: lowpass(1600, 500) })
    s.tone(out, t, { wave: 'triangle', freq: 140, to: 60, dur: 0.08, gain: 0.28 })
  },

  /** A crunch with a double impact and a metallic snap. */
  hitSuper(s, out, t) {
    s.noise(out, t, { dur: 0.26, gain: 0.5, filter: lowpass(7000, 600) })
    s.tone(out, t, { wave: 'triangle', freq: 260, to: 45, glide: 0.16, dur: 0.22, gain: 0.56 })
    s.tone(out, t, { wave: 'pulse12', freq: 1400, to: 180, glide: 0.18, steps: 10, dur: 0.2, gain: 0.06 })
    s.noise(out, t + 0.07, { dur: 0.16, gain: 0.26, color: 'metal', rate: 3, filter: lowpass(3000) })
  },

  /** Air, and nothing else. */
  miss(s, out, t) {
    s.noise(out, t, { dur: 0.24, gain: 0.28, attack: 0.08, filter: band(700, 3200, 2.2) })
  },

  /** A long stepped slide down. */
  faint(s, out, t) {
    s.tone(out, t, { wave: 'pulse25', freq: 880, to: 98, glide: 0.8, steps: 28, dur: 0.86, gain: 0.09 })
    s.tone(out, t, { wave: 'triangle', freq: 220, to: 49, glide: 0.8, dur: 0.86, gain: 0.22 })
  },

  orbThrow(s, out, t) {
    s.noise(out, t, { dur: 0.32, gain: 0.36, attack: 0.1, filter: band(500, 2600, 2) })
    s.tone(out, t, { wave: 'pulse12', freq: 523, to: 1319, glide: 0.3, dur: 0.32, gain: 0.075 })
  },

  /** Pop, and a beam of light climbing out. */
  orbOpen(s, out, t) {
    s.tone(out, t, { wave: 'triangle', freq: 300, to: 900, glide: 0.04, dur: 0.06, gain: 0.32 })
    s.noise(out, t, { dur: 0.05, gain: 0.18, filter: highpass(2500) })
    sparkle(s, out, t + 0.05, [1319, 1568, 2093, 2637, 3136], 0.035, 0.045)
    s.noise(out, t + 0.05, { dur: 0.4, gain: 0.05, attack: 0.1, filter: highpass(6000) })
  },

  /** The orb rocks: two knocks. */
  orbShake(s, out, t) {
    for (const d of [0, 0.1]) {
      s.tone(out, t + d, { wave: 'triangle', freq: 520, to: 320, dur: 0.05, gain: 0.28 })
      s.noise(out, t + d, { dur: 0.02, gain: 0.1, filter: highpass(3000) })
    }
  },

  /** The latch catches. */
  orbClick(s, out, t) {
    s.noise(out, t, { dur: 0.02, gain: 0.28, filter: highpass(2500) })
    s.tone(out, t, { wave: 'pulse50', freq: 2093, dur: 0.03, gain: 0.07 })
    s.tone(out, t + 0.03, { wave: 'triangle', freq: 1047, to: 700, dur: 0.1, gain: 0.24 })
  },

  /** It broke free: a burst and falling sparks. */
  orbBreak(s, out, t) {
    s.noise(out, t, { dur: 0.28, gain: 0.32, filter: band(2500, 600, 1) })
    s.tone(out, t, { wave: 'pulse25', freq: 1568, to: 392, glide: 0.3, steps: 12, dur: 0.32, gain: 0.07 })
    sparkle(s, out, t + 0.05, [2637, 2093, 1568], 0.05, 0.035)
  },

  /** One tick of the experience bar; the engine raises `p` while it keeps filling. */
  xp(s, out, t, p) {
    s.tone(out, t, { wave: 'pulse12', freq: 880 * p, dur: 0.04, hold: 0.015, gain: 0.09 })
  },

  /** Three climbing hardware sweeps: a stat rose. */
  statUp(s, out, t) {
    for (let i = 0; i < 3; i++) {
      const f = 330 * Math.pow(2, (i * 4) / 12)
      s.tone(out, t + i * 0.12, { wave: 'pulse25', freq: f, to: f * 2, glide: 0.11, steps: 8, dur: 0.13, gain: 0.1 })
    }
    sparkle(s, out, t + 0.36, [1568, 2093], 0.05, 0.055)
  },

  /** And falling: a stat fell. */
  statDown(s, out, t) {
    for (let i = 0; i < 3; i++) {
      const f = 1320 * Math.pow(2, (-i * 4) / 12)
      s.tone(out, t + i * 0.12, { wave: 'pulse25', freq: f, to: f / 2, glide: 0.11, steps: 8, dur: 0.13, gain: 0.075 })
    }
    s.tone(out, t + 0.36, { wave: 'triangle', freq: 180, to: 90, dur: 0.14, gain: 0.2 })
  },

  heal(s, out, t) {
    s.tone(out, t, { wave: 'soft', freq: 523, to: 1047, glide: 0.35, dur: 0.46, attack: 0.05, gain: 0.12 })
    sparkle(s, out, t + 0.1, [1568, 2093, 2637], 0.08, 0.04)
  },

  /** A queasy warble: poisoned, burned, paralysed... */
  status(s, out, t) {
    s.tone(out, t, { wave: 'pulse50', freq: 311, dur: 0.42, hold: 0.2, gain: 0.07, vibrato: { rate: 14, depth: 250 }, filter: lowpass(2400) })
    s.tone(out, t, { wave: 'pulse50', freq: 330, dur: 0.42, hold: 0.2, gain: 0.05, vibrato: { rate: 11, depth: 250 }, filter: lowpass(2400) })
  },

  /** Footsteps hurrying off: got away safely. */
  run(s, out, t) {
    for (let i = 0; i < 5; i++) s.noise(out, t + i * 0.07, { dur: 0.04, gain: 0.28 * (1 - i * 0.17), filter: lowpass(1400) })
    s.noise(out, t + 0.05, { dur: 0.3, gain: 0.18, attack: 0.08, filter: band(600, 2400, 1.5) })
  },

  /** The till: the drawer thunks out, then the bell rings. */
  buy(s, out, t) {
    s.noise(out, t, { dur: 0.05, gain: 0.22, color: 'metal', rate: 2, filter: lowpass(2500) })
    s.tone(out, t, { wave: 'triangle', freq: 160, to: 90, dur: 0.06, gain: 0.28 })
    s.tone(out, t + 0.07, { wave: 'pulse50', freq: 2637, dur: 0.36, hold: 0.04, gain: 0.055 })
    s.tone(out, t + 0.07, { wave: 'pulse12', freq: 3520, dur: 0.3, gain: 0.045 })
    s.tone(out, t + 0.12, { wave: 'pulse50', freq: 3136, dur: 0.42, hold: 0.04, gain: 0.05 })
  },

  /** The faint tick of text printing. */
  textBlip(s, out, t) {
    s.tone(out, t, { wave: 'pulse50', freq: 1175, dur: 0.025, hold: 0.01, gain: 0.055 })
  },

  menuOpen(s, out, t) {
    s.tone(out, t, { wave: 'pulse25', freq: 784, dur: 0.04, hold: 0.02, gain: 0.095 })
    s.tone(out, t + 0.04, { wave: 'pulse25', freq: 1175, dur: 0.07, hold: 0.02, gain: 0.095 })
  },

  /** The Beastiary powers on. */
  dexOpen(s, out, t) {
    s.tone(out, t, { wave: 'soft', freq: 200, to: 800, glide: 0.2, dur: 0.22, gain: 0.08 })
    ;[523, 784, 1047, 1568].forEach((f, i) => s.tone(out, t + i * 0.045, { wave: 'pulse12', freq: f, dur: 0.06, gain: 0.06 }))
  },

  /** The line whips out, the reel ticks, the float plops in. */
  rodCast(s, out, t) {
    s.noise(out, t, { dur: 0.25, gain: 0.24, attack: 0.06, filter: band(500, 3000, 1.8) })
    for (let i = 0; i < 6; i++) s.tone(out, t + 0.22 + i * 0.03, { wave: 'pulse12', freq: 2400, dur: 0.012, gain: 0.035 })
    s.tone(out, t + 0.45, { wave: 'sine', freq: 700, to: 180, glide: 0.08, dur: 0.12, gain: 0.24 })
    s.noise(out, t + 0.45, { dur: 0.12, gain: 0.11, filter: lowpass(1500) })
  },

  /** Something's on the line! */
  bite(s, out, t) {
    s.noise(out, t, { dur: 0.18, gain: 0.24, filter: lowpass(3000, 600) })
    s.tone(out, t + 0.02, { wave: 'pulse25', freq: 1568, dur: 0.05, gain: 0.085 })
    s.tone(out, t + 0.1, { wave: 'pulse25', freq: 1568, dur: 0.07, gain: 0.085 })
  },
}

/**
 * Minimum seconds between two starts of the same effect, so a held key or
 * fast-printing text can't pile voices up.
 */
export const SFX_GAP: Readonly<Partial<Record<SfxId, number>>> = {
  cursor: 0.03,
  textBlip: 0.035,
  xp: 0.03,
  grass: 0.06,
  bump: 0.2,
  orbShake: 0.15,
  splash: 0.08,
}
