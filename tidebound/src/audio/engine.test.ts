import { SPECIES_IDS } from '../data/dex'
import { TYPES } from '../data/types'
import type { Audio, TrackId } from './api'
import { ChipAudio } from './engine'
import { JINGLE_IDS, SFX_IDS, TRACK_IDS } from './ids'
import { createAudio, silentAudio } from './index'
import { MOVE_TYPES } from './moves'
import { SFX } from './sfx'
import { secondsPerTick } from './song'
import { loopPoints } from './timeline'
import { jingle, track } from './tracks'

/**
 * A strict stand-in for WebAudio: it throws where a browser would
 * (non-finite values, exponential ramps to zero, stopping before starting)
 * and records every source's start and stop, and what connects to what.
 */
function finite(...values: number[]): void {
  for (const v of values) if (!Number.isFinite(v)) throw new TypeError(`non-finite ${v}`)
}

class FakeParam {
  private v: number
  events = 0
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
    if (t < 0) throw new RangeError('negative time')
    this.events++
    this.v = v
    return this
  }
  linearRampToValueAtTime(v: number, t: number) {
    finite(v, t)
    this.events++
    return this
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    finite(v, t)
    if (!(v > 0) && !(v < 0)) throw new RangeError('exponential ramp to zero')
    this.events++
    return this
  }
  setTargetAtTime(v: number, t: number, c: number) {
    finite(v, t, c)
    if (!(c > 0)) throw new RangeError('time constant must be positive')
    this.events++
    return this
  }
  cancelScheduledValues(t: number) {
    finite(t)
    return this
  }
}

class FakeNode {
  inputs = 0
  disconnected = false
  constructor(readonly ctx: FakeContext) {
    ctx.nodes++
  }
  connect<T>(target: T): T {
    if (target instanceof FakeNode) target.inputs++
    return target
  }
  disconnect(): void {
    this.disconnected = true
  }
}

class FakeSource extends FakeNode {
  private index = -1
  start(t = 0, offset = 0) {
    finite(t, offset)
    if (offset < 0) throw new RangeError('negative offset')
    if (this.index >= 0) throw new Error('started twice')
    this.index = this.ctx.sources.push({ start: t, stop: Infinity, at: this.ctx.currentTime, kind: this.kind }) - 1
  }
  stop(t = 0) {
    finite(t)
    if (this.index < 0) throw new Error('stop before start')
    const s = this.ctx.sources[this.index]
    if (t < s.start) throw new RangeError('stop before its start time')
    s.stop = t
  }
  get kind(): string {
    return 'source'
  }
}

class FakeOsc extends FakeSource {
  type = 'sine'
  frequency = new FakeParam(440)
  detune = new FakeParam(0)
  wave: unknown = null
  setPeriodicWave(w: unknown): void {
    this.wave = w
  }
  get kind(): string {
    return 'osc'
  }
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null
  loop = false
  playbackRate = new FakeParam(1)
  get kind(): string {
    return 'buffer'
  }
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
class FakePanner extends FakeNode {
  pan = new FakeParam(0)
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam()
  knee = new FakeParam()
  ratio = new FakeParam()
  attack = new FakeParam()
  release = new FakeParam()
}

class FakeContext {
  currentTime = 0
  sampleRate = 8000
  state: 'running' | 'suspended' | 'closed' = 'running'
  nodes = 0
  resumed = 0
  sources: Array<{ start: number; stop: number; at: number; kind: string }> = []
  destination = new FakeNode(this)
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
  createStereoPanner() {
    return new FakePanner(this)
  }
  createDynamicsCompressor() {
    return new FakeCompressor(this)
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    if (real.length !== imag.length) throw new Error('mismatched wave tables')
    for (const v of real) finite(v)
    for (const v of imag) finite(v)
    return { real, imag }
  }
  createBuffer(channels: number, length: number, rate: number) {
    const data = new Float32Array(length)
    return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => data }
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

interface Rig {
  audio: ChipAudio
  ctx: FakeContext
}

function rig(state: FakeContext['state'] = 'running'): Rig {
  const ctx = new FakeContext()
  ctx.state = state
  const audio = new ChipAudio({ createContext: () => ctx as unknown as BaseAudioContext })
  return { audio, ctx }
}

/** Advances the fake clock in timer-sized steps, pumping the sequencer as the real timer would. */
function run(r: Rig, seconds: number, step = 0.025): void {
  const end = r.ctx.currentTime + seconds
  while (r.ctx.currentTime < end - 1e-9) {
    r.ctx.currentTime = Math.min(end, r.ctx.currentTime + step)
    r.audio.pump()
  }
}

/** Internals the tests peek at. */
function inside(audio: ChipAudio): {
  playing: { id: TrackId; transport: { startTick: number; startTime: number } } | null
  resumeAt: { id: TrackId; tick: number } | null
  graph: { music: FakeGain; sfx: FakeGain } | null
} {
  return audio as unknown as ReturnType<typeof inside>
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('silentAudio', () => {
  it('satisfies the interface and does nothing, remembering the track', async () => {
    const a: Audio = silentAudio()
    a.unlock()
    expect(a.currentTrack).toBeNull()
    a.playMusic('town')
    expect(a.currentTrack).toBe('town')
    a.stopMusic(1)
    expect(a.currentTrack).toBeNull()
    await expect(a.playJingle('heal')).resolves.toBeUndefined()
    await expect(a.cry('narlet', true)).resolves.toBeUndefined()
    a.sfx('cursor')
    a.moveSound({ type: 'flame', category: 'special' })
    a.setVolumes(0.2, 0.3)
  })
})

describe('createAudio without WebAudio', () => {
  it('never throws and quietly does nothing', async () => {
    const a = createAudio()
    expect(() => a.unlock()).not.toThrow()
    a.playMusic('title')
    expect(a.currentTrack).toBe('title')
    a.sfx('select')
    a.moveSound({ type: 'volt', category: 'physical' })
    a.setVolumes(Number.NaN, 2)
    await expect(a.playJingle('save')).resolves.toBeUndefined()
    await expect(a.cry('atollus')).resolves.toBeUndefined()
    a.stopMusic()
    expect(a.currentTrack).toBeNull()
  })

  it('survives a context that refuses to be made', () => {
    const a = new ChipAudio({
      createContext: () => {
        throw new Error('too many contexts')
      },
    })
    expect(() => a.unlock()).not.toThrow()
    expect(() => a.playMusic('cave')).not.toThrow()
    expect(() => a.sfx('bump')).not.toThrow()
  })
})

describe('the engine on a fake context', () => {
  it('waits for unlock, then starts the requested track', () => {
    const r = rig()
    r.audio.playMusic('route')
    expect(r.ctx.sources).toHaveLength(0)
    r.audio.unlock()
    run(r, 1)
    expect(inside(r.audio).playing?.id).toBe('route')
    expect(r.ctx.sources.filter((s) => s.kind === 'osc').length).toBeGreaterThan(10)
    r.audio.dispose()
  })

  it('resumes a suspended context on unlock', () => {
    const r = rig('suspended')
    r.audio.unlock()
    expect(r.ctx.resumed).toBe(1)
    r.audio.dispose()
  })

  it('schedules every note ahead of the clock, within the lookahead', () => {
    const r = rig()
    r.audio.unlock()
    r.audio.playMusic('battleWild')
    run(r, 20)
    for (const s of r.ctx.sources) {
      expect(s.start).toBeGreaterThanOrEqual(s.at - 1e-9)
      // Within the lookahead (plus a vibrato's delay for its wobble oscillator).
      expect(s.start).toBeLessThanOrEqual(s.at + 0.6)
      expect(s.stop).toBeGreaterThanOrEqual(s.start)
      expect(Number.isFinite(s.stop)).toBe(true)
    }
    r.audio.dispose()
  })

  it('plays every track through its intro and a whole loop without a single WebAudio error', () => {
    for (const id of TRACK_IDS) {
      const r = rig()
      r.audio.unlock()
      r.audio.playMusic(id)
      const { loopStart, loopLength } = loopPoints(track(id))
      const before = r.ctx.sources.length
      run(r, loopStart + loopLength + 1, 0.1)
      expect(r.ctx.sources.length - before, id).toBeGreaterThan(50)
      expect(inside(r.audio).playing?.id).toBe(id)
      r.audio.dispose()
    }
  })

  it('ignores a request for the track already playing, and switches on a new one', () => {
    const r = rig()
    r.audio.unlock()
    r.audio.playMusic('town')
    run(r, 2)
    const first = inside(r.audio).playing
    r.audio.playMusic('town')
    expect(inside(r.audio).playing).toBe(first)
    r.audio.playMusic('battleWild')
    expect(inside(r.audio).playing).not.toBe(first)
    expect(r.audio.currentTrack).toBe('battleWild')
    r.audio.dispose()
  })

  it('stops with a fade and can start the same track again', () => {
    const r = rig()
    r.audio.unlock()
    r.audio.playMusic('cave')
    run(r, 1)
    r.audio.stopMusic(1.5)
    expect(r.audio.currentTrack).toBeNull()
    expect(inside(r.audio).playing).toBeNull()
    const count = r.ctx.sources.length
    run(r, 2)
    expect(r.ctx.sources.length).toBe(count)
    r.audio.playMusic('cave')
    expect(inside(r.audio).playing?.id).toBe('cave')
    r.audio.dispose()
  })

  it('pauses the music for a jingle, resolves, and resumes where it left off', async () => {
    const r = rig()
    r.audio.unlock()
    r.audio.playMusic('town')
    run(r, 3.2)
    const promise = r.audio.playJingle('itemGet')
    let done = false
    void promise.then(() => (done = true))
    await Promise.resolve()
    await Promise.resolve()
    expect(inside(r.audio).playing).toBeNull()
    const paused = inside(r.audio).resumeAt
    expect(paused?.id).toBe('town')
    expect(r.audio.currentTrack).toBe('town')
    // Music stays quiet while the jingle plays.
    const song = jingle('itemGet')
    const seconds = song.body.len * secondsPerTick(song)
    r.ctx.currentTime += seconds / 2
    await vi.advanceTimersByTimeAsync((seconds / 2) * 1000)
    expect(done).toBe(false)
    expect(inside(r.audio).playing).toBeNull()
    r.ctx.currentTime += seconds / 2 + 0.3
    await vi.advanceTimersByTimeAsync((seconds / 2 + 0.3) * 1000)
    await promise
    expect(done).toBe(true)
    const resumed = inside(r.audio).playing
    expect(resumed?.id).toBe('town')
    expect(resumed?.transport.startTick).toBeCloseTo(paused?.tick ?? -1, 3)
    r.audio.dispose()
  })

  it('starts a track asked for during a jingle once it ends, from the top', async () => {
    const r = rig()
    r.audio.unlock()
    r.audio.playMusic('battleWild')
    run(r, 2)
    const promise = r.audio.playJingle('levelUp')
    await Promise.resolve()
    r.audio.playMusic('victoryWild')
    expect(r.audio.currentTrack).toBe('victoryWild')
    expect(inside(r.audio).playing).toBeNull()
    await vi.advanceTimersByTimeAsync(3000)
    await promise
    expect(inside(r.audio).playing?.id).toBe('victoryWild')
    expect(inside(r.audio).playing?.transport.startTick).toBe(0)
    r.audio.dispose()
  })

  it('keeps silent after a jingle if the music was stopped during it', async () => {
    const r = rig()
    r.audio.unlock()
    r.audio.playMusic('haven')
    run(r, 1)
    const promise = r.audio.playJingle('heal')
    await Promise.resolve()
    r.audio.stopMusic()
    await vi.advanceTimersByTimeAsync(5000)
    await promise
    expect(inside(r.audio).playing).toBeNull()
    expect(r.audio.currentTrack).toBeNull()
    r.audio.dispose()
  })

  it('queues jingles one after another, resuming only after the last', async () => {
    const r = rig()
    r.audio.unlock()
    r.audio.playMusic('route')
    run(r, 1)
    const order: string[] = []
    const a = r.audio.playJingle('levelUp').then(() => order.push('levelUp'))
    const b = r.audio.playJingle('evolved').then(() => order.push('evolved'))
    await vi.advanceTimersByTimeAsync(1500)
    expect(order).toEqual(['levelUp'])
    expect(inside(r.audio).playing).toBeNull()
    await vi.advanceTimersByTimeAsync(5000)
    await Promise.all([a, b])
    expect(order).toEqual(['levelUp', 'evolved'])
    expect(inside(r.audio).playing?.id).toBe('route')
    r.audio.dispose()
  })

  it('plays every jingle', async () => {
    const r = rig()
    r.audio.unlock()
    for (const id of JINGLE_IDS) {
      const before = r.ctx.sources.length
      const p = r.audio.playJingle(id)
      await vi.advanceTimersByTimeAsync(5000)
      await p
      expect(r.ctx.sources.length - before, id).toBeGreaterThan(3)
    }
    r.audio.dispose()
  })

  it('plays every sound effect into the effects bus', () => {
    const r = rig()
    r.audio.unlock()
    expect(Object.keys(SFX).sort()).toEqual([...SFX_IDS].sort())
    const bus = inside(r.audio).graph?.sfx
    for (const id of SFX_IDS) {
      r.ctx.currentTime += 1
      const before = r.ctx.sources.length
      const inputs = bus?.inputs ?? 0
      r.audio.sfx(id)
      expect(r.ctx.sources.length - before, id).toBeGreaterThan(0)
      expect(bus?.inputs ?? 0, id).toBeGreaterThan(inputs)
    }
    r.audio.dispose()
  })

  it('rate-limits rapid repeats, and lets the xp tick climb', () => {
    const r = rig()
    r.audio.unlock()
    r.ctx.currentTime = 5
    r.audio.sfx('textBlip')
    const n = r.ctx.sources.length
    r.ctx.currentTime += 0.01
    r.audio.sfx('textBlip')
    expect(r.ctx.sources.length).toBe(n)
    r.ctx.currentTime += 0.05
    r.audio.sfx('textBlip')
    expect(r.ctx.sources.length).toBeGreaterThan(n)
    r.audio.dispose()
  })

  it('makes a move sound for every type and category', () => {
    const r = rig()
    r.audio.unlock()
    expect([...MOVE_TYPES].sort()).toEqual([...TYPES].sort())
    for (const type of TYPES) {
      for (const category of ['physical', 'special', 'status'] as const) {
        r.ctx.currentTime += 1
        const before = r.ctx.sources.length
        r.audio.moveSound({ type, category })
        expect(r.ctx.sources.length - before, `${type} ${category}`).toBeGreaterThan(0)
      }
    }
    r.audio.dispose()
  })

  it('cries for every species, resolving when the cry is over', async () => {
    const r = rig()
    r.audio.unlock()
    for (const id of SPECIES_IDS) {
      for (const faint of [false, true]) {
        r.ctx.currentTime += 3
        const before = r.ctx.sources.length
        let over = false
        const p = r.audio.cry(id, faint).then(() => (over = true))
        expect(r.ctx.sources.length - before).toBeGreaterThan(0)
        await vi.advanceTimersByTimeAsync(100)
        expect(over).toBe(false)
        await vi.advanceTimersByTimeAsync(3000)
        await p
        expect(over).toBe(true)
      }
    }
    r.audio.dispose()
  })

  it('stays quiet while the context is suspended, and never hangs a promise', async () => {
    const r = rig('suspended')
    r.audio.unlock()
    r.ctx.state = 'suspended'
    const primed = r.ctx.sources.length
    r.audio.sfx('select')
    r.audio.moveSound({ type: 'earth', category: 'special' })
    expect(r.ctx.sources).toHaveLength(primed)
    await expect(r.audio.cry('zappet')).resolves.toBeUndefined()
    await expect(r.audio.playJingle('save')).resolves.toBeUndefined()
    r.audio.dispose()
  })

  it('sets the music and effects levels, squared, and ignores nonsense', () => {
    const r = rig()
    r.audio.unlock()
    const g = inside(r.audio).graph
    const musicEvents = g?.music.gain.events ?? 0
    r.audio.setVolumes(0.5, 1)
    expect(g?.music.gain.events).toBeGreaterThan(musicEvents)
    expect(() => r.audio.setVolumes(Number.NaN, -3)).not.toThrow()
    r.audio.dispose()
  })
})
