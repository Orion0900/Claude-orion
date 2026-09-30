/**
 * The shape every playable song ends up in. A .chart, a .mid, a .sng and the
 * built-in songs all become a Chart, so the game, the renderer and the scoring
 * never care where a song came from.
 */

/** Five frets, left to right. */
export const LANE_COUNT = 5
/** Open notes (strum with no fret) live on a sixth, fretless lane. */
export const OPEN_LANE = 5
export const OPEN_BIT = 1 << OPEN_LANE
export const FRET_MASK = 0b11111

export const LANE_NAMES = ['Green', 'Red', 'Yellow', 'Blue', 'Orange'] as const

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert'
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard', 'expert']

/** Five-fret parts. Drums and six-fret parts are not played. */
export type Instrument = 'guitar' | 'bass' | 'rhythm' | 'keys' | 'coop'
export const INSTRUMENTS: readonly Instrument[] = ['guitar', 'bass', 'rhythm', 'keys', 'coop']

export const INSTRUMENT_NAMES: Record<Instrument, string> = {
  guitar: 'Lead Guitar',
  bass: 'Bass',
  rhythm: 'Rhythm Guitar',
  keys: 'Keys',
  coop: 'Co-op Guitar',
}

export const DIFFICULTY_NAMES: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
}

/**
 * Strums need a strum, HOPOs (hammer-ons and pull-offs) can be played by
 * fretting alone while the streak is alive, taps can always be fretted.
 */
export type NoteKind = 'strum' | 'hopo' | 'tap'

/** Every gem that starts on the same tick: a single note or a chord. */
export interface Note {
  tick: number
  /** Seconds from the start of the audio. */
  time: number
  /** Quarter-note beats from tick 0. */
  beat: number
  /** Bits 0-4 are frets, bit 5 is an open note. Never both. */
  mask: number
  /** Sustain length in seconds for each lane 0-5; 0 is no sustain. */
  sustain: number[]
  /** The same sustains measured in beats, which is what sustains score by. */
  sustainBeats: number[]
  kind: NoteKind
  /** Inside a star power phrase. */
  star: boolean
  /** The last note of its star power phrase: completing it awards star power. */
  starEnd: boolean
  /** Inside a solo section. */
  solo: boolean
}

/** A span of the chart, in seconds and ticks. End is exclusive. */
export interface Phrase {
  startTick: number
  endTick: number
  start: number
  end: number
}

export interface Section {
  tick: number
  time: number
  name: string
}

export interface Track {
  instrument: Instrument
  difficulty: Difficulty
  /** Sorted by tick, one entry per tick. */
  notes: Note[]
  starPhrases: Phrase[]
  solos: Phrase[]
}

export interface TempoChange {
  tick: number
  /** Beats (quarter notes) per minute. */
  bpm: number
}

export interface TimeSignature {
  tick: number
  numerator: number
  denominator: number
}

export interface Chart {
  /** Ticks per quarter note. */
  resolution: number
  /** Sorted, and the first is always at tick 0. */
  tempos: TempoChange[]
  /** Sorted, and the first is always at tick 0. */
  timeSignatures: TimeSignature[]
  /** Audio time in seconds at which tick 0 plays. */
  offset: number
  sections: Section[]
  tracks: Track[]
}

/** What the song list shows and the importer reads from song.ini or .sng metadata. */
export interface SongMeta {
  name: string
  artist: string
  album: string
  genre: string
  year: string
  charter: string
  /** Song length in seconds, 0 when unknown. */
  length: number
  /** Where the song list preview starts, in seconds. */
  previewStart: number
  /** Charted intensity 0-6 per part; -1 or missing means no part. */
  intensity: Partial<Record<Instrument, number>>
  /** Extra seconds added to every chart event (song.ini delay). */
  delay: number
  /** Overrides the natural HOPO distance, in ticks. */
  hopoFrequency?: number
  /** Overrides the sustain cutoff, in ticks. */
  sustainCutoff?: number
  loadingPhrase?: string
}

export function emptyMeta(): SongMeta {
  return {
    name: '',
    artist: '',
    album: '',
    genre: '',
    year: '',
    charter: '',
    length: 0,
    previewStart: 0,
    intensity: {},
    delay: 0,
  }
}

/** Number of gems in a mask; an open note counts as one. */
export function gemCount(mask: number): number {
  let n = 0
  for (let m = mask; m; m &= m - 1) n++
  return n
}

export function findTrack(chart: Chart, instrument: Instrument, difficulty: Difficulty): Track | undefined {
  return chart.tracks.find((t) => t.instrument === instrument && t.difficulty === difficulty && t.notes.length > 0)
}

/** Which difficulties have notes, per instrument, in the order players expect. */
export function availableParts(chart: Chart): Map<Instrument, Difficulty[]> {
  const parts = new Map<Instrument, Difficulty[]>()
  for (const instrument of INSTRUMENTS) {
    const diffs = DIFFICULTIES.filter((d) => findTrack(chart, instrument, d))
    if (diffs.length) parts.set(instrument, diffs)
  }
  return parts
}
