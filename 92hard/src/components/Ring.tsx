import type { ReactNode } from 'react'

/** The day's tasks as a ring of segments, one per task, filling as they're done. */
export function Ring({ done, total, size = 116, children }: { done: number; total: number; size?: number; children?: ReactNode }) {
  const stroke = 11
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  // Round caps reach into the gap by half the stroke at each end.
  const gap = total > 1 ? stroke + 9 : 0
  const segment = c / total - gap
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <circle
            key={i}
            className={i < done ? 'ring-seg on' : 'ring-seg'}
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={`${segment} ${c}`}
            // Each segment starts a slice further round, from twelve o'clock.
            transform={`rotate(${-90 + (360 / total) * i + ((gap / 2) / c) * 360} ${size / 2} ${size / 2})`}
          />
        ))}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  )
}
