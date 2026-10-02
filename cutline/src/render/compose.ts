/**
 * One finished frame: background, the picture with its punch-ins, captions,
 * the hook card and the progress bar. The preview and the export both draw
 * through here, so what you see while editing is what you get in the file.
 */
import { drawCaptions } from '../captions/render'
import { needsBackground, placement, type Size } from '../lib/format'
import { pageAt } from '../lib/pages'
import { zoomAt } from '../lib/zooms'
import type { RenderPlan } from './plan'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

/**
 * A blurred copy of the picture behind a fitted video. Canvas `filter` isn't
 * available in Safari, so the blur is the cheap kind: shrink the frame to a
 * few dozen pixels and stretch it back up with smoothing on.
 */
export class BlurBackdrop {
  private small: AnyCanvas | null = null

  draw(ctx: Ctx, frame: CanvasImageSource, frameSize: Size, out: Size): void {
    const ratio = out.width / out.height
    const w = ratio < 1 ? 18 : Math.round(18 * ratio)
    const h = ratio < 1 ? Math.round(18 / ratio) : 18
    if (!this.small || this.small.width !== w || this.small.height !== h) this.small = makeCanvas(w, h)
    const sctx = this.small.getContext('2d') as Ctx | null
    if (!sctx) return
    const cover = Math.max(w / frameSize.width, h / frameSize.height)
    const dw = frameSize.width * cover
    const dh = frameSize.height * cover
    sctx.imageSmoothingEnabled = true
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(frame, (w - dw) / 2, (h - dh) / 2, dw, dh)
    ctx.save()
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.small, 0, 0, out.width, out.height)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.32)'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.restore()
  }
}

export function makeCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export interface FrameScratch {
  blur: BlurBackdrop
}

export const newScratch = (): FrameScratch => ({ blur: new BlurBackdrop() })

export function drawFrame(
  ctx: Ctx,
  frame: CanvasImageSource | null,
  frameSize: Size,
  t: number,
  plan: RenderPlan,
  out: Size,
  scratch: FrameScratch,
): void {
  const { format, style, hook } = plan.project
  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'

  const extra = format.autoZoom ? zoomAt(plan.zooms, t) : 0
  const rect = placement(frameSize, out, format, extra)
  if (!frame || needsBackground(rect, out)) {
    if (frame && format.background === 'blur') {
      scratch.blur.draw(ctx, frame, frameSize, out)
    } else {
      ctx.fillStyle = format.backgroundColor || '#000'
      ctx.fillRect(0, 0, out.width, out.height)
    }
  }
  if (frame) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(frame, rect.x, rect.y, rect.width, rect.height)
  }

  if (plan.showCaptions && !plan.project.captionsOff) {
    drawCaptions(ctx, pageAt(plan.pages, t), t, style, out)
  }
  if (hook.enabled && hook.text.trim() && t < hook.duration) drawHook(ctx, hook.text.trim(), t, hook.duration, out)
  if (format.progressBar && plan.duration > 0) drawProgress(ctx, t / plan.duration, format.progressColor, out)
  ctx.restore()
}

/* ---- The hook card ---- */

const HOOK_FONT = '"Montserrat", "Helvetica Neue", Arial, sans-serif'
const hookLayoutCache = new Map<string, { lines: string[]; size: number }>()

/** The opening title: a white card near the top that pops in and fades away. */
export function drawHook(ctx: Ctx, text: string, t: number, duration: number, out: Size): void {
  const short = Math.min(out.width, out.height)
  const key = `${text}|${out.width}x${out.height}`
  let layout = hookLayoutCache.get(key)
  if (!layout) {
    let size = short * 0.06
    let lines = wrap(ctx, text, size, out.width * 0.78)
    // Long hooks shrink rather than run to five lines.
    while (lines.length > 3 && size > short * 0.035) {
      size *= 0.9
      lines = wrap(ctx, text, size, out.width * 0.78)
    }
    layout = { lines, size }
    if (hookLayoutCache.size > 50) hookLayoutCache.clear()
    hookLayoutCache.set(key, layout)
  }
  const { lines, size } = layout
  const enter = easeOutBack(Math.min(1, t / 0.28))
  const leave = Math.min(1, Math.max(0, (duration - t) / 0.25))
  const alpha = Math.min(1, t / 0.12) * leave
  if (alpha <= 0) return

  ctx.save()
  ctx.font = `800 ${size}px ${HOOK_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const lineHeight = size * 1.18
  const padX = size * 0.75
  const padY = size * 0.55
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2
  const height = lines.length * lineHeight + padY * 2
  const cx = out.width / 2
  const cy = out.height * 0.16 + height / 2
  ctx.globalAlpha = alpha
  ctx.translate(cx, cy)
  ctx.scale(0.6 + 0.4 * enter, 0.6 + 0.4 * enter)
  ctx.rotate(-0.025)
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = size * 0.6
  ctx.shadowOffsetY = size * 0.15
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, -width / 2, -height / 2, width, height, size * 0.45)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#0b0b0f'
  lines.forEach((line, i) => {
    ctx.fillText(line, 0, -height / 2 + padY + lineHeight * (i + 0.5))
  })
  ctx.restore()
}

function wrap(ctx: Ctx, text: string, size: number, maxWidth: number): string[] {
  ctx.save()
  ctx.font = `800 ${size}px ${HOOK_FONT}`
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  ctx.restore()
  return lines
}

function drawProgress(ctx: Ctx, fraction: number, color: string, out: Size): void {
  const h = Math.max(4, Math.round(Math.min(out.width, out.height) * 0.011))
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)'
  ctx.fillRect(0, 0, out.width, h)
  ctx.fillStyle = color
  ctx.fillRect(0, 0, out.width * Math.min(1, Math.max(0, fraction)), h)
  ctx.restore()
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
