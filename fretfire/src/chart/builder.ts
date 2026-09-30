import type { TempoMap } from './tempo'
import {
  FRET_MASK,
  OPEN_BIT,
  OPEN_LANE,
  gemCount,
  type Difficulty,
  type Instrument,
  type Note,
  type NoteKind,
  type Phrase,
  type Track,
} from './types'

/** One gem as a chart file states it: a lane (0-4 frets, 5 open) and a sustain in ticks. */
export interface RawGem {
  tick: number
  lane: number
  length: number
}

/**
 * How a chart overrides the natural strum/HOPO call on a tick. A .chart file
 * can only flip it; a .mid file forces one way or the other.
 */
export type ForceFlag = 'flip' | 'hopo' | 'strum'

export interface TickSpan {
  tick: number
  length: number
}

/** A difficulty exactly as parsed, before chords, HOPOs and phrases are worked out. */
export interface RawTrack {
  gems: RawGem[]
  forces?: Map<number, ForceFlag>
  taps?: Set<number>
  starPhrases?: TickSpan[]
  solos?: TickSpan[]
}

export interface BuildOptions {
  /** A single note this many ticks or fewer after a different note is a natural HOPO. */
  hopoThreshold: number
  /** Sustains this many ticks or shorter are played as plain notes. */
  sustainCutoff: number
}

/** Clone Hero's natural HOPO distance for .chart files: 65 ticks at 192 per beat. */
export function chartHopoThreshold(resolution: number): number {
  return Math.floor((resolution * 65) / 192)
}

/** Clone Hero's natural HOPO distance for .mid files: 170 ticks at 480 per beat. */
export function midiHopoThreshold(resolution: number): number {
  return Math.floor((resolution * 170) / 480)
}

/** MIDI charts give every note a length; anything under a third of a beat isn't meant as a sustain. */
export function midiSustainCutoff(resolution: number): number {
  return Math.floor(resolution / 3)
}

/** The gem ticks that fall inside any span, start inclusive, end exclusive. */
export function ticksInSpans(ticks: Iterable<number>, spans: TickSpan[]): Set<number> {
  const sorted = [...spans].sort((a, b) => a.tick - b.tick)
  const inside = new Set<number>()
  for (const tick of ticks) {
    for (const span of sorted) {
      if (span.tick > tick) break
      if (tick < span.tick + Math.max(1, span.length)) {
        inside.add(tick)
        break
      }
    }
  }
  return inside
}

/**
 * Turns parsed gems into playable notes: groups chords, drops sustains that
 * are too short or run into the next gem on their lane, decides strum, HOPO
 * or tap, and marks star power phrases and solos.
 */
export function buildTrack(
  raw: RawTrack,
  tempo: TempoMap,
  instrument: Instrument,
  difficulty: Difficulty,
  options: BuildOptions,
): Track {
  const byTick = new Map<number, { mask: number; lengths: number[] }>()
  for (const gem of raw.gems) {
    if (!Number.isFinite(gem.tick) || gem.tick < 0) continue
    if (!Number.isInteger(gem.lane) || gem.lane < 0 || gem.lane > OPEN_LANE) continue
    let entry = byTick.get(gem.tick)
    if (!entry) {
      entry = { mask: 0, lengths: [0, 0, 0, 0, 0, 0] }
      byTick.set(gem.tick, entry)
    }
    entry.mask |= 1 << gem.lane
    const length = Number.isFinite(gem.length) ? Math.max(0, gem.length) : 0
    entry.lengths[gem.lane] = Math.max(entry.lengths[gem.lane], length)
  }

  const ticks = [...byTick.keys()].sort((a, b) => a - b)

  // An open note can't share a tick with frets; the frets win.
  for (const tick of ticks) {
    const entry = byTick.get(tick)!
    if (entry.mask & OPEN_BIT && entry.mask & FRET_MASK) {
      entry.mask &= FRET_MASK
      entry.lengths[OPEN_LANE] = 0
    }
  }

  // Walk backwards so each sustain knows where the next gem on its lane starts.
  const gap = Math.max(1, Math.floor(tempo.resolution / 32))
  const nextOnLane = new Array<number>(OPEN_LANE + 1).fill(Infinity)
  for (let i = ticks.length - 1; i >= 0; i--) {
    const tick = ticks[i]
    const entry = byTick.get(tick)!
    for (let lane = 0; lane <= OPEN_LANE; lane++) {
      if (!(entry.mask & (1 << lane))) {
        entry.lengths[lane] = 0
        continue
      }
      let length = entry.lengths[lane]
      if (length > 0 && tick + length > nextOnLane[lane] - gap) length = nextOnLane[lane] - gap - tick
      if (length <= options.sustainCutoff) length = 0
      entry.lengths[lane] = length
      nextOnLane[lane] = tick
    }
  }

  const notes: Note[] = []
  let prevMask = 0
  let prevTick = -Infinity
  for (const tick of ticks) {
    const { mask, lengths } = byTick.get(tick)!
    const chord = gemCount(mask & FRET_MASK) > 1
    let kind: NoteKind = 'strum'
    if (prevMask && !chord && tick - prevTick <= options.hopoThreshold && (mask & prevMask) === 0) kind = 'hopo'
    const force = raw.forces?.get(tick)
    if (force === 'flip') kind = kind === 'hopo' ? 'strum' : 'hopo'
    else if (force === 'hopo') kind = 'hopo'
    else if (force === 'strum') kind = 'strum'
    // A tap needs a fret to tap, so an open tap plays as a HOPO.
    if (raw.taps?.has(tick)) kind = mask === OPEN_BIT ? 'hopo' : 'tap'

    const time = tempo.tickToTime(tick)
    notes.push({
      tick,
      time,
      beat: tick / tempo.resolution,
      mask,
      sustain: lengths.map((len) => (len > 0 ? tempo.tickToTime(tick + len) - time : 0)),
      sustainBeats: lengths.map((len) => len / tempo.resolution),
      kind,
      star: false,
      starEnd: false,
      solo: false,
    })
    prevMask = mask
    prevTick = tick
  }

  const starPhrases = markPhrases(notes, toPhrases(raw.starPhrases ?? [], tempo), (note, last) => {
    note.star = true
    if (last) note.starEnd = true
  })
  const solos = markPhrases(notes, toPhrases(raw.solos ?? [], tempo), (note) => {
    note.solo = true
  })

  return { instrument, difficulty, notes, starPhrases, solos }
}

function toPhrases(spans: TickSpan[], tempo: TempoMap): Phrase[] {
  return spans
    .filter((s) => Number.isFinite(s.tick) && s.tick >= 0 && Number.isFinite(s.length))
    .map((s) => {
      const startTick = s.tick
      const endTick = s.tick + Math.max(1, s.length)
      return { startTick, endTick, start: tempo.tickToTime(startTick), end: tempo.tickToTime(endTick) }
    })
    .sort((a, b) => a.startTick - b.startTick)
}

/** Calls `mark` for each note inside each phrase and keeps only phrases that hold notes. */
function markPhrases(notes: Note[], phrases: Phrase[], mark: (note: Note, last: boolean) => void): Phrase[] {
  const kept: Phrase[] = []
  let first = 0
  for (const phrase of phrases) {
    while (first < notes.length && notes[first].tick < phrase.startTick) first++
    let end = first
    while (end < notes.length && notes[end].tick < phrase.endTick) end++
    if (end > first) {
      for (let i = first; i < end; i++) mark(notes[i], i === end - 1)
      kept.push(phrase)
    }
  }
  return kept
}
