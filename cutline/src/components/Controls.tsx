/** Small building blocks shared by the panels and sheets. */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
    />
  )
}

export function ToggleRow({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string
  detail?: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="row">
      <div className="label">
        <strong>{title}</strong>
        {detail && <small>{detail}</small>}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  )
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format?: (v: number) => string
  onChange: (v: number) => void
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output>{format ? format(value) : value}</output>
    </label>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Swatches({
  colors,
  value,
  onChange,
  label,
}: {
  colors: string[]
  value: string
  onChange: (v: string) => void
  label: string
}) {
  const custom = !colors.some((c) => c.toLowerCase() === value.toLowerCase())
  return (
    <div className="swatches" role="group" aria-label={label}>
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          className="swatch"
          style={{ background: c }}
          aria-label={c}
          aria-pressed={c.toLowerCase() === value.toLowerCase()}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="swatch custom" aria-pressed={custom} title="Pick a colour">
        <span className="sr-only">Pick a colour</span>
        <input type="color" value={toHex(value)} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}

/** <input type=color> only takes #rrggbb. */
function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color
  if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + [...color.slice(1)].map((c) => c + c).join('')
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color)
  if (m) return '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('')
  return '#ffffff'
}

export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </>
  )
}

/** A short message that clears itself. */
export function useToast(): [ReactNode, (message: string) => void] {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const show = (text: string) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setMessage(text)
    timer.current = window.setTimeout(() => setMessage(null), 2800)
  }
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    [],
  )
  return [
    message ? (
      <div className="toast" role="status">
        {message}
      </div>
    ) : null,
    show,
  ]
}
