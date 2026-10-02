import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from 'react'
import { lookup } from '../lib/glossary'
import { Icon } from './Icons'
import type { Tone } from '../engine/types'

/** Opens the glossary card for a term. */
export const GlossaryContext = createContext<(term: string) => void>(() => undefined)

/** A term of art: dotted underline, tap for its definition. */
export function Term({ t, children }: { t: string; children?: ReactNode }) {
  const show = useContext(GlossaryContext)
  if (!lookup(t)) return <>{children ?? t}</>
  return (
    <button
      type="button"
      className="term"
      onClick={(e) => {
        e.stopPropagation()
        show(t)
      }}
    >
      {children ?? t}
    </button>
  )
}

export function Sheet({
  title,
  kicker,
  onClose,
  children,
  footer,
  wide,
}: {
  title: ReactNode
  kicker?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const id = useId()
  const panel = useRef<HTMLElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    document.body.classList.add('sheet-open')
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.classList.remove('sheet-open')
    }
  }, [])
  return (
    <div className="scrim" onClick={onClose}>
      <section
        ref={panel}
        tabIndex={-1}
        className={wide ? 'sheet wide' : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="sheet-head">
          <div className="sheet-titles">
            {kicker && <p className="kicker">{kicker}</p>}
            <h2 id={id}>{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>
  )
}

export function Stat({
  label,
  value,
  sub,
  tone,
  term,
  big,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: Tone
  term?: string
  big?: boolean
}) {
  return (
    <div className={big ? 'stat big' : 'stat'}>
      <span className="stat-label">{term ? <Term t={term}>{label}</Term> : label}</span>
      <span className={`stat-value${tone ? ` ${tone}` : ''}`}>{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}

export function Chip({ children, tone, solid }: { children: ReactNode; tone?: Tone | 'warn' | 'info'; solid?: boolean }) {
  return <span className={`chip${tone ? ` ${tone}` : ''}${solid ? ' solid' : ''}`}>{children}</span>
}

/** A horizontal bar, with an optional tick for a target. */
export function Meter({ value, target, tone, label }: { value: number; target?: number; tone?: Tone | 'warn'; label: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={`meter${tone ? ` ${tone}` : ''}`} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <i style={{ width: `${v * 100}%` }} />
      {target !== undefined && <b style={{ left: `${Math.max(0, Math.min(1, target)) * 100}%` }} />}
    </div>
  )
}

export interface SegOption<T extends string> {
  value: T
  label: string
  sub?: string
  disabled?: boolean
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: SegOption<T>[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'seg-opt on' : 'seg-opt'}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
        >
          <span>{o.label}</span>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  )
}

/** A sparkline with a soft area under it and the last point marked. */
export function Spark({ values, width = 120, height = 34, tone = 'neutral' }: { values: number[]; width?: number; height?: number; tone?: Tone }) {
  if (values.length < 2) return <svg className="spark" width={width} height={height} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) || 1
  const pad = 3
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2)
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${line}L${x(values.length - 1).toFixed(1)},${height - pad}L${pad},${height - pad}Z`
  const last = values[values.length - 1]
  return (
    <svg className={`spark ${tone}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path className="spark-area" d={area} />
      <path className="spark-line" d={line} />
      <circle className="spark-dot" cx={x(values.length - 1)} cy={y(last)} r={2.6} />
    </svg>
  )
}

export function toneOf(x: number, eps = 1e-9): Tone {
  return x > eps ? 'good' : x < -eps ? 'bad' : 'neutral'
}

/** A number input styled as a model's blue input cell. */
export function InputCell({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  id: string
  label: ReactNode
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format: (v: number) => string
}) {
  return (
    <div className="input-cell">
      <div className="input-top">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}
