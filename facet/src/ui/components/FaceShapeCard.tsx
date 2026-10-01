import { SHAPE_TEXT } from '../../content/shapes'
import type { FrontAnalysis } from '../../face/analyze'
import { FACE_SHAPES } from '../../face/faceShape'
import { FACE_OVAL } from '../../face/indices'
import type { Shape } from '../../face/metrics/types'
import type { Sex } from '../../face/types'
import { Annotated } from './Annotated'
import type { PhotoRef } from './MetricCard'

export function FaceShapeCard({ front, photo, sex }: { front: FrontAnalysis; photo: PhotoRef; sex: Sex }) {
  const { shape, runnerUp, confidence, scores, features } = front.shape
  const text = SHAPE_TEXT[shape]
  const P = front.display.points
  const lm = front.display.landmarks
  const W = P.zyL.x - P.zyR.x
  const shapes: Shape[] = [
    { t: 'poly', pts: FACE_OVAL.map((i) => lm[i]), closed: true, tone: 'accent', w: 1.3 },
    { t: 'span', a: { x: P.ftR.x, y: P.ftR.y }, b: { x: P.ftL.x, y: P.ftR.y }, tone: 'white', text: 'forehead', side: -1 },
    { t: 'span', a: { x: P.zyR.x, y: (P.zyR.y + P.zyL.y) / 2 }, b: { x: P.zyL.x, y: (P.zyR.y + P.zyL.y) / 2 }, tone: 'white', text: 'cheekbones', side: -1 },
    { t: 'span', a: { x: P.goR.x, y: (P.goR.y + P.goL.y) / 2 }, b: { x: P.goL.x, y: (P.goR.y + P.goL.y) / 2 }, tone: 'white', text: 'jaw', side: 1 },
    { t: 'span', a: { x: P.zyL.x + 0.1 * W, y: P.tr.y }, b: { x: P.zyL.x + 0.1 * W, y: P.me.y }, tone: 'accent', text: 'length', side: -1 },
  ]
  const box = { x: P.zyR.x - 0.12 * W, y: P.tr.y - 0.1 * W, w: W * 1.5, h: P.me.y - P.tr.y + 0.2 * W }
  const close = scores[runnerUp] > 0.2
  const tips: { label: string; items: string[] }[] = [
    { label: 'Hair', items: text?.hair[sex] ?? [] },
    { label: 'Glasses', items: text?.glasses ?? [] },
    ...(sex === 'male' ? [{ label: 'Beard', items: text?.beard ?? [] }] : []),
    { label: 'Contour & brows', items: text?.makeup ?? [] },
  ].filter((t) => t.items.length)

  return (
    <article className="card metric" id="m-faceShape">
      <div className="metric-head">
        <div className="stack" style={{ gap: 4 }}>
          <div className="eyebrow">Face shape</div>
          <h2>{text?.name ?? shape}</h2>
          {close && <span className="small muted">with something of a {SHAPE_TEXT[runnerUp]?.name.toLowerCase() ?? runnerUp} face</span>}
        </div>
        <span className="chip accent">{Math.round(confidence * 100)}% match</span>
      </div>
      <div className="metric-photo">
        <Annotated src={photo.src} width={photo.width} height={photo.height} frame={photo.frame} overlay={{ box, shapes }} aspect={3 / 4} />
      </div>
      {text?.description && <p>{text.description}</p>}
      <dl className="detail-table">
        <dt>Length ÷ cheekbone width</dt>
        <dd>{features.length.toFixed(2)}</dd>
        <dt>Forehead ÷ cheekbones</dt>
        <dd>{features.forehead.toFixed(2)}</dd>
        <dt>Jaw ÷ cheekbones</dt>
        <dd>{features.jaw.toFixed(2)}</dd>
        <dt>Chin ÷ jaw</dt>
        <dd>{features.taper.toFixed(2)}</dd>
      </dl>
      <div className="chips" aria-label="How closely each shape matches">
        {FACE_SHAPES.filter((s) => scores[s] >= 0.05).map((s) => (
          <span key={s} className={`chip ${s === shape ? 'accent' : ''}`}>
            {SHAPE_TEXT[s]?.name ?? s} {Math.round(scores[s] * 100)}%
          </span>
        ))}
      </div>
      {tips.map((t) => (
        <div key={t.label} className="stack" style={{ gap: 6 }}>
          <div className="eyebrow">{t.label}</div>
          <ul className="advice-list" style={{ marginTop: 0 }}>
            {t.items.map((item) => (
              <li key={item} style={{ gridTemplateColumns: '14px 1fr' }}>
                <span style={{ color: 'var(--accent)' }}>•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </article>
  )
}
