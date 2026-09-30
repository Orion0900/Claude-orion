import type { AudioEngine } from './engine'

/**
 * Plays a song's stems in lockstep and answers "what song time is it?" for any
 * moment, from the audio hardware's own clock. Visuals and judging both ask
 * this, so notes, taps and sound can never drift apart.
 */

/** The instrument stem is muted on a miss, like a separate guitar track in Clone Hero. */
export type StemRole = 'instrument' | 'backing'

export interface Stem {
  buffer: AudioBuffer
  role: StemRole
}

type TimestampContext = AudioContext & { outputLatency?: number }

/**
 * Maps performance.now() timestamps to the audio context time being heard at
 * that moment. The output timestamp is when a sample actually leaves the
 * speaker, so this follows what the player hears, latency included.
 */
export class AudioClock {
  /** Audio-context seconds minus performance.now() seconds, smoothed. */
  private offset = Number.NaN

  constructor(private readonly engine: AudioEngine) {}

  reset(): void {
    this.offset = Number.NaN
  }

  /** Re-reads the hardware clock; call once per frame. */
  sync(nowMs: number): void {
    const ctx = this.engine.ctx as TimestampContext | null
    if (!ctx) return
    let raw: number
    const stamp = typeof ctx.getOutputTimestamp === 'function' ? ctx.getOutputTimestamp() : null
    if (stamp && stamp.contextTime && stamp.performanceTime) {
      raw = stamp.contextTime - stamp.performanceTime / 1000
    } else {
      raw = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - nowMs / 1000
    }
    // Jitter is smoothed away; a real jump (a stall, a route change) is taken at once.
    if (!Number.isFinite(this.offset) || Math.abs(raw - this.offset) > 0.05) this.offset = raw
    else this.offset += (raw - this.offset) * 0.03
  }

  /** The audible context time at a performance.now()-style timestamp. */
  contextTimeAt(ms: number): number {
    if (!Number.isFinite(this.offset)) this.sync(performance.now())
    return ms / 1000 + this.offset
  }
}

export class SongPlayer {
  readonly duration: number
  playing = false
  private sources: AudioBufferSourceNode[] = []
  private readonly gains: GainNode[]
  private anchorCtx = 0
  private anchorSong = 0
  private pausedAt = 0
  private readonly clock: AudioClock

  constructor(
    private readonly engine: AudioEngine,
    private readonly stems: Stem[],
    readonly rate = 1,
  ) {
    const ctx = engine.ctx!
    this.clock = new AudioClock(engine)
    // Song time is audio time: a slowed song still runs 0 → duration, just slower.
    this.duration = Math.max(0, ...stems.map((s) => s.buffer.duration))
    this.gains = stems.map(() => {
      const gain = ctx.createGain()
      gain.connect(engine.music!)
      return gain
    })
  }

  get hasInstrumentStem(): boolean {
    return this.stems.some((s) => s.role === 'instrument')
  }

  /** Starts (or restarts) playback so that song time `from` sounds a moment from now. */
  play(from: number): void {
    this.stopSources()
    const ctx = this.engine.ctx!
    const when = ctx.currentTime + 0.08
    this.anchorCtx = when
    this.anchorSong = from
    this.stems.forEach((stem, i) => {
      const src = ctx.createBufferSource()
      src.buffer = stem.buffer
      src.playbackRate.value = this.rate
      src.connect(this.gains[i])
      if (from >= 0) {
        if (from < stem.buffer.duration) src.start(when, from)
      } else src.start(when - from / this.rate, 0)
      this.sources.push(src)
    })
    this.clock.reset()
    this.clock.sync(performance.now())
    this.playing = true
  }

  /** Stops and remembers where; returns that song time. */
  pause(): number {
    if (this.playing) this.pausedAt = this.timeAt(performance.now())
    this.stopSources()
    this.playing = false
    return this.pausedAt
  }

  stop(): void {
    this.stopSources()
    this.playing = false
    for (const gain of this.gains) gain.disconnect()
  }

  /** Re-reads the hardware clock; call once per frame. */
  sync(nowMs: number): void {
    this.clock.sync(nowMs)
  }

  /** Song time, in seconds, at a performance.now()-style timestamp. */
  timeAt(ms: number): number {
    if (!this.playing) return this.pausedAt
    return this.anchorSong + (this.clock.contextTimeAt(ms) - this.anchorCtx) * this.rate
  }

  /** Mutes or restores the charted instrument's stem. */
  setInstrumentAudible(audible: boolean): void {
    const ctx = this.engine.ctx
    if (!ctx) return
    this.stems.forEach((stem, i) => {
      if (stem.role !== 'instrument') return
      const gain = this.gains[i].gain
      gain.cancelScheduledValues(ctx.currentTime)
      gain.setTargetAtTime(audible ? 1 : 0, ctx.currentTime, audible ? 0.004 : 0.015)
    })
  }

  private stopSources(): void {
    for (const src of this.sources) {
      try {
        src.stop()
      } catch {
        // Never started (it was scheduled past the end).
      }
      src.disconnect()
    }
    this.sources = []
  }
}
