/**
 * What to cut, worked out on the source clock: removed words, fillers, cuts
 * made by hand and the dead air between sentences.
 *
 * Everything leans towards keeping sound. Whisper's word times are only good
 * to a tenth of a second or so, its word ends usually land early and it
 * leaves most ums out of the transcript altogether, so every kept word
 * carries a guard the automatic cuts never enter. When the loudness of the
 * recording is known, it settles the close calls: a word still sounding past
 * its transcribed end keeps going, cut edges move into the quietest frame
 * nearby, and sounds Whisper never wrote down are treated as speech (or as
 * fillers, when fillers are being removed) instead of silence.
 */
import type { AudioAnalysis, EditSettings, Range, Seconds, Word } from './types'

/** Kept before a kept word: Whisper's starts are sometimes late. */
export const PAD_BEFORE = 0.06
/** Kept after a kept word: Whisper's ends are usually early. */
export const PAD_AFTER = 0.12
/** Silence kept before the first word and after the last when pauses go. */
export const LEAD_SILENCE = 0.15
export const TAIL_SILENCE = 0.4
/** Keep ranges closer than this are one; shorter ones aren't worth showing. */
export const MIN_SPAN = 0.04
/** A kept stretch with nothing said in it, this short, between two cuts is just a flash. */
export const SILENT_SLIVER = 0.25

/** The least a kept word keeps when a removed word presses right against it. */
const MIN_GUARD = 0.03
/** A removed word's cut starts this much before its transcribed start, which runs late. */
const DROP_LEAD = 0.03
/** How much of a shortened pause stays after the last word; the rest leads into the next. */
const PAUSE_SPLIT = 0.4
/** How far a word can be heard past its transcribed end, or before its start. */
const MAX_TAIL = 0.25
const MAX_ONSET = 0.15
/** Silence this long inside a word's span is a pause Whisper stretched the word over. */
const STRETCH = 0.5
/** Untranscribed sounds: the shortest that counts, and the longest that can be a filler. */
const MIN_SOUND = 0.1
const MAX_FILLER_SOUND = 0.8
const SOUND_PAD = 0.05
/** Speech has to stand this far above the room tone for the loudness to be trusted. */
const MIN_CONTRAST_DB = 12
/** How far a cut edge that landed on a loud frame may move to find a quiet one. */
const NUDGE = 0.06
const DEFAULT_MAX_PAUSE = 0.4
const EPS = 1e-9

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/* ---------------------------------------------------------------- ranges */

/** Sorted, merged and clipped to [lo, hi]; reversed spans are flipped, empty and NaN ones dropped. */
export function normalizeRanges(ranges: readonly Range[], lo = -Infinity, hi = Infinity): Range[] {
  const spans: Range[] = []
  for (const r of ranges) {
    const start = Math.max(lo, Math.min(r.start, r.end))
    const end = Math.min(hi, Math.max(r.start, r.end))
    if (end > start) spans.push({ start, end })
  }
  spans.sort((a, b) => a.start - b.start)
  const out: Range[] = []
  for (const r of spans) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push(r)
  }
  return out
}

/** `from` with `cut` taken out; both sorted and disjoint. */
export function subtractRanges(from: readonly Range[], cut: readonly Range[]): Range[] {
  const out: Range[] = []
  let j = 0
  for (const r of from) {
    while (j < cut.length && cut[j].end <= r.start) j++
    let start = r.start
    for (let k = j; k < cut.length && cut[k].start < r.end && start < r.end; k++) {
      if (cut[k].start > start) out.push({ start, end: cut[k].start })
      start = Math.max(start, cut[k].end)
    }
    if (start < r.end) out.push({ start, end: r.end })
  }
  return out
}

/** Where both cover; both sorted and disjoint. */
export function intersectRanges(a: readonly Range[], b: readonly Range[]): Range[] {
  const out: Range[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i].start, b[j].start)
    const end = Math.min(a[i].end, b[j].end)
    if (end > start) out.push({ start, end })
    if (a[i].end < b[j].end) i++
    else j++
  }
  return out
}

/* --------------------------------------------------------------- fillers */

const FILLER = /^(?:u+h*m+|u+h+|er|e+r+m+|e+h+m+|a+h+|h+m+|m{2,}|m+h+m+|ä+h+m*|ö+h*m+|e+u+h+)$/

/**
 * Hesitation sounds: um, uh, er, erm, ah, hmm, mm, mhm and their spellings
 * (plus German äh/ähm and French euh). Real words that are often filler,
 * like "like", "so" or "you know", are left alone: cutting them blind
 * changes what people said.
 */
export function isFiller(text: string): boolean {
  const bare = text.toLowerCase().replace(/[^\p{L}]/gu, '')
  return bare.length > 0 && FILLER.test(bare)
}

/* -------------------------------------------------------------- loudness */

/** The recording's loudness, with thresholds read off its own room tone and speech. */
interface Levels {
  env: Float32Array
  frame: Seconds
  /** Frames above this have sound in them. */
  loud: number
  /** Frames at or below this are properly quiet. */
  silent: number
  floorDb: number
  spanDb: number
}

const levelCache = new WeakMap<Float32Array, Levels | null>()
const toDb = (x: number) => 20 * Math.log10(Math.max(x, 1e-5))

function levelsOf(analysis: AudioAnalysis | null | undefined): Levels | null {
  if (!analysis || !(analysis.frameDuration > 0) || !(analysis.envelope?.length >= 10)) return null
  const { envelope: env, frameDuration: frame } = analysis
  const cached = levelCache.get(env)
  if (cached !== undefined && (cached === null || cached.frame === frame)) return cached
  const sorted = Float32Array.from(env).sort()
  const at = (q: number) => sorted[Math.floor(q * (sorted.length - 1))]
  const floorDb = toDb(at(0.05))
  const spanDb = toDb(at(0.95)) - floorDb
  // A recording that's loud all the way through (music, wind) says nothing
  // about where the pauses are, so it's ignored rather than half-trusted.
  const levels =
    spanDb >= MIN_CONTRAST_DB
      ? {
          env,
          frame,
          loud: 10 ** ((floorDb + 0.3 * spanDb) / 20),
          silent: 10 ** ((floorDb + 0.2 * spanDb) / 20),
          floorDb,
          spanDb,
        }
      : null
  levelCache.set(env, levels)
  return levels
}

const frameOf = (L: Levels, t: Seconds) => clamp(Math.floor(t / L.frame), 0, L.env.length - 1)

/** Where sound still going at `t` dies away, looking no further than `limit`. */
function soundEndsAfter(L: Levels, t: Seconds, limit: Seconds): Seconds {
  if (!(limit > t)) return t
  let end = t
  let quiet = 0
  // A couple of quiet frames is a consonant, not the end of the word.
  for (let f = frameOf(L, t); f < L.env.length && f * L.frame < limit; f++) {
    if (L.env[f] > L.loud) {
      quiet = 0
      end = (f + 1) * L.frame
    } else if (++quiet >= 3) break
  }
  return clamp(end, t, limit)
}

/** Where sound still going just before `t` began, looking no further back than `limit`. */
function soundStartsBefore(L: Levels, t: Seconds, limit: Seconds): Seconds {
  if (!(limit < t)) return t
  let start = t
  let quiet = 0
  for (let f = frameOf(L, t - EPS); f >= 0 && (f + 1) * L.frame > limit; f--) {
    if (L.env[f] > L.loud) {
      quiet = 0
      start = f * L.frame
    } else if (++quiet >= 3) break
  }
  return clamp(start, limit, t)
}

/** 0 at the room tone, 1 at full speech. */
const loudness = (L: Levels, x: number) => clamp((toDb(x) - L.floorDb) / L.spanDb, 0, 1.5)

/** The quietest moment in [lo, hi], with a nudge towards `prefer` so near-ties stay close to it. */
function quietest(L: Levels, lo: Seconds, hi: Seconds, prefer: Seconds): Seconds {
  let best = clamp(prefer, lo, hi)
  if (!(hi - lo > L.frame)) return best
  let bestScore = Infinity
  for (let f = frameOf(L, lo); f <= frameOf(L, hi); f++) {
    const t = clamp((f + 0.5) * L.frame, lo, hi)
    const score = loudness(L, L.env[f]) + 2 * Math.abs(t - prefer)
    if (score < bestScore) {
      best = t
      bestScore = score
    }
  }
  return best
}

const isLoudAt = (L: Levels, t: Seconds) => L.env[frameOf(L, t)] > L.loud

/** Runs of frames inside [lo, hi] that pass `test`, at least `minLen` long, merging dips shorter than `bridge`. */
function runs(L: Levels, lo: Seconds, hi: Seconds, test: (x: number) => boolean, minLen: Seconds, bridge = 0): Range[] {
  const out: Range[] = []
  const first = Math.max(0, Math.ceil(lo / L.frame - EPS))
  const last = Math.min(L.env.length, Math.floor(hi / L.frame + EPS))
  let start = -1
  for (let f = first; f <= last; f++) {
    const on = f < last && test(L.env[f])
    if (on && start < 0) start = f
    if (!on && start >= 0) {
      const run = { start: start * L.frame, end: f * L.frame }
      const prev = out[out.length - 1]
      if (prev && run.start - prev.end < bridge) prev.end = run.end
      else out.push(run)
      start = -1
    }
  }
  return out.filter((r) => r.end - r.start >= minLen)
}

/* ----------------------------------------------------------------- items */

/** A stretch of sound: a word, part of one, or something Whisper didn't write down. */
interface Item {
  start: Seconds
  end: Seconds
  keep: boolean
  /** For kept items: the automatic cuts stay out of [guardStart, guardEnd]. */
  guardStart: Seconds
  guardEnd: Seconds
}

/** A kept word too short to measure still gets a little core to guard. */
const MIN_CORE = 0.02

function buildItems(words: readonly Word[], edit: EditSettings, duration: Seconds, L: Levels | null): Item[] {
  const spoken = words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({
      start: clamp(w.start, 0, duration),
      // A word that ends before it starts is a point, not a negative span.
      end: clamp(Math.max(w.start, w.end), 0, duration),
      keep: !(w.removed || (edit.removeFillers && isFiller(w.text))),
    }))
    .sort((a, b) => a.start - b.start || a.end - b.end)

  const items: Item[] = []
  // Each word's sound, stretched to where the loudness says it really is.
  const heard = spoken.map((w, i) => {
    if (!L) return { start: w.start, end: w.end }
    const prevEnd = i > 0 ? spoken[i - 1].end : 0
    const nextStart = i + 1 < spoken.length ? spoken[i + 1].start : duration
    return {
      start: soundStartsBefore(L, w.start, Math.max(prevEnd, w.start - MAX_ONSET)),
      end: soundEndsAfter(L, w.end, Math.min(nextStart, w.end + MAX_TAIL)),
    }
  })

  spoken.forEach((w, i) => {
    let { start, end } = heard[i]
    if (!w.keep) {
      items.push({ start, end, keep: false, guardStart: start, guardEnd: end })
      return
    }
    if (end - start < MIN_CORE) {
      end = Math.min(duration, start + MIN_CORE)
      start = Math.max(0, end - MIN_CORE)
    }
    const guardStart = Math.min(w.start - PAD_BEFORE, start - MIN_GUARD)
    const guardEnd = Math.max(w.end + PAD_AFTER, end + MIN_GUARD)
    // Whisper sometimes stretches a word across the pause next to it. Real
    // silence that long inside a word is that pause, so the word is split
    // around it and the pause can be shortened like any other.
    const holes = L ? runs(L, start, end, (x) => x <= L.silent, STRETCH) : []
    const pieces = subtractRanges([{ start, end }], holes).filter((p, k, all) => {
      const outer = k === 0 || k === all.length - 1
      return !(outer && all.length > 1 && p.end - p.start < 0.05)
    })
    if (!holes.length || !pieces.length) {
      items.push({ start, end, keep: true, guardStart, guardEnd })
      return
    }
    for (const p of pieces) {
      items.push({
        start: p.start,
        end: p.end,
        keep: true,
        guardStart: p.start === start ? guardStart : p.start - PAD_BEFORE,
        guardEnd: p.end === end ? guardEnd : p.end + PAD_AFTER,
      })
    }
  })

  if (L && spoken.length) items.push(...unwrittenSounds(L, heard, spoken, edit, duration))
  return items.sort((a, b) => a.start - b.start || a.end - b.end)
}

/**
 * Sounds in the gaps between transcribed words. Whisper drops most ums and
 * uhs from its transcript, so a short sound standing alone in a gap is
 * taken for one and cut with the fillers. Anything else is kept as speech,
 * so shortening a pause never slices through the middle of it. A sound
 * that runs straight on from a word belongs to that word.
 */
function unwrittenSounds(
  L: Levels,
  heard: readonly Range[],
  spoken: readonly { keep: boolean }[],
  edit: EditSettings,
  duration: Seconds,
): Item[] {
  const items: Item[] = []
  const touching = 2.5 * L.frame
  for (let i = 0; i <= heard.length; i++) {
    const lo = i === 0 ? 0 : heard[i - 1].end
    const hi = i === heard.length ? duration : heard[i].start
    if (hi - lo < MIN_SOUND) continue
    for (const s of runs(L, lo, hi, (x) => x > L.loud, MIN_SOUND, 0.06)) {
      const owner =
        i > 0 && s.start - lo < touching ? spoken[i - 1] : i < heard.length && hi - s.end < touching ? spoken[i] : null
      const keep = owner ? owner.keep : !(edit.removeFillers && s.end - s.start <= MAX_FILLER_SOUND)
      items.push({ ...s, keep, guardStart: s.start - SOUND_PAD, guardEnd: s.end + SOUND_PAD })
    }
  }
  return items
}

/* ---------------------------------------------------------- forced cuts */

/**
 * Removing a word cuts from just before it up to the next kept word, so the
 * gap it leaves goes too; a run of removed words is one cut. The kept words
 * either side keep their guards when there's room, and their cores always.
 */
function droppedCuts(items: readonly Item[], duration: Seconds, L: Levels | null): Range[] {
  const cuts: Range[] = []
  let prev: Item | null = null
  for (let i = 0; i < items.length; ) {
    if (items[i].keep) {
      if (!prev || items[i].end > prev.end) prev = items[i]
      i++
      continue
    }
    const runStart = items[i].start
    let runEnd = items[i].end
    let j = i
    while (j + 1 < items.length && !items[j + 1].keep) runEnd = Math.max(runEnd, items[++j].end)
    const next = items[j + 1]
    cuts.push({ start: cutBefore(prev, runStart, L), end: next ? cutAfter(next, runEnd, L) : duration })
    i = j + 1
  }
  const cores = items.filter((it) => it.keep).map((it) => ({ start: it.start - MIN_GUARD, end: it.end + MIN_GUARD }))
  return subtractRanges(normalizeRanges(cuts), normalizeRanges(cores))
}

/** Where the cut for a removed word starting at `at` begins, after the kept item `prev`. */
function cutBefore(prev: Item | null, at: Seconds, L: Levels | null): Seconds {
  if (!prev) return L ? quietest(L, at - 0.12, at, at - DROP_LEAD) : at - DROP_LEAD
  if (prev.guardEnd <= at) {
    const prefer = Math.max(prev.guardEnd, at - DROP_LEAD)
    return L ? quietest(L, prev.guardEnd, at, prefer) : prefer
  }
  // Pressed together: the removed word goes, the kept one keeps the gap.
  const hard = prev.end + MIN_GUARD
  return L && at > hard ? quietest(L, hard, at, at) : Math.max(at, hard)
}

/** Where the cut for removed words ending at `at` ends, before the kept item `next`. */
function cutAfter(next: Item, at: Seconds, L: Levels | null): Seconds {
  if (next.guardStart >= at) return L ? quietest(L, at, next.guardStart, next.guardStart) : next.guardStart
  const hard = next.start - MIN_GUARD
  return L && hard > at ? quietest(L, at, hard, at) : Math.min(at, hard)
}

/* ---------------------------------------------------------------- pauses */

type GapKind = 'lead' | 'mid' | 'tail'

function pauseSpans(items: readonly Item[], forced: Range[], win: Range, maxPause: Seconds, L: Levels | null): Range[] {
  const remain = subtractRanges([win], forced)
  const kept = items.filter((it) => it.keep)
  const speech = intersectRanges(normalizeRanges(kept), remain)
  // No speech at all (b-roll, or every word removed): nothing to measure pauses against.
  if (!speech.length) return []
  const guards = normalizeRanges(kept.map((it) => ({ start: it.guardStart, end: it.guardEnd })))
  const out: Range[] = []
  const shorten = (start: Seconds, end: Seconds, kind: GapKind, keepLen: Seconds) => {
    if (end > start) out.push(...shortenGap({ start, end }, kind, keepLen, remain, guards, L))
  }
  shorten(win.start, speech[0].start, 'lead', LEAD_SILENCE)
  for (let i = 0; i + 1 < speech.length; i++) shorten(speech[i].end, speech[i + 1].start, 'mid', maxPause)
  shorten(speech[speech.length - 1].end, win.end, 'tail', TAIL_SILENCE)
  return out
}

/** The guard around `t`, if one covers it. */
function guardAt(guards: readonly Range[], t: Seconds): Range | null {
  let lo = 0
  let hi = guards.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (guards[mid].start <= t) lo = mid + 1
    else hi = mid - 1
  }
  const g = guards[hi]
  return g && g.end >= t ? g : null
}

/**
 * Cuts a pause down to `keepLen`. The pause is measured on what's left of it
 * after the forced cuts, so a removed word inside a pause doesn't leave a
 * long silence behind, and where a forced cut already sits inside the pause
 * the new cut is placed against it: one jump instead of two.
 */
function shortenGap(
  gap: Range,
  kind: GapKind,
  keepLen: Seconds,
  remain: readonly Range[],
  guards: readonly Range[],
  L: Levels | null,
): Range[] {
  const segs = intersectRanges(remain, [gap])
  const total = segs.reduce((n, s) => n + s.end - s.start, 0)
  if (total <= keepLen + MIN_SPAN) return []
  // Positions below are "gap time": how far along the gap's remaining pieces.
  const joins: number[] = []
  let pos = 0
  for (let k = 0; k + 1 < segs.length; k++) joins.push((pos += segs[k].end - segs[k].start))
  const within = (lo: Seconds, hi: Seconds) =>
    segs.reduce((n, s) => n + Math.max(0, Math.min(hi, s.end) - Math.max(lo, s.start)), 0)
  const g0 = kind === 'lead' ? 0 : within(gap.start, guardAt(guards, gap.start)?.end ?? gap.start)
  const g1 = kind === 'tail' ? total : total - within(guardAt(guards, gap.end)?.start ?? gap.end, gap.end)
  if (g1 - g0 < MIN_SPAN) return []

  // Kept pieces either side of a removal: fewer pieces, fewer jump cuts.
  const inside = (lo: number, hi: number) => joins.filter((u) => u > lo + EPS && u < hi - EPS).length
  const pieces = (from: number, to: number) =>
    (from > EPS ? 1 + inside(0, from) : 0) + (to < total - EPS ? 1 + inside(to, total) : 0)
  const best = (candidates: number[], ideal: number, cost: (c: number) => number) => {
    let pick = ideal
    let score = [cost(ideal), 0]
    for (const c of candidates) {
      const s = [cost(c), Math.abs(c - ideal)]
      if (s[0] < score[0] || (s[0] === score[0] && s[1] < score[1])) [pick, score] = [c, s]
    }
    return pick
  }

  let from: number
  let to: number
  if (kind === 'mid') {
    const r = total - keepLen
    if (g1 - g0 <= r) [from, to] = [g0, g1]
    else {
      const fit = (a: number) => clamp(a, g0, g1 - r)
      const ideal = fit(PAUSE_SPLIT * keepLen)
      from = best(joins.flatMap((u) => [fit(u - r), fit(u)]), ideal, (a) => pieces(a, a + r))
      to = from + r
    }
  } else if (kind === 'lead') {
    const ideal = Math.min(total - keepLen, g1)
    ;[from, to] = [0, best(joins.filter((u) => u > ideal && u <= g1), ideal, (x) => pieces(0, x))]
  } else {
    const ideal = Math.max(keepLen, g0)
    ;[from, to] = [best(joins.filter((u) => u >= g0 && u < ideal), ideal, (y) => pieces(y, total)), total]
  }
  if (to - from < MIN_SPAN) return []
  return toSource(segs, from, to, L, sourceAt(segs, g0), sourceAt(segs, g1))
}

/** Gap time to source time. */
function sourceAt(segs: readonly Range[], p: number): Seconds {
  let pos = 0
  for (const s of segs) {
    const len = s.end - s.start
    if (p <= pos + len + EPS) return Math.min(s.end, s.start + Math.max(0, p - pos))
    pos += len
  }
  return segs[segs.length - 1].end
}

/** A removal in gap time as source spans, edges that landed on a click moved somewhere quiet. */
function toSource(segs: readonly Range[], from: number, to: number, L: Levels | null, lo: Seconds, hi: Seconds): Range[] {
  const out: Range[] = []
  const nudge = (t: Seconds, min: Seconds, max: Seconds) =>
    L && isLoudAt(L, t) && max - min > L.frame ? quietest(L, min, max, t) : t
  let pos = 0
  for (const s of segs) {
    const len = s.end - s.start
    const a = Math.max(from, pos)
    const b = Math.min(to, pos + len)
    if (b - a > EPS) {
      let start = a <= pos + EPS ? s.start : s.start + (a - pos)
      let end = b >= pos + len - EPS ? s.end : s.start + (b - pos)
      if (start > s.start) start = nudge(start, Math.max(s.start, lo, start - NUDGE), Math.min(end - MIN_SPAN, start + NUDGE))
      if (end < s.end) end = nudge(end, Math.max(start + MIN_SPAN, end - NUDGE), Math.min(s.end, hi, end + NUDGE))
      out.push({ start, end })
    }
    pos += len
  }
  return out
}

/* ------------------------------------------------------------------ plan */

export interface CutPlan {
  /** The trimmed part of the recording; nothing outside it is kept. */
  window: Range
  /** Cuts that always happen: removed words, fillers and cuts made by hand. */
  forced: Range[]
  /** Shortened pauses, on top of the forced cuts. */
  pauses: Range[]
  /** Where the kept sound is: kept words, and with loudness, untranscribed sounds. */
  speech: Range[]
}

/** Every cut the edit settings call for, before they're turned into keep ranges. */
export function planCuts(
  words: readonly Word[],
  edit: EditSettings,
  duration: Seconds,
  analysis?: AudioAnalysis | null,
): CutPlan {
  const total = Number.isFinite(duration) && duration > 0 ? duration : 0
  const start = clamp(Number.isFinite(edit.trimStart) ? edit.trimStart : 0, 0, total)
  const end = clamp(edit.trimEnd != null && Number.isFinite(edit.trimEnd) ? edit.trimEnd : total, 0, total)
  const window = { start, end: Math.max(start, end) }
  if (window.end - window.start <= 0) return { window, forced: [], pauses: [], speech: [] }
  const L = levelsOf(analysis)
  const items = buildItems(words, edit, total, L)
  const forced = normalizeRanges([...droppedCuts(items, total, L), ...(edit.cuts ?? [])], 0, total)
  const maxPause = Number.isFinite(edit.maxPause) && edit.maxPause >= 0 ? edit.maxPause : DEFAULT_MAX_PAUSE
  return {
    window,
    forced,
    pauses: pauseSpans(items, forced, window, maxPause, L),
    speech: normalizeRanges(items.filter((it) => it.keep)),
  }
}

/**
 * Spans to remove for pauses: every gap between kept speech longer than
 * `edit.maxPause` is shortened to it, keeping a little silence before the
 * first word and after the last. Kept speech means words that aren't
 * removed, aren't fillers being removed and aren't cut by hand, so these
 * spans sit alongside those cuts rather than overlapping them. This doesn't
 * look at `edit.removeSilences`: asking is the caller's call.
 */
export function pauseCuts(
  words: Word[],
  edit: EditSettings,
  duration: Seconds,
  analysis?: AudioAnalysis | null,
): Range[] {
  return normalizeRanges(planCuts(words, edit, duration, analysis).pauses)
}
