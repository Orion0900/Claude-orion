import type { AudioEngine } from './engine'

/**
 * Short synthesised sound effects on the effects bus. Each call builds a few
 * nodes that stop on their own; nothing is kept.
 */

export type SfxName = 'miss' | 'starReady' | 'starActivate' | 'starGain' | 'tick' | 'select' | 'click' | 'accent' | 'count' | 'fail' | 'cheer'

let noise: AudioBuffer | null = null

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noise
}

function envelope(ctx: AudioContext, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  return g
}

function tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, freq: number, to: number, peak: number, attack: number, decay: number): void {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay)
  const env = envelope(ctx, t, peak, attack, decay)
  osc.connect(env).connect(out)
  osc.start(t)
  osc.stop(t + attack + decay + 0.05)
}

function hiss(ctx: AudioContext, out: AudioNode, t: number, filter: BiquadFilterType, from: number, to: number, q: number, peak: number, attack: number, decay: number): void {
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx)
  const f = ctx.createBiquadFilter()
  f.type = filter
  f.Q.value = q
  f.frequency.setValueAtTime(from, t)
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay)
  const env = envelope(ctx, t, peak, attack, decay)
  src.connect(f).connect(env).connect(out)
  src.start(t, Math.random() * 0.5)
  src.stop(t + attack + decay + 0.05)
}

export function playSfx(engine: AudioEngine, name: SfxName): void {
  const ctx = engine.ctx
  const out = engine.sfx
  if (!ctx || !out || ctx.state !== 'running') return
  const t = ctx.currentTime + 0.005
  switch (name) {
    case 'miss':
      // A dead, fretted-wrong thunk.
      tone(ctx, out, t, 'triangle', 150, 70, 0.35, 0.003, 0.12)
      hiss(ctx, out, t, 'bandpass', 900, 400, 1.5, 0.25, 0.002, 0.08)
      return
    case 'starReady':
      tone(ctx, out, t, 'sine', 988, 988, 0.18, 0.005, 0.25)
      tone(ctx, out, t + 0.08, 'sine', 1480, 1480, 0.15, 0.005, 0.35)
      return
    case 'starActivate':
      hiss(ctx, out, t, 'bandpass', 300, 5000, 2, 0.5, 0.05, 0.6)
      tone(ctx, out, t, 'sawtooth', 220, 880, 0.08, 0.02, 0.5)
      tone(ctx, out, t + 0.1, 'sine', 1760, 1760, 0.12, 0.01, 0.6)
      return
    case 'starGain':
      tone(ctx, out, t, 'sine', 1319, 1319, 0.14, 0.004, 0.22)
      tone(ctx, out, t + 0.05, 'sine', 1976, 1976, 0.1, 0.004, 0.3)
      return
    case 'tick':
      tone(ctx, out, t, 'sine', 1400, 1400, 0.06, 0.002, 0.03)
      return
    case 'select':
      tone(ctx, out, t, 'triangle', 660, 990, 0.12, 0.004, 0.09)
      return
    case 'click':
      tone(ctx, out, t, 'square', 1000, 1000, 0.12, 0.001, 0.025)
      return
    case 'accent':
      tone(ctx, out, t, 'square', 1600, 1600, 0.18, 0.001, 0.03)
      return
    case 'count':
      tone(ctx, out, t, 'sine', 880, 880, 0.2, 0.004, 0.14)
      return
    case 'fail':
      tone(ctx, out, t, 'sawtooth', 330, 80, 0.15, 0.01, 1.0)
      hiss(ctx, out, t, 'lowpass', 2000, 200, 0.7, 0.2, 0.02, 0.9)
      return
    case 'cheer':
      hiss(ctx, out, t, 'bandpass', 1400, 1100, 0.6, 0.3, 0.3, 1.8)
      hiss(ctx, out, t + 0.1, 'bandpass', 2600, 2200, 0.8, 0.2, 0.3, 1.6)
      return
  }
}

/** A metronome click scheduled at an exact audio-context time (calibration). */
export function scheduleClick(engine: AudioEngine, at: number, accent: boolean): void {
  const ctx = engine.ctx
  const out = engine.sfx
  if (!ctx || !out) return
  tone(ctx, out, at, 'square', accent ? 1600 : 1000, accent ? 1600 : 1000, accent ? 0.22 : 0.15, 0.001, 0.03)
}
