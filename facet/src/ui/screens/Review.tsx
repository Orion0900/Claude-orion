import { useMemo, useState } from 'react'
import { analyzeFront } from '../../face/analyze'
import { fromUpright } from '../../face/frame'
import type { Shape } from '../../face/metrics/types'
import { FRONT_POINTS, type FrontPointId, type PointAdjustments } from '../../face/points'
import type { Vec2 } from '../../face/types'
import { back, go } from '../../router'
import { deleteAnalysis } from '../../store/db'
import { useAnalysis } from '../../store/useAnalysis'
import { Alert, Back, Reset } from '../components/Icons'
import { PointEditor } from '../components/PointEditor'

export function Review({ id }: { id: string }) {
  const { analysis, frontUrl, save } = useAnalysis(id)
  const [adjustments, setAdjustments] = useState<PointAdjustments | null>(null)
  const [hidden, setHidden] = useState<boolean | null>(null)
  const [active, setActive] = useState<FrontPointId | null>(null)
  const [saving, setSaving] = useState(false)

  const adj = adjustments ?? analysis?.front.adjustments ?? {}
  const hairlineHidden = hidden ?? analysis?.front.hairlineHidden ?? false

  const front = useMemo(() => {
    if (!analysis) return null
    const f = analysis.front
    return analyzeFront({ detection: f.detection, pixels: f.pixels, adjustments: adj, hairlineHidden, focal35: f.focal35 }, { sex: analysis.sex })
  }, [analysis, adj, hairlineHidden])

  if (analysis === null) return <Missing />
  if (!analysis || !front || !frontUrl) {
    return (
      <div className="screen">
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    )
  }

  const P = front.display.points
  const W = Math.hypot(P.zyL.x - P.zyR.x, P.zyL.y - P.zyR.y)
  const left = Math.min(P.zyR.x, P.ftR.x, P.goR.x) - 0.12 * W
  const right = Math.max(P.zyL.x, P.ftL.x, P.goL.x) + 0.12 * W
  const box = { x: left, y: P.tr.y - 0.18 * W, w: right - left, h: P.me.y - P.tr.y + 0.3 * W }
  const hline = (y: number, tone: 'muted' | 'accent' = 'muted', dash = true): Shape => ({ t: 'line', a: { x: left, y }, b: { x: right, y }, tone, dash })
  const guides: Shape[] = [hline(P.tr.y, front.hairline === 'detected' || front.hairline === 'adjusted' ? 'accent' : 'muted'), hline(P.g.y), hline(P.sn.y), hline(P.me.y)]

  const issues = front.quality.checks.filter((c) => c.status !== 'good' && c.id !== 'hairline')
  const activeInfo = FRONT_POINTS.find((p) => p.id === active)

  const move = (pid: string, p: Vec2) => {
    const photo = fromUpright(front.frame, p)
    setAdjustments({ ...adj, [pid]: photo })
    if (pid === 'tr') setHidden(false)
  }
  const resetActive = () => {
    if (!active) return
    const next = { ...adj }
    delete next[active]
    setAdjustments(next)
  }
  const done = async () => {
    setSaving(true)
    await save({ ...analysis, front: { ...analysis.front, adjustments: adj, hairlineHidden } })
    go({ name: 'report', id }, true)
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => back()}>
          <Back />
        </button>
        <div className="title">Check the points</div>
        <div className="spacer" />
      </div>

      {issues.length > 0 && (
        <div className={`banner ${issues.some((c) => c.status === 'bad') ? 'bad' : ''}`}>
          <Alert />
          <div className="stack" style={{ gap: 3 }}>
            <strong>{issues.map((c) => c.title).join(' · ')}</strong>
            <span className="small muted">{issues[0].detail}</span>
            <button
              className="link-btn"
              style={{ alignSelf: 'flex-start' }}
              onClick={async () => {
                await deleteAnalysis(id)
                go({ name: 'new' }, true)
              }}
            >
              Retake the photo
            </button>
          </div>
        </div>
      )}

      <PointEditor
        src={frontUrl}
        width={analysis.front.width}
        height={analysis.front.height}
        frame={front.frame}
        points={FRONT_POINTS.map((q) => ({ id: q.id, p: P[q.id] }))}
        activeId={active}
        onSelect={(pid) => setActive(pid as FrontPointId | null)}
        onMove={move}
        guides={guides}
        initialBox={box}
        aspect={3 / 4}
        hint={active ? 'Drag anywhere to move the point' : 'Tap a point to adjust it'}
      />

      <div className="card stack" style={{ gap: 6, minHeight: 92 }}>
        {activeInfo ? (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>{activeInfo.name}</strong>
              {adj[activeInfo.id] && (
                <button className="link-btn row" style={{ gap: 4 }} onClick={resetActive}>
                  <Reset style={{ width: 16, height: 16 }} /> Reset
                </button>
              )}
            </div>
            <p className="small muted">{activeInfo.hint}</p>
          </>
        ) : (
          <>
            <strong>Facet placed {FRONT_POINTS.length} measuring points.</strong>
            <p className="small muted">
              They’re usually right. If one sits off its feature — most often the hairline or a jaw corner — tap it and drag anywhere to nudge it into place.
            </p>
          </>
        )}
      </div>

      <label className="card row" style={{ gap: 12 }}>
        <div className="grow stack" style={{ gap: 2 }}>
          <strong>{front.hairline === 'detected' ? 'Hairline found' : front.hairline === 'adjusted' ? 'Hairline placed by you' : 'Hairline not found'}</strong>
          <span className="small muted">
            {hairlineHidden ? 'Estimating it from your other proportions.' : 'Hidden by a fringe, or receding? Switch this on and it will be estimated instead.'}
          </span>
        </div>
        <button
          className="toggle"
          role="switch"
          aria-checked={hairlineHidden}
          aria-label="Hairline hidden or receding"
          onClick={() => {
            const next = !hairlineHidden
            setHidden(next)
            if (next) {
              const nextAdj = { ...adj }
              delete nextAdj.tr
              setAdjustments(nextAdj)
            }
          }}
        />
      </label>

      <div className="sticky-actions">
        {Object.keys(adj).length > 0 && (
          <button className="btn" style={{ flex: 'none' }} onClick={() => setAdjustments({})}>
            Reset all
          </button>
        )}
        <button className="btn primary" onClick={done} disabled={saving}>
          {saving ? 'Saving…' : 'See my results'}
        </button>
      </div>
    </div>
  )
}

export function Missing() {
  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => go({ name: 'home' }, true)}>
          <Back />
        </button>
        <div className="title" />
        <div className="spacer" />
      </div>
      <div className="empty">
        <h2>Not found</h2>
        <p className="muted" style={{ marginTop: 8 }}>
          This analysis isn’t on this device any more.
        </p>
        <button className="btn primary" style={{ marginTop: 18 }} onClick={() => go({ name: 'home' }, true)}>
          Go home
        </button>
      </div>
    </div>
  )
}
