import type { NoteKind } from '../chart/types'

/**
 * Every gem, fret button and flame is painted once into an offscreen canvas
 * at the size it appears at the strike line; the renderer then only scales
 * and stamps them, which keeps a dense chart smooth on a phone.
 */

export const LANE_COLORS = ['#35d85b', '#ff4b55', '#ffd43d', '#3f8cff', '#ff8e2b'] as const
export const OPEN_COLOR = '#b066ff'
export const STAR_COLOR = '#8ff7ff'

/** Height of a gem sprite as a fraction of its width. */
export const GEM_ASPECT = 0.74
/** Where the gem's centre sits, as a fraction of the sprite height. */
export const GEM_CENTER = 0.42
export const FRET_ASPECT = 0.8

export interface Sprites {
  gemWidth: number
  gems: Record<NoteKind, HTMLCanvasElement[]>
  stars: Record<NoteKind, HTMLCanvasElement[]>
  fret: HTMLCanvasElement[]
  fretDown: HTMLCanvasElement[]
  flame: HTMLCanvasElement[]
  spark: HTMLCanvasElement[]
  sparkStar: HTMLCanvasElement
}

type Canvas = HTMLCanvasElement

function canvas(w: number, h: number): { c: Canvas; g: CanvasRenderingContext2D } {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  const g = c.getContext('2d')!
  return { c, g }
}

/** Mixes a hex colour toward white (t > 0) or black (t < 0). */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const target = t > 0 ? 255 : 0
  const k = Math.abs(t)
  const mix = (v: number) => Math.round(v + (target - v) * k)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

function gem(width: number, color: string, kind: NoteKind): Canvas {
  const { c, g } = canvas(width, width * GEM_ASPECT)
  const cx = width / 2
  const cy = c.height * GEM_CENTER
  const rx = width * 0.44
  const ry = width * 0.25
  const wall = width * 0.1

  // Drop shadow on the highway.
  const shadow = g.createRadialGradient(cx, cy + wall + ry * 0.4, 0, cx, cy + wall + ry * 0.4, rx * 1.1)
  shadow.addColorStop(0, 'rgba(0,0,0,0.45)')
  shadow.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = shadow
  g.beginPath()
  g.ellipse(cx, cy + wall + ry * 0.35, rx * 1.1, ry * 1.05, 0, 0, Math.PI * 2)
  g.fill()

  // The puck's side wall.
  g.fillStyle = shade(color, -0.55)
  g.beginPath()
  g.ellipse(cx, cy + wall, rx, ry, 0, 0, Math.PI)
  g.lineTo(cx - rx, cy)
  g.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, true)
  g.closePath()
  g.fill()
  const band = g.createLinearGradient(cx - rx, 0, cx + rx, 0)
  band.addColorStop(0, 'rgba(255,255,255,0)')
  band.addColorStop(0.35, 'rgba(255,255,255,0.18)')
  band.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = band
  g.fill()

  // Top face.
  const top = g.createLinearGradient(0, cy - ry, 0, cy + ry)
  top.addColorStop(0, shade(color, kind === 'hopo' ? 0.55 : 0.35))
  top.addColorStop(0.55, color)
  top.addColorStop(1, shade(color, -0.25))
  g.fillStyle = top
  g.beginPath()
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = Math.max(1, width * 0.02)
  g.strokeStyle = 'rgba(0,0,0,0.5)'
  g.stroke()

  if (kind === 'tap') {
    // Taps: a dark well with a bright rim, so they read as "no strum needed".
    g.fillStyle = '#120c1f'
    g.beginPath()
    g.ellipse(cx, cy, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = width * 0.045
    g.strokeStyle = shade(color, 0.45)
    g.stroke()
    g.fillStyle = shade(color, 0.2)
    g.beginPath()
    g.ellipse(cx, cy, rx * 0.2, ry * 0.2, 0, 0, Math.PI * 2)
    g.fill()
  } else {
    // A silver cap; HOPOs get a bigger, hotter cap and a white halo ring.
    const k = kind === 'hopo' ? 0.64 : 0.5
    const cap = g.createRadialGradient(cx - rx * 0.12, cy - ry * 0.25, 0, cx, cy, rx * k)
    cap.addColorStop(0, '#ffffff')
    cap.addColorStop(0.6, kind === 'hopo' ? '#ffffff' : '#dfe3ec')
    cap.addColorStop(1, kind === 'hopo' ? shade(color, 0.7) : '#8e95a6')
    g.fillStyle = cap
    g.beginPath()
    g.ellipse(cx, cy, rx * k, ry * k, 0, 0, Math.PI * 2)
    g.fill()
    g.lineWidth = Math.max(1, width * 0.018)
    g.strokeStyle = 'rgba(0,0,0,0.35)'
    g.stroke()
    if (kind === 'hopo') {
      g.lineWidth = width * 0.035
      g.strokeStyle = 'rgba(255,255,255,0.9)'
      g.beginPath()
      g.ellipse(cx, cy, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2)
      g.stroke()
    }
  }

  // Specular glint.
  g.fillStyle = 'rgba(255,255,255,0.55)'
  g.beginPath()
  g.ellipse(cx - rx * 0.45, cy - ry * 0.5, rx * 0.22, ry * 0.16, -0.25, 0, Math.PI * 2)
  g.fill()
  return c
}

function starPath(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, inner = 0.46): void {
  g.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 ? inner : 1
    const x = cx + Math.cos(a) * rx * r
    const y = cy + Math.sin(a) * ry * r
    if (i) g.lineTo(x, y)
    else g.moveTo(x, y)
  }
  g.closePath()
}

function star(width: number, color: string, kind: NoteKind): Canvas {
  const { c, g } = canvas(width, width * GEM_ASPECT)
  const cx = width / 2
  const cy = c.height * GEM_CENTER
  const rx = width * 0.48
  const ry = width * 0.3
  const depth = width * 0.08

  g.fillStyle = 'rgba(0,0,0,0.4)'
  starPath(g, cx, cy + depth * 1.6, rx, ry)
  g.fill()
  g.fillStyle = shade(STAR_COLOR, -0.5)
  starPath(g, cx, cy + depth, rx, ry)
  g.fill()

  g.save()
  g.shadowColor = STAR_COLOR
  g.shadowBlur = width * 0.12
  const face = g.createLinearGradient(0, cy - ry, 0, cy + ry)
  face.addColorStop(0, '#ffffff')
  face.addColorStop(0.6, STAR_COLOR)
  face.addColorStop(1, shade(STAR_COLOR, -0.3))
  g.fillStyle = face
  starPath(g, cx, cy, rx, ry)
  g.fill()
  g.restore()
  g.lineWidth = width * 0.05
  g.strokeStyle = color
  g.lineJoin = 'round'
  starPath(g, cx, cy, rx * 0.97, ry * 0.97)
  g.stroke()

  // The lane colour stays readable in the middle.
  g.fillStyle = kind === 'tap' ? '#120c1f' : color
  starPath(g, cx, cy, rx * 0.38, ry * 0.38)
  g.fill()
  if (kind === 'hopo') {
    g.lineWidth = width * 0.03
    g.strokeStyle = '#ffffff'
    starPath(g, cx, cy, rx * 0.66, ry * 0.66)
    g.stroke()
  }
  return c
}

function fret(width: number, color: string, down: boolean): Canvas {
  const { c, g } = canvas(width, width * FRET_ASPECT)
  const cx = width / 2
  const cy = c.height / 2
  const rx = width * 0.42
  const ry = rx * 0.62
  if (down) {
    const glow = g.createRadialGradient(cx, cy, rx * 0.3, cx, cy, rx * 1.18)
    glow.addColorStop(0, withAlpha(color, 0.55))
    glow.addColorStop(1, withAlpha(color, 0))
    g.fillStyle = glow
    g.beginPath()
    g.ellipse(cx, cy, rx * 1.18, ry * 1.25, 0, 0, Math.PI * 2)
    g.fill()
  }
  // Base plate.
  g.fillStyle = '#0c0816'
  g.beginPath()
  g.ellipse(cx, cy + ry * 0.12, rx * 1.02, ry * 1.02, 0, 0, Math.PI * 2)
  g.fill()
  // Coloured ring.
  const ring = g.createLinearGradient(0, cy - ry, 0, cy + ry)
  ring.addColorStop(0, shade(color, 0.35))
  ring.addColorStop(1, shade(color, -0.35))
  g.fillStyle = ring
  g.beginPath()
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  g.fill()
  // Well, lit when held.
  const well = g.createRadialGradient(cx, cy - ry * 0.2, 0, cx, cy, rx * 0.72)
  if (down) {
    well.addColorStop(0, '#ffffff')
    well.addColorStop(0.35, shade(color, 0.45))
    well.addColorStop(1, shade(color, -0.1))
  } else {
    well.addColorStop(0, '#2b2340')
    well.addColorStop(1, '#0e0a18')
  }
  g.fillStyle = well
  g.beginPath()
  g.ellipse(cx, cy, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = Math.max(1, width * 0.02)
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.beginPath()
  g.ellipse(cx, cy, rx * 0.98, ry * 0.98, 0, Math.PI * 1.1, Math.PI * 1.9)
  g.stroke()
  return c
}

function flame(width: number, color: string): Canvas {
  const h = width * 1.6
  const { c, g } = canvas(width, h)
  const cx = width / 2
  const base = h * 0.86
  g.globalCompositeOperation = 'lighter'
  const layers: [number, number, string, number][] = [
    [1, 1, color, 0.55],
    [0.7, 0.8, shade(color, 0.45), 0.7],
    [0.38, 0.55, '#ffffff', 0.85],
  ]
  for (const [wk, hk, col, alpha] of layers) {
    const w = width * 0.46 * wk
    const top = base - h * 0.8 * hk
    const grad = g.createLinearGradient(0, base, 0, top)
    grad.addColorStop(0, toRgba(col, alpha))
    grad.addColorStop(1, toRgba(col, 0))
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(cx - w, base)
    g.bezierCurveTo(cx - w, base - (base - top) * 0.45, cx - w * 0.2, base - (base - top) * 0.7, cx, top)
    g.bezierCurveTo(cx + w * 0.2, base - (base - top) * 0.7, cx + w, base - (base - top) * 0.45, cx + w, base)
    g.ellipse(cx, base, w, w * 0.35, 0, 0, Math.PI)
    g.fill()
  }
  return c
}

function spark(size: number, color: string): Canvas {
  const { c, g } = canvas(size, size)
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.3, toRgba(color, 0.9))
  grad.addColorStop(1, toRgba(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}

/** Accepts '#rrggbb' or 'rgb(r, g, b)'. */
function toRgba(color: string, alpha: number): string {
  if (color.startsWith('#')) return withAlpha(color, alpha)
  return color.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)
}

export function makeSprites(gemWidth: number): Sprites {
  const w = Math.max(16, Math.round(gemWidth))
  const kinds: NoteKind[] = ['strum', 'hopo', 'tap']
  const per = <T>(fn: (color: string, i: number) => T) => LANE_COLORS.map((color, i) => fn(color, i))
  const byKind = (fn: (color: string, kind: NoteKind) => Canvas) =>
    Object.fromEntries(kinds.map((kind) => [kind, per((color) => fn(color, kind))])) as Record<NoteKind, Canvas[]>
  return {
    gemWidth: w,
    gems: byKind((color, kind) => gem(w, color, kind)),
    stars: byKind((color, kind) => star(w, color, kind)),
    fret: per((color) => fret(w * 1.1, color, false)),
    fretDown: per((color) => fret(w * 1.1, color, true)),
    flame: [...per((color) => flame(w, color)), flame(w, OPEN_COLOR), flame(w, STAR_COLOR)],
    spark: [...per((color) => spark(24, color)), spark(24, OPEN_COLOR), spark(24, STAR_COLOR)],
    sparkStar: spark(32, STAR_COLOR),
  }
}
