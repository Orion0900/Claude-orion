/**
 * Tiny WebAudio voice builders shared by the sound effects and the music.
 * Every call wires a few short-lived nodes into `out` that stop on their
 * own; nothing is kept, so there is nothing to clean up.
 */

export type Wave = OscillatorType | 'pulse12' | 'pulse25'

export interface FilterOpts {
  type: BiquadFilterType
  freq: number
  /** Exponential sweep target. */
  to?: number
  /** Seconds the sweep takes; defaults to the whole sound. */
  sweep?: number
  q?: number
  /** A wobble on the cutoff: rate in Hz and depth in Hz. */
  lfo?: { rate: number; depth: number }
}

export interface ToneOpts {
  wave: Wave
  freq: number
  /** Exponential glide target in Hz. */
  to?: number
  /** Seconds the glide takes; defaults to the whole note. */
  glide?: number
  /** Total length in seconds, release included. */
  dur: number
  gain: number
  /** Seconds to reach full gain (default 3 ms). */
  attack?: number
  /** Seconds held at full gain before the decay. */
  hold?: number
  /** Vibrato depth in cents and rate in Hz. */
  vibrato?: number
  vibratoRate?: number
  detune?: number
  filter?: FilterOpts
}

export interface NoiseOpts {
  dur: number
  gain: number
  attack?: number
  hold?: number
  filter?: FilterOpts
  /** Chops the noise into this many random-level steps: crackle and sizzle. */
  crackle?: number
}

/** Quietest level envelopes ramp from and to; exponential ramps can't touch zero. */
const SILENT = 0.0001
const NOISE_SECONDS = 2

export class Synth {
  private readonly noiseBuffer: AudioBuffer
  private readonly pulses: Record<'pulse12' | 'pulse25', PeriodicWave>

  constructor(readonly ac: BaseAudioContext) {
    const length = Math.floor(ac.sampleRate * NOISE_SECONDS)
    this.noiseBuffer = ac.createBuffer(1, length, ac.sampleRate)
    const data = this.noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    this.pulses = { pulse12: pulseWave(ac, 0.125), pulse25: pulseWave(ac, 0.25) }
  }

  /** A pitched voice: oscillator → optional filter → envelope → out. */
  tone(out: AudioNode, t: number, o: ToneOpts): void {
    const ac = this.ac
    const osc = ac.createOscillator()
    if (o.wave === 'pulse12' || o.wave === 'pulse25') osc.setPeriodicWave(this.pulses[o.wave])
    else osc.type = o.wave
    const f0 = safeFreq(o.freq)
    osc.frequency.setValueAtTime(f0, t)
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(safeFreq(o.to), t + Math.min(o.glide ?? o.dur, o.dur))
    if (o.detune) osc.detune.setValueAtTime(o.detune, t)
    const end = t + o.dur
    if (o.vibrato) this.lfo(osc.detune, t, end, o.vibratoRate ?? 6, o.vibrato)

    const env = ac.createGain()
    this.envelope(env.gain, t, o.dur, o.gain, o.attack ?? 0.003, o.hold ?? 0)
    const head = o.filter ? this.filter(t, o.dur, o.filter) : null
    if (head) {
      osc.connect(head).connect(env)
    } else osc.connect(env)
    env.connect(out)
    osc.start(t)
    osc.stop(end + 0.02)
  }

  /** Filtered white noise with an envelope: hats, whooshes, booms and crackle. */
  noise(out: AudioNode, t: number, o: NoiseOpts): void {
    const ac = this.ac
    const src = ac.createBufferSource()
    src.buffer = this.noiseBuffer
    const dur = Math.min(o.dur, NOISE_SECONDS - 0.05)
    const env = ac.createGain()
    this.envelope(env.gain, t, dur, o.gain, o.attack ?? 0.002, o.hold ?? 0)
    let tail: AudioNode = src
    if (o.filter) {
      const f = this.filter(t, dur, o.filter)
      tail.connect(f)
      tail = f
    }
    if (o.crackle && o.crackle > 0) {
      const chop = ac.createGain()
      const steps = Math.floor(o.crackle)
      for (let i = 0; i < steps; i++) chop.gain.setValueAtTime(Math.random() < 0.35 ? 0.05 : 0.4 + Math.random() * 0.6, t + (i / steps) * dur)
      tail.connect(chop)
      tail = chop
    }
    tail.connect(env).connect(out)
    // A random slice so repeated hits don't share the exact same grain.
    src.start(t, Math.random() * (NOISE_SECONDS - dur - 0.02), dur + 0.02)
  }

  /** Percussive envelope: ramp up, hold, then an exponential fall to silence at `t + dur`. */
  envelope(param: AudioParam, t: number, dur: number, peak: number, attack: number, hold: number): void {
    const top = Math.max(SILENT * 2, Number.isFinite(peak) ? peak : 0)
    const a = Math.max(0.001, Math.min(attack, dur * 0.5))
    const h = Math.max(0, Math.min(hold, dur - a - 0.005))
    param.setValueAtTime(SILENT, t)
    param.linearRampToValueAtTime(top, t + a)
    if (h > 0) param.setValueAtTime(top, t + a + h)
    param.exponentialRampToValueAtTime(SILENT, t + Math.max(dur, a + h + 0.005))
  }

  private filter(t: number, dur: number, o: FilterOpts): BiquadFilterNode {
    const f = this.ac.createBiquadFilter()
    f.type = o.type
    f.frequency.setValueAtTime(safeFreq(o.freq), t)
    if (o.to !== undefined) f.frequency.exponentialRampToValueAtTime(safeFreq(o.to), t + Math.min(o.sweep ?? dur, dur))
    if (o.q !== undefined) f.Q.setValueAtTime(o.q, t)
    if (o.lfo) this.lfo(f.frequency, t, t + dur, o.lfo.rate, o.lfo.depth)
    return f
  }

  /** A sine wobble added onto `param` between `t` and `end`. */
  private lfo(param: AudioParam, t: number, end: number, rate: number, depth: number): void {
    const osc = this.ac.createOscillator()
    osc.frequency.setValueAtTime(rate, t)
    const amount = this.ac.createGain()
    amount.gain.setValueAtTime(depth, t)
    osc.connect(amount).connect(param)
    osc.start(t)
    osc.stop(end + 0.02)
  }
}

/** Band-limited pulse wave with the given duty cycle: the NES-style lead timbres. */
function pulseWave(ac: BaseAudioContext, duty: number): PeriodicWave {
  const harmonics = 32
  const real = new Float32Array(harmonics)
  const imag = new Float32Array(harmonics)
  for (let n = 1; n < harmonics; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty)
  return ac.createPeriodicWave(real, imag)
}

function safeFreq(f: number): number {
  return Number.isFinite(f) ? Math.min(20000, Math.max(20, f)) : 440
}
