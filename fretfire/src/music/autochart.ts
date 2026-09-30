import { buildTrack, chartHopoThreshold, type RawGem, type TickSpan } from '../chart/builder'
import { TempoMap } from '../chart/tempo'
import { DIFFICULTIES, type Chart, type Difficulty, type Section, type Track } from '../chart/types'
import { TICKS_PER_BEAT } from './notation'
import type { LeadNote, Score } from './types'

/**
 * Charts the lead part of a built-in song the way a human charter would:
 * higher notes sit on higher frets within each two-bar phrase, power chords
 * become two-note chords, held notes become sustains, and the lower
 * difficulties thin the notes out and use fewer frets.
 */

interface Plan {
  lanes: number
  /** Keep a note that starts `gap` beats (`seconds` s) after the previous kept one? */
  keep: (note: LeadNote, gap: number, seconds: number) => boolean
  chords: (note: LeadNote) => boolean
}

const EPS = 1e-6
const onGrid = (beat: number, perBeat: number) => Math.abs(beat * perBeat - Math.round(beat * perBeat)) < EPS
const held = (note: LeadNote) => note.length >= 1.5 - EPS

const PLANS: Record<Difficulty, Plan> = {
  expert: { lanes: 5, keep: () => true, chords: (n) => n.power },
  hard: {
    lanes: 5,
    keep: (n, gap, seconds) => (onGrid(n.beat, 2) && seconds >= 0.16) || gap >= 0.5 - EPS,
    chords: (n) => n.power,
  },
  medium: {
    lanes: 4,
    keep: (n, gap, seconds) =>
      onGrid(n.beat, 1) || held(n) ? gap >= 0.5 - EPS && seconds >= 0.3 : gap >= 1 - EPS && seconds >= 0.5,
    chords: (n) => n.power && n.length >= 1 - EPS,
  },
  easy: {
    lanes: 3,
    keep: (n, gap, seconds) =>
      onGrid(n.beat, 1) || held(n) ? gap >= 1 - EPS && seconds >= 0.5 : gap >= 2 - EPS && seconds >= 0.9,
    chords: () => false,
  },
}

/** Notes this long or longer become sustains, released a sixteenth early. */
const SUSTAIN_MIN_BEATS = 1
const SUSTAIN_TRIM_BEATS = 0.25
/** Fret choices are made per phrase of this many beats. */
const PHRASE_BEATS = 8

export function chartFromScore(score: Score): Chart {
  const resolution = TICKS_PER_BEAT
  const tempos = [{ tick: 0, bpm: score.bpm }]
  const tempo = new TempoMap(resolution, tempos)
  const secondsPerBeat = 60 / score.bpm
  const toTick = (beat: number) => Math.round(beat * resolution)
  const spans = (list: { beat: number; length: number }[]): TickSpan[] =>
    list.map((s) => ({ tick: toTick(s.beat), length: toTick(s.length) }))

  const pitches = score.lead.map((n) => n.pitches[0])
  const lo = Math.min(...pitches)
  const hi = Math.max(...pitches)
  const sectionStarts = score.sections.map((s) => s.beat)
  const phraseOf = (beat: number) => {
    let i = sectionStarts.length - 1
    while (i > 0 && sectionStarts[i] > beat + EPS) i--
    const start = sectionStarts[i] ?? 0
    return i * 1000 + Math.floor((beat - start + EPS) / PHRASE_BEATS)
  }

  const tracks: Track[] = DIFFICULTIES.map((difficulty) => {
    const plan = PLANS[difficulty]
    const kept: LeadNote[] = []
    let lastBeat = -Infinity
    for (const note of score.lead) {
      const gap = note.beat - lastBeat
      if (plan.keep(note, gap, gap * secondsPerBeat)) {
        kept.push(note)
        lastBeat = note.beat
      }
    }
    const frets = assignFrets(
      kept.map((n) => ({ pitch: n.pitches[0], phrase: phraseOf(n.beat) })),
      plan.lanes,
      lo,
      hi,
    )
    const gems: RawGem[] = []
    kept.forEach((note, i) => {
      const tick = toTick(note.beat)
      const sustain = note.length >= SUSTAIN_MIN_BEATS - EPS ? toTick(note.length - SUSTAIN_TRIM_BEATS) : 0
      const fret = frets[i]
      if (plan.chords(note)) {
        const base = Math.min(fret, plan.lanes - 2)
        gems.push({ tick, lane: base, length: sustain }, { tick, lane: base + 1, length: sustain })
      } else gems.push({ tick, lane: fret, length: sustain })
    })
    return buildTrack({ gems, starPhrases: spans(score.star), solos: spans(score.solos) }, tempo, 'guitar', difficulty, {
      hopoThreshold: chartHopoThreshold(resolution),
      sustainCutoff: 0,
    })
  })

  const sections: Section[] = score.sections.map((s) => ({
    tick: toTick(s.beat),
    time: tempo.tickToTime(toTick(s.beat)),
    name: s.name,
  }))

  return {
    resolution,
    tempos,
    timeSignatures: [{ tick: 0, numerator: score.beatsPerBar, denominator: 4 }],
    offset: 0,
    sections,
    tracks,
  }
}

/**
 * Frets for a melody on `lanes` frets. Within a phrase, distinct pitches get
 * distinct frets in pitch order, spread in proportion to their intervals and
 * placed up or down the neck by how high the phrase sits in the song.
 */
export function assignFrets(notes: { pitch: number; phrase: number }[], lanes: number, lo: number, hi: number): number[] {
  const frets = new Array<number>(notes.length).fill(0)
  const range = Math.max(1, hi - lo)
  let i = 0
  while (i < notes.length) {
    let j = i
    while (j < notes.length && notes[j].phrase === notes[i].phrase) j++
    const group = notes.slice(i, j)
    const distinct = [...new Set(group.map((n) => n.pitch))].sort((a, b) => a - b)
    const count = distinct.length
    const fretOf = new Map<number, number>()
    if (count > lanes) {
      distinct.forEach((p, rank) => fretOf.set(p, Math.round((rank * (lanes - 1)) / (count - 1))))
    } else {
      const low = distinct[0]
      const spread = distinct[count - 1] - low
      const span = count === 1 ? 0 : Math.min(lanes - 1, Math.max(count - 1, Math.ceil(spread / 3)))
      const mean = group.reduce((sum, n) => sum + n.pitch, 0) / group.length
      const offset = Math.round(Math.min(1, Math.max(0, (mean - lo) / range)) * (lanes - 1 - span))
      let prev = -1
      distinct.forEach((p, k) => {
        const ideal = spread > 0 ? ((p - low) / spread) * span : 0
        const f = Math.min(Math.max(Math.round(ideal), prev + 1), span - (count - 1 - k))
        fretOf.set(p, offset + f)
        prev = f
      })
    }
    for (let k = i; k < j; k++) frets[k] = fretOf.get(notes[k].pitch)!
    i = j
  }
  // A repeated pitch stays put across phrase edges, and a new pitch moves when there's room.
  for (let k = 1; k < notes.length; k++) {
    const step = notes[k].pitch - notes[k - 1].pitch
    if (step === 0) frets[k] = frets[k - 1]
    else if (frets[k] === frets[k - 1]) {
      const moved = frets[k] + Math.sign(step)
      if (moved >= 0 && moved < lanes) frets[k] = moved
    }
  }
  return frets
}
