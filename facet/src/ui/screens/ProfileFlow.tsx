import { useMemo, useRef, useState } from 'react'
import type { Shape } from '../../face/metrics/types'
import { ANCHORS, placeFromAnchors, PROFILE_POINTS, templatePoints, type ProfilePointId, type ProfilePoints } from '../../face/profile'
import type { Vec2 } from '../../face/types'
import { back, go } from '../../router'
import { attachProfile } from '../../store/analysis'
import { useAnalysis } from '../../store/useAnalysis'
import { CameraCapture } from '../components/CameraCapture'
import { Back, Camera, Photo } from '../components/Icons'
import { PointEditor } from '../components/PointEditor'
import { PhotoTips } from './NewAnalysis'
import { Missing } from './Review'

/** The silhouette joins these, forehead to neck. */
const OUTLINE: ProfilePointId[] = ['g', 'n', 'prn', 'cm', 'sn', 'ls', 'li', 'sm', 'pg', 'me', 'c', 'np']

/** A small drawing of a profile with the point being placed lit up. */
function PointDiagram({ id, facing }: { id: ProfilePointId; facing: 'left' | 'right' }) {
  // Fit the template into the drawing, whichever way it faces.
  const raw = templatePoints(1, { x: 0, y: 0 }, facing)
  const xs = Object.values(raw).map((p) => p.x)
  const ys = Object.values(raw).map((p) => p.y)
  const k = Math.min(100 / (Math.max(...xs) - Math.min(...xs)), 144 / (Math.max(...ys) - Math.min(...ys)))
  const ox = 60 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k
  const oy = 80 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k
  const t = Object.fromEntries(Object.entries(raw).map(([key, p]) => [key, { x: ox + p.x * k, y: oy + p.y * k }])) as ProfilePoints
  const outline = OUTLINE.map((key) => `${t[key].x},${t[key].y}`).join(' ')
  return (
    <svg viewBox="0 0 120 160" width={72} height={96} aria-hidden style={{ flex: 'none' }}>
      <polyline points={outline} fill="none" stroke="var(--text-3)" strokeWidth={2} strokeLinejoin="round" />
      <path d={`M${t.go.x},${t.go.y} L${t.me.x},${t.me.y}`} stroke="var(--text-3)" strokeWidth={1.4} strokeDasharray="3 3" />
      <circle cx={t.ea.x} cy={t.ea.y} r={5} fill="none" stroke="var(--text-3)" strokeWidth={1.6} />
      {PROFILE_POINTS.map((p) => (
        <circle key={p.id} cx={t[p.id].x} cy={t[p.id].y} r={p.id === id ? 6 : 2.2} fill={p.id === id ? 'var(--accent)' : 'var(--text-3)'} />
      ))}
    </svg>
  )
}

export function ProfileFlow({ id }: { id: string }) {
  const { analysis, profileUrl, save, setAnalysis } = useAnalysis(id)
  const [camera, setCamera] = useState(false)
  const [working, setWorking] = useState(false)
  const [anchors, setAnchors] = useState<Partial<Record<'prn' | 'me' | 'ea', Vec2>>>({})
  const [anchorStep, setAnchorStep] = useState(0)
  const [points, setPoints] = useState<ProfilePoints | null>(null)
  const [editing, setEditing] = useState<ProfilePointId | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const prof = analysis?.profile
  const current = points ?? prof?.points ?? null
  const confirmed = prof?.confirmed ?? 0

  const box = useMemo(() => {
    if (!prof) return { x: 0, y: 0, w: 1, h: 1 }
    if (!current) return { x: 0, y: 0, w: prof.width, h: prof.height }
    const all = Object.values(current)
    const xs = all.map((p) => p.x)
    const ys = all.map((p) => p.y)
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    const pad = Math.max(w, h) * 0.12
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: w + 2 * pad, h: h + 2 * pad }
  }, [prof, current])

  if (analysis === null) return <Missing />
  if (analysis === undefined) {
    return (
      <div className="screen">
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    )
  }

  const choose = async (file: Blob) => {
    setCamera(false)
    setWorking(true)
    try {
      const next = await attachProfile(analysis, file)
      setAnalysis(next)
      setAnchors({})
      setAnchorStep(0)
      setPoints(null)
    } finally {
      setWorking(false)
    }
  }

  const topbar = (title: string, onBack: () => void = () => back()) => (
    <div className="topbar">
      <button className="icon-btn" aria-label="Back" onClick={onBack}>
        <Back />
      </button>
      <div className="title">{title}</div>
      <div className="spacer" />
    </div>
  )

  const picker = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void choose(f)
        }}
      />
      {camera && <CameraCapture mode="profile" onCapture={(b) => void choose(b)} onClose={() => setCamera(false)} />}
    </>
  )

  // 1. No side photo yet.
  if (!prof || !profileUrl) {
    return (
      <div className="screen">
        {topbar('Side profile')}
        <div className="stack" style={{ gap: 8 }}>
          <h1>A side photo</h1>
          <p className="muted">You’ll tap fifteen points along your profile — nose, lips, chin, jaw, neck — and Facet measures the angles between them.</p>
        </div>
        <PhotoTips profile />
        {working ? (
          <div className="row">
            <div className="spinner" /> <span>Opening photo…</span>
          </div>
        ) : (
          <div className="sticky-actions" style={{ flexDirection: 'column' }}>
            <button className="btn primary" onClick={() => setCamera(true)}>
              <Camera /> Take a photo
            </button>
            <button className="btn" onClick={() => input.current?.click()}>
              <Photo /> Choose from your photos
            </button>
          </div>
        )}
        {picker}
      </div>
    )
  }

  // 2. Three anchor taps place a template for the rest.
  if (!current) {
    const aid = ANCHORS[anchorStep] as 'prn' | 'me' | 'ea'
    const info = PROFILE_POINTS.find((p) => p.id === aid)!
    const placed = Object.entries(anchors).map(([k, p]) => ({ id: k, p: p!, dim: k !== aid }))
    const facing = anchors.prn && anchors.ea ? (anchors.prn.x < anchors.ea.x ? 'left' : 'right') : 'right'
    const next = async () => {
      if (anchorStep < 2) {
        setAnchorStep(anchorStep + 1)
        return
      }
      const pts = placeFromAnchors(anchors as Record<'prn' | 'me' | 'ea', Vec2>)
      setPoints(pts)
      await save({ ...analysis, profile: { ...prof, points: pts, confirmed: 3 } })
    }
    return (
      <div className="screen">
        {topbar(`Point ${anchorStep + 1} of ${PROFILE_POINTS.length}`, () => (anchorStep ? setAnchorStep(anchorStep - 1) : back()))}
        <div className="row card" style={{ gap: 14 }}>
          <PointDiagram id={aid} facing={facing} />
          <div className="stack" style={{ gap: 4 }}>
            <strong>Tap: {info.name.toLowerCase()}</strong>
            <span className="small muted">{info.hint}</span>
          </div>
        </div>
        <PointEditor
          src={profileUrl}
          width={prof.width}
          height={prof.height}
          points={placed}
          activeId={aid}
          onSelect={() => {}}
          onMove={(_, p) => setAnchors((a) => ({ ...a, [aid]: p }))}
          initialBox={box}
          aspect={3 / 4}
          tapToPlace
          hint={anchors[aid] ? 'Drag to fine-tune, or tap again' : 'Tap the photo to place the point'}
        />
        <div className="sticky-actions">
          <button className="btn" style={{ flex: 'none' }} onClick={() => input.current?.click()}>
            New photo
          </button>
          <button className="btn primary" disabled={!anchors[aid]} onClick={next}>
            Next
          </button>
        </div>
        {picker}
      </div>
    )
  }

  const facing = current.prn.x < current.ea.x ? 'left' : 'right'
  const silhouette: Shape[] = [{ t: 'poly', pts: OUTLINE.map((k) => current[k]), tone: 'muted', dash: true }]
  const heightPx = Math.hypot(current.n.x - current.me.x, current.n.y - current.me.y)
  const move = (pid: string, p: Vec2) => setPoints({ ...current, [pid]: p })
  const persist = (patch: Partial<NonNullable<typeof prof>>) => save({ ...analysis, profile: { ...prof, points: current, ...patch } })

  // 3. Step through the remaining points, each seeded by the template.
  if (confirmed < PROFILE_POINTS.length) {
    const info = PROFILE_POINTS[confirmed]
    return (
      <div className="screen">
        {topbar(`Point ${confirmed + 1} of ${PROFILE_POINTS.length}`, () => (confirmed > 3 ? void persist({ confirmed: confirmed - 1 }) : back()))}
        <div className="progress">
          <span style={{ width: `${(confirmed / PROFILE_POINTS.length) * 100}%` }} />
        </div>
        <div className="row card" style={{ gap: 14 }}>
          <PointDiagram id={info.id} facing={facing} />
          <div className="stack" style={{ gap: 4 }}>
            <strong>{info.name}</strong>
            <span className="small muted">{info.hint}</span>
          </div>
        </div>
        <PointEditor
          src={profileUrl}
          width={prof.width}
          height={prof.height}
          points={PROFILE_POINTS.map((p, i) => ({ id: p.id, p: current[p.id], dim: i > confirmed || (i < confirmed && p.id !== info.id) }))}
          activeId={info.id}
          onSelect={() => {}}
          onMove={move}
          guides={silhouette}
          initialBox={box}
          focus={current[info.id]}
          focusWidth={heightPx * 0.75}
          aspect={3 / 4}
          hint="Drag anywhere to move the point"
        />
        <div className="sticky-actions">
          <button className="btn primary" onClick={() => void persist({ confirmed: confirmed + 1 })}>
            {confirmed + 1 === PROFILE_POINTS.length ? 'Finish' : 'Next'}
          </button>
        </div>
      </div>
    )
  }

  // 4. All placed: review and edit any point freely.
  const info = PROFILE_POINTS.find((p) => p.id === editing)
  return (
    <div className="screen">
      {topbar('Profile points')}
      <PointEditor
        src={profileUrl}
        width={prof.width}
        height={prof.height}
        points={PROFILE_POINTS.map((p) => ({ id: p.id, p: current[p.id] }))}
        activeId={editing}
        onSelect={(pid) => setEditing(pid as ProfilePointId | null)}
        onMove={move}
        onMoveEnd={() => void persist({})}
        guides={silhouette}
        initialBox={box}
        aspect={3 / 4}
        hint={editing ? 'Drag anywhere to move the point' : 'Tap a point to adjust it'}
      />
      <div className="card stack" style={{ gap: 4, minHeight: 74 }}>
        {info ? (
          <>
            <strong>{info.name}</strong>
            <span className="small muted">{info.hint}</span>
          </>
        ) : (
          <span className="small muted">All fifteen points are placed. Tap any to fine-tune it, or carry on to the results.</span>
        )}
      </div>
      <div className="sticky-actions">
        <button className="btn" style={{ flex: 'none' }} onClick={() => input.current?.click()}>
          New photo
        </button>
        <button
          className="btn primary"
          onClick={async () => {
            await persist({})
            go({ name: 'report', id, section: 'profile' }, true)
          }}
        >
          See profile results
        </button>
      </div>
      {picker}
    </div>
  )
}
