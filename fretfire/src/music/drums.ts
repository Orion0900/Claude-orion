import { Biquad, makeRng, softClip } from './dsp'
import type { DrumKind } from './types'

/**
 * The drum kit, synthesised once per render into one-shot samples; each hit
 * is then just a scaled copy, which keeps a busy drum track nearly free.
 */

export type DrumBank = Record<DrumKind, Float32Array[]>

/** Classic six-oscillator metallic cluster, as in analog hi-hats. */
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800]

export function makeDrumBank(sampleRate: number, seed = 1): DrumBank {
  const rng = makeRng(seed)
  const noise = () => rng() * 2 - 1
  const sr = sampleRate
  const make = (seconds: number, fn: (t: number, i: number) => number): Float32Array => {
    const out = new Float32Array(Math.round(seconds * sr))
    for (let i = 0; i < out.length; i++) out[i] = fn(i / sr, i)
    return normalize(out)
  }

  const kick = () => {
    let phase = 0
    const click = Biquad.highpass(sr, 1500)
    return make(0.45, (t) => {
      const f = 46 + 110 * Math.exp(-t / 0.028) + 20 * Math.exp(-t / 0.2)
      phase += (2 * Math.PI * f) / sr
      const attack = Math.min(1, t / 0.001)
      const body = Math.sin(phase) * Math.exp(-t / 0.32) * attack
      const tick = click.process(noise()) * Math.exp(-t / 0.0025) * 0.6
      return softClip(1.8 * (body + tick))
    })
  }

  const snare = () => {
    const hp = Biquad.highpass(sr, 1400)
    const lp = Biquad.lowpass(sr, 9000)
    return make(0.34, (t) => {
      const tone = (Math.sin(2 * Math.PI * 185 * t) * 0.6 + Math.sin(2 * Math.PI * 330 * t) * 0.3) * Math.exp(-t / 0.055)
      const rattle = lp.process(hp.process(noise())) * (Math.exp(-t / 0.11) * 0.9 + Math.exp(-t / 0.012) * 0.5)
      return tone * 0.55 + rattle
    })
  }

  const metal = (seconds: number, decay: number, low: number, pitch: number, noiseMix: number) => {
    const hp = Biquad.highpass(sr, low)
    const hp2 = Biquad.highpass(sr, low)
    const phases = METAL.map(() => rng())
    return make(seconds, (t) => {
      let m = 0
      for (let k = 0; k < METAL.length; k++) m += Math.sin(2 * Math.PI * (METAL[k] * pitch * t + phases[k])) > 0 ? 1 : -1
      const x = (m / METAL.length) * (1 - noiseMix) + noise() * noiseMix
      const attack = Math.min(1, t / 0.0006)
      return hp2.process(hp.process(x)) * Math.exp(-t / decay) * attack
    })
  }

  const ride = () => {
    const shimmer = metal(1.1, 0.4, 5000, 0.8, 0.35)
    for (let i = 0; i < shimmer.length; i++) {
      const t = i / sr
      shimmer[i] = shimmer[i] * 0.85 + Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-t / 0.3) * 0.18
    }
    return normalize(shimmer)
  }

  const tom = (from: number, to: number) => {
    let phase = 0
    const lp = Biquad.lowpass(sr, 1200)
    return make(0.5, (t) => {
      const f = to + (from - to) * Math.exp(-t / 0.06)
      phase += (2 * Math.PI * f) / sr
      return softClip(1.3 * (Math.sin(phase) * Math.exp(-t / 0.22) + lp.process(noise()) * Math.exp(-t / 0.03) * 0.3))
    })
  }

  const stick = () => {
    const bp = Biquad.bandpass(sr, 2500, 2)
    return make(0.06, (t) => bp.process(noise()) * Math.exp(-t / 0.012) * 2 + Math.sin(2 * Math.PI * 1900 * t) * Math.exp(-t / 0.008))
  }

  return {
    kick: [kick()],
    snare: [snare(), snare()],
    hat: [metal(0.09, 0.018, 7000, 1, 0.45), metal(0.09, 0.02, 7000, 1.02, 0.45)],
    open: [metal(0.55, 0.17, 6500, 1, 0.45)],
    crash: [metal(2.2, 0.7, 4200, 0.72, 0.6), metal(2.2, 0.72, 4200, 0.74, 0.6)],
    ride: [ride()],
    tomHi: [tom(230, 170)],
    tomMid: [tom(170, 125)],
    tomLo: [tom(125, 88)],
    stick: [stick()],
  }
}

function normalize(buf: Float32Array): Float32Array {
  let peak = 0
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
  if (peak > 0) for (let i = 0; i < buf.length; i++) buf[i] /= peak
  return buf
}
