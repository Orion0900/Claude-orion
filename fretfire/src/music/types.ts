import type { ScaleName } from './theory'

/** How the built-in songs are written down, and the arranged score they become. */

export type DrumStyle = 'none' | 'count' | 'sparse' | 'rock' | 'drive' | 'half' | 'four' | 'gallop' | 'double' | 'ride' | 'build'
export type BassStyle = 'none' | 'root8' | 'octave' | 'gallop' | 'whole' | 'pedal' | 'drive16' | 'walk'
export type RhythmStyle = 'none' | 'chug8' | 'chug16' | 'ring' | 'stabs' | 'gallop'

export interface SectionDef {
  name: string
  bars: number
  /** One chord symbol per bar, cycling; `VI:VII` splits a bar evenly. */
  chords: string
  drums: DrumStyle
  bass: BassStyle
  rhythm: RhythmStyle
  /** Soft synth chords underneath. */
  pad?: boolean
  /** The charted lead part, in lead notation (see notation.ts). */
  lead?: string
  /** Star power phrases as [first bar, bar count] within the section. */
  star?: [number, number][]
  solo?: boolean
  /** Drum fill in the last bar; defaults to on for sections of two or more bars. */
  fill?: boolean
  /** Crash on the downbeat; defaults to on. */
  crash?: boolean
  /** The song's last section: its final bar is one big ringing hit. */
  ending?: boolean
}

export interface SongDef {
  id: string
  title: string
  artist: string
  genre: string
  year: string
  bpm: number
  /** MIDI note of the tonic in the bass register. */
  root: number
  scale: ScaleName
  /** MIDI note of scale degree 1 in the lead notation. */
  leadRoot: number
  /** Chart intensity for the song list, 0-6. */
  intensity: number
  /** Amp gain for the guitars: 1 is crunch, 2 is heavy. */
  drive: number
  sections: SectionDef[]
}

export type DrumKind = 'kick' | 'snare' | 'hat' | 'open' | 'crash' | 'ride' | 'tomHi' | 'tomMid' | 'tomLo' | 'stick'

export interface DrumHit {
  beat: number
  kind: DrumKind
  velocity: number
}

export interface Tone {
  beat: number
  length: number
  pitch: number
  velocity: number
}

export interface ChordHit {
  beat: number
  length: number
  pitches: number[]
  velocity: number
  /** Palm-muted: short and dark. */
  muted: boolean
}

export interface LeadNote {
  beat: number
  length: number
  /** One pitch, or root, fifth and octave for a power chord. */
  pitches: number[]
  power: boolean
}

export interface Span {
  beat: number
  length: number
}

export interface Score {
  bpm: number
  beatsPerBar: number
  /** Everything, including the ring-out after the last hit. */
  lengthBeats: number
  drive: number
  drums: DrumHit[]
  bass: Tone[]
  rhythm: ChordHit[]
  pad: ChordHit[]
  lead: LeadNote[]
  sections: { beat: number; name: string }[]
  star: Span[]
  solos: Span[]
}
