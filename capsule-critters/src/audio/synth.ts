import type { Patch, WaveShape } from './instruments'
import { midiToFreq, type DrumId } from './notation'

/**
 * The sound chip, built from WebAudio nodes. Pulse waves come from Fourier
 * series at 12.5%, 25% and 50% duty; the wave channel's timbres are 32-step
 * four-bit tables, transformed with their staircase intact so they keep
 * that gritty handheld edge; the noise channel is a linear-feedback shift
 * register, long (hiss) or short (buzzy "metal" noise), exactly as the
 * hardware makes it.
 *
 * Every call wires a few short-lived nodes into `out` that stop by
 * themselves, so there is nothing to clean up afterwards.
 */

export type ToneWave = WaveShape | 'sine' | 'triangle' | 'square' | 'sawtooth'

export interface FilterOpts {
  type: BiquadFilterType
  freq: number
  /** Exponential sweep target. */
  to?: number
  /** Seconds the sweep takes (default: the whole sound). */
  sweep?: number
  q?: number
}

export interface ToneOpts {
  wave: ToneWave
  freq: number
  /** Glide target in Hz. */
  to?: number
  /** Seconds the glide takes (default: the whole sound). */
  glide?: number
  /** Makes the glide a staircase of this many jumps, like the handheld's hardware sweep. */
  steps?: number
  /** A pitch path instead: [seconds from the start, Hz] points joined by glides. */
  points?: ReadonlyArray<readonly [number, number]>
  /** Jump between `points` instead of gliding (trills). */
  stepped?: boolean
  /** Seconds, fade included. */
  dur: number
  gain: number
  /** Seconds to reach full gain (default 3 ms). */
  attack?: number
  /** Seconds held at full gain before the fade. */
  hold?: number
  /** Pitch wobble: Hz, cents either side, and seconds before it starts. */
  vibrato?: { rate: number; depth: number; delay?: number }
  /** Volume wobble: Hz and depth 0-1. */
  tremolo?: { rate: number; depth: number }
  filter?: FilterOpts
  /** Cents. */
  detune?: number
}

export interface NoiseOpts {
  dur: number
  gain: number
  attack?: number
  hold?: number
  /** 'white' is the long register (hiss), 'metal' the short one (buzzy, tonal). */
  color?: 'white' | 'metal'
  /** Playback rate: below 1 is duller and grainier. */
  rate?: number
  /** Glides the rate over the sound. */
  rateTo?: number
  filter?: FilterOpts
  /** Chops the noise into this many random-level steps: crackle and sizzle. */
  crackle?: number
}

/** Envelopes ramp from and to this; exponential ramps can't touch zero. */
const SILENT = 0.0001

/** The wave channel's 32-step, 16-level tables. */
export const WAVE_TABLES: Readonly<Record<'tri' | 'saw' | 'soft' | 'organ', readonly number[]>> = {
  tri: Array.from({ length: 32 }, (_, i) => (i < 16 ? i : 31 - i)),
  saw: Array.from({ length: 32 }, (_, i) => i >> 1),
  soft: Array.from({ length: 32 }, (_, i) => Math.round(7.5 + 7.5 * Math.sin((2 * Math.PI * i) / 32))),
  organ: quantise((i) => {
    const x = (2 * Math.PI * i) / 32
    return Math.sin(x) + 0.55 * Math.sin(2 * x) + 0.3 * Math.sin(3 * x) + 0.18 * Math.sin(4 * x)
  }),
}

function quantise(f: (i: number) => number): number[] {
  const raw = Array.from({ length: 32 }, (_, i) => f(i))
  const peak = Math.max(...raw.map(Math.abs)) || 1
  return raw.map((v) => Math.round(7.5 + (7.5 * v) / peak))
}

/**
 * Fourier coefficients of a stepped table played as a staircase (each
 * sample held for 1/N of the cycle): [cosine terms, sine terms].
 */
export function tableSeries(table: readonly number[], harmonics: number): [Float32Array, Float32Array] {
  const n = table.length
  const mean = table.reduce((a, b) => a + b, 0) / n
  const real = new Float32Array(harmonics + 1)
  const imag = new Float32Array(harmonics + 1)
  for (let h = 1; h <= harmonics; h++) {
    let a = 0
    let b = 0
    for (let k = 0; k < n; k++) {
      const v = table[k] - mean
      const t0 = (2 * Math.PI * h * k) / n
      const t1 = (2 * Math.PI * h * (k + 1)) / n
      a += v * (Math.sin(t1) - Math.sin(t0))
      b += v * (Math.cos(t0) - Math.cos(t1))
    }
    real[h] = a / (Math.PI * h)
    imag[h] = b / (Math.PI * h)
  }
  return [real, imag]
}

/** Fourier coefficients of a pulse wave with the given duty cycle. */
export function pulseSeries(duty: number, harmonics: number): [Float32Array, Float32Array] {
  const real = new Float32Array(harmonics + 1)
  const imag = new Float32Array(harmonics + 1)
  for (let h = 1; h <= harmonics; h++) real[h] = (2 / (h * Math.PI)) * Math.sin(h * Math.PI * duty)
  return [real, imag]
}

const DUTIES: Readonly<Record<string, number>> = { pulse12: 0.125, pulse25: 0.25, pulse50: 0.5 }
const NATIVE = new Set<string>(['sine', 'triangle', 'square', 'sawtooth'])

function safeFreq(f: number): number {
  return Number.isFinite(f) ? Math.min(20000, Math.max(10, f)) : 440
}

export class ChipSynth {
  private readonly waves = new Map<string, PeriodicWave>()
  private readonly buffers = new Map<string, AudioBuffer>()

  constructor(readonly ac: BaseAudioContext) {}

  /** One note of a song, shaped by its instrument. `bends` times are seconds from the start. */
  note(
    out: AudioNode,
    t: number,
    p: Patch,
    midi: number,
    dur: number,
    vel: number,
    arp: readonly number[] | null,
    bends: ReadonlyArray<{ at: number; midi: number; glide: number }> | null,
  ): void {
    const ac = this.ac
    const osc = ac.createOscillator()
    this.setWave(osc, p.wave)
    const f = midiToFreq(midi)
    const freq = osc.frequency
    freq.setValueAtTime(f, t)
    const attack = Math.max(0.001, Math.min(p.attack, dur * 0.5))
    const end = t + dur + p.release * 2 + 0.02
    if (arp && arp.length > 1) {
      const step = p.arpStep ?? 1 / 45
      const n = Math.min(600, Math.ceil((end - t) / step))
      for (let k = 1; k < n; k++) freq.setValueAtTime(midiToFreq(midi + arp[k % arp.length]), t + k * step)
    } else if (bends) {
      let prev = f
      for (const b of bends) {
        const next = midiToFreq(b.midi)
        if (b.glide > 0) {
          freq.setValueAtTime(prev, t + b.at)
          freq.exponentialRampToValueAtTime(next, t + b.at + b.glide)
        } else freq.setValueAtTime(next, t + b.at)
        prev = next
      }
    }
    if (p.scoop) {
      osc.detune.setValueAtTime(-p.scoop, t)
      osc.detune.linearRampToValueAtTime(0, t + 0.05)
    }
    const v = p.vibrato
    if (v && dur > v.delay + 0.1) this.lfo(osc.detune, t + v.delay, end, v.rate, v.depth, 0.15)

    const env = ac.createGain()
    const g = env.gain
    const peak = Math.max(SILENT, p.level * vel)
    g.setValueAtTime(0, t)
    g.linearRampToValueAtTime(peak, t + attack)
    if (p.sustain < 1) g.setTargetAtTime(peak * p.sustain, t + attack, Math.max(0.004, p.decay / 3))
    g.setTargetAtTime(0, Math.max(t + attack, t + dur), Math.max(0.004, p.release / 3))
    osc.connect(env)
    env.connect(out)
    osc.start(t)
    osc.stop(end)
  }

  /** One hit on the noise channel's kit; `level` scales it (velocity times the kit's level). */
  drum(out: AudioNode, t: number, id: DrumId, level: number): void {
    const l = Math.max(0, level)
    switch (id) {
      case 'kick':
        this.tone(out, t, { wave: 'triangle', freq: 170, to: 46, glide: 0.07, dur: 0.17, gain: 0.46 * l })
        this.noise(out, t, { dur: 0.02, gain: 0.18 * l, filter: { type: 'lowpass', freq: 2400 } })
        return
      case 'snare':
        this.noise(out, t, { dur: 0.15, gain: 0.3 * l, filter: { type: 'highpass', freq: 1500 } })
        this.tone(out, t, { wave: 'triangle', freq: 230, to: 150, dur: 0.07, gain: 0.24 * l })
        return
      case 'hat':
        this.noise(out, t, { dur: 0.035, gain: 0.1 * l, filter: { type: 'highpass', freq: 7500 } })
        return
      case 'open':
        this.noise(out, t, { dur: 0.2, gain: 0.08 * l, filter: { type: 'highpass', freq: 6500 } })
        return
      case 'crash':
        this.noise(out, t, { dur: 1.1, gain: 0.12 * l, filter: { type: 'highpass', freq: 4200 } })
        this.noise(out, t, { dur: 0.5, gain: 0.05 * l, color: 'metal', rate: 7, filter: { type: 'highpass', freq: 3000 } })
        return
      case 'tomLo':
        this.tone(out, t, { wave: 'triangle', freq: 150, to: 80, dur: 0.22, gain: 0.48 * l })
        this.noise(out, t, { dur: 0.03, gain: 0.08 * l, filter: { type: 'lowpass', freq: 1500 } })
        return
      case 'tomHi':
        this.tone(out, t, { wave: 'triangle', freq: 240, to: 140, dur: 0.17, gain: 0.44 * l })
        this.noise(out, t, { dur: 0.03, gain: 0.08 * l, filter: { type: 'lowpass', freq: 2200 } })
        return
      case 'shaker':
        this.noise(out, t, { dur: 0.06, gain: 0.07 * l, attack: 0.02, filter: { type: 'bandpass', freq: 6500, q: 1.2 } })
        return
      case 'clap':
        for (const d of [0, 0.011, 0.022]) this.noise(out, t + d, { dur: 0.02, gain: 0.2 * l, filter: { type: 'bandpass', freq: 1400, q: 1.4 } })
        this.noise(out, t + 0.03, { dur: 0.13, gain: 0.17 * l, filter: { type: 'bandpass', freq: 1250, q: 1.1 } })
        return
      case 'block':
        this.tone(out, t, { wave: 'sine', freq: 1180, dur: 0.05, gain: 0.2 * l })
        this.tone(out, t, { wave: 'pulse50', freq: 2360, dur: 0.02, gain: 0.04 * l })
        return
      case 'conga':
        this.tone(out, t, { wave: 'triangle', freq: 330, to: 245, glide: 0.05, dur: 0.16, gain: 0.34 * l })
        return
    }
  }

  /** A single synthesised tone: blips, sweeps, chimes and voices. */
  tone(out: AudioNode, t: number, o: ToneOpts): void {
    const ac = this.ac
    const osc = ac.createOscillator()
    this.setWave(osc, o.wave)
    const freq = osc.frequency
    const f0 = safeFreq(o.points && o.points.length > 0 ? o.points[0][1] : o.freq)
    freq.setValueAtTime(f0, t)
    if (o.points && o.points.length > 1) {
      for (let i = 1; i < o.points.length; i++) {
        const [at, hz] = o.points[i]
        const when = t + Math.max(0.001, Math.min(o.dur, at))
        if (o.stepped) freq.setValueAtTime(safeFreq(hz), when)
        else freq.exponentialRampToValueAtTime(safeFreq(hz), when)
      }
    } else if (o.to !== undefined) {
      const f1 = safeFreq(o.to)
      const span = Math.max(0.001, Math.min(o.glide ?? o.dur, o.dur))
      if (o.steps && o.steps > 1) {
        for (let k = 1; k <= o.steps; k++) freq.setValueAtTime(f0 * Math.pow(f1 / f0, k / o.steps), t + (span * k) / o.steps)
      } else freq.exponentialRampToValueAtTime(f1, t + span)
    }
    if (o.detune) osc.detune.setValueAtTime(o.detune, t)
    const end = t + Math.max(0.005, o.dur)
    if (o.vibrato && o.vibrato.depth > 0) this.lfo(osc.detune, t + (o.vibrato.delay ?? 0), end, o.vibrato.rate, o.vibrato.depth)

    let tail: AudioNode = osc
    if (o.filter) {
      const f = this.filter(t, o.dur, o.filter)
      tail.connect(f)
      tail = f
    }
    if (o.tremolo && o.tremolo.depth > 0) {
      const trem = ac.createGain()
      const depth = Math.min(1, o.tremolo.depth) / 2
      trem.gain.setValueAtTime(1 - depth, t)
      this.lfo(trem.gain, t, end, o.tremolo.rate, depth)
      tail.connect(trem)
      tail = trem
    }
    const env = ac.createGain()
    this.envelope(env.gain, t, o.dur, o.gain, o.attack ?? 0.003, o.hold ?? 0)
    tail.connect(env)
    env.connect(out)
    osc.start(t)
    osc.stop(end + 0.02)
  }

  /** Shift-register noise with an envelope: drums, hiss, whooshes, crackle. */
  noise(out: AudioNode, t: number, o: NoiseOpts): void {
    const ac = this.ac
    const src = ac.createBufferSource()
    const buffer = this.noiseBuffer(o.color ?? 'white')
    src.buffer = buffer
    src.loop = true
    if (o.rate !== undefined) {
      src.playbackRate.setValueAtTime(Math.max(0.01, o.rate), t)
      if (o.rateTo !== undefined) src.playbackRate.exponentialRampToValueAtTime(Math.max(0.01, o.rateTo), t + Math.max(0.005, o.dur))
    }
    let tail: AudioNode = src
    if (o.filter) {
      const f = this.filter(t, o.dur, o.filter)
      tail.connect(f)
      tail = f
    }
    if (o.crackle && o.crackle > 0) {
      const chop = ac.createGain()
      const steps = Math.min(200, Math.floor(o.crackle))
      for (let i = 0; i < steps; i++) chop.gain.setValueAtTime(Math.random() < 0.35 ? 0.05 : 0.4 + Math.random() * 0.6, t + (i / steps) * o.dur)
      tail.connect(chop)
      tail = chop
    }
    const env = ac.createGain()
    this.envelope(env.gain, t, o.dur, o.gain, o.attack ?? 0.002, o.hold ?? 0)
    tail.connect(env)
    env.connect(out)
    // A random start so repeated hits don't share the exact same grain.
    src.start(t, Math.random() * buffer.duration * 0.9)
    src.stop(t + Math.max(0.005, o.dur) + 0.02)
  }

  /** Ramp up, hold, then an exponential fall to silence at `t + dur`. */
  private envelope(param: AudioParam, t: number, dur: number, peak: number, attack: number, hold: number): void {
    const top = Math.max(SILENT * 2, Number.isFinite(peak) ? peak : 0)
    const d = Math.max(0.005, dur)
    const a = Math.max(0.001, Math.min(attack, d * 0.5))
    const h = Math.max(0, Math.min(hold, d - a - 0.004))
    param.setValueAtTime(SILENT, t)
    param.linearRampToValueAtTime(top, t + a)
    if (h > 0) param.setValueAtTime(top, t + a + h)
    param.exponentialRampToValueAtTime(SILENT, t + Math.max(d, a + h + 0.004))
  }

  private filter(t: number, dur: number, o: FilterOpts): BiquadFilterNode {
    const f = this.ac.createBiquadFilter()
    f.type = o.type
    f.frequency.setValueAtTime(safeFreq(o.freq), t)
    if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(safeFreq(o.to), t + Math.max(0.001, Math.min(o.sweep ?? dur, dur)))
    if (o.q !== undefined) f.Q.setValueAtTime(o.q, t)
    return f
  }

  /** A sine wobble added onto `param` from `start` to `end`, fading in over `fade` seconds. */
  private lfo(param: AudioParam, start: number, end: number, rate: number, depth: number, fade = 0): void {
    if (!(end > start)) return
    const ac = this.ac
    const osc = ac.createOscillator()
    osc.frequency.setValueAtTime(Math.max(0.1, rate), start)
    const amount = ac.createGain()
    if (fade > 0) {
      amount.gain.setValueAtTime(0, start)
      amount.gain.linearRampToValueAtTime(depth, start + fade)
    } else amount.gain.setValueAtTime(depth, start)
    osc.connect(amount)
    amount.connect(param)
    osc.start(start)
    osc.stop(end + 0.02)
  }

  private setWave(osc: OscillatorNode, wave: ToneWave): void {
    if (NATIVE.has(wave)) {
      osc.type = wave as OscillatorType
      return
    }
    osc.setPeriodicWave(this.periodic(wave as WaveShape))
  }

  private periodic(shape: WaveShape): PeriodicWave {
    let wave = this.waves.get(shape)
    if (!wave) {
      const duty = DUTIES[shape]
      const table = (WAVE_TABLES as Record<string, readonly number[]>)[shape]
      const [real, imag] = duty !== undefined ? pulseSeries(duty, 48) : tableSeries(table ?? WAVE_TABLES.tri, 64)
      wave = this.ac.createPeriodicWave(real, imag)
      this.waves.set(shape, wave)
    }
    return wave
  }

  private noiseBuffer(color: 'white' | 'metal'): AudioBuffer {
    let buffer = this.buffers.get(color)
    if (!buffer) {
      buffer = lfsrNoise(this.ac, color === 'metal')
      this.buffers.set(color, buffer)
    }
    return buffer
  }
}

/**
 * The handheld's noise: a 15-bit shift register clocked once per sample
 * (white hiss), or in 7-bit mode clocked every fourth sample, which repeats
 * every 127 steps and buzzes like metal.
 */
function lfsrNoise(ac: BaseAudioContext, short: boolean): AudioBuffer {
  const rate = ac.sampleRate
  const length = Math.max(64, Math.floor(rate * (short ? 0.25 : 1)))
  const buffer = ac.createBuffer(1, length, rate)
  const data = buffer.getChannelData(0)
  const hold = short ? 4 : 1
  let reg = 0x7fff
  for (let i = 0; i < length; i++) {
    if (i % hold === 0) {
      const bit = (reg ^ (reg >> 1)) & 1
      reg = (reg >> 1) | (bit << 14)
      if (short) reg = (reg & ~0x40) | (bit << 6)
    }
    data[i] = reg & 1 ? -0.7 : 0.7
  }
  return buffer
}
