import { parseLead } from './notation'
import { SCALES, degreeToMidi, parseRoman, placeInOctave } from './theory'
import type { BassStyle, DrumHit, DrumKind, DrumStyle, RhythmStyle, Score, SectionDef, SongDef } from './types'

/**
 * Turns a written song into a full score: drums from grooves and fills,
 * bass and rhythm guitar from the chord symbols, the lead from its notation.
 * Pure and deterministic, so the chart and the audio always agree.
 */

const BEATS_PER_BAR = 4
const STEPS_PER_BAR = 16
/** Rhythm guitar power chords sit between E2 and D#3. */
const RHYTHM_LOW = 40
/** Bars of stick clicks before the first section. */
export const COUNT_IN_BARS = 1

/** 16 steps per bar: 'x' accent, 'o' normal, '-' ghost, '.' rest. */
const GROOVES: Record<DrumStyle, Partial<Record<DrumKind, string>>> = {
  none: {},
  count: { stick: 'x...o...o...o...' },
  sparse: { kick: 'x.......x.......', hat: 'o...o...o...o...' },
  rock: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
  drive: { kick: 'x.....x.x.x.....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo' },
  half: { kick: 'x.........x.....', snare: '........x.......', hat: 'x.o.x.o.x.o.x.o.' },
  four: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x...x...x...x...', open: '..o...o...o...o.' },
  gallop: { kick: 'x.xxx.xxx.xxx.xx', snare: '....x.......x...', ride: 'x.o.x.o.x.o.x.o.' },
  double: { kick: 'xoxoxoxoxoxoxoxo', snare: '....x.......x...', ride: 'x...o...x...o...' },
  ride: { kick: 'x.......x.x.....', snare: '....x.......x...', ride: 'x.o.x.o.x.o.x.o.' },
  build: { kick: 'x...x...x...x...', snare: 'o.o.o.o.o.o.o.o.' },
}

/** Fills for the second half of a section's last bar, 8 steps each. */
const FILLS: Partial<Record<DrumKind, string>>[] = [
  { snare: 'o-o-oooo', kick: 'x.......' },
  { tomHi: 'xo......', tomMid: '..xo....', tomLo: '....xo..', snare: '......xx', kick: 'x.......' },
  { snare: 'x..x..x.', tomLo: '.x..x..x', kick: 'x.......' },
  { snare: 'xoxo....', tomHi: '....x...', tomMid: '.....x..', tomLo: '......xx', kick: 'x.......' },
]

const VELOCITY: Record<string, number> = { x: 1, o: 0.75, '-': 0.45 }

interface Segment {
  beat: number
  length: number
  degree: number
  accidental: number
}

export function arrange(song: SongDef): Score {
  const scale = SCALES[song.scale]
  const score: Score = {
    bpm: song.bpm,
    beatsPerBar: BEATS_PER_BAR,
    lengthBeats: 0,
    drive: song.drive,
    drums: [],
    bass: [],
    rhythm: [],
    pad: [],
    lead: [],
    sections: [],
    star: [],
    solos: [],
  }

  for (let bar = 0; bar < COUNT_IN_BARS; bar++) groove(score.drums, 'count', bar * BEATS_PER_BAR, 1, false, 0)
  let beat = COUNT_IN_BARS * BEATS_PER_BAR
  let ringOut = 2

  song.sections.forEach((section, index) => {
    const start = beat
    const barCount = section.bars
    const endBar = section.ending ? barCount - 1 : -1
    score.sections.push({ beat: start, name: section.name })

    for (let bar = 0; bar < barCount; bar++) {
      const barBeat = start + bar * BEATS_PER_BAR
      if (bar === endBar) {
        score.drums.push({ beat: barBeat, kind: 'crash', velocity: 1 }, { beat: barBeat, kind: 'kick', velocity: 1 })
        continue
      }
      const fill = (section.fill ?? barCount >= 2) && bar === barCount - 1
      const level = section.drums === 'build' ? 0.45 + (0.55 * (bar + 1)) / barCount : 1
      groove(score.drums, section.drums, barBeat, level, fill, index + bar)
    }
    if (section.crash !== false && section.drums !== 'none' && endBar !== 0) {
      score.drums.push({ beat: start, kind: 'crash', velocity: 0.9 })
    }

    for (const seg of chordSegments(section, start)) {
      const final = endBar >= 0 && seg.beat >= start + endBar * BEATS_PER_BAR
      const bassRoot = placeInOctave(degreeToMidi(song.root, scale, seg.degree, seg.accidental), song.root)
      const chordRoot = placeInOctave(degreeToMidi(song.root, scale, seg.degree, seg.accidental), RHYTHM_LOW)
      if (final) {
        score.bass.push({ beat: seg.beat, length: seg.length + 2, pitch: bassRoot, velocity: 1 })
        score.rhythm.push({ beat: seg.beat, length: seg.length + 2, pitches: power(chordRoot), velocity: 1, muted: false })
        ringOut = 4
      } else {
        bass(score, section.bass, seg, bassRoot, placeInOctave(song.root, song.root))
        rhythm(score, section.rhythm, seg, chordRoot)
      }
      if (section.pad) {
        const padRoot = placeInOctave(song.root, 52)
        const pitches = [0, 2, 4].map((k) => degreeToMidi(padRoot, scale, seg.degree + k, seg.accidental))
        score.pad.push({ beat: seg.beat, length: seg.length, pitches, velocity: 0.6, muted: false })
      }
    }

    if (section.lead) {
      const { notes, beats } = parseLead(section.lead, { root: song.leadRoot, scale, beatsPerBar: BEATS_PER_BAR, startBeat: start })
      if (beats > barCount * BEATS_PER_BAR + 1e-9) {
        throw new Error(`Lead of "${section.name}" in "${song.title}" runs ${beats} beats into ${barCount} bars`)
      }
      // The last note of the song rings on through the ring-out.
      if (section.ending && notes.length) notes[notes.length - 1].length += 2
      score.lead.push(...notes)
    }

    for (const [first, count] of section.star ?? []) {
      score.star.push({ beat: start + first * BEATS_PER_BAR, length: count * BEATS_PER_BAR })
    }
    if (section.solo) score.solos.push({ beat: start, length: barCount * BEATS_PER_BAR })
    beat += barCount * BEATS_PER_BAR
  })

  score.lengthBeats = beat + ringOut
  const byBeat = (a: { beat: number }, b: { beat: number }) => a.beat - b.beat
  score.drums.sort(byBeat)
  score.bass.sort(byBeat)
  score.rhythm.sort(byBeat)
  score.pad.sort(byBeat)
  score.lead.sort(byBeat)
  return score
}

function power(root: number): number[] {
  return [root, root + 7, root + 12]
}

function chordSegments(section: SectionDef, start: number): Segment[] {
  const tokens = section.chords.trim().split(/\s+/)
  const segments: Segment[] = []
  for (let bar = 0; bar < section.bars; bar++) {
    const parts = tokens[bar % tokens.length].split(':')
    const length = BEATS_PER_BAR / parts.length
    parts.forEach((symbol, i) => {
      const { degree, accidental } = parseRoman(symbol)
      segments.push({ beat: start + bar * BEATS_PER_BAR + i * length, length, degree, accidental })
    })
  }
  return segments
}

function groove(out: DrumHit[], style: DrumStyle, barBeat: number, level: number, fill: boolean, variant: number): void {
  const pattern = GROOVES[style]
  const lastBarOfBuild = style === 'build' && fill
  for (const [kind, line] of Object.entries(pattern) as [DrumKind, string][]) {
    for (let step = 0; step < STEPS_PER_BAR; step++) {
      if (fill && step >= 8 && kind !== 'kick' && style !== 'build') continue
      let ch = line[step % line.length]
      // A build ends in a sixteenth-note snare roll.
      if (lastBarOfBuild && kind === 'snare') ch = step >= 8 ? 'x' : 'o'
      if (ch === '.') continue
      out.push({ beat: barBeat + step / 4, kind, velocity: VELOCITY[ch] * level })
    }
  }
  if (fill && style !== 'build' && style !== 'none' && style !== 'count') {
    const f = FILLS[variant % FILLS.length]
    for (const [kind, line] of Object.entries(f) as [DrumKind, string][]) {
      for (let i = 0; i < 8; i++) {
        const ch = line[i]
        if (ch !== '.') out.push({ beat: barBeat + (8 + i) / 4, kind, velocity: VELOCITY[ch] })
      }
    }
  }
}

function bass(score: Score, style: BassStyle, seg: Segment, root: number, tonic: number): void {
  const add = (at: number, length: number, pitch: number, velocity: number) => {
    if (at < seg.length - 1e-9) score.bass.push({ beat: seg.beat + at, length: Math.min(length, seg.length - at), pitch, velocity })
  }
  switch (style) {
    case 'none':
      return
    case 'whole':
      add(0, seg.length - 0.06, root, 0.95)
      return
    case 'root8':
    case 'pedal':
    case 'octave':
      for (let i = 0; i * 0.5 < seg.length - 1e-9; i++) {
        const base = style === 'pedal' ? tonic : root
        const pitch = style === 'octave' && i % 2 ? base + 12 : base
        add(i * 0.5, 0.44, pitch, i % 2 ? 0.8 : 0.95)
      }
      return
    case 'drive16':
      for (let i = 0; i * 0.25 < seg.length - 1e-9; i++) add(i * 0.25, 0.21, root, i % 4 ? 0.78 : 0.95)
      return
    case 'gallop':
      for (let b = 0; b < seg.length - 1e-9; b++) {
        add(b, 0.44, root, 0.95)
        add(b + 0.5, 0.2, root, 0.8)
        add(b + 0.75, 0.2, root, 0.8)
      }
      return
    case 'walk': {
      const steps = [0, 7, 12, 7]
      for (let b = 0; b < seg.length - 1e-9; b++) add(b, 0.9, root + steps[b % 4], b % 2 ? 0.8 : 0.95)
      return
    }
  }
}

function rhythm(score: Score, style: RhythmStyle, seg: Segment, root: number): void {
  const pitches = power(root)
  const add = (at: number, length: number, muted: boolean, velocity: number) => {
    if (at < seg.length - 1e-9) {
      score.rhythm.push({ beat: seg.beat + at, length: Math.min(length, seg.length - at), pitches, velocity, muted })
    }
  }
  switch (style) {
    case 'none':
      return
    case 'ring':
      add(0, seg.length - 0.04, false, 0.9)
      return
    case 'chug8':
      for (let i = 0; i * 0.5 < seg.length - 1e-9; i++) add(i * 0.5, i ? 0.36 : 0.46, i > 0, i % 2 ? 0.75 : 0.9)
      return
    case 'chug16':
      for (let i = 0; i * 0.25 < seg.length - 1e-9; i++) add(i * 0.25, i ? 0.19 : 0.23, i > 0, i % 4 ? 0.72 : 0.9)
      return
    case 'gallop':
      for (let b = 0; b < seg.length - 1e-9; b++) {
        add(b, 0.4, b > 0, 0.9)
        add(b + 0.5, 0.18, true, 0.75)
        add(b + 0.75, 0.18, true, 0.75)
      }
      return
    case 'stabs': {
      const hits = seg.length >= 4 ? [0, 0.75, 1.5, 2.5] : [0, 0.75, 1.5]
      for (const at of hits) add(at, 0.45, false, 0.9)
      return
    }
  }
}
