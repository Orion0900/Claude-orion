import type { TempoChange, TimeSignature } from './types'

/** Tempo before any tempo event, as every chart editor assumes. */
export const DEFAULT_BPM = 120

interface Segment {
  tick: number
  time: number
  bpm: number
  secondsPerTick: number
}

export interface BeatLine {
  time: number
  /** The first beat of a measure, drawn heavier. */
  measure: boolean
}

/** The most beat lines a chart may ask for, so a corrupt chart can't hang the game. */
const MAX_BEAT_LINES = 50_000

/**
 * Converts between ticks, seconds and beats across tempo changes. Charts are
 * written in ticks; the game runs on seconds of audio.
 */
export class TempoMap {
  readonly resolution: number
  readonly offset: number
  readonly signatures: TimeSignature[]
  private readonly segments: Segment[]

  constructor(resolution: number, tempos: TempoChange[], offset = 0, signatures: TimeSignature[] = []) {
    this.resolution = resolution > 0 && Number.isFinite(resolution) ? resolution : 192
    this.offset = Number.isFinite(offset) ? offset : 0
    this.segments = []
    for (const tempo of normalizeTempos(tempos)) {
      const prev = this.segments[this.segments.length - 1]
      const time = prev ? prev.time + (tempo.tick - prev.tick) * prev.secondsPerTick : this.offset
      this.segments.push({ tick: tempo.tick, time, bpm: tempo.bpm, secondsPerTick: 60 / (tempo.bpm * this.resolution) })
    }
    this.signatures = normalizeSignatures(signatures)
  }

  tickToTime(tick: number): number {
    const s = this.segments[this.indexForTick(tick)]
    return s.time + (tick - s.tick) * s.secondsPerTick
  }

  timeToTick(time: number): number {
    const s = this.segments[this.indexForTime(time)]
    return s.tick + (time - s.time) / s.secondsPerTick
  }

  timeToBeat(time: number): number {
    return this.timeToTick(time) / this.resolution
  }

  beatToTime(beat: number): number {
    return this.tickToTime(beat * this.resolution)
  }

  bpmAt(time: number): number {
    return this.segments[this.indexForTime(time)].bpm
  }

  /** Every beat from tick 0 up to `endTime`, with measure starts marked. */
  beatLines(endTime: number): BeatLine[] {
    const lines: BeatLine[] = []
    const endTick = this.timeToTick(endTime)
    const sigs = this.signatures
    for (let i = 0; i < sigs.length; i++) {
      const sig = sigs[i]
      const stop = i + 1 < sigs.length ? sigs[i + 1].tick : Infinity
      const beatTicks = (this.resolution * 4) / sig.denominator
      let beat = 0
      for (let tick = sig.tick; tick < stop && tick <= endTick; tick += beatTicks, beat++) {
        lines.push({ time: this.tickToTime(tick), measure: beat % sig.numerator === 0 })
        if (lines.length >= MAX_BEAT_LINES) return lines
      }
    }
    return lines
  }

  private indexForTick(tick: number): number {
    const segs = this.segments
    let lo = 0
    let hi = segs.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (segs[mid].tick <= tick) lo = mid
      else hi = mid - 1
    }
    return lo
  }

  private indexForTime(time: number): number {
    const segs = this.segments
    let lo = 0
    let hi = segs.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (segs[mid].time <= time) lo = mid
      else hi = mid - 1
    }
    return lo
  }
}

/** Sorted, de-duplicated tempos that always start at tick 0. */
export function normalizeTempos(tempos: TempoChange[]): TempoChange[] {
  const valid = tempos
    .filter((t) => Number.isFinite(t.tick) && t.tick >= 0 && Number.isFinite(t.bpm) && t.bpm > 0)
    .sort((a, b) => a.tick - b.tick)
  const out: TempoChange[] = []
  for (const t of valid) {
    const last = out[out.length - 1]
    if (last && last.tick === t.tick) last.bpm = t.bpm
    else out.push({ tick: t.tick, bpm: t.bpm })
  }
  if (!out.length || out[0].tick !== 0) out.unshift({ tick: 0, bpm: DEFAULT_BPM })
  return out
}

/** Sorted, de-duplicated time signatures that always start at tick 0, 4/4 by default. */
export function normalizeSignatures(signatures: TimeSignature[]): TimeSignature[] {
  const valid = signatures
    .filter(
      (s) =>
        Number.isFinite(s.tick) &&
        s.tick >= 0 &&
        Number.isInteger(s.numerator) &&
        s.numerator > 0 &&
        s.numerator <= 64 &&
        Number.isInteger(s.denominator) &&
        s.denominator > 0 &&
        s.denominator <= 64,
    )
    .sort((a, b) => a.tick - b.tick)
  const out: TimeSignature[] = []
  for (const s of valid) {
    const last = out[out.length - 1]
    if (last && last.tick === s.tick) {
      last.numerator = s.numerator
      last.denominator = s.denominator
    } else out.push({ tick: s.tick, numerator: s.numerator, denominator: s.denominator })
  }
  if (!out.length || out[0].tick !== 0) out.unshift({ tick: 0, numerator: 4, denominator: 4 })
  return out
}
