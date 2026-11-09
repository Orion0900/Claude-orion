import { isPatch, PATCHES } from './instruments'
import { NotationError, parseChannel, TPQ, WHOLE, type NoteEvent } from './notation'

/**
 * Songs: four channel strings per section, an intro that plays once and a
 * body that loops forever. Compiling turns the notation into one sorted
 * event list per section, checking bar lengths, instruments and that every
 * channel of a section is the same length. Pure, so tests compile them all.
 */

/** The chip's four channels: two pulses, the wave channel and noise. */
export const CHANNELS = ['p1', 'p2', 'wave', 'noise'] as const
export type ChannelId = (typeof CHANNELS)[number]

export type Parts = Partial<Record<ChannelId, string>>

export interface EchoSpec {
  /** Delay in quarter notes. */
  beats: number
  /** 0-0.9: how much of each repeat feeds the next. */
  feedback: number
  /** 0-1: level of the echoes. */
  wet: number
}

export interface SongDef {
  /** Quarter notes per minute, whatever the meter. */
  bpm: number
  /** Time signature; default 4/4. */
  meter?: readonly [number, number]
  /** 0-0.5: pushes every off-beat eighth late for a lilt (0.33 is triplet swing). */
  swing?: number
  /** An echo on the pulse channels. */
  echo?: EchoSpec
  /** Starting instrument per channel. */
  voices?: Partial<Record<ChannelId, string>>
  /** Plays once before the body. */
  intro?: Parts
  /** Loops forever (or, for a jingle, plays once). */
  body: Parts
}

export interface SongEvent extends NoteEvent {
  ch: ChannelId
}

export interface Section {
  /** Length in ticks (0 for a missing intro). */
  len: number
  bars: number
  /** Sorted by start tick. */
  events: SongEvent[]
}

export interface CompiledSong {
  id: string
  bpm: number
  barTicks: number
  swing: number
  echo: EchoSpec | null
  intro: Section
  body: Section
}

export const DEFAULT_VOICES: Readonly<Record<ChannelId, string>> = { p1: 'lead', p2: 'soft', wave: 'bass', noise: 'kit' }

export function barTicksOf(meter: readonly [number, number] = [4, 4]): number {
  const [n, d] = meter
  if (!(n > 0) || !(d > 0) || WHOLE % d !== 0) throw new NotationError(`bad meter ${n}/${d}`)
  return n * (WHOLE / d)
}

export function secondsPerTick(song: { bpm: number }): number {
  return 60 / song.bpm / TPQ
}

/** Seconds from the top of a section to its end. */
export function sectionSeconds(song: CompiledSong, section: Section): number {
  return section.len * secondsPerTick(song)
}

const ORDER: Readonly<Record<ChannelId, number>> = { p1: 0, p2: 1, wave: 2, noise: 3 }

export function compileSong(id: string, def: SongDef): CompiledSong {
  if (!(def.bpm >= 30 && def.bpm <= 300)) throw new NotationError(`${id}: tempo ${def.bpm} out of range`)
  const barTicks = barTicksOf(def.meter)
  const swing = def.swing ?? 0
  if (!(swing >= 0 && swing < 0.5)) throw new NotationError(`${id}: swing must be 0 to 0.5`)
  for (const ch of CHANNELS) {
    const v = def.voices?.[ch]
    if (v !== undefined && !isPatch(v)) throw new NotationError(`${id}: unknown instrument "${v}" on ${ch}`)
  }
  const section = (name: string, parts: Parts | undefined): Section => {
    const events: SongEvent[] = []
    let len = -1
    let bars = 0
    let first = ''
    for (const ch of CHANNELS) {
      const src = parts?.[ch]
      if (src === undefined) continue
      const patch = def.voices?.[ch] ?? DEFAULT_VOICES[ch]
      const where = `${id}.${name}.${ch}`
      const parsed = parseChannel(src, { barTicks, drums: ch === 'noise', patch, gate: PATCHES[patch].gate, where })
      if (len < 0) {
        len = parsed.ticks
        bars = parsed.bars
        first = ch
      } else if (parsed.ticks !== len) {
        throw new NotationError(`${id}.${name}: ${ch} runs ${parsed.ticks / barTicks} bars but ${first} runs ${len / barTicks}`)
      }
      for (const e of parsed.events) {
        if (!isPatch(e.patch)) throw new NotationError(`${where}: unknown instrument "${e.patch}"`)
        const drumPatch = PATCHES[e.patch].wave === 'noise'
        if (drumPatch !== (ch === 'noise')) throw new NotationError(`${where}: "${e.patch}" can't play on ${ch}`)
        events.push(swing > 0 ? swung({ ...e, ch }, swing) : { ...e, ch })
      }
    }
    if (len < 0) len = 0
    events.sort((a, b) => a.t - b.t || ORDER[a.ch] - ORDER[b.ch])
    return { len, bars, events }
  }
  const intro = section('intro', def.intro)
  const body = section('body', def.body)
  if (body.len <= 0) throw new NotationError(`${id}: the body is empty`)
  return {
    id,
    bpm: def.bpm,
    barTicks,
    swing,
    echo: def.echo ?? null,
    intro,
    body,
  }
}

/**
 * Swing as a time warp within each beat: the first half stretches and the
 * second shrinks, so off-beat eighths land late and everything between
 * keeps its order.
 */
export function swingTick(t: number, swing: number): number {
  const beat = Math.floor(t / TPQ) * TPQ
  const x = t - beat
  const half = TPQ / 2
  const mid = half * (1 + swing)
  return beat + (x < half ? (x * mid) / half : mid + ((x - half) * (TPQ - mid)) / half)
}

function swung(e: SongEvent, swing: number): SongEvent {
  const start = swingTick(e.t, swing)
  const end = swingTick(e.t + e.len, swing)
  if (e.bends) e.bends = e.bends.map((b) => ({ ...b, at: swingTick(e.t + b.at, swing) - start }))
  e.t = start
  e.len = end - start
  return e
}
