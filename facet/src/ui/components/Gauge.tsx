import type { Range } from '../../face/metrics/types'

interface Props {
  value: number
  gauge: Range
  ideal?: Range
  format?: (n: number) => string
}

/** A bar across the measurement's usual spread, the ideal band lit, a tick at the value. */
export function Gauge({ value, gauge, ideal, format = (n) => `${n}` }: Props) {
  const span = gauge.hi - gauge.lo
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - gauge.lo) / span) * 100))}%`
  return (
    <div className="gauge" role="img" aria-label={`Value ${format(value)}${ideal ? `, ideal ${format(ideal.lo)} to ${format(ideal.hi)}` : ''}`}>
      <div className="track" />
      {ideal && <div className="zone" style={{ left: pos(ideal.lo), width: `calc(${pos(ideal.hi)} - ${pos(ideal.lo)})` }} />}
      <div className="marker" style={{ left: pos(value) }} />
      <div className="ends num">
        <span>{format(gauge.lo)}</span>
        <span>{format(gauge.hi)}</span>
      </div>
    </div>
  )
}
