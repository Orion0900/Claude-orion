import type { SfxId } from '../game/types'
import type { Synth } from './synth'

/**
 * One synthesised sound effect: wires its voices into `out` starting at
 * audio time `t`, with every frequency scaled by `p` (1 = as designed). Each
 * must finish within its `SFX_RULES` length so voice counting stays honest.
 */
export type SfxRecipe = (s: Synth, out: AudioNode, t: number, p: number) => void

/** Rarity stings take `pitch` 1 (common) to 2 (legendary); brightness follows it. */
function brightness(p: number): number {
  return Math.min(1, Math.max(0, p - 1))
}

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]
}

export const SFX: Record<SfxId, SfxRecipe> = {
  /** The signature hit: a hollow, downward-bending knock over a sub thump with a bright contact click. */
  bonk(s, out, t, p) {
    s.tone(out, t, { wave: 'triangle', freq: 560 * p, to: 170 * p, glide: 0.07, dur: 0.16, gain: 0.5, filter: { type: 'lowpass', freq: 2600 } })
    s.tone(out, t, { wave: 'sine', freq: 200 * p, to: 68 * p, glide: 0.06, dur: 0.15, gain: 0.6 })
    s.tone(out, t, { wave: 'sine', freq: 1300 * p, to: 880 * p, dur: 0.045, gain: 0.16 })
    s.noise(out, t, { dur: 0.025, gain: 0.32, filter: { type: 'bandpass', freq: 3300, q: 1.1 } })
  },

  /** A sharper bonk with a metallic ting on top. */
  crit(s, out, t, p) {
    s.tone(out, t, { wave: 'triangle', freq: 760 * p, to: 230 * p, glide: 0.06, dur: 0.13, gain: 0.45, filter: { type: 'lowpass', freq: 4000 } })
    s.tone(out, t, { wave: 'sine', freq: 230 * p, to: 80 * p, glide: 0.05, dur: 0.12, gain: 0.5 })
    s.noise(out, t, { dur: 0.03, gain: 0.3, filter: { type: 'highpass', freq: 4500 } })
    s.tone(out, t + 0.01, { wave: 'sine', freq: 2150 * p, dur: 0.3, gain: 0.14 })
    s.tone(out, t + 0.01, { wave: 'sine', freq: 3220 * p, dur: 0.2, gain: 0.07 })
    s.tone(out, t, { wave: 'square', freq: 1400 * p, to: 2300 * p, dur: 0.07, gain: 0.05, filter: { type: 'highpass', freq: 1500 } })
  },

  /** A round pop with a little sparkle. */
  kill(s, out, t, p) {
    s.tone(out, t, { wave: 'sine', freq: 950 * p, to: 250 * p, glide: 0.05, dur: 0.1, gain: 0.45 })
    s.noise(out, t, { dur: 0.06, gain: 0.26, filter: { type: 'bandpass', freq: 1800, to: 600, q: 1 } })
    s.tone(out, t + 0.03, { wave: 'triangle', freq: 1700 * p, to: 2500 * p, dur: 0.08, gain: 0.07 })
  },

  shoot(s, out, t, p) {
    s.tone(out, t, { wave: 'square', freq: 1500 * p, to: 320 * p, glide: 0.11, dur: 0.13, gain: 0.12, filter: { type: 'lowpass', freq: 3500 } })
    s.noise(out, t, { dur: 0.02, gain: 0.08, filter: { type: 'highpass', freq: 4000 } })
  },

  /** Air cut by a blade: a band of noise sweeping up. */
  swing(s, out, t, p) {
    s.noise(out, t, { dur: 0.2, gain: 0.6, attack: 0.05, filter: { type: 'bandpass', freq: 480 * p, to: 2800 * p, q: 1.4 } })
  },

  /** Chopped high noise and a falling saw: electric crackle. */
  zap(s, out, t, p) {
    s.noise(out, t, { dur: 0.24, gain: 0.3, crackle: 14, filter: { type: 'bandpass', freq: 3600 * p, q: 0.8 } })
    s.tone(out, t, { wave: 'sawtooth', freq: 1400 * p, to: 110 * p, dur: 0.18, gain: 0.07, vibrato: 90, vibratoRate: 40, filter: { type: 'lowpass', freq: 3000 } })
  },

  /** A whoomp: noise opening up from dark to bright over a low push. */
  fire(s, out, t, p) {
    s.noise(out, t, { dur: 0.38, gain: 0.42, attack: 0.05, filter: { type: 'lowpass', freq: 260 * p, to: 1700 * p, sweep: 0.12, q: 2 } })
    s.tone(out, t, { wave: 'sine', freq: 120 * p, to: 52 * p, dur: 0.3, gain: 0.3, attack: 0.03 })
  },

  explode(s, out, t, p) {
    s.noise(out, t, { dur: 0.65, gain: 0.65, filter: { type: 'lowpass', freq: 4200, to: 240, q: 0.7 } })
    s.tone(out, t, { wave: 'sine', freq: 120 * p, to: 32 * p, glide: 0.4, dur: 0.6, gain: 0.8 })
    s.tone(out, t, { wave: 'square', freq: 62 * p, to: 30 * p, dur: 0.25, gain: 0.1, filter: { type: 'lowpass', freq: 420 } })
  },

  /** A tiny bright blip; pickups raise `pitch` as a collection streak grows. */
  xp(s, out, t, p) {
    s.tone(out, t, { wave: 'sine', freq: 1320 * p, to: 1760 * p, glide: 0.03, dur: 0.08, gain: 0.13 })
    s.tone(out, t, { wave: 'triangle', freq: 2640 * p, dur: 0.05, gain: 0.035 })
  },

  /** Two-note coin ding. */
  gold(s, out, t, p) {
    const soft = { type: 'lowpass', freq: 5200 } as const
    s.tone(out, t, { wave: 'square', freq: 988 * p, dur: 0.075, hold: 0.05, gain: 0.1, filter: soft })
    s.tone(out, t + 0.065, { wave: 'square', freq: 1319 * p, dur: 0.26, hold: 0.03, gain: 0.11, filter: soft })
    s.tone(out, t + 0.065, { wave: 'sine', freq: 2638 * p, dur: 0.2, gain: 0.05 })
  },

  heal(s, out, t, p) {
    s.tone(out, t, { wave: 'sine', freq: 520 * p, to: 880 * p, dur: 0.36, gain: 0.13, attack: 0.04 })
    const notes = [784, 988, 1175]
    for (let i = 0; i < notes.length; i++) s.tone(out, t + i * 0.06, { wave: 'triangle', freq: notes[i] * p, dur: 0.2, gain: 0.07 })
  },

  /** A rising arpeggio that lands on a bright chord. */
  levelUp(s, out, t, p) {
    const run = [523.25, 659.25, 783.99, 1046.5]
    for (let i = 0; i < run.length; i++)
      s.tone(out, t + i * 0.07, { wave: 'pulse25', freq: run[i] * p, dur: 0.12, hold: 0.05, gain: 0.1, filter: { type: 'lowpass', freq: 4500 } })
    const chord = [1046.5, 1318.5, 1568]
    for (const f of chord)
      s.tone(out, t + 0.3, { wave: 'pulse25', freq: f * p, dur: 0.65, hold: 0.2, gain: 0.055, vibrato: 12, filter: { type: 'lowpass', freq: 5000 } })
    s.tone(out, t, { wave: 'triangle', freq: 261.6 * p, dur: 0.26, hold: 0.15, gain: 0.18 })
    s.tone(out, t + 0.3, { wave: 'triangle', freq: 523.25 * p, dur: 0.6, hold: 0.2, gain: 0.16 })
    s.noise(out, t + 0.3, { dur: 0.5, gain: 0.04, filter: { type: 'highpass', freq: 8000 } })
  },

  /** A wobbly hinge creak, then sparkles as the lid opens. */
  chest(s, out, t, p) {
    s.tone(out, t, {
      wave: 'sawtooth',
      freq: 85 * p,
      to: 150 * p,
      dur: 0.4,
      gain: 0.4,
      attack: 0.04,
      vibrato: 70,
      vibratoRate: 17,
      filter: { type: 'bandpass', freq: 900, q: 6 },
    })
    const sparkle = [2093, 2637, 3136, 3520, 4186]
    for (let i = 0; i < 6; i++) s.tone(out, t + 0.3 + i * 0.07, { wave: 'sine', freq: pick(sparkle) * p, dur: 0.14, gain: 0.09 })
  },

  /** A strummed major chord; higher rarities are higher, brighter and shimmer. */
  rarity(s, out, t, p) {
    const b = brightness(p)
    const root = 392 * p
    const ratios = [1, 1.25, 1.5, 2]
    for (let i = 0; i < ratios.length; i++)
      s.tone(out, t + i * 0.04, {
        wave: 'pulse25',
        freq: root * ratios[i],
        dur: 0.8,
        hold: 0.25,
        gain: 0.07,
        vibrato: 10,
        filter: { type: 'lowpass', freq: 1300 + 5200 * b },
      })
    s.tone(out, t, { wave: 'triangle', freq: root / 2, dur: 0.6, hold: 0.15, gain: 0.15 })
    if (b > 0.4) for (let i = 0; i < 3; i++) s.tone(out, t + 0.15 + i * 0.08, { wave: 'sine', freq: root * (4 + i), dur: 0.5, gain: 0.03 * b })
  },

  /** A short buzzy grunt. */
  hurt(s, out, t, p) {
    s.tone(out, t, { wave: 'sawtooth', freq: 210 * p, to: 95 * p, glide: 0.18, dur: 0.22, gain: 0.3, vibrato: 80, vibratoRate: 30, filter: { type: 'lowpass', freq: 1100 } })
    s.tone(out, t, { wave: 'square', freq: 105 * p, to: 60 * p, dur: 0.18, gain: 0.14, filter: { type: 'lowpass', freq: 600 } })
    s.noise(out, t, { dur: 0.06, gain: 0.3, filter: { type: 'lowpass', freq: 800 } })
  },

  /** A springy boing. */
  jump(s, out, t, p) {
    s.tone(out, t, { wave: 'sine', freq: 260 * p, to: 620 * p, glide: 0.12, dur: 0.16, gain: 0.18, vibrato: 50, vibratoRate: 28 })
    s.tone(out, t, { wave: 'triangle', freq: 520 * p, to: 1240 * p, dur: 0.08, gain: 0.04 })
  },

  land(s, out, t, p) {
    s.tone(out, t, { wave: 'sine', freq: 140 * p, to: 48 * p, glide: 0.1, dur: 0.16, gain: 0.42 })
    s.noise(out, t, { dur: 0.09, gain: 0.22, filter: { type: 'lowpass', freq: 700, to: 200 } })
  },

  /** Grit dragged over ground. */
  slide(s, out, t, p) {
    s.noise(out, t, { dur: 0.32, gain: 0.4, attack: 0.02, hold: 0.12, filter: { type: 'bandpass', freq: 1400 * p, to: 900 * p, q: 2.5 } })
    s.noise(out, t, { dur: 0.22, gain: 0.08, crackle: 10, filter: { type: 'highpass', freq: 5000 } })
  },

  /** A bell-like shimmer over a soft pad. */
  shrine(s, out, t, p) {
    const bells = [1046.5, 1318.5, 1568, 2093, 2637]
    for (let i = 0; i < bells.length; i++)
      s.tone(out, t + i * 0.07, { wave: 'sine', freq: bells[i] * p, dur: 0.8, gain: 0.05, attack: 0.02, vibrato: 15, vibratoRate: 6 })
    s.tone(out, t, { wave: 'triangle', freq: 523.25 * p, dur: 1.0, attack: 0.2, hold: 0.3, gain: 0.07 })
    s.noise(out, t, { dur: 1.0, gain: 0.025, attack: 0.3, filter: { type: 'highpass', freq: 7000 } })
  },

  /** Detuned saws with a fast wobble: a growl that falls away. */
  bossRoar(s, out, t, p) {
    const growl = { type: 'lowpass', freq: 900, to: 350, q: 3 } as const
    s.tone(out, t, { wave: 'sawtooth', freq: 95 * p, to: 55 * p, glide: 1.2, dur: 1.5, attack: 0.08, hold: 0.5, gain: 0.28, vibrato: 120, vibratoRate: 22, filter: growl })
    s.tone(out, t, { wave: 'sawtooth', freq: 98 * p, to: 57 * p, glide: 1.2, dur: 1.5, attack: 0.08, hold: 0.5, gain: 0.2, vibrato: 90, vibratoRate: 19, filter: growl })
    s.tone(out, t, { wave: 'square', freq: 48 * p, to: 30 * p, dur: 1.4, attack: 0.1, hold: 0.4, gain: 0.14, filter: { type: 'lowpass', freq: 300 } })
    s.noise(out, t, { dur: 1.3, gain: 0.22, attack: 0.1, hold: 0.3, filter: { type: 'bandpass', freq: 520, to: 200, q: 1 } })
  },

  /** A swirling whoosh rising into the portal. */
  portal(s, out, t, p) {
    s.noise(out, t, { dur: 1.15, gain: 0.28, attack: 0.2, hold: 0.3, filter: { type: 'bandpass', freq: 300 * p, to: 3200 * p, q: 3, lfo: { rate: 7, depth: 300 } } })
    s.tone(out, t, { wave: 'sine', freq: 220 * p, to: 880 * p, dur: 1.1, attack: 0.1, gain: 0.1, vibrato: 30, vibratoRate: 7 })
    s.tone(out, t, { wave: 'sine', freq: 330 * p, to: 1320 * p, dur: 1.1, attack: 0.1, gain: 0.06, vibrato: 30, vibratoRate: 7 })
  },

  uiMove(s, out, t, p) {
    s.tone(out, t, { wave: 'square', freq: 1900 * p, dur: 0.025, gain: 0.06, filter: { type: 'lowpass', freq: 6000 } })
  },

  uiSelect(s, out, t, p) {
    const soft = { type: 'lowpass', freq: 5000 } as const
    s.tone(out, t, { wave: 'square', freq: 880 * p, dur: 0.07, hold: 0.03, gain: 0.07, filter: soft })
    s.tone(out, t + 0.07, { wave: 'square', freq: 1320 * p, dur: 0.13, hold: 0.03, gain: 0.07, filter: soft })
  },

  /** Four sad steps down, the last one drooping. */
  death(s, out, t, p) {
    const steps = [392, 370, 349.2, 329.6]
    for (let i = 0; i < steps.length; i++) {
      const last = i === steps.length - 1
      const at = t + i * 0.3
      const dur = last ? 0.95 : 0.28
      const f = steps[i] * p
      s.tone(out, at, {
        wave: 'pulse25',
        freq: f,
        to: last ? f * 0.93 : undefined,
        glide: 0.8,
        dur,
        hold: last ? 0.4 : 0.15,
        gain: 0.14,
        vibrato: last ? 40 : 0,
        vibratoRate: 5,
        filter: { type: 'lowpass', freq: 2000 },
      })
      s.tone(out, at, { wave: 'triangle', freq: f / 2, dur, hold: last ? 0.4 : 0.15, gain: 0.17 })
    }
  },

  /** A bright little fanfare. */
  victory(s, out, t, p) {
    const lead: ReadonlyArray<[number, number, number]> = [
      [0, 392, 0.1],
      [0.1, 523.25, 0.1],
      [0.2, 659.25, 0.1],
      [0.3, 784, 0.24],
      [0.55, 659.25, 0.12],
      [0.67, 784, 1.2],
    ]
    for (const [at, f, dur] of lead)
      s.tone(out, t + at, { wave: 'pulse25', freq: f * p, dur, hold: dur * 0.5, gain: 0.1, vibrato: dur > 1 ? 18 : 0, filter: { type: 'lowpass', freq: 4500 } })
    for (const f of [523.25, 659.25]) s.tone(out, t + 0.67, { wave: 'triangle', freq: f * p, dur: 1.3, hold: 0.5, gain: 0.07 })
    const bass: ReadonlyArray<[number, number]> = [
      [0, 130.8],
      [0.3, 196],
      [0.67, 261.6],
    ]
    for (const [at, f] of bass) s.tone(out, t + at, { wave: 'triangle', freq: f * p, dur: at > 0.5 ? 1.3 : 0.3, hold: 0.15, gain: 0.18 })
    s.noise(out, t + 0.67, { dur: 1.2, gain: 0.06, filter: { type: 'highpass', freq: 5000 } })
  },
}
