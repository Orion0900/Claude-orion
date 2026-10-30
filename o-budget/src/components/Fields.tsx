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
  /** Shows $0 as an empty field waiting to be filled in, for amounts not entered yet. */
  blank?: boolean
  /** Hands the amount over once, when typing is done, instead of on every keystroke. */
  lazy?: boolean
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
export function MoneyInput({ id, value, onChange, label, className = '', autoFocus, blank, lazy }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? (blank && value === 0 ? '' : moneyField(value))
  return (
    <label className={`money ${className}`}>
      <span className="money-sign" aria-hidden="true">
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={label}
        autoFocus={autoFocus}
        value={text}
        placeholder={blank ? '0' : undefined}
        style={widthFor(text)}
        onFocus={(e) => {
          setDraft(blank && value === 0 ? '' : moneyDraft(value))
          selectAll(e)
        }}
        onChange={(e) => {
          const typed = e.target.value
          setDraft(typed)
          if (lazy) return
          const n = parseMoney(typed)
          if (n !== null) onChange(n)
          else if (!typed.trim()) onChange(0)
        }}
        onBlur={() => {
          if (lazy && draft !== null) {
            const n = draft.trim() ? parseMoney(draft) : 0
            if (n !== null && n !== Math.round(value)) onChange(n)
          }
          setDraft(null)
        }}
        onKeyDown={doneOnEnter}
      />
    </label>
  )
}

/** A share as a percent, edited the same way. `value` is a fraction, at most `max` (1 is 100%). */
export function PercentInput({ id, value, onChange, label, className = '', max = 1 }: NumberFieldProps & { max?: number }) {
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
          if (n !== null) onChange(Math.min(max, n))
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

/** A whole number like a count of years, from `min` to `max`, edited the same way. */
export function WholeInput({ id, value, onChange, label, min = 1, max }: Omit<NumberFieldProps, 'blank'> & { min?: number; max: number }) {
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? String(value)
  return (
    <input
      id={id}
      className="whole"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      enterKeyHint="done"
      aria-label={label}
      value={text}
      style={widthFor(text)}
      onFocus={(e) => {
        setDraft(String(value))
        selectAll(e)
      }}
      onChange={(e) => {
        const typed = e.target.value.replace(/[^0-9]/g, '').slice(0, 3)
        setDraft(typed)
        const n = Number(typed)
        if (typed && n >= min) onChange(Math.min(max, n))
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={doneOnEnter}
    />
  )
}
