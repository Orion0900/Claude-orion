/**
 * Caption pages: the words on screen at once, on the edited clock.
 */
import { endsSentence, timedWords, type TimeMap } from './timeline'
import type { CaptionPage, CaptionStyle, Seconds, TimedWord, Translation, Word } from './types'

type PageStyle = Pick<CaptionStyle, 'wordsPerPage' | 'maxLines' | 'emojis'>

/** A pause this long between words starts a new page, so no page sits through a silence. */
const PAGE_PAUSE = 0.6
/** A page stays up this long after its last word unless the next one arrives first. */
const HOLD = 0.5
/** A blank this short between pages reads as flicker, so the earlier page stays until the next. */
const MIN_BLANK = 0.25
/** Roughly what one line holds at caption sizes; with maxLines, the most text a page takes. */
const LINE_CHARS = 18
/** Clause punctuation, where a page that's already half full can end. */
const CLAUSE_END = /[,;:—–]["'”’)]*$/

/**
 * Groups timed words into caption pages of up to `wordsPerPage` words.
 * Pages end early at the end of a sentence, at a word marked `breakAfter`,
 * before a pause and after a comma once half full. Words are shared out
 * evenly rather than leaving a straggler, and a page may take one word over
 * the limit to avoid a page of one. `sourceWords` supplies emoji and
 * breakAfter by id.
 */
export function buildPages(words: TimedWord[], sourceWords: Word[], style: PageStyle): CaptionPage[] {
  const byId = new Map(sourceWords.map((w) => [w.id, w]))
  const sorted = [...words].sort((a, b) => a.start - b.start)
  const groups: TimedWord[][] = []
  let run: TimedWord[] = []
  sorted.forEach((w, i) => {
    run.push(w)
    const next = sorted[i + 1]
    if (!next || endsSentence(w.text, next.text) || byId.get(w.id)?.breakAfter || next.start - w.end > PAGE_PAUSE) {
      groups.push(...chunk(run, style))
      run = []
    }
  })
  return finish(groups.map((ws) => ({ words: ws, emoji: style.emojis ? firstEmoji(ws, byId) : null })))
}

function firstEmoji(words: readonly TimedWord[], byId: ReadonlyMap<string, Word>): string | null {
  for (const w of words) {
    const emoji = byId.get(w.id)?.emoji
    if (emoji) return emoji
  }
  return null
}

/** Splits words that belong together (no hard break among them) into pages. */
function chunk<T extends { text: string }>(run: readonly T[], style: PageStyle): T[][] {
  const perPage = Math.max(1, Math.floor(style.wordsPerPage) || 1)
  const budget = Math.max(1, Math.floor(style.maxLines) || 1) * LINE_CHARS
  const chars = (from: number, to: number) =>
    run.slice(from, to).reduce((n, w) => n + w.text.length, 0) + Math.max(0, to - from - 1)
  const pages: T[][] = []
  for (let i = 0; i < run.length; ) {
    const left = run.length - i
    // Even pages rather than full ones and a straggler: 5 words at 4 a page go 3 + 2.
    let take = Math.ceil(left / Math.ceil(left / perPage))
    for (let k = Math.ceil(perPage / 2); k < take; k++) {
      if (CLAUSE_END.test(run[i + k - 1].text) && left - k !== 1) {
        take = k
        break
      }
    }
    while (take > 1 && chars(i, i + take) > budget) take--
    // One word left over joins this page instead of standing alone.
    if (left - take === 1 && perPage > 1 && chars(i, run.length) <= budget) take = left
    pages.push(run.slice(i, i + take))
    i += take
  }
  return pages
}

/** Numbers the pages and sets when each leaves: a short hold, never overlapping the next, no flicker. */
function finish(groups: { words: TimedWord[]; emoji: string | null }[]): CaptionPage[] {
  const pages = groups
    .filter((g) => g.words.length > 0)
    .map((g) => ({
      start: g.words[0].start,
      end: Math.max(...g.words.map((w) => w.end)),
      words: g.words,
      emoji: g.emoji,
    }))
    .sort((a, b) => a.start - b.start)
  return pages.map((p, index) => {
    const next = pages[index + 1]
    let end = p.end + HOLD
    if (next && next.start - end < MIN_BLANK) end = next.start
    if (next) end = Math.min(end, next.start)
    return { index, start: p.start, end: Math.max(p.start, end), words: p.words, emoji: p.emoji }
  })
}

/** The page on screen at edited time t, or null. Pages are half-open: [start, end). */
export function pageAt(pages: CaptionPage[], t: Seconds): CaptionPage | null {
  let lo = 0
  let hi = pages.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (pages[mid].start <= t) lo = mid + 1
    else hi = mid - 1
  }
  const page = pages[hi]
  return page && t < page.end ? page : null
}

/* ------------------------------------------------------------ translated */

/** Words closer than this are one stretch of speech when spreading a translation over it. */
const SPEECH_JOIN = 0.3
const CJK = /[぀-ヿ㐀-鿿豈-﫿가-힯]/
/** Longest run of CJK text that counts as one caption "word". */
const CJK_PIECE = 8

/**
 * Pages for a translated transcript. Each sentence's translation is split
 * into pages of about `wordsPerPage` words, timed across the stretches of
 * the edited video the sentence is spoken over (pauses inside it are
 * skipped), with each word given time in proportion to its length.
 * Sentences cut from the video entirely have no pages.
 */
export function translatedPages(
  translation: Translation,
  sourceWords: Word[],
  map: TimeMap,
  style: PageStyle,
): CaptionPage[] {
  const ordered = [...sourceWords].sort((a, b) => a.start - b.start)
  const position = new Map(ordered.map((w, i) => [w.id, i]))
  const timed = new Map(timedWords(sourceWords, map).map((w) => [w.id, w]))
  const groups: { words: TimedWord[]; emoji: string | null }[] = []

  translation.sentences.forEach((sentence, n) => {
    const a = position.get(sentence.firstWordId)
    const b = position.get(sentence.lastWordId)
    if (a === undefined || b === undefined) return
    const source = ordered.slice(Math.min(a, b), Math.max(a, b) + 1)
    const spoken = source.flatMap((w) => timed.get(w.id) ?? [])
    const tokens = tokenize(sentence.text)
    if (!spoken.length || !tokens.length) return

    const spans = speechSpans(spoken)
    const weights = tokens.map((t) => [...t].length + 1)
    const total = weights.reduce((x, y) => x + y, 0)
    let acc = 0
    const words = tokens.map((text, i): TimedWord => {
      const start = atFraction(spans, acc / total, false)
      acc += weights[i]
      return { id: `${sentence.firstWordId}~${n}.${i}`, text, start, end: atFraction(spans, acc / total, true), emphasis: false }
    })

    let run: TimedWord[] = []
    words.forEach((w, i) => {
      run.push(w)
      const next = words[i + 1]
      if (!next || next.start - w.end > PAGE_PAUSE) {
        for (const page of chunk(run, style)) {
          const from = page[0].start
          const to = page[page.length - 1].end
          const emoji = style.emojis
            ? source.find((s) => {
                const t = timed.get(s.id)
                return s.emoji && t && t.start >= from - 1e-6 && t.start < to
              })?.emoji ?? null
            : null
          groups.push({ words: page, emoji })
        }
        run = []
      }
    })
  })
  return finish(groups)
}

/** Translated text as caption words; CJK text, written without spaces, is cut into short pieces. */
function tokenize(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => {
      const chars = [...token]
      if (chars.length <= CJK_PIECE || !CJK.test(token)) return [token]
      const pieces: string[] = []
      let piece = ''
      for (const c of chars) {
        piece += c
        if ([...piece].length >= CJK_PIECE || /[、。，！？；：]/.test(c)) {
          pieces.push(piece)
          piece = ''
        }
      }
      if (piece) pieces.push(piece)
      return pieces
    })
}

/** The stretches of edited time words are spoken over, joining the short gaps between them. */
function speechSpans(words: readonly TimedWord[]): { start: Seconds; end: Seconds }[] {
  const spans: { start: Seconds; end: Seconds }[] = []
  for (const w of words) {
    const last = spans[spans.length - 1]
    if (last && w.start - last.end < SPEECH_JOIN) last.end = Math.max(last.end, w.end)
    else spans.push({ start: w.start, end: w.end })
  }
  return spans
}

/**
 * The edited time a fraction of the way through the speech spans. At a
 * boundary between spans, `endOfSpan` picks the end of the earlier span
 * (for where a word stops) over the start of the later (where one starts).
 */
function atFraction(spans: readonly { start: Seconds; end: Seconds }[], f: number, endOfSpan: boolean): Seconds {
  const total = spans.reduce((n, s) => n + s.end - s.start, 0)
  if (total <= 0) return spans[0].start
  let left = Math.min(1, Math.max(0, f)) * total
  for (let i = 0; i < spans.length; i++) {
    const len = spans[i].end - spans[i].start
    if (left < len || (endOfSpan && left <= len) || i === spans.length - 1) return spans[i].start + Math.min(left, len)
    left -= len
  }
  return spans[spans.length - 1].end
}
