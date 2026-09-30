import type { AudioEngine } from '../audio/engine'
import type { Stem } from '../audio/player'
import { INSTRUMENTS, type Chart, type Instrument, type SongMeta } from '../chart/types'
import { deleteSong, listSongs, loadSong } from '../library/db'
import { AUDIO_EXTENSIONS, loadChart, type SongPackage } from '../library/importer'
import { BUILTIN, builtinChart, renderBuiltin } from '../music/builtin'
import { forgetScores } from './scores'

/**
 * One song list over two sources: the built-in setlist and songs the player
 * imported. Loads charts and audio for play, whichever source a song is from.
 */

export interface SongEntry {
  id: string
  meta: SongMeta
  builtin: boolean
  /** Parts the metadata lists; the chart has the final word once loaded. */
  instruments: Instrument[]
}

/** Which stem goes silent on a miss, per part. */
const INSTRUMENT_STEMS: Record<Instrument, string[]> = {
  guitar: ['guitar'],
  coop: ['guitar'],
  bass: ['bass'],
  rhythm: ['rhythm'],
  keys: ['keys'],
}

export async function listLibrary(): Promise<{ songs: SongEntry[]; storageError?: string }> {
  const songs: SongEntry[] = BUILTIN.map((b) => ({ id: b.id, meta: b.meta, builtin: true, instruments: ['guitar'] }))
  try {
    for (const stored of await listSongs()) {
      const instruments = INSTRUMENTS.filter((i) => (stored.meta.intensity[i] ?? -1) >= 0)
      songs.push({ id: stored.id, meta: stored.meta, builtin: false, instruments: instruments.length ? instruments : ['guitar'] })
    }
    return { songs }
  } catch (error) {
    return { songs, storageError: error instanceof Error ? error.message : String(error) }
  }
}

let lastPackage: SongPackage | null = null

async function packageFor(entry: SongEntry): Promise<SongPackage> {
  if (lastPackage?.id === entry.id) return lastPackage
  const pkg = await loadSong(entry.id)
  if (!pkg) throw new Error('This song is no longer in your library')
  lastPackage = pkg
  return pkg
}

export async function loadEntryChart(entry: SongEntry): Promise<Chart> {
  if (entry.builtin) {
    const song = BUILTIN.find((b) => b.id === entry.id)
    if (!song) throw new Error('Unknown built-in song')
    return builtinChart(song)
  }
  return loadChart(await packageFor(entry))
}

/** Decoded stems stay around for the song just played, so a retry starts at once. */
const stemCache = new Map<string, Stem[]>()
const STEM_CACHE_SIZE = 1

export async function loadStems(
  entry: SongEntry,
  engine: AudioEngine,
  instrument: Instrument,
  onProgress?: (fraction: number, label: string) => void,
): Promise<Stem[]> {
  const key = `${entry.id}|${INSTRUMENT_STEMS[instrument].join()}`
  const cached = stemCache.get(key)
  if (cached) return cached
  // Drop older decoded audio before making more: phones have little memory to spare.
  stemCache.clear()
  const stems = entry.builtin ? await builtinStems(entry, engine, onProgress) : await importedStems(entry, engine, instrument, onProgress)
  stemCache.set(key, stems)
  while (stemCache.size > STEM_CACHE_SIZE) stemCache.delete(stemCache.keys().next().value!)
  return stems
}

async function builtinStems(entry: SongEntry, engine: AudioEngine, onProgress?: (f: number, label: string) => void): Promise<Stem[]> {
  const song = BUILTIN.find((b) => b.id === entry.id)
  if (!song) throw new Error('Unknown built-in song')
  const rendered = await renderBuiltin(song, (f) => onProgress?.(f, 'Tuning up the band…'))
  return [
    { buffer: engine.bufferFrom(rendered.lead, rendered.sampleRate), role: 'instrument' },
    { buffer: engine.bufferFrom(rendered.backing, rendered.sampleRate), role: 'backing' },
  ]
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, '')
const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''

async function importedStems(
  entry: SongEntry,
  engine: AudioEngine,
  instrument: Instrument,
  onProgress?: (f: number, label: string) => void,
): Promise<Stem[]> {
  const pkg = await packageFor(entry)
  const audio = Object.keys(pkg.files).filter((n) => AUDIO_EXTENSIONS.includes(extensionOf(n)) && !n.startsWith('preview'))
  if (!audio.length) throw new Error('This song has no audio file')
  const wanted = INSTRUMENT_STEMS[instrument]
  let instrumentStem: AudioBuffer | null = null
  let backing: AudioBuffer | null = null
  for (let i = 0; i < audio.length; i++) {
    const name = audio[i]
    onProgress?.(i / audio.length, 'Loading audio…')
    let buffer: AudioBuffer
    try {
      buffer = await engine.decode(await pkg.files[name].arrayBuffer())
    } catch {
      throw new Error(
        `This browser can't play ${name}. On older iPhones, Ogg and Opus audio may not play: convert the song's audio to MP3 or M4A and import it again.`,
      )
    }
    if (!instrumentStem && wanted.includes(baseName(name))) instrumentStem = buffer
    else backing = backing ? mixInto(engine, backing, buffer) : buffer
  }
  onProgress?.(1, 'Loading audio…')
  const stems: Stem[] = []
  if (backing) stems.push({ buffer: backing, role: 'backing' })
  if (instrumentStem) stems.push({ buffer: instrumentStem, role: 'instrument' })
  return stems
}

/** Sums `add` into `into` (growing it if `add` runs longer), so many stems cost the memory of one. */
function mixInto(engine: AudioEngine, into: AudioBuffer, add: AudioBuffer): AudioBuffer {
  let target = into
  if (add.length > into.length || into.numberOfChannels < 2) {
    target = engine.ctx!.createBuffer(2, Math.max(into.length, add.length), into.sampleRate)
    for (let c = 0; c < 2; c++) target.getChannelData(c).set(into.getChannelData(Math.min(c, into.numberOfChannels - 1)))
  }
  for (let c = 0; c < 2; c++) {
    const out = target.getChannelData(c)
    const src = add.getChannelData(Math.min(c, add.numberOfChannels - 1))
    for (let i = 0; i < src.length; i++) out[i] += src[i]
  }
  return target
}

/** An object URL for an imported song's album art, or null. */
export async function albumArt(entry: SongEntry): Promise<string | null> {
  if (entry.builtin) return null
  const pkg = await packageFor(entry)
  const name = ['album.jpg', 'album.jpeg', 'album.png'].find((n) => pkg.files[n])
  return name ? URL.createObjectURL(pkg.files[name]) : null
}

/** A streaming preview for an imported song, without decoding the whole thing. */
export async function previewAudio(entry: SongEntry): Promise<HTMLAudioElement | null> {
  if (entry.builtin) return null
  const pkg = await packageFor(entry)
  const names = Object.keys(pkg.files).filter((n) => AUDIO_EXTENSIONS.includes(extensionOf(n)))
  const name = names.find((n) => baseName(n) === 'preview') ?? names.find((n) => baseName(n) === 'song') ?? names[0]
  if (!name) return null
  const audio = new Audio(URL.createObjectURL(pkg.files[name]))
  audio.preload = 'auto'
  return audio
}

export async function removeFromLibrary(entry: SongEntry): Promise<void> {
  if (entry.builtin) return
  await deleteSong(entry.id)
  forgetScores(entry.id)
  if (lastPackage?.id === entry.id) lastPackage = null
  for (const key of [...stemCache.keys()]) if (key.startsWith(`${entry.id}|`)) stemCache.delete(key)
}
