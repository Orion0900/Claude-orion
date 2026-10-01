import { memo } from 'react'
import type { FaceFrame } from '../../face/frame'
import type { Box, Overlay, Shape, Tone } from '../../face/metrics/types'
import type { Vec2 } from '../../face/types'

export const TONES: Record<Tone, string> = {
  accent: '#d9b77b',
  ideal: '#86d2c6',
  muted: 'rgba(255,255,255,0.62)',
  white: '#ffffff',
  good: '#82d3a3',
  warn: '#e9b760',
  bad: '#ef8b74',
}

/** Grows a box about its centre to the given width ÷ height. */
export function fitBox(b: Box, aspect: number): Box {
  if (b.w / b.h > aspect) {
    const h = b.w / aspect
    return { x: b.x, y: b.y - (h - b.h) / 2, w: b.w, h }
  }
  const w = b.h * aspect
  return { x: b.x - (w - b.w) / 2, y: b.y, w, h: b.h }
}

/** Slides a box back inside the photo where it fits, so no empty margin shows. */
export function clampBox(b: Box, width: number, height: number): Box {
  const slide = (start: number, size: number, limit: number) => (size >= limit ? (limit - size) / 2 : Math.min(Math.max(start, 0), limit - size))
  return { x: slide(b.x, b.w, width), y: slide(b.y, b.h, height), w: b.w, h: b.h }
}

interface Props {
  src: string
  width: number
  height: number
  /** Turns the photo upright; the overlay is in that upright space. */
  frame?: FaceFrame | null
  overlay: Overlay
  /** Displayed width ÷ height; by default the box's own, kept between 3:4 and 16:10. */
  aspect?: number
  /** Darken the photo so lines read clearly. */
  dim?: number
  className?: string
  children?: React.ReactNode
}

function ShapeEl({ s, u }: { s: Shape; u: number }) {
  const sw = 0.42 * u
  switch (s.t) {
    case 'line':
      return (
        <line
          x1={s.a.x}
          y1={s.a.y}
          x2={s.b.x}
          y2={s.b.y}
          stroke={TONES[s.tone ?? 'accent']}
          strokeWidth={sw * (s.w ?? 1)}
          strokeDasharray={s.dash ? `${1.6 * u} ${1.2 * u}` : undefined}
          strokeLinecap="round"
        />
      )
    case 'poly': {
      const pts = s.pts.map((p) => `${p.x},${p.y}`).join(' ')
      const color = TONES[s.tone ?? 'accent']
      const props = {
        points: pts,
        stroke: color,
        strokeWidth: sw * (s.w ?? 1),
        strokeDasharray: s.dash ? `${1.6 * u} ${1.2 * u}` : undefined,
        strokeLinejoin: 'round' as const,
        fill: s.fill ? color : 'none',
        fillOpacity: s.fill ? 0.12 : undefined,
      }
      return s.closed ? <polygon {...props} /> : <polyline {...props} />
    }
    case 'dot':
      return <circle cx={s.p.x} cy={s.p.y} r={(s.r ?? 1.15) * u} fill={TONES[s.tone ?? 'accent']} stroke="rgba(0,0,0,0.6)" strokeWidth={0.3 * u} />
    case 'label':
      return (
        <text x={s.p.x} y={s.p.y} fontSize={3.7 * u * (s.size ?? 1)} textAnchor={s.anchor ?? 'start'} fill={TONES[s.tone ?? 'white']} strokeWidth={0.75 * u} dominantBaseline="middle">
          {s.text}
        </text>
      )
    case 'arc':
      return <Arc s={s} u={u} />
    case 'span':
      return <Span s={s} u={u} />
  }
}

function Arc({ s, u }: { s: Extract<Shape, { t: 'arc' }>; u: number }) {
  const a0 = Math.atan2(s.a.y - s.c.y, s.a.x - s.c.x)
  let a1 = Math.atan2(s.b.y - s.c.y, s.b.x - s.c.x)
  let d = a1 - a0
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  a1 = a0 + d
  const p0 = { x: s.c.x + s.r * Math.cos(a0), y: s.c.y + s.r * Math.sin(a0) }
  const p1 = { x: s.c.x + s.r * Math.cos(a1), y: s.c.y + s.r * Math.sin(a1) }
  const midA = a0 + d / 2
  const color = TONES[s.tone ?? 'accent']
  const lp = { x: s.c.x + (s.r + 5 * u) * Math.cos(midA), y: s.c.y + (s.r + 5 * u) * Math.sin(midA) }
  return (
    <g>
      <path d={`M ${p0.x} ${p0.y} A ${s.r} ${s.r} 0 0 ${d > 0 ? 1 : 0} ${p1.x} ${p1.y}`} stroke={color} strokeWidth={0.42 * u} fill="none" />
      {s.text && (
        <text x={lp.x} y={lp.y} fontSize={3.7 * u} textAnchor="middle" dominantBaseline="middle" fill={TONES.white} strokeWidth={0.75 * u}>
          {s.text}
        </text>
      )}
    </g>
  )
}

function Span({ s, u }: { s: Extract<Shape, { t: 'span' }>; u: number }) {
  const dx = s.b.x - s.a.x
  const dy = s.b.y - s.a.y
  const len = Math.hypot(dx, dy) || 1
  const n: Vec2 = { x: -dy / len, y: dx / len }
  const side = s.side ?? 1
  const tick = 1.4 * u
  const color = TONES[s.tone ?? 'white']
  const mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }
  // Labels stay horizontal: below a horizontal span (side 1) or above it
  // (side −1); right of a vertical one (side 1) or left of it (side −1).
  const horizontalSpan = Math.abs(dx) >= Math.abs(dy)
  const lp = horizontalSpan ? { x: mid.x, y: mid.y + side * 3.4 * u } : { x: mid.x + side * 2.4 * u, y: mid.y }
  const anchor = horizontalSpan ? 'middle' : side > 0 ? 'start' : 'end'
  return (
    <g>
      <line x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={color} strokeWidth={0.42 * u} />
      {[s.a, s.b].map((p, i) => (
        <line key={i} x1={p.x - n.x * tick} y1={p.y - n.y * tick} x2={p.x + n.x * tick} y2={p.y + n.y * tick} stroke={color} strokeWidth={0.42 * u} />
      ))}
      {s.text && (
        <text x={lp.x} y={lp.y} fontSize={3.5 * u} textAnchor={anchor} dominantBaseline="middle" fill={color} strokeWidth={0.75 * u}>
          {s.text}
        </text>
      )}
    </g>
  )
}

function AnnotatedImpl({ src, width, height, frame, overlay, aspect, dim = 0.18, className, children }: Props) {
  const ratio = aspect ?? Math.min(16 / 10, Math.max(3 / 4, overlay.box.w / overlay.box.h))
  const v = clampBox(fitBox(overlay.box, ratio), width, height)
  const u = v.w / 100
  const deg = frame ? (-frame.angle * 180) / Math.PI : 0
  return (
    <svg className={`annotated ${className ?? ''}`} viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} style={{ aspectRatio: `${ratio}` }} role="img">
      <g transform={frame ? `rotate(${deg} ${frame.center.x} ${frame.center.y})` : undefined}>
        <image href={src} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
      </g>
      {dim > 0 && <rect x={v.x} y={v.y} width={v.w} height={v.h} fill="#000" opacity={dim} />}
      {overlay.shapes.map((s, i) => (
        <ShapeEl key={i} s={s} u={u} />
      ))}
      {children}
    </svg>
  )
}

export const Annotated = memo(AnnotatedImpl)
