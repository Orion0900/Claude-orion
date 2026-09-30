import { buildTrack, chartHopoThreshold, type ForceFlag, type RawGem, type TickSpan } from './builder'
import { stripRichText } from './iniParser'
import { TempoMap, normalizeTempos } from './tempo'
import {
  DIFFICULTIES,
  INSTRUMENTS,
  OPEN_LANE,
  type Chart,
  type Difficulty,
  type Instrument,
  type Section,
  type SongMeta,
  type TempoChange,
  type TimeSignature,
  type Track,
} from './types'

/** song.ini settings that change how a .chart plays. */
export interface ChartParseOptions {
  /** song.ini hopo_frequency, in ticks. */
  hopoFrequency?: number
  /** song.ini delay, in seconds. */
  delay?: number
}

/** A parsed chart plus whatever song metadata the file itself carries. */
export interface ParsedChart {
  chart: Chart
  meta: Partial<SongMeta>
}

const TRACK_NAME = /^(easy|medium|hard|expert)(single|doubleguitar|doublebass|doublerhythm|keyboard)$/i

const TRACK_INSTRUMENTS: Record<string, Instrument> = {
  single: 'guitar',
  doubleguitar: 'coop',
  doublebass: 'bass',
  doublerhythm: 'rhythm',
  keyboard: 'keys',
}

interface PendingTrack {
  instrument: Instrument
  difficulty: Difficulty
  gems: RawGem[]
  forces: Map<number, ForceFlag>
  taps: Set<number>
  starPhrases: TickSpan[]
  /** Solo starts (true) and ends (false) in file order. */
  soloMarks: { tick: number; start: boolean }[]
}

type SectionKind = 'song' | 'sync' | 'events' | 'track' | 'skip'

/**
 * Parses a Clone Hero / Moonscraper `.chart` file. Unknown sections, broken
 * lines and events this game doesn't use are skipped.
 */
export function parseChartText(text: string, options: ChartParseOptions = {}): ParsedChart {
  const song: Record<string, string> = {}
  const tempos: TempoChange[] = []
  const signatures: TimeSignature[] = []
  const sectionMarks: { tick: number; name: string }[] = []
  const tracks = new Map<string, PendingTrack>()

  let kind: SectionKind = 'skip'
  let track: PendingTrack | undefined
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line || line === '{' || line === '}') continue
    if (line.startsWith('[')) {
      const close = line.indexOf(']')
      const name = (close > 0 ? line.slice(1, close) : line.slice(1)).trim()
      track = undefined
      const lower = name.toLowerCase()
      if (lower === 'song') kind = 'song'
      else if (lower === 'synctrack') kind = 'sync'
      else if (lower === 'events') kind = 'events'
      else {
        const match = TRACK_NAME.exec(name)
        if (match) {
          const difficulty = match[1].toLowerCase() as Difficulty
          const instrument = TRACK_INSTRUMENTS[match[2].toLowerCase()]
          const key = `${instrument}/${difficulty}`
          track = tracks.get(key)
          if (!track) {
            track = newTrack(instrument, difficulty)
            tracks.set(key, track)
          }
          kind = 'track'
        } else kind = 'skip'
      }
      continue
    }
    if (kind === 'skip') continue

    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (kind === 'song') {
      song[key.toLowerCase()] = unquote(value)
      continue
    }

    if (!/^\d+$/.test(key)) continue
    const tick = Number(key)
    const space = value.search(/\s/)
    const type = (space < 0 ? value : value.slice(0, space)).toUpperCase()
    const rest = space < 0 ? '' : value.slice(space + 1).trim()
    const args = rest ? rest.split(/\s+/) : []

    if (kind === 'sync') {
      if (type === 'B') {
        const bpm = Number(args[0]) / 1000
        if (Number.isFinite(bpm) && bpm > 0) tempos.push({ tick, bpm })
      } else if (type === 'TS') {
        const numerator = Number(args[0])
        const exponent = args.length > 1 ? Number(args[1]) : 2
        if (Number.isFinite(numerator) && Number.isFinite(exponent)) {
          signatures.push({ tick, numerator, denominator: 2 ** exponent })
        }
      }
    } else if (kind === 'events') {
      if (type === 'E') {
        const name = sectionName(unquote(rest))
        if (name) sectionMarks.push({ tick, name })
      }
    } else if (track) {
      if (type === 'N') {
        const fret = Number(args[0])
        const length = args.length > 1 ? Number(args[1]) : 0
        const len = Number.isFinite(length) && length > 0 ? length : 0
        if (fret >= 0 && fret <= 4 && Number.isInteger(fret)) track.gems.push({ tick, lane: fret, length: len })
        else if (fret === 5) track.forces.set(tick, 'flip')
        else if (fret === 6) track.taps.add(tick)
        else if (fret === 7) track.gems.push({ tick, lane: OPEN_LANE, length: len })
      } else if (type === 'S') {
        const length = Number(args[1])
        if (Number(args[0]) === 2) track.starPhrases.push({ tick, length: Number.isFinite(length) ? length : 0 })
      } else if (type === 'E') {
        const event = unquote(rest).toLowerCase()
        if (event === 'solo') track.soloMarks.push({ tick, start: true })
        else if (event === 'soloend') track.soloMarks.push({ tick, start: false })
      }
    }
  }

  const resolution = Number(song.resolution)
  const songOffset = parseFloat(song.offset ?? '')
  const offset = (Number.isFinite(songOffset) ? songOffset : 0) + (options.delay ?? 0)
  // TempoMap falls back to 192 ticks per beat for a missing or broken resolution.
  const tempo = new TempoMap(resolution, tempos, offset, signatures)
  const buildOptions = {
    hopoThreshold: options.hopoFrequency ?? chartHopoThreshold(tempo.resolution),
    sustainCutoff: 0,
  }

  const built: Track[] = []
  for (const pending of tracks.values()) {
    const { gems, forces, taps, starPhrases, soloMarks, instrument, difficulty } = pending
    if (!gems.length) continue
    const lastTick = gems.reduce((max, gem) => Math.max(max, gem.tick), 0)
    const track = buildTrack(
      { gems, forces, taps, starPhrases, solos: pairSolos(soloMarks, lastTick) },
      tempo,
      instrument,
      difficulty,
      buildOptions,
    )
    if (track.notes.length) built.push(track)
  }
  built.sort(
    (a, b) =>
      INSTRUMENTS.indexOf(a.instrument) - INSTRUMENTS.indexOf(b.instrument) ||
      DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty),
  )

  const sections: Section[] = sectionMarks
    .sort((a, b) => a.tick - b.tick)
    .map(({ tick, name }) => ({ tick, time: tempo.tickToTime(tick), name }))

  const chart: Chart = {
    resolution: tempo.resolution,
    tempos: normalizeTempos(tempos),
    timeSignatures: tempo.signatures,
    offset: tempo.offset,
    sections,
    tracks: built,
  }
  return { chart, meta: songMeta(song) }
}

function newTrack(instrument: Instrument, difficulty: Difficulty): PendingTrack {
  return { instrument, difficulty, gems: [], forces: new Map(), taps: new Set(), starPhrases: [], soloMarks: [] }
}

/** Pairs solo / soloend events into spans; soloend is inclusive, and an unclosed solo runs to the last note. */
function pairSolos(marks: { tick: number; start: boolean }[], lastTick: number): TickSpan[] {
  const spans: TickSpan[] = []
  let start: number | undefined
  for (const mark of [...marks].sort((a, b) => a.tick - b.tick)) {
    if (mark.start) start ??= mark.tick
    else if (start !== undefined) {
      spans.push({ tick: start, length: mark.tick - start + 1 })
      start = undefined
    }
  }
  if (start !== undefined) spans.push({ tick: start, length: Math.max(1, lastTick - start + 1) })
  return spans
}

function songMeta(song: Record<string, string>): Partial<SongMeta> {
  const meta: Partial<SongMeta> = {}
  for (const key of ['name', 'artist', 'charter', 'album', 'genre'] as const) {
    const value = stripRichText(song[key] ?? '')
    if (value) meta[key] = value
  }
  // Moonscraper writes the year as ", 2019".
  const year = stripRichText(song.year ?? '').replace(/^[,\s]+/, '')
  if (year) meta.year = year
  const preview = parseFloat(song.previewstart ?? '')
  if (Number.isFinite(preview) && preview >= 0) meta.previewStart = preview
  return meta
}

function unquote(value: string): string {
  let v = value.trim()
  if (v.startsWith('"')) v = v.slice(1)
  if (v.endsWith('"')) v = v.slice(0, -1)
  return v.trim()
}

/**
 * The display name of a section event such as `section Verse 1`,
 * `[section verse_1]` or `[prc_verse_1]`, or undefined for other events.
 */
export function sectionName(event: string): string | undefined {
  let text = event.trim()
  if (text.startsWith('[')) text = text.slice(1)
  if (text.endsWith(']')) text = text.slice(0, -1)
  const match = /^(?:section[\s_]+|prc_)(.*)$/i.exec(text.trim())
  if (!match) return undefined
  const name = match[1].replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : undefined
}

/**
 * Decodes a text file (a .chart or song.ini): UTF-8, UTF-16 with a byte order
 * mark, or Windows-1252 when the bytes aren't valid UTF-8.
 */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2)
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      swapped[i - 2] = bytes[i + 1]
      swapped[i - 1] = bytes[i]
    }
    return new TextDecoder('utf-16le').decode(swapped)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes)
    } catch {
      let out = ''
      for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192))
      return out
    }
  }
}
