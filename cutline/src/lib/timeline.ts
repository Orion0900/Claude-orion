/**
 * The bridge between the two clocks: which source spans survive the edit,
 * and how a moment on one clock maps to the other.
 */
import { MIN_SPAN, SILENT_SLIVER, normalizeRanges, planCuts, subtractRanges } from './cuts'
import type { AudioAnalysis, EditSettings, Range, Seconds, TimedWord, Word } from './types'

/**
 * Source-time spans that survive the edit, sorted, disjoint, each at least
 * ~40 ms: the trimmed recording minus removed words, fillers (with
 * `removeFillers`), cuts made by hand and, with `removeSilences`, the long
 * part of every long pause.
 */
export function keepRanges(
  input: { words: Word[]; edit: EditSettings; duration: Seconds },
  analysis?: AudioAnalysis | null,
): Range[] {
  const { words, edit, duration } = input
  const plan = planCuts(words, edit, duration, analysis)
  const cuts = edit.removeSilences ? normalizeRanges([...plan.forced, ...plan.pauses]) : plan.forced
  return tidy(subtractRanges([plan.window], cuts), plan.speech)
}

/** Drops the specks that cut arithmetic leaves behind. */
function tidy(keep: readonly Range[], speech: readonly Range[]): Range[] {
  // A cut too short to see isn't worth the jump it makes.
  const merged: Range[] = []
  for (const r of keep) {
    const last = merged[merged.length - 1]
    if (last && r.start - last.end < MIN_SPAN) last.end = r.end
    else merged.push({ ...r })
  }
  let j = 0
  const heard = merged.map((r) => {
    while (j < speech.length && speech[j].end <= r.start) j++
    return j < speech.length && speech[j].start < r.end
  })
  // Between two cuts, a moment of nothing being said is a flash, not a pause.
  const anyHeard = heard.some(Boolean)
  return merged.filter((r, i) => {
    const len = r.end - r.start
    return len >= MIN_SPAN && (heard[i] || !anyHeard || len >= SILENT_SLIVER)
  })
}

/** Index of the last entry whose key is at or before t, or -1. */
function lastAtOrBefore<T>(list: readonly T[], t: number, key: (x: T) => number): number {
  let lo = 0
  let hi = list.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (key(list[mid]) <= t) lo = mid + 1
    else hi = mid - 1
  }
  return hi
}

/**
 * Maps between source time and edited time for a set of keep ranges. Every
 * lookup is a binary search over the ranges and their edited start times.
 * A moment exactly on a jump cut belongs to the range that starts there, so
 * the frame at a cut shows the new shot.
 */
export class TimeMap {
  readonly ranges: Range[]
  /** Edited duration. */
  readonly duration: Seconds
  /** Edited time each range starts at. */
  private readonly starts: Seconds[]

  constructor(ranges: Range[]) {
    this.ranges = normalizeRanges(ranges)
    this.starts = []
    let t = 0
    for (const r of this.ranges) {
      this.starts.push(t)
      t += r.end - r.start
    }
    this.duration = t
  }

  /** Index of the range containing a source time, or -1. The very end of the last range counts as inside it. */
  rangeAt(source: Seconds): number {
    const i = lastAtOrBefore(this.ranges, source, (r) => r.start)
    if (i < 0) return -1
    const r = this.ranges[i]
    return source < r.end || (i === this.ranges.length - 1 && source === r.end) ? i : -1
  }

  /** Edited time of a source time; null inside a cut. */
  toEdited(source: Seconds): Seconds | null {
    const i = this.rangeAt(source)
    return i < 0 ? null : this.starts[i] + (source - this.ranges[i].start)
  }

  /** Edited time of a source time; inside a cut, the edited time the cut happens at. */
  toEditedClamped(source: Seconds): Seconds {
    const i = lastAtOrBefore(this.ranges, source, (r) => r.start)
    if (i < 0) return 0
    const r = this.ranges[i]
    if (source < r.end) return this.starts[i] + (source - r.start)
    return i + 1 < this.ranges.length ? this.starts[i + 1] : this.duration
  }

  /** Source time of an edited time, clamped to [0, duration]. */
  toSource(edited: Seconds): Seconds {
    if (!this.ranges.length) return 0
    const t = Math.min(this.duration, Math.max(0, edited || 0))
    const i = Math.max(0, lastAtOrBefore(this.starts, t, (s) => s))
    const r = this.ranges[i]
    return Math.min(r.end, r.start + (t - this.starts[i]))
  }

  /** Edited times where one range ends and the next begins: the jump cuts. */
  cutPoints(): Seconds[] {
    return this.starts.slice(1)
  }
}

/** Display time a word gets at least, so a word Whisper gave no length still lights up. */
const MIN_WORD = 0.08

/**
 * Kept words on the edited clock. Removed words and words entirely inside
 * cuts are dropped; partly cut words are clipped.
 */
export function timedWords(words: Word[], map: TimeMap): TimedWord[] {
  const out: TimedWord[] = []
  const sorted = words
    .filter((w) => !w.removed && Number.isFinite(w.start) && Number.isFinite(w.end))
    .sort((a, b) => a.start - b.start)
  for (const w of sorted) {
    const start = w.start
    const end = Math.max(w.start, w.end)
    if (!survives(map, start, end)) continue
    const from = map.toEditedClamped(start)
    const to = Math.max(from, map.toEditedClamped(end))
    out.push({ id: w.id, text: w.text, start: from, end: to, emphasis: !!w.emphasis })
  }
  out.forEach((w, i) => {
    if (w.end - w.start >= MIN_WORD) return
    const next = i + 1 < out.length ? out[i + 1].start : map.duration
    w.end = Math.max(w.end, Math.min(w.start + MIN_WORD, next))
  })
  return out
}

/** True when some of [start, end] is kept (a point word: when that point is). */
function survives(map: TimeMap, start: Seconds, end: Seconds): boolean {
  if (end <= start) return map.rangeAt(start) >= 0
  const i = lastAtOrBefore(map.ranges, end, (r) => r.start)
  // The range found may start exactly at the word's end, which doesn't count.
  for (let k = i; k >= 0 && map.ranges[k].end > start; k--) {
    if (map.ranges[k].start < end) return true
  }
  return false
}

/** A pause this long ends a sentence even without punctuation. */
const SENTENCE_PAUSE = 1.2
/** Run-on transcripts get split at a comma past this many words, and regardless past the hard limit. */
const LONG_SENTENCE = 30
const MAX_SENTENCE = 50

// Not "no": "No." is a whole sentence far more often than it's "number".
const ABBREVIATIONS = new Set('mr mrs ms dr prof st sr jr vs etc inc ltd mt approx'.split(' '))

/** True if `text` ends a sentence, given the word after it. */
export function endsSentence(text: string, next?: string): boolean {
  const t = text.trim().replace(/["'”’»)\]]+$/, '')
  if (/[?!]$/.test(t)) return true
  if (/(…|\.\.\.)$/.test(t)) return !!next && /^[\p{Lu}]/u.test(next) && !/^I\b|^I['’]/.test(next)
  if (!t.endsWith('.')) return false
  const bare = t.slice(0, -1).toLowerCase().replace(/^["'“‘«(\[]+/, '')
  // Mr. Smith, e.g. this and the U.S. don't end anything. (A lone letter
  // might be an initial, but "plan B." ends sentences far more often.)
  return !(ABBREVIATIONS.has(bare) || /^(\p{L}\.)+\p{L}$/u.test(bare))
}

/**
 * Sentences, for translation and the AI: runs of kept words ending in
 * . ? ! (or at a long pause), as word-id spans with their text and
 * source-time span. Removed words are left out.
 */
export function sentences(
  words: Word[],
): { firstWordId: string; lastWordId: string; text: string; start: Seconds; end: Seconds }[] {
  const list = words.filter((w) => !w.removed && w.text.trim()).sort((a, b) => a.start - b.start)
  const out: { firstWordId: string; lastWordId: string; text: string; start: Seconds; end: Seconds }[] = []
  let run: Word[] = []
  const flush = () => {
    if (!run.length) return
    out.push({
      firstWordId: run[0].id,
      lastWordId: run[run.length - 1].id,
      text: run.map((w) => w.text.trim()).join(' '),
      start: run[0].start,
      end: Math.max(...run.map((w) => w.end)),
    })
    run = []
  }
  list.forEach((w, i) => {
    run.push(w)
    const next = list[i + 1]
    if (
      !next ||
      endsSentence(w.text, next.text) ||
      next.start - w.end >= SENTENCE_PAUSE ||
      (run.length >= LONG_SENTENCE && /[,;:]["'”’)]*$/.test(w.text.trim())) ||
      run.length >= MAX_SENTENCE
    )
      flush()
  })
  return out
}
