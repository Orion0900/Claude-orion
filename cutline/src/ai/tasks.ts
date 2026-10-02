/**
 * The Claude features. Each sends a compact view of the transcript, then
 * checks the answer against what it sent before anything reaches the
 * project: unknown words are dropped, counts are capped and timing is never
 * touched.
 */
import type { Word } from '../lib/types'
import { AiError, ask, throwIfAborted } from './claude'
import type { AiSettings } from './settings'

/* ---- Keywords and emojis ---- */

const HIGHLIGHTS_SYSTEM = `You style captions for short-form talking-head videos (TikTok, Reels, Shorts) the way a top editor at a creator studio would.

The transcript comes one word per line as \`<ref> <word>\`. Lines under "Context" are only there so you can follow the speech; don't pick them.

Pick two things:
- emphasis: words to show in the highlight colour, so someone skimming the captions gets the point. Go for the payoff of a sentence, numbers and amounts, names, strong contrasts ("never", "only", "free") and surprising claims. Usually one per sentence and about one word in ten overall, never filler or small function words.
- emojis: an emoji for a word where a picture adds something, like 💰 on "money", 🤯 on a surprise or ⏰ on "deadline". At most about one every ten words, never two close together, and only emojis anyone would get at a glance.

List each most important first, and name words only by their ref.`

/** Most of the words that may be coloured. */
const EMPHASIS_SHARE = 0.15

/** Fewest words between two emojis: about one caption page. */
const EMOJI_SPACING = 5

/** Keywords to colour and emoji to show, chosen like a top short-form editor would. */
export async function pickHighlights(
  s: AiSettings,
  words: Word[],
  signal?: AbortSignal,
): Promise<{ emphasis: string[]; emojis: { wordId: string; emoji: string }[] }> {
  const refs = toRefs(words, { keepRemoved: false })
  const picks = await inParallel(chunk(refs, CHUNK_WORDS, CONTEXT_WORDS), signal, async (c, chunkSignal) => {
    const out = await ask(
      s,
      {
        effort: 'low',
        system: HIGHLIGHTS_SYSTEM,
        user: wordsMessage(c),
        schema: (z) =>
          z.object({
            emphasis: z.array(z.string()).describe('Refs of the words to colour, most important first.'),
            emojis: z
              .array(z.object({ ref: z.string(), emoji: z.string().describe('A single emoji.') }))
              .describe('Most important first.'),
          }),
      },
      chunkSignal,
    )
    const known = byRef(c.body)
    const emphasis = unique(out.emphasis.map((ref) => ref.trim()))
      .flatMap((ref) => known.get(ref) ?? [])
      .slice(0, Math.max(1, Math.round(c.body.length * EMPHASIS_SHARE)))
    // Taken in Claude's order of importance, so a crowded stretch keeps its best one.
    const emojis: { r: Ref; emoji: string }[] = []
    for (const pick of out.emojis) {
      const r = known.get(pick.ref.trim())
      const emoji = pick.emoji.trim()
      if (!r || !isEmoji(emoji)) continue
      if (emojis.some((e) => Math.abs(e.r.pos - r.pos) < EMOJI_SPACING)) continue
      emojis.push({ r, emoji })
    }
    return { emphasis, emojis }
  })

  // Chunks were spaced on their own; keep the spacing where they meet too.
  const emojis: { r: Ref; emoji: string }[] = []
  for (const e of picks.flatMap((p) => p.emojis).sort((a, b) => a.r.pos - b.r.pos)) {
    const last = emojis.at(-1)
    if (!last || e.r.pos - last.r.pos >= EMOJI_SPACING) emojis.push(e)
  }
  return {
    emphasis: picks
      .flatMap((p) => p.emphasis)
      .sort((a, b) => a.pos - b.pos)
      .map((r) => r.word.id),
    emojis: emojis.map(({ r, emoji }) => ({ wordId: r.word.id, emoji })),
  }
}

/* ---- Hook, caption and hashtags ---- */

const HOOK_SYSTEM = `You package talking-head videos for TikTok, Reels and Shorts like a top short-form strategist.

From the transcript, write:
- hooks: 4 different options for the title card shown over the video's first seconds. At most about 8 words each, built to stop a scroller: a bold claim, a surprising number, a question or a promise, taken from what the video actually says. Take a different angle in each. No emojis, hashtags or quotation marks.
- caption: the text to post with the video. One to three short sentences in the creator's voice that add context or invite comments, with at most one emoji and no hashtags.
- hashtags: 3 to 6 relevant hashtags, from broad to specific.

Write in the language the video is spoken in, and don't promise anything the video doesn't deliver.`

/** Hook title options for the first seconds + a post caption + hashtags. */
export async function writeHook(
  s: AiSettings,
  words: Word[],
  signal?: AbortSignal,
): Promise<{ hooks: string[]; caption: string; hashtags: string[] }> {
  const segs = segments(toRefs(words, { keepRemoved: false }))
  if (segs.length === 0) throw new AiError('other', "There's no speech in this video to write a hook from.")
  const out = await ask(
    s,
    {
      effort: 'medium',
      system: HOOK_SYSTEM,
      user: `Transcript:\n${segs.map((seg) => seg.text).join('\n')}`,
      schema: (z) =>
        z.object({
          hooks: z.array(z.string()),
          caption: z.string(),
          hashtags: z.array(z.string()),
        }),
    },
    signal,
  )
  const hooks = uniqueBy(
    out.hooks.map((h) => stripQuotes(oneLine(h))).filter((h) => h && length(h) <= 100),
    (h) => h.toLowerCase(),
  ).slice(0, 4)
  if (hooks.length === 0) throw new AiError('bad-output', "Claude didn't come up with a usable hook. Try again.")
  return {
    hooks,
    caption: truncate(tidy(out.caption), 2200),
    hashtags: uniqueBy(out.hashtags.map(toHashtag).filter(Boolean), (t) => t.toLowerCase()).slice(0, 8),
  }
}

/* ---- Translation ---- */

const translateSystem = (language: string) => `You translate a video's captions into ${language}.

The sentences to translate come as JSON objects, one per line, each with an id and text. Translate each so it reads naturally as an on-screen caption: keep the speaker's meaning, tone and register, and keep it about as long as the original or shorter, because viewers read it at the pace it's spoken. Condense rather than run long. Keep names and brands as they are.

Return one translation for every id, with no notes or alternatives.`

/** Sentences per request: a few minutes of speech. */
const CHUNK_SENTENCES = 60

/** Translate each sentence for captions, keeping it short enough to read at speaking pace. */
export async function translateSentences(
  s: AiSettings,
  sentences: { id: string; text: string }[],
  language: string,
  signal?: AbortSignal,
): Promise<{ id: string; text: string }[]> {
  const target = oneLine(language)
  if (!target) throw new AiError('other', 'Pick a language to translate into.')
  const items = sentences
    .map((sentence, i) => ({ ref: `s${i}`, id: sentence.id, text: oneLine(sentence.text) }))
    .filter((item) => item.text)
  type Item = (typeof items)[number]

  const done = new Map<string, string>()
  const translate = async (batches: Chunk<Item>[]) => {
    const results = await inParallel(batches, signal, async (c, chunkSignal) => {
      const parts = []
      if (c.before.length) parts.push(`Earlier in the video, for context only:\n${c.before.map((x) => x.text).join('\n')}`)
      parts.push(`Sentences to translate:\n${c.body.map((x) => JSON.stringify({ id: x.ref, text: x.text })).join('\n')}`)
      const out = await ask(
        s,
        {
          effort: 'low',
          system: translateSystem(target),
          user: parts.join('\n\n'),
          schema: (z) => z.object({ translations: z.array(z.object({ id: z.string(), text: z.string() })) }),
        },
        chunkSignal,
      )
      const wanted = new Set(c.body.map((x) => x.ref))
      return out.translations
        .map((t) => ({ ref: t.id.trim(), text: oneLine(t.text) }))
        .filter((t) => wanted.has(t.ref) && t.text)
    })
    for (const t of results.flat()) if (!done.has(t.ref)) done.set(t.ref, t.text)
  }

  await translate(chunk(items, CHUNK_SENTENCES, 3))
  const missing = items.filter((item) => !done.has(item.ref))
  // Rare, but a gap would leave a caption in the wrong language: ask once more
  // for just those.
  if (missing.length) await translate(chunk(missing, CHUNK_SENTENCES, 0))
  return items.flatMap((item) => {
    const text = done.get(item.ref)
    return text ? [{ id: item.id, text }] : []
  })
}

/* ---- Best clips ---- */

const clipsSystem = (min: number, max: number) => `You find the moments in a long video that would make the best standalone vertical shorts (TikTok, Reels, Shorts).

The transcript comes as segments, one per line: \`<ref> [<start>-<end>] <text>\`, with times in seconds. A clip runs from the start of one segment to the end of the same or a later one.

Choose up to 5 clips. Each one:
- makes sense with no earlier context, opening on a strong first line and ending on a complete thought or payoff;
- lasts ${seconds(min)} to ${seconds(max)} seconds, counted from the start time of its first segment to the end time of its last;
- doesn't overlap another clip.

Favour a clear hook, a surprising or useful idea, strong emotion, or a story that pays off. Fewer, stronger clips beat filling the quota. Give each a title of at most about 8 words, one sentence on why it will work, and a score from 0 to 100 for how well you expect it to do.`

/** How far a clip may stray from the target length, since Claude adds the times up itself. */
const LENGTH_SLACK = 0.1

/** Best self-contained short clips from a long video (for "AI Shorts"). Times come from word ids. */
export async function findClips(
  s: AiSettings,
  words: Word[],
  target: { min: number; max: number },
  signal?: AbortSignal,
): Promise<{ title: string; reason: string; firstWordId: string; lastWordId: string; score: number }[]> {
  const min = Math.max(0, Math.min(target.min, target.max))
  const max = Math.max(target.min, target.max)
  const segs = segments(toRefs(words, { keepRemoved: false }))
  if (!(max > 0) || segs.length === 0) return []
  const shortest = min * (1 - LENGTH_SLACK)
  const longest = max * (1 + LENGTH_SLACK)
  if (segs[segs.length - 1].end - segs[0].start < shortest) return []

  const out = await ask(
    s,
    {
      effort: 'medium',
      system: clipsSystem(min, max),
      user: `Transcript:\n${segs.map((seg) => `${seg.ref} [${seconds(seg.start)}-${seconds(seg.end)}] ${seg.text}`).join('\n')}`,
      schema: (z) =>
        z.object({
          clips: z.array(
            z.object({
              start: z.string().describe('Ref of the first segment.'),
              end: z.string().describe('Ref of the last segment.'),
              title: z.string(),
              reason: z.string(),
              score: z.number(),
            }),
          ),
        }),
    },
    signal,
  )

  const index = new Map(segs.map((seg, i) => [seg.ref, i]))
  const candidates = out.clips.flatMap((clip) => {
    const from = index.get(clip.start.trim())
    const to = index.get(clip.end.trim())
    if (from === undefined || to === undefined || from > to) return []
    const first = segs[from].refs[0]
    const last = segs[to].refs[segs[to].refs.length - 1]
    if (first.pos >= last.pos) return []
    const span = last.word.end - first.word.start
    if (span < shortest || span > longest) return []
    return [
      {
        from,
        to,
        title: truncate(stripQuotes(oneLine(clip.title)), 100) || truncate(segs[from].text, 60),
        reason: truncate(oneLine(clip.reason), 300),
        firstWordId: first.word.id,
        lastWordId: last.word.id,
        score: Math.round(Math.min(100, Math.max(0, clip.score))) || 0,
      },
    ]
  })

  // Best first; a clip that overlaps a better one would be the same short twice.
  candidates.sort((a, b) => b.score - a.score)
  const kept: typeof candidates = []
  for (const c of candidates) {
    if (kept.length === 5) break
    if (kept.some((k) => c.from <= k.to && k.from <= c.to)) continue
    kept.push(c)
  }
  return kept.map(({ title, reason, firstWordId, lastWordId, score }) => ({ title, reason, firstWordId, lastWordId, score }))
}

/* ---- Teleprompter script ---- */

const SCRIPT_SYSTEM = `You write teleprompter scripts for creators filming talking-head videos for TikTok, Reels and Shorts.

Write only the words to be spoken: no headings, stage directions, camera notes, emojis or hashtags. Hook the viewer in the first sentence, keep sentences short and conversational, make one clear point, and end on a natural close or call to action. Use short paragraphs separated by blank lines so it's easy to read off a phone. Write in the language of the brief.

Also give the video a short title of at most about 8 words.`

/** A comfortable pace for reading to camera: 150 words a minute. */
const WORDS_PER_SECOND = 2.5

/** A teleprompter script for a talking-head video. */
export async function writeScript(
  s: AiSettings,
  brief: { topic: string; seconds: number; tone: string },
  signal?: AbortSignal,
): Promise<{ title: string; script: string }> {
  const topic = tidy(brief.topic)
  if (!topic) throw new AiError('other', 'Say what the video is about first.')
  const duration = Math.round(Math.min(600, Math.max(10, Number.isFinite(brief.seconds) ? brief.seconds : 60)))
  const tone = oneLine(brief.tone) || 'Natural and friendly'
  const out = await ask(
    s,
    {
      effort: 'medium',
      system: SCRIPT_SYSTEM,
      user: `Topic: ${topic}\nTone: ${tone}\nLength: about ${duration} seconds read aloud, roughly ${Math.round(duration * WORDS_PER_SECOND)} words.`,
      schema: (z) => z.object({ title: z.string(), script: z.string() }),
    },
    signal,
  )
  const script = tidy(out.script)
  if (!script) throw new AiError('bad-output', 'Claude sent back an empty script. Try again.')
  return { title: truncate(stripQuotes(oneLine(out.title)), 100) || truncate(oneLine(topic), 60), script }
}

/* ---- Transcript fixes ---- */

const FIX_SYSTEM = `You proofread speech-recognition (Whisper) transcripts that become a video's captions.

The transcript comes one word per line as \`<ref> <word>\`, and each word's timing is fixed. Lines under "Context" are only there so you can follow the speech; don't correct them.

Correct only transcription mistakes: misheard words, the spelling of names, brands and jargon (the user's notes say what to expect), casing and punctuation. Keep what the speaker actually said: don't rephrase, fix their grammar, drop filler words or translate.

Each correction replaces one word with one word and keeps the punctuation that belongs with it ("teh," becomes "the,"). If fixing something would mean merging or splitting words, leave it. Return only the words that change; an empty list is fine.`

/** Fix Whisper mistakes (names, jargon, punctuation, casing) word-for-word without changing timing: returns only words whose text should change. */
export async function fixTranscript(
  s: AiSettings,
  words: Word[],
  context: string,
  signal?: AbortSignal,
): Promise<{ wordId: string; text: string }[]> {
  // Cut words stay in: they keep the sentences readable and are still shown,
  // struck through, in the transcript.
  const refs = toRefs(words, { keepRemoved: true })
  const notes = `Notes from the user about this video: ${tidy(context) || 'none'}`
  const fixes = await inParallel(chunk(refs, CHUNK_WORDS, CONTEXT_WORDS), signal, async (c, chunkSignal) => {
    const out = await ask(
      s,
      {
        effort: 'low',
        system: FIX_SYSTEM,
        user: `${notes}\n\n${wordsMessage(c)}`,
        schema: (z) =>
          z.object({
            fixes: z.array(z.object({ ref: z.string(), text: z.string().describe('The corrected word.') })),
          }),
      },
      chunkSignal,
    )
    const known = byRef(c.body)
    const changed = new Map<Ref, string>()
    for (const fix of out.fixes) {
      const r = known.get(fix.ref.trim())
      const text = fix.text.trim()
      if (!r || changed.has(r) || !text || text === r.word.text) continue
      // One word in, one word out, so every caption keeps its timing.
      if (/\s/.test(text) && !/\s/.test(r.word.text)) continue
      changed.set(r, text)
    }
    return [...changed].sort(([a], [b]) => a.pos - b.pos).map(([r, text]) => ({ wordId: r.word.id, text }))
  })
  return fixes.flat()
}

/* ---- Shared helpers ---- */

/**
 * A word as a prompt names it. Refs are short and made up per request, so
 * the prompt stays compact whatever the real ids look like, and anything
 * Claude invents simply doesn't match.
 */
interface Ref {
  ref: string
  word: Word
  /** Place among the words sent. */
  pos: number
}

function toRefs(words: Word[], { keepRemoved }: { keepRemoved: boolean }): Ref[] {
  const refs: Ref[] = []
  words.forEach((word, i) => {
    if (word.removed && !keepRemoved) return
    refs.push({ ref: `w${i}`, word, pos: refs.length })
  })
  return refs
}

function byRef(refs: Ref[]): Map<string, Ref> {
  return new Map(refs.map((r) => [r.ref, r]))
}

/** Words per request for the word-by-word jobs: a few minutes of speech. */
const CHUNK_WORDS = 600

/** Words either side of a chunk, sent so sentences cut at the edge still make sense. */
const CONTEXT_WORDS = 40

interface Chunk<T> {
  before: T[]
  body: T[]
  after: T[]
}

/** Even chunks of at most `size`, each with up to `context` items from either side. */
function chunk<T>(items: T[], size: number, context: number): Chunk<T>[] {
  if (items.length === 0) return []
  const step = Math.ceil(items.length / Math.ceil(items.length / size))
  const chunks: Chunk<T>[] = []
  for (let i = 0; i < items.length; i += step) {
    chunks.push({
      before: items.slice(Math.max(0, i - context), i),
      body: items.slice(i, i + step),
      after: items.slice(i + step, i + step + context),
    })
  }
  return chunks
}

function wordsMessage(c: Chunk<Ref>): string {
  const lines = (refs: Ref[]) => refs.map((r) => `${r.ref} ${oneLine(r.word.text)}`).join('\n')
  const parts = []
  if (c.before.length) parts.push(`Context before:\n${lines(c.before)}`)
  parts.push(`Transcript:\n${lines(c.body)}`)
  if (c.after.length) parts.push(`Context after:\n${lines(c.after)}`)
  return parts.join('\n\n')
}

/** Requests in flight at once: quick on long videos without tripping a new account's rate limits. */
const PARALLEL = 3

/** Runs `run` over every item, a few at a time, in order. The first failure cancels the rest. */
async function inParallel<T, R>(
  items: T[],
  signal: AbortSignal | undefined,
  run: (item: T, signal: AbortSignal) => Promise<R>,
): Promise<R[]> {
  throwIfAborted(signal)
  // One controller for the batch, so a bad key or a refusal stops the
  // requests still running instead of paying for the rest of the video.
  const batch = new AbortController()
  const cancel = () => batch.abort()
  signal?.addEventListener('abort', cancel)
  const results: R[] = []
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await run(items[i], batch.signal)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker))
    return results
  } catch (e) {
    batch.abort()
    throw e
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

/** A stretch of speech: a sentence, or what's said between pauses when there's no punctuation. */
interface Segment {
  ref: string
  refs: Ref[]
  start: number
  end: number
  text: string
}

const SENTENCE_END = /[.!?…。！？][)"'”’»]*$/u

/** A gap this long, in seconds, ends a segment even mid-sentence. */
const PAUSE = 1

const MAX_SEGMENT_WORDS = 30

function segments(refs: Ref[]): Segment[] {
  const segs: Segment[] = []
  let current: Ref[] = []
  refs.forEach((r, i) => {
    current.push(r)
    const next = refs[i + 1]
    if (
      !next ||
      SENTENCE_END.test(r.word.text) ||
      next.word.start - r.word.end > PAUSE ||
      current.length >= MAX_SEGMENT_WORDS
    ) {
      segs.push({
        ref: `s${segs.length}`,
        refs: current,
        start: current[0].word.start,
        end: r.word.end,
        text: current.map((x) => oneLine(x.word.text)).join(' '),
      })
      current = []
    }
  })
  return segs
}

// One emoji: a pictograph with any variation selector, skin tone, tag or
// joined pictographs (👍🏽, 👩‍💻, 🏴󠁧󠁢󠁳󠁣󠁴󠁿), a flag, or a keycap.
const EMOJI =
  /^(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}[️\p{Emoji_Modifier}]*(?:‍\p{Extended_Pictographic}[️\p{Emoji_Modifier}]*)*[\u{E0020}-\u{E007F}]*)$/u

function isEmoji(text: string): boolean {
  return EMOJI.test(text)
}

function toHashtag(tag: string): string {
  const body = tag.replace(/[^\p{L}\p{M}\p{N}_]/gu, '')
  return body && length(body) <= 40 ? `#${body}` : ''
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Trims and evens out blank lines, keeping paragraphs. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Drops quotation marks wrapped around the whole text. */
function stripQuotes(text: string): string {
  const m = /^["'“”‘’«»](.*)["'“”‘’«»]$/su.exec(text)
  return m ? m[1].trim() : text
}

/** Length in characters as people count them, so an emoji is one. */
function length(text: string): number {
  return Array.from(text).length
}

/** Cuts to `max` characters without splitting an emoji. */
function truncate(text: string, max: number): string {
  const chars = Array.from(text)
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

function seconds(t: number): string {
  return String(Math.round(t * 10) / 10)
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const k = key(item)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
