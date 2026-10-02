/**
 * The edited timeline as a waveform you can drag along. It shows the video
 * after the cuts, so a removed pause simply isn't there; thin marks show
 * where the jump cuts land.
 */
import { useEffect, useRef } from 'react'
import type { AudioAnalysis } from '../lib/types'
import type { RenderPlan } from '../render/plan'

interface Props {
  plan: RenderPlan
  analysis: AudioAnalysis | null
  time: number
  onSeek: (t: number) => void
  onScrub?: (active: boolean) => void
}

export function Scrubber({ plan, analysis, time, onSeek, onScrub }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragging = useRef(false)
  const duration = plan.duration

  useEffect(() => {
    const canvas = canvasRef.current
    const el = ref.current
    if (!canvas || !el) return
    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      const w = Math.max(1, Math.round(el.clientWidth * dpr))
      const h = Math.max(1, Math.round(26 * dpr))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx || duration <= 0) return
      ctx.clearRect(0, 0, w, h)
      const bar = Math.max(1, Math.round(2 * dpr))
      const gap = Math.max(1, Math.round(1 * dpr))
      ctx.fillStyle = 'rgba(255, 255, 255, 0.34)'
      for (let x = 0; x < w; x += bar + gap) {
        const t = ((x + bar / 2) / w) * duration
        let level = 0.18
        if (analysis) {
          const s = plan.map.toSource(t)
          const i = Math.floor(s / analysis.frameDuration)
          // A few frames either side so a short word still shows.
          let peak = 0
          for (let k = i - 2; k <= i + 2; k++) peak = Math.max(peak, analysis.envelope[k] ?? 0)
          level = Math.min(1, Math.sqrt(peak) * 1.6)
        }
        const bh = Math.max(2 * dpr, level * (h - 6 * dpr))
        ctx.fillRect(x, (h - bh) / 2, bar, bh)
      }
      ctx.fillStyle = 'rgba(255, 59, 92, 0.9)'
      for (const c of plan.map.cutPoints()) {
        const x = Math.round((c / duration) * w)
        ctx.fillRect(x - Math.max(1, dpr / 2), 0, Math.max(1, dpr), h)
      }
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(el)
    return () => observer.disconnect()
  }, [plan, analysis, duration])

  const seekAt = (clientX: number) => {
    const el = ref.current
    if (!el || duration <= 0) return
    const rect = el.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    onSeek(f * duration)
  }

  const fraction = duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0

  return (
    <div
      ref={ref}
      className="scrubber"
      role="slider"
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration * 10) / 10}
      aria-valuenow={Math.round(time * 10) / 10}
      tabIndex={0}
      onPointerDown={(e) => {
        dragging.current = true
        e.currentTarget.setPointerCapture(e.pointerId)
        onScrub?.(true)
        seekAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (dragging.current) seekAt(e.clientX)
      }}
      onPointerUp={() => {
        dragging.current = false
        onScrub?.(false)
      }}
      onPointerCancel={() => {
        dragging.current = false
        onScrub?.(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') onSeek(Math.min(duration, time + 1))
        if (e.key === 'ArrowLeft') onSeek(Math.max(0, time - 1))
      }}
    >
      <div className="track">
        <div className="played" style={{ width: `${fraction * 100}%` }} />
        <canvas ref={canvasRef} />
      </div>
      <div className="head" style={{ left: `${fraction * 100}%` }} />
    </div>
  )
}
