/**
 * Small drawing kit shared by the world art: colour ramps with hue shifting,
 * deterministic noise, shape fills, string stamps and tinted outlines. All of
 * it writes straight into Pixels buffers, fully opaque or fully clear.
 */
import { channels, createPixels, getPx, hex, rgba, setPx, type Pixels, type Rgba } from '../../core/pixels'

export type { Pixels, Rgba }
export { createPixels, getPx, setPx, hex }

/** Four tones of one material: highlight, base, shade, deep shade. */
export type Ramp = readonly [Rgba, Rgba, Rgba, Rgba]

export const BLACK = hex('#000000')
export const WHITE = hex('#ffffff')

// ---------------------------------------------------------------- colour

export function toHsl(col: Rgba): [number, number, number] {
  const [r, g, b] = channels(col)
  const rf = r / 255
  const gf = g / 255
  const bf = b / 255
  const max = Math.max(rf, gf, bf)
  const min = Math.min(rf, gf, bf)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rf) h = (gf - bf) / d + (gf < bf ? 6 : 0)
    else if (max === gf) h = (bf - rf) / d + 2
    else h = (rf - gf) / d + 4
    h *= 60
  }
  return [h, s, l]
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export function fromHsl(h: number, s: number, l: number): Rgba {
  h = ((h % 360) + 360) % 360
  s = clamp01(s)
  l = clamp01(l)
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))
  }
  return rgba(Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255))
}

/** Moves hue `h` toward `target` by up to `amount` degrees along the short way. */
function towardHue(h: number, target: number, amount: number): number {
  let d = target - h
  while (d > 180) d -= 360
  while (d < -180) d += 360
  if (Math.abs(d) <= amount) return target
  return h + Math.sign(d) * amount
}

/**
 * A hue-shifted ramp from one base colour: highlights lean warm, shadows lean
 * cool and more saturated, the way hand-picked pixel palettes do.
 */
export function ramp(base: Rgba | string, k = 1): Ramp {
  const col = typeof base === 'string' ? hex(base) : base
  const [h, s, l] = toHsl(col)
  const grey = s < 0.08
  const hiL = Math.min(0.97, l + 0.14 * k)
  const hi = fromHsl(grey ? h : towardHue(h, 55, 9 * k), grey ? s : s + 0.02, hiL)
  const sh = fromHsl(grey ? towardHue(h, 230, 20) : towardHue(h, 245, 8 * k), grey ? Math.max(s, 0.06) : s + 0.05, Math.max(0.08, l - 0.14 * k))
  const dk = fromHsl(grey ? towardHue(h, 235, 25) : towardHue(h, 250, 16 * k), grey ? Math.max(s, 0.1) : s + 0.08, Math.max(0.05, l - 0.28 * k))
  return [hi, col, sh, dk]
}

/** A dark, hue-tinted outline colour for something of colour `col`. */
export function outlineOf(col: Rgba, l = 0.13): Rgba {
  const [h, s] = toHsl(col)
  return fromHsl(h, Math.min(0.5, s * 0.7 + 0.12), l)
}

export function mixc(a: Rgba, b: Rgba, t: number): Rgba {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  return rgba(Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t))
}

export function lighten(c: Rgba, t: number): Rgba {
  return mixc(c, WHITE, t)
}

export function darken(c: Rgba, t: number): Rgba {
  return mixc(c, BLACK, t)
}

// ---------------------------------------------------------------- noise

/** A 32-bit integer hash of up to three integers. */
export function ihash(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** A hash in [0, 1). */
export function hash(x: number, y: number, seed = 0): number {
  return ihash(x, y, seed) / 4294967296
}

/** Deterministic string hash (for looks and colours). */
export function strHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// ---------------------------------------------------------------- shapes

export function px(p: Pixels, x: number, y: number, c: Rgba): void {
  setPx(p, x, y, c)
}

export function rect(p: Pixels, x: number, y: number, w: number, h: number, c: Rgba): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(p, xx, yy, c)
}

export function hline(p: Pixels, x0: number, x1: number, y: number, c: Rgba): void {
  if (x1 < x0) [x0, x1] = [x1, x0]
  for (let x = x0; x <= x1; x++) setPx(p, x, y, c)
}

export function vline(p: Pixels, x: number, y0: number, y1: number, c: Rgba): void {
  if (y1 < y0) [y0, y1] = [y1, y0]
  for (let y = y0; y <= y1; y++) setPx(p, x, y, c)
}

/** Bresenham line. */
export function line(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: Rgba): void {
  x0 = Math.round(x0)
  y0 = Math.round(y0)
  x1 = Math.round(x1)
  y1 = Math.round(y1)
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    setPx(p, x0, y0, c)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}

/** True when pixel (x, y)'s centre lies inside the ellipse. */
export function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean {
  const dx = (x + 0.5 - cx) / rx
  const dy = (y + 0.5 - cy) / ry
  return dx * dx + dy * dy <= 1
}

/** Fills an ellipse centred on (cx, cy) in pixel-edge coordinates. */
export function ellipse(p: Pixels, cx: number, cy: number, rx: number, ry: number, c: Rgba): void {
  const x0 = Math.floor(cx - rx - 1)
  const x1 = Math.ceil(cx + rx + 1)
  const y0 = Math.floor(cy - ry - 1)
  const y1 = Math.ceil(cy + ry + 1)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inEllipse(x, y, cx, cy, rx, ry)) setPx(p, x, y, c)
}

/** Fills pixels inside an ellipse with a colour chosen per pixel. */
export function ellipseBy(
  p: Pixels,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  f: (x: number, y: number, nx: number, ny: number) => Rgba | null,
): void {
  const x0 = Math.floor(cx - rx - 1)
  const x1 = Math.ceil(cx + rx + 1)
  const y0 = Math.floor(cy - ry - 1)
  const y1 = Math.ceil(cy + ry + 1)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny > 1) continue
      const c = f(x, y, nx, ny)
      if (c !== null) setPx(p, x, y, c)
    }
}

// ---------------------------------------------------------------- stamps

export type Pal = Readonly<Record<string, Rgba>>

/**
 * Draws string rows: one character per pixel looked up in `pal`; '.' and ' '
 * (and any character missing from the palette) are skipped.
 */
export function stamp(p: Pixels, rows: readonly string[], pal: Pal, dx: number, dy: number, flip = false): void {
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0)
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.' || ch === ' ') continue
      const c = pal[ch]
      if (c === undefined) continue
      setPx(p, dx + (flip ? w - 1 - x : x), dy + y, c)
    }
  }
}

export function isSet(p: Pixels, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < p.w && y < p.h && p.data[(y * p.w + x) * 4 + 3] > 0
}

/**
 * Adds a 1-px outline around everything opaque, tinted toward the colour it
 * touches and pulled toward `base` by `pull`.
 */
export function outlineTinted(p: Pixels, base: Rgba, pull = 0.45, diagonal = false): Pixels {
  const out = createPixels(p.w, p.h)
  out.data.set(p.data)
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (isSet(p, x, y)) continue
      let src = -1
      const cand = diagonal
        ? [
            [x, y + 1],
            [x, y - 1],
            [x - 1, y],
            [x + 1, y],
            [x - 1, y - 1],
            [x + 1, y - 1],
            [x - 1, y + 1],
            [x + 1, y + 1],
          ]
        : [
            [x, y + 1],
            [x, y - 1],
            [x - 1, y],
            [x + 1, y],
          ]
      for (const [cx, cy] of cand)
        if (isSet(p, cx, cy)) {
          src = getPx(p, cx, cy)
          break
        }
      if (src === -1) continue
      setPx(out, x, y, mixc(outlineOf(src), base, pull))
    }
  return out
}

/** Copies opaque pixels of `src` into `dst` at (dx, dy), optionally mirrored. */
export function paste(dst: Pixels, src: Pixels, dx: number, dy: number, flip = false): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const sx = flip ? src.w - 1 - x : x
      const i = (y * src.w + sx) * 4
      if (src.data[i + 3] === 0) continue
      const tx = dx + x
      const ty = dy + y
      if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue
      const j = (ty * dst.w + tx) * 4
      dst.data[j] = src.data[i]
      dst.data[j + 1] = src.data[i + 1]
      dst.data[j + 2] = src.data[i + 2]
      dst.data[j + 3] = 255
    }
}

export function copyPixels(p: Pixels): Pixels {
  return { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) }
}

/** Replaces every pixel of colour `from` with `to`. */
export function recolor(p: Pixels, from: Rgba, to: Rgba): void {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (getPx(p, x, y) === from) setPx(p, x, y, to)
}

/** A tiny memo for pure functions keyed by string. */
export function memo<T>(limit = 4096): { get(k: string, make: () => T): T } {
  const m = new Map<string, T>()
  return {
    get(k, make) {
      let v = m.get(k)
      if (v === undefined) {
        v = make()
        if (m.size >= limit) m.clear()
        m.set(k, v)
      }
      return v
    },
  }
}
