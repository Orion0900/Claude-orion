/*
 * The skyline: every building you own, standing in a row against a
 * generated city. Lit windows are occupancy, a crane means a business plan
 * is under way, and the sky follows the business cycle.
 */
import { useEffect, useRef, type MouseEvent } from 'react'
import { TYPES } from '../engine/data'
import type { Phase, PropertyType } from '../engine/types'

export interface SkylineBuilding {
  id: string
  type: PropertyType
  value: number
  size: number
  occupancy: number
  building: boolean
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/** Width and height ranges, in hundredths of the canvas height. */
const SHAPE: Record<PropertyType, { w: [number, number]; h: [number, number] }> = {
  office: { w: [15, 24], h: [46, 92] },
  hotel: { w: [13, 19], h: [40, 82] },
  multifamily: { w: [22, 38], h: [24, 58] },
  lifescience: { w: [22, 32], h: [22, 40] },
  datacenter: { w: [28, 44], h: [15, 25] },
  industrial: { w: [40, 66], h: [11, 19] },
  retail: { w: [32, 52], h: [11, 17] },
  storage: { w: [28, 42], h: [10, 15] },
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

interface Placed extends SkylineBuilding {
  x: number
  w: number
  h: number
}

function layout(list: SkylineBuilding[], width: number, height: number, ground: number): Placed[] {
  const u = height / 100
  const raw = list.map((b) => {
    const spec = TYPES[b.type]
    const sizeT = Math.log(b.size / spec.sizeMin) / Math.log(spec.portfolioMax / spec.sizeMin)
    const valueT = (Math.log10(Math.max(1e6, b.value)) - 7) / 2.6
    const shape = SHAPE[b.type]
    return { ...b, w: lerp(shape.w[0], shape.w[1], sizeT) * u, h: lerp(shape.h[0], shape.h[1], valueT) * u }
  })
  const gap = 5 * u
  const total = raw.reduce((sum, b) => sum + b.w, 0) + gap * Math.max(0, raw.length - 1)
  const avail = width - 24
  const scale = total > avail ? avail / total : 1
  let x = (width - Math.min(total, avail)) / 2
  return raw.map((b) => {
    const w = b.w * scale
    const placed = { ...b, x, w, h: Math.min(b.h, ground - 10) }
    x += w + gap * scale
    return placed
  })
}

function demoCity(): SkylineBuilding[] {
  const types: PropertyType[] = ['industrial', 'multifamily', 'office', 'hotel', 'retail', 'office', 'lifescience', 'datacenter', 'multifamily', 'office', 'storage', 'hotel']
  return types.map((type, i) => ({
    id: `demo${i}`,
    type,
    value: 2e7 * Math.pow(3, (hash(`v${i}`) * 4) | 0),
    size: TYPES[type].sizeMin * (2 + hash(`s${i}`) * 20),
    occupancy: 0.55 + hash(`o${i}`) * 0.43,
    building: i === 2 || i === 8,
  }))
}

export function Skyline({
  buildings,
  phase = 'expansion',
  height = 210,
  onPick,
  demo,
  label,
}: {
  buildings: SkylineBuilding[]
  phase?: Phase
  height?: number
  onPick?: (id: string) => void
  demo?: boolean
  label: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const placed = useRef<Placed[]>([])
  const list = demo ? demoCity() : buildings
  const key = list.map((b) => `${b.id}:${Math.round(b.value / 1e5)}:${b.occupancy.toFixed(2)}:${b.building}`).join('|')

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let last = 0
    let width = 0

    const draw = (t: number) => {
      const css = getComputedStyle(el)
      const v = (name: string) => css.getPropertyValue(name).trim()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      width = el.clientWidth
      if (el.width !== Math.round(width * dpr) || el.height !== Math.round(height * dpr)) {
        el.width = Math.round(width * dpr)
        el.height = Math.round(height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const ground = height - 14

      // Sky, tinted by the cycle.
      const sky = ctx.createLinearGradient(0, 0, 0, ground)
      sky.addColorStop(0, v(`--sky-${phase}-top`) || v('--sky-top'))
      sky.addColorStop(1, v(`--sky-${phase}-bottom`) || v('--sky-bottom'))
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, width, height)
      const stars = Number(v('--stars') || 0)
      if (stars > 0) {
        for (let i = 0; i < 60; i++) {
          const sx = hash(`sx${i}`) * width
          const sy = hash(`sy${i}`) * ground * 0.55
          const tw = still ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(t / 900 + i))
          ctx.globalAlpha = stars * tw * 0.8
          ctx.fillStyle = v('--star')
          ctx.fillRect(sx, sy, 1.4, 1.4)
        }
        ctx.globalAlpha = 1
      }

      // The far city.
      ctx.fillStyle = v('--city-far')
      let fx = -10
      let n = 0
      while (fx < width + 10) {
        const w = 14 + hash(`fw${n}`) * 30
        const h = (0.18 + hash(`fh${n}`) * 0.42) * ground
        ctx.fillRect(fx, ground - h, w, h)
        if (hash(`ant${n}`) > 0.8) ctx.fillRect(fx + w / 2 - 1, ground - h - 10, 2, 10)
        fx += w + 2
        n++
      }
      ctx.fillStyle = v('--city-mid')
      fx = -20
      n = 0
      while (fx < width + 10) {
        const w = 20 + hash(`mw${n}`) * 36
        const h = (0.1 + hash(`mh${n}`) * 0.26) * ground
        ctx.fillRect(fx, ground - h, w, h)
        fx += w + 6 + hash(`mg${n}`) * 18
        n++
      }

      // Your buildings.
      const items = layout(list, width, height, ground)
      placed.current = items
      const lit = v('--window')
      const dark = v('--window-off')
      for (const b of items) {
        const color = v(`--t-${b.type}`)
        const top = ground - b.h
        ctx.fillStyle = color
        ctx.fillRect(b.x, top, b.w, b.h)
        // Shade the right side for depth.
        ctx.fillStyle = 'rgba(0,0,0,0.16)'
        ctx.fillRect(b.x + b.w * 0.72, top, b.w * 0.28, b.h)

        const rows = Math.max(1, Math.floor((b.h - 8) / (b.type === 'office' || b.type === 'hotel' ? 7 : 9)))
        const cols = Math.max(1, Math.floor((b.w - 4) / (b.type === 'industrial' || b.type === 'datacenter' ? 12 : 6)))
        const cw = (b.w - 4) / cols
        const rh = (b.h - 8) / rows
        const windowed = b.type !== 'datacenter' && b.type !== 'storage' && b.type !== 'industrial' && b.type !== 'retail'
        if (windowed) {
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const seed = hash(`${b.id}-${r}-${c}`)
              const flicker = still ? 0 : (Math.sin(t / 2600 + seed * 40) > 0.97 ? 0.15 : 0)
              const on = seed < b.occupancy - flicker
              ctx.fillStyle = on ? lit : dark
              ctx.globalAlpha = on ? 0.75 + seed * 0.25 : 1
              ctx.fillRect(b.x + 2 + c * cw + cw * 0.22, top + 5 + r * rh + rh * 0.22, cw * 0.56, rh * 0.5)
            }
          }
          ctx.globalAlpha = 1
        }
        if (b.type === 'industrial' || b.type === 'storage') {
          const doors = Math.max(2, Math.floor(b.w / 12))
          const dw = b.w / (doors * 2 + 1)
          const filled = Math.round(doors * b.occupancy)
          for (let i = 0; i < doors; i++) {
            ctx.fillStyle = b.type === 'storage' ? (i < filled ? v('--storage-door') : dark) : i < filled ? lit : dark
            ctx.globalAlpha = b.type === 'industrial' && i < filled ? 0.8 : 1
            ctx.fillRect(b.x + dw * (1 + i * 2), ground - b.h * 0.55, dw, b.h * 0.55)
          }
          ctx.globalAlpha = 1
          if (b.type === 'industrial') {
            ctx.fillStyle = color
            for (let i = 0; i < 4; i++) ctx.fillRect(b.x + (b.w / 4) * i, top - 4, b.w / 8, 4)
          }
        }
        if (b.type === 'retail') {
          const stripes = Math.max(4, Math.floor(b.w / 6))
          for (let i = 0; i < stripes; i++) {
            ctx.fillStyle = i % 2 ? v('--awning') : 'rgba(255,255,255,0.85)'
            ctx.fillRect(b.x + (b.w / stripes) * i, top + 2, b.w / stripes, 4)
          }
          ctx.fillStyle = b.occupancy > 0.5 ? lit : dark
          ctx.globalAlpha = 0.85
          ctx.fillRect(b.x + 3, ground - b.h * 0.5, b.w * b.occupancy - 6, b.h * 0.42)
          ctx.globalAlpha = 1
        }
        if (b.type === 'datacenter') {
          for (let i = 0; i < Math.floor(b.w / 9); i++) {
            ctx.fillStyle = dark
            ctx.beginPath()
            ctx.arc(b.x + 6 + i * 9, top - 2.5, 3, 0, Math.PI * 2)
            ctx.fill()
          }
          for (let i = 0; i < 8; i++) {
            const blink = still ? true : Math.sin(t / 300 + i * 7 + hash(b.id) * 9) > 0
            ctx.fillStyle = blink && hash(`${b.id}led${i}`) < b.occupancy ? v('--led') : dark
            ctx.fillRect(b.x + 4 + (i % 4) * ((b.w - 8) / 4), top + 6 + Math.floor(i / 4) * 6, 2.5, 2.5)
          }
        }
        if (b.type === 'hotel') {
          ctx.fillStyle = v('--sign')
          ctx.fillRect(b.x + b.w * 0.2, top - 6, b.w * 0.6, 5)
        }
        if (b.type === 'office' && b.h > 60) {
          ctx.fillStyle = color
          ctx.fillRect(b.x + b.w / 2 - 1, top - 12, 2, 12)
          ctx.fillStyle = Math.sin(t / 500) > 0 || still ? v('--beacon') : 'transparent'
          ctx.fillRect(b.x + b.w / 2 - 1.5, top - 14, 3, 3)
        }
        if (b.building) drawCrane(ctx, b.x + b.w + 1, top - 14, Math.min(54, b.h * 0.7 + 22), v('--crane'), still ? 0 : Math.sin(t / 1400) * 0.5)
      }

      // The street.
      ctx.fillStyle = v('--street')
      ctx.fillRect(0, ground, width, height - ground)
      ctx.fillStyle = v('--street-line')
      for (let i = 0; i < width; i += 22) ctx.fillRect(i, ground + 6, 10, 1.5)

      if (phase === 'recession' && !still) {
        ctx.strokeStyle = v('--rain')
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let i = 0; i < 70; i++) {
          const rx = (hash(`rx${i}`) * width + t / 6) % width
          const ry = (hash(`ry${i}`) * ground + t / 3) % ground
          ctx.moveTo(rx, ry)
          ctx.lineTo(rx - 3, ry + 9)
        }
        ctx.stroke()
      }
    }

    const loop = (t: number) => {
      if (t - last > 110) {
        draw(t)
        last = t
      }
      frame = requestAnimationFrame(loop)
    }
    if (still) draw(0)
    else frame = requestAnimationFrame(loop)
    const redraw = () => draw(performance.now())
    window.addEventListener('resize', redraw)
    const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    scheme?.addEventListener?.('change', redraw)
    const watcher = new MutationObserver(redraw)
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', redraw)
      scheme?.removeEventListener?.('change', redraw)
      watcher.disconnect()
    }
    // `key` stands in for the building list, which is rebuilt every render.
  }, [key, phase, height])

  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!onPick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const hit = placed.current.find((b) => x >= b.x - 2 && x <= b.x + b.w + 2)
    if (hit) onPick(hit.id)
  }

  return (
    <canvas
      ref={canvas}
      className={onPick ? 'skyline pickable' : 'skyline'}
      style={{ height }}
      role="img"
      aria-label={label}
      onClick={pick}
    />
  )
}

function drawCrane(ctx: CanvasRenderingContext2D, x: number, top: number, tall: number, color: string, swing: number) {
  const base = top + tall
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.4
  ctx.beginPath()
  ctx.moveTo(x, base)
  ctx.lineTo(x, top)
  ctx.moveTo(x + 4, base)
  ctx.lineTo(x + 4, top)
  for (let y = base; y > top; y -= 6) {
    ctx.moveTo(x, y)
    ctx.lineTo(x + 4, y - 6)
  }
  ctx.moveTo(x - 10, top)
  ctx.lineTo(x + 30, top)
  ctx.moveTo(x + 2, top - 6)
  ctx.lineTo(x - 10, top)
  ctx.moveTo(x + 2, top - 6)
  ctx.lineTo(x + 30, top)
  const hookX = x + 22 + swing * 3
  ctx.moveTo(x + 22, top)
  ctx.lineTo(hookX, top + 16)
  ctx.stroke()
  ctx.fillRect(hookX - 2, top + 16, 4, 3)
  ctx.fillRect(x - 12, top - 1, 5, 4)
}
