import { lengthTicks, NotationError, WHOLE } from './notation'

/**
 * Accompaniment from chord symbols, so a song's harmony and bass read like a
 * lead sheet instead of hundreds of hand-placed notes:
 *
 *   accomp('D Bm G,A D', '0 1 2 3 2 1 2 1', { center: 64 })
 *
 * plays eighth-note broken chords over four bars (the third bar is split
 * between G and A). The result is ordinary notation text, one bar per chord
 * slot group, so the bar checks apply to it like everything else.
 *
 * Chords: a root (C, F#, Bb...), a quality ('' major, m, 7, maj7, m7, dim,
 * dim7, m7b5, aug, sus2, sus4, 7sus4, add9, madd9, 6, m6, 9, m9, 5) and an
 * optional slash bass (D/F#). Bars are separated by spaces; commas split a
 * bar evenly between chords. `%` repeats the previous bar and `-` is a bar
 * (or slot) of silence.
 *
 * Pattern tokens, each with an optional `:length` (default `len`):
 *   0 1 2 ...   chord tones counted up from the root nearest `center`
 *               (0 root, 1 third, 2 fifth, 3 seventh or octave...);
 *               -1, -2 count downward
 *   R O         the bass note (the slash note if any) and its octave
 *   F T S       the chord's fifth, third and seventh just above the bass
 *   L           the fifth just below the bass
 *   N M         a semitone below / above the next chord's bass: approach notes
 *   r           rest
 *   v9 q4 @x    passed through unchanged
 * A token may end in `!` to accent it.
 */

const NOTE_PC: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const MML_NAMES = ['c', 'c+', 'd', 'd+', 'e', 'f', 'f+', 'g', 'g+', 'a', 'a+', 'b'] as const

const QUALITIES: Readonly<Record<string, readonly number[]>> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 2, 4, 7],
  madd9: [0, 2, 3, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '9': [0, 2, 4, 7, 10],
  m9: [0, 2, 3, 7, 10],
  '5': [0, 7],
}

export interface Chord {
  symbol: string
  /** Pitch class of the root, 0-11 (C = 0). */
  root: number
  /** Semitones above the root, ascending, within one octave. */
  tones: readonly number[]
  /** Pitch class of the bass note. */
  bass: number
}

function pitchClass(letter: string, accidental: string): number {
  const base = NOTE_PC[letter]
  const shift = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0
  return (base + shift + 12) % 12
}

export function parseChord(symbol: string): Chord {
  const m = /^([A-G])([#b]?)([^/]*)(?:\/([A-G])([#b]?))?$/.exec(symbol)
  const tones = m ? QUALITIES[m[3]] : undefined
  if (!m || !tones) throw new NotationError(`unknown chord "${symbol}"`)
  const root = pitchClass(m[1], m[2])
  return { symbol, root, tones, bass: m[4] ? pitchClass(m[4], m[5]) : root }
}

/** The MIDI note of pitch class `pc` nearest `center` (the lower one on a tie). */
export function nearest(pc: number, center: number): number {
  const below = center - ((center - pc + 1200) % 12)
  return center - below <= below + 12 - center ? below : below + 12
}

/** The first note of pitch class `pc` strictly above `note`. */
function above(pc: number, note: number): number {
  const n = note + ((pc - note + 1200) % 12)
  return n > note ? n : n + 12
}

/** The first note of pitch class `pc` strictly below `note`. */
function below(pc: number, note: number): number {
  const n = note - ((note - pc + 1200) % 12)
  return n < note ? n : n - 12
}

function interval(chord: Chord, options: readonly number[], fallback: number): number {
  for (const o of options) if (chord.tones.includes(o)) return o
  return fallback
}

export interface AccompOptions {
  /** MIDI note the voicing centres on: chord roots and bass notes land nearest it. */
  center: number
  /** Default token length, as in the notation (default '8'). */
  len?: string
  /** Ticks per bar (default one bar of 4/4). */
  barTicks?: number
}

type Slot = Chord | null

function parseBars(chords: string): Slot[][] {
  const bars: Slot[][] = []
  for (const word of chords.trim().split(/\s+/)) {
    if (word === '%') {
      if (bars.length === 0) throw new NotationError('% with no bar before it')
      bars.push(bars[bars.length - 1])
      continue
    }
    bars.push(word.split(',').map((c) => (c === '-' ? null : parseChord(c))))
  }
  return bars
}

interface Token {
  kind: 'tone' | 'rest' | 'raw'
  tone: string
  ticks: number
  len: string
  accent: boolean
}

function parsePattern(pattern: string, defaultLen: string, barTicks: number): Token[] {
  const tokens: Token[] = []
  let total = 0
  for (const word of pattern.trim().split(/\s+/)) {
    if (/^[vq@]/.test(word)) {
      tokens.push({ kind: 'raw', tone: word, ticks: 0, len: '', accent: false })
      continue
    }
    const m = /^(-?\d|[ROFTSLNM]|r)(?::(\d+\.*))?(!?)$/.exec(word)
    if (!m) throw new NotationError(`bad pattern token "${word}"`)
    const len = m[2] ?? defaultLen
    const ticks = lengthTicks(len)
    tokens.push({ kind: m[1] === 'r' ? 'rest' : 'tone', tone: m[1], ticks, len, accent: m[3] === '!' })
    total += ticks
  }
  if (total !== barTicks) throw new NotationError(`pattern "${pattern}" holds ${total} ticks, expected ${barTicks}`)
  return tokens
}

function noteName(midi: number, accent: boolean): string {
  const name = MML_NAMES[midi % 12]
  return `o${Math.floor(midi / 12) - 1}${accent ? name.toUpperCase() : name}`
}

function resolve(tone: string, chord: Chord, next: Chord, center: number): number {
  const bass = nearest(chord.bass, center)
  const root = nearest(chord.root, center)
  const pc = (semis: number): number => (chord.root + semis) % 12
  switch (tone) {
    case 'R':
      return bass
    case 'O':
      return bass + 12
    case 'F':
      return above(pc(interval(chord, [7, 6, 8], 7)), bass)
    case 'T':
      return above(pc(interval(chord, [4, 3, 5, 2], 4)), bass)
    case 'S':
      return above(pc(interval(chord, [10, 11, 9], 10)), bass)
    case 'L':
      return below(pc(interval(chord, [7, 6, 8], 7)), bass)
    case 'N':
      return nearest(next.bass, center) - 1
    case 'M':
      return nearest(next.bass, center) + 1
  }
  const i = Number(tone)
  const n = chord.tones.length
  const oct = Math.floor(i / n)
  return root + chord.tones[i - oct * n] + 12 * oct
}

/** Notation for `pattern` played over each bar of `chords`. */
export function accomp(chords: string, pattern: string, o: AccompOptions): string {
  const barTicks = o.barTicks ?? WHOLE
  const tokens = parsePattern(pattern, o.len ?? '8', barTicks)
  const bars = parseBars(chords)
  const slots = bars.flat()
  const out: string[] = []
  let slotIndex = 0
  bars.forEach((bar) => {
    const slotTicks = barTicks / bar.length
    let t = 0
    const words: string[] = []
    for (const tok of tokens) {
      if (tok.kind === 'raw') {
        words.push(tok.tone)
        continue
      }
      const s = Math.min(bar.length - 1, Math.floor(t / slotTicks))
      const chord = bar[s]
      if (tok.kind === 'rest' || chord === null) words.push(`r${tok.len}`)
      else {
        let next: Chord = chord
        for (let k = 1; k <= slots.length; k++) {
          const cand = slots[(slotIndex + s + k) % slots.length]
          if (cand) {
            next = cand
            break
          }
        }
        words.push(noteName(resolve(tok.tone, chord, next, o.center), tok.accent) + tok.len)
      }
      t += tok.ticks
    }
    slotIndex += bar.length
    out.push(`${words.join(' ')} |`)
  })
  return out.join('\n')
}
