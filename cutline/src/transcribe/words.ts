/**
 * Turns what Whisper said about one window of audio into clean Words on the
 * source clock: punctuation attached, times that never overlap or run
 * backwards, word edges pulled out of silence, and the model's usual
 * inventions on silence left out. Pure functions, so they're easy to test.
 */

import type { Word } from '../lib/types.ts'
import { isSteady, loudUntil, speechIslands, speechSeconds, type Island } from './chunking.ts'
import type { SpeechProfile } from './chunking.ts'

/** A word or segment as transformers.js returns it: seconds from the start of the audio it heard. */
export interface RawChunk {
  text: string
  timestamp: readonly (number | null)[]
}

export interface ChunkContext {
  /** Where the window starts on the source clock. */
  offset: number
  /** Length of the window; word times are kept inside it. */
  duration: number
  /** Loudness of the whole recording, on the source clock. */
  profile?: SpeechProfile
  /** Makes a new unique word id. */
  nextId: () => string
}

interface Draft {
  text: string
  start: number | null
  end: number | null
  /** Whether the token came with a space in front, i.e. starts a new word. */
  spaced: boolean
}

export interface Timed {
  text: string
  start: number
  end: number
}

/** The shortest a word may be, in seconds. */
export const MIN_WORD_SECONDS = 0.05
// Used when Whisper gives a word a start but no end.
const DEFAULT_WORD_SECONDS = 0.3
// Speech starts a moment before it's loud and fades after it stops being loud.
const LEAD_IN = 0.1
const TAIL_OUT = 0.15
// Only words this long can have silence worth trimming from their edges.
const SNAP_MIN_SECONDS = 0.2
// Quiet this long inside a word's time means it holds a pause, not just a stop consonant.
const WORD_GAP = 0.25
// How far a word may grow to take in sound just past its edges.
const REACH = 0.3
// A stretch of sound this long or more can be a word, not a sliver of the next one.
const OWN_SOUND = 0.15
// A lone stretch of sound no longer than this can be an um a word was timed onto,
// when the next word starts no further away than SHIFT_REACH.
const LONE_SOUND = 0.6
const SHIFT_REACH = 1.2
// Punctuation that ends a phrase, give or take a closing quote or bracket.
const PHRASE_END = /[,.!?;:…—–]["'”’)\]]*$/u
// With less speech-loud audio than this under it, a stock phrase was made up.
const INVENTED_SPEECH_SHARE = 0.25
const LONGEST_REPEATED_PHRASE = 8

const PUNCTUATION_ONLY = /^\p{P}+$/u
// Opening brackets and quotes belong to the word after them.
const OPENING = /^[\p{Ps}\p{Pi}¡¿]+$/u
const STRAIGHT_QUOTES = /^["']+$/
// Contractions that sometimes arrive as their own token: 's, 're, n't...
const CLITIC = /^(?:['’](?:s|d|m|t|ll|re|ve)|n['’]t)$/i
// Without a space before it, a token starting like this continues the word before.
const CONTINUES = /^[\p{Pd}\p{Pe}\p{Pf}\p{Po}]/u
const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u
const MUSIC_SIGNS = /[♪♫♬]/gu
const BRACKETS: Record<string, string> = { '[': ']', '(': ')', '*': '*' }

// What Whisper tends to write over silence, noise or music. Dropped only
// where the audio under them is quiet or steady like noise, and the one-word
// ones only when they're all a window holds: "you" ending a sentence is common.
const STOCK_PHRASES = new Set(
  [
    'you',
    'bye',
    'bye bye',
    'thanks',
    'thank you',
    'thank you very much',
    'thank you so much',
    'thanks for watching',
    'thank you for watching',
    'thank you so much for watching',
    'thanks for watching and see you next time',
    'please subscribe',
    'please like and subscribe',
    'subscribe to my channel',
    'see you next time',
    'see you in the next video',
    'subtitles by the amara.org community',
    'transcription by castingwords',
    'sous-titres réalisés par la communauté d’amara.org',
    'untertitel der amara.org-community',
    'untertitel im auftrag des zdf für funk, 2017',
    'продолжение следует',
    'спасибо за просмотр',
    'gracias por ver el video',
    'ご視聴ありがとうございました',
  ].map((phrase) => phraseKey([{ text: phrase }])),
)

/** Turns one window's raw words into Words on the source clock. */
export function normalizeChunk(raw: readonly RawChunk[], context: ChunkContext): Word[] {
  const drafts = raw.map(toDraft)
  const words = collapseRepeats(dropNonSpeech(glue(drafts)))
  let timed = fixTimes(words, context.duration).map((word) => ({
    text: word.text,
    start: word.start + context.offset,
    end: word.end + context.offset,
  }))
  if (context.profile) {
    timed = snapToSpeech(timed, context.profile, context.offset, context.offset + context.duration)
    timed = dropInventions(timed, context.profile)
  }
  return timed.map((word) => ({
    id: context.nextId(),
    text: word.text,
    start: roundTime(word.start),
    end: roundTime(word.end),
  }))
}

/**
 * Makes ids that are unique across windows and, thanks to a random prefix,
 * across transcriptions too.
 */
export function idMaker(prefix = randomPrefix()): () => string {
  let count = 0
  return () => `${prefix}${(count++).toString(36)}`
}

/**
 * Splits timed segments into words and shares each segment's time out by the
 * length of its words. Used when the model can't time single words.
 */
export function spreadSegments(segments: readonly RawChunk[], duration: number, language?: string | null): RawChunk[] {
  const out: RawChunk[] = []
  segments.forEach((segment, i) => {
    const start = finite(segment.timestamp[0]) ?? 0
    const next = segments[i + 1]
    const end = Math.max(start, finite(segment.timestamp[1]) ?? finite(next?.timestamp[0]) ?? duration)
    const pieces = splitText(segment.text, language)
    const weights = pieces.map((piece) => Math.max(1, piece.text.replace(/\p{P}/gu, '').length))
    const total = weights.reduce((sum, w) => sum + w, 0)
    let at = start
    pieces.forEach((piece, k) => {
      const length = ((end - start) * weights[k]) / total
      out.push({ text: piece.spaced ? ` ${piece.text}` : piece.text, timestamp: [at, at + length] })
      at += length
    })
  })
  return out
}

/** Keeps the first of a phrase that Whisper has looped on, dropping the copies. */
export function collapseRepeats<T extends { text: string }>(words: readonly T[]): T[] {
  let result = words.slice()
  for (let size = 1; size <= LONGEST_REPEATED_PHRASE; size++) {
    // A word said six times running, a short phrase four, a long one three:
    // past that it's the model stuck in a loop, not the speaker.
    const limit = size === 1 ? 6 : size <= 3 ? 4 : 3
    const keys = result.map((word) => phraseKey([word]))
    const same = (a: number, b: number) => {
      for (let k = 0; k < size; k++) if (!keys[a + k] || keys[a + k] !== keys[b + k]) return false
      return true
    }
    const out: T[] = []
    let i = 0
    while (i < result.length) {
      let copies = 1
      while (i + (copies + 1) * size <= result.length && same(i, i + copies * size)) copies++
      if (copies >= limit) {
        out.push(...result.slice(i, i + size))
        i += copies * size
      } else {
        out.push(result[i])
        i++
      }
    }
    result = out
  }
  return result
}

function toDraft(chunk: RawChunk): Draft {
  return {
    text: chunk.text.replace(MUSIC_SIGNS, '').trim(),
    start: finite(chunk.timestamp[0]),
    end: finite(chunk.timestamp[1]),
    spaced: /^\s/.test(chunk.text),
  }
}

/** Attaches punctuation and split-off contractions to the words they belong to. */
function glue(tokens: readonly Draft[]): Draft[] {
  const out: Draft[] = []
  let opening = ''
  for (const token of tokens) {
    const text = token.text
    if (!text) continue
    const previous = out.at(-1)
    if (PUNCTUATION_ONLY.test(text)) {
      const opens = OPENING.test(text) || (STRAIGHT_QUOTES.test(text) && token.spaced)
      if (opens || !previous) {
        opening += text
      } else {
        previous.text += text
        previous.end = later(previous.end, token.end ?? token.start)
      }
      continue
    }
    if (previous && !opening && (CLITIC.test(text) || (!token.spaced && CONTINUES.test(text)))) {
      previous.text += text
      previous.end = later(previous.end, token.end)
      continue
    }
    out.push({ ...token, text: opening + text })
    opening = ''
  }
  const last = out.at(-1)
  if (opening && last) last.text += opening
  return out
}

/** Leaves out music signs, bare punctuation and sound descriptions like [Music] or (laughs). */
function dropNonSpeech(words: readonly Draft[]): Draft[] {
  const out: Draft[] = []
  for (let i = 0; i < words.length; i++) {
    const text = words[i].text
    if (!HAS_LETTER_OR_DIGIT.test(text)) continue
    const close = BRACKETS[text[0]]
    if (close) {
      const end = findClose(words, i, close)
      if (end >= 0) {
        i = end
        continue
      }
    }
    out.push(words[i])
  }
  return out
}

function findClose(words: readonly Draft[], from: number, close: string): number {
  for (let j = from; j < words.length && j < from + 6; j++) {
    const text = words[j].text.replace(/[.,!?;:]+$/u, '')
    if (text.endsWith(close) && (j > from || text.length > 1)) return j
  }
  return -1
}

/**
 * Times inside [0, duration] that only move forward: every word starts at
 * or after the end of the one before and lasts at least MIN_WORD_SECONDS,
 * squeezed when the window is too short to give every word that much.
 */
function fixTimes(words: readonly Draft[], duration: number): Timed[] {
  const count = words.length
  if (count === 0) return []
  const shortest = Math.min(MIN_WORD_SECONDS, duration / count)
  const out: Timed[] = []
  let previousEnd = 0
  for (let i = 0; i < count; i++) {
    const word = words[i]
    let start = word.start ?? previousEnd
    let end = word.end ?? laterStart(words, i, start) ?? start + DEFAULT_WORD_SECONDS
    if (end < start) end = start
    start = clamp(start, previousEnd, duration - (count - i) * shortest)
    end = clamp(end, start + shortest, duration - (count - i - 1) * shortest)
    out.push({ text: word.text, start, end })
    previousEnd = end
  }
  return out
}

/**
 * Word timing comes from where the model was looking in the audio, and a
 * pause next to a word tends to get counted as part of it, along with the
 * first moment of the word after. So each word is first trimmed to the
 * main stretch of sound in it, a little either side kept, and then allowed
 * to take in sound running on just past its edges, up to its neighbours.
 */
export function snapToSpeech(words: readonly Timed[], profile: SpeechProfile, low: number, high: number): Timed[] {
  const out = words.map((word, i) => {
    if (word.end - word.start < SNAP_MIN_SECONDS) return { ...word }
    const islands = speechIslands(profile, word.start, word.end, WORD_GAP)
    if (islands.length === 0) return { ...word }
    const main = ownSound(islands, word, i > 0 ? words[i - 1] : null, i + 1 < words.length ? words[i + 1] : null, profile)
    const start = Math.max(word.start, main.start - LEAD_IN)
    const end = Math.min(word.end, main.end + TAIL_OUT)
    return end - start >= MIN_WORD_SECONDS ? { ...word, start, end } : { ...word }
  })
  reclaimShifted(out, profile)
  out.forEach((word, i) => {
    const before = i > 0 ? out[i - 1].end : low
    const after = i + 1 < out.length ? out[i + 1].start : high
    const onset = loudUntil(profile, word.start, -1, REACH)
    if (onset < word.start) word.start = Math.max(before, Math.min(word.start, onset - LEAD_IN))
    const offset = loudUntil(profile, word.end, 1, REACH)
    if (offset > word.end) word.end = Math.min(after, Math.max(word.end, offset + TAIL_OUT))
  })
  return out
}

/**
 * Which stretch of sound inside a word's time is the word itself.
 *
 * Whisper writes down hardly any ums, and the time an um took gets counted
 * into the word beside it: "channel. [umm] So today" times "So" from the
 * start of the umm. The longest stretch is often the um, so loudness alone
 * picks wrong. Punctuation says where the pause was: a word that ends a
 * phrase comes before it, so the word is its first stretch of sound; a
 * word that opens a phrase comes after it, so it's the last. A stretch too
 * short to be a word is a sliver of a neighbour, never the word.
 *
 * Mid-phrase, Whisper often leaves the pauses around an um unpunctuated:
 * "about [uhh] the three" with "the" timed over the uhh, the pause and the
 * word. There, a short stretch standing alone at the front, then a
 * word-length stretch running straight on into the next word, means the
 * word is the second one. Anything else keeps the loudest stretch.
 */
export function ownSound(
  islands: readonly Island[],
  word: Timed,
  previous: Timed | null,
  next: Timed | null,
  profile: SpeechProfile,
): Island {
  const loudest = islands.reduce((best, island) => (island.loud > best.loud ? island : best))
  if (islands.length < 2) return loudest
  const ends = PHRASE_END.test(word.text.trim())
  const opens = previous === null || PHRASE_END.test(previous.text.trim())
  const first = islands[0]
  const last = islands[islands.length - 1]
  if (ends && !opens) return first.end - first.start >= OWN_SOUND ? first : loudest
  if (opens && !ends) return last.end - last.start >= OWN_SOUND ? last : loudest
  if (ends || opens || !next) return loudest
  const loneFirst = first.end - first.start <= LONE_SOUND && standsAlone(profile, first) && (!previous || previous.end <= first.start)
  const runsOn = last.end >= word.end - 0.01 && next.start <= word.end + 0.05 && last.end - last.start >= OWN_SOUND
  return loneFirst && runsOn ? last : loudest
}

/** Whether a stretch of sound has at least WORD_GAP of quiet before it. */
function standsAlone(profile: SpeechProfile, island: Island): boolean {
  const before = speechIslands(profile, island.start - WORD_GAP - 0.02, island.end, WORD_GAP)
  const own = before[before.length - 1]
  return !own || own.start >= island.start - 0.015
}

/**
 * Whisper sometimes times a word onto an um just before it: "channel.
 * [umm] So today" with "So" over the umm and "today" over "so today". The
 * um then passes for speech and the word's own sound goes to its
 * neighbour. The tell is a pause Whisper didn't punctuate: a short, lone
 * stretch of sound holding a single unpunctuated word, quiet either side,
 * then the next word opening the next stretch. A real word stranded like
 * that nearly always gets a comma or a full stop. So the word moves to the
 * front of the next stretch, sharing it with its neighbour by length, and
 * the lone sound is left untranscribed for the filler remover.
 */
function reclaimShifted(words: Timed[], profile: SpeechProfile): void {
  for (let i = 0; i + 1 < words.length; i++) {
    const word = words[i]
    const next = words[i + 1]
    if (PHRASE_END.test(word.text.trim())) continue
    // Stretches of sound are at least WORD_GAP of quiet apart, so "lone" means
    // nothing else is said in the stretch this word sits on.
    const around = speechIslands(profile, word.start - WORD_GAP, next.end, WORD_GAP)
    const mine = around.filter((island) => island.end > word.start && island.start < word.end)
    if (mine.length !== 1) continue
    const lone = mine[0]
    if (lone.end - lone.start > LONE_SOUND) continue
    if (i > 0 && words[i - 1].end > lone.start) continue
    const following = around.find((island) => island.start > lone.end)
    if (!following || following.start - lone.end > SHIFT_REACH) continue
    // Only when the next word claims the very start of its stretch: its
    // timing then took in the sound this word lost. A next word timed from
    // part-way in leaves room for this one to be a real word said alone.
    if (next.start > following.start + 0.05 || next.end <= following.start) continue
    const start = Math.max(following.start - LEAD_IN, lone.end)
    const share = (next.end - start) * (letters(word.text) / (letters(word.text) + letters(next.text)))
    const end = start + Math.max(MIN_WORD_SECONDS, share)
    if (next.end - end < MIN_WORD_SECONDS) continue
    word.start = start
    word.end = end
    next.start = end
  }
}

const letters = (text: string) => Math.max(1, text.replace(/[^\p{L}\p{N}]/gu, '').length)

/**
 * Whisper fills silence and noise with stock phrases like "Thank you." Drops
 * them when the audio under them is mostly quiet or holds steady like noise:
 * as the whole window, or before or after the speech in it.
 */
function dropInventions(words: Timed[], profile: SpeechProfile): Timed[] {
  const invented = (run: readonly Timed[]) =>
    STOCK_PHRASES.has(phraseKey(run)) &&
    (speechShare(run, profile) < INVENTED_SPEECH_SHARE || isSteady(profile, run[0].start, run[run.length - 1].end))
  if (words.length > 0 && invented(words)) return []
  let kept = words
  for (let size = Math.min(6, kept.length - 1); size >= 2; size--) {
    if (invented(kept.slice(0, size))) {
      kept = kept.slice(size)
      break
    }
  }
  for (let size = Math.min(6, kept.length - 1); size >= 2; size--) {
    if (invented(kept.slice(-size))) return kept.slice(0, -size)
  }
  return kept
}

function speechShare(words: readonly Timed[], profile: SpeechProfile): number {
  let loud = 0
  let total = 0
  for (const word of words) {
    loud += speechSeconds(profile, word.start, word.end)
    total += word.end - word.start
  }
  return total > 0 ? loud / total : 0
}

/**
 * Lower-case letters and digits only, for comparing words. Spaces go too, so
 * a phrase matches however a script without spaces was split into words.
 */
function phraseKey(words: readonly { text: string }[]): string {
  return words.map((word) => word.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')).join('')
}

const NO_SPACES = new Set(['zh', 'ja', 'th', 'lo', 'my', 'km', 'bo'])

function splitText(text: string, language?: string | null): { text: string; spaced: boolean }[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  if (language && NO_SPACES.has(language) && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(language, { granularity: 'word' })
    return Array.from(segmenter.segment(trimmed))
      .filter((part) => part.segment.trim())
      .map((part) => ({ text: part.segment.trim(), spaced: false }))
  }
  return trimmed.split(/\s+/).map((piece) => ({ text: piece, spaced: true }))
}

function laterStart(words: readonly Draft[], i: number, start: number): number | null {
  const next = words[i + 1]?.start
  return next != null && next > start ? next : null
}

function later(a: number | null, b: number | null): number | null {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

function finite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

function roundTime(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}

function randomPrefix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return `w${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}.`
}
