import { memo } from 'react'
import { METRIC_TEXT } from '../../content/metrics'
import type { Advice } from '../../content/types'
import type { FaceFrame } from '../../face/frame'
import type { MetricResult } from '../../face/metrics/types'
import type { Sex } from '../../face/types'
import { formatValue, unitNote } from '../format'
import { Annotated } from './Annotated'
import { Gauge } from './Gauge'
import { Alert, Chevron } from './Icons'
import { scoreColor } from './ScoreRing'

export interface PhotoRef {
  src: string
  width: number
  height: number
  frame: FaceFrame | null
}

const KIND_LABEL: Record<Advice['kind'], string> = {
  style: 'Style',
  grooming: 'Grooming',
  makeup: 'Makeup',
  habits: 'Habits',
  clinical: 'Clinical',
}

export function adviceFor(m: MetricResult, sex: Sex): Advice[] {
  const outcome = METRIC_TEXT[m.id]?.outcomes[m.key]
  // A hair outside the range doesn't warrant talk of procedures.
  return (outcome?.advice ?? []).filter((a) => (!a.only || a.only === sex) && !(m.band === 'near' && a.kind === 'clinical'))
}

/**
 * A result only just outside its range reads as near ideal: the full
 * low/high wording is written for clear misses and would overstate it.
 */
export function verdictOf(m: MetricResult): string {
  if (m.band === 'near') return m.dir! < 0 ? 'Just under ideal' : 'Just over ideal'
  return METRIC_TEXT[m.id]?.outcomes[m.key]?.verdict ?? (m.band === 'ideal' ? 'Ideal' : '—')
}

export function meaningOf(m: MetricResult): string | undefined {
  if (m.band === 'near') {
    return `Just ${m.dir! < 0 ? 'below' : 'above'} the ideal range, by a margin few people would notice. The ideas below nudge it the rest of the way, if you want them.`
  }
  return METRIC_TEXT[m.id]?.outcomes[m.key]?.meaning
}

interface Props {
  m: MetricResult
  photo: PhotoRef
  sex: Sex
  showClinical: boolean
  showMm: boolean
}

function MetricCardImpl({ m, photo, sex, showClinical, showMm }: Props) {
  const text = METRIC_TEXT[m.id]
  const advice = adviceFor(m, sex)
  const meaning = meaningOf(m)
  const everyday = advice.filter((a) => a.kind !== 'clinical')
  const clinical = showClinical ? advice.filter((a) => a.kind === 'clinical') : []
  const graded = m.score !== undefined
  const details = showMm ? m.details : m.details.filter((d) => !/mm/.test(d.value))
  const fmt = (n: number) => formatValue(m.id, n)

  return (
    <article className="card metric fade-up" id={`m-${m.id}`}>
      <div className="metric-head">
        <div className="stack" style={{ gap: 6, alignItems: 'flex-start' }}>
          <h3>{text?.title ?? m.id}</h3>
          <span className={`chip ${graded ? m.band : 'accent'}`}>{verdictOf(m)}</span>
        </div>
        <div className="metric-value num">{m.display}</div>
      </div>
      {text?.measures && <p className="small muted">{text.measures}</p>}

      <div className="metric-photo">
        <Annotated src={photo.src} width={photo.width} height={photo.height} frame={photo.frame} overlay={m.overlay} />
      </div>

      {m.gauge && <Gauge value={m.value} gauge={m.gauge} ideal={m.ideal} format={fmt} />}
      <div className="row small" style={{ justifyContent: 'space-between' }}>
        <span className="muted">
          {m.ideal ? (
            <>
              Ideal <span className="num">{m.idealDisplay}</span> {unitNote(m.id) && <span className="faint">({unitNote(m.id)})</span>}
            </>
          ) : (
            'Describes your features — not graded'
          )}
        </span>
        {graded && (
          <span className="num" style={{ color: scoreColor(m.score), fontWeight: 650 }}>
            {m.score!.toFixed(1)}
            <span className="faint"> / 10</span>
          </span>
        )}
      </div>

      {meaning && <p>{meaning}</p>}

      {m.caveat && (
        <div className="caveat">
          <Alert />
          <span>Less reliable for this photo: {m.caveat.toLowerCase()}.</span>
        </div>
      )}

      {details.length > 0 && (
        <dl className="detail-table">
          {details.map((d) => (
            <div key={d.label} style={{ display: 'contents' }}>
              <dt>{d.label}</dt>
              <dd>{d.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(everyday.length > 0 || clinical.length > 0) && (
        <details className="advice">
          <summary>
            What you can do <Chevron />
          </summary>
          {everyday.length > 0 && (
            <ul className="advice-list">
              {everyday.map((a, i) => (
                <li key={i}>
                  <span className="advice-kind">{KIND_LABEL[a.kind]}</span>
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          )}
          {clinical.length > 0 && (
            <div className="clinical-note">
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                Clinical options · for information
              </div>
              {clinical.map((a, i) => (
                <p key={i} style={{ marginTop: i ? 6 : 0 }}>
                  {a.text}
                </p>
              ))}
              <p className="tiny faint" style={{ marginTop: 8 }}>
                Not a recommendation. Talk to a board-certified specialist before considering any procedure.
              </p>
            </div>
          )}
        </details>
      )}

      {text?.why && (
        <details className="advice">
          <summary>
            Why it matters <Chevron />
          </summary>
          <p className="small muted" style={{ marginTop: 8 }}>
            {text.why}
          </p>
          {text.note && (
            <p className="small muted" style={{ marginTop: 8 }}>
              {text.note}
            </p>
          )}
        </details>
      )}
    </article>
  )
}

export const MetricCard = memo(MetricCardImpl)
