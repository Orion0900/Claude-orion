/**
 * Captions and transcript as files: SubRip, WebVTT and plain text.
 */
import { endsSentence } from './timeline'
import type { CaptionPage, Seconds, Word } from './types'

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** HH:MM:SS plus milliseconds after `separator`; SRT uses a comma, VTT a dot. */
function timestamp(ms: number, separator: ',' | '.'): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor(ms / 60_000) % 60
  const s = Math.floor(ms / 1000) % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`
}

/** Pages with words in them, timed to the millisecond; every cue lasts at least 1 ms so players show it. */
function cues(pages: readonly CaptionPage[]): { start: number; end: number; text: string }[] {
  const ms = (t: Seconds) => Math.max(0, Math.round((Number.isFinite(t) ? t : 0) * 1000))
  return pages.flatMap((page) => {
    const text = page.words
      .map((w) => w.text.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
    if (!text) return []
    const start = ms(page.start)
    return [{ start, end: Math.max(start + 1, ms(page.end)), text }]
  })
}

/** SubRip: 1-based cue numbers, `00:00:01,234 --> 00:00:02,000`, a blank line between cues. */
export function toSrt(pages: CaptionPage[]): string {
  const list = cues(pages)
  if (!list.length) return ''
  return `${list.map((c, i) => `${i + 1}\n${timestamp(c.start, ',')} --> ${timestamp(c.end, ',')}\n${c.text}`).join('\n\n')}\n`
}

/** WebVTT: the header, then `00:00:01.234 --> 00:00:02.000` cues with their text escaped. */
export function toVtt(pages: CaptionPage[]): string {
  const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const body = cues(pages).map((c) => `${timestamp(c.start, '.')} --> ${timestamp(c.end, '.')}\n${escape(c.text)}`)
  return `${['WEBVTT', ...body].join('\n\n')}\n`
}

/** A pause this long starts a new paragraph by itself; after a full stop, a shorter one does. */
const PARAGRAPH_PAUSE = 2
const SENTENCE_PARAGRAPH_PAUSE = 1
/** Past this many words a paragraph ends at the next full stop, pause or not. */
const LONG_PARAGRAPH = 120

/**
 * The transcript as plain text, kept words only, with a blank line between
 * paragraphs at the long pauses: sentences run on until the speaker stops
 * for a moment.
 */
export function toPlainText(words: Word[]): string {
  const list = words.filter((w) => !w.removed && w.text.trim()).sort((a, b) => a.start - b.start)
  const paragraphs: string[] = []
  let current: string[] = []
  list.forEach((w, i) => {
    current.push(w.text.trim())
    const next = list[i + 1]
    const gap = next ? next.start - w.end : Infinity
    const sentenceEnd = !next || endsSentence(w.text, next.text)
    if (gap >= PARAGRAPH_PAUSE || (sentenceEnd && (gap >= SENTENCE_PARAGRAPH_PAUSE || current.length >= LONG_PARAGRAPH))) {
      paragraphs.push(current.join(' '))
      current = []
    }
  })
  return paragraphs.join('\n\n')
}
