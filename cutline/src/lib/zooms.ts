/**
 * Automatic punch-ins, on the edited clock. Two kinds: at jump cuts the
 * framing alternates between normal and zoomed, which hides the jump, and
 * on emphasised words the picture punches in fast and settles back.
 */
import type { Seconds, TimedWord, ZoomMark } from './types'

/**
 * A zoom mark that also says how its edges move. Marks that don't say ease
 * in and out; autoZooms sets these on marks that begin or end on a cut.
 */
export interface EasedZoomMark extends ZoomMark {
  /** Jump straight to full zoom at `start`: it's a jump cut. */
  snapIn?: boolean
  /** Drop straight back at `end`: it's a jump cut. */
  snapOut?: boolean
}

/** Zoom-ins start at least this far apart. */
const MIN_INTERVAL = 2.5
/** A zoom lasts at least this long, and the picture rests unzoomed at least this long between zooms. */
const MIN_HOLD = 1.2
const MIN_REST = 0.8
/** A zoomed framing held from one cut this long gives way even if no cut comes to end it. */
const MAX_JUMP_HOLD = 6
/** A punch reaches full zoom over this as the word starts, and settles back over the other. */
const EASE_IN = 0.12
const EASE_OUT = 0.3
/** A punch holds this long past its word. */
const PUNCH_HOLD = 0.9
/** The shortest punch worth doing. */
const MIN_PUNCH = 0.5
/** A cut-to-cut framing change is subtler than a punch. */
const JUMP_SHARE = 0.6
/** With nothing happening for this long, the next sentence gets a gentler punch of its own. */
const QUIET_STRETCH = 6
const QUIET_SHARE = 0.7

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

interface Candidate {
  word: TimedWord
  /** Strong: emphasis, "!" or shouting. Weak: just a new sentence, used to fill long quiet stretches. */
  strong: boolean
}

function candidates(words: readonly TimedWord[]): Candidate[] {
  const out: Candidate[] = []
  words.forEach((word, i) => {
    const text = word.text.trim()
    const letters = text.replace(/[^\p{L}]/gu, '')
    const shouting = letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()
    if (word.emphasis || /!["'”’)]*$/.test(text) || shouting) out.push({ word, strong: true })
    else if (i > 0 && /[.?!…]["'”’)]*$/.test(words[i - 1].text.trim())) out.push({ word, strong: false })
  })
  return out
}

/**
 * Automatic punch-ins: the framing alternates zoomed/unzoomed on jump cuts,
 * and punches land on emphasised words, exclamations and shouted words,
 * with zoom-ins never closer than ~2.5 s. Long stretches with none of those
 * get a gentle punch at a sentence start. Deterministic: the same input
 * always gives the same marks, sorted by start.
 */
export function autoZooms(input: { words: TimedWord[]; cutPoints: Seconds[]; duration: Seconds; strength: number }): ZoomMark[] {
  const { duration } = input
  const strength = Number.isFinite(input.strength) ? Math.max(0, input.strength) : 0
  if (!(duration > 0) || strength <= 0) return []
  const cuts = [...new Set(input.cutPoints)].filter((c) => c > 0 && c < duration).sort((a, b) => a - b)
  const words = [...input.words].filter((w) => Number.isFinite(w.start)).sort((a, b) => a.start - b.start)
  const nextCut = (t: Seconds) => cuts.find((c) => c > t)

  type Event = { t: Seconds; cut: true } | { t: Seconds; cut: false; candidate: Candidate }
  const events: Event[] = [
    ...cuts.map((t): Event => ({ t, cut: true })),
    // A punch is placed by when it starts zooming, a little before its word.
    ...candidates(words).map((candidate): Event => ({ t: candidate.word.start - EASE_IN, cut: false, candidate })),
  ].sort((a, b) => a.t - b.t || Number(b.cut) - Number(a.cut))

  const marks: EasedZoomMark[] = []
  let lastIn = -Infinity
  let lastOut = -Infinity
  let open: EasedZoomMark | null = null

  for (const event of events) {
    if (open && event.t > open.start + MAX_JUMP_HOLD) {
      open.end = open.start + MAX_JUMP_HOLD
      open.snapOut = false
      lastOut = open.end
      open = null
    }
    if (event.cut) {
      const t = event.t
      if (open) {
        if (t - open.start >= MIN_HOLD) {
          open.end = t
          open.snapOut = true
          lastOut = t
          open = null
        }
      } else if (t - lastIn >= MIN_INTERVAL && t - lastOut >= MIN_REST) {
        open = { start: t, end: duration, amount: strength * JUMP_SHARE, snapIn: true, snapOut: true }
        marks.push(open)
        lastIn = t
      }
      continue
    }
    if (open) continue
    const { word, strong } = event.candidate
    // A word that starts right on a cut punches in with the cut.
    const cutAtWord = cuts.find((c) => c >= word.start - EASE_IN - 0.05 && c <= word.start + 0.05)
    const start = Math.max(0, cutAtWord ?? word.start - EASE_IN)
    const gap = strong ? MIN_INTERVAL : QUIET_STRETCH
    if (start - lastIn < gap || start - lastOut < (strong ? MIN_REST : QUIET_STRETCH / 3)) continue
    const settle = Math.min(duration, Math.max(word.end, word.start) + PUNCH_HOLD)
    const cut = nextCut(Math.max(start, word.start) + 0.05)
    const end = cut !== undefined && cut < settle ? cut : settle
    if (end - start < MIN_PUNCH) continue
    marks.push({
      start,
      end,
      amount: strength * (strong ? 1 : QUIET_SHARE),
      snapIn: cutAtWord !== undefined,
      snapOut: end === cut,
    })
    lastIn = start
    lastOut = end
  }
  if (open && open.end > open.start + MAX_JUMP_HOLD) {
    open.end = Math.min(duration, open.start + MAX_JUMP_HOLD)
    open.snapOut = open.end === duration
  }
  return marks
}

const easeOutCubic = (p: number) => 1 - (1 - clamp01(p)) ** 3
const smoothstep = (p: number) => {
  const x = clamp01(p)
  return x * x * (3 - 2 * x)
}

/**
 * Extra scale at edited time t, 0 for none. Marks are half-open,
 * [start, end). Edges ease (a fast ~120 ms in, a softer ~300 ms out)
 * unless the mark snaps there because the edge is a jump cut. Where marks
 * overlap, the bigger zoom wins.
 */
export function zoomAt(marks: ZoomMark[], t: Seconds): number {
  let zoom = 0
  for (const mark of marks as EasedZoomMark[]) {
    if (!(t >= mark.start && t < mark.end) || !(mark.amount > 0)) continue
    const half = (mark.end - mark.start) / 2
    const into = mark.snapIn ? 1 : easeOutCubic((t - mark.start) / Math.min(EASE_IN, half))
    const out = mark.snapOut ? 1 : smoothstep((mark.end - t) / Math.min(EASE_OUT, half))
    zoom = Math.max(zoom, mark.amount * Math.min(into, out))
  }
  return zoom
}
