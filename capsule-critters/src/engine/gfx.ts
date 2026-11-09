import { CH, CELL, glyph, GLYPH_H, length } from '../ui/font'
import { MONO, PAL, SLOTS, UI_SLOT, type DisplayMode, type Palette } from './palettes'

/** The handheld's screen. Everything is drawn at this size and scaled up. */
export const SCREEN_W = 160
export const SCREEN_H = 144

/** A sprite pixel that isn't drawn. */
export const CLEAR = 255

/**
 * A four-shade image: each pixel is a shade 0 (lightest) to 3 (darkest), or
 * CLEAR. Sprites carry no colour of their own; the palette slot they are
 * drawn with decides what the shades look like.
 */
export interface Sprite {
  readonly w: number
  readonly h: number
  readonly px: Uint8Array
}

export function makeSprite(w: number, h: number, fill = CLEAR): Sprite {
  return { w, h, px: new Uint8Array(w * h).fill(fill) }
}

/** Default letters for sprites written as rows of text. */
export const SHADE_KEY: Readonly<Record<string, number>> = {
  '.': CLEAR,
  ' ': CLEAR,
  '0': 0,
  w: 0,
  '1': 1,
  l: 1,
  '2': 2,
  d: 2,
  '3': 3,
  k: 3,
  '#': 3,
}

/** Builds a sprite from rows of letters: '.' clear, 0–3 (or w l d k) shades. */
export function spriteFromRows(rows: readonly string[], key: Readonly<Record<string, number>> = SHADE_KEY): Sprite {
  const h = rows.length
  const w = Math.max(0, ...rows.map((r) => r.length))
  const s = makeSprite(w, h)
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const v = key[row[x]]
      if (v === undefined) throw new Error(`sprite: unknown letter "${row[x]}"`)
      s.px[y * w + x] = v
    }
  })
  return s
}

export function spriteAt(s: Sprite, x: number, y: number): number {
  return x < 0 || y < 0 || x >= s.w || y >= s.h ? CLEAR : s.px[y * s.w + x]
}

export function setSpritePx(s: Sprite, x: number, y: number, v: number): void {
  if (x >= 0 && y >= 0 && x < s.w && y < s.h) s.px[y * s.w + x] = v
}

const flipCache = new WeakMap<Sprite, Sprite>()

/** The sprite mirrored left to right (cached). */
export function flipped(s: Sprite): Sprite {
  let f = flipCache.get(s)
  if (f) return f
  f = makeSprite(s.w, s.h)
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) f.px[y * s.w + x] = s.px[y * s.w + (s.w - 1 - x)]
  flipCache.set(s, f)
  return f
}

/** Copies `src` onto `dst` at (dx, dy); clear pixels stay see-through. */
export function stamp(dst: Sprite, src: Sprite, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const v = src.px[y * src.w + x]
      if (v !== CLEAR) setSpritePx(dst, dx + x, dy + y, v)
    }
}

/** A sub-rectangle of a sprite. */
export function cropSprite(s: Sprite, x0: number, y0: number, w: number, h: number): Sprite {
  const out = makeSprite(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.px[y * w + x] = spriteAt(s, x0 + x, y0 + y)
  return out
}

/** Whole-number enlargement, each pixel becoming k×k. */
export function scaleSprite(s: Sprite, k: number): Sprite {
  const out = makeSprite(s.w * k, s.h * k)
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) out.px[y * out.w + x] = s.px[Math.floor(y / k) * s.w + Math.floor(x / k)]
  return out
}

export interface DrawOpts {
  /** Palette slot; defaults to Gfx.slot. */
  slot?: number
  flipX?: boolean
  /**
   * Remaps shades before drawing: map[shade] is the shade drawn, or CLEAR to
   * skip it. Used for flashes, silhouettes and coloured text.
   */
  map?: readonly number[]
}

/** Shade maps for common effects. */
export const MAPS = {
  /** Every visible pixel white: the flash when a critter is hit. */
  white: [0, 0, 0, 0],
  /** Every visible pixel black: silhouettes. */
  black: [3, 3, 3, 3],
  invert: [3, 2, 1, 0],
  /** One shade lighter. */
  lighter: [0, 0, 1, 2],
  darker: [1, 2, 3, 3],
} as const

/**
 * Drawing onto the 160×144 screen. Every pixel stores a shade and the palette
 * slot it was drawn with; `present` turns that into colour. Coordinates are
 * whole screen pixels.
 */
export class Gfx {
  readonly shade = new Uint8Array(SCREEN_W * SCREEN_H)
  readonly slots = new Uint8Array(SCREEN_W * SCREEN_H)
  /** The slot used by draws that don't name one. */
  slot = 0
  /** The palette in each slot, for COLOR mode. */
  readonly pals: Palette[] = Array.from({ length: SLOTS }, () => PAL.ui)
  mode: DisplayMode = 'COLOR'
  /**
   * Handheld-style fades, in whole steps: −1..−3 wash toward white, 1..3
   * darken toward black. Applied when the frame is shown.
   */
  fade = 0
  /** Shows the frame with its shades reversed (a flash). */
  invert = false
  /** Whole-screen shake offsets, in pixels. */
  shakeX = 0
  shakeY = 0
  /** Per-row horizontal shifts (the wavy battle transition), or null. */
  rowShift: Int8Array | null = null
  private clips: { x0: number; y0: number; x1: number; y1: number }[] = []
  private cx0 = 0
  private cy0 = 0
  private cx1 = SCREEN_W
  private cy1 = SCREEN_H
  private image: ImageData | null = null

  /** Sets a slot's palette. */
  setPal(slot: number, p: Palette): void {
    this.pals[slot] = p
  }

  clear(shade = 0, slot = this.slot): void {
    this.shade.fill(shade)
    this.slots.fill(slot)
  }

  /** Plots one pixel (clipped). */
  px(x: number, y: number, shade: number, slot = this.slot): void {
    x = Math.round(x)
    y = Math.round(y)
    if (x < this.cx0 || y < this.cy0 || x >= this.cx1 || y >= this.cy1) return
    const i = y * SCREEN_W + x
    this.shade[i] = shade
    this.slots[i] = slot
  }

  rect(x: number, y: number, w: number, h: number, shade: number, slot = this.slot): void {
    const x0 = Math.max(this.cx0, Math.round(x))
    const y0 = Math.max(this.cy0, Math.round(y))
    const x1 = Math.min(this.cx1, Math.round(x + w))
    const y1 = Math.min(this.cy1, Math.round(y + h))
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * SCREEN_W
      this.shade.fill(shade, row + x0, row + x1)
      this.slots.fill(slot, row + x0, row + x1)
    }
  }

  /** A one-pixel rectangle outline. */
  box(x: number, y: number, w: number, h: number, shade: number, slot = this.slot): void {
    this.rect(x, y, w, 1, shade, slot)
    this.rect(x, y + h - 1, w, 1, shade, slot)
    this.rect(x, y, 1, h, shade, slot)
    this.rect(x + w - 1, y, 1, h, shade, slot)
  }

  /** Draws a sprite with its top-left at (x, y). */
  sprite(s: Sprite, x: number, y: number, o: DrawOpts = {}): void {
    const slot = o.slot ?? this.slot
    const map = o.map
    const flip = !!o.flipX
    const ox = Math.round(x)
    const oy = Math.round(y)
    const x0 = Math.max(this.cx0, ox)
    const y0 = Math.max(this.cy0, oy)
    const x1 = Math.min(this.cx1, ox + s.w)
    const y1 = Math.min(this.cy1, oy + s.h)
    for (let yy = y0; yy < y1; yy++) {
      const srow = (yy - oy) * s.w
      const drow = yy * SCREEN_W
      for (let xx = x0; xx < x1; xx++) {
        const sx = flip ? s.w - 1 - (xx - ox) : xx - ox
        let v = s.px[srow + sx]
        if (v === CLEAR) continue
        if (map) {
          v = map[v]
          if (v === CLEAR) continue
        }
        this.shade[drow + xx] = v
        this.slots[drow + xx] = slot
      }
    }
  }

  /** Draws a sprite stretched to w×h (nearest neighbour), for zooms and squashes. */
  spriteScaled(s: Sprite, x: number, y: number, w: number, h: number, o: DrawOpts = {}): void {
    w = Math.round(w)
    h = Math.round(h)
    if (w <= 0 || h <= 0) return
    const slot = o.slot ?? this.slot
    const ox = Math.round(x)
    const oy = Math.round(y)
    for (let yy = 0; yy < h; yy++) {
      const py = oy + yy
      if (py < this.cy0 || py >= this.cy1) continue
      const sy = Math.min(s.h - 1, Math.floor((yy * s.h) / h))
      for (let xx = 0; xx < w; xx++) {
        const px = ox + xx
        if (px < this.cx0 || px >= this.cx1) continue
        let sx = Math.min(s.w - 1, Math.floor((xx * s.w) / w))
        if (o.flipX) sx = s.w - 1 - sx
        let v = s.px[sy * s.w + sx]
        if (v === CLEAR) continue
        if (o.map) {
          v = o.map[v]
          if (v === CLEAR) continue
        }
        const i = py * SCREEN_W + px
        this.shade[i] = v
        this.slots[i] = slot
      }
    }
  }

  /**
   * Draws a line of text with its top-left at (x, y), one 8 px cell per
   * character, in shade `shade` (black by default). Returns the width drawn.
   */
  text(str: string, x: number, y: number, shade = 3, slot = UI_SLOT): number {
    let cx = Math.round(x)
    const cy = Math.round(y)
    for (const ch of str) {
      if (ch !== ' ') {
        const g = glyph(ch)
        for (let gy = 0; gy < g.rows.length && gy < GLYPH_H; gy++) {
          const row = g.rows[gy]
          for (let gx = 0; gx < row.length; gx++) if (row.charCodeAt(gx) === 35) this.px(cx + gx, cy + gy, shade, slot)
        }
      }
      cx += CELL
    }
    return cx - Math.round(x)
  }

  /** Text ending at x (right-aligned). */
  textRight(str: string, x: number, y: number, shade = 3, slot = UI_SLOT): void {
    this.text(str, x - length(str) * CELL, y, shade, slot)
  }

  /** Text centred on x. */
  textCenter(str: string, x: number, y: number, shade = 3, slot = UI_SLOT): void {
    this.text(str, Math.round(x - (length(str) * CELL) / 2), y, shade, slot)
  }

  /**
   * A framed window: a double rule with notched corners around a white fill.
   * Sizes are in pixels; menus keep to multiples of 8 like tiles.
   */
  window(x: number, y: number, w: number, h: number, slot = UI_SLOT): void {
    x = Math.round(x)
    y = Math.round(y)
    this.rect(x, y, w, h, 0, slot)
    // Outer rule, one pixel in from the edge, with the corners cut.
    this.rect(x + 2, y + 1, w - 4, 1, 3, slot)
    this.rect(x + 2, y + h - 2, w - 4, 1, 3, slot)
    this.rect(x + 1, y + 2, 1, h - 4, 3, slot)
    this.rect(x + w - 2, y + 2, 1, h - 4, 3, slot)
    // Inner rule in the mid shade.
    this.rect(x + 3, y + 3, w - 6, 1, 2, slot)
    this.rect(x + 3, y + h - 4, w - 6, 1, 2, slot)
    this.rect(x + 3, y + 3, 1, h - 6, 2, slot)
    this.rect(x + w - 4, y + 3, 1, h - 6, 2, slot)
    // Corner studs.
    for (const [cx, cy] of [
      [x + 1, y + 1],
      [x + w - 2, y + 1],
      [x + 1, y + h - 2],
      [x + w - 2, y + h - 2],
    ])
      this.px(cx, cy, 1, slot)
  }

  /** The ▶ menu cursor; `hollow` for a remembered choice. */
  cursor(x: number, y: number, hollow = false, slot = UI_SLOT): void {
    this.text(hollow ? CH.hollow : CH.cursor, x, y, 3, slot)
  }

  /** Restricts drawing to a rectangle until unclip(); clips nest. */
  clip(x: number, y: number, w: number, h: number): void {
    this.clips.push({ x0: this.cx0, y0: this.cy0, x1: this.cx1, y1: this.cy1 })
    this.cx0 = Math.max(this.cx0, Math.round(x))
    this.cy0 = Math.max(this.cy0, Math.round(y))
    this.cx1 = Math.min(this.cx1, Math.round(x + w))
    this.cy1 = Math.min(this.cy1, Math.round(y + h))
  }

  unclip(): void {
    const c = this.clips.pop()
    if (!c) return
    this.cx0 = c.x0
    this.cy0 = c.y0
    this.cx1 = c.x1
    this.cy1 = c.y1
  }

  /** The colour each pixel would show (0xRRGGBB), for tests and screenshots. */
  colorAt(x: number, y: number): number {
    const i = y * SCREEN_W + x
    return this.lut()[this.slots[i] * 4 + this.shadeOut(this.shade[i])]
  }

  private shadeOut(s: number): number {
    if (this.invert) s = 3 - s
    if (this.fade < 0) return Math.max(0, s + this.fade)
    if (this.fade > 0) return Math.min(3, s + this.fade)
    return s
  }

  private lutCache = new Uint32Array(SLOTS * 4)

  private lut(): Uint32Array {
    const mono = this.mode === 'COLOR' ? null : MONO[this.mode]
    for (let s = 0; s < SLOTS; s++) {
      const p = mono ?? this.pals[s]
      for (let k = 0; k < 4; k++) this.lutCache[s * 4 + k] = p[k]
    }
    return this.lutCache
  }

  /** Shows the frame on a 160×144 canvas. */
  present(ctx: CanvasRenderingContext2D): void {
    if (!this.image) this.image = ctx.createImageData(SCREEN_W, SCREEN_H)
    const out = new Uint32Array(this.image.data.buffer)
    const rgb = this.lut()
    // Little-endian ABGR words, with the shade remap folded in.
    const abgr = new Uint32Array(SLOTS * 4)
    for (let s = 0; s < SLOTS; s++)
      for (let k = 0; k < 4; k++) {
        const c = rgb[s * 4 + this.shadeOut(k)]
        abgr[s * 4 + k] = (0xff << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)
      }
    const sx = Math.round(this.shakeX)
    const sy = Math.round(this.shakeY)
    const shifts = this.rowShift
    const edge = abgr[UI_SLOT * 4 + 3]
    for (let y = 0; y < SCREEN_H; y++) {
      const srcY = y - sy
      const rowShift = shifts ? shifts[y] : 0
      for (let x = 0; x < SCREEN_W; x++) {
        const srcX = x - sx - rowShift
        const o = y * SCREEN_W + x
        if (srcX < 0 || srcY < 0 || srcX >= SCREEN_W || srcY >= SCREEN_H) {
          out[o] = edge
          continue
        }
        const i = srcY * SCREEN_W + srcX
        out[o] = abgr[this.slots[i] * 4 + this.shade[i]]
      }
    }
    ctx.putImageData(this.image, 0, 0)
  }
}
