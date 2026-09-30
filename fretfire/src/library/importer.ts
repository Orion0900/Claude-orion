import { decodeText, parseChartText, type ParsedChart } from '../chart/chartParser'
import { metaFromIni, parseIni } from '../chart/iniParser'
import { parseMidi } from '../chart/midiParser'
import { INSTRUMENTS, emptyMeta, type Chart, type SongMeta } from '../chart/types'
import { openSng } from './sng'
import { openZip, type ArchiveEntry } from './zip'

/** A checked, playable song: its metadata and the few files it needs. */
export interface SongPackage {
  /** Stable: the same song imported twice gets the same id. */
  id: string
  /** Complete metadata: song.ini over chart metadata over the folder name. */
  meta: SongMeta
  /** Key in `files`: 'notes.chart' or 'notes.mid'. */
  chartFile: string
  /** Lowercased base names: the chart, song.ini, audio and album art. */
  files: Record<string, Blob>
  /** What the user picked, for messages. */
  source: string
  addedAt: number
}

/** The songs an import produced, and why anything else was turned away. */
export interface ImportResult {
  /** Empty when an `onSong` callback took the songs as they came. */
  songs: SongPackage[]
  /** How many songs were added, handed over or not. */
  added: number
  errors: { source: string; reason: string }[]
}

/** Audio a song may come with, lowercase and without the dot. */
export const AUDIO_EXTENSIONS: string[] = ['ogg', 'opus', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'webm']

/** Chart files in order of preference. */
const CHART_FILES = ['notes.mid', 'notes.chart']
const ART_FILES = ['album.png', 'album.jpg', 'album.jpeg']
/** Types for files that come out of archives untyped, so object URLs play and show everywhere. */
const MIME_TYPES: Record<string, string> = {
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
}
/** How deep zips inside zips are opened. */
const MAX_ZIP_DEPTH = 3
const UNTITLED = 'Untitled song'

const UNSUPPORTED_ARCHIVE = 'Extract .rar and .7z archives first, or re-save them as .zip'
const NO_CHART = 'No notes.chart or notes.mid found'
const NO_CHART_LOOSE =
  'No notes.chart or notes.mid found. Pick the chart together with its audio, or import a .zip or .sng'
const NOT_A_SONG = "Not a song. Import a .zip or .sng, or a song's notes.chart or notes.mid together with its audio"
const MANY_SONGS = 'These files hold more than one song. Import one song at a time, or put the song folders in a .zip'
const NO_PARTS = "No guitar, bass, rhythm or keys part to play (drum-only charts aren't supported)"
const NO_AUDIO = 'No audio file found'

type ImportError = ImportResult['errors'][number]
type Loader = () => Promise<Blob>

/** A folder (or .sng) holding a chart, not yet checked. */
interface Candidate {
  source: string
  fallbackName: string
  /** Song files by lowercased base name. */
  files: Map<string, Loader>
  /** An .sng's own metadata, which song.ini still overrides. */
  containerMeta?: Partial<SongMeta>
}

/**
 * Turns what the user picked into songs: .zip packs (song folders at any
 * depth, or .sng files inside), .sng files, and loose song files. Loose files
 * without folder paths (iOS) are one song; with paths (a desktop folder
 * picker) each folder is one. Every song is parsed once to check it plays.
 */
export async function importFiles(
  files: File[],
  onProgress?: (message: string) => void,
  /** Takes each song as soon as it's ready, so a big pack never sits in memory whole. */
  onSong?: (song: SongPackage) => Promise<void>,
): Promise<ImportResult> {
  const progress = (message: string) => onProgress?.(message)
  const errors: ImportError[] = []
  const candidates: Candidate[] = []
  const loose: File[] = []

  for (const file of files) {
    const ext = extension(file.name)
    if (ext === 'zip') {
      progress(`Reading ${file.name}…`)
      await scanZip(file, file.name, 0, candidates, errors)
    } else if (ext === 'sng') {
      progress(`Reading ${file.name}…`)
      try {
        candidates.push(await sngCandidate(file, file.name))
      } catch (error) {
        errors.push({ source: file.name, reason: reasonOf(error) })
      }
    } else if (ext === 'rar' || ext === '7z') {
      errors.push({ source: file.name, reason: UNSUPPORTED_ARCHIVE })
    } else loose.push(file)
  }
  scanLoose(loose, loose.length === files.length, candidates, errors)

  const total = candidates.length
  if (total) progress(`Found ${total} song${total === 1 ? '' : 's'}…`)
  const songs: SongPackage[] = []
  const seen = new Set<string>()
  for (let i = 0; i < total; i++) {
    const candidate = candidates[i]
    if (total > 1) progress(`Adding song ${i + 1} of ${total}…`)
    try {
      const song = await buildSong(candidate)
      if (seen.has(song.id)) continue
      seen.add(song.id)
      if (onSong) await onSong(song)
      else songs.push(song)
    } catch (error) {
      errors.push({ source: candidate.source, reason: reasonOf(error) })
    }
  }
  return { songs, added: seen.size, errors }
}

/** Parses a saved song's chart with its song.ini settings. */
export async function loadChart(pkg: SongPackage): Promise<Chart> {
  const blob = pkg.files[pkg.chartFile]
  if (!blob) throw new Error('This song is missing its chart file')
  return parseChart(pkg.chartFile, await readBytes(blob), pkg.meta).chart
}

async function scanZip(
  blob: Blob,
  source: string,
  depth: number,
  candidates: Candidate[],
  errors: ImportError[],
): Promise<void> {
  let entries: ArchiveEntry[]
  try {
    entries = await openZip(blob)
  } catch (error) {
    errors.push({ source, reason: reasonOf(error) })
    return
  }
  const before = candidates.length + errors.length
  const folders = new Map<string, ArchiveEntry[]>()
  for (const entry of entries) {
    const slash = entry.name.lastIndexOf('/')
    const ext = extension(entry.name)
    const where = `${source}/${entry.name}`
    if (ext === 'sng') {
      try {
        candidates.push(await sngCandidate(await entry.blob(), where))
      } catch (error) {
        errors.push({ source: where, reason: reasonOf(error) })
      }
    } else if (ext === 'zip' && depth < MAX_ZIP_DEPTH) {
      try {
        await scanZip(await entry.blob(), where, depth + 1, candidates, errors)
      } catch (error) {
        errors.push({ source: where, reason: reasonOf(error) })
      }
    } else if (ext === 'rar' || ext === '7z') {
      errors.push({ source: where, reason: UNSUPPORTED_ARCHIVE })
    } else {
      const dir = slash < 0 ? '' : entry.name.slice(0, slash)
      const list = folders.get(dir)
      if (list) list.push(entry)
      else folders.set(dir, [entry])
    }
  }

  for (const [dir, list] of folders) {
    const files = songFiles(list.map((entry) => ({ name: baseName(entry.name), load: () => entry.blob() })))
    if (!CHART_FILES.some((name) => files.has(name))) continue
    candidates.push({
      source: dir ? `${source}/${dir}` : source,
      fallbackName: baseName(dir) || stripExtension(baseName(source)),
      files,
    })
  }
  if (depth === 0 && candidates.length + errors.length === before) {
    errors.push({ source, reason: 'No songs found in this zip (a song folder needs notes.chart or notes.mid)' })
  }
}

async function sngCandidate(blob: Blob, source: string): Promise<Candidate> {
  const { meta, entries } = await openSng(blob)
  return {
    source,
    fallbackName: stripExtension(baseName(source)),
    files: songFiles(entries.map((entry) => ({ name: baseName(entry.name), load: () => entry.blob() }))),
    containerMeta: metaFromIni(meta),
  }
}

function scanLoose(files: File[], onlyLoose: boolean, candidates: Candidate[], errors: ImportError[]): void {
  if (!files.length) return
  const fileLoader = (file: File) => ({ name: file.name, load: () => Promise.resolve<Blob>(file) })

  if (files.some((file) => file.webkitRelativePath)) {
    const folders = new Map<string, File[]>()
    for (const file of files) {
      const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/')
      const dir = path.slice(0, Math.max(0, path.lastIndexOf('/')))
      const list = folders.get(dir)
      if (list) list.push(file)
      else folders.set(dir, [file])
    }
    const before = candidates.length
    for (const [dir, list] of folders) {
      const songs = songFiles(list.map(fileLoader))
      if (!CHART_FILES.some((name) => songs.has(name))) continue
      candidates.push({ source: dir || describeFiles(list), fallbackName: baseName(dir) || UNTITLED, files: songs })
    }
    if (candidates.length === before && (onlyLoose || files.some((file) => isSongFile(file.name.toLowerCase())))) {
      const top = (files[0].webkitRelativePath || files[0].name).split(/[\\/]/)[0]
      errors.push({ source: top, reason: NO_CHART })
    }
    return
  }

  const charts = files.filter((file) => CHART_FILES.includes(file.name.toLowerCase()))
  if (!charts.length) {
    const songLike = files.some((file) => isSongFile(file.name.toLowerCase()))
    if (songLike || onlyLoose) {
      errors.push({ source: describeFiles(files), reason: songLike ? NO_CHART_LOOSE : NOT_A_SONG })
    }
    return
  }
  const copies = (name: string) => charts.filter((file) => file.name.toLowerCase() === name).length
  if (CHART_FILES.some((name) => copies(name) > 1)) {
    errors.push({ source: describeFiles(charts), reason: MANY_SONGS })
    return
  }
  candidates.push({ source: describeFiles(files), fallbackName: UNTITLED, files: songFiles(files.map(fileLoader)) })
}

/** Checks one candidate by parsing its chart, then gathers its files. */
async function buildSong(candidate: Candidate): Promise<SongPackage> {
  const chartNames = CHART_FILES.filter((name) => candidate.files.has(name))
  if (!chartNames.length) throw new Error(NO_CHART)
  const ini = candidate.files.get('song.ini')
  const iniMeta = ini ? metaFromIni(parseIni(decodeText(await readBytes(await ini())))) : {}
  const settings: Partial<SongMeta> = { ...candidate.containerMeta, ...iniMeta }

  let failure: unknown = new Error(NO_PARTS)
  for (const chartFile of chartNames) {
    const chartBlob = await candidate.files.get(chartFile)!()
    const bytes = await readBytes(chartBlob)
    let parsed: ParsedChart
    try {
      parsed = parseChart(chartFile, bytes, settings)
    } catch (error) {
      failure = error
      continue
    }
    const { chart } = parsed
    if (!chart.tracks.some((track) => track.notes.length > 0)) {
      failure = new Error(NO_PARTS)
      continue
    }
    if (![...candidate.files.keys()].some(isAudio)) throw new Error(NO_AUDIO)

    const meta = emptyMeta()
    mergeMeta(meta, parsed.meta)
    if (candidate.containerMeta) mergeMeta(meta, candidate.containerMeta)
    mergeMeta(meta, iniMeta)
    if (!meta.name) meta.name = candidate.fallbackName
    for (const instrument of INSTRUMENTS) {
      const playable = chart.tracks.some((track) => track.instrument === instrument && track.notes.length > 0)
      const value = meta.intensity[instrument]
      if (!playable) meta.intensity[instrument] = -1
      else if (value === undefined || value < 0) meta.intensity[instrument] = 0
    }
    if (!(meta.length > 0)) meta.length = chartEnd(chart)

    const files: Record<string, Blob> = { [chartFile]: chartBlob }
    for (const [name, load] of candidate.files) {
      if (!CHART_FILES.includes(name)) files[name] = withType(await load(), name)
    }
    return {
      id: songId(bytes, meta.name, meta.artist),
      meta,
      chartFile,
      files,
      source: candidate.source,
      addedAt: Date.now(),
    }
  }
  throw failure
}

function parseChart(chartFile: string, bytes: Uint8Array, meta: Partial<SongMeta>): ParsedChart {
  const { hopoFrequency, sustainCutoff, delay } = meta
  return chartFile.endsWith('.mid')
    ? parseMidi(bytes, { hopoFrequency, sustainCutoff, delay })
    : parseChartText(decodeText(bytes), { hopoFrequency, delay })
}

/** Lays whatever `extra` states over `meta`, merging intensities part by part. */
function mergeMeta(meta: SongMeta, extra: Partial<SongMeta>): void {
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue
    if (key === 'intensity') Object.assign(meta.intensity, value)
    else (meta as unknown as Record<string, unknown>)[key] = value
  }
}

/** When the last note (or sustain) ends, for songs whose length isn't stated. */
function chartEnd(chart: Chart): number {
  let end = 0
  for (const track of chart.tracks) {
    for (const note of track.notes) end = Math.max(end, note.time + Math.max(0, ...note.sustain))
  }
  return end
}

/** Two differently seeded 32-bit FNV-1a hashes of the chart, name and artist: 16 hex digits. */
function songId(chart: Uint8Array, name: string, artist: string): string {
  let a = 0x811c9dc5
  let b = 0x050c5d1f
  const feed = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) {
      a = Math.imul(a ^ bytes[i], 0x01000193)
      b = Math.imul(b ^ bytes[i] ^ 0xa5, 0x01000193)
    }
  }
  feed(chart)
  feed(new TextEncoder().encode(`\0${name}\0${artist}`))
  const hex = (h: number) => (h >>> 0).toString(16).padStart(8, '0')
  return hex(a) + hex(b)
}

/** Keeps only the files a song uses, by lowercased base name. */
function songFiles(files: { name: string; load: Loader }[]): Map<string, Loader> {
  const out = new Map<string, Loader>()
  for (const file of files) {
    const name = file.name.toLowerCase()
    if (isSongFile(name)) out.set(name, file.load)
  }
  return out
}

function isSongFile(name: string): boolean {
  if (name.startsWith('._')) return false // macOS resource forks
  return CHART_FILES.includes(name) || name === 'song.ini' || ART_FILES.includes(name) || isAudio(name)
}

/** Audio stems by extension. Clone Hero's background video is always `video.*`, even as .webm. */
function isAudio(name: string): boolean {
  return !name.startsWith('._') && !name.startsWith('video.') && AUDIO_EXTENSIONS.includes(extension(name))
}

function withType(blob: Blob, name: string): Blob {
  const type = MIME_TYPES[extension(name)]
  return blob.type || !type ? blob : new Blob([blob], { type })
}

function extension(name: string): string {
  const base = baseName(name)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function describeFiles(files: { name: string }[]): string {
  const names = files.map((file) => file.name)
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
}

async function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

function reasonOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : String(error)
}
