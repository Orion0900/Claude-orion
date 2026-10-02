import { useEffect, useMemo, useRef, useState } from 'react'
import { GROUP_TEXT } from '../../content/groups'
import { METRIC_TEXT } from '../../content/metrics'
import { SHAPE_TEXT } from '../../content/shapes'
import { FINDING_TEXT } from '../../content/symmetry'
import type { GroupId, MetricResult } from '../../face/metrics/types'
import type { Sex } from '../../face/types'
import { back, go } from '../../router'
import { compute, profileComplete } from '../../store/analysis'
import { deleteAnalysis } from '../../store/db'
import { useSettings } from '../../store/settings'
import { useAnalysis } from '../../store/useAnalysis'
import { formatDate } from '../format'
import { FaceShapeCard } from '../components/FaceShapeCard'
import { Alert, Back, Check, Info, Print, Profile, Share, Trash } from '../components/Icons'
import { adviceFor, MetricCard, verdictOf, type PhotoRef } from '../components/MetricCard'
import { ScoreRing, scoreColor } from '../components/ScoreRing'
import { asymmetryColor, SymmetryMap } from '../components/SymmetryMap'
import { shareSummary } from '../share'
import { Missing } from './Review'

const SECTIONS: { id: string; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'proportions', label: 'Proportions' },
  { id: 'eyes', label: 'Eyes' },
  { id: 'nose', label: 'Nose' },
  { id: 'lips', label: 'Lips' },
  { id: 'jaw', label: 'Jaw & chin' },
  { id: 'symmetry', label: 'Symmetry' },
  { id: 'profile', label: 'Profile' },
  { id: 'photo', label: 'Photo' },
]

const GROUP_ORDER: GroupId[] = ['proportions', 'eyes', 'nose', 'lips', 'jaw', 'symmetry', 'profile']

export function Report({ id, section }: { id: string; section?: string }) {
  const [settings] = useSettings()
  const { analysis, frontUrl, profileUrl, save } = useAnalysis(id)
  const [current, setCurrent] = useState('overview')
  const [busy, setBusy] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)

  const computed = useMemo(() => (analysis ? compute(analysis) : null), [analysis])

  // Jump to a section asked for in the URL, once everything has rendered.
  useEffect(() => {
    if (!computed || !section) return
    const t = setTimeout(() => document.getElementById(`s-${section}`)?.scrollIntoView({ block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [computed, section])

  // Highlight the section being read.
  useEffect(() => {
    if (!computed) return
    const els = SECTIONS.map((s) => document.getElementById(`s-${s.id}`)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) setCurrent(visible[0].target.id.slice(2))
      },
      { rootMargin: '-120px 0px -55% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [computed])

  // Keep the active chip in view.
  useEffect(() => {
    scroller.current?.querySelector(`[data-id="${current}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [current])

  if (analysis === null) return <Missing />
  if (!analysis || !computed || !frontUrl) {
    return (
      <div className="screen">
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    )
  }

  const { front, profile, metrics, groups, harmony } = computed
  const sex = analysis.sex
  const photo: PhotoRef = { src: frontUrl, width: analysis.front.width, height: analysis.front.height, frame: front.frame }
  const profilePhoto: PhotoRef | null = profileUrl && analysis.profile ? { src: profileUrl, width: analysis.profile.width, height: analysis.profile.height, frame: null } : null
  const graded = metrics.filter((m) => m.score !== undefined && m.weight > 0)
  const ranked = [...graded].sort((a, b) => b.score! - a.score! || b.weight - a.weight)
  const strengths = ranked.filter((m) => m.score! >= 8.5).slice(0, 3)
  const distinctive = [...graded].filter((m) => m.score! < 8).sort((a, b) => a.score! - b.score!).slice(0, 3)
  const suggestions = distinctive
    .map((m) => ({ m, a: adviceFor(m, sex).find((x) => x.kind !== 'clinical') }))
    .filter((x): x is { m: MetricResult; a: NonNullable<typeof x.a> } => !!x.a)
  const quality = front.quality
  const shapeName = SHAPE_TEXT[front.shape.shape]?.name ?? front.shape.shape
  const card = (m: MetricResult, p: PhotoRef = photo) => <MetricCard key={m.id} m={m} photo={p} sex={sex} showClinical={settings.showClinical} showMm={settings.showMm} />
  const scrollTo = (sid: string) => document.getElementById(sid)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const setSex = (next: Sex) => {
    if (next !== sex) void save({ ...analysis, sex: next })
  }
  const share = async () => {
    setBusy('share')
    try {
      await shareSummary({ analysis, computed, photoUrl: frontUrl })
    } finally {
      setBusy(null)
    }
  }
  const remove = async () => {
    if (!confirm('Delete this analysis and its photos from this device?')) return
    await deleteAnalysis(id)
    go({ name: 'home' }, true)
  }

  const group = (gid: GroupId) => metrics.filter((m) => m.group === gid)
  const groupSection = (gid: GroupId, sid: string) => {
    const score = groups.find((g) => g.id === gid)?.score
    return (
      <section className="report-section" id={`s-${sid}`} key={sid}>
        <div className="section-head">
          <h2>{GROUP_TEXT[gid]?.title ?? gid}</h2>
          {score !== null && score !== undefined && (
            <span className="num" style={{ color: scoreColor(score), fontWeight: 650 }}>
              {score.toFixed(1)}
              <span className="faint"> / 10</span>
            </span>
          )}
        </div>
        {GROUP_TEXT[gid]?.intro && <p className="muted small">{GROUP_TEXT[gid].intro}</p>}
        {group(gid).map((m) => card(m))}
      </section>
    )
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => back()}>
          <Back />
        </button>
        <div className="title">{analysis.demo ? 'Demo report' : formatDate(analysis.createdAt)}</div>
        <button className="icon-btn" aria-label="Share summary" onClick={share} disabled={busy === 'share'}>
          <Share />
        </button>
      </div>

      <div className="section-nav" ref={scroller}>
        {SECTIONS.map((s) => (
          <button key={s.id} data-id={s.id} aria-current={current === s.id} onClick={() => scrollTo(`s-${s.id}`)}>
            {s.label}
          </button>
        ))}
      </div>

      <section className="report-section" id="s-overview">
        <div className="card stack" style={{ gap: 16 }}>
          <div className="row" style={{ gap: 14 }}>
            <img className="big-thumb" src={analysis.thumbnail} alt="" />
            <div className="grow stack" style={{ gap: 4 }}>
              <div className="eyebrow">Facial analysis</div>
              <h2>{shapeName} face</h2>
              <div className="small muted">
                {metrics.length} measurements{profile ? ' · front and profile' : ''}
              </div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'space-around' }}>
            <ScoreRing value={harmony} label="Harmony" size={104} />
            <ScoreRing value={front.symmetry.score} label="Symmetry" size={104} color="var(--ideal)" text={`${Math.round(front.symmetry.score)}`} />
          </div>
          <p className="small muted">
            Harmony sums up how closely your proportions sit to their ideal ranges, each weighted by how much it shapes the face. It is a description of geometry against an average, not a verdict on how you look.
          </p>
          <div className="segmented" role="group" aria-label="Compared with">
            <button aria-pressed={sex === 'female'} onClick={() => setSex('female')}>
              Female ideals
            </button>
            <button aria-pressed={sex === 'male'} onClick={() => setSex('male')}>
              Male ideals
            </button>
          </div>
        </div>

        {quality.overall !== 'good' && (
          <button className={`banner ${quality.overall === 'poor' ? 'bad' : ''}`} style={{ textAlign: 'left' }} onClick={() => scrollTo('s-photo')}>
            <Alert />
            <div className="stack" style={{ gap: 2 }}>
              <strong>{quality.overall === 'poor' ? 'This photo limits the accuracy' : 'A few things in the photo affect accuracy'}</strong>
              <span className="small muted">{quality.checks.filter((c) => c.status !== 'good').map((c) => c.title).join(' · ')}</span>
            </div>
          </button>
        )}

        <div className="card stack" style={{ gap: 12 }}>
          <h3>By area</h3>
          <div className="group-bars">
            {GROUP_ORDER.map((gid) => {
              const g = groups.find((x) => x.id === gid)
              if (!g || g.score === null) return null
              return (
                <button key={gid} className="group-bar" onClick={() => scrollTo(`s-${gid}`)}>
                  <span>{GROUP_TEXT[gid]?.title ?? gid}</span>
                  <span className="bar">
                    <span style={{ width: `${g.score * 10}%`, background: scoreColor(g.score) }} />
                  </span>
                  <span className="num" style={{ textAlign: 'right', fontWeight: 650 }}>
                    {g.score.toFixed(1)}
                  </span>
                </button>
              )
            })}
          </div>
          {!profile && (
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => go({ name: 'profile', id })}>
              <Profile /> Add a side profile for 12 more measurements
            </button>
          )}
        </div>

        {strengths.length > 0 && (
          <div className="card">
            <h3 style={{ marginBottom: 4 }}>Strongest proportions</h3>
            {strengths.map((m) => (
              <Highlight key={m.id} m={m} onClick={() => scrollTo(`m-${m.id}`)} />
            ))}
          </div>
        )}

        <div className="card">
          <h3 style={{ marginBottom: 4 }}>What stands out</h3>
          {distinctive.length ? (
            distinctive.map((m) => <Highlight key={m.id} m={m} onClick={() => scrollTo(`m-${m.id}`)} />)
          ) : (
            <p className="muted small" style={{ paddingTop: 6 }}>
              Nothing sits far from its ideal range — your proportions are balanced throughout.
            </p>
          )}
        </div>

        {suggestions.length > 0 && (
          <div className="card stack" style={{ gap: 10 }}>
            <h3>Ideas to try</h3>
            <ul className="advice-list" style={{ marginTop: 0 }}>
              {suggestions.map(({ m, a }) => (
                <li key={m.id} style={{ gridTemplateColumns: '18px 1fr' }}>
                  <Check style={{ width: 16, height: 16, color: 'var(--accent)', marginTop: 3 }} />
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <FaceShapeCard front={front} photo={photo} sex={sex} />
      </section>

      {groupSection('proportions', 'proportions')}
      {groupSection('eyes', 'eyes')}
      {groupSection('nose', 'nose')}
      {groupSection('lips', 'lips')}
      {groupSection('jaw', 'jaw')}

      <section className="report-section" id="s-symmetry">
        <div className="section-head">
          <h2>{GROUP_TEXT.symmetry?.title ?? 'Symmetry'}</h2>
          <span className="num" style={{ color: scoreColor(front.symmetry.score / 10), fontWeight: 650 }}>
            {Math.round(front.symmetry.score)}%
          </span>
        </div>
        {GROUP_TEXT.symmetry?.intro && <p className="muted small">{GROUP_TEXT.symmetry.intro}</p>}
        <div className="card metric">
          <div className="metric-photo">
            <SymmetryMap front={front} photo={photo} />
          </div>
          <div className="row tiny faint" style={{ justifyContent: 'space-between' }}>
            <span className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: asymmetryColor(0) }} /> matched
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: asymmetryColor(2) }} /> 2% apart
            </span>
            <span className="row" style={{ gap: 6 }}>
              <span className="dot" style={{ background: asymmetryColor(3.5) }} /> 3.5%+
            </span>
          </div>
          <p className="small muted">
            Each point is compared with its partner on the other side, mirrored across your midline. On average they sit {front.symmetry.asymmetry.toFixed(1)}% of your face’s width apart.
          </p>
          <div className="group-bars">
            {front.symmetry.regions.map((r) => (
              <div key={r.id} className="group-bar">
                <span style={{ textTransform: 'capitalize' }}>{r.id}</span>
                <span className="bar">
                  <span style={{ width: `${r.score}%`, background: asymmetryColor(r.asymmetry) }} />
                </span>
                <span className="num" style={{ textAlign: 'right', fontWeight: 650 }}>
                  {Math.round(r.score)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: 4 }}>Side to side</h3>
          {front.symmetry.findings.map((f) => {
            const t = FINDING_TEXT[f.id]
            // With millimetres switched off, show a distance as a share of face width instead.
            const faceW = Math.hypot(front.display.points.zyL.x - front.display.points.zyR.x, front.display.points.zyL.y - front.display.points.zyR.y)
            const amount =
              f.unit === 'mm'
                ? settings.showMm || !front.mmPerPx
                  ? `${f.amount.toFixed(1)} mm`
                  : `${((f.amount / front.mmPerPx / faceW) * 100).toFixed(1)}% of face width`
                : f.unit === '°'
                  ? `${f.amount.toFixed(1)}°`
                  : `${f.amount.toFixed(1)}%`
            return (
              <div key={f.id} className="highlight" style={{ alignItems: 'flex-start' }}>
                <span className="dot" style={{ marginTop: 7, background: f.level === 0 ? 'var(--good)' : f.level === 1 ? 'var(--accent)' : 'var(--warn)' }} />
                <div className="stack" style={{ gap: 3 }}>
                  <strong className="small">{t?.title ?? f.id}</strong>
                  <span className="small muted">{f.level === 0 ? `Practically even (${amount}).` : (t?.describe(amount, f.side) ?? amount)}</span>
                  {f.level === 2 && t?.tip && <span className="small faint">{t.tip}</span>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="report-section" id="s-profile">
        <div className="section-head">
          <h2>{GROUP_TEXT.profile?.title ?? 'Side profile'}</h2>
          {profile && (
            <span className="num" style={{ color: scoreColor(groups.find((g) => g.id === 'profile')?.score), fontWeight: 650 }}>
              {groups.find((g) => g.id === 'profile')?.score?.toFixed(1)}
              <span className="faint"> / 10</span>
            </span>
          )}
        </div>
        {GROUP_TEXT.profile?.intro && <p className="muted small">{GROUP_TEXT.profile.intro}</p>}
        {profile && profilePhoto ? (
          <>
            <p className="small faint">
              Millimetres are scaled {profile.scaleFrom === 'front' ? 'from your front photo' : 'from an average face height'}.{' '}
              <button className="link-btn small" onClick={() => go({ name: 'profile', id })}>
                Adjust profile points
              </button>
            </p>
            {profile.metrics.map((m) => card(m, profilePhoto))}
          </>
        ) : (
          <div className="card stack" style={{ gap: 12 }}>
            <p>
              A side photo adds the profile: nose angles and projection, lips against the E-line, chin projection, jaw angle and the neck–chin line.
            </p>
            <button className="btn primary" onClick={() => go({ name: 'profile', id })}>
              <Profile /> {analysis.profile && !profileComplete(analysis) ? 'Finish placing profile points' : 'Add a side profile'}
            </button>
          </div>
        )}
      </section>

      <section className="report-section" id="s-photo">
        <div className="section-head">
          <h2>About this photo</h2>
          <span className={`chip ${quality.overall === 'good' ? 'good' : quality.overall === 'fair' ? 'warn' : 'bad'}`}>
            {quality.overall === 'good' ? 'Good' : quality.overall === 'fair' ? 'Fair' : 'Limited'}
          </span>
        </div>
        <div className="card">
          {quality.checks.map((c) => (
            <div key={c.id} className="highlight" style={{ alignItems: 'flex-start' }}>
              <span className="dot" style={{ marginTop: 7, background: c.status === 'good' ? 'var(--good)' : c.status === 'warn' ? 'var(--warn)' : 'var(--bad)' }} />
              <div className="stack" style={{ gap: 2 }}>
                <strong className="small">{c.title}</strong>
                <span className="small muted">{c.detail}</span>
              </div>
            </div>
          ))}
          {front.mmPerPx && (
            <div className="highlight" style={{ alignItems: 'flex-start' }}>
              <span className="dot" style={{ marginTop: 7, background: 'var(--text-3)' }} />
              <div className="stack" style={{ gap: 2 }}>
                <strong className="small">Scale from the iris</strong>
                <span className="small muted">
                  Millimetres are estimated from your iris, which is close to 11.7 mm across in nearly every adult. Treat them as ± 5%.
                </span>
              </div>
            </div>
          )}
        </div>
        <div className="row no-print">
          <button className="btn grow" onClick={() => go({ name: 'review', id })}>
            Adjust points
          </button>
          <button className="btn grow" onClick={() => window.print()}>
            <Print /> Print / PDF
          </button>
        </div>
        <div className="card stack small muted" style={{ gap: 8 }}>
          <div className="row" style={{ gap: 8, color: 'var(--text-2)' }}>
            <Info style={{ width: 18, height: 18 }} />
            <strong>How to read this report</strong>
          </div>
          <p>
            Ideal ranges come from the classical proportion canons, facial anthropometry and studies of rated attractiveness. They describe averages of the faces studied, mostly young adults and, in the older literature, mostly of European descent. A result outside a range marks a difference, nothing more.
          </p>
          <p>This report is for curiosity and styling ideas. It isn’t medical advice, and clinical options are listed for information only.</p>
        </div>
        <button className="btn ghost no-print" style={{ color: 'var(--bad)' }} onClick={remove}>
          <Trash /> Delete this analysis
        </button>
      </section>
    </div>
  )
}

function Highlight({ m, onClick }: { m: MetricResult; onClick: () => void }) {
  return (
    <button className="highlight" onClick={onClick}>
      <span className="dot" style={{ background: scoreColor(m.score) }} />
      <span className="grow">
        <span style={{ fontWeight: 600 }}>{titleOf(m)}</span>
        <span className="small muted" style={{ display: 'block' }}>
          {verdictOf(m)}
        </span>
      </span>
      <span className="num muted small">{m.display}</span>
    </button>
  )
}

const titleOf = (m: MetricResult) => METRIC_TEXT[m.id]?.title ?? m.id
