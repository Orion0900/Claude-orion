import type { Pixels } from '../core/pixels'
import { CH, glyph, GLYPH_H, smallGlyph, SMALL_H, TRACKING } from '../ui/font'

/** The handheld's screen. Everything is drawn at this size and scaled up. */
export const SCREEN_W = 240
export const SCREEN_H = 160

export type Drawable = Pixels | HTMLCanvasElement

const canvasCache = new WeakMap<Pixels, HTMLCanvasElement>()

/** A Pixels buffer as a canvas, made once and reused. */
export function toCanvas(p: Pixels): HTMLCanvasElement {
  let c = canvasCache.get(p)
  if (c) return c
  c = document.createElement('canvas')
  c.width = p.w
  c.height = p.h
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(p.w, p.h)
  img.data.set(p.data)
  ctx.putImageData(img, 0, 0)
  canvasCache.set(p, c)
  return c
}

const tintCache = new WeakMap<Pixels, Map<string, Pixels>>()

/** The sprite with every opaque pixel replaced by one colour (silhouettes, flashes). */
export function tinted(p: Pixels, color: string): Pixels {
  let byColor = tintCache.get(p)
  if (!byColor) tintCache.set(p, (byColor = new Map()))
  let t = byColor.get(color)
  if (t) return t
  const n = parseInt(color.slice(1), 16)
  const out = { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) }
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue
    out.data[i] = (n >> 16) & 255
    out.data[i + 1] = (n >> 8) & 255
    out.data[i + 2] = n & 255
  }
  byColor.set(color, (t = out))
  return t
}

function isPixels(d: Drawable): d is Pixels {
  return (d as Pixels).data instanceof Uint8ClampedArray && !(d instanceof HTMLCanvasElement)
}

export interface TextStyle {
  color?: string
  /** Shadow colour, or null for none. */
  shadow?: string | null
}

/** Dialog text colours: dark grey on white with a pale shadow. */
export const INK = '#404048'
export const INK_SHADOW = '#d0d0c8'
export const WHITE_INK = '#f8f8f8'
export const WHITE_SHADOW = '#585868'

/** Window frame palettes the player can pick in OPTIONS. */
export const FRAMES = [
  { name: 'LAGOON', dark: '#28507c', mid: '#5898d0', light: '#b8e0f8', fill: '#f8f8f8' },
  { name: 'CORAL', dark: '#8c3048', mid: '#e07888', light: '#f8c8c8', fill: '#fffaf6' },
  { name: 'PALM', dark: '#2c6030', mid: '#68b050', light: '#c8f0a0', fill: '#f8f8f0' },
  { name: 'DUSK', dark: '#403068', mid: '#8068c0', light: '#d0c0f8', fill: '#f8f6ff' },
  { name: 'DRIFTWOOD', dark: '#583820', mid: '#a87848', light: '#e8d0a8', fill: '#fcf8f0' },
] as const

/**
 * Drawing onto the 240×160 screen: sprites, rectangles, the bitmap fonts and
 * window frames. Coordinates are whole screen pixels.
 */
export class Gfx {
  frameStyle = 0
  private readonly atlases = new Map<string, { canvas: HTMLCanvasElement; pos: Map<string, number> }>()

  constructor(readonly ctx: CanvasRenderingContext2D) {
    ctx.imageSmoothingEnabled = false
  }

  clear(color = '#000'): void {
    this.ctx.fillStyle = color
    this.ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
  }

  /** Draws a sprite at (x, y). `alpha` fades it; `flipX` mirrors it. */
  image(d: Drawable, x: number, y: number, o: { flipX?: boolean; alpha?: number } = {}): void {
    const src = isPixels(d) ? toCanvas(d) : d
    const ctx = this.ctx
    const rx = Math.round(x)
    const ry = Math.round(y)
    if (o.alpha !== undefined && o.alpha <= 0) return
    const faded = o.alpha !== undefined && o.alpha < 1
    if (faded) {
      ctx.save()
      ctx.globalAlpha = o.alpha!
    }
    if (o.flipX) {
      ctx.save()
      ctx.translate(rx + src.width, ry)
      ctx.scale(-1, 1)
      ctx.drawImage(src, 0, 0)
      ctx.restore()
    } else ctx.drawImage(src, rx, ry)
    if (faded) ctx.restore()
  }

  /** Draws a sprite stretched to w×h at (x, y), nearest-neighbour. */
  imageScaled(d: Drawable, x: number, y: number, w: number, h: number, o: { flipX?: boolean; alpha?: number } = {}): void {
    if (w <= 0 || h <= 0) return
    const src = isPixels(d) ? toCanvas(d) : d
    const ctx = this.ctx
    ctx.save()
    if (o.alpha !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, o.alpha))
    if (o.flipX) {
      ctx.translate(Math.round(x + w), Math.round(y))
      ctx.scale(-1, 1)
      ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, Math.round(w), Math.round(h))
    } else ctx.drawImage(src, 0, 0, src.width, src.height, Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    ctx.restore()
  }

  /** Draws part of a sprite: the source rectangle (sx, sy, w, h) at (x, y). */
  imagePart(d: Drawable, sx: number, sy: number, w: number, h: number, x: number, y: number): void {
    if (w <= 0 || h <= 0) return
    const src = isPixels(d) ? toCanvas(d) : d
    this.ctx.drawImage(src, sx, sy, w, h, Math.round(x), Math.round(y), w, h)
  }

  /** Fills the whole screen with a colour at some opacity (fades, flashes). */
  overlay(color: string, alpha: number): void {
    if (alpha <= 0) return
    const ctx = this.ctx
    ctx.save()
    ctx.globalAlpha = Math.min(1, alpha)
    ctx.fillStyle = color
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)
    ctx.restore()
  }

  private atlas(color: string, shadow: string | null): { canvas: HTMLCanvasElement; pos: Map<string, number> } {
    const key = `${color}|${shadow ?? ''}`
    let a = this.atlases.get(key)
    if (a) return a
    const chars = FONT_CHARS
    const pos = new Map<string, number>()
    let w = 0
    for (const ch of chars) {
      pos.set(ch, w)
      w += glyph(ch).w + 2
    }
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = GLYPH_H + 1
    const ctx = canvas.getContext('2d')!
    const plot = (ch: string, ox: number, fill: string, dx: number, dy: number) => {
      ctx.fillStyle = fill
      glyph(ch).rows.forEach((row, y) => {
        for (let x = 0; x < row.length; x++) if (row[x] === '#') ctx.fillRect(ox + x + dx, y + dy, 1, 1)
      })
    }
    for (const ch of chars) {
      const ox = pos.get(ch)!
      if (shadow) {
        plot(ch, ox, shadow, 1, 0)
        plot(ch, ox, shadow, 0, 1)
        plot(ch, ox, shadow, 1, 1)
      }
      plot(ch, ox, color, 0, 0)
    }
    a = { canvas, pos }
    this.atlases.set(key, a)
    return a
  }

  /** Draws a line of text with its top-left at (x, y); returns the width drawn. */
  text(str: string, x: number, y: number, s: TextStyle = {}): number {
    const color = s.color ?? INK
    const shadow = s.shadow === undefined ? INK_SHADOW : s.shadow
    const a = this.atlas(color, shadow)
    let cx = Math.round(x)
    const cy = Math.round(y)
    for (const ch of str) {
      const g = glyph(ch)
      const sx = a.pos.get(ch) ?? a.pos.get('?')!
      this.ctx.drawImage(a.canvas, sx, 0, g.w + 1, GLYPH_H + 1, cx, cy, g.w + 1, GLYPH_H + 1)
      cx += g.w + TRACKING
    }
    return cx - Math.round(x) - TRACKING
  }

  /** Right-aligned text ending at x. */
  textRight(str: string, x: number, y: number, s: TextStyle = {}): void {
    let w = 0
    for (const ch of str) w += glyph(ch).w + TRACKING
    this.text(str, x - (w - TRACKING), y, s)
  }

  /** The 3×5 HUD font, no shadow. */
  small(str: string, x: number, y: number, color: string): number {
    const ctx = this.ctx
    ctx.fillStyle = color
    let cx = Math.round(x)
    const cy = Math.round(y)
    for (const ch of str) {
      const g = smallGlyph(ch)
      g.rows.forEach((row, yy) => {
        for (let xx = 0; xx < row.length; xx++) if (row[xx] === '#') ctx.fillRect(cx + xx, cy + yy, 1, 1)
      })
      cx += g.w + 1
    }
    return cx - Math.round(x) - 1
  }

  smallRight(str: string, x: number, y: number, color: string): void {
    let w = 0
    for (const ch of str) w += smallGlyph(ch).w + 1
    this.small(str, x - (w - 1), y, color)
  }

  /**
   * A rounded window with a two-tone frame and a pale fill, in the
   * player's chosen frame style. Minimum 8×8.
   */
  window(x: number, y: number, w: number, h: number, style = this.frameStyle): void {
    const f = FRAMES[style % FRAMES.length]
    const ctx = this.ctx
    x = Math.round(x)
    y = Math.round(y)
    const r = (xx: number, yy: number, ww: number, hh: number, c: string) => {
      ctx.fillStyle = c
      ctx.fillRect(xx, yy, ww, hh)
    }
    // Outer dark line, rounded by skipping the corner pixels.
    r(x + 2, y, w - 4, 1, f.dark)
    r(x + 2, y + h - 1, w - 4, 1, f.dark)
    r(x, y + 2, 1, h - 4, f.dark)
    r(x + w - 1, y + 2, 1, h - 4, f.dark)
    r(x + 1, y + 1, 1, 1, f.dark)
    r(x + w - 2, y + 1, 1, 1, f.dark)
    r(x + 1, y + h - 2, 1, 1, f.dark)
    r(x + w - 2, y + h - 2, 1, 1, f.dark)
    // Mid band, two pixels wide.
    r(x + 2, y + 1, w - 4, 2, f.mid)
    r(x + 2, y + h - 3, w - 4, 2, f.mid)
    r(x + 1, y + 2, 2, h - 4, f.mid)
    r(x + w - 3, y + 2, 2, h - 4, f.mid)
    // Light inner line.
    r(x + 3, y + 3, w - 6, 1, f.light)
    r(x + 3, y + h - 4, w - 6, 1, f.light)
    r(x + 3, y + 3, 1, h - 6, f.light)
    r(x + w - 4, y + 3, 1, h - 6, f.light)
    // Fill.
    r(x + 4, y + 4, w - 8, h - 8, f.fill)
  }

  /** A plain bordered panel for HUD boxes, no frame style. */
  panel(x: number, y: number, w: number, h: number, fill: string, border: string): void {
    this.rect(x + 1, y, w - 2, h, border)
    this.rect(x, y + 1, w, h - 2, border)
    this.rect(x + 1, y + 1, w - 2, h - 2, fill)
  }

  /** The ▶ menu cursor with its shadow. */
  cursor(x: number, y: number): void {
    this.text(CH.cursor, x, y + 1)
  }

  clip(x: number, y: number, w: number, h: number): void {
    this.ctx.save()
    this.ctx.beginPath()
    this.ctx.rect(x, y, w, h)
    this.ctx.clip()
  }

  unclip(): void {
    this.ctx.restore()
  }
}

const FONT_CHARS: string[] = []
for (let c = 32; c < 127; c++) FONT_CHARS.push(String.fromCharCode(c))
FONT_CHARS.push(...Object.values(CH))

export { SMALL_H, GLYPH_H }
