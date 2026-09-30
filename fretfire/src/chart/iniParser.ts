import type { Instrument, SongMeta } from './types'

/**
 * Reads the `[song]` section of a song.ini: lowercase keys, trimmed values,
 * the last of any duplicate key winning. A file without a `[song]` header is
 * read from its top-level keys.
 */
export function parseIni(text: string): Record<string, string> {
  const topLevel: Record<string, string> = {}
  const song: Record<string, string> = {}
  let hasSong = false
  let target: Record<string, string> | undefined = topLevel
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('//')) continue
    if (line.startsWith('[')) {
      const close = line.indexOf(']')
      const name = (close > 0 ? line.slice(1, close) : line.slice(1)).trim().toLowerCase()
      if (name === 'song') {
        hasSong = true
        target = song
      } else target = undefined
      continue
    }
    const eq = line.indexOf('=')
    if (eq <= 0 || !target) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    if (key) target[key] = line.slice(eq + 1).trim()
  }
  return hasSong ? song : topLevel
}

const INTENSITY_KEYS: [string, Instrument][] = [
  ['diff_guitar', 'guitar'],
  ['diff_bass', 'bass'],
  ['diff_rhythm', 'rhythm'],
  ['diff_keys', 'keys'],
  ['diff_guitar_coop', 'coop'],
]

/**
 * Turns song.ini values into song metadata. Only what the file actually states
 * is returned, so it can be laid over metadata from the chart itself.
 */
export function metaFromIni(values: Record<string, string>): Partial<SongMeta> {
  const meta: Partial<SongMeta> = {}
  const text = (key: string): string => (values[key] === undefined ? '' : stripRichText(values[key]))

  for (const key of ['name', 'artist', 'album', 'genre'] as const) {
    const value = text(key)
    if (value) meta[key] = value
  }
  const year = text('year').replace(/^[,\s]+/, '')
  if (year) meta.year = year
  const charter = text('charter') || text('frets')
  if (charter) meta.charter = charter
  const loadingPhrase = text('loading_phrase')
  if (loadingPhrase) meta.loadingPhrase = loadingPhrase

  const length = parseNumber(values.song_length)
  if (length !== undefined && length > 0) meta.length = length / 1000
  const preview = parseNumber(values.preview_start_time)
  if (preview !== undefined && preview >= 0) meta.previewStart = preview / 1000
  const delay = parseNumber(values.delay)
  if (delay !== undefined) meta.delay = delay / 1000

  const intensity: Partial<Record<Instrument, number>> = {}
  let hasIntensity = false
  for (const [key, instrument] of INTENSITY_KEYS) {
    const value = values[key] === undefined ? Number.NaN : parseInt(values[key], 10)
    if (!Number.isFinite(value)) continue
    intensity[instrument] = Math.max(-1, value)
    hasIntensity = true
  }
  if (hasIntensity) meta.intensity = intensity

  // 0 is how editors write "not set" for the HOPO distance.
  const hopo = parseNumber(values.hopo_frequency)
  if (hopo !== undefined && hopo > 0) meta.hopoFrequency = hopo
  const cutoff = parseNumber(values.sustain_cutoff_threshold)
  if (cutoff !== undefined && cutoff >= 0) meta.sustainCutoff = cutoff

  return meta
}

/** Unity / TextMeshPro rich-text tags that Clone Hero charters put in names. */
const RICH_TEXT_TAGS = [
  'align', 'allcaps', 'alpha', 'b', 'color', 'cspace', 'font', 'font-weight', 'gradient', 'i', 'indent',
  'line-height', 'line-indent', 'link', 'lowercase', 'margin', 'mark', 'material', 'mspace', 'nobr', 'noparse',
  'page', 'pos', 'quad', 'rotate', 's', 'size', 'smallcaps', 'space', 'sprite', 'strikethrough', 'style', 'sub',
  'sup', 'u', 'underline', 'uppercase', 'voffset', 'width',
]
/** An opening or closing tag, with or without a value (`<size=120%>`), or a `<#ff0000>` color. */
const RICH_TEXT_TAG = new RegExp(`</?(?:${RICH_TEXT_TAGS.join('|')})(?:[\\s=][^<>]*)?>|<#[0-9a-f]{3,8}>`, 'gi')

/** Removes Clone Hero rich-text markup like `<color=#ff0000>` from a display string. */
export function stripRichText(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(RICH_TEXT_TAG, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : undefined
}
