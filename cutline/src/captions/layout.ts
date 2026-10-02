/**
 * The maths behind the caption renderer, kept free of any canvas so it can
 * be tested on its own: breaking a page into lines, picking the word being
 * spoken, and the easing curves every animation is built from.
 *
 * Every animation here is a pure function of time. The renderer never
 * remembers anything between frames, so a preview scrub and an export land
 * on exactly the same picture for the same t.
 */
import type { CaptionAnimation } from '../lib/types'

export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
export const clamp01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x)
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k

export function easeOutCubic(x: number): number {
  const k = 1 - clamp01(x)
  return 1 - k * k * k
}

/** Runs past 1 and settles back, by roughly 10% with the default overshoot. */
export function easeOutBack(x: number, overshoot = 1.70158): number {
  const k = clamp01(x) - 1
  return 1 + (overshoot + 1) * k * k * k + overshoot * k * k
}

/* ---- Line breaking ---- */

/** The space between words: one for all, or the space before each word (the first's is ignored). */
export type Gaps = number | readonly number[]

const gapBefore = (gap: Gaps, i: number) => (typeof gap === 'number' ? gap : (gap[i] ?? 0))

export interface LineBreaks {
  /** Index of the first word on each line. */
  starts: number[]
  /** Width of each line at the measured size. */
  widths: number[]
  /** What the font has to be scaled by for the widest line to fit; 1 when it already does. */
  scale: number
}

/**
 * Splits words of the given widths into as few lines as fit, never more
 * than `maxLines`, then evens those lines out so a page reads as a block
 * rather than a full line with a straggler under it.
 *
 * Lines are counted against `comfortWidth` (default: `maxWidth`): past it,
 * another line is used if one is allowed, which keeps captions compact and
 * clear of the buttons apps put down the right edge. Only `maxWidth` is a
 * hard limit: when the words can't fit in `maxLines` lines that wide,
 * `scale` says how much smaller to draw them. Widths and gaps scale
 * together, so the same breaks still hold at the smaller size.
 */
export function breakLines(
  widths: readonly number[],
  gap: Gaps,
  maxWidth: number,
  maxLines: number,
  comfortWidth = maxWidth,
): LineBreaks {
  const n = widths.length
  if (n === 0) return { starts: [], widths: [], scale: 1 }
  const limit = Math.max(1, Math.floor(maxLines) || 1)
  const lines = Math.min(greedyLineCount(widths, gap, Math.min(comfortWidth, maxWidth)), limit, n)
  const { starts, lineWidths } = balance(widths, gap, lines)
  let widest = 0
  for (const w of lineWidths) widest = Math.max(widest, w)
  const scale = widest > maxWidth && widest > 0 ? maxWidth / widest : 1
  return { starts, widths: lineWidths, scale }
}

/** How many lines filling each as full as it goes takes; no layout needs fewer. */
export function greedyLineCount(widths: readonly number[], gap: Gaps, maxWidth: number): number {
  if (widths.length === 0) return 0
  let count = 1
  let line = widths[0]
  for (let i = 1; i < widths.length; i++) {
    const g = gapBefore(gap, i)
    if (line + g + widths[i] <= maxWidth + 1e-6) {
      line += g + widths[i]
    } else {
      count++
      line = widths[i]
    }
  }
  return count
}

/**
 * The split into exactly `lines` lines whose widest line is narrowest,
 * ties going to the most even split. A page is a handful of words, so
 * trying every split is cheap.
 */
function balance(widths: readonly number[], gap: Gaps, lines: number): { starts: number[]; lineWidths: number[] } {
  const n = widths.length
  // prefix[k]: the first k words; gaps[k]: the spaces before words 1..k-1.
  const prefix = [0]
  const gaps = [0]
  for (let i = 0; i < n; i++) {
    prefix.push(prefix[i] + widths[i])
    gaps.push(gaps[i] + (i > 0 ? gapBefore(gap, i) : 0))
  }
  const lineWidth = (from: number, to: number) => prefix[to] - prefix[from] + gaps[to] - gaps[from + 1]

  // worst[l][j] / spread[l][j]: best widest line and sum of squared widths
  // for the first j words on l lines; from[l][j] is where that last line starts.
  const worst: number[][] = []
  const spread: number[][] = []
  const from: number[][] = []
  for (let l = 0; l <= lines; l++) {
    worst.push(new Array<number>(n + 1).fill(Infinity))
    spread.push(new Array<number>(n + 1).fill(Infinity))
    from.push(new Array<number>(n + 1).fill(-1))
  }
  worst[0][0] = 0
  spread[0][0] = 0
  for (let l = 1; l <= lines; l++) {
    for (let j = l; j <= n; j++) {
      for (let i = l - 1; i < j; i++) {
        if (worst[l - 1][i] === Infinity) continue
        const w = lineWidth(i, j)
        const wide = Math.max(worst[l - 1][i], w)
        const even = spread[l - 1][i] + w * w
        const better = wide < worst[l][j] - 1e-6 || (Math.abs(wide - worst[l][j]) <= 1e-6 && even < spread[l][j])
        if (better) {
          worst[l][j] = wide
          spread[l][j] = even
          from[l][j] = i
        }
      }
    }
  }
  const starts: number[] = []
  const lineWidths: number[] = []
  let end = n
  for (let l = lines; l >= 1; l--) {
    const start = from[l][end]
    starts.unshift(start)
    lineWidths.unshift(lineWidth(start, end))
    end = start
  }
  return { starts, lineWidths }
}

/* ---- Scripts ---- */

// Chinese, Japanese, Thai, Lao, Myanmar and Khmer don't put spaces between words.
const UNSPACED = /[\u0e00-\u0eff\u1000-\u109f\u1780-\u17ff\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]|[\ud840-\ud87f][\udc00-\udfff]/
const RTL = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufefc]/

/** Whether two neighbouring words run together with no space, as in Chinese or Japanese. */
export function joinsWithoutSpace(before: string, after: string): boolean {
  const last = Array.from(before).pop() ?? ''
  const first = Array.from(after)[0] ?? ''
  return UNSPACED.test(last) && UNSPACED.test(first)
}

/** Whether a page reads right to left (Arabic, Hebrew, Persian, Urdu): most of its words are in such a script. */
export function readsRightToLeft(texts: readonly string[]): boolean {
  let rtl = 0
  for (const text of texts) if (RTL.test(text)) rtl++
  return rtl * 2 > texts.length
}

/* ---- Timing ---- */

/**
 * The word being spoken at t: the last one to have started. Through a
 * pause the highlight rests on the word just said instead of blinking off
 * until the next one. -1 before the first word.
 */
export function activeWordIndex(words: readonly { start: number }[], t: number): number {
  let index = -1
  let latest = -Infinity
  for (let i = 0; i < words.length; i++) {
    const start = words[i].start
    if (start <= t && start >= latest) {
      index = i
      latest = start
    }
  }
  return index
}

/** How far through its own span a word is, 0..1. */
export function wordProgress(t: number, start: number, end: number): number {
  return clamp01((t - start) / Math.max(0.05, end - start))
}

/* ---- Animation curves (ages in seconds) ---- */

export const DURATION = {
  /** Page entrance. */
  enter: 0.16,
  /** A word swelling as it starts. */
  pop: 0.16,
  /** A word bouncing in. */
  bounce: 0.26,
  /** A word typed onto the page. */
  reveal: 0.15,
  /** The highlight box sliding to the next word. */
  glide: 0.11,
  /** The active word growing in 'scale' mode, and shrinking back. */
  lift: 0.18,
  settle: 0.1,
  /** The page's emoji popping in. */
  emoji: 0.34,
} as const

/** Opacity, scale and drop (in ems, positive = below its resting place) of a page or a word. */
export interface Motion {
  alpha: number
  scale: number
  rise: number
}

export const restingMotion = (): Motion => ({ alpha: 1, scale: 1, rise: 0 })

/** How the whole page arrives, `age` seconds after it starts. */
export function pageMotion(animation: CaptionAnimation, age: number, out: Motion = restingMotion()): Motion {
  out.alpha = 1
  out.scale = 1
  out.rise = 0
  switch (animation) {
    case 'pop':
      out.scale = 0.8 + 0.2 * easeOutBack(age / DURATION.enter, 2.4)
      out.alpha = clamp01(age / 0.06)
      break
    case 'fade':
      out.alpha = easeOutCubic(age / 0.18)
      break
    case 'slide':
      out.rise = (1 - easeOutCubic(age / 0.18)) * 0.7
      out.alpha = clamp01(age / 0.12)
      break
    case 'karaoke':
      out.rise = (1 - easeOutCubic(age / DURATION.enter)) * 0.35
      out.alpha = clamp01(age / 0.1)
      break
    // bounce and typewriter bring their words in one at a time instead.
  }
  return out
}

/** Whether words stay hidden until they're spoken. */
export const revealsWords = (animation: CaptionAnimation) => animation === 'typewriter' || animation === 'bounce'

/**
 * How one word arrives, `age` seconds after it's spoken; only typewriter
 * and bounce move words in. Words arrive by growing and rising rather than
 * fading: a half-transparent outlined word shows its outline through its
 * letters, which looks muddy.
 */
export function wordMotion(animation: CaptionAnimation, age: number, out: Motion = restingMotion()): Motion {
  out.alpha = 1
  out.scale = 1
  out.rise = 0
  if (!revealsWords(animation)) return out
  if (age < 0) {
    out.alpha = 0
    return out
  }
  if (animation === 'typewriter') {
    const x = age / DURATION.reveal
    out.scale = 0.7 + 0.3 * easeOutBack(x, 1.4)
    out.rise = (1 - easeOutCubic(x)) * 0.32
  } else {
    const x = age / DURATION.bounce
    out.scale = 0.3 + 0.7 * easeOutBack(x, 3.2)
    out.rise = (1 - easeOutBack(x, 1.8)) * 0.5
  }
  return out
}

/** 0 → 1 → 0 over DURATION.pop: the swell of a word as it's spoken. Rises fast, eases back. */
export function popBump(age: number): number {
  if (age <= 0 || age >= DURATION.pop) return 0
  return Math.sin(Math.PI * Math.sqrt(age / DURATION.pop))
}

/**
 * How far the word spoken over [start, until) has grown in 'scale' mode:
 * springs up to 1 (a touch past it first) and shrinks back once the next
 * word takes over, from wherever it had got to.
 */
export function activeLift(t: number, start: number, until: number): number {
  if (t < start) return 0
  const grown = easeOutBack((Math.min(t, until) - start) / DURATION.lift, 2)
  if (t < until) return grown
  return grown * (1 - easeOutCubic((t - until) / DURATION.settle))
}

/** How far the highlight box has slid from the previous word to the one starting at `start`. */
export function glideProgress(t: number, start: number): number {
  return easeOutCubic((t - start) / DURATION.glide)
}

/** How far a highlighter swipe has crossed its word: snappy on short words, never dragging on long ones. */
export function swipeProgress(t: number, start: number, end: number): number {
  return easeOutCubic((t - start) / clamp(end - start, 0.15, 0.45))
}

/** Brightness of a neon page's glow as it strikes up: a couple of stutters, then steady. */
export function flicker(age: number): number {
  if (age >= 0.2 || age < 0) return 1
  if (age < 0.03) return 0.55
  if (age < 0.06) return 0.12
  if (age < 0.1) return 1
  if (age < 0.13) return 0.35
  return 1
}

/** The page's emoji: pops in with a twist, then bobs gently. Rise is in emoji sizes. */
export function emojiMotion(age: number, out: Motion & { angle: number }): Motion & { angle: number } {
  const x = age / DURATION.emoji
  out.alpha = clamp01(age / 0.08)
  out.scale = Math.max(0, easeOutBack(x, 2.4))
  out.angle = (1 - easeOutCubic(x)) * -0.35
  out.rise = Math.sin(age * 3.4) * -0.035
  return out
}
