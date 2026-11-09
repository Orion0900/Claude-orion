/**
 * A tiny RGBA image type that every piece of art in the game is drawn into.
 * Art is generated in code, pixel by pixel, so it has to be testable in Node
 * with no canvas: these buffers are plain typed arrays, and the engine turns
 * them into canvases once at load.
 *
 * Colours are packed 0xRRGGBBAA numbers. An alpha of 0 is transparent; art is
 * either fully opaque or fully transparent, as on the GBA.
 */
export interface Pixels {
  readonly w: number
  readonly h: number
  /** RGBA, row-major, 4 bytes per pixel. */
  readonly data: Uint8ClampedArray
}

/** A packed 0xRRGGBBAA colour. */
export type Rgba = number

export const CLEAR: Rgba = 0

export function createPixels(w: number, h: number): Pixels {
  return { w, h, data: new Uint8ClampedArray(w * h * 4) }
}

/** '#rgb', '#rrggbb' or '#rrggbbaa' to a packed colour. */
export function hex(s: string): Rgba {
  let h = s.startsWith('#') ? s.slice(1) : s
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  if (h.length === 6) h += 'ff'
  if (h.length !== 8 || !/^[0-9a-f]+$/i.test(h)) throw new Error(`bad colour ${s}`)
  return parseInt(h, 16) >>> 0
}

export function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0
}

export function channels(c: Rgba): [number, number, number, number] {
  return [(c >>> 24) & 255, (c >>> 16) & 255, (c >>> 8) & 255, c & 255]
}

export function inBounds(p: Pixels, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < p.w && y < p.h
}

export function getPx(p: Pixels, x: number, y: number): Rgba {
  if (!inBounds(p, x, y)) return CLEAR
  const i = (y * p.w + x) * 4
  const d = p.data
  return ((d[i] << 24) | (d[i + 1] << 16) | (d[i + 2] << 8) | d[i + 3]) >>> 0
}

/** Writes one pixel; out-of-bounds writes are ignored so shapes can clip freely. */
export function setPx(p: Pixels, x: number, y: number, c: Rgba): void {
  x |= 0
  y |= 0
  if (!inBounds(p, x, y)) return
  const i = (y * p.w + x) * 4
  const d = p.data
  d[i] = c >>> 24
  d[i + 1] = (c >>> 16) & 255
  d[i + 2] = (c >>> 8) & 255
  d[i + 3] = c & 255
}

export function isOpaque(p: Pixels, x: number, y: number): boolean {
  return inBounds(p, x, y) && p.data[(y * p.w + x) * 4 + 3] > 0
}

export function fillRect(p: Pixels, x: number, y: number, w: number, h: number, c: Rgba): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(p, xx, yy, c)
}

export interface BlitOptions {
  flipX?: boolean
  flipY?: boolean
  /** Replace every opaque source pixel with this colour (silhouettes, flashes). */
  tint?: Rgba
}

/** Copies the opaque pixels of `src` onto `dst` at (dx, dy). */
export function blit(dst: Pixels, src: Pixels, dx: number, dy: number, o: BlitOptions = {}): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const sx = o.flipX ? src.w - 1 - x : x
      const sy = o.flipY ? src.h - 1 - y : y
      const c = getPx(src, sx, sy)
      if ((c & 255) === 0) continue
      setPx(dst, dx + x, dy + y, o.tint ?? c)
    }
  }
}

export function clone(p: Pixels): Pixels {
  return { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) }
}

export function flipX(p: Pixels): Pixels {
  const out = createPixels(p.w, p.h)
  blit(out, p, 0, 0, { flipX: true })
  return out
}

export function crop(p: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const out = createPixels(w, h)
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) setPx(out, xx, yy, getPx(p, x + xx, y + yy))
  return out
}

/** Nearest-neighbour upscale by a whole factor. */
export function scale(p: Pixels, k: number): Pixels {
  const out = createPixels(p.w * k, p.h * k)
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) setPx(out, x, y, getPx(p, Math.floor(x / k), Math.floor(y / k)))
  return out
}

/**
 * Pixel art from strings: one string per row, one character per pixel, looked
 * up in `palette`. '.' and ' ' are transparent unless the palette says
 * otherwise. Rows shorter than the widest are padded with transparency.
 */
export function fromRows(rows: readonly string[], palette: Readonly<Record<string, string | Rgba>>): Pixels {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0)
  const out = createPixels(w, rows.length)
  const lut = new Map<string, Rgba>()
  for (const [k, v] of Object.entries(palette)) lut.set(k, typeof v === 'number' ? v : hex(v))
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      const c = lut.get(ch)
      if (c !== undefined) setPx(out, x, y, c)
      else if (ch !== '.' && ch !== ' ') throw new Error(`fromRows: no colour for '${ch}'`)
    }
  })
  return out
}

/**
 * Draws a 1px outline in `c` on every transparent pixel that touches an
 * opaque one (4-neighbour, or 8 with `diagonal`). Grows the art by nothing:
 * leave a pixel of margin if the outline must not clip.
 */
export function outline(p: Pixels, c: Rgba, diagonal = false): Pixels {
  const out = clone(p)
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (isOpaque(p, x, y)) continue
      let touch = isOpaque(p, x - 1, y) || isOpaque(p, x + 1, y) || isOpaque(p, x, y - 1) || isOpaque(p, x, y + 1)
      if (!touch && diagonal)
        touch = isOpaque(p, x - 1, y - 1) || isOpaque(p, x + 1, y - 1) || isOpaque(p, x - 1, y + 1) || isOpaque(p, x + 1, y + 1)
      if (touch) setPx(out, x, y, c)
    }
  }
  return out
}

/** Counts opaque pixels; handy in tests to prove art isn't blank. */
export function opaqueCount(p: Pixels): number {
  let n = 0
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] > 0) n++
  return n
}

/** Distinct opaque colours; tests use it to check art has shading, not flat fills. */
export function colourCount(p: Pixels): number {
  const seen = new Set<number>()
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const c = getPx(p, x, y)
    if ((c & 255) > 0) seen.add(c)
  }
  return seen.size
}

/** Mixes two colours; t = 0 gives a, t = 1 gives b. Alpha comes from a. */
export function mix(a: Rgba, b: Rgba, t: number): Rgba {
  const [ar, ag, ab, aa] = channels(a)
  const [br, bg, bb] = channels(b)
  return rgba(Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t), aa)
}

/** Lightens (amount > 0) toward white or darkens (amount < 0) toward black. */
export function shade(c: Rgba, amount: number): Rgba {
  return amount >= 0 ? mix(c, 0xffffffff, amount) : mix(c, 0x000000ff, -amount)
}
