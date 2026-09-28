import { Rng } from '../core/rng'

/**
 * Procedural chiptune: each stage gets a key, a tempo, a groove and a
 * generated lead melody. `eventsAt` turns one sixteenth-note step into the
 * notes to play at a given intensity, so the engine only has to schedule
 * and synthesise. Pure and allocation-free per step, so it can be tested.
 */

export type Channel = 'kick' | 'snare' | 'hat' | 'openHat' | 'crash' | 'bass' | 'arp' | 'lead' | 'harmony'

export interface NoteEvent {
  ch: Channel
  /** MIDI note number; 0 for drums. */
  note: number
  /** Length in sixteenth steps. */
  len: number
  /** Velocity 0..1. */
  vel: number
}

export interface LeadNote {
  /** Sixteenth within the bar. */
  step: number
  /** Scale degree relative to the song's root (7 = an octave up in a 7-note scale). */
  degree: number
  len: number
}

export interface Section {
  /** Scale degree of each bar's chord; loops over the song's bars. */
  chords: readonly number[]
  /** The lead melody, one list of notes per bar. */
  lead: ReadonlyArray<readonly LeadNote[]>
}

/**
 * Drum patterns as 16-character strings, one character per sixteenth:
 * 'x' accent, 'o' normal hit, '-' ghost note, '.' rest.
 */
export interface Groove {
  /** Calm, mid and driving kick patterns. */
  kick: readonly [string, string, string]
  /** Mid and driving snare patterns. */
  snare: readonly [string, string]
  /** Snare fill on the last bar of each phrase once the music drives. */
  fill: string
}

export interface Song {
  bpm: number
  /** MIDI note of the tonic in the lead's octave; bass and arp sit below it. */
  root: number
  scale: readonly number[]
  bars: number
  /** The normal progression and melody. */
  calm: Section
  /** The final-swarm variation: a new progression and melody, harmonised. */
  final: Section
  groove: Groove
  /**
   * The title theme: one fixed, gentle arrangement whatever the intensity.
   * Its `calm.lead` is the hook, played on the arp.
   */
  title: boolean
}

export const STEPS_PER_BAR = 16

/** `startMusic` index of the title theme. */
export const TITLE_SONG = -1

/** Intensity thresholds where layers join in. */
export const LAYER = {
  /** Snare backbeat and off-beat hats. */
  beat: 0.2,
  /** Lead melody, busier kick, octave bass. */
  lead: 0.45,
  /** Sixteenth hats and arps, galloping bass, fills. */
  drive: 0.7,
  /** Final swarm: new progression, harmony, crashes, faster tempo. */
  final: 0.95,
} as const

/** The final swarm runs this much faster. */
export const FINAL_TEMPO = 1.06

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
/** The raised seventh gives the dunes their desert colour. */
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11]

interface Preset {
  bpm: number
  root: number
  scale: readonly number[]
  calm: readonly number[]
  final: readonly number[]
  groove: Groove
}

const PRESETS: readonly Preset[] = [
  {
    // Greenwood: sunny pop-punk in G major, I–V–vi–IV.
    bpm: 140,
    root: 67,
    scale: MAJOR,
    calm: [0, 4, 5, 3],
    final: [5, 3, 0, 4],
    groove: {
      kick: ['x.......x.......', 'x.....o.x.......', 'x.....o.x.o...o.'],
      snare: ['....x.......x...', '....x.......x..o'],
      fill: '....x.......xoxx',
    },
  },
  {
    // Sunscorch Dunes: half-time swagger in D harmonic minor, i–VI–iv–V.
    bpm: 128,
    root: 62,
    scale: HARMONIC_MINOR,
    calm: [0, 5, 3, 4],
    final: [0, 3, 5, 4],
    groove: {
      kick: ['x.........x.....', 'x..o......x..o..', 'x..o..x...x..o..'],
      snare: ['........x.......', '....x.......x...'],
      fill: '....x...x.x.xxxx',
    },
  },
  {
    // Hollow Crypt: a driving A minor, i–VI–III–VII.
    bpm: 150,
    root: 69,
    scale: MINOR,
    calm: [0, 5, 2, 6],
    final: [0, 6, 5, 4],
    groove: {
      kick: ['x.......x.......', 'x...x...x...x...', 'x.o.x.o.x.o.x.oo'],
      snare: ['....x.......x...', '....x..-....x.-.'],
      fill: '..x.x.x.xxxxxxxx',
    },
  },
]

const BARS = 8

/** Hats by layer: calm has none. */
const HATS = {
  beat: '..o...o...o...o.',
  lead: 'o.o.o.o.o.o.o.o.',
  drive: 'o-o-o-o-o-o-o-o-',
  /** In the final swarm the off-beat hats open up. */
  open: '..x...x...x...x.',
}

/** Bass: 'R' chord root, 'O' its octave, 'F' its fifth, '.' rest. */
const BASS = {
  calm: 'R...R...R.R.R...',
  lead: 'R.R.O.R.R.R.O.R.',
  drive: 'R.ROR.ROR.ROF.OR',
  final: 'RORORORORORORFOF',
}

/** Arpeggio climbs root, third, fifth, octave of the bar's chord (in scale degrees). */
const ARP_TONES = [0, 2, 4, 7]

/** Lead rhythms; the cadences leave room for a long last note. */
const RHYTHMS = [
  'x.x.x...x.x.x...',
  'x..x..x.x.x.....',
  'x.......x.x.x.x.',
  'x.xx.x..x...x.x.',
  'x...x..x..x.x...',
  'x.x...x.x.x.x.x.',
  'x..x..x...x.x...',
]
const CADENCES = ['x.x.x...x.......', 'x..x..x.x.......', 'x...x...x.......']

/** Lead range in scale degrees around the root. */
const LEAD_LOW = -2
const LEAD_HIGH = 9

/**
 * The title theme: C major at a relaxed 112 bpm (slower than any stage)
 * over I–vi–IV–V. The hook rides the arp in a 3-3-2 lilt, three notes a
 * bar, with soft chord-tone bounces between them. It rises and falls
 * through triads for four bars, ending on a question (D), then answers by
 * stepping down from a high E and leans on G7 back into the loop.
 * Degrees are relative to the root, C5.
 */
const TITLE = {
  bpm: 112,
  root: 72,
  /** C, Am, F, G: the bass walks down from C. */
  chords: [0, -2, -4, -3],
  /** Hook notes land on steps 0, 6 and 12 of each bar. */
  hookSteps: [0, 6, 12],
  hook: [
    [2, 4, 7], // C:  E G C'
    [7, 5, 2], // Am: C' A E
    [3, 5, 7], // F:  F A C'
    [6, 4, 1], // G:  B G D
    [2, 4, 7], // C:  E G C'
    [9, 8, 7], // Am: E' D' C'
    [5, 4, 3], // F:  A G F
    [4, 3, 1], // G7: G F D, leading home to E
  ],
  /**
   * Bounces fill the other eighths an octave below, each digit a chord tone
   * in scale degrees: root, fifth, third, fifth, octave.
   */
  bounce: '..0.4...2.4...7.',
  bass: 'R.....R.....O...',
  kick: 'x.......x.......',
  snare: '....o.......o...',
  /** A soft pickup into the loop on the last bar. */
  fill: '....o.......o.oo',
  hats: '..o...o...o...o.',
} as const

/** Title theme levels: the hook leads, everything else stays soft. */
const TITLE_VEL = { hook: 1, bounce: 0.3, bass: 0.4, kick: 0.5, snare: 0.35, hat: 0.4 } as const

export function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

/** MIDI note of a scale degree; degrees past the scale wrap into the next octave. */
export function degreeToMidi(root: number, scale: readonly number[], degree: number): number {
  const n = scale.length
  const octave = Math.floor(degree / n)
  return root + octave * 12 + scale[degree - octave * n]
}

/** Velocity of a drum pattern character. */
export function hit(pattern: string, step: number): number {
  switch (pattern.charCodeAt(step % pattern.length)) {
    case 120: // x
      return 1
    case 111: // o
      return 0.65
    case 45: // -
      return 0.35
    default:
      return 0
  }
}

/**
 * The song for a stage, or the title theme for `TITLE_SONG`. Deterministic;
 * stages past the third reuse a groove with a new melody.
 */
export function songForStage(stageIndex: number): Song {
  // Checked before the clamp, which would otherwise turn -1 into the first stage.
  if (stageIndex === TITLE_SONG) return titleSong()
  const index = Math.max(0, Math.floor(stageIndex) || 0)
  const preset = PRESETS[index % PRESETS.length]
  const rng = new Rng(0xb0c5 + index * 7919)
  return {
    bpm: preset.bpm,
    root: preset.root,
    scale: preset.scale,
    bars: BARS,
    calm: { chords: preset.calm, lead: makeLead(rng.fork(1), preset.calm) },
    final: { chords: preset.final, lead: makeLead(rng.fork(2), preset.final) },
    groove: preset.groove,
    title: false,
  }
}

function titleSong(): Song {
  const lead = TITLE.hook.map((bar) =>
    bar.map((degree, i) => {
      const step = TITLE.hookSteps[i]
      const next = i + 1 < TITLE.hookSteps.length ? TITLE.hookSteps[i + 1] : STEPS_PER_BAR
      return { step, degree, len: next - step }
    }),
  )
  const section: Section = { chords: TITLE.chords, lead }
  return {
    bpm: TITLE.bpm,
    root: TITLE.root,
    scale: MAJOR,
    bars: lead.length,
    calm: section,
    final: section,
    // One groove whatever the intensity.
    groove: { kick: [TITLE.kick, TITLE.kick, TITLE.kick], snare: [TITLE.snare, TITLE.snare], fill: TITLE.fill },
    title: true,
  }
}

/** Seconds per sixteenth at an intensity. */
export function stepDuration(song: Song, intensity: number): number {
  const tempo = song.bpm * (!song.title && intensity >= LAYER.final ? FINAL_TEMPO : 1)
  return 60 / tempo / 4
}

/**
 * Eases the played intensity toward the game's: it swells slowly, drops
 * slower still, and snaps up fast when the final swarm starts.
 */
export function smoothIntensity(current: number, target: number, dt: number): number {
  const goal = Number.isFinite(target) ? Math.min(1, Math.max(0, target)) : current
  if (!(dt > 0)) return current
  const rate = goal > current ? (goal >= LAYER.final ? 2 : 0.4) : 0.25
  const step = rate * dt
  return Math.abs(goal - current) <= step ? goal : current + Math.sign(goal - current) * step
}

/**
 * Fills `out` with the notes at `step` (sixteenths since the song began)
 * and returns how many. Entries of `out` are reused, so a scheduler can call
 * this every step without allocating.
 */
export function eventsAt(song: Song, step: number, intensity: number, out: NoteEvent[]): number {
  const loop = song.bars * STEPS_PER_BAR
  const pos = ((Math.floor(step) % loop) + loop) % loop
  const bar = Math.floor(pos / STEPS_PER_BAR)
  const s = pos % STEPS_PER_BAR
  if (song.title) return titleEventsAt(song, bar, s, out)
  const level = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0))
  const final = level >= LAYER.final
  const drive = level >= LAYER.drive
  const section = final ? song.final : song.calm
  const chord = section.chords[bar % section.chords.length]
  const groove = song.groove
  const phraseEnd = bar % 4 === 3
  let n = 0

  // Drums.
  const kick = hit(level < LAYER.lead ? groove.kick[0] : drive ? groove.kick[2] : groove.kick[1], s)
  if (kick > 0) n = put(out, n, 'kick', 0, 1, kick * (0.7 + 0.3 * level))

  if (level >= LAYER.beat) {
    const snarePattern = drive && phraseEnd ? groove.fill : drive ? groove.snare[1] : groove.snare[0]
    const snare = hit(snarePattern, s)
    if (snare > 0) n = put(out, n, 'snare', 0, 1, snare * (0.75 + 0.25 * level))

    const open = final ? hit(HATS.open, s) : 0
    if (open > 0) n = put(out, n, 'openHat', 0, 2, open * 0.8)
    else {
      const hat = hit(drive ? HATS.drive : level >= LAYER.lead ? HATS.lead : HATS.beat, s)
      if (hat > 0) n = put(out, n, 'hat', 0, 1, hat * (0.6 + 0.4 * level))
    }
  }
  if (final && s === 0 && bar % 4 === 0) n = put(out, n, 'crash', 0, 8, 0.8)

  // Bass.
  const bassPattern = final ? BASS.final : drive ? BASS.drive : level >= LAYER.lead ? BASS.lead : BASS.calm
  const b = bassPattern.charCodeAt(s)
  if (b !== 46) {
    const base = song.root - 24
    const note =
      b === 79 // O
        ? degreeToMidi(base, song.scale, chord) + 12
        : b === 70 // F
          ? degreeToMidi(base, song.scale, chord + 4)
          : degreeToMidi(base, song.scale, chord)
    n = put(out, n, 'bass', note, gapAfter(bassPattern, s, 4), 0.8 + 0.2 * level)
  }

  // Arpeggio over the chord: eighths when calm, sixteenths once it drives.
  if (drive || s % 2 === 0) {
    const i = drive ? s % 4 : (s / 2) % 4
    const up = final && s % 8 >= 4 ? 7 : 0
    const note = degreeToMidi(song.root - 12, song.scale, chord + ARP_TONES[i] + up)
    // Stage arps stay well under the full arp level; only the title hook uses it.
    n = put(out, n, 'arp', note, 1, 0.175 + 0.125 * level)
  }

  // Lead, with a harmony a third above in the final swarm.
  if (level >= LAYER.lead) {
    const notes = section.lead[bar % section.lead.length]
    for (const note of notes) {
      if (note.step !== s) continue
      n = put(out, n, 'lead', degreeToMidi(song.root, song.scale, note.degree), note.len, 0.9)
      if (final) n = put(out, n, 'harmony', degreeToMidi(song.root, song.scale, note.degree + 2), note.len, 0.5)
    }
  }
  return n
}

/** The title theme's step: light drums, a soft bass and the arp hook, with no layers to climb. */
function titleEventsAt(song: Song, bar: number, s: number, out: NoteEvent[]): number {
  const section = song.calm
  const chord = section.chords[bar % section.chords.length]
  let n = 0

  const kick = hit(TITLE.kick, s)
  if (kick > 0) n = put(out, n, 'kick', 0, 1, kick * TITLE_VEL.kick)
  const snare = hit(bar === song.bars - 1 ? TITLE.fill : TITLE.snare, s)
  if (snare > 0) n = put(out, n, 'snare', 0, 1, snare * TITLE_VEL.snare)
  const hat = hit(TITLE.hats, s)
  if (hat > 0) n = put(out, n, 'hat', 0, 1, hat * TITLE_VEL.hat)

  const b = TITLE.bass.charCodeAt(s)
  if (b !== 46) {
    const note = degreeToMidi(song.root - 24, song.scale, chord) + (b === 79 ? 12 : 0)
    n = put(out, n, 'bass', note, gapAfter(TITLE.bass, s, 4), TITLE_VEL.bass)
  }

  for (const note of section.lead[bar % section.lead.length]) {
    if (note.step === s) n = put(out, n, 'arp', degreeToMidi(song.root, song.scale, note.degree), note.len, TITLE_VEL.hook)
  }
  const tone = TITLE.bounce.charCodeAt(s) - 48 // '0'
  if (tone >= 0 && tone <= 9) n = put(out, n, 'arp', degreeToMidi(song.root - 12, song.scale, chord + tone), 1, TITLE_VEL.bounce)
  return n
}

function put(out: NoteEvent[], n: number, ch: Channel, note: number, len: number, vel: number): number {
  const e = out[n]
  if (e) {
    e.ch = ch
    e.note = note
    e.len = len
    e.vel = vel
  } else out[n] = { ch, note, len, vel }
  return n + 1
}

/** Steps until the next hit in a pattern (wrapping), capped at `max`. */
function gapAfter(pattern: string, step: number, max: number): number {
  for (let i = 1; i < max; i++) if (pattern.charCodeAt((step + i) % pattern.length) !== 46) return i
  return max
}

/**
 * A lead melody over a four-chord progression across eight bars: a
 * question (bars 1–4, ending on the fifth) and its answer (bars 5–8,
 * repeating the question's first three bars, ending on the tonic). Strong
 * beats land on chord tones and the rest moves by step, which keeps it
 * singable.
 */
function makeLead(rng: Rng, chords: readonly number[]): LeadNote[][] {
  const half = BARS / 2
  const bars: LeadNote[][] = []
  let degree = nearestChordTone(4, chords[0])
  for (let bar = 0; bar < BARS; bar++) {
    const phrasePos = bar % half
    if (bar >= half && phrasePos < half - 1) {
      bars.push(bars[bar - half])
      continue
    }
    const cadence = phrasePos === half - 1
    const rhythm = rng.pick(cadence ? CADENCES : RHYTHMS)
    const chord = chords[bar % chords.length]
    const onsets: number[] = []
    for (let s = 0; s < STEPS_PER_BAR; s++) if (rhythm[s] === 'x') onsets.push(s)
    const notes: LeadNote[] = []
    onsets.forEach((s, j) => {
      const last = j === onsets.length - 1
      if (cadence && last) degree = nearestOf(degree, bar === BARS - 1 ? [0, 7] : [4])
      else if (j === 0 || s % 4 === 0) degree = nearestChordTone(degree, chord)
      else degree = reflect(degree + rng.weighted([-2, -1, 1, 2, 0], (d) => (d === 0 ? 0.5 : Math.abs(d) === 1 ? 3 : 1.5)))
      const next = last ? STEPS_PER_BAR : onsets[j + 1]
      notes.push({ step: s, degree, len: Math.min(cadence && last ? 8 : 4, next - s) })
    })
    bars.push(notes)
  }
  return bars
}

function nearestChordTone(degree: number, chord: number): number {
  const candidates: number[] = []
  for (let octave = -1; octave <= 2; octave++) for (const t of [0, 2, 4]) candidates.push(chord + t + octave * 7)
  return nearestOf(degree, candidates)
}

function nearestOf(degree: number, candidates: readonly number[]): number {
  let best = Number.NaN
  for (const c of candidates) {
    if (c < LEAD_LOW || c > LEAD_HIGH) continue
    if (Number.isNaN(best) || Math.abs(c - degree) < Math.abs(best - degree)) best = c
  }
  return Number.isNaN(best) ? reflect(degree) : best
}

/** Keeps a wandering melody inside the lead's range by bouncing off its ends. */
function reflect(degree: number): number {
  if (degree > LEAD_HIGH) return LEAD_HIGH - (degree - LEAD_HIGH)
  if (degree < LEAD_LOW) return LEAD_LOW + (LEAD_LOW - degree)
  return degree
}
