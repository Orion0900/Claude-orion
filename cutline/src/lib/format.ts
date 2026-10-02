/**
 * Where the picture goes in the finished frame: the output size for each
 * aspect ratio, and the rectangle the source video is drawn into for fill,
 * fit, manual zoom and punch-ins.
 */
import type { AspectId, FormatSettings } from './types'

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const ASPECTS: { id: AspectId; label: string; hint: string }[] = [
  { id: '9:16', label: '9:16', hint: 'TikTok, Reels, Shorts' },
  { id: '4:5', label: '4:5', hint: 'Instagram feed' },
  { id: '1:1', label: '1:1', hint: 'Square' },
  { id: '16:9', label: '16:9', hint: 'YouTube' },
  { id: 'source', label: 'Original', hint: 'As recorded' },
]

/** Width over height, or the source's own when the aspect is 'source'. */
export function aspectRatio(aspect: AspectId, source: Size): number {
  switch (aspect) {
    case '9:16':
      return 9 / 16
    case '4:5':
      return 4 / 5
    case '1:1':
      return 1
    case '16:9':
      return 16 / 9
    case 'source':
      return source.width > 0 && source.height > 0 ? source.width / source.height : 9 / 16
  }
}

/** Encoders want even dimensions; most want multiples of 2 at least. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/**
 * Output size with the shorter side at `shortSide` (1080 for 1080p). An
 * original-aspect export never upscales a small source.
 */
export function outputSize(aspect: AspectId, source: Size, shortSide: number): Size {
  const ratio = aspectRatio(aspect, source)
  let short = shortSide
  if (aspect === 'source') short = Math.min(shortSide, Math.min(source.width, source.height) || shortSide)
  return ratio < 1 ? { width: even(short), height: even(short / ratio) } : { width: even(short * ratio), height: even(short) }
}

/** The largest size worth fitting into `box` while keeping `ratio`, for the on-screen preview. */
export function fitInside(box: Size, ratio: number): Size {
  if (box.width <= 0 || box.height <= 0) return { width: 0, height: 0 }
  return box.width / box.height > ratio
    ? { width: box.height * ratio, height: box.height }
    : { width: box.width, height: box.width / ratio }
}

/**
 * Where to draw a `frame`-sized picture inside `out`.
 *
 * Fill covers the whole frame and crops; fit shows the whole picture. The
 * manual `zoom` scales either up, and the picture is framed on the focus
 * point — the part that should stay in view, usually a face — without ever
 * sliding far enough to show an edge in fill mode.
 *
 * A punch-in (`extra`) then scales about wherever the focus point already is
 * on screen, the way a camera zooms on a face, rather than re-centring it:
 * a jump to the middle of the frame on every punch reads as a glitch.
 */
export function placement(
  frame: Size,
  out: Size,
  format: Pick<FormatSettings, 'fit' | 'zoom' | 'focusX' | 'focusY'>,
  extra = 0,
): Rect {
  if (frame.width <= 0 || frame.height <= 0) return { x: 0, y: 0, width: out.width, height: out.height }
  const cover = Math.max(out.width / frame.width, out.height / frame.height)
  const contain = Math.min(out.width / frame.width, out.height / frame.height)
  const scale = (format.fit === 'fill' ? cover : contain) * Math.max(1, format.zoom)
  const fx = clamp01(format.focusX)
  const fy = clamp01(format.focusY)

  const w0 = frame.width * scale
  const h0 = frame.height * scale
  const x0 = settle(out.width / 2 - fx * w0, w0, out.width)
  const y0 = settle(out.height / 2 - fy * h0, h0, out.height)
  if (!(extra > 0)) return { x: x0, y: y0, width: w0, height: h0 }

  const k = 1 + extra
  const width = w0 * k
  const height = h0 * k
  const x = settle(x0 + fx * w0 - fx * width, width, out.width)
  const y = settle(y0 + fy * h0 - fy * height, height, out.height)
  return { x, y, width, height }
}

/**
 * Keep a picture `size` long flush with a frame `span` long: no gap at either
 * end when it's big enough to cover, centred when it isn't.
 */
function settle(position: number, size: number, span: number): number {
  return size >= span ? Math.min(0, Math.max(span - size, position)) : (span - size) / 2
}

/** True when the picture leaves part of the frame uncovered, so a background has to be drawn. */
export function needsBackground(rect: Rect, out: Size): boolean {
  const eps = 0.5
  return rect.x > eps || rect.y > eps || rect.x + rect.width < out.width - eps || rect.y + rect.height < out.height - eps
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5
}
