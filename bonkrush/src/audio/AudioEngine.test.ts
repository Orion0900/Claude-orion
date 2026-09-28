import type { SfxId } from '../game/types'
import { AudioEngine } from './AudioEngine'
import { playNote } from './instruments'
import { SFX_RULES } from './limiter'
import { STEPS_PER_BAR, eventsAt, songForStage, stepDuration, type NoteEvent } from './sequencer'
import { SFX } from './sfx'
import { Synth } from './synth'

/**
 * A strict stand-in for WebAudio: it throws where a browser would (non-finite
 * values, exponential ramps to zero, stopping before starting) and records
 * when every source starts and stops.
 */
class FakeParam {
  private v: number
  constructor(v = 0) {
    this.v = v
  }
  get value(): number {
    return this.v
  }
  set value(v: number) {
    finite(v)
    this.v = v
  }
  setValueAtTime(v: number, t: number) {
    finite(v, t)
    return this
  }
  linearRampToValueAtTime(v: number, t: number) {
    finite(v, t)
    return this
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    finite(v, t)
    if (v === 0) throw new RangeError('exponential ramp to zero')
    return this
  }
  setTargetAtTime(v: number, t: number, c: number) {
    finite(v, t, c)
    if (c < 0) throw new RangeError('negative time constant')
    return this
  }
  cancelScheduledValues(t: number) {
    finite(t)
    return this
  }
}

function finite(...values: number[]): void {
  for (const v of values) if (!Number.isFinite(v)) throw new TypeError(`non-finite ${v}`)
}

class FakeNode {
  constructor(readonly ctx: FakeContext) {
    ctx.nodes++
  }
  connect<T>(target: T): T {
    return target
  }
  disconnect(): void {}
}

class FakeSource extends FakeNode {
  private index = -1
  start(t = 0, offset = 0, duration?: number) {
    finite(t, offset)
    if (offset < 0) throw new RangeError('negative offset')
    if (duration !== undefined && !(duration >= 0)) throw new RangeError('bad duration')
    this.index = this.ctx.sources.push({ start: t, stop: duration === undefined ? Infinity : t + duration }) - 1
  }
  stop(t = 0) {
    finite(t)
    if (this.index < 0) throw new Error('stop before start')
    this.ctx.sources[this.index].stop = t
  }
}

class FakeOsc extends FakeSource {
  type = 'sine'
  frequency = new FakeParam(440)
  detune = new FakeParam(0)
  setPeriodicWave(): void {}
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1)
}

class FakeFilter extends FakeNode {
  type = 'lowpass'
  frequency = new FakeParam(350)
  Q = new FakeParam(1)
}

class FakeDelay extends FakeNode {
  delayTime = new FakeParam(0)
}

class FakeCompressor extends FakeNode {
  threshold = new FakeParam()
  knee = new FakeParam()
  ratio = new FakeParam()
  attack = new FakeParam()
  release = new FakeParam()
}

class FakeContext {
  static lastMade: FakeContext | null = null
  currentTime = 1
  sampleRate = 4000
  state: 'running' | 'suspended' | 'closed' = 'running'
  nodes = 0
  resumed = 0
  sources: Array<{ start: number; stop: number }> = []
  destination: FakeNode
  constructor() {
    this.destination = new FakeNode(this)
    FakeContext.lastMade = this
  }
  createGain() {
    return new FakeGain(this)
  }
  createOscillator() {
    return new FakeOsc(this)
  }
  createBufferSource() {
    return new FakeBufferSource(this)
  }
  createBiquadFilter() {
    return new FakeFilter(this)
  }
  createDelay() {
    return new FakeDelay(this)
  }
  createDynamicsCompressor() {
    return new FakeCompressor(this)
  }
  createPeriodicWave() {
    return {}
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length)
    return { getChannelData: () => data }
  }
  resume() {
    this.resumed++
    this.state = 'running'
    return Promise.resolve()
  }
  close() {
    this.state = 'closed'
    return Promise.resolve()
  }
}

const SFX_IDS = Object.keys(SFX_RULES) as SfxId[]

function withFakeWindow<T>(run: () => T): T {
  const g = globalThis as { window?: unknown }
  const had = 'window' in g
  const previous = g.window
  g.window = { AudioContext: FakeContext }
  try {
    return run()
  } finally {
    if (had) g.window = previous
    else delete g.window
  }
}

describe('sound effect recipes', () => {
  it('has a recipe for every sound effect id', () => {
    expect(Object.keys(SFX).sort()).toEqual([...SFX_IDS].sort())
  })

  it('build valid voices that ring out within their rule length', () => {
    for (const id of SFX_IDS) {
      for (const pitch of [0.25, 1, 2, 4]) {
        const ctx = new FakeContext()
        const synth = new Synth(ctx as unknown as AudioContext)
        const out = ctx.createGain() as unknown as AudioNode
        SFX[id](synth, out, 5, pitch)
        expect(ctx.sources.length).toBeGreaterThan(0)
        for (const s of ctx.sources) {
          expect(s.start).toBeGreaterThanOrEqual(5)
          expect(s.stop).toBeLessThanOrEqual(5 + SFX_RULES[id].length + 0.03)
        }
      }
    }
  })
})

describe('music instruments', () => {
  it('play every channel of every stage without invalid automation', () => {
    for (let stage = 0; stage < 3; stage++) {
      const song = songForStage(stage)
      const ctx = new FakeContext()
      const synth = new Synth(ctx as unknown as AudioContext)
      const bus = ctx.createGain() as unknown as AudioNode
      const events: NoteEvent[] = []
      for (const level of [0, 0.5, 0.8, 1]) {
        const step = stepDuration(song, level)
        for (let i = 0; i < song.bars * STEPS_PER_BAR; i++) {
          const n = eventsAt(song, i, level, events)
          for (let j = 0; j < n; j++) playNote(synth, events[j], 2 + i * step, step, { dry: bus, echo: bus })
        }
      }
      expect(ctx.sources.length).toBeGreaterThan(100)
    }
  })
})

describe('AudioEngine', () => {
  it('is a silent no-op without WebAudio', () => {
    const audio = new AudioEngine()
    expect(() => {
      audio.play('bonk')
      audio.startMusic(0)
      audio.setIntensity(0.5)
      audio.update(0.016)
      audio.unlock()
      audio.play('levelUp', { volume: 0.5, pitch: 2 })
      audio.setVolumes(1, 1, 1)
      audio.update(0.016)
      audio.stopMusic()
    }).not.toThrow()
  })

  it('stays silent until the context is running, then resumes it on unlock', () => {
    withFakeWindow(() => {
      const audio = new AudioEngine()
      audio.unlock()
      const ctx = FakeContext.lastMade!
      ctx.state = 'suspended'
      const before = ctx.sources.length
      audio.play('bonk')
      audio.startMusic(0)
      audio.update(0.016)
      expect(ctx.sources.length).toBe(before)
      audio.unlock()
      expect(ctx.resumed).toBe(1)
      audio.update(0.016)
      expect(ctx.sources.length).toBeGreaterThan(before)
    })
  })

  it('rate-limits a horde of hits', () => {
    withFakeWindow(() => {
      const audio = new AudioEngine()
      audio.unlock()
      const ctx = FakeContext.lastMade!
      audio.play('bonk')
      const perBonk = ctx.sources.length
      for (let i = 0; i < 100; i++) audio.play('bonk')
      expect(ctx.sources.length).toBe(perBonk * SFX_RULES.bonk.burst)
    })
  })

  it('ignores silent and broken requests', () => {
    withFakeWindow(() => {
      const audio = new AudioEngine()
      audio.unlock()
      const ctx = FakeContext.lastMade!
      const before = ctx.sources.length
      audio.play('gold', { volume: 0 })
      audio.play('gold', { volume: Number.NaN })
      audio.play('nope' as SfxId)
      expect(ctx.sources.length).toBe(before)
      expect(() => audio.play('gold', { pitch: Number.NaN })).not.toThrow()
      expect(ctx.sources.length).toBeGreaterThan(before)
    })
  })

  it('schedules music ahead of the clock and stops scheduling when stopped', () => {
    withFakeWindow(() => {
      const audio = new AudioEngine()
      audio.unlock()
      const ctx = FakeContext.lastMade!
      audio.startMusic(1)
      for (let i = 0; i < 120; i++) {
        ctx.currentTime += 1 / 60
        audio.update(1 / 60)
      }
      const played = ctx.sources.length
      expect(played).toBeGreaterThan(20)
      for (const s of ctx.sources) expect(s.start).toBeLessThanOrEqual(ctx.currentTime + 0.25)
      audio.stopMusic()
      for (let i = 0; i < 60; i++) {
        ctx.currentTime += 1 / 60
        audio.update(1 / 60)
      }
      expect(ctx.sources.length).toBe(played)
    })
  })

  it('plays a busier arrangement at full intensity', () => {
    const notesOver = (level: number) =>
      withFakeWindow(() => {
        const audio = new AudioEngine()
        audio.unlock()
        const ctx = FakeContext.lastMade!
        audio.startMusic(0)
        audio.setIntensity(level)
        for (let i = 0; i < 600; i++) {
          ctx.currentTime += 1 / 60
          audio.update(1 / 60)
        }
        return ctx.sources.length
      })
    expect(notesOver(1)).toBeGreaterThan(notesOver(0) * 1.5)
  })

  it('skips missed steps after a stall instead of bursting', () => {
    withFakeWindow(() => {
      const audio = new AudioEngine()
      audio.unlock()
      const ctx = FakeContext.lastMade!
      audio.startMusic(2)
      audio.update(1 / 60)
      const before = ctx.sources.length
      ctx.currentTime += 30
      audio.update(1 / 60)
      // Only one look-ahead window's worth of notes, not thirty seconds of them.
      expect(ctx.sources.length - before).toBeLessThan(40)
    })
  })
})
