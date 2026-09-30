import type { BeatLine } from '../chart/tempo'
import { OPEN_BIT, OPEN_LANE, type Note } from '../chart/types'
import { HIT, MISSED } from '../game/session'
import { computeLayout, scaleAt, xAt, yAt, type Insets, type Layout } from './layout'
import {
  FRET_ASPECT,
  GEM_ASPECT,
  GEM_CENTER,
  LANE_COLORS,
  OPEN_COLOR,
  STAR_COLOR,
  makeSprites,
  shade,
  withAlpha,
  type Sprites,
} from './sprites'

/**
 * Draws the note highway and the in-game HUD on one 2D canvas: a cached stage
 * (background and highway), then beat lines, sustains, gems, fret buttons,
 * flames and sparks, then the numbers.
 */

export interface HudState {
  score: number
  multiplier: number
  multiplierProgress: number
  streak: number
  starMeter: number
  starActive: boolean
  starReady: boolean
  /** Rock meter 0-1, or null when failing is off. */
  rock: number | null
  /** How far through the song, 0-1. */
  progress: number
  solo: { hit: number; total: number } | null
}

export interface FrameState {
  /** Song time for visuals, seconds. */
  time: number
  /** Fractional beat at `time`, for the pulse. */
  beat: number
  /** Seconds from the strike line to the far end. */
  lookahead: number
  notes: readonly Note[]
  status: Uint8Array
  /** 1 where a note should still show as a star (its phrase is unbroken). */
  starLive: Uint8Array
  /** Per lane 0-5, the note whose sustain is being held, or -1. */
  sustaining: Int32Array
  /** Per lane 0-4, pressed. */
  down: readonly boolean[]
  lefty: boolean
  beatLines: readonly BeatLine[]
  hud: HudState
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  sprite: HTMLCanvasElement
}

interface Banner {
  text: string
  sub: string
  color: string
  born: number
}

const FONT = '"Avenir Next Condensed", "Avenir Next", "Arial Narrow", system-ui, sans-serif'
const MULT_COLORS = ['#ffffff', '#ffffff', '#ffc234', '#4de36b', '#c77dff']
const MAX_PARTICLES = 220
const BANNER_LIFE = 1600

export class Renderer {
  readonly canvas: HTMLCanvasElement
  layout!: Layout
  reducedEffects = false
  private readonly g: CanvasRenderingContext2D
  private dpr = 1
  private sprites!: Sprites
  private stage!: HTMLCanvasElement
  private stageStar!: HTMLCanvasElement
  private readonly particles: Particle[] = []
  private readonly flames = new Float32Array(6)
  private readonly rings = new Float32Array(5)
  private readonly misses = new Float32Array(5)
  private readonly banners: Banner[] = []
  private countdown: { text: string; born: number } | null = null
  private noteCursor = 0
  private beatCursor = 0
  private lastTime = -Infinity
  private lastNow = 0
  private maxEnd: Float64Array = new Float64Array(0)
  private endNotes: readonly Note[] | null = null

  constructor(host: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'game-canvas'
    host.appendChild(this.canvas)
    this.g = this.canvas.getContext('2d', { alpha: false })!
  }

  resize(width: number, height: number, insets: Insets): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(width * this.dpr)
    this.canvas.height = Math.round(height * this.dpr)
    this.layout = computeLayout(width, height, insets)
    this.sprites = makeSprites(this.layout.lane * 0.86 * this.dpr * 1.2)
    this.stage = this.paintStage(false)
    this.stageStar = this.paintStage(true)
  }

  // ── effects API ──────────────────────────────────────────────────────

  /** A note was hit: flames and sparks on its lanes. */
  hit(mask: number, lefty: boolean, star: boolean): void {
    for (let lane = 0; lane <= OPEN_LANE; lane++) {
      if (!(mask & (1 << lane))) continue
      if (lane === OPEN_LANE) {
        for (let column = 0; column < 5; column++) this.burst(column, 5, 4)
        this.flames[OPEN_LANE] = 1
        continue
      }
      const column = lefty ? 4 - lane : lane
      this.flames[lane] = 1
      this.rings[column] = 1
      this.burst(column, star ? 6 : lane, this.reducedEffects ? 4 : 9)
    }
  }

  /** Something went wrong on these lanes (a miss or a stray tap). */
  miss(mask: number, lefty: boolean): void {
    for (let lane = 0; lane < 5; lane++) if (mask & (1 << lane)) this.misses[lefty ? 4 - lane : lane] = 1
    if (mask & OPEN_BIT) this.misses.fill(1)
  }

  banner(text: string, sub = '', color = '#ffffff'): void {
    this.banners.push({ text, sub, color, born: performance.now() })
    if (this.banners.length > 3) this.banners.shift()
  }

  setCountdown(text: string | null): void {
    this.countdown = text ? { text, born: performance.now() } : null
  }

  clearEffects(): void {
    this.particles.length = 0
    this.flames.fill(0)
    this.rings.fill(0)
    this.misses.fill(0)
    this.banners.length = 0
    this.noteCursor = 0
    this.beatCursor = 0
  }

  // ── frame ────────────────────────────────────────────────────────────

  frame(s: FrameState, now: number): void {
    const g = this.g
    const L = this.layout
    const dt = Math.min(0.05, Math.max(0, (now - this.lastNow) / 1000))
    this.lastNow = now
    if (s.time < this.lastTime - 0.25) {
      this.noteCursor = 0
      this.beatCursor = 0
    }
    this.lastTime = s.time

    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    g.drawImage(s.hud.starActive ? this.stageStar : this.stage, 0, 0, L.width, L.height)
    this.drawPulse(s)
    this.drawBeatLines(s)
    this.drawSustains(s)
    this.drawGems(s)
    this.drawFrets(s, dt)
    this.drawParticles(dt)
    this.drawHud(s, now)
  }

  private paintStage(star: boolean): HTMLCanvasElement {
    const L = this.layout
    const c = document.createElement('canvas')
    c.width = this.canvas.width
    c.height = this.canvas.height
    const g = c.getContext('2d')!
    g.scale(this.dpr, this.dpr)

    // Backdrop: a dark stage lit from behind the far end of the highway.
    const bg = g.createRadialGradient(L.cx, L.farY, 0, L.cx, L.farY, Math.max(L.width, L.height) * 0.9)
    bg.addColorStop(0, star ? '#123e66' : '#2c1452')
    bg.addColorStop(0.45, star ? '#0a1c38' : '#140a2a')
    bg.addColorStop(1, '#05040a')
    g.fillStyle = bg
    g.fillRect(0, 0, L.width, L.height)
    // Stage lights: soft beams fanning up from behind the highway.
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.32
      const len = Math.max(L.width, L.height) * 1.1
      const beam = g.createLinearGradient(L.cx, L.farY, L.cx + Math.cos(a) * len, L.farY + Math.sin(a) * len)
      const hue = star ? '120,220,255' : i % 2 ? '190,90,255' : '255,80,160'
      beam.addColorStop(0, `rgba(${hue},0.10)`)
      beam.addColorStop(1, `rgba(${hue},0)`)
      g.fillStyle = beam
      g.beginPath()
      g.moveTo(L.cx, L.farY)
      g.lineTo(L.cx + Math.cos(a - 0.07) * len, L.farY + Math.sin(a - 0.07) * len)
      g.lineTo(L.cx + Math.cos(a + 0.07) * len, L.farY + Math.sin(a + 0.07) * len)
      g.fill()
    }
    g.globalCompositeOperation = 'source-over'

    // The highway surface.
    const zN = L.zNear
    const edge = 2.62
    const corners: [number, number][] = [
      [xAt(L, -edge, zN), yAt(L, zN)],
      [xAt(L, edge, zN), yAt(L, zN)],
      [xAt(L, edge, 1), yAt(L, 1)],
      [xAt(L, -edge, 1), yAt(L, 1)],
    ]
    const surface = g.createLinearGradient(0, yAt(L, 1), 0, yAt(L, zN))
    surface.addColorStop(0, star ? 'rgba(10,30,60,0.35)' : 'rgba(18,10,34,0.35)')
    surface.addColorStop(0.35, star ? 'rgba(8,26,54,0.92)' : 'rgba(16,10,30,0.92)')
    surface.addColorStop(1, star ? 'rgba(10,36,70,0.97)' : 'rgba(22,14,40,0.97)')
    g.fillStyle = surface
    g.beginPath()
    corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fill()

    // Fretboard grain: faint streaks down each lane.
    g.save()
    g.clip()
    for (let lane = 0; lane < 5; lane++) {
      const x0 = lane - 2.5
      const grain = g.createLinearGradient(xAt(L, x0, 0), 0, xAt(L, x0 + 1, 0), 0)
      grain.addColorStop(0, 'rgba(255,255,255,0.025)')
      grain.addColorStop(0.5, 'rgba(255,255,255,0)')
      grain.addColorStop(1, 'rgba(0,0,0,0.12)')
      g.fillStyle = grain
      g.beginPath()
      g.moveTo(xAt(L, x0, zN), yAt(L, zN))
      g.lineTo(xAt(L, x0 + 1, zN), yAt(L, zN))
      g.lineTo(xAt(L, x0 + 1, 1), yAt(L, 1))
      g.lineTo(xAt(L, x0, 1), yAt(L, 1))
      g.fill()
    }
    g.restore()

    // Lane dividers.
    g.strokeStyle = star ? 'rgba(140,220,255,0.16)' : 'rgba(255,255,255,0.09)'
    g.lineWidth = 1.2
    for (let i = 1; i < 5; i++) {
      const x0 = i - 2.5
      g.beginPath()
      g.moveTo(xAt(L, x0, zN), yAt(L, zN))
      g.lineTo(xAt(L, x0, 1), yAt(L, 1))
      g.stroke()
    }

    // Side rails.
    for (const side of [-1, 1]) {
      const inner = side * 2.52
      const outer = side * edge
      const rail = g.createLinearGradient(0, yAt(L, 1), 0, yAt(L, zN))
      rail.addColorStop(0, star ? 'rgba(120,230,255,0.1)' : 'rgba(200,190,230,0.08)')
      rail.addColorStop(1, star ? 'rgba(150,240,255,0.95)' : 'rgba(225,215,245,0.85)')
      g.fillStyle = rail
      g.beginPath()
      g.moveTo(xAt(L, inner, zN), yAt(L, zN))
      g.lineTo(xAt(L, outer, zN), yAt(L, zN))
      g.lineTo(xAt(L, outer, 1), yAt(L, 1))
      g.lineTo(xAt(L, inner, 1), yAt(L, 1))
      g.fill()
      if (star) {
        g.save()
        g.shadowColor = STAR_COLOR
        g.shadowBlur = 18
        g.strokeStyle = 'rgba(143,247,255,0.7)'
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(xAt(L, outer, zN), yAt(L, zN))
        g.lineTo(xAt(L, outer, 1), yAt(L, 1))
        g.stroke()
        g.restore()
      }
    }

    // Strike line.
    const y0 = L.strikeY
    const strike = g.createLinearGradient(0, y0 - 6, 0, y0 + 6)
    strike.addColorStop(0, 'rgba(255,255,255,0)')
    strike.addColorStop(0.5, star ? 'rgba(170,245,255,0.55)' : 'rgba(255,255,255,0.4)')
    strike.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = strike
    g.fillRect(xAt(L, -edge, 0), y0 - 6, xAt(L, edge, 0) - xAt(L, -edge, 0), 12)

    // Fog over the far end so notes emerge out of the dark.
    const fogTop = yAt(L, 1) - 4
    const fogBottom = yAt(L, 0.72)
    const fog = g.createLinearGradient(0, fogTop, 0, fogBottom)
    fog.addColorStop(0, star ? 'rgba(10,28,56,1)' : 'rgba(26,12,48,1)')
    fog.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = fog
    g.fillRect(xAt(L, -edge - 0.3, 1), fogTop, xAt(L, edge + 0.3, 1) - xAt(L, -edge - 0.3, 1), fogBottom - fogTop)
    return c
  }

  private drawPulse(s: FrameState): void {
    if (this.reducedEffects) return
    const g = this.g
    const L = this.layout
    const phase = s.beat - Math.floor(s.beat)
    const strength = Math.pow(1 - phase, 3) * (s.hud.starActive ? 0.35 : 0.2)
    if (strength < 0.01) return
    const r = L.lane * 3.2
    const glow = g.createRadialGradient(L.cx, L.farY, 0, L.cx, L.farY, r)
    const col = s.hud.starActive ? '120,230,255' : '220,120,255'
    glow.addColorStop(0, `rgba(${col},${strength})`)
    glow.addColorStop(1, `rgba(${col},0)`)
    g.globalCompositeOperation = 'lighter'
    g.fillStyle = glow
    g.fillRect(L.cx - r, L.farY - r, r * 2, r * 2)
    g.globalCompositeOperation = 'source-over'
  }

  private zOf(s: FrameState, time: number): number {
    return (time - s.time) / s.lookahead
  }

  private drawBeatLines(s: FrameState): void {
    const g = this.g
    const L = this.layout
    const lines = s.beatLines
    const tMin = s.time + L.zNear * s.lookahead
    while (this.beatCursor < lines.length && lines[this.beatCursor].time < tMin) this.beatCursor++
    for (let i = this.beatCursor; i < lines.length; i++) {
      const line = lines[i]
      const z = this.zOf(s, line.time)
      if (z > 1) break
      const scale = scaleAt(L, z)
      const y = yAt(L, z)
      const fade = z > 0.7 ? Math.max(0, (1 - z) / 0.3) : 1
      g.fillStyle = line.measure ? `rgba(255,255,255,${0.42 * fade})` : `rgba(255,255,255,${0.16 * fade})`
      const h = (line.measure ? 3 : 1.6) * scale
      g.fillRect(xAt(L, -2.5, z), y - h / 2, xAt(L, 2.5, z) - xAt(L, -2.5, z), h)
    }
  }

  /** The latest time each note still draws something: its longest sustain's end. */
  private noteEnds(notes: readonly Note[]): Float64Array {
    if (this.endNotes !== notes) {
      this.endNotes = notes
      this.maxEnd = new Float64Array(notes.length)
      notes.forEach((n, i) => (this.maxEnd[i] = n.time + Math.max(...n.sustain)))
    }
    return this.maxEnd
  }

  private visibleRange(s: FrameState): [number, number] {
    const L = this.layout
    const ends = this.noteEnds(s.notes)
    const tMin = s.time + L.zNear * s.lookahead - 0.05
    const notes = s.notes
    while (this.noteCursor < notes.length && ends[this.noteCursor] < tMin && notes[this.noteCursor].time < tMin) {
      this.noteCursor++
    }
    let last = this.noteCursor
    const tMax = s.time + s.lookahead * 1.02
    while (last < notes.length && notes[last].time <= tMax) last++
    return [this.noteCursor, last]
  }

  private drawSustains(s: FrameState): void {
    const [first, last] = this.visibleRange(s)
    const notes = s.notes
    for (let i = first; i < last; i++) {
      const note = notes[i]
      const status = s.status[i]
      for (let lane = 0; lane <= OPEN_LANE; lane++) {
        const length = note.sustain[lane]
        if (!length || !(note.mask & (1 << lane))) continue
        const live = s.sustaining[lane] === i
        const zStart = this.zOf(s, note.time)
        const zEnd = this.zOf(s, note.time + length)
        if (status === HIT && !live) {
          // Dropped or finished: whatever is left scrolls past, greyed.
          if (zEnd > 0) this.sustain(lane, s.lefty, Math.max(zStart, this.layout.zNear), zEnd, 'dead', s.time)
          continue
        }
        const mode = live ? 'live' : status === MISSED ? 'dead' : 'waiting'
        this.sustain(lane, s.lefty, live ? 0 : zStart, zEnd, mode, s.time)
      }
    }
  }

  private sustain(lane: number, lefty: boolean, zStart: number, zEnd: number, mode: 'live' | 'waiting' | 'dead', time: number): void {
    const g = this.g
    const L = this.layout
    const z0 = Math.max(zStart, L.zNear)
    const z1 = Math.min(zEnd, 1)
    if (z1 <= z0) return
    const open = lane === OPEN_LANE
    const color = open ? OPEN_COLOR : LANE_COLORS[lane]
    const center = open ? 0 : (lefty ? 4 - lane : lane) - 2
    const half = open ? 2.2 : mode === 'live' ? 0.15 : 0.12
    const steps = mode === 'live' ? 16 : 1
    const wobble = (z: number) => (mode === 'live' && !open ? Math.sin(time * 34 + z * 26) * 0.05 : 0)
    g.beginPath()
    for (let k = 0; k <= steps; k++) {
      const z = z0 + ((z1 - z0) * k) / steps
      const x = xAt(L, center - half + wobble(z), z)
      if (k) g.lineTo(x, yAt(L, z))
      else g.moveTo(x, yAt(L, z))
    }
    for (let k = steps; k >= 0; k--) {
      const z = z0 + ((z1 - z0) * k) / steps
      g.lineTo(xAt(L, center + half + wobble(z), z), yAt(L, z))
    }
    g.closePath()
    if (mode === 'dead') g.fillStyle = open ? 'rgba(140,120,170,0.25)' : 'rgba(150,150,165,0.35)'
    else if (open) g.fillStyle = withAlpha(OPEN_COLOR, mode === 'live' ? 0.45 : 0.3)
    else g.fillStyle = mode === 'live' ? shade(color, 0.25) : withAlpha(color, 0.85)
    g.fill()
    if (mode === 'live' && !open && !this.reducedEffects) {
      g.globalCompositeOperation = 'lighter'
      g.strokeStyle = 'rgba(255,255,255,0.75)'
      g.lineWidth = Math.max(1.5, L.lane * 0.03)
      g.beginPath()
      for (let k = 0; k <= steps; k++) {
        const z = z0 + ((z1 - z0) * k) / steps
        const x = xAt(L, center + wobble(z), z)
        if (k) g.lineTo(x, yAt(L, z))
        else g.moveTo(x, yAt(L, z))
      }
      g.stroke()
      g.globalCompositeOperation = 'source-over'
    }
  }

  private drawGems(s: FrameState): void {
    const g = this.g
    const L = this.layout
    const [first, last] = this.visibleRange(s)
    const notes = s.notes
    const width0 = L.lane * 0.86
    for (let i = last - 1; i >= first; i--) {
      const status = s.status[i]
      if (status === HIT) continue
      const note = notes[i]
      const z = this.zOf(s, note.time)
      if (z > 1.02 || z < L.zNear) continue
      const scale = scaleAt(L, z)
      const y = yAt(L, z)
      const alpha = status === MISSED ? 0.4 : z > 0.9 ? Math.max(0, (1.02 - z) / 0.12) : 1
      if (alpha <= 0) continue
      g.globalAlpha = alpha
      const star = s.starLive[i] === 1
      if (note.mask === OPEN_BIT) {
        this.openBar(z, y, scale, note.kind === 'hopo', star)
      } else {
        const set = star ? this.sprites.stars[note.kind] : this.sprites.gems[note.kind]
        const w = width0 * scale
        const h = w * GEM_ASPECT
        for (let lane = 0; lane < 5; lane++) {
          if (!(note.mask & (1 << lane))) continue
          const column = s.lefty ? 4 - lane : lane
          const x = xAt(L, column - 2, z)
          g.drawImage(set[lane], x - w / 2, y - h * GEM_CENTER, w, h)
        }
      }
    }
    g.globalAlpha = 1
  }

  private openBar(z: number, y: number, scale: number, hopo: boolean, star: boolean): void {
    const g = this.g
    const L = this.layout
    const x0 = xAt(L, -2.35, z)
    const x1 = xAt(L, 2.35, z)
    const h = L.lane * 0.2 * scale
    const color = star ? STAR_COLOR : OPEN_COLOR
    const grad = g.createLinearGradient(0, y - h / 2, 0, y + h / 2)
    grad.addColorStop(0, hopo ? '#ffffff' : shade(color, 0.5))
    grad.addColorStop(0.5, color)
    grad.addColorStop(1, shade(color, -0.45))
    g.fillStyle = grad
    roundRect(g, x0, y - h / 2, x1 - x0, h, h / 2)
    g.fill()
    g.lineWidth = Math.max(1, 1.5 * scale)
    g.strokeStyle = 'rgba(0,0,0,0.5)'
    g.stroke()
  }

  private drawFrets(s: FrameState, dt: number): void {
    const g = this.g
    const L = this.layout
    const w = L.lane * 0.94
    const h = w * FRET_ASPECT
    const y = L.strikeY
    for (let column = 0; column < 5; column++) {
      const lane = s.lefty ? 4 - column : column
      const x = xAt(L, column - 2, 0)
      const shake = this.misses[column] > 0 ? Math.sin(this.misses[column] * 40) * 3 * this.misses[column] : 0
      g.drawImage((s.down[lane] ? this.sprites.fretDown : this.sprites.fret)[lane], x - w / 2 + shake, y - h / 2, w, h)
      if (this.misses[column] > 0) {
        g.fillStyle = `rgba(255,40,60,${0.35 * this.misses[column]})`
        g.beginPath()
        g.ellipse(x + shake, y, w * 0.4, w * 0.25, 0, 0, Math.PI * 2)
        g.fill()
        this.misses[column] = Math.max(0, this.misses[column] - dt * 4)
      }
      if (this.rings[column] > 0) {
        const r = this.rings[column]
        g.strokeStyle = withAlpha(LANE_COLORS[lane], r * 0.9)
        g.lineWidth = 3 * r + 1
        g.beginPath()
        const grow = 1 + (1 - r) * 0.5
        g.ellipse(x, y, w * 0.42 * grow, w * 0.26 * grow, 0, 0, Math.PI * 2)
        g.stroke()
        this.rings[column] = Math.max(0, r - dt * 5)
      }
    }

    // Flames: a burst on each hit, held up while a sustain is live.
    g.globalCompositeOperation = 'lighter'
    for (let lane = 0; lane <= OPEN_LANE; lane++) {
      if (s.sustaining[lane] >= 0) this.flames[lane] = Math.max(this.flames[lane], 0.55 + Math.random() * 0.25)
      const f = this.flames[lane]
      if (f <= 0.01) continue
      const sprite = this.sprites.flame[lane]
      const fw = w * (0.8 + f * 0.3)
      const fh = fw * 1.6 * (0.5 + f * 0.7)
      if (lane === OPEN_LANE) {
        for (let column = 0; column < 5; column++) {
          const x = xAt(L, column - 2, 0)
          g.globalAlpha = Math.min(1, f)
          g.drawImage(sprite, x - fw / 2, y - fh * 0.86, fw, fh)
        }
      } else {
        const column = s.lefty ? 4 - lane : lane
        const x = xAt(L, column - 2, 0)
        g.globalAlpha = Math.min(1, f)
        g.drawImage(sprite, x - fw / 2, y - fh * 0.86, fw, fh)
        if (s.sustaining[lane] >= 0 && !this.reducedEffects && Math.random() < 0.5) this.burst(column, lane, 1)
      }
      this.flames[lane] = Math.max(0, f - dt * 3.2)
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }

  private burst(column: number, spriteIndex: number, count: number): void {
    const L = this.layout
    const x = xAt(L, column - 2, 0)
    const y = L.strikeY
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift()
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
      const speed = L.lane * (2.5 + Math.random() * 4)
      this.particles.push({
        x: x + (Math.random() - 0.5) * L.lane * 0.3,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        max: 0.3 + Math.random() * 0.35,
        size: L.lane * (0.1 + Math.random() * 0.12),
        sprite: this.sprites.spark[spriteIndex] ?? this.sprites.spark[0],
      })
    }
  }

  private drawParticles(dt: number): void {
    const g = this.g
    const gravity = this.layout.lane * 9
    g.globalCompositeOperation = 'lighter'
    let alive = 0
    for (const p of this.particles) {
      p.life += dt
      if (p.life >= p.max) continue
      p.vy += gravity * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      const k = 1 - p.life / p.max
      g.globalAlpha = k
      const size = p.size * (0.5 + k * 0.5)
      g.drawImage(p.sprite, p.x - size / 2, p.y - size / 2, size, size)
      this.particles[alive++] = p
    }
    this.particles.length = alive
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  }

  // ── HUD ──────────────────────────────────────────────────────────────

  private drawHud(s: FrameState, now: number): void {
    const g = this.g
    const L = this.layout
    const hud = s.hud
    const top = L.insets.top

    // Song progress along the very top.
    const px0 = L.insets.left + 12
    const px1 = L.width - L.insets.right - 12
    g.fillStyle = 'rgba(255,255,255,0.12)'
    g.fillRect(px0, top + 4, px1 - px0, 3)
    g.fillStyle = hud.starActive ? STAR_COLOR : 'rgba(255,255,255,0.75)'
    g.fillRect(px0, top + 4, (px1 - px0) * Math.min(1, Math.max(0, hud.progress)), 3)

    // Score, top left, clear of the pause button on the right.
    g.textBaseline = 'alphabetic'
    g.textAlign = 'left'
    g.font = `italic 800 ${L.portrait ? 30 : 28}px ${FONT}`
    g.fillStyle = '#ffffff'
    g.shadowColor = 'rgba(0,0,0,0.6)'
    g.shadowBlur = 6
    g.fillText(Math.floor(hud.score).toLocaleString('en-US'), px0 + 2, top + 40)
    g.shadowBlur = 0

    this.drawMultiplier(hud, L.hud.leftX, L.hud.y)
    this.drawStarMeter(hud, L.hud.rightX, L.hud.y, now)

    if (hud.solo) {
      const pct = hud.solo.total ? Math.floor((hud.solo.hit / hud.solo.total) * 100) : 0
      g.textAlign = 'center'
      g.font = `italic 800 22px ${FONT}`
      g.fillStyle = '#ffd43d'
      const y = top + (L.portrait ? 74 : 40)
      g.fillText('SOLO', L.cx, y)
      g.font = `700 16px ${FONT}`
      g.fillStyle = '#ffffff'
      g.fillText(`${hud.solo.hit} / ${hud.solo.total}  ·  ${pct}%`, L.cx, y + 20)
    }

    this.drawBanners(now)
    if (this.countdown) {
      const age = (now - this.countdown.born) / 1000
      const k = Math.min(1, age * 4)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `italic 900 ${Math.round(L.lane * 1.6 * (1.3 - 0.3 * k))}px ${FONT}`
      g.fillStyle = `rgba(255,255,255,${1 - Math.max(0, age - 0.6) * 2})`
      g.shadowColor = 'rgba(0,0,0,0.7)'
      g.shadowBlur = 12
      g.fillText(this.countdown.text, L.cx, L.farY + (L.strikeY - L.farY) * 0.45)
      g.shadowBlur = 0
      g.textBaseline = 'alphabetic'
    }
  }

  private drawMultiplier(hud: HudState, x: number, y: number): void {
    const g = this.g
    const L = this.layout
    const r = Math.min(34, L.hud.width * 0.3)
    const base = Math.min(4, Math.max(1, hud.starActive ? hud.multiplier / 2 : hud.multiplier))
    const color = hud.starActive ? STAR_COLOR : MULT_COLORS[base]
    g.fillStyle = 'rgba(8,6,16,0.75)'
    g.beginPath()
    g.arc(x, y, r + 5, 0, Math.PI * 2)
    g.fill()
    // Ten segments fill toward the next multiplier.
    const lit = Math.round(hud.multiplierProgress * 10)
    g.lineWidth = 5
    for (let i = 0; i < 10; i++) {
      const a0 = -Math.PI / 2 + (i * Math.PI * 2) / 10 + 0.06
      const a1 = a0 + (Math.PI * 2) / 10 - 0.12
      g.strokeStyle = i < lit ? color : 'rgba(255,255,255,0.12)'
      g.beginPath()
      g.arc(x, y, r, a0, a1)
      g.stroke()
    }
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `italic 900 ${Math.round(r * 0.95)}px ${FONT}`
    g.fillStyle = color
    if (hud.starActive) {
      g.shadowColor = STAR_COLOR
      g.shadowBlur = 12
    }
    g.fillText(`${hud.multiplier}x`, x, y + 1)
    g.shadowBlur = 0
    g.textBaseline = 'alphabetic'
    g.font = `800 ${Math.round(r * 0.6)}px ${FONT}`
    g.fillStyle = '#ffffff'
    g.fillText(String(hud.streak), x, y + r + 26)
    g.font = `700 ${Math.round(r * 0.32)}px ${FONT}`
    g.fillStyle = 'rgba(255,255,255,0.55)'
    g.fillText('STREAK', x, y + r + 40)
  }

  private drawStarMeter(hud: HudState, x: number, y: number, now: number): void {
    const g = this.g
    const L = this.layout
    const w = 16
    const h = Math.min(120, L.lane * 1.5)
    const top = y - h / 2
    g.fillStyle = 'rgba(8,6,16,0.75)'
    roundRect(g, x - w / 2 - 4, top - 4, w + 8, h + 8, 10)
    g.fill()
    const level = Math.min(1, Math.max(0, hud.starMeter))
    const pulse = hud.starReady ? 0.6 + 0.4 * Math.sin(now / 120) : 1
    const fill = g.createLinearGradient(0, top + h, 0, top)
    fill.addColorStop(0, '#2fb8ff')
    fill.addColorStop(1, '#bffbff')
    g.fillStyle = fill
    g.globalAlpha = pulse
    roundRect(g, x - w / 2, top + h * (1 - level), w, h * level, 6)
    g.fill()
    g.globalAlpha = 1
    g.fillStyle = 'rgba(255,255,255,0.35)'
    for (const mark of [0.25, 0.5, 0.75]) g.fillRect(x - w / 2, top + h * (1 - mark), w, mark === 0.5 ? 2 : 1)
    g.textAlign = 'center'
    g.font = `800 12px ${FONT}`
    g.fillStyle = hud.starReady || hud.starActive ? STAR_COLOR : 'rgba(255,255,255,0.55)'
    g.fillText(hud.starActive ? 'ACTIVE' : hud.starReady ? 'READY' : 'STAR', x, top + h + 20)

    if (hud.rock !== null) {
      const rw = Math.min(80, L.hud.width * 0.8)
      const ry = top + h + 34
      const grad = g.createLinearGradient(x - rw / 2, 0, x + rw / 2, 0)
      grad.addColorStop(0, '#ff3b4f')
      grad.addColorStop(0.5, '#ffd43d')
      grad.addColorStop(1, '#35d85b')
      g.fillStyle = grad
      roundRect(g, x - rw / 2, ry, rw, 7, 3.5)
      g.fill()
      g.fillStyle = '#ffffff'
      const nx = x - rw / 2 + rw * hud.rock
      g.beginPath()
      g.moveTo(nx, ry - 3)
      g.lineTo(nx - 5, ry - 10)
      g.lineTo(nx + 5, ry - 10)
      g.fill()
    }
  }

  private drawBanners(now: number): void {
    const g = this.g
    const L = this.layout
    while (this.banners.length && now - this.banners[0].born > BANNER_LIFE) this.banners.shift()
    const baseY = L.farY + (L.strikeY - L.farY) * (L.portrait ? 0.28 : 0.3)
    this.banners.forEach((b, i) => {
      const age = (now - b.born) / BANNER_LIFE
      const scale = age < 0.12 ? 0.6 + (age / 0.12) * 0.4 : 1
      const alpha = age > 0.7 ? Math.max(0, (1 - age) / 0.3) : 1
      const y = baseY + (this.banners.length - 1 - i) * -52
      g.save()
      g.translate(L.cx, y)
      g.scale(scale, scale)
      g.globalAlpha = alpha
      g.textAlign = 'center'
      g.font = `italic 900 ${L.portrait ? 30 : 34}px ${FONT}`
      g.shadowColor = 'rgba(0,0,0,0.75)'
      g.shadowBlur = 10
      g.fillStyle = b.color
      g.fillText(b.text, 0, 0)
      if (b.sub) {
        g.font = `800 17px ${FONT}`
        g.fillStyle = '#ffffff'
        g.fillText(b.sub, 0, 22)
      }
      g.restore()
    })
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  g.beginPath()
  g.moveTo(x + radius, y)
  g.arcTo(x + w, y, x + w, y + h, radius)
  g.arcTo(x + w, y + h, x, y + h, radius)
  g.arcTo(x, y + h, x, y, radius)
  g.arcTo(x, y, x + w, y, radius)
  g.closePath()
}
