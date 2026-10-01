import { fromUpright, toUpright, type FaceFrame } from './frame'
import { dist, median } from './geometry'
import { FACE_OVAL, LM } from './indices'
import type { Vec2 } from './types'

/** RGBA pixels, as a canvas's ImageData holds them. */
export interface Pixels {
  width: number
  height: number
  data: Uint8ClampedArray | Uint8Array
}

/** Luma and the two chroma channels (BT.601), from a bilinear sample. */
export function sampleYCC(px: Pixels, x: number, y: number): [number, number, number] | null {
  if (x < 0 || y < 0 || x > px.width - 1 || y > px.height - 1) return null
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, px.width - 1)
  const y1 = Math.min(y0 + 1, px.height - 1)
  const fx = x - x0
  const fy = y - y0
  const at = (xx: number, yy: number, c: number) => px.data[(yy * px.width + xx) * 4 + c]
  const ch = (c: number) =>
    at(x0, y0, c) * (1 - fx) * (1 - fy) + at(x1, y0, c) * fx * (1 - fy) + at(x0, y1, c) * (1 - fx) * fy + at(x1, y1, c) * fx * fy
  const r = ch(0)
  const g = ch(1)
  const b = ch(2)
  return [0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b]
}

export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export interface HairlineEstimate {
  /** Photo pixels, or null when no hairline could be found. */
  point: Vec2 | null
  /** 0–1: how clearly skin gives way to something else at that line. */
  confidence: number
  /** Hair (a fringe, say) already covers the top of the forehead. */
  covered: boolean
}

/**
 * The face mesh stops short of the hairline, so it's found from the photo:
 * learn the colour of the forehead's skin, then walk up the centre of the
 * forehead until most of a narrow strip no longer matches it.
 */
export function estimateHairline(px: Pixels, lm: readonly Vec2[], frame: FaceFrame): HairlineEstimate {
  const up = (i: number) => toUpright(frame, lm[i])
  const top = up(LM.foreheadTop)
  const brow = up(LM.glabella)
  const h = brow.y - top.y
  const w = dist(up(234), up(454))
  const cx = (top.x + up(LM.forehead).x + brow.x) / 3
  if (!(h > 4) || !(w > 20)) return { point: null, confidence: 0, covered: false }

  const at = (x: number, y: number) => {
    const p = fromUpright(frame, { x, y })
    return sampleYCC(px, p.x, p.y)
  }

  // Skin model from the lower forehead, clear of the brows.
  const skin: [number, number, number][] = []
  for (let i = 0; i <= 14; i++) {
    for (let j = 0; j <= 6; j++) {
      const s = at(cx + (i / 14 - 0.5) * 0.24 * w, top.y + h * (0.3 + 0.45 * (j / 6)))
      if (s) skin.push(s)
    }
  }
  if (skin.length < 20) return { point: null, confidence: 0, covered: false }
  const mY = median(skin.map((s) => s[0]))
  const mCb = median(skin.map((s) => s[1]))
  const mCr = median(skin.map((s) => s[2]))
  const mad = (k: number, m: number) => median(skin.map((s) => Math.abs(s[k] - m)))
  const sY = Math.max(2.5 * mad(0, mY), 12)
  const sCb = Math.max(2.5 * mad(1, mCb), 5)
  const sCr = Math.max(2.5 * mad(2, mCr), 5)
  const distance = (s: [number, number, number]) =>
    Math.hypot((s[0] - mY) / sY, (s[1] - mCb) / sCb, (s[2] - mCr) / sCr)

  /** Fraction of a strip across the forehead at height y that isn't skin; null off the photo. */
  const strip = (y: number): { frac: number; d: number } | null => {
    let off = 0
    let n = 0
    let sum = 0
    for (let i = 0; i <= 20; i++) {
      const s = at(cx + (i / 20 - 0.5) * 0.2 * w, y)
      if (!s) continue
      const d = distance(s)
      n++
      sum += Math.min(d, 8)
      if (d > 3.2) off++
    }
    return n < 12 ? null : { frac: off / n, d: sum / n }
  }

  const step = Math.max(1, h / 120)
  // A fringe over the top of the forehead: the hairline itself is hidden.
  const atTop = strip(top.y + 0.08 * h)
  if (atTop && atTop.frac > 0.5) return { point: null, confidence: 0, covered: true }

  const rows: { y: number; frac: number; d: number }[] = []
  for (let y = top.y; y >= top.y - 1.4 * h; y -= step) {
    const s = strip(y)
    if (!s) break
    rows.push({ y, ...s })
  }
  const hold = Math.max(2, Math.round((0.06 * h) / step))
  const meanFrac = (rs: typeof rows) => (rs.length ? rs.reduce((a, r) => a + r.frac, 0) / rs.length : 0)
  for (let i = 1; i + hold < rows.length; i++) {
    const smooth = (rows[i - 1].frac + rows[i].frac + rows[i + 1].frac) / 3
    if (smooth < 0.55) continue
    if (meanFrac(rows.slice(i, i + hold)) < 0.5) continue
    // Confidence: how cleanly it's skin below the line and not-skin above,
    // judged over wider windows so a soft, wispy edge still counts.
    const above = meanFrac(rows.slice(i, i + 3 * hold))
    const below = meanFrac(rows.slice(Math.max(0, i - 3 * hold), i))
    return {
      point: fromUpright(frame, { x: cx, y: rows[i].y }),
      confidence: Math.max(0, Math.min(1, (above - below - 0.2) / 0.5)),
      covered: false,
    }
  }
  return { point: null, confidence: 0, covered: false }
}

export interface PixelStats {
  hairline: HairlineEstimate
  /** Mean luma over the face, 0–255. */
  brightness: number
  /** Brighter cheek's luma over the darker one's: 1 is evenly lit. */
  sideBalance: number
  /** Fraction of the face blown out to white. */
  clipped: number
  /** Detail at a fixed scale around the eyes and nose: low means blur. */
  sharpness: number
}

/** Everything about the photo itself that the analysis needs, read once. */
export function measurePixels(px: Pixels, lm: readonly Vec2[], frame: FaceFrame): PixelStats {
  const up = (i: number) => toUpright(frame, lm[i])
  const oval = FACE_OVAL.map(up)
  const left = Math.min(...oval.map((p) => p.x))
  const right = Math.max(...oval.map((p) => p.x))
  const topY = Math.min(...oval.map((p) => p.y))
  const bottomY = Math.max(...oval.map((p) => p.y))
  const at = (p: Vec2) => {
    const q = fromUpright(frame, p)
    return sampleYCC(px, q.x, q.y)
  }

  let sum = 0
  let n = 0
  let clipped = 0
  for (let i = 0; i <= 30; i++) {
    for (let j = 0; j <= 30; j++) {
      const p = { x: left + ((right - left) * i) / 30, y: topY + ((bottomY - topY) * j) / 30 }
      if (!pointInPolygon(p, oval)) continue
      const s = at(p)
      if (!s) continue
      sum += s[0]
      n++
      if (s[0] > 250) clipped++
    }
  }

  const patchLuma = (center: Vec2, r: number) => {
    let total = 0
    let count = 0
    for (let i = -4; i <= 4; i++) {
      for (let j = -4; j <= 4; j++) {
        const s = at({ x: center.x + (i / 4) * r, y: center.y + (j / 4) * r })
        if (s) {
          total += s[0]
          count++
        }
      }
    }
    return count ? total / count : 0
  }
  const w = right - left
  const cheekR = patchLuma(up(50), 0.07 * w)
  const cheekL = patchLuma(up(280), 0.07 * w)
  const sideBalance = Math.max(cheekR, cheekL) / Math.max(1, Math.min(cheekR, cheekL))

  // Resample the eyes-and-nose region to a fixed 96×64 grid so the measure
  // means the same thing at any resolution, then take the Laplacian's spread.
  const eR = up(33)
  const eL = up(263)
  const nose = up(LM.subnasale)
  const gw = 96
  const gh = 64
  const grid = new Float64Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const s = at({ x: eR.x + ((eL.x - eR.x) * i) / (gw - 1), y: eR.y - 0.1 * w + ((nose.y - eR.y + 0.1 * w) * j) / (gh - 1) })
      grid[j * gw + i] = s ? s[0] : 0
    }
  }
  let lsum = 0
  let lsq = 0
  let ln = 0
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      const k = j * gw + i
      const lap = grid[k - 1] + grid[k + 1] + grid[k - gw] + grid[k + gw] - 4 * grid[k]
      lsum += lap
      lsq += lap * lap
      ln++
    }
  }
  const sharpness = Math.sqrt(Math.max(0, lsq / ln - (lsum / ln) ** 2))

  return {
    hairline: estimateHairline(px, lm, frame),
    brightness: n ? sum / n : 0,
    sideBalance,
    clipped: n ? clipped / n : 0,
    sharpness,
  }
}
