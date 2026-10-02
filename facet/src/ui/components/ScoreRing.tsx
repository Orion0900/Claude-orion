interface Props {
  /** 0–max. */
  value: number
  max?: number
  size?: number
  label?: string
  /** Shown in the middle; defaults to the rounded value. */
  text?: string
  color?: string
}

export function ScoreRing({ value, max = 100, size = 96, label, text, color = 'var(--accent)' }: Props) {
  const stroke = Math.max(5, size * 0.075)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, value / max))
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div style={{ textAlign: 'center' }}>
        <div className="ring-value num" style={{ fontSize: size * 0.32 }}>
          {text ?? Math.round(value)}
        </div>
        {label && <div className="ring-label">{label}</div>}
      </div>
    </div>
  )
}

/** Colour for a 0–10 score. */
export function scoreColor(score: number | undefined | null): string {
  if (score === undefined || score === null) return 'var(--text-3)'
  if (score >= 8.5) return 'var(--good)'
  if (score >= 6) return 'var(--accent)'
  if (score >= 4) return 'var(--warn)'
  return 'var(--bad)'
}
