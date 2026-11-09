/**
 * A small kit for drawing four-shade world art in code: rows of letters for
 * hand-placed pixels, plus rectangles, lines, circles and dithers, and a
 * bridge to the critter canvas for round, lit objects like trees and rocks.
 */
import { CLEAR, makeSprite, setSpritePx, spriteAt, type Sprite } from '../../engine/gfx'
import { Canvas } from '../creatures/canvas'
import { Pal } from '../creatures/kit'
import { toSprite } from '../creatures'

/** Letters for world art rows: '.' 0 · 'o' 1 · 'x' 2 · '#' 3 · '_' clear. */
export const WORLD_KEY: Readonly<Record<string, number>> = {
  '.': 0,
  o: 1,
  x: 2,
  '#': 3,
  _: CLEAR,
  ' ': CLEAR,
}

export function rows(r: readonly string[]): Sprite {
  const h = r.length
  const w = Math.max(...r.map((s) => s.length))
  const s = makeSprite(w, h)
  r.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const v = WORLD_KEY[row[x]]
      if (v === undefined) throw new Error(`world art: unknown letter "${row[x]}"`)
      s.px[y * w + x] = v
    }
  })
  return s
}

/** A mutable sprite with drawing helpers. */
export class Pen {
  readonly s: Sprite

  constructor(w: number, h: number, fill = CLEAR) {
    this.s = makeSprite(w, h, fill)
  }

  static from(src: Sprite): Pen {
    const p = new Pen(src.w, src.h)
    p.s.px.set(src.px)
    return p
  }

  px(x: number, y: number, v: number): this {
    setSpritePx(this.s, Math.round(x), Math.round(y), v)
    return this
  }

  get(x: number, y: number): number {
    return spriteAt(this.s, x, y)
  }

  rect(x: number, y: number, w: number, h: number, v: number): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, v)
    return this
  }

  box(x: number, y: number, w: number, h: number, v: number): this {
    this.rect(x, y, w, 1, v)
    this.rect(x, y + h - 1, w, 1, v)
    this.rect(x, y, 1, h, v)
    this.rect(x + w - 1, y, 1, h, v)
    return this
  }

  hline(x: number, y: number, w: number, v: number): this {
    return this.rect(x, y, w, 1, v)
  }

  vline(x: number, y: number, h: number, v: number): this {
    return this.rect(x, y, 1, h, v)
  }

  /** Checkerboard of two shades. */
  dither(x: number, y: number, w: number, h: number, a: number, b: number): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.px(xx, yy, (xx + yy) % 2 ? a : b)
    return this
  }

  disc(cx: number, cy: number, r: number, v: number): this {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.px(x, y, v)
    return this
  }

  /** Pastes rows of letters at (x, y); '_' leaves pixels alone. */
  paste(x: number, y: number, r: readonly string[]): this {
    r.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const v = WORLD_KEY[row[dx]]
        if (v !== CLEAR && v !== undefined) this.px(x + dx, y + dy, v)
      }
    })
    return this
  }

  /** Pastes a sprite (clear pixels skipped). */
  stamp(src: Sprite, x: number, y: number): this {
    for (let yy = 0; yy < src.h; yy++)
      for (let xx = 0; xx < src.w; xx++) {
        const v = src.px[yy * src.w + xx]
        if (v !== CLEAR) this.px(x + xx, y + yy, v)
      }
    return this
  }

  /** Replaces every pixel of one shade with another. */
  swap(from: number, to: number): this {
    for (let i = 0; i < this.s.px.length; i++) if (this.s.px[i] === from) this.s.px[i] = to
    return this
  }
}

/** Draws with the lit, outlined critter canvas at 1:1 into a w×h sprite. */
export function lit(w: number, h: number, draw: (c: Canvas, p: Pal) => void): Sprite {
  const c = new Canvas(w, h, 'front', { sx: 1, sy: 1, ox: 0, oy: 0 })
  draw(c, new Pal())
  return toSprite(c.finish())
}

/** Copies a sprite shifted by (dx, dy), wrapping around (for animated water). */
export function shifted(src: Sprite, dx: number, dy: number): Sprite {
  const out = makeSprite(src.w, src.h)
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) out.px[y * src.w + x] = src.px[(((y - dy) % src.h + src.h) % src.h) * src.w + (((x - dx) % src.w + src.w) % src.w)]
  return out
}
