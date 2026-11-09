/**
 * Move animations: small four-shade effects drawn over the battlefield,
 * one per FxKind. Each is a function of progress t (0–1) between the
 * attacker's centre and the target's.
 */
import type { Gfx } from '../../engine/gfx'
import type { FxKind } from '../../data/moves'

export interface Pt {
  x: number
  y: number
}

/** How long each kind runs, in frames. */
export const FX_FRAMES: Readonly<Record<FxKind, number>> = {
  hit: 18,
  claw: 22,
  bite: 22,
  kick: 18,
  punch: 18,
  beam: 30,
  ball: 26,
  rain: 36,
  blast: 32,
  wave: 32,
  spiral: 32,
  flame: 32,
  bubble: 30,
  bolt: 28,
  ice: 30,
  leaf: 30,
  powder: 36,
  wind: 28,
  needle: 24,
  rock: 30,
  quake: 36,
  shade: 32,
  heal: 36,
  notes: 40,
  gaze: 30,
  up: 30,
  down: 30,
  wall: 30,
  drain: 36,
  coins: 30,
  none: 1,
}

function star(g: Gfx, x: number, y: number, r: number, slot: number): void {
  for (let i = -r; i <= r; i++) {
    g.px(x + i, y, 3, slot)
    g.px(x, y + i, 3, slot)
  }
  for (let i = -Math.floor(r / 2); i <= Math.floor(r / 2); i++) {
    g.px(x + i, y + i, 2, slot)
    g.px(x + i, y - i, 2, slot)
  }
  g.px(x, y, 0, slot)
}

function ring(g: Gfx, x: number, y: number, r: number, shade: number, slot: number): void {
  const n = Math.max(8, Math.round(r * 6))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    g.px(x + Math.cos(a) * r, y + Math.sin(a) * r, shade, slot)
  }
}

function blob(g: Gfx, x: number, y: number, r: number, shade: number, slot: number): void {
  for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r) g.px(x + xx, y + yy, shade, slot)
}

function line(g: Gfx, a: Pt, b: Pt, shade: number, slot: number, step = 1): void {
  const n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))
  for (let i = 0; i <= n; i += step) {
    const t = n ? i / n : 0
    g.px(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, shade, slot)
  }
}

const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

/** Pseudo-random but stable per index, for scattering particles. */
const hash = (i: number) => {
  const s = Math.sin(i * 127.1) * 43758.5453
  return s - Math.floor(s)
}

/** Draws one frame of a move's effect. */
export function drawFx(g: Gfx, kind: FxKind, t: number, from: Pt, to: Pt, slot: number): void {
  switch (kind) {
    case 'hit':
    case 'punch':
    case 'kick': {
      const r = Math.round(3 + Math.sin(t * Math.PI) * (kind === 'punch' ? 7 : 6))
      const off = kind === 'kick' ? 6 : 0
      star(g, to.x + off, to.y - off, r, slot)
      break
    }
    case 'claw': {
      for (let k = 0; k < 3; k++) {
        const len = Math.min(1, t * 1.6 - k * 0.15)
        if (len <= 0) continue
        const a = { x: to.x - 10 + k * 7, y: to.y - 12 }
        const b = { x: a.x + 10 * len, y: a.y + 22 * len }
        line(g, a, b, 3, slot)
        line(g, { x: a.x + 1, y: a.y }, { x: b.x + 1, y: b.y }, 2, slot)
      }
      break
    }
    case 'bite': {
      const gap = Math.round(14 * (1 - Math.min(1, t * 1.4)))
      for (let i = -10; i <= 10; i += 4) {
        g.rect(to.x + i, to.y - 8 - gap, 3, 6, 0, slot)
        g.rect(to.x + i, to.y + 3 + gap, 3, 6, 0, slot)
        g.box(to.x + i - 1, to.y - 9 - gap, 5, 8, 3, slot)
        g.box(to.x + i - 1, to.y + 2 + gap, 5, 8, 3, slot)
      }
      break
    }
    case 'beam': {
      const head = lerp(from, to, Math.min(1, t * 1.5))
      line(g, from, head, 3, slot)
      line(g, { x: from.x, y: from.y - 1 }, { x: head.x, y: head.y - 1 }, 2, slot)
      line(g, { x: from.x, y: from.y + 1 }, { x: head.x, y: head.y + 1 }, 1, slot)
      if (t > 0.6) ring(g, to.x, to.y, 4 + (t - 0.6) * 20, 2, slot)
      break
    }
    case 'ball': {
      const p = lerp(from, to, Math.min(1, t * 1.25))
      blob(g, p.x, p.y - Math.sin(t * Math.PI) * 10, 4, 2, slot)
      blob(g, p.x - 1, p.y - Math.sin(t * Math.PI) * 10 - 1, 2, 0, slot)
      if (t > 0.8) star(g, to.x, to.y, 6, slot)
      break
    }
    case 'rain':
    case 'needle':
    case 'rock': {
      for (let i = 0; i < 7; i++) {
        const k = (t * 1.6 - hash(i) * 0.6) % 1
        if (k < 0) continue
        const x = to.x - 18 + hash(i + 9) * 36
        const y = to.y - 30 + k * 40
        if (kind === 'rock') {
          blob(g, x, y, 3, 2, slot)
          g.px(x - 1, y - 1, 0, slot)
        } else if (kind === 'needle') line(g, { x, y }, { x: x - 2, y: y - 5 }, 3, slot)
        else line(g, { x, y }, { x, y: y - 4 }, 2, slot)
      }
      break
    }
    case 'blast': {
      const r = t * 26
      blob(g, to.x, to.y, Math.max(1, Math.round(r * 0.6)), 0, slot)
      ring(g, to.x, to.y, r, 3, slot)
      ring(g, to.x, to.y, r * 0.75, 2, slot)
      break
    }
    case 'wave': {
      for (let k = 0; k < 3; k++) {
        const r = ((t * 3 + k) % 3) * 9
        if (r > 2) ring(g, to.x, to.y, r, k === 0 ? 3 : 2, slot)
      }
      break
    }
    case 'spiral': {
      for (let i = 0; i < 24; i++) {
        const a = i * 0.6 + t * 12
        const r = 4 + i * 0.9 * (1 - t * 0.5)
        g.px(to.x + Math.cos(a) * r, to.y + Math.sin(a) * r * 0.7, i % 3 ? 2 : 3, slot)
      }
      break
    }
    case 'flame': {
      for (let i = 0; i < 9; i++) {
        const k = (t * 1.4 + hash(i) * 0.5) % 1
        const x = to.x - 14 + hash(i + 3) * 28 + Math.sin(k * 9 + i) * 2
        const y = to.y + 14 - k * 30
        const r = Math.max(1, Math.round(4 * (1 - k)))
        blob(g, x, y, r, k < 0.4 ? 1 : 2, slot)
        g.px(x, y - r, 3, slot)
      }
      break
    }
    case 'bubble': {
      for (let i = 0; i < 8; i++) {
        const k = Math.min(1, t * 1.5 - hash(i) * 0.4)
        if (k <= 0) continue
        const p = lerp(from, { x: to.x - 10 + hash(i + 2) * 20, y: to.y - 10 + hash(i + 5) * 20 }, k)
        ring(g, p.x, p.y, 3, 3, slot)
        g.px(p.x - 1, p.y - 1, 0, slot)
      }
      break
    }
    case 'bolt': {
      if (Math.floor(t * 10) % 2 === 0) {
        let x = to.x
        for (let y = to.y - 34; y < to.y + 6; y += 5) {
          const nx = x + (hash(y + Math.floor(t * 6)) - 0.5) * 12
          line(g, { x, y }, { x: nx, y: y + 5 }, 3, slot)
          line(g, { x: x + 1, y }, { x: nx + 1, y: y + 5 }, 1, slot)
          x = nx
        }
      }
      break
    }
    case 'ice': {
      for (let i = 0; i < 6; i++) {
        const k = Math.min(1, t * 2 - hash(i) * 0.6)
        if (k <= 0) continue
        const x = to.x - 16 + hash(i + 1) * 32
        const y = to.y - 14 + hash(i + 7) * 28
        star(g, x, y, Math.round(2 + k * 3), slot)
      }
      break
    }
    case 'leaf': {
      for (let i = 0; i < 6; i++) {
        const k = Math.min(1, t * 1.4 - hash(i) * 0.3)
        if (k <= 0) continue
        const p = lerp(from, { x: to.x - 8 + hash(i) * 16, y: to.y - 8 + hash(i + 4) * 16 }, k)
        const y = p.y + Math.sin(k * 8 + i) * 4
        g.rect(p.x - 2, y - 1, 5, 3, 2, slot)
        g.px(p.x - 2, y - 1, 3, slot)
        g.px(p.x + 2, y + 1, 3, slot)
      }
      break
    }
    case 'powder': {
      for (let i = 0; i < 14; i++) {
        const k = (t + hash(i) * 0.7) % 1
        g.px(to.x - 16 + hash(i + 11) * 32 + Math.sin(k * 7 + i) * 3, to.y - 24 + k * 36, i % 2 ? 2 : 3, slot)
      }
      break
    }
    case 'wind': {
      for (let k = 0; k < 4; k++) {
        const y = to.y - 12 + k * 8
        const x0 = to.x - 26 + ((t * 60 + k * 13) % 30)
        line(g, { x: x0, y }, { x: x0 + 12, y: y - 2 }, 2, slot)
      }
      break
    }
    case 'quake':
      // The shake itself comes from the scene; scatter a little dust.
      for (let i = 0; i < 6; i++) g.px(to.x - 20 + hash(i) * 40, to.y + 18 - ((t * 20 + i * 3) % 8), 2, slot)
      break
    case 'shade': {
      const r = Math.round(4 + Math.sin(t * Math.PI) * 16)
      for (let yy = -r; yy <= r; yy += 2) for (let xx = -r; xx <= r; xx += 2) if (xx * xx + yy * yy <= r * r) g.px(to.x + xx + (yy % 4 ? 1 : 0), to.y + yy, 3, slot)
      break
    }
    case 'heal':
    case 'up': {
      for (let i = 0; i < 6; i++) {
        const k = (t * 1.5 + hash(i) * 0.6) % 1
        const x = from.x - 14 + hash(i + 3) * 28
        const y = from.y + 14 - k * 30
        if (kind === 'heal') star(g, x, y, 2, slot)
        else {
          line(g, { x, y }, { x, y: y + 6 }, 3, slot)
          g.px(x - 1, y + 1, 3, slot)
          g.px(x + 1, y + 1, 3, slot)
        }
      }
      break
    }
    case 'down': {
      for (let i = 0; i < 6; i++) {
        const k = (t * 1.5 + hash(i) * 0.6) % 1
        const x = to.x - 14 + hash(i + 3) * 28
        const y = to.y - 16 + k * 30
        line(g, { x, y: y - 6 }, { x, y }, 3, slot)
        g.px(x - 1, y - 1, 3, slot)
        g.px(x + 1, y - 1, 3, slot)
      }
      break
    }
    case 'notes': {
      for (let i = 0; i < 4; i++) {
        const k = Math.min(1, t * 1.3 - i * 0.12)
        if (k <= 0) continue
        const p = lerp(from, to, k)
        const y = p.y + Math.sin(k * 10 + i) * 6
        blob(g, p.x, y, 2, 3, slot)
        line(g, { x: p.x + 2, y: y - 7 }, { x: p.x + 2, y }, 3, slot)
        g.px(p.x + 3, y - 7, 3, slot)
      }
      break
    }
    case 'gaze': {
      const r = Math.round(2 + t * 10)
      ring(g, to.x, to.y, r, 3, slot)
      ring(g, to.x, to.y, r + 4, 2, slot)
      blob(g, from.x - 4, from.y - 6, 2, 3, slot)
      blob(g, from.x + 4, from.y - 6, 2, 3, slot)
      break
    }
    case 'wall': {
      const x = from.x + 22
      for (let y = from.y - 22; y < from.y + 20; y += 2) if ((y + Math.floor(t * 20)) % 6 < 4) g.px(x, y, 2, slot)
      for (let y = from.y - 22; y < from.y + 20; y += 3) g.px(x + 2, y, 1, slot)
      break
    }
    case 'drain': {
      for (let i = 0; i < 8; i++) {
        const k = (t * 1.5 + i / 8) % 1
        const p = lerp(to, from, k)
        blob(g, p.x + Math.sin(k * 9 + i) * 5, p.y, 2, i % 2 ? 2 : 3, slot)
      }
      break
    }
    case 'coins': {
      for (let i = 0; i < 6; i++) {
        const k = Math.min(1, t * 1.4 - hash(i) * 0.3)
        if (k <= 0) continue
        const p = lerp(from, { x: to.x - 12 + hash(i) * 24, y: to.y }, k)
        const y = p.y - Math.sin(k * Math.PI) * 16
        blob(g, p.x, y, 3, 1, slot)
        ring(g, p.x, y, 3, 3, slot)
      }
      break
    }
    case 'none':
      break
  }
}
