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
  joinsWithoutSpace,
  lerp,
  type Motion,
  pageMotion,
  popBump,
  readsRightToLeft,
  restingMotion,
  swipeProgress,
  wordMotion,
  wordProgress,
} from './layout'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Lines never run wider than this share of the frame width... */
const WRAP = 0.86
/** ...and past this share another line is used if the style allows one. */
const COMFORT = 0.72
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

// Padding around a word or the page, in ems.
const BOX_PAD_X = 0.2
const BOX_PAD_Y = 0.17
const SWIPE_PAD_X = 0.14
const PANEL_PAD_X = 0.55
const PANEL_PAD_Y = 0.36

/** Text as it will be shown (uppercase etc.) — the UI uses it for the transcript and SRT. */
export function displayText(text: string, style: Pick<CaptionStyle, 'uppercase'>): string {
  const clean = text.trim().replace(/\s+/g, ' ')
  return style.uppercase ? clean.toLocaleUpperCase() : clean
}

/* ---- Measuring, cached ---- */

/** What a piece of text measures: its advance, and how far its ink reaches round the alignment point. */
interface Ink {
  width: number
  ascent: number
  descent: number
  left: number
  right: number
}

const MAX_MEASURED = 4000
const measured = new Map<string, Ink>()
const metrics = new Map<string, { cap: number; descent: number }>()
const tints = new Map<string, string>()
let measuredEpoch = -1

/** Throws away measurements made before a webfont finished loading. */
function syncCaches(): void {
  const epoch = fontEpoch()
  if (epoch === measuredEpoch) return
  measuredEpoch = epoch
  measured.clear()
  metrics.clear()
}

/** Measures text in `font`, which must be the context's current font. */
function measure(ctx: Ctx2D, font: string, text: string): Ink {
  const key = font + '\n' + text
  let ink = measured.get(key)
  if (ink === undefined) {
    const m = ctx.measureText(text)
    ink = {
      width: m.width,
      ascent: m.actualBoundingBoxAscent || 0,
      descent: m.actualBoundingBoxDescent || 0,
      left: m.actualBoundingBoxLeft || 0,
      right: m.actualBoundingBoxRight || 0,
    }
    if (measured.size >= MAX_MEASURED) measured.delete(measured.keys().next().value as string)
    measured.set(key, ink)
  }
  return ink
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

/**
 * A neon tube in the given colour: a pale core inside a slightly deeper
 * edge. The deeper edge is what keeps neon readable on bright footage,
 * where the glow itself washes out.
 */
function tint(color: string, part: 'core' | 'edge'): string {
  const key = part + color
  let out = tints.get(key)
  if (out === undefined) {
    out = part === 'core' ? mixColor(color, '#FFFFFF', 0.45) : mixColor(color, '#000000', 0.22)
    if (tints.size > 64) tints.clear()
    tints.set(key, out)
  }
  return out
}

/* ---- Layout, cached per page, style and frame size ---- */

interface WordBox {
  text: string
  width: number
  line: number
  /** Left end of the word on its baseline. */
  x: number
  baseline: number
  /** Middle of the word's capitals: it grows and bounces about this point. */
  cx: number
  cy: number
  /** This frame's motion, rewritten on every draw. dx is a nudge from a growing neighbour. */
  alpha: number
  scale: number
  rise: number
  dx: number
}

interface PageLayout {
  width: number
  height: number
  epoch: number
  /** What the layout was made from, to notice a style or page changed in place. */
  made: Made
  font: string
  px: number
  cap: number
  descent: number
  /** The space before each word (none before the first, nor between Chinese or Japanese words). */
  gaps: number[]
  /** Arabic, Hebrew and the like: words run right to left along each line. */
  rtl: boolean
  words: WordBox[]
  /** The text block, from the cap top of the first line to the baseline of the last. */
  top: number
  bottom: number
  left: number
  right: number
  centerX: number
  centerY: number
  emoji: EmojiLayout | null
}

/** Where the page's emoji goes, worked out from the glyph's real ink so it never sits on the words. */
interface EmojiLayout {
  font: string
  /** Where to draw it (alphabetic baseline, left aligned) so its ink is centred on the origin. */
  offsetX: number
  offsetY: number
  centerY: number
  height: number
}

let layouts = new WeakMap<CaptionStyle, WeakMap<CaptionPage, PageLayout>>()

/** Everything a layout depends on besides the frame size. */
interface Made {
  font: CaptionStyle['font']
  weight: number
  size: number
  uppercase: boolean
  strokeWidth: number
  highlight: CaptionStyle['highlight']
  background: CaptionStyle['background']
  maxLines: number
  position: number
  emojis: boolean
  emoji: string | null
  words: CaptionPage['words']
  count: number
  first: string
}

function madeOf(style: CaptionStyle, page: CaptionPage): Made {
  const { font, weight, size, uppercase, strokeWidth, highlight, background, maxLines, position, emojis } = style
  const words = page.words
  return {
    font,
    weight,
    size,
    uppercase,
    strokeWidth,
    highlight,
    background,
    maxLines,
    position,
    emojis,
    emoji: page.emoji,
    words,
    count: words.length,
    first: words[0]?.text ?? '',
  }
}

/** Layouts are cached by object; this catches a style or page edited in place rather than replaced. */
function stillMatches(made: Made, style: CaptionStyle, page: CaptionPage): boolean {
  return (
    made.font === style.font &&
    made.weight === style.weight &&
    made.size === style.size &&
    made.uppercase === style.uppercase &&
    made.strokeWidth === style.strokeWidth &&
    made.highlight === style.highlight &&
    made.background === style.background &&
    made.maxLines === style.maxLines &&
    made.position === style.position &&
    made.emojis === style.emojis &&
    made.emoji === page.emoji &&
    made.words === page.words &&
    made.count === page.words.length &&
    made.first === (page.words[0]?.text ?? '')
  )
}

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
  if (
    cached &&
    cached.width === width &&
    cached.height === height &&
    cached.epoch === measuredEpoch &&
    stillMatches(cached.made, style, page)
  ) {
    return cached
  }

  const texts = page.words.map((w) => displayText(w.text, style))
  const lineFactor = LINE_HEIGHT[style.font] ?? 1.15
  const basePx = Math.max(6, (Number.isFinite(style.size) ? style.size : 0.07) * Math.min(width, height))
  const pad = padding(style)
  // A space between words, plus both their outlines so neighbours never touch, plus room for a highlight box.
  const gapEm = 2 * Math.max(0, style.strokeWidth) + (style.highlight === 'box' ? 0.06 : 0)
  const maxLines = Math.max(1, Math.round(style.maxLines) || 1)

  let px = basePx
  let font = fontString(style.font, style.weight, px)
  // Chinese and Japanese words run on without a space, keeping only the room their outlines need.
  const spaced = texts.map((text, i) => i > 0 && !joinsWithoutSpace(texts[i - 1], text))
  const spacing = () => {
    const space = measure(ctx, font, ' ').width
    return spaced.map((on, i) => (i === 0 ? 0 : (on ? space : 0) + gapEm * px))
  }
  ctx.font = font
  let inks = texts.map((s) => measure(ctx, font, s))
  let sizes = inks.map((ink) => ink.width)
  let gaps = spacing()
  const breaks = breakLines(sizes, gaps, width * WRAP - 2 * pad * px, maxLines, width * COMFORT - 2 * pad * px)
  const lines = Math.max(1, breaks.starts.length)
  // Also keep a tall block inside the frame (a wide 16:9 frame with very large text).
  const tallest = height * (1 - 2 * SAFE_Y) * 0.8
  const blockEms = 0.75 + (lines - 1) * lineFactor + 2 * pad
  const fit = Math.min(breaks.scale, tallest / (blockEms * basePx))
  if (fit < 1) {
    px = basePx * fit
    font = fontString(style.font, style.weight, px)
    ctx.font = font
    inks = texts.map((s) => measure(ctx, font, s))
    sizes = inks.map((ink) => ink.width)
    gaps = spacing()
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

  const rtl = readsRightToLeft(texts)
  const words: WordBox[] = []
  let left = width / 2
  let right = width / 2
  const starts = breaks.starts.length ? breaks.starts : [0]
  // How far the letters really reach, accents and ascenders included.
  let inkTop = top
  let inkBottom = top + blockHeight
  for (let l = 0; l < starts.length; l++) {
    const from = starts[l]
    const to = l + 1 < starts.length ? starts[l + 1] : texts.length
    for (let i = from; i < to; i++) {
      if (l === 0) inkTop = Math.min(inkTop, top + cap - inks[i].ascent)
      if (l === starts.length - 1) inkBottom = Math.max(inkBottom, top + blockHeight + inks[i].descent)
    }
    let lineWidth = 0
    for (let i = from; i < to; i++) lineWidth += sizes[i] + (i > from ? gaps[i] : 0)
    const lineLeft = (width - lineWidth) / 2
    left = Math.min(left, lineLeft)
    right = Math.max(right, lineLeft + lineWidth)
    const baseline = top + cap + l * lineHeight
    let x = lineLeft
    for (let i = from; i < to; i++) {
      if (i > from) x += gaps[i]
      // Right to left, the first word takes the right-hand end of the line.
      const at = rtl ? 2 * lineLeft + lineWidth - x - sizes[i] : x
      words.push({
        text: texts[i],
        width: sizes[i],
        line: l,
        x: at,
        baseline,
        cx: at + sizes[i] / 2,
        cy: baseline - cap / 2,
        alpha: 1,
        scale: 1,
        rise: 0,
        dx: 0,
      })
      x += sizes[i]
    }
  }

  let emoji: EmojiLayout | null = null
  if (style.emojis && page.emoji) {
    // Above the text and anything drawn round it; below if the text sits too high for that.
    let above = inkTop
    let under = inkBottom
    if (style.background === 'box') {
      above = Math.min(above, top - PANEL_PAD_Y * px)
      under = Math.max(under, top + blockHeight + below + PANEL_PAD_Y * px)
    }
    if (style.highlight === 'box') {
      above = Math.min(above, top - BOX_PAD_Y * px)
      under = Math.max(under, top + blockHeight + BOX_PAD_Y * px)
    }
    const size = Math.round(px * 140) / 100
    const emojiFont = `${size}px ${EMOJI_FONT}`
    ctx.font = emojiFont
    const ink = measure(ctx, emojiFont, page.emoji)
    const ascent = ink.ascent > 0 ? ink.ascent : size * 0.8
    const descent = ink.descent > 0 ? ink.descent : size * 0.1
    const inkWidth = ink.left + ink.right > 0 ? ink.left + ink.right : ink.width
    const h = ascent + descent
    const room = px * 0.24
    let emojiY = above - room - h / 2
    if (emojiY - h / 2 < height * 0.03) emojiY = under + room + h / 2
    emoji = {
      font: emojiFont,
      offsetX: ink.left + ink.right > 0 ? ink.left - inkWidth / 2 : -inkWidth / 2,
      offsetY: (ascent - descent) / 2,
      centerY: emojiY,
      height: h,
    }
  }

  const layout: PageLayout = {
    width,
    height,
    epoch: measuredEpoch,
    made: madeOf(style, page),
    font,
    px,
    cap,
    descent,
    gaps,
    rtl,
    words,
    top,
    bottom: top + blockHeight,
    left,
    right,
    centerX: width / 2,
    centerY,
    emoji,
  }
  byPage.set(page, layout)
  return layout
}

/* ---- Transforms ---- */

type Mat = [number, number, number, number, number, number]

/** p × q: q applied first. */
function mul(p: Mat, q: Mat, out: Mat): Mat {
  const a = p[0] * q[0] + p[2] * q[1]
  const b = p[1] * q[0] + p[3] * q[1]
  const c = p[0] * q[2] + p[2] * q[3]
  const d = p[1] * q[2] + p[3] * q[3]
  const e = p[0] * q[4] + p[2] * q[5] + p[4]
  const f = p[1] * q[4] + p[3] * q[5] + p[5]
  out[0] = a
  out[1] = b
  out[2] = c
  out[3] = d
  out[4] = e
  out[5] = f
  return out
}

/**
 * The transform the page is being drawn with: the caller's, plus the
 * page's entrance. Each word's own motion is composed onto it with
 * setTransform, which is much cheaper than a save/restore per word per
 * layer.
 */
const base: Mat = [1, 0, 0, 1, 0, 0]
const scratchA: Mat = [1, 0, 0, 1, 0, 0]
const scratchB: Mat = [1, 0, 0, 1, 0, 0]
const scratchC: Mat = [1, 0, 0, 1, 0, 0]
const scratchD: Mat = [1, 0, 0, 1, 0, 0]
/** Device pixels per layout pixel: shadow sizes ignore the transform, so they're scaled by hand. */
let unit = 1

function setLocal(ctx: Ctx2D, local: Mat): void {
  const m = mul(base, local, scratchA)
  ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
}

function setMat(out: Mat, a: number, b: number, c: number, d: number, e: number, f: number): Mat {
  out[0] = a
  out[1] = b
  out[2] = c
  out[3] = d
  out[4] = e
  out[5] = f
  return out
}

/** Scales `s` about (cx, cy), then moves by (dx, dy). */
function scaledAbout(s: number, cx: number, cy: number, dx: number, dy: number, out: Mat): Mat {
  out[0] = s
  out[1] = 0
  out[2] = 0
  out[3] = s
  out[4] = cx + dx - s * cx
  out[5] = cy + dy - s * cy
  return out
}

function resetLocal(ctx: Ctx2D): void {
  ctx.setTransform(base[0], base[1], base[2], base[3], base[4], base[5])
}

/** Moves the context onto word i's spot for this frame. */
function placeWord(ctx: Ctx2D, box: WordBox): void {
  if (box.scale === 1 && box.rise === 0 && box.dx === 0) resetLocal(ctx)
  else setLocal(ctx, scaledAbout(box.scale, box.cx, box.cy, box.dx, box.rise, scratchB))
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

/* ---- Fading through a layer ---- */

interface Layer {
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: Ctx2D
}
let layer: Layer | null | undefined

/** A reusable scratch canvas as wide as the target and at least `height` tall, or null where none can be made. */
function layerOf(width: number, height: number): Layer | null {
  if (layer === undefined) {
    layer = null
    try {
      if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height)
        const ctx = canvas.getContext('2d')
        if (ctx) layer = { canvas, ctx }
      } else if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if (ctx) layer = { canvas, ctx }
      }
    } catch {
      layer = null
    }
  }
  if (!layer) return null
  // Grown, never shrunk, so pages of different heights don't reallocate it every time.
  if (layer.canvas.width !== width || layer.canvas.height < height) {
    const tallest = Math.max(height, layer.canvas.height)
    layer.canvas.width = width
    layer.canvas.height = tallest
  }
  return layer
}

/**
 * Draws a page that's fading in. Outlines, shadows and fills are separate
 * layers of paint, so fading each one shows the outline through the
 * letters; instead the page is drawn solid on a scratch canvas and that is
 * faded as one. Returns false where no scratch canvas can be had.
 */
function drawFaded(
  ctx: Ctx2D,
  page: CaptionPage,
  t: number,
  style: CaptionStyle,
  width: number,
  height: number,
  emoji: string | null,
  enter: Motion,
): boolean {
  const target = (ctx as { canvas?: { width: number; height: number } }).canvas
  if (!target || !(target.width > 0 && target.height > 0)) return false
  // Only the band the captions can reach is drawn and copied: a whole
  // 1080x1920 frame would cost far more than the text itself.
  syncCaches()
  const L = layoutPage(ctx, page, style, width, height)
  const reach = L.px * 1.6
  let top = L.top - reach
  let bottom = L.bottom + L.descent + reach
  if (L.emoji) {
    top = Math.min(top, L.emoji.centerY - L.emoji.height - reach)
    bottom = Math.max(bottom, L.emoji.centerY + L.emoji.height + reach)
  }
  const m = ctx.getTransform()
  let y0 = Infinity
  let y1 = -Infinity
  for (const [x, y] of [[0, top], [width, top], [0, bottom], [width, bottom]]) {
    const dy = m.b * x + m.d * y + m.f
    y0 = Math.min(y0, dy)
    y1 = Math.max(y1, dy)
  }
  y0 = Math.max(0, Math.floor(y0))
  y1 = Math.min(target.height, Math.ceil(y1))
  if (y1 <= y0) return true
  const band = y1 - y0
  const scratch = layerOf(target.width, band)
  if (!scratch) return false
  const lctx = scratch.ctx
  lctx.setTransform(1, 0, 0, 1, 0, 0)
  lctx.globalAlpha = 1
  lctx.clearRect(0, 0, target.width, band)
  // The caller's transform, shifted up so the band starts at the layer's top.
  lctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f - y0)
  drawPage(lctx, page, t, style, width, height, emoji, enter, 1)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha *= enter.alpha
  ctx.drawImage(scratch.canvas, 0, 0, target.width, band, 0, y0, target.width, band)
  return true
}

/* ---- Drawing ---- */

const NO_SHADOW = 'rgba(0,0,0,0)'
const pageScratch = restingMotion()
const wordScratch = restingMotion()
const emojiScratch = { ...restingMotion(), angle: 0 }

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
  const enter = pageMotion(style.animation, t - page.start, pageScratch)
  if (enter.alpha <= 0) return
  ctx.save()
  try {
    if (enter.alpha < 1 && drawFaded(ctx, page, t, style, frame.width, frame.height, emoji, enter)) return
    drawPage(ctx, page, t, style, frame.width, frame.height, emoji, enter, ctx.globalAlpha * enter.alpha)
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
  enter: Motion,
  pageAlpha: number,
): void {
  syncCaches()
  const L = layoutPage(ctx, page, style, width, height)
  const words = page.words
  const age = t - page.start
  if (enter.scale !== 1 || enter.rise !== 0) {
    ctx.translate(L.centerX, L.centerY + enter.rise * L.px)
    ctx.scale(enter.scale, enter.scale)
    ctx.translate(-L.centerX, -L.centerY)
  }
  const m = ctx.getTransform()
  base[0] = m.a
  base[1] = m.b
  base[2] = m.c
  base[3] = m.d
  base[4] = m.e
  base[5] = m.f
  unit = Math.hypot(m.a, m.b) || 1

  const ai = activeWordIndex(words, t)
  moveWords(L, words, style, t)

  ctx.globalAlpha = pageAlpha
  if (style.background === 'box') drawPanel(ctx, L, style)
  if (ai >= 0 && style.highlight === 'box') drawBox(ctx, L, words, style, t, ai, pageAlpha)
  if (ai >= 0 && style.highlight === 'underline') drawSwipe(ctx, L, words, style, t, ai, pageAlpha)

  ctx.font = L.font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  // So punctuation lands on the correct side of a right-to-left word; 'left' alignment is unaffected.
  ctx.direction = L.rtl ? 'rtl' : 'ltr'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  const glow = style.glow ? flicker(age) : 0
  // The word being spoken goes on top, so its pop overlaps its neighbours rather than ducking under them.
  drawWords(ctx, L, words, style, t, ai, false, pageAlpha, glow)
  if (ai >= 0) drawWords(ctx, L, words, style, t, ai, true, pageAlpha, glow)
  resetLocal(ctx)
  if (emoji) drawEmoji(ctx, L, emoji, age, pageAlpha)
}

/** Works out each word's motion for this frame. */
function moveWords(L: PageLayout, words: TimedWord[], style: CaptionStyle, t: number): void {
  const outline = Math.max(0, style.strokeWidth) * L.px
  const margin = L.width * 0.02
  const room = L.width - 2 * margin
  const boxes = L.words
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i]
    const word = words[i]
    const motion = wordMotion(style.animation, t - word.start, wordScratch)
    let scale = motion.scale
    if (style.animation === 'pop') scale *= 1 + 0.16 * popBump(t - word.start)
    if (style.highlight === 'scale') {
      const until = i + 1 < words.length ? words[i + 1].start : Infinity
      scale *= 1 + 0.1 * activeLift(t, word.start, until)
    }
    // A word that already fills the line can't grow past the frame.
    if (scale > 1) scale = Math.min(scale, Math.max(1, room / (box.width + 2 * outline)))
    box.alpha = motion.alpha
    box.scale = scale
    box.rise = motion.rise * L.px
    box.dx = 0
  }
  // Lay each line out again from its centre at this frame's sizes, so a
  // growing word pushes its neighbours aside rather than running into them.
  // With bounce, words still to come take no room either, so the line stays
  // centred as each word arrives; typewriter keeps every word in its final
  // place, so nothing already read moves.
  const reflow = style.animation === 'bounce'
  for (let from = 0, to = 0; from < boxes.length; from = to) {
    while (to < boxes.length && boxes[to].line === boxes[from].line) to++
    let total = 0
    let started = false
    for (let i = from; i < to; i++) {
      const box = boxes[i]
      if (reflow && box.alpha <= 0) continue
      const s = reflow ? box.scale : Math.max(1, box.scale)
      if (started) total += L.gaps[i] * Math.min(1, s)
      total += Math.max(0, (box.width + 2 * outline) * s - 2 * outline)
      started = true
    }
    let x = (L.width - total) / 2
    started = false
    for (let i = from; i < to; i++) {
      const box = boxes[i]
      if (reflow && box.alpha <= 0) continue
      const s = reflow ? box.scale : Math.max(1, box.scale)
      if (started) x += L.gaps[i] * Math.min(1, s)
      const taken = Math.max(0, (box.width + 2 * outline) * s - 2 * outline)
      const center = x + taken / 2
      box.dx = (L.rtl ? L.width - center : center) - box.cx
      x += taken
      started = true
    }
  }
  // And nothing gets pushed off the side of the frame.
  for (const box of boxes) {
    const half = (box.width / 2 + outline) * box.scale
    const leftEdge = box.cx + box.dx - half
    const rightEdge = box.cx + box.dx + half
    if (2 * half >= room) box.dx = L.width / 2 - box.cx
    else if (leftEdge < margin) box.dx += margin - leftEdge
    else if (rightEdge > L.width - margin) box.dx -= rightEdge - (L.width - margin)
  }
}

/** The solid colour a word shows in: its highlight, emphasis, or plain colour. */
function wordColor(style: CaptionStyle, word: TimedWord, i: number, ai: number): string {
  const lit = style.highlight === 'color' || style.highlight === 'scale'
  if (lit && i === ai) return style.activeColor
  // Karaoke words stay filled once sung, keywords included, so nothing flashes back as the next word starts.
  if (lit && i < ai && style.animation === 'karaoke') return style.activeColor
  if (word.emphasis) return style.emphasisColor
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
  rtl: boolean,
): string | CanvasGradient {
  const color = wordColor(style, word, i, ai)
  const karaoke = style.animation === 'karaoke' && (style.highlight === 'color' || style.highlight === 'scale')
  if (!karaoke || i !== ai || style.glow) return style.glow ? tint(color, 'core') : color
  const p = wordProgress(t, word.start, word.end)
  if (p >= 1) return style.activeColor
  const from = word.emphasis ? style.emphasisColor : style.textColor
  if (p <= 0) return from
  // A soft edge a fifth of an em wide, so the fill reads as moving rather than stepping.
  const feather = Math.min(0.15, (0.1 * px) / Math.max(1, box.width))
  // Fills the way the script reads.
  const fill = rtl
    ? ctx.createLinearGradient(box.x + box.width, 0, box.x, 0)
    : ctx.createLinearGradient(box.x, 0, box.x + box.width, 0)
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
    ctx.shadowBlur = 0.34 * px * k
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0.05 * px * k
  } else {
    // ...and a tight dark one keeps unoutlined white legible on a white wall.
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = 0.1 * px * k
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0.025 * px * k
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
    ctx.globalAlpha = pageAlpha * L.words[i].alpha
    placeWord(ctx, L.words[i])
  }
  const outlineColor = (i: number) => (style.glow ? tint(wordColor(style, words[i], i, ai), 'edge') : style.strokeColor)
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
          ctx.fillStyle = wordFill(ctx, style, box, words[i], i, ai, t, px, L.rtl)
          ctx.fillText(box.text, box.x, box.baseline)
        }
      }
    }
    clearShadow(ctx)
  }

  // 2. Neon glow: the word's own colour blurred out around it; the spoken word burns brighter.
  if (glow > 0) {
    for (let i = first; i <= last; i++) {
      if (skip(i)) continue
      place(i)
      const box = L.words[i]
      const color = wordColor(style, words[i], i, ai)
      const lit = i === ai && style.highlight !== 'none'
      ctx.globalAlpha = pageAlpha * box.alpha * glow * (lit ? 1 : 0.85)
      ctx.shadowColor = color
      ctx.fillStyle = color
      for (let pass = 0; pass < (lit ? 2 : 1); pass++) {
        ctx.shadowBlur = (pass === 0 ? 0.4 : 0.85) * px * unit * box.scale
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
      ctx.fillStyle = wordFill(ctx, style, box, words[i], i, ai, t, px, L.rtl)
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

/** Where the highlight box sits around word i this frame: x, y, width, height. */
function boxRect(L: PageLayout, style: CaptionStyle, i: number, out: number[]): number[] {
  const box = L.words[i]
  const padX = BOX_PAD_X * L.px
  const padY = BOX_PAD_Y * L.px
  const below = style.uppercase ? 0 : L.descent * 0.7
  out[0] = box.x + box.dx - padX
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
  setLocal(ctx, scaledAbout(scale, cx, cy, 0, 0, scratchB))
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

/**
 * A highlighter stroke swiped behind the word being spoken, crossing it as
 * it's said: a little tilted and slanted at the ends, like a chisel-tip
 * marker.
 */
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
  const top = box.baseline - L.cap * 0.92
  const bottom = box.baseline + (style.uppercase ? 0.16 : 0.22) * px
  const mid = (top + bottom) / 2
  const tilt = -0.03
  const slant = -0.3
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  // Word motion, then a tilt about the swipe's left end, then a slant about its middle line.
  const moved = scaledAbout(box.scale, box.cx, box.cy, box.dx, box.rise, scratchB)
  const tilted = setMat(scratchC, cos, sin, -sin, cos, x - x * cos + mid * sin, mid - x * sin - mid * cos)
  const slanted = setMat(scratchD, 1, 0, slant, 1, -slant * mid, 0)
  setLocal(ctx, mul(moved, mul(tilted, slanted, tilted), moved))
  ctx.globalAlpha = pageAlpha * box.alpha * 0.9
  ctx.fillStyle = style.activeColor
  // Swiped the way the script reads.
  roundRectPath(ctx, L.rtl ? x + full * (1 - p) : x, top, full * p, bottom - top, 0.1 * px)
  ctx.fill()
  resetLocal(ctx)
}

/** The page's emoji, popping in above the text. */
function drawEmoji(ctx: Ctx2D, L: PageLayout, emoji: string, age: number, pageAlpha: number): void {
  const E = L.emoji
  if (!E) return
  const motion = emojiMotion(age, emojiScratch)
  if (motion.alpha <= 0 || motion.scale <= 0) return
  const s = motion.scale
  const cos = Math.cos(motion.angle) * s
  const sin = Math.sin(motion.angle) * s
  setLocal(ctx, setMat(scratchB, cos, sin, -sin, cos, L.centerX, E.centerY + motion.rise * E.height))
  ctx.globalAlpha = pageAlpha * motion.alpha
  ctx.font = E.font
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur = E.height * 0.12 * unit * s
  ctx.shadowOffsetY = E.height * 0.05 * unit * s
  ctx.fillText(emoji, E.offsetX, E.offsetY)
  clearShadow(ctx)
  resetLocal(ctx)
}

/** Forget every cached layout; for tests, and after anything that changes how text measures. */
export function resetCaptionCaches(): void {
  layouts = new WeakMap()
  measured.clear()
  metrics.clear()
  tints.clear()
  measuredEpoch = -1
}
