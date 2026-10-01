/** Small, honest charts: one scale per chart, ticks that name values the data reaches, a zero line when it matters. */
import { quarterLabel } from '../engine/game'
import type { Fund, HistoryPoint } from '../engine/types'
import { money, pct } from '../lib/format'

interface Series {
  values: number[]
  className: string
  label: string
  area?: boolean
}

const W = 320
const PAD = { l: 44, r: 10, t: 12, b: 22 }

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v)
  return ticks
}

function LineChart({
  series,
  xLabels,
  yFormat,
  height = 150,
  label,
  zero,
}: {
  series: Series[]
  xLabels: [string, string]
  yFormat: (v: number) => string
  height?: number
  label: string
  zero?: boolean
}) {
  const all = series.flatMap((s) => s.values)
  const n = Math.max(...series.map((s) => s.values.length))
  if (n < 2 || !all.length) return <p className="empty-chart">The chart fills in as the quarters go by.</p>
  let min = Math.min(...all)
  let max = Math.max(...all)
  if (zero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }
  if (max - min < 1e-9) {
    max += 1
    min -= 1
  }
  const ticks = niceTicks(min, max)
  min = Math.min(min, ticks[0])
  max = Math.max(max, ticks[ticks.length - 1])
  const x = (i: number) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
  const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (height - PAD.t - PAD.b)
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 && zero ? 'chart-zero' : 'chart-grid'} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end">
              {yFormat(t)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
          const base = y(zero ? 0 : min)
          return (
            <g key={s.label} className={s.className}>
              {s.area && <path className="chart-area" d={`${d}L${x(s.values.length - 1).toFixed(1)},${base}L${x(0)},${base}Z`} />}
              <path className="chart-line" d={d} />
              <circle className="chart-dot" cx={x(s.values.length - 1)} cy={y(s.values[s.values.length - 1])} r={3} />
            </g>
          )
        })}
        <text className="chart-tick" x={PAD.l} y={height - 6}>
          {xLabels[0]}
        </text>
        <text className="chart-tick" x={W - PAD.r} y={height - 6} textAnchor="end">
          {xLabels[1]}
        </text>
      </svg>
      <figcaption className="legend">
        {series.map((s) => (
          <span key={s.label} className={`legend-item ${s.className}`}>
            <i />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

/** The J-curve: what investors have netted in cash so far, and that plus what the fund still holds. */
export function JCurve({ fund }: { fund: Fund }) {
  const pts = fund.curve
  return (
    <LineChart
      label={`${fund.name} J-curve`}
      zero
      series={[
        { values: pts.map((p) => p.net + p.nav), className: 's-total', label: 'Net cash + NAV', area: true },
        { values: pts.map((p) => p.net), className: 's-net', label: 'Net cash to LPs' },
      ]}
      xLabels={[quarterLabel(pts[0]?.q ?? fund.vintageQ), pts.length ? quarterLabel(Math.max(0, pts[pts.length - 1].q - 1)) : '']}
      yFormat={(v) => money(v, 0)}
    />
  )
}

export function RatesChart({ history }: { history: HistoryPoint[] }) {
  const pts = history.slice(-40)
  return (
    <LineChart
      label="Interest rates"
      series={[
        { values: pts.map((p) => p.tenYear), className: 's-ten', label: '10-year Treasury' },
        { values: pts.map((p) => p.policyRate), className: 's-fed', label: 'Fed funds' },
      ]}
      xLabels={[quarterLabel(pts[0]?.q ?? 0), quarterLabel(pts[pts.length - 1]?.q ?? 0)]}
      yFormat={(v) => pct(v, 1)}
      height={140}
    />
  )
}

export function AumChart({ history }: { history: HistoryPoint[] }) {
  return (
    <LineChart
      label="Assets under management"
      series={[{ values: history.map((p) => p.aum), className: 's-total', label: 'AUM', area: true }]}
      xLabels={[quarterLabel(history[0]?.q ?? 0), quarterLabel(history[history.length - 1]?.q ?? 0)]}
      yFormat={(v) => money(v, 0)}
      height={140}
    />
  )
}

/**
 * Annual cash flow to equity, with the sale as its own bar. The sale usually
 * dwarfs the years, so when it would flatten them its bar is drawn broken
 * and every bar carries its value.
 */
export function CashBars({ years, sale }: { years: Array<{ year: number; cashFlow: number }>; sale: number }) {
  const bars = [...years.map((y) => ({ label: `Y${y.year}`, value: y.cashFlow, sale: false })), { label: 'Sale', value: sale, sale: true }]
  const height = 132
  const top = 18
  const bottom = height - 20
  const annual = Math.max(1, ...years.map((y) => Math.abs(y.cashFlow)))
  const broken = Math.abs(sale) > annual * 5
  const shown = (b: { value: number; sale: boolean }) => (b.sale && broken ? Math.sign(b.value) * annual * 5 : b.value)
  const values = bars.map(shown)
  const max = Math.max(0, ...values)
  const min = Math.min(0, ...values)
  const span = max - min || 1
  const y = (v: number) => top + ((max - v) / span) * (bottom - top)
  const slot = (W - 20) / bars.length
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Projected cash flow to equity by year, and the sale">
        <line className="chart-zero" x1={10} x2={W - 10} y1={y(0)} y2={y(0)} />
        {bars.map((b, i) => {
          const v = shown(b)
          const x = 10 + i * slot + slot * 0.18
          const w = slot * 0.64
          const h = Math.max(1, Math.abs(y(v) - y(0)))
          const yTop = v >= 0 ? y(v) : y(0)
          return (
            <g key={b.label}>
              <rect className={b.sale ? 'bar sale' : b.value >= 0 ? 'bar good' : 'bar bad'} x={x} y={yTop} width={w} height={h} rx={2} />
              {b.sale && broken && <path className="bar-break" d={`M${x - 2},${yTop + h * 0.32}l${w + 4},-6M${x - 2},${yTop + h * 0.32 + 6}l${w + 4},-6`} />}
              <text className="bar-label" x={x + w / 2} y={v >= 0 ? yTop - 4 : y(0) - 4} textAnchor="middle">
                {money(b.value, Math.abs(b.value) >= 1e8 || Math.abs(b.value) < 1e6 ? 0 : 1)}
              </text>
              <text className="chart-tick" x={x + w / 2} y={height - 5} textAnchor="middle">
                {b.label}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
