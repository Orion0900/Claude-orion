import { useMemo } from 'react'
import { GROUP_TEXT } from '../../content/groups'
import { METRIC_TEXT } from '../../content/metrics'
import type { GroupId } from '../../face/metrics/types'
import { back } from '../../router'
import { compute } from '../../store/analysis'
import { useAnalysis } from '../../store/useAnalysis'
import { formatDate } from '../format'
import { Back } from '../components/Icons'
import { scoreColor } from '../components/ScoreRing'
import { Missing } from './Review'

/** Two analyses side by side: the same measurements, and how each moved. */
export function CompareScreen({ a: aId, b: bId }: { a: string; b: string }) {
  const A = useAnalysis(aId)
  const B = useAnalysis(bId)
  // Older first, so the change reads forwards in time.
  const [first, second] = A.analysis && B.analysis && A.analysis.createdAt > B.analysis.createdAt ? [B, A] : [A, B]
  const sex = first.analysis?.sex ?? 'female'
  const ca = useMemo(() => (first.analysis ? compute(first.analysis, sex) : null), [first.analysis, sex])
  const cb = useMemo(() => (second.analysis ? compute(second.analysis, sex) : null), [second.analysis, sex])

  if (A.analysis === null || B.analysis === null) return <Missing />
  if (!ca || !cb || !first.analysis || !second.analysis) {
    return (
      <div className="screen">
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    )
  }

  const rows = ca.metrics
    .map((m) => ({ m, n: cb.metrics.find((x) => x.id === m.id) }))
    .filter((r) => r.n)
  const groups: GroupId[] = ['proportions', 'eyes', 'nose', 'lips', 'jaw', 'profile']

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => back({ name: 'history' })}>
          <Back />
        </button>
        <div className="title">Compare</div>
        <div className="spacer" />
      </div>

      <div className="row" style={{ gap: 12 }}>
        {[
          { an: first.analysis, c: ca },
          { an: second.analysis, c: cb },
        ].map(({ an, c }) => (
          <div key={an.id} className="card grow stack" style={{ alignItems: 'center', gap: 8, padding: 12 }}>
            <img className="big-thumb" src={an.thumbnail} alt="" />
            <div className="small muted">{formatDate(an.createdAt)}</div>
            <div className="row" style={{ gap: 14 }}>
              <div className="stack" style={{ alignItems: 'center', gap: 0 }}>
                <span className="num" style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 600 }}>
                  {c.harmony}
                </span>
                <span className="tiny faint">HARMONY</span>
              </div>
              <div className="stack" style={{ alignItems: 'center', gap: 0 }}>
                <span className="num" style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 600 }}>
                  {Math.round(c.front.symmetry.score)}
                </span>
                <span className="tiny faint">SYMMETRY</span>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="small faint">Both compared with {sex} ideals. Differences under a few percent are within what lighting and pose change between photos.</p>

      {groups.map((g) => {
        const rs = rows.filter((r) => r.m.group === g)
        if (!rs.length) return null
        return (
          <div key={g} className="card stack" style={{ gap: 8 }}>
            <h3>{GROUP_TEXT[g]?.title ?? g}</h3>
            <div className="stack" style={{ gap: 0 }}>
              {rs.map(({ m, n }) => {
                const delta = n!.score !== undefined && m.score !== undefined ? n!.score - m.score : null
                return (
                  <div key={m.id} className="highlight" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                    <span className="small muted">{METRIC_TEXT[m.id]?.title ?? m.id}</span>
                    <span className="row num" style={{ gap: 8 }}>
                      <span className="faint">{m.display}</span>
                      <span className="faint">→</span>
                      <span className="grow">{n!.display}</span>
                      <span style={{ color: delta === null ? 'var(--text-3)' : scoreColor(n!.score), fontWeight: 650 }}>
                        {delta === null ? '—' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`}
                      </span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
