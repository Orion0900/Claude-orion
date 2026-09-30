import type { Gfx } from '../../engine/gfx'
import type { MoveFx } from '../../data/moves'

/**
 * Move animations: a few dozen coloured pixels and shapes per move, flying,
 * falling or blooming between the two beasts. Each style from the move data
 * has its own recipe, tinted with the move's type colour.
 */
export interface Point {
  x: number
  y: number
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  /** Frames to wait before appearing. */
  delay: number
  life: number
  age: number
  size: number
  color: string
  shape: 'dot' | 'star' | 'ring' | 'streak' | 'fang'
  gravity: number
  /** For streaks: direction. */
  dx?: number
  dy?: number
}

export class Particles {
  private list: Particle[] = []

  get active(): boolean {
    return this.list.length > 0
  }

  clear(): void {
    this.list = []
  }

  private add(p: Partial<Particle> & { x: number; y: number; color: string }): void {
    this.list.push({ vx: 0, vy: 0, delay: 0, life: 20, age: 0, size: 2, shape: 'dot', gravity: 0, ...p })
  }

  /**
   * Plays one move style from `from` (the user) to `to` (the target). Returns
   * how many frames it lasts, so the scene can wait for it.
   */
  play(fx: MoveFx, from: Point, to: Point, color: string, dark: string, self: boolean): number {
    const tgt = self ? from : to
    const rnd = mulberry((from.x * 31 + to.y * 17 + color.length * 7) | 0)
    switch (fx) {
      case 'strike': {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2
          this.add({ x: tgt.x, y: tgt.y, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, delay: 10, life: 12, color, size: 2 })
        }
        this.add({ x: tgt.x, y: tgt.y, delay: 8, life: 10, color: '#ffffff', shape: 'star', size: 10 })
        return 26
      }
      case 'slash': {
        for (let k = 0; k < 3; k++) {
          const ox = tgt.x - 14 + k * 10
          for (let i = 0; i < 8; i++)
            this.add({ x: ox + i * 3, y: tgt.y - 14 + i * 4, delay: k * 5 + i, life: 10, color: i % 2 ? color : '#ffffff', size: 2 })
        }
        return 30
      }
      case 'bite': {
        this.add({ x: tgt.x, y: tgt.y - 16, vy: 1.4, life: 12, color: '#ffffff', shape: 'fang', size: 14 })
        this.add({ x: tgt.x, y: tgt.y + 16, vy: -1.4, life: 12, color: '#ffffff', shape: 'fang', size: -14 })
        for (let i = 0; i < 6; i++) this.add({ x: tgt.x - 8 + rnd() * 16, y: tgt.y, vx: rnd() * 2 - 1, vy: -1 - rnd(), delay: 11, life: 12, color, size: 2 })
        return 28
      }
      case 'projectile': {
        const n = 4
        for (let k = 0; k < n; k++) {
          const t = 18
          this.add({ x: from.x, y: from.y, vx: (to.x - from.x) / t, vy: (to.y - from.y) / t - 1.2, gravity: 2.4 / t, delay: k * 5, life: t, color, size: 3 })
          for (let i = 0; i < 5; i++) {
            const a = rnd() * Math.PI * 2
            this.add({ x: to.x, y: to.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, delay: k * 5 + t, life: 8, color: dark, size: 2 })
          }
        }
        return 18 + n * 5 + 8
      }
      case 'beam': {
        const t = 26
        for (let i = 0; i < 30; i++) {
          const f = i / 30
          this.add({ x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f, delay: Math.floor(i / 3), life: t - Math.floor(i / 3), color: i % 3 === 0 ? '#ffffff' : color, size: 3 })
        }
        for (let i = 0; i < 8; i++) {
          const a = rnd() * Math.PI * 2
          this.add({ x: to.x, y: to.y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, delay: 12 + i, life: 10, color, size: 2 })
        }
        return t + 6
      }
      case 'burst': {
        this.add({ x: tgt.x, y: tgt.y, life: 14, color, shape: 'ring', size: 4, vx: 0, vy: 0 })
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2 + rnd() * 0.3
          const sp = 1.2 + rnd() * 2
          this.add({ x: tgt.x, y: tgt.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.5, gravity: 0.08, delay: 4, life: 18, color: i % 3 ? color : dark, size: 3 })
        }
        return 26
      }
      case 'rain': {
        for (let i = 0; i < 16; i++) {
          const x = tgt.x - 22 + rnd() * 44
          this.add({ x, y: tgt.y - 48, vy: 3.5, delay: Math.floor(rnd() * 16), life: 14, color: i % 2 ? color : dark, size: 3 })
        }
        return 34
      }
      case 'wave': {
        for (let k = 0; k < 3; k++) {
          for (let i = 0; i < 10; i++) {
            const t = 20
            const oy = Math.sin(i) * 6
            this.add({ x: from.x, y: from.y + oy, vx: (to.x - from.x) / t, vy: (to.y - from.y) / t, delay: k * 4 + i, life: t, color: i % 3 ? color : '#ffffff', size: 2 })
          }
        }
        return 36
      }
      case 'drain': {
        for (let i = 0; i < 14; i++) {
          const t = 22
          const sx = to.x - 10 + rnd() * 20
          const sy = to.y - 10 + rnd() * 20
          this.add({ x: sx, y: sy, vx: (from.x - sx) / t, vy: (from.y - sy) / t, delay: i * 2, life: t, color: i % 2 ? color : '#c8f8b0', size: 3, shape: 'dot' })
        }
        return 50
      }
      case 'aura': {
        for (let k = 0; k < 3; k++) this.add({ x: tgt.x, y: tgt.y, delay: k * 8, life: 16, color, shape: 'ring', size: 6 })
        for (let i = 0; i < 10; i++) this.add({ x: tgt.x - 18 + rnd() * 36, y: tgt.y + 14, vy: -1.2 - rnd(), delay: Math.floor(rnd() * 20), life: 18, color: i % 2 ? color : '#ffffff', size: 2 })
        return 40
      }
      case 'spin': {
        for (let i = 0; i < 24; i++) {
          const a0 = (i / 24) * Math.PI * 2
          const r = 20
          this.add({ x: tgt.x + Math.cos(a0) * r, y: tgt.y + Math.sin(a0) * r * 0.6, vx: -Math.sin(a0) * 2.4, vy: Math.cos(a0) * 1.4, delay: Math.floor(i / 2), life: 16, color: i % 3 ? color : '#ffffff', size: 2 })
        }
        return 30
      }
      case 'shake': {
        for (let i = 0; i < 14; i++) this.add({ x: tgt.x - 26 + rnd() * 52, y: tgt.y + 22, vy: -1 - rnd() * 2, gravity: 0.15, delay: Math.floor(rnd() * 10), life: 18, color: i % 2 ? color : dark, size: 3 })
        return 30
      }
    }
  }

  /** Little arrows drifting up (raised) or down (lowered) over a beast. */
  stat(at: Point, up: boolean): number {
    for (let i = 0; i < 12; i++) {
      const x = at.x - 20 + ((i * 37) % 40)
      this.add({ x, y: at.y + (up ? 18 : -18), vy: up ? -1.4 : 1.4, delay: (i * 3) % 18, life: 18, color: up ? '#f8a030' : '#4878e8', shape: 'streak', size: 5, dy: up ? -1 : 1 })
    }
    return 36
  }

  /** A few sparkles, for a status taking hold or a heal. */
  sparkle(at: Point, color: string): number {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2
      this.add({ x: at.x + Math.cos(a) * 16, y: at.y + Math.sin(a) * 12, vy: -0.6, delay: i * 2, life: 14, color, shape: 'star', size: 4 })
    }
    return 34
  }

  update(): void {
    for (const p of this.list) {
      if (p.delay > 0) {
        p.delay--
        continue
      }
      p.age++
      p.x += p.vx
      p.y += p.vy
      p.vy += p.gravity
    }
    this.list = this.list.filter((p) => p.age < p.life)
  }

  draw(g: Gfx): void {
    for (const p of this.list) {
      if (p.delay > 0) continue
      const x = Math.round(p.x)
      const y = Math.round(p.y)
      const s = p.size
      switch (p.shape) {
        case 'dot':
          g.rect(x - (s >> 1), y - (s >> 1), s, s, p.color)
          break
        case 'star': {
          const k = Math.max(1, Math.round(s * (1 - p.age / p.life)))
          g.rect(x - k, y, k * 2 + 1, 1, p.color)
          g.rect(x, y - k, 1, k * 2 + 1, p.color)
          if (k > 2) {
            g.rect(x - 1, y - 1, 3, 3, p.color)
          }
          break
        }
        case 'ring': {
          const r = Math.round(s + p.age * 1.8)
          ring(g, x, y, r, p.color)
          break
        }
        case 'streak': {
          const d = p.dy ?? -1
          g.rect(x, y, 1, s, p.color)
          g.rect(x - 1, d < 0 ? y + 1 : y + s - 2, 3, 1, p.color)
          break
        }
        case 'fang': {
          const dir = Math.sign(s)
          const n = Math.abs(s)
          for (let i = 0; i < n; i++) {
            const w = Math.max(1, Math.round(4 - (i / n) * 4))
            g.rect(x - 12 + ((i * 7) % 24), y + dir * i * 0.5, w, 2, p.color)
          }
          g.rect(x - 14, y, 28, 2 * dir, p.color)
          break
        }
      }
    }
  }
}

function ring(g: Gfx, cx: number, cy: number, r: number, color: string): void {
  const steps = Math.max(12, r * 4)
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    g.rect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.6), 1, 1, color)
  }
}

function mulberry(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
