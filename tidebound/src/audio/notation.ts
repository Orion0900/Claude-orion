/**
 * The song notation, parsed into timed note events when a track is first
 * played. It is a small dialect of MML, the text format chiptune composers
 * have written in since the 8-bit days: one string per channel, read left to
 * right like a score.
 *
 *   o4 l8 c d e4 | g2 r4 >c4 |       octave 4, eighths by default, bar lines
 *
 *   c d e f g a b   notes; + or # sharpens, - flattens; UPPER case accents
 *   4  8.  12       length after a note or rest, as 1/n of a 4/4 bar; each
 *                   dot adds half again; 3, 6, 12 and 24 are triplets
 *   r               rest
 *   ^8              lengthens the previous note (or rest) by an eighth
 *   c4&d8           legato: the next note continues without re-striking
 *   c4~g8           the same, sliding up or down into the next note
 *   c4{47}          arpeggio: cycles c, c+4 and c+7 semitones fast, the
 *                   chip way of playing a chord on one channel (hex digits)
 *   o5  >  <        set the octave (o4 c is middle C), up one, down one
 *   l8  v12  q6     default length, volume 0-15, gate in eighths of a note
 *   @pluck          switch instrument (see instruments.ts)
 *   [ ... ]3        repeat the bracketed part three times (two if bare)
 *   |               bar line: the bar before it must be exactly one bar long
 *
 * The noise channel takes drum letters instead of notes: k kick, s snare,
 * h hat, o open hat, c crash, t low tom, u high tom, x shaker, p clap,
 * w wood block, g conga. Lengths, rests, volume, accents, repeats and bar
 * lines work the same.
 *
 * Pure: no WebAudio here, so every song can be checked in tests.
 */

/** Ticks per quarter note: fine enough for 64ths, triplets and swing. */
export const TPQ = 48
/** Ticks in a whole note (one bar of 4/4). */
export const WHOLE = TPQ * 4

export const DRUMS = ['kick', 'snare', 'hat', 'open', 'crash', 'tomLo', 'tomHi', 'shaker', 'clap', 'block', 'conga'] as const
export type DrumId = (typeof DRUMS)[number]

const DRUM_LETTERS: Readonly<Record<string, DrumId>> = {
  k: 'kick',
  s: 'snare',
  h: 'hat',
  o: 'open',
  c: 'crash',
  t: 'tomLo',
  u: 'tomHi',
  x: 'shaker',
  p: 'clap',
  w: 'block',
  g: 'conga',
}

const STEPS: Readonly<Record<string, number>> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }

/** A pitch change inside one legato note. */
export interface Bend {
  /** Ticks from the note's start. */
  at: number
  midi: number
  /** Ticks the slide takes; 0 jumps straight there. */
  glide: number
}

export interface NoteEvent {
  /** Start, in ticks from the start of the section. */
  t: number
  /** Ticks the note occupies, ties and legato included. */
  len: number
  /** MIDI note number (60 is middle C); 0 for drums. */
  midi: number
  drum: DrumId | null
  /** 0-1: the channel volume, raised for accents. */
  vel: number
  /** Instrument name. */
  patch: string
  /** Share of `len` that sounds before the release. */
  gate: number
  /** Semitone offsets cycled through while the note sounds (first is 0). */
  arp: readonly number[] | null
  bends: Bend[] | null
}

export interface ChannelOptions {
  /** Ticks in one bar, for the bar-line checks. */
  barTicks: number
  /** Parse drum letters instead of notes. */
  drums?: boolean
  /** Starting instrument. */
  patch: string
  /** Starting volume, 0-15 (default 12). */
  volume?: number
  /** Starting gate, 0-1 (default 7/8). */
  gate?: number
  /** Names the channel in error messages. */
  where?: string
}

export interface ParsedChannel {
  events: NoteEvent[]
  /** Total length in ticks, always whole bars. */
  ticks: number
  bars: number
}

export class NotationError extends Error {}

export function midiToFreq(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12)
}

/** Ticks of a length written as 1/n of a whole note, with optional dots: `lengthTicks('8.')` is 36. */
export function lengthTicks(spec: string): number {
  const m = /^(\d+)(\.*)$/.exec(spec)
  if (!m) throw new NotationError(`bad length "${spec}"`)
  const n = Number(m[1])
  if (n <= 0 || WHOLE % n !== 0) throw new NotationError(`bad length "${spec}"`)
  let ticks = WHOLE / n
  let add = ticks / 2
  for (let i = 0; i < m[2].length; i++) {
    ticks += add
    add /= 2
  }
  if (!Number.isInteger(ticks)) throw new NotationError(`length "${spec}" is too fine`)
  return ticks
}

/** Expands `[ ... ]n` repeats, innermost first. */
export function expandRepeats(src: string, where = 'notation'): string {
  let s = src
  for (let guard = 0; ; guard++) {
    const m = /\[([^[\]]*)\](\d*)/.exec(s)
    if (!m) break
    if (guard > 2000) throw new NotationError(`${where}: too many repeats`)
    const n = m[2] === '' ? 2 : Number(m[2])
    s = `${s.slice(0, m.index)} ${new Array<string>(n).fill(m[1]).join(' ')} ${s.slice(m.index + m[0].length)}`
  }
  if (/[[\]]/.test(s)) throw new NotationError(`${where}: unbalanced [ ]`)
  return s
}

export function parseChannel(src: string, o: ChannelOptions): ParsedChannel {
  const where = o.where ?? 'channel'
  const text = expandRepeats(src, where)
  const drums = o.drums === true
  const events: NoteEvent[] = []
  let i = 0
  let pos = 0
  let barStart = 0
  let bars = 0
  let octave = 4
  let deflen = WHOLE / 8
  let volume = o.volume ?? 12
  let gate = o.gate ?? 0.875
  let patch = o.patch
  /** The note `^`, `&` and `~` continue; null after a rest or drum. */
  let last: NoteEvent | null = null
  /** Pitch at the end of `last`, after its bends. */
  let pitch = 0
  let join = ''

  const fail = (msg: string): never => {
    const near = text.slice(Math.max(0, i - 10), i + 6).replace(/\s+/g, ' ').trim()
    throw new NotationError(`${where}, bar ${bars + 1}: ${msg} (near "${near}")`)
  }
  const int = (): number | null => {
    const start = i
    while (i < text.length && text.charCodeAt(i) >= 48 && text.charCodeAt(i) <= 57) i++
    return i > start ? Number(text.slice(start, i)) : null
  }
  const length = (required: boolean): number => {
    const n = int()
    let ticks = deflen
    if (n === null) {
      if (required) fail('length expected')
    } else {
      if (n <= 0 || WHOLE % n !== 0) fail(`bad length ${n}`)
      ticks = WHOLE / n
    }
    let add = ticks / 2
    while (text[i] === '.') {
      i++
      ticks += add
      add /= 2
    }
    if (!Number.isInteger(ticks)) fail('length too fine')
    return ticks
  }
  const continues = (n: NoteEvent | null): n is NoteEvent => n !== null && n.t + n.len === pos

  while (i < text.length) {
    const c = text[i++]
    if (c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === ',') continue
    switch (c) {
      case '|': {
        const got = pos - barStart
        if (got !== o.barTicks) fail(`bar holds ${got} ticks, expected ${o.barTicks}`)
        barStart = pos
        bars++
        continue
      }
      case 'l':
        deflen = length(true)
        continue
      case 'v': {
        const n = int()
        if (n === null || n > 15) fail('volume is v0 to v15')
        volume = n as number
        continue
      }
      case 'q': {
        const n = int()
        if (n === null || n < 1 || n > 8) fail('gate is q1 to q8')
        gate = (n as number) / 8
        continue
      }
      case '@': {
        const m = /^[A-Za-z0-9_]+/.exec(text.slice(i))
        if (!m) fail('instrument name expected after @')
        patch = (m as RegExpExecArray)[0]
        i += patch.length
        continue
      }
      case 'r':
        pos += length(false)
        last = null
        join = ''
        continue
      case '^': {
        const n = length(false)
        if (continues(last)) last.len += n
        pos += n
        continue
      }
      case '&':
      case '~':
        if (!continues(last)) fail(`${c} must follow a note`)
        join = c
        continue
    }
    if (!drums) {
      if (c === 'o') {
        const n = int()
        if (n === null || n > 8) fail('octave is o0 to o8')
        octave = n as number
        continue
      }
      if (c === '>') {
        octave++
        continue
      }
      if (c === '<') {
        octave--
        continue
      }
    }
    const lower = c.toLowerCase()
    const vel = Math.min(1, (volume / 15) * (c !== lower ? 1.25 : 1))
    if (drums) {
      const drum = DRUM_LETTERS[lower]
      if (drum === undefined) fail(`unknown drum "${c}"`)
      const len = length(false)
      events.push({ t: pos, len, midi: 0, drum, vel, patch, gate, arp: null, bends: null })
      pos += len
      last = null
      continue
    }
    const step = STEPS[lower]
    if (step === undefined) fail(`unexpected "${c}"`)
    let midi = (octave + 1) * 12 + step
    for (;;) {
      const a = text[i]
      if (a === '+' || a === '#') midi++
      else if (a === '-') midi--
      else break
      i++
    }
    if (midi < 12 || midi > 120) fail(`note out of range (${midi})`)
    const len = length(false)
    let arp: number[] | null = null
    if (text[i] === '{') {
      const end = text.indexOf('}', i)
      if (end < 0) fail('unclosed {')
      arp = [0]
      for (const d of text.slice(i + 1, end)) {
        const off = parseInt(d, 16)
        if (Number.isNaN(off)) fail('arpeggio offsets are hex digits')
        arp.push(off)
      }
      i = end + 1
    }
    if (join !== '' && continues(last)) {
      if (midi !== pitch) {
        const bend: Bend = { at: pos - last.t, midi, glide: join === '~' ? Math.min(len / 2, TPQ / 4) : 0 }
        if (last.bends) last.bends.push(bend)
        else last.bends = [bend]
        pitch = midi
      }
      last.len += len
    } else {
      last = { t: pos, len, midi, drum: null, vel, patch, gate, arp, bends: null }
      events.push(last)
      pitch = midi
    }
    join = ''
    pos += len
  }
  if (join !== '') fail(`${join} at the end of the channel`)
  const tail = pos - barStart
  if (tail !== 0 && tail !== o.barTicks) fail(`last bar holds ${tail} ticks, expected ${o.barTicks}`)
  if (tail !== 0) bars++
  return { events, ticks: pos, bars }
}
