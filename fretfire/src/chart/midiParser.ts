import {
  buildTrack,
  midiHopoThreshold,
  midiSustainCutoff,
  ticksInSpans,
  type ForceFlag,
  type RawGem,
  type TickSpan,
} from './builder'
import { decodeText, sectionName, type ParsedChart } from './chartParser'
import { TempoMap, normalizeTempos } from './tempo'
import {
  DIFFICULTIES,
  INSTRUMENTS,
  OPEN_LANE,
  type Chart,
  type Difficulty,
  type Instrument,
  type Section,
  type TempoChange,
  type TimeSignature,
  type Track,
} from './types'

export interface MidiParseOptions {
  /** song.ini hopo_frequency, in ticks. */
  hopoFrequency?: number
  /** song.ini sustain_cutoff_threshold, in ticks. */
  sustainCutoff?: number
  /** song.ini delay, in seconds. */
  delay?: number
}

interface MidiNote {
  key: number
  tick: number
  length: number
}

interface MidiText {
  tick: number
  text: string
}

interface MidiTrack {
  name: string
  notes: MidiNote[]
  texts: MidiText[]
  sysex: { tick: number; data: Uint8Array }[]
  /** Tick of the last event read. */
  endTick: number
}

const TRACK_INSTRUMENTS: Record<string, Instrument> = {
  'PART GUITAR': 'guitar',
  'T1 GEMS': 'guitar',
  'PART GUITAR COOP': 'coop',
  'PART BASS': 'bass',
  'PART RHYTHM': 'rhythm',
  'PART KEYS': 'keys',
}

/** The note of each difficulty's green fret. */
const DIFFICULTY_BASE: Record<Difficulty, number> = { easy: 60, medium: 72, hard: 84, expert: 96 }
const SOLO_NOTE = 103
const TAP_NOTE = 104
const STAR_NOTE = 116
const PS_OPEN = 1
const PS_TAP = 4

/**
 * Parses a Rock Band / Clone Hero `notes.mid`. Throws only when the file isn't
 * a usable Standard MIDI File at all; damaged tracks are read as far as they go.
 */
export function parseMidi(bytes: Uint8Array, options: MidiParseOptions = {}): ParsedChart {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 14 || fourCC(bytes, 0) !== 'MThd') throw new Error('This is not a MIDI file')
  const headerLength = view.getUint32(4)
  const division = view.getUint16(12)
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported')

  const tempos: TempoChange[] = []
  const signatures: TimeSignature[] = []
  const tracks: MidiTrack[] = []
  let pos = 8 + headerLength
  while (pos + 8 <= bytes.length) {
    const type = fourCC(bytes, pos)
    const length = view.getUint32(pos + 4)
    const start = pos + 8
    const end = Math.min(bytes.length, start + length)
    if (type === 'MTrk') tracks.push(readTrack(bytes, start, end, tempos, signatures))
    pos = start + length
  }

  const tempo = new TempoMap(division, tempos, options.delay ?? 0, signatures)
  const buildOptions = {
    hopoThreshold: options.hopoFrequency ?? midiHopoThreshold(tempo.resolution),
    sustainCutoff: options.sustainCutoff ?? midiSustainCutoff(tempo.resolution),
  }

  const built: Track[] = []
  for (const track of tracks) {
    const instrument = TRACK_INSTRUMENTS[track.name.trim().toUpperCase()]
    if (!instrument) continue
    for (const part of buildInstrument(track, instrument, tempo, buildOptions)) {
      // A second track for the same part (say T1 GEMS next to PART GUITAR) only fills gaps.
      if (!built.some((t) => t.instrument === part.instrument && t.difficulty === part.difficulty)) built.push(part)
    }
  }
  built.sort(
    (a, b) =>
      INSTRUMENTS.indexOf(a.instrument) - INSTRUMENTS.indexOf(b.instrument) ||
      DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty),
  )

  // Sections live in the EVENTS track; a file without one may keep them in the tempo track.
  const eventsTrack = tracks.find((t) => t.name.trim().toUpperCase() === 'EVENTS') ?? tracks[0]
  const sections: Section[] = []
  for (const { tick, text } of eventsTrack?.texts ?? []) {
    const name = sectionName(text)
    if (name) sections.push({ tick, time: tempo.tickToTime(tick), name })
  }
  sections.sort((a, b) => a.tick - b.tick)

  const chart: Chart = {
    resolution: tempo.resolution,
    tempos: normalizeTempos(tempos),
    timeSignatures: tempo.signatures,
    offset: tempo.offset,
    sections,
    tracks: built,
  }
  return { chart, meta: {} }
}

/** Thrown inside readTrack when a track ends mid-event. */
const TRUNCATED = new Error('truncated MIDI track')

function readTrack(
  bytes: Uint8Array,
  start: number,
  end: number,
  tempos: TempoChange[],
  signatures: TimeSignature[],
): MidiTrack {
  const track: MidiTrack = { name: '', notes: [], texts: [], sysex: [], endTick: 0 }
  // Open notes by key. `replaced` marks a note-on that closed an earlier note
  // on the same tick, so a note-off written after it still ends the earlier one.
  const open = new Map<number, { tick: number; replaced: boolean }>()
  let hasName = false
  let pos = start
  let tick = 0
  let status = 0

  const readVlq = (): number => {
    let value = 0
    for (let i = 0; i < 4; i++) {
      if (pos >= end) throw TRUNCATED
      const b = bytes[pos++]
      value = value * 128 + (b & 0x7f)
      if (!(b & 0x80)) return value
    }
    throw TRUNCATED
  }
  const noteOn = (key: number) => {
    const prev = open.get(key)
    if (prev) track.notes.push({ key, tick: prev.tick, length: tick - prev.tick })
    open.set(key, { tick, replaced: prev !== undefined })
  }
  const noteOff = (key: number) => {
    const prev = open.get(key)
    if (!prev) return
    if (prev.replaced && prev.tick === tick) {
      prev.replaced = false
      return
    }
    track.notes.push({ key, tick: prev.tick, length: tick - prev.tick })
    open.delete(key)
  }

  try {
    while (pos < end) {
      tick += readVlq()
      if (pos >= end) throw TRUNCATED
      let first = bytes[pos]
      if (first & 0x80) pos++
      else if (status) first = status
      else break // data with no status byte: the track is garbage from here on

      if (first === 0xff) {
        if (pos >= end) throw TRUNCATED
        const type = bytes[pos++]
        const length = readVlq()
        if (pos + length > end) throw TRUNCATED
        const data = bytes.subarray(pos, pos + length)
        pos += length
        if (type === 0x2f) break
        if (type === 0x03) {
          if (!hasName) track.name = decodeText(data)
          hasName = true
        } else if (type === 0x01 || type === 0x05 || type === 0x06 || type === 0x07) {
          track.texts.push({ tick, text: decodeText(data) })
        } else if (type === 0x51 && length >= 3) {
          const micros = (data[0] << 16) | (data[1] << 8) | data[2]
          if (micros > 0) tempos.push({ tick, bpm: 60_000_000 / micros })
        } else if (type === 0x58 && length >= 2) {
          signatures.push({ tick, numerator: data[0], denominator: 2 ** data[1] })
        }
      } else if (first === 0xf0 || first === 0xf7) {
        const length = readVlq()
        if (pos + length > end) throw TRUNCATED
        if (first === 0xf0) track.sysex.push({ tick, data: bytes.subarray(pos, pos + length) })
        pos += length
      } else if (first >= 0xf0) {
        break // not allowed in a MIDI file
      } else {
        status = first
        const kind = first & 0xf0
        const size = kind === 0xc0 || kind === 0xd0 ? 1 : 2
        if (pos + size > end) throw TRUNCATED
        const key = bytes[pos]
        const velocity = size === 2 ? bytes[pos + 1] : 0
        pos += size
        if (kind === 0x90 && velocity > 0) noteOn(key)
        else if (kind === 0x80 || kind === 0x90) noteOff(key)
      }
    }
  } catch (error) {
    if (error !== TRUNCATED) throw error
  }

  for (const [key, note] of open) track.notes.push({ key, tick: note.tick, length: tick - note.tick })
  track.endTick = tick
  return track
}

/** Builds every difficulty of one instrument track. */
function buildInstrument(
  track: MidiTrack,
  instrument: Instrument,
  tempo: TempoMap,
  buildOptions: { hopoThreshold: number; sustainCutoff: number },
): Track[] {
  const enhancedOpens = track.texts.some((t) => /^\[?\s*enhanced_opens\s*\]?$/i.test(t.text.trim()))
  const spansOf = (key: number): TickSpan[] =>
    track.notes.filter((n) => n.key === key).map((n) => ({ tick: n.tick, length: n.length }))
  const tapSpans = spansOf(TAP_NOTE)
  const starPhrases = spansOf(STAR_NOTE)
  const solos = spansOf(SOLO_NOTE)
  const phaseShift = phaseShiftSpans(track)

  const out: Track[] = []
  for (const difficulty of DIFFICULTIES) {
    const base = DIFFICULTY_BASE[difficulty]
    let gems: RawGem[] = []
    for (const note of track.notes) {
      const lane = note.key - base
      if (lane >= 0 && lane <= 4) gems.push({ tick: note.tick, lane, length: note.length })
      else if (lane === -1 && enhancedOpens) gems.push({ tick: note.tick, lane: OPEN_LANE, length: note.length })
    }
    if (!gems.length) continue

    const openSpans = phaseShift.get(`${difficulty}/${PS_OPEN}`) ?? []
    if (openSpans.length) gems = applyOpenSpans(gems, openSpans)

    const ticks = [...new Set(gems.map((g) => g.tick))]
    const forces = new Map<number, ForceFlag>()
    for (const tick of ticksInSpans(ticks, spansOf(base + 5))) forces.set(tick, 'hopo')
    for (const tick of ticksInSpans(ticks, spansOf(base + 6))) forces.set(tick, 'strum')
    const taps = ticksInSpans(ticks, [...tapSpans, ...(phaseShift.get(`${difficulty}/${PS_TAP}`) ?? [])])

    const built = buildTrack({ gems, forces, taps, starPhrases, solos }, tempo, instrument, difficulty, buildOptions)
    if (built.notes.length) out.push(built)
  }
  return out
}

/**
 * Phase Shift open-note and tap spans from sysex events
 * `50 53 00 00 <difficulty> <type> <on>`, keyed by `difficulty/type`.
 */
function phaseShiftSpans(track: MidiTrack): Map<string, TickSpan[]> {
  const spans = new Map<string, TickSpan[]>()
  const openAt = new Map<string, number>()
  const events = [...track.sysex].sort((a, b) => a.tick - b.tick)
  for (const { tick, data } of events) {
    if (data.length < 7 || data[0] !== 0x50 || data[1] !== 0x53 || data[2] !== 0 || data[3] !== 0) continue
    const [, , , , diff, type, on] = data
    if (type !== PS_OPEN && type !== PS_TAP) continue
    const targets = diff === 0xff ? DIFFICULTIES : diff <= 3 ? [DIFFICULTIES[diff]] : []
    for (const difficulty of targets) {
      const key = `${difficulty}/${type}`
      const started = openAt.get(key)
      if (on === 1) {
        if (started === undefined) openAt.set(key, tick)
      } else if (on === 0 && started !== undefined) {
        pushSpan(spans, key, { tick: started, length: tick - started })
        openAt.delete(key)
      }
    }
  }
  for (const [key, started] of openAt) pushSpan(spans, key, { tick: started, length: track.endTick - started })
  return spans
}

function pushSpan(spans: Map<string, TickSpan[]>, key: string, span: TickSpan): void {
  const list = spans.get(key)
  if (list) list.push(span)
  else spans.set(key, [span])
}

/** Inside a Phase Shift open span every gem on a tick becomes one open gem, as long as the longest. */
function applyOpenSpans(gems: RawGem[], spans: TickSpan[]): RawGem[] {
  const inside = ticksInSpans(new Set(gems.map((g) => g.tick)), spans)
  if (!inside.size) return gems
  const longest = new Map<number, number>()
  const out: RawGem[] = []
  for (const gem of gems) {
    if (inside.has(gem.tick)) longest.set(gem.tick, Math.max(longest.get(gem.tick) ?? 0, gem.length))
    else out.push(gem)
  }
  for (const [tick, length] of longest) out.push({ tick, lane: OPEN_LANE, length })
  return out
}

function fourCC(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])
}
