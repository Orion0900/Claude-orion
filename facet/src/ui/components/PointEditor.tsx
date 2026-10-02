import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react'
import type { FaceFrame } from '../../face/frame'
import type { Box, Shape } from '../../face/metrics/types'
import type { Vec2 } from '../../face/types'
import { fitBox, TONES } from './Annotated'
import { Minus, Plus, Reset } from './Icons'

export interface EditorPoint {
  id: string
  p: Vec2
  /** Faded: shown for context but not editable right now. */
  dim?: boolean
}

interface Props {
  src: string
  width: number
  height: number
  frame?: FaceFrame | null
  points: EditorPoint[]
  activeId: string | null
  onSelect: (id: string | null) => void
  onMove: (id: string, p: Vec2) => void
  onMoveEnd?: (id: string) => void
  /** Reference lines drawn under the points, in the same upright space. */
  guides?: Shape[]
  /** Where the view starts, in upright photo coordinates. */
  initialBox: Box
  /** Re-centres on this point whenever it changes (guided placement). */
  focus?: Vec2 | null
  /** View width to use when focusing. */
  focusWidth?: number
  /** Width ÷ height of the editor. */
  aspect?: number
  /** A tap moves the active point there (for the first placement of a point). */
  tapToPlace?: boolean
  hint?: string
}

type Gesture =
  | { kind: 'none' }
  | { kind: 'drag'; id: string; last: Vec2; travelled: number; pos: Vec2; down: Vec2; hit: boolean }
  | { kind: 'pan'; last: Vec2; travelled: number; down: Vec2 }
  | { kind: 'pinch'; d0: number; c0: Vec2; view0: Box }

const HIT_PX = 26
const LOUPE_PX = 118
const LOUPE_ZOOM = 3.2

/**
 * Photo with draggable points. Dragging moves the selected point by however
 * far the finger travels — anywhere on the photo — so the finger never hides
 * the point it's placing; a loupe shows it magnified while it moves. Two
 * fingers pan and zoom.
 */
export function PointEditor(props: Props) {
  const { src, width, height, frame, points, activeId, onSelect, onMove, onMoveEnd, guides = [], aspect = 3 / 4 } = props
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 320, h: 320 / aspect })
  const [view, setView] = useState<Box>(() => fitBox(props.initialBox, aspect))
  const [dragging, setDragging] = useState<string | null>(null)
  const pointers = useRef(new Map<number, Vec2>())
  const gesture = useRef<Gesture>({ kind: 'none' })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Recentre for each guided step.
  const fx = props.focus?.x
  const fy = props.focus?.y
  useEffect(() => {
    if (fx === undefined || fy === undefined) return
    setView((v) => {
      const w = props.focusWidth ?? v.w
      const h = w / aspect
      return { x: fx - w / 2, y: fy - h / 2, w, h }
    })
    // Only when the focus point itself changes.
  }, [fx, fy])

  const unitsPerPx = view.w / Math.max(1, size.w)
  const toView = (clientX: number, clientY: number): Vec2 => {
    const r = ref.current!.getBoundingClientRect()
    return { x: view.x + ((clientX - r.left) / r.width) * view.w, y: view.y + ((clientY - r.top) / r.height) * view.h }
  }

  const zoomAround = (factor: number, anchor: Vec2) => {
    setView((v) => {
      const maxW = Math.max(width, height) * 1.6
      const w = Math.min(maxW, Math.max(40, v.w * factor))
      const k = w / v.w
      return { x: anchor.x - (anchor.x - v.x) * k, y: anchor.y - (anchor.y - v.y) * k, w, h: w / aspect }
    })
  }

  const onPointerDown = (e: RPointerEvent) => {
    ref.current!.setPointerCapture(e.pointerId)
    const at = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, at)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view0: view }
      setDragging(null)
      return
    }
    if (pointers.current.size > 2) return
    const p = toView(e.clientX, e.clientY)
    let hit: EditorPoint | null = null
    let best = HIT_PX * unitsPerPx
    for (const q of points) {
      if (q.dim) continue
      const d = Math.hypot(q.p.x - p.x, q.p.y - p.y)
      if (d < best) {
        best = d
        hit = q
      }
    }
    if (hit && hit.id !== activeId) onSelect(hit.id)
    const target = hit ?? points.find((q) => q.id === activeId) ?? null
    if (target) gesture.current = { kind: 'drag', id: target.id, last: at, travelled: 0, pos: target.p, down: p, hit: !!hit }
    // A point not placed yet starts wherever the finger lands.
    else if (props.tapToPlace && activeId) gesture.current = { kind: 'drag', id: activeId, last: at, travelled: 0, pos: p, down: p, hit: false }
    else gesture.current = { kind: 'pan', last: at, travelled: 0, down: p }
  }

  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    const at = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, at)
    const g = gesture.current
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const r = ref.current!.getBoundingClientRect()
      const k = g.d0 / Math.max(10, d)
      const w = Math.min(Math.max(width, height) * 1.6, Math.max(40, g.view0.w * k))
      // Keep the photo point under the first centre under the fingers' centre now.
      const fx0 = (g.c0.x - r.left) / r.width
      const fy0 = (g.c0.y - r.top) / r.height
      const ax = g.view0.x + fx0 * g.view0.w
      const ay = g.view0.y + fy0 * g.view0.h
      const fx1 = (c.x - r.left) / r.width
      const fy1 = (c.y - r.top) / r.height
      setView({ x: ax - fx1 * w, y: ay - fy1 * (w / aspect), w, h: w / aspect })
      return
    }
    if (g.kind === 'drag') {
      const dx = (at.x - g.last.x) * unitsPerPx
      const dy = (at.y - g.last.y) * unitsPerPx
      g.travelled += Math.hypot(at.x - g.last.x, at.y - g.last.y)
      g.last = at
      if (g.travelled < 3) return
      g.pos = { x: g.pos.x + dx, y: g.pos.y + dy }
      setDragging(g.id)
      onMove(g.id, g.pos)
      return
    }
    if (g.kind === 'pan') {
      const dx = (at.x - g.last.x) * unitsPerPx
      const dy = (at.y - g.last.y) * unitsPerPx
      g.travelled += Math.hypot(at.x - g.last.x, at.y - g.last.y)
      g.last = at
      setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }))
    }
  }

  const onPointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g.kind === 'drag') {
      if (g.travelled < 3) {
        if (props.tapToPlace) {
          onMove(g.id, g.down)
          onMoveEnd?.(g.id)
        } else if (!g.hit) onSelect(null)
      } else onMoveEnd?.(g.id)
    }
    if (pointers.current.size === 0) {
      gesture.current = { kind: 'none' }
      setDragging(null)
    } else if (g.kind === 'pinch') gesture.current = { kind: 'none' }
  }

  const onWheel = (e: RWheelEvent) => {
    zoomAround(Math.exp(e.deltaY * 0.0015), toView(e.clientX, e.clientY))
  }

  const deg = frame ? (-frame.angle * 180) / Math.PI : 0
  const photo = (
    <g transform={frame ? `rotate(${deg} ${frame.center.x} ${frame.center.y})` : undefined}>
      <image href={src} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
    </g>
  )
  const u = unitsPerPx
  const guideEls = guides.map((s, i) =>
    s.t === 'line' ? (
      <line key={i} x1={s.a.x} y1={s.a.y} x2={s.b.x} y2={s.b.y} stroke={TONES[s.tone ?? 'muted']} strokeWidth={1.4 * u} strokeDasharray={s.dash ? `${6 * u} ${5 * u}` : undefined} />
    ) : s.t === 'poly' ? (
      <polyline key={i} points={s.pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={TONES[s.tone ?? 'muted']} strokeWidth={1.2 * u} strokeDasharray={s.dash ? `${6 * u} ${5 * u}` : undefined} />
    ) : null,
  )
  const pointEls = (scale: number) =>
    points.map((q) => {
      const active = q.id === activeId
      const r = (active ? 8 : 5.5) * scale
      return (
        <g key={q.id} opacity={q.dim ? 0.45 : 1}>
          {active && <circle cx={q.p.x} cy={q.p.y} r={r * 2.1} fill="none" stroke={TONES.accent} strokeWidth={1.5 * scale} opacity={0.7} />}
          <circle cx={q.p.x} cy={q.p.y} r={r} fill={active ? TONES.accent : 'rgba(255,255,255,0.92)'} stroke="rgba(0,0,0,0.7)" strokeWidth={1.4 * scale} />
        </g>
      )
    })

  const active = points.find((q) => q.id === (dragging ?? activeId))
  const loupeW = (LOUPE_PX * unitsPerPx) / LOUPE_ZOOM
  const loupeOnLeft = active ? active.p.x > view.x + view.w / 2 : true

  return (
    <div
      ref={ref}
      className="editor"
      style={{ aspectRatio: `${aspect}` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <svg viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}>
        {photo}
        {guideEls}
        {pointEls(u)}
      </svg>
      {dragging && active && (
        <div className="loupe" style={loupeOnLeft ? { left: 10 } : { right: 10 }}>
          <svg viewBox={`${active.p.x - loupeW / 2} ${active.p.y - loupeW / 2} ${loupeW} ${loupeW}`} width={LOUPE_PX} height={LOUPE_PX}>
            {photo}
            {guideEls}
            <line x1={active.p.x - loupeW} y1={active.p.y} x2={active.p.x + loupeW} y2={active.p.y} stroke={TONES.accent} strokeWidth={loupeW / 160} />
            <line x1={active.p.x} y1={active.p.y - loupeW} x2={active.p.x} y2={active.p.y + loupeW} stroke={TONES.accent} strokeWidth={loupeW / 160} />
            <circle cx={active.p.x} cy={active.p.y} r={loupeW / 40} fill={TONES.accent} />
          </svg>
        </div>
      )}
      <div className="zoom-controls no-print" onPointerDown={(e) => e.stopPropagation()}>
        <button className="icon-btn" aria-label="Zoom in" onClick={() => zoomAround(0.7, active?.p ?? { x: view.x + view.w / 2, y: view.y + view.h / 2 })}>
          <Plus />
        </button>
        <button className="icon-btn" aria-label="Zoom out" onClick={() => zoomAround(1 / 0.7, active?.p ?? { x: view.x + view.w / 2, y: view.y + view.h / 2 })}>
          <Minus />
        </button>
        <button className="icon-btn" aria-label="Show all" onClick={() => setView(fitBox(props.initialBox, aspect))}>
          <Reset />
        </button>
      </div>
      {props.hint && (
        <div className="editor-hint">
          <span>{props.hint}</span>
        </div>
      )}
    </div>
  )
}
