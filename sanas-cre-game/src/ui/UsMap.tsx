/** A dot-matrix map of the lower 48 with your exposure in each market. */
import { useEffect, useRef } from 'react'
import { MARKETS, MARKET_ORDER } from '../engine/data'
import type { MarketId } from '../engine/types'

// A coarse outline of the contiguous US, in longitude and latitude.
const OUTLINE: Array<[number, number]> = [
  [-124.7, 48.4], [-123, 49], [-95.2, 49], [-89.6, 48], [-84.8, 46.5], [-82.5, 45.3], [-82.4, 43], [-79, 43.3],
  [-76, 44.2], [-74.7, 45], [-71.5, 45], [-69.2, 47.4], [-67.8, 47.1], [-67, 44.8], [-70.2, 43.6], [-70.6, 42.6],
  [-70, 41.8], [-71.9, 41.3], [-74, 40.6], [-74.9, 38.9], [-75.6, 37.5], [-76, 36.9], [-75.5, 35.2], [-77.9, 33.9],
  [-79.9, 32.7], [-81.4, 30.4], [-80, 26.7], [-80.4, 25.2], [-81.8, 26.1], [-82.8, 28], [-84, 30], [-86.5, 30.4],
  [-88, 30.7], [-89.6, 30.2], [-89.4, 29], [-91, 29.3], [-93.8, 29.7], [-95, 29.3], [-97.2, 27.6], [-97.4, 25.9],
  [-99.2, 26.5], [-100.3, 28.2], [-101.4, 29.8], [-103, 29], [-104.5, 29.6], [-106.5, 31.8], [-108.2, 31.8],
  [-108.2, 31.3], [-111.1, 31.3], [-114.8, 32.5], [-117.1, 32.5], [-118.5, 34], [-120.6, 34.6], [-121.9, 36.6],
  [-122.5, 37.8], [-123.8, 39.8], [-124.4, 42], [-124, 46.2],
]

const LON0 = -125
const LON1 = -66.5
const LAT0 = 24.3
const LAT1 = 49.6

/** Which side of its dot each market's label sits on, so neighbors don't collide. */
const LABEL: Record<MarketId, 'left' | 'right' | 'above' | 'below'> = {
  sea: 'right', sf: 'right', la: 'left', phx: 'right', dal: 'right', aus: 'left', chi: 'left', nash: 'left',
  atl: 'right', mia: 'right', dc: 'left', nyc: 'below', bos: 'above',
}

/** Room around the map for labels. */
const INSET = 0.08

function inside(lon: number, lat: number): boolean {
  let hit = false
  for (let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i++) {
    const [xi, yi] = OUTLINE[i]
    const [xj, yj] = OUTLINE[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

export function UsMap({ exposure, onPick, selected }: { exposure: Partial<Record<MarketId, number>>; onPick?: (m: MarketId) => void; selected?: MarketId | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const key = MARKET_ORDER.map((m) => Math.round((exposure[m] ?? 0) / 1e5)).join(',') + (selected ?? '')

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')
    if (!ctx) return
    const draw = () => {
      const css = getComputedStyle(el)
      const v = (n: string) => css.getPropertyValue(n).trim()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const width = el.clientWidth
      const height = Math.round(width * 0.56)
      el.style.height = `${height}px`
      el.width = Math.round(width * dpr)
      el.height = Math.round(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      const ix = width * INSET
      const iy = height * INSET
      const px = (lon: number) => ix + ((lon - LON0) / (LON1 - LON0)) * (width - 2 * ix)
      const py = (lat: number) => iy + ((LAT1 - lat) / (LAT1 - LAT0)) * (height - 2 * iy)
      const step = Math.max(6, width / 62)
      ctx.fillStyle = v('--map-dot')
      for (let y = iy + step / 2; y < height - iy; y += step) {
        for (let x = ix + step / 2; x < width - ix; x += step) {
          const lon = LON0 + ((x - ix) / (width - 2 * ix)) * (LON1 - LON0)
          const lat = LAT1 - ((y - iy) / (height - 2 * iy)) * (LAT1 - LAT0)
          if (inside(lon, lat)) {
            ctx.beginPath()
            ctx.arc(x, y, step * 0.17, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
      const total = Object.values(exposure).reduce((a, b) => a + (b ?? 0), 0)
      for (const m of MARKET_ORDER) {
        const spec = MARKETS[m]
        const x = px(spec.lon)
        const y = py(spec.lat)
        const share = total > 0 ? (exposure[m] ?? 0) / total : 0
        const r = 4 + 14 * Math.sqrt(share)
        if (share > 0) {
          ctx.fillStyle = v('--map-glow')
          ctx.beginPath()
          ctx.arc(x, y, r + 5, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.fillStyle = share > 0 ? v('--accent') : v('--map-node')
        ctx.beginPath()
        ctx.arc(x, y, share > 0 ? r : 3.5, 0, Math.PI * 2)
        ctx.fill()
        if (m === selected) {
          ctx.strokeStyle = v('--ink')
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, (share > 0 ? r : 3.5) + 3, 0, Math.PI * 2)
          ctx.stroke()
        }
        ctx.fillStyle = v('--dim')
        const size = Math.max(9, width / 48)
        ctx.font = `600 ${size}px ${v('--mono') || 'monospace'}`
        const side = LABEL[m]
        const rr = (share > 0 ? r : 3.5) + 4
        ctx.textAlign = side === 'left' ? 'right' : side === 'right' ? 'left' : 'center'
        const lx = side === 'left' ? x - rr : side === 'right' ? x + rr : x
        const ly = side === 'above' ? y - rr : side === 'below' ? y + rr + size * 0.7 : y + size * 0.35
        ctx.fillText(spec.short, lx, ly)
      }
    }
    draw()
    window.addEventListener('resize', draw)
    const watcher = new MutationObserver(draw)
    watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const scheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
    scheme?.addEventListener?.('change', draw)
    return () => {
      window.removeEventListener('resize', draw)
      watcher.disconnect()
      scheme?.removeEventListener?.('change', draw)
    }
  }, [key])

  const pick = (e: { clientX: number; clientY: number; currentTarget: HTMLCanvasElement }) => {
    if (!onPick) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    let best: MarketId | null = null
    let dist = Infinity
    const ix = rect.width * INSET
    const iy = rect.height * INSET
    for (const m of MARKET_ORDER) {
      const spec = MARKETS[m]
      const mx = ix + ((spec.lon - LON0) / (LON1 - LON0)) * (rect.width - 2 * ix)
      const my = iy + ((LAT1 - spec.lat) / (LAT1 - LAT0)) * (rect.height - 2 * iy)
      const d = Math.hypot(mx - x, my - y)
      if (d < dist) {
        dist = d
        best = m
      }
    }
    if (best && dist < 40) onPick(best)
  }

  return <canvas ref={canvas} className="usmap" role="img" aria-label="Map of your markets" onClick={pick} />
}
