import { useState } from 'react'
import { SHAPE_TEXT } from '../../content/shapes'
import { back, go } from '../../router'
import { deleteAnalysis } from '../../store/db'
import { useAnalyses } from '../../store/useAnalysis'
import { formatDate } from '../format'
import { Back, Compare, Plus, Trash } from '../components/Icons'

export function History() {
  const { list, reload } = useAnalyses()
  const [selecting, setSelecting] = useState(false)
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]))
  const remove = async (id: string) => {
    if (!confirm('Delete this analysis and its photos from this device?')) return
    await deleteAnalysis(id)
    reload()
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => back()}>
          <Back />
        </button>
        <div className="title">History</div>
        <button className="icon-btn" aria-label="New analysis" onClick={() => go({ name: 'new' })}>
          <Plus />
        </button>
      </div>

      {list && list.length > 1 && (
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="small muted">{selecting ? 'Pick two to compare.' : `${list.length} analyses on this device.`}</span>
          <button
            className="link-btn row"
            style={{ gap: 6 }}
            onClick={() => {
              setSelecting(!selecting)
              setPicked([])
            }}
          >
            <Compare style={{ width: 18, height: 18 }} /> {selecting ? 'Cancel' : 'Compare'}
          </button>
        </div>
      )}

      {list === null ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <p>No analyses yet.</p>
          <button className="btn primary" style={{ marginTop: 16 }} onClick={() => go({ name: 'new' })}>
            Analyse my face
          </button>
        </div>
      ) : (
        <div className="list">
          {list.map((a) => (
            <div key={a.id} className="list-item" style={{ padding: 0 }}>
              <button
                className="list-item"
                aria-pressed={selecting ? picked.includes(a.id) : undefined}
                onClick={() => (selecting ? toggle(a.id) : go({ name: 'report', id: a.id }))}
                style={{ background: selecting && picked.includes(a.id) ? 'var(--accent-soft)' : undefined }}
              >
                <img className="thumb" src={a.thumbnail} alt="" />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>
                    {formatDate(a.createdAt)}
                    {a.demo && <span className="chip" style={{ marginLeft: 8 }}>Demo</span>}
                  </div>
                  <div className="small muted">
                    {SHAPE_TEXT[a.summary.shape]?.name ?? a.summary.shape} · symmetry {a.summary.symmetry}% · {a.sex} ideals
                    {a.summary.profile !== null ? ' · profile' : ''}
                  </div>
                </div>
                <div className="num" style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>
                  {a.summary.harmony}
                </div>
              </button>
              {!selecting && (
                <button className="icon-btn" aria-label="Delete" style={{ marginRight: 12, background: 'transparent', border: 0, color: 'var(--text-3)' }} onClick={() => remove(a.id)}>
                  <Trash />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selecting && (
        <div className="sticky-actions">
          <button className="btn primary" disabled={picked.length !== 2} onClick={() => go({ name: 'compare', a: picked[0], b: picked[1] })}>
            Compare {picked.length}/2
          </button>
        </div>
      )}
    </div>
  )
}
