import { back, go } from '../../router'
import { clearAll } from '../../store/db'
import { useSettings } from '../../store/settings'
import { useAnalyses } from '../../store/useAnalysis'
import { Back, ChevronRight, Lock } from '../components/Icons'

export function Settings() {
  const [s, update] = useSettings()
  const { list, reload } = useAnalyses()

  const wipe = async () => {
    if (!confirm('Delete every analysis and photo stored by Facet on this device? This can’t be undone.')) return
    await clearAll()
    reload()
  }

  const toggle = (label: string, sub: string, key: 'showClinical' | 'showMm') => (
    <div className="list-item">
      <div className="grow stack" style={{ gap: 2 }}>
        <span>{label}</span>
        <span className="small muted">{sub}</span>
      </div>
      <button className="toggle" role="switch" aria-checked={s[key]} aria-label={label} onClick={() => update({ [key]: !s[key] })} />
    </div>
  )

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => back()}>
          <Back />
        </button>
        <div className="title">Settings</div>
        <div className="spacer" />
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="eyebrow">Compare new analyses with</div>
        <div className="segmented" role="group" aria-label="Compare new analyses with">
          <button aria-pressed={s.sex === 'female'} onClick={() => update({ sex: 'female' })}>
            Female ideals
          </button>
          <button aria-pressed={s.sex === 'male'} onClick={() => update({ sex: 'male' })}>
            Male ideals
          </button>
        </div>
        <p className="small faint">Each report can also be switched on its own.</p>
      </div>

      <div className="list">
        {toggle('Show clinical options', 'Listed for information under each result, never as a recommendation.', 'showClinical')}
        {toggle('Show millimetres', 'Approximate sizes, scaled from your iris.', 'showMm')}
      </div>

      <div className="list">
        <button className="list-item" onClick={() => go({ name: 'about' })}>
          <span className="grow">How Facet works</span>
          <ChevronRight style={{ width: 18, height: 18, color: 'var(--text-3)' }} />
        </button>
        <button className="list-item" onClick={() => go({ name: 'welcome' })}>
          <span className="grow">Show the introduction again</span>
          <ChevronRight style={{ width: 18, height: 18, color: 'var(--text-3)' }} />
        </button>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row small muted" style={{ gap: 8 }}>
          <Lock style={{ width: 16, height: 16 }} />
          <span>{list ? `${list.length} ${list.length === 1 ? 'analysis' : 'analyses'} stored on this device only.` : 'Stored on this device only.'}</span>
        </div>
        <button className="btn" style={{ color: 'var(--bad)' }} onClick={wipe} disabled={!list?.length}>
          Delete all data
        </button>
      </div>
    </div>
  )
}

export function About() {
  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => back()}>
          <Back />
        </button>
        <div className="title">How Facet works</div>
        <div className="spacer" />
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h3>Measuring</h3>
        <p className="muted small">
          A face-landmark model (Google’s MediaPipe Face Landmarker, running in your browser) finds 478 points on your face. Facet picks the anthropometric ones — hairline, brow line, eye corners, nose wings, mouth corners, cheekbones, jaw angles, chin — and measures between them.
        </p>
        <p className="muted small">
          Before measuring, the face is straightened: head tilt is undone, and the 3D shape of the points is turned to look straight at the lens, so a slightly turned head doesn’t make one eye look narrower. The hairline, which the mesh doesn’t reach, is found by following the forehead’s skin up the photo until it ends. You can drag any point to correct it.
        </p>
        <p className="muted small">
          Millimetres are scaled from the iris, which is close to 11.7 mm across in almost every adult. The side profile borrows its scale from your front photo.
        </p>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h3>The ideal ranges</h3>
        <p className="muted small">
          They come from the neoclassical proportion canons, facial anthropometry (Farkas), profile analysis (Powell & Humphreys, Ricketts) and studies of rated attractiveness such as Pallett, Link & Lee’s work on eye spacing. Each describes the average of the faces studied — mostly young adults, and in the older literature mostly of European descent. Nose width, lip fullness and eyelid shape in particular vary widely and beautifully between ancestries.
        </p>
        <p className="muted small">
          Every result is scored 0–10 by how far it sits from its range; the harmony score weights those by area. Some measurements — eye shape, brow position, face index — describe rather than grade, because no range is better than another.
        </p>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h3>Privacy</h3>
        <p className="muted small">
          Everything runs on this device. The analysis engine is downloaded once from this site and then works offline; your photos and results are stored only in this browser’s storage, and nothing about your face is ever uploaded. There is no account, no analytics and no tracking.
        </p>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h3>Keep it in proportion</h3>
        <p className="muted small">
          Numbers like these are interesting, but faces are more than geometry, and research on attractiveness consistently finds that expression, skin, grooming and confidence carry as much weight. If you notice yourself worrying about your appearance a lot, talking to a GP or a counsellor can genuinely help.
        </p>
      </div>

      <p className="tiny faint" style={{ textAlign: 'center' }}>
        Facet is a fan-made homage to the facial analyses of QOVES Studio and isn’t affiliated with them. Face Landmarker model and canonical face mesh © Google, Apache License 2.0.
      </p>
    </div>
  )
}
