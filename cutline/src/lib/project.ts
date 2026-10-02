/**
 * A project's starting settings, and reading one back from storage.
 *
 * Saved projects outlive the code that wrote them, so loading never trusts
 * the stored shape: every field is checked and anything missing or malformed
 * falls back to its default rather than breaking the editor.
 */
import type { CaptionStyle, EditSettings, FormatSettings, HookOverlay, MediaInfo, Project, Range, Word } from './types'

export function newId(prefix = ''): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 12) + Date.now().toString(36)
  return prefix + random
}

export function defaultEdit(): EditSettings {
  return { trimStart: 0, trimEnd: null, removeSilences: false, maxPause: 0.35, removeFillers: false, cuts: [] }
}

export function defaultFormat(): FormatSettings {
  return {
    aspect: '9:16',
    fit: 'fill',
    background: 'blur',
    backgroundColor: '#000000',
    zoom: 1,
    focusX: 0.5,
    // Faces sit in the upper half of a talking-head shot.
    focusY: 0.4,
    autoZoom: false,
    zoomStrength: 0.12,
    progressBar: false,
    progressColor: '#ffe14d',
  }
}

export function defaultHook(): HookOverlay {
  return { enabled: false, text: '', duration: 3 }
}

/** "IMG_4410.MOV" → "IMG 4410"; a recording gets the date instead. */
export function projectName(fileName: string, now = new Date()): string {
  const base = fileName.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_-]+/g, ' ').trim()
  if (base && !/^(recording|video|blob|capture)$/i.test(base)) return base.slice(0, 60)
  return now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' take'
}

export function newProject(media: MediaInfo, style: CaptionStyle, thumbnail: string | null, now = Date.now()): Project {
  return {
    id: newId('p'),
    name: projectName(media.fileName, new Date(now)),
    createdAt: now,
    updatedAt: now,
    media,
    transcript: { status: 'none', language: null, model: null },
    words: [],
    edit: defaultEdit(),
    style,
    format: defaultFormat(),
    hook: defaultHook(),
    translation: null,
    music: null,
    thumbnail,
  }
}

/* ---- Loading ---- */

type Loose = Record<string, unknown>

const isObject = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback: number, min = -Infinity, max = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
function oneOf<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback
}

function readRanges(v: unknown): Range[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(isObject)
    .map((r) => ({ start: num(r.start, NaN), end: num(r.end, NaN) }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
}

function readWords(v: unknown): Word[] {
  if (!Array.isArray(v)) return []
  const words: Word[] = []
  for (const raw of v) {
    if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.text !== 'string') continue
    const start = num(raw.start, NaN)
    const end = num(raw.end, NaN)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const word: Word = { id: raw.id, text: raw.text, start, end: Math.max(start, end) }
    if (raw.removed === true) word.removed = true
    if (raw.emphasis === true) word.emphasis = true
    if (typeof raw.emoji === 'string' && raw.emoji) word.emoji = raw.emoji
    if (raw.breakAfter === true) word.breakAfter = true
    words.push(word)
  }
  return words
}

function readEdit(v: unknown): EditSettings {
  const d = defaultEdit()
  if (!isObject(v)) return d
  return {
    trimStart: num(v.trimStart, d.trimStart, 0),
    trimEnd: v.trimEnd === null ? null : num(v.trimEnd, NaN) >= 0 ? (v.trimEnd as number) : null,
    removeSilences: bool(v.removeSilences, d.removeSilences),
    maxPause: num(v.maxPause, d.maxPause, 0.05, 5),
    removeFillers: bool(v.removeFillers, d.removeFillers),
    cuts: readRanges(v.cuts),
  }
}

function readFormat(v: unknown): FormatSettings {
  const d = defaultFormat()
  if (!isObject(v)) return d
  return {
    aspect: oneOf(v.aspect, ['9:16', '4:5', '1:1', '16:9', 'source'] as const, d.aspect),
    fit: oneOf(v.fit, ['fill', 'fit'] as const, d.fit),
    background: oneOf(v.background, ['blur', 'color'] as const, d.background),
    backgroundColor: str(v.backgroundColor, d.backgroundColor),
    zoom: num(v.zoom, d.zoom, 1, 4),
    focusX: num(v.focusX, d.focusX, 0, 1),
    focusY: num(v.focusY, d.focusY, 0, 1),
    autoZoom: bool(v.autoZoom, d.autoZoom),
    zoomStrength: num(v.zoomStrength, d.zoomStrength, 0, 0.6),
    progressBar: bool(v.progressBar, d.progressBar),
    progressColor: str(v.progressColor, d.progressColor),
  }
}

function readStyle(v: unknown, fallback: CaptionStyle): CaptionStyle {
  if (!isObject(v)) return { ...fallback }
  // Every field must be present and the right type; anything off takes the fallback's value.
  const out = { ...fallback } as Record<string, unknown>
  for (const key of Object.keys(fallback) as (keyof CaptionStyle)[]) {
    if (typeof v[key] === typeof fallback[key]) out[key] = v[key]
  }
  return out as unknown as CaptionStyle
}

/** A project read back from storage, or null when it isn't one. */
export function normalizeProject(raw: unknown, fallbackStyle: CaptionStyle): Project | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !isObject(raw.media)) return null
  const m = raw.media
  const media: MediaInfo = {
    fileName: str(m.fileName, 'video'),
    mimeType: str(m.mimeType, ''),
    size: num(m.size, 0, 0),
    duration: num(m.duration, 0, 0),
    width: num(m.width, 0, 0),
    height: num(m.height, 0, 0),
    frameRate: m.frameRate === null ? null : num(m.frameRate, NaN) > 0 ? (m.frameRate as number) : null,
    hasAudio: bool(m.hasAudio, true),
    videoCodec: typeof m.videoCodec === 'string' ? m.videoCodec : null,
    audioCodec: typeof m.audioCodec === 'string' ? m.audioCodec : null,
  }
  const t = isObject(raw.transcript) ? raw.transcript : {}
  const hook = isObject(raw.hook) ? raw.hook : {}
  const music = isObject(raw.music) ? raw.music : null
  const translation = isObject(raw.translation) && Array.isArray(raw.translation.sentences) ? raw.translation : null
  return {
    id: raw.id,
    name: str(raw.name, 'Untitled'),
    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt, Date.now()),
    media,
    transcript: {
      // A transcription can't survive a reload, so one that was running is just not done.
      status: t.status === 'done' || t.status === 'error' ? t.status : 'none',
      language: typeof t.language === 'string' ? t.language : null,
      model: typeof t.model === 'string' ? t.model : null,
      ...(typeof t.error === 'string' ? { error: t.error } : {}),
    },
    words: readWords(raw.words),
    edit: readEdit(raw.edit),
    style: readStyle(raw.style, fallbackStyle),
    format: readFormat(raw.format),
    hook: {
      enabled: bool(hook.enabled, false),
      text: str(hook.text, ''),
      duration: num(hook.duration, 3, 0.5, 15),
    },
    translation: translation
      ? {
          language: str(translation.language, ''),
          sentences: (translation.sentences as unknown[]).filter(isObject).flatMap((s) =>
            typeof s.firstWordId === 'string' && typeof s.lastWordId === 'string' && typeof s.text === 'string'
              ? [{ firstWordId: s.firstWordId, lastWordId: s.lastWordId, text: s.text }]
              : [],
          ),
        }
      : null,
    music: music
      ? { name: str(music.name, 'Music'), volume: num(music.volume, 0.3, 0, 1), ducking: bool(music.ducking, true) }
      : null,
    thumbnail: typeof raw.thumbnail === 'string' ? raw.thumbnail : null,
  }
}

/** Seconds as 0:07 or 1:04:09. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 1e-6))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "12.4 MB". */
export function formatBytes(bytes: number): string {
  if (!(bytes > 0)) return '0 MB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 100 * 1024 * 1024 ? 1 : 0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}
