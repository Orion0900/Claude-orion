import { useState } from 'react'
import { SHAPE_TEXT } from '../../content/shapes'
import { go } from '../../router'
import { createDemo } from '../../store/analysis'
import { useSettings } from '../../store/settings'
import { useAnalyses } from '../../store/useAnalysis'
import { formatDate } from '../format'
import { FaceArt } from '../components/FaceArt'
import { Clock, Gear, Lock, Plus, Profile } from '../components/Icons'
import { ScoreRing } from '../components/ScoreRing'
import { PhotoTips } from './NewAnalysis'

export function Home() {
  const { list } = useAnalyses()
  const [settings] = useSettings()
  const [demo, setDemo] = useState<{ progress: number | null; error?: string } | null>(null)
  const latest = list?.[0]

  const openDemo = async () => {
    setDemo({ progress: null })
    const r = await createDemo(settings.sex, (l, t) => setDemo({ progress: t ? l / t : null }))
    if (r.ok) go({ name: 'report', id: r.id })
    else setDemo({ progress: null, error: r.message })
  }

  return (
    <div className="screen">
      <div className="row" style={{ paddingTop: 6 }}>
        <div className="grow">
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em' }}>Facet</div>
        </div>
        {list && list.length > 0 && (
          <button className="icon-btn" aria-label="History" onClick={() => go({ name: 'history' })}>
            <Clock />
          </button>
        )}
        <button className="icon-btn" aria-label="Settings" onClick={() => go({ name: 'settings' })}>
          <Gear />
        </button>
      </div>

      {list === null && (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      )}

      {list && !latest && (
        <>
          <FaceArt className="hero-art" />
          <div className="stack fade-up" style={{ gap: 10, textAlign: 'center' }}>
            <h1>See your face in proportion</h1>
            <p className="muted">One front photo gives you thirty measurements, a harmony and symmetry score, your face shape and ideas that suit it.</p>
          </div>
          <button className="btn primary block" onClick={() => go({ name: 'new' })}>
            Analyse my face
          </button>
          <button className="btn block" onClick={openDemo} disabled={!!demo && !demo.error}>
            {demo && !demo.error ? (demo.progress !== null ? `Preparing… ${Math.round(demo.progress * 100)}%` : 'Preparing the demo…') : 'See a demo report first'}
          </button>
          {demo?.error && <p className="small" style={{ color: 'var(--bad)' }}>{demo.error}</p>}
          <p className="small faint" style={{ textAlign: 'center', marginTop: -6 }}>
            The demo face is rendered from the average-face mesh, not a real person.
          </p>
          <PhotoTips />
        </>
      )}

      {latest && (
        <>
          <button className="card stack fade-up" style={{ gap: 14, textAlign: 'left' }} onClick={() => go({ name: 'report', id: latest.id })}>
            <div className="row" style={{ gap: 14 }}>
              <img className="big-thumb" src={latest.thumbnail} alt="" />
              <div className="grow stack" style={{ gap: 4 }}>
                <div className="eyebrow">{latest.demo ? 'Demo analysis' : 'Latest analysis'}</div>
                <h2>{SHAPE_TEXT[latest.summary.shape]?.name ?? latest.summary.shape} face</h2>
                <div className="small muted">
                  {formatDate(latest.createdAt)} · compared with {latest.sex} ideals
                </div>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'space-around' }}>
              <ScoreRing value={latest.summary.harmony} label="Harmony" size={92} />
              <ScoreRing value={latest.summary.symmetry} label="Symmetry" size={92} color="var(--ideal)" />
              {latest.summary.profile !== null ? (
                <ScoreRing value={latest.summary.profile * 10} label="Profile" size={92} color="var(--text-2)" />
              ) : (
                <div className="stack" style={{ alignItems: 'center', gap: 4, width: 92 }}>
                  <div className="icon-btn" style={{ width: 54, height: 54 }}>
                    <Profile />
                  </div>
                  <span className="tiny faint">No profile yet</span>
                </div>
              )}
            </div>
            <div className="link-btn" style={{ textAlign: 'center' }}>
              Open the full report
            </div>
          </button>

          <div className="row">
            <button className="btn primary grow" onClick={() => go({ name: 'new' })}>
              <Plus /> New analysis
            </button>
            {latest.summary.profile === null && !latest.demo && (
              <button className="btn grow" onClick={() => go({ name: 'profile', id: latest.id })}>
                <Profile /> Add profile
              </button>
            )}
          </div>

          {list.length > 1 && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3>Earlier</h3>
                <button className="link-btn" onClick={() => go({ name: 'history' })}>
                  See all
                </button>
              </div>
              <div className="list">
                {list.slice(1, 4).map((a) => (
                  <button key={a.id} className="list-item" onClick={() => go({ name: 'report', id: a.id })}>
                    <img className="thumb" src={a.thumbnail} alt="" />
                    <div className="grow">
                      <div style={{ fontWeight: 600 }}>{formatDate(a.createdAt)}</div>
                      <div className="small muted">
                        {SHAPE_TEXT[a.summary.shape]?.name ?? a.summary.shape} · symmetry {a.summary.symmetry}%
                      </div>
                    </div>
                    <div className="num" style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 600 }}>
                      {a.summary.harmony}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="row small faint" style={{ justifyContent: 'center', marginTop: 'auto', paddingTop: 12 }}>
        <Lock style={{ width: 15, height: 15 }} />
        <span>Analysed on this phone. Photos never leave it.</span>
        <button className="link-btn small" onClick={() => go({ name: 'about' })}>
          About
        </button>
      </div>
    </div>
  )
}
