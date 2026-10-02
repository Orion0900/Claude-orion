/**
 * Draws the animated captions. The live preview and every exported frame
 * both come through drawCaptions, so it has to be quick and give the same
 * picture for the same t every time.
 *
 * Anything that depends only on the page, the style and the frame size
 * (the font, line breaks, where each word sits) is worked out once and
 * cached; a frame is then a little animation maths and a few dozen text
 * draws. Nothing is remembered between frames, so scrubbing backwards or
 * exporting out of order draws exactly what playback would.
 */
import type { CaptionPage, CaptionStyle, FontId, TimedWord } from '../lib/types'
import { mixColor } from './color'
import { fontEpoch, fontString } from './fonts'
import {
  activeLift,
  activeWordIndex,
  breakLines,
  clamp,
  easeOutBack,
  emojiMotion,
  flicker,
  glideProgress,
  lerp,
  pageMotion,
  popBump,
  restingMotion,
  swipeProgress,
  wordMotion,
  wordProgress,
} from './layout'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Lines wrap inside this share of the frame width. */
const WRAP = 0.86
/** Text keeps at least this share of the frame height clear at the top and bottom. */
const SAFE_Y = 0.05
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'

/** Line spacing per face, in ems: the condensed display faces sit tighter. */
const LINE_HEIGHT: Record<FontId, number> = {
  montserrat: 1.12,
  anton: 1.06,
  bangers: 1.04,
  inter: 1.22,
  poppins: 1.16,
  marker: 1.2,
}

/** Text as it will be shown (uppercase etc.) — the UI uses it for the transcript and SRT. */
export function displayText(text: string, style: Pick<CaptionStyle, 'uppercase'>): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  return style.uppercase ? clean.toLocaleUpperCase() : clean
}

/* ---- Measuring, cached ---- */

const MAX_WIDTHS = 4000
const widths = new Map<string, number>()
const metrics = new Map<string, { cap: number; descent: number }>()
const tints = new Map<string, string>()
let measuredEpoch = -1

/** Throws away measurements made before a webfont finished loading. */
function syncCaches(): void {
  const epoch = fontEpoch()
  if (epoch === measuredEpoch) return
  measuredEpoch = epoch
  widths.clear()
  metrics.clear()
}

/** Width of text in `font`, which must be the context's current font. */
function textWidth(ctx: Ctx2D, font: string, text: string): number {
  const key = font + '\n' + text
  let width = widths.get(key)
  if (width === undefined) {
    width = ctx.measureText(text).width
    if (widths.size >= MAX_WIDTHS) widths.delete(widths.keys().next().value as string)
    widths.set(key, width)
  }
  return width
}

/** Cap height and descender depth of `font` (the context's current font). */
function fontMetrics(ctx: Ctx2D, font: string, px: number): { cap: number; descent: number } {
  let m = metrics.get(font)
  if (!m) {
    const cap = ctx.measureText('H').actualBoundingBoxAscent
    const descent = ctx.measureText('gjpqy').actualBoundingBoxDescent
    m = { cap: cap > 0 ? cap : px * 0.7, descent: descent > 0 ? descent : px * 0.2 }
    if (metrics.size > 64) metrics.clear()
    metrics.set(font, m)
  }
  return m
}

/** The pale core of a lit neon tube in the given colour. */
function tint(color: string): string {
  let out = tints.get(color)
  if (out === undefined) {
    out = mixColor(color, '#FFFFFF', 0.62)
    if (tints.size > 64) tints.clear()
    tints.set(color, out)
  }
  return out
}

/* ---- Layout, cached per page, style and frame size ---- */

interface WordBox {
  text: string
  width: number
  /** Left end of the word on its baseline. */
  x: number
  baseline: number
  /** Middle of the word's capitals: it grows and bounces about this point. */
  cx: number
  cy: number
  /** This frame's motion, rewritten on every draw. */
  alpha: number
  scale: number
  rise: number
}

interface PageLayout {
  width: number
  height: number
  epoch: number
  font: string
  px: number
  cap: number
  descent: number
  words: WordBox[]
  /** The text block, from the cap top of the first line to the baseline of the last. */
  top: number
  bottom: number
  left: number
  right: number
  centerX: number
  centerY: number
}

let layouts = new WeakMap<CaptionStyle, WeakMap<CaptionPage, PageLayout>>()

/** Extra room words need around them for this style's outline and highlight, in ems. */
function padding(style: CaptionStyle): number {
  let pad = Math.max(0, style.strokeWidth)
  if (style.highlight === 'box') pad = Math.max(pad, BOX_PAD_X)
  if (style.highlight === 'underline') pad = Math.max(pad, SWIPE_PAD_X)
  if (style.background === 'box') pad = Math.max(pad, PANEL_PAD_X)
  return pad
}

function layoutPage(ctx: Ctx2D, page: CaptionPage, style: CaptionStyle, width: number, height: number): PageLayout {
  let byPage = layouts.get(style)
  if (!byPage) {
    byPage = new WeakMap()
    layouts.set(style, byPage)
  }
  const cached = byPage.get(page)
  if (cached && cached.width === width && cached.height === height && cached.epoch === measuredEpoch) return cached

  const texts = page.words.map((w) => displayText(w.text, style))
  const lineFactor = LINE_HEIGHT[style.font] ?? 1.15
  const basePx = Math.max(6, (Number.isFinite(style.size) ? style.size : 0.07) * Math.min(width, height))
  const pad = padding(style)
  // Words sit a space apart, plus their outlines so neighbours never touch, plus room for a highlight box.
  const gapEm = Math.max(0, style.strokeWidth) + (style.highlight === 'box' ? 0.1 : 0)
  const maxLines = Math.max(1, Math.round(style.maxLines) || 1)

  let px = basePx
  let font = fontString(style.font, style.weight, px)
  ctx.font = font
  let sizes = texts.map((s) => textWidth(ctx, font, s))
  let gap = textWidth(ctx, font, ' ') + gapEm * px
  const breaks = breakLines(sizes, gap, width * WRAP - 2 * pad * px, maxLines)
  const lines = Math.max(1, breaks.starts.length)
  // Also keep a tall block inside the frame (a wide 16:9 frame with very large text).
  const tallest = height * (1 - 2 * SAFE_Y) * 0.8
  const blockEms = 0.75 + (lines - 1) * lineFactor + 2 * pad
  const fit = Math.min(breaks.scale, tallest / (blockEms * basePx))
  if (fit < 1) {
    px = basePx * fit
    font = fontString(style.font, style.weight, px)
    ctx.font = font
    sizes = texts.map((s) => textWidth(ctx, font, s))
    gap = textWidth(ctx, font, ' ') + gapEm * px
  }
  const { cap, descent } = fontMetrics(ctx, font, px)
  const lineHeight = px * lineFactor
  const blockHeight = cap + (lines - 1) * lineHeight
  const below = style.uppercase ? 0 : descent
  const panel = style.background === 'box' ? PANEL_PAD_Y * px : 0
  const lo = height * SAFE_Y + panel + blockHeight / 2
  const hi = height * (1 - SAFE_Y) - panel - below - blockHeight / 2
  const wanted = (Number.isFinite(style.position) ? style.position : 0.66) * height
  const centerY = lo > hi ? height / 2 : clamp(wanted, lo, hi)
  const top = centerY - blockHeight / 2

  const words: WordBox[] = []
  let left = width / 2
  let right = width / 2
  const starts = breaks.starts.length ? breaks.starts : [0]
  for (let l = 0; l < starts.length; l++) {
    const from = starts[l]
    const to = l + 1 < starts.length ? starts[l + 1] : texts.length
    let lineWidth = 0
    for (let i = from; i < to; i++) lineWidth += sizes[i] + (i > from ? gap : 0)
    let x = (width - lineWidth) / 2
    left = Math.min(left, x)
    right = Math.max(right, x + lineWidth)
    const baseline = top + cap + l * lineHeight
    for (let i = from; i < to; i++) {
      words.push({
        text: texts[i],
        width: sizes[i],
        x,
        baseline,
        cx: x + sizes[i] / 2,
        cy: baseline - cap / 2,
        alpha: 1,
        scale: 1,
        rise: 0,
      })
      x += sizes[i] + gap
    }
  }

  const layout: PageLayout = {
    width,
    height,
    epoch: measuredEpoch,
    font,
    px,
    cap,
    descent,
    words,
    top,
    bottom: top + blockHeight,
    left,
    right,
    centerX: width / 2,
    centerY,
  }
  byPage.set(page, layout)
  return layout
}

/* ---- Drawing ---- */

const BOX_PAD_X = 0.17
const BOX_PAD_Y = 0.15
const SWIPE_PAD_X = 0.12
const PANEL_PAD_X = 0.55
const PANEL_PAD_Y = 0.36
const NO_SHADOW = 'rgba(0,0,0,0)'

// The transform drawCaptions found (with the page's entrance applied), so
// each word's own scale can be composed onto it without save/restore.
let mA = 1
let mB = 0
let mC = 0
let mD = 1
let mE = 0
let mF = 0
/** Device pixels per layout pixel: shadow sizes ignore the transform, so they're scaled by hand. */
let unit = 1

const pageScratch = restingMotion()
const wordScratch = restingMotion()
const emojiScratch = { ...restingMotion(), angle: 0 }

/** Sets the transform to the page's, then a local [a b c d e f] on top. */
function setLocal(ctx: Ctx2D, a: number, b: number, c: number, d: number, e: number, f: number): void {
  ctx.setTransform(mA * a + mC * b, mB * a + mD * b, mA * c + mC * d, mB * c + mD * d, mA * e + mC * f + mE, mB * e + mD * f + mF)
}

/** Scale `s` about (cx, cy), then move down by `dy`. */
function setScaledAbout(ctx: Ctx2D, s: number, cx: number, cy: number, dy: number): void {
  setLocal(ctx, s, 0, 0, s, cx - s * cx, cy + dy - s * cy)
}

function resetLocal(ctx: Ctx2D): void {
  ctx.setTransform(mA, mB, mC, mD, mE, mF)
}

function roundRectPath(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Draw the page that's on screen at edited time t. No-op for null or when t is outside the page. Leaves ctx state as it found it. */
export function drawCaptions(
  ctx: Ctx2D,
  page: CaptionPage | null,
  t: number,
  style: CaptionStyle,
  frame: { width: number; height: number },
): void {
  if (!page || !(t >= page.start && t < page.end)) return
  if (!(frame.width > 0 && frame.height > 0)) return
  const emoji = style.emojis && page.emoji ? page.emoji : null
  if (page.words.length === 0 && !emoji) return
  ctx.save()
  try {
    drawPage(ctx, page, t, style, frame.width, frame.height, emoji)
  } finally {
    ctx.restore()
  }
}

function drawPage(
  ctx: Ctx2D,
  page: CaptionPage,
  t: number,
  style: CaptionStyle,
  width: number,
  height: number,
  emoji: string | null,
): void {
  syncCaches()
  const L = layoutPage(ctx, page, style, width, height)
  const words = page.words
  const age = t - page.start
  const enter = pageMotion(style.animation, age, pageScratch)
  const pageAlpha = ctx.globalAlpha * enter.alpha
  if (pageAlpha <= 0) return
  if (enter.scale !== 1 || enter.rise !== 0) {
    ctx.translate(L.centerX, L.centerY + enter.rise * L.px)
    ctx.scale(enter.scale, enter.scale)
    ctx.translate(-L.centerX, -L.centerY)
  }
  const m = ctx.getTransform()
  mA = m.a
  mB = m.b
  mC = m.c
  mD = m.d
  mE = m.e
  mF = m.f
  unit = Math.hypot(mA, mB) || 1

  const ai = activeWordIndex(words, t)
  moveWords(L, words, style, t, width)

  ctx.globalAlpha = pageAlpha
  if (style.background === 'box') drawPanel(ctx, L, style)
  if (ai >= 0 && style.highlight === 'box') drawBox(ctx, L, words, style, t, ai, pageAlpha)
  if (ai >= 0 && style.highlight === 'underline') drawSwipe(ctx, L, words, style, t, ai, pageAlpha)

  ctx.font = L.font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const glow = style.glow ? flicker(age) : 0
  // The word being spoken goes on top, so its pop overlaps its neighbours rather than ducking under them.
  drawWords(ctx, L, words, style, t, ai, false, pageAlpha, glow)
  if (ai >= 0) drawWords(ctx, L, words, style, t, ai, true, pageAlpha, glow)
  resetLocal(ctx)
  if (emoji) drawEmoji(ctx, L, style, emoji, age, pageAlpha)
}

/** Works out each word's motion for this frame. */
function moveWords(L: PageLayout, words: TimedWord[], style: CaptionStyle, t: number, width: number): void {
  const outline = Math.max(0, style.strokeWidth) * L.px
  for (let i = 0; i < L.words.length; i++) {
    const box = L.words[i]
    const word = words[i]
    const motion = wordMotion(style.animation, t - word.start, wordScratch)
    let scale = motion.scale
    if (style.animation === 'pop') scale *= 1 + 0.16 * popBump(t - word.start)
    if (style.highlight === 'scale') {
      const until = i + 1 < words.length ? words[i + 1].start : Infinity
      scale *= 1 + 0.1 * activeLift(t, word.start, until)
    }
    if (scale > 1) {
      // Never let a growing word run off the side of the frame.
      const room = Math.min(box.cx - width * 0.02, width * 0.98 - box.cx)
      const half = box.width / 2 + outline
      if (half > 0) scale = Math.min(scale, Math.max(1, room / half))
    }
    box.alpha = motion.alpha
    box.scale = scale
    box.rise = motion.rise * L.px
  }
}

/** The solid colour a word shows in: its highlight, emphasis, or plain colour. */
function wordColor(style: CaptionStyle, word: TimedWord, i: number, ai: number): string {
  const lit = style.highlight === 'color' || style.highlight === 'scale'
  if (lit && i === ai) return style.activeColor
  if (word.emphasis) return style.emphasisColor
  if (lit && i < ai && style.animation === 'karaoke') return style.activeColor
  return style.textColor
}

/** The fill for a word: a karaoke word being sung fills left to right. */
function wordFill(
  ctx: Ctx2D,
  style: CaptionStyle,
  box: WordBox,
  word: TimedWord,
  i: number,
  ai: number,
  t: number,
  px: number,
): string | CanvasGradient {
  const color = wordColor(style, word, i, ai)
  const karaoke = style.animation === 'karaoke' && (style.highlight === 'color' || style.highlight === 'scale')
  if (!karaoke || i !== ai || style.glow) return style.glow ? tint(color) : color
  const p = wordProgress(t, word.start, word.end)
  if (p >= 1) return style.activeColor
  const from = word.emphasis ? style.emphasisColor : style.textColor
  if (p <= 0) return from
  // A soft edge about a fifth of an em wide, so the fill reads as moving rather than stepping.
  const feather = Math.min(0.15, (0.1 * px) / Math.max(1, box.width))
  const fill = ctx.createLinearGradient(box.x, 0, box.x + box.width, 0)
  fill.addColorStop(0, style.activeColor)
  fill.addColorStop(clamp(p - feather, 0, 1), style.activeColor)
  fill.addColorStop(clamp(p + feather, 0, 1), from)
  fill.addColorStop(1, from)
  return fill
}

function setShadow(ctx: Ctx2D, style: CaptionStyle, px: number, k: number, layer: number): void {
  if (style.shadow === 'hard') {
    ctx.shadowColor = style.strokeWidth > 0 ? style.strokeColor : 'rgba(0,0,0,0.85)'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0.055 * px * k
    ctx.shadowOffsetY = 0.075 * px * k
  } else if (layer === 0) {
    // A wide, faint shadow lifts the text off busy footage...
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 0.32 * px * k
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0.05 * px * k
  } else {
    // ...and a tight dark one keeps unoutlined white legible on a white wall.
    ctx.shadowColor = 'rgba(0,0,0,0.55)'
    ctx.shadowBlur = 0.08 * px * k
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0.02 * px * k
  }
}

function clearShadow(ctx: Ctx2D): void {
  ctx.shadowColor = NO_SHADOW
  ctx.shadowBlur = 0
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 0
}

/**
 * Draws either every word but the active one, or just the active one, in
 * layers across all of them (shadow, glow, outline, fill) so no word's
 * outline or shadow ever lands on a neighbour's letters.
 */
function drawWords(
  ctx: Ctx2D,
  L: PageLayout,
  words: TimedWord[],
  style: CaptionStyle,
  t: number,
  ai: number,
  active: boolean,
  pageAlpha: number,
  glow: number,
): void {
  const px = L.px
  const outline = Math.max(0, style.strokeWidth) * px
  const stroked = outline > 0.25
  const shadow = style.shadow !== 'none'
  const first = active ? ai : 0
  const last = active ? ai : L.words.length - 1
  const skip = (i: number) => (!active && i === ai) || L.words[i].alpha <= 0
  const place = (i: number) => {
    const box = L.words[i]
    ctx.globalAlpha = pageAlpha * box.alpha
    if (box.scale === 1 && box.rise === 0) resetLocal(ctx)
    else setScaledAbout(ctx, box.scale, box.cx, box.cy, box.rise)
  }
  const outlineColor = (i: number) => (style.glow ? wordColor(style, words[i], i, ai) : style.strokeColor)
  ctx.lineWidth = outline * 2

  // 1. Shadow. With an outline, the outline casts it; without, the letters do (and that also fills them).
  if (shadow) {
    const layers = stroked || style.shadow === 'hard' ? 1 : 2
    for (let layer = 0; layer < layers; layer++) {
      for (let i = first; i <= last; i++) {
        if (skip(i)) continue
        place(i)
        const box = L.words[i]
        setShadow(ctx, style, px, unit * box.scale, layer)
        if (stroked) {
          ctx.strokeStyle = outlineColor(i)
          ctx.strokeText(box.text, box.x, box.baseline)
        } else {
          ctx.fillStyle = wordFill(ctx, style, box, words[i], i, ai, t, px)
          ctx.fillText(box.text, box.x, box.baseline)
        }
      }
    }
    clearShadow(ctx)
  }

  // 2. Neon glow: the word's own colour, blurred out around it; the spoken word burns brighter.
  if (glow > 0) {
    for (let i = first; i <= last; i++) {
      if (skip(i)) continue
      place(i)
      const box = L.words[i]
      const color = wordColor(style, words[i], i, ai)
      const lit = i === ai && style.highlight !== 'none'
      ctx.globalAlpha = pageAlpha * box.alpha * glow * (lit ? 1 : 0.8)
      ctx.shadowColor = color
      ctx.fillStyle = color
      ctx.strokeStyle = color
      for (let pass = 0; pass < (lit ? 2 : 1); pass++) {
        ctx.shadowBlur = (pass === 0 ? 0.42 : 0.9) * px * unit * box.scale
        if (stroked) ctx.strokeText(box.text, box.x, box.baseline)
        ctx.fillText(box.text, box.x, box.baseline)
      }
    }
    clearShadow(ctx)
  }

  // 3. Outline, unless the shadow layer already drew it.
  if (stroked && (!shadow || glow > 0)) {
    for (let i = first; i <= last; i++) {
      if (skip(i)) continue
      place(i)
      ctx.strokeStyle = outlineColor(i)
      ctx.strokeText(L.words[i].text, L.words[i].x, L.words[i].baseline)
    }
  }

  // 4. Letters, unless an unoutlined shadow layer already filled them and nothing has covered them since.
  if (stroked || !shadow || glow > 0) {
    for (let i = first; i <= last; i++) {
      if (skip(i)) continue
      place(i)
      const box = L.words[i]
      ctx.fillStyle = wordFill(ctx, style, box, words[i], i, ai, t, px)
      ctx.fillText(box.text, box.x, box.baseline)
    }
  }
}

/** The rounded panel behind the whole page. */
function drawPanel(ctx: Ctx2D, L: PageLayout, style: CaptionStyle): void {
  const px = L.px
  const below = style.uppercase ? 0 : L.descent * 0.85
  const x = L.left - PANEL_PAD_X * px
  const y = L.top - PANEL_PAD_Y * px
  const w = L.right - L.left + 2 * PANEL_PAD_X * px
  const h = L.bottom - L.top + below + 2 * PANEL_PAD_Y * px
  resetLocal(ctx)
  ctx.fillStyle = style.backgroundColor
  roundRectPath(ctx, x, y, w, h, 0.38 * px)
  ctx.fill()
}

/** Where the highlight box sits around word i: x, y, width, height. */
function boxRect(L: PageLayout, style: CaptionStyle, i: number, out: number[]): number[] {
  const box = L.words[i]
  const padX = BOX_PAD_X * L.px
  const padY = BOX_PAD_Y * L.px
  const below = style.uppercase ? 0 : L.descent * 0.7
  out[0] = box.x - padX
  out[1] = box.baseline - L.cap - padY + box.rise
  out[2] = box.width + 2 * padX
  out[3] = L.cap + below + 2 * padY
  return out
}

const rectA = [0, 0, 0, 0]
const rectB = [0, 0, 0, 0]

/** A rounded box behind the word being spoken, gliding over from the last one. */
function drawBox(
  ctx: Ctx2D,
  L: PageLayout,
  words: TimedWord[],
  style: CaptionStyle,
  t: number,
  ai: number,
  pageAlpha: number,
): void {
  const since = t - words[ai].start
  const r = boxRect(L, style, ai, rectA)
  let scale = L.words[ai].scale
  let alpha = 1
  const prev = ai - 1
  if (prev >= 0 && L.words[prev].alpha > 0) {
    const k = glideProgress(t, words[ai].start)
    if (k < 1) {
      const p = boxRect(L, style, prev, rectB)
      for (let j = 0; j < 4; j++) r[j] = lerp(p[j], r[j], k)
    }
  } else {
    // First word on the page: the box pops in rather than sliding from nowhere.
    scale *= 0.55 + 0.45 * easeOutBack(since / 0.16, 2)
    alpha = clamp(since / 0.06, 0, 1)
  }
  const cx = r[0] + r[2] / 2
  const cy = r[1] + r[3] / 2
  setScaledAbout(ctx, scale, cx, cy, 0)
  ctx.globalAlpha = pageAlpha * alpha * L.words[ai].alpha
  if (style.shadow !== 'none') {
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 0.25 * L.px * unit * scale
    ctx.shadowOffsetY = 0.06 * L.px * unit * scale
  }
  ctx.fillStyle = style.activeColor
  roundRectPath(ctx, r[0], r[1], r[2], r[3], 0.2 * L.px)
  ctx.fill()
  clearShadow(ctx)
  resetLocal(ctx)
}

/** A highlighter stroke swiped behind the word being spoken, crossing it as it's said. */
function drawSwipe(
  ctx: Ctx2D,
  L: PageLayout,
  words: TimedWord[],
  style: CaptionStyle,
  t: number,
  ai: number,
  pageAlpha: number,
): void {
  const box = L.words[ai]
  const word = words[ai]
  const p = swipeProgress(t, word.start, word.end)
  if (p <= 0 || box.alpha <= 0) return
  const px = L.px
  const padX = SWIPE_PAD_X * px
  const x = box.x - padX
  const full = box.width + 2 * padX
  const top = box.baseline - L.cap * 0.7
  const bottom = box.baseline + (style.uppercase ? 0.14 : 0.2) * px
  // A marker is never quite level.
  const tilt = -0.025
  const cy = (top + bottom) / 2
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  const s = box.scale
  const tx = box.cx - s * box.cx
  const ty = box.cy + box.rise - s * box.cy
  // Page transform, then the word's scale, then the tilt about the swipe's left end.
  setLocal(ctx, s * cos, s * sin, -s * sin, s * cos, s * (x - x * cos + cy * sin) + tx, s * (cy - x * sin - cy * cos) + ty)
  ctx.globalAlpha = pageAlpha * box.alpha * 0.92
  ctx.fillStyle = style.activeColor
  roundRectPath(ctx, x, top, full * p, bottom - top, 0.12 * px)
  ctx.fill()
  resetLocal(ctx)
}

/** The page's emoji, above the text (below it if there's no room). */
function drawEmoji(ctx: Ctx2D, L: PageLayout, style: CaptionStyle, emoji: string, age: number, pageAlpha: number): void {
  const motion = emojiMotion(age, emojiScratch)
  if (motion.alpha <= 0 || motion.scale <= 0) return
  const px = L.px
  const size = px * 1.4
  const panel = style.background === 'box' ? PANEL_PAD_Y * px : 0
  let cy = L.top - panel - px * 0.2 - size * 0.55
  if (cy - size * 0.6 < L.height * 0.03) {
    cy = L.bottom + panel + (style.uppercase ? 0 : L.descent) + px * 0.2 + size * 0.55
  }
  cy += motion.rise * size
  const s = motion.scale
  const cos = Math.cos(motion.angle) * s
  const sin = Math.sin(motion.angle) * s
  setLocal(ctx, cos, sin, -sin, cos, L.centerX, cy)
  ctx.globalAlpha = pageAlpha * motion.alpha
  ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = size * 0.12 * unit * s
  ctx.shadowOffsetY = size * 0.05 * unit * s
  ctx.fillText(emoji, 0, 0)
  clearShadow(ctx)
  resetLocal(ctx)
}

/** Forget every cached layout; for tests, and after anything that changes how text measures. */
export function resetCaptionCaches(): void {
  layouts = new WeakMap()
  widths.clear()
  metrics.clear()
  tints.clear()
  measuredEpoch = -1
}
