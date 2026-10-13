import { useState, type FocusEvent, type KeyboardEvent } from 'react'
import { moneyDraft, moneyField, parseMoney, parsePercent, percentField } from '../lib/money'

interface NumberFieldProps {
  id?: string
  value: number
  onChange: (value: number) => void
  /** What the field is, for screen readers: "Monthly income". */
  label: string
  className?: string
  autoFocus?: boolean
}

/** Typing replaces the whole number, the way a calculator would. */
const selectAll = (e: FocusEvent<HTMLInputElement>) => {
  const input = e.currentTarget
  setTimeout(() => input.select(), 0)
}
const doneOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key === 'Enter') e.currentTarget.blur()
}
/**
 * Fields grow with what's in them. Digits are one `ch` wide in tabular
 * figures; commas and points are under half that. Browsers that can size a
 * field to its content do it themselves (see `field-sizing` in the styles).
 */
const widthFor = (text: string) => {
  const digits = text.replace(/[^0-9]/g, '').length
  const narrow = text.replace(/[0-9]/g, '').length
  return { width: `${Math.max(digits + narrow * 0.45, 1) + 0.1}ch` }
}

/**
 * A dollar amount that's edited in place. While it has focus it holds
 * exactly what was typed; each readable keystroke updates the budget, and
 * leaving the field tidies it up ("7800" back to "7,800").
 */
export function MoneyInput({ id, value, onChange, label, className = '', autoFocus }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? moneyField(value)
  return (
    <label className={`money ${className}`}>
      <span className="money-sign" aria-hidden="true">
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label}
        autoFocus={autoFocus}
        value={text}
        style={widthFor(text)}
        onFocus={(e) => {
          setDraft(moneyDraft(value))
          selectAll(e)
        }}
        onChange={(e) => {
          const typed = e.target.value
          setDraft(typed)
          const n = parseMoney(typed)
          if (n !== null) onChange(n)
          else if (!typed.trim()) onChange(0)
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={doneOnEnter}
      />
    </label>
  )
}

/** A share of income as a percent, edited the same way. `value` is a fraction. */
export function PercentInput({ id, value, onChange, label, className = '' }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? percentField(value)
  return (
    <label className={`pct ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label}
        value={text}
        style={widthFor(text)}
        onFocus={(e) => {
          setDraft(percentField(value))
          selectAll(e)
        }}
        onChange={(e) => {
          const typed = e.target.value
          setDraft(typed)
          const n = parsePercent(typed)
          if (n !== null) onChange(Math.min(1, n))
          else if (!typed.trim()) onChange(0)
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={doneOnEnter}
      />
      <span className="pct-sign" aria-hidden="true">
        %
      </span>
    </label>
  )
}

/** A small whole number with − and + either side. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  label: string
}) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label="One fewer" disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label="One more" disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  )
}
