import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { beforePayMonthly, marketInvesting, setProjection, type Budget } from '../lib/budget'
import { money } from '../lib/money'
import { compactMoney, MAX_RATE, MAX_YEARS, niceTicks, project, type ProjectionPoint } from '../lib/projection'
import { MoneyInput, PercentInput } from './Fields'

type Update = (change: (b: Budget) => Budget) => void

/**
 * Where the investing could go: an upfront amount, a monthly contribution
 * and a yearly return, drawn year by year against what was put in.
 */
export function ProjectionSection({ budget: b, update }: { budget: Budget; update: Update }) {
  const p = b.projection
  const points = project(p)
  const last = points[points.length - 1]
  const set = (patch: Partial<typeof p>) => update((x) => setProjection(x, patch))
  const k401Steps = beforePayMonthly(b)
  // Self investment comes out of Investing but doesn't grow with the markets.
  const markets = marketInvesting(b)

  return (
    <section className="section projection" aria-labelledby="projection-title">
      <div className="section-head">
        <h2 className="eyebrow" id="projection-title">
          Investment projection
        </h2>
      </div>

      <div className="proj-fields">
        <div className="pay-field">
          <span className="field-label">Upfront</span>
          <MoneyInput id="proj-start" className="well-money" value={p.start} label="Invested up front" onChange={(n) => set({ start: n })} />
        </div>
        <div className="pay-field">
          <span className="field-label">Each month</span>
          <MoneyInput id="proj-monthly" className="well-money" value={p.monthly} label="Added each month" onChange={(n) => set({ monthly: n })} />
        </div>
        <div className="pay-field">
          <span className="field-label">401k each month</span>
          <MoneyInput id="proj-401k" className="well-money" value={p.k401} label="401k each month" onChange={(n) => set({ k401: n })} />
        </div>
        <div className="pay-field">
          <span className="field-label">Return a year</span>
          <span className="well-money pct-well">
            <PercentInput id="proj-rate" value={p.rate} max={MAX_RATE} label="Yearly return, percent" onChange={(n) => set({ rate: n })} />
          </span>
        </div>
        <label className="pay-field years-field">
          <span className="field-label">
            Years <span className="num">{p.years}</span>
          </span>
          <input
            id="proj-years"
            className="years"
            type="range"
            min={1}
            max={MAX_YEARS}
            value={p.years}
            onChange={(e) => set({ years: Number(e.target.value) })}
          />
        </label>
      </div>
      {p.monthly !== markets && markets > 0 && (
        <button type="button" className="link-btn" onClick={() => set({ monthly: markets })}>
          Use Investing less self investment, {money(markets)} a month
        </button>
      )}
      {p.k401 !== k401Steps && k401Steps > 0 && (
        <button type="button" className="link-btn" onClick={() => set({ k401: k401Steps })}>
          Use the paycheck's 401k, {money(k401Steps)} a month
        </button>
      )}

      <dl className="facts proj-facts">
        <div>
          <dt>In {last.year} years</dt>
          <dd className="num">{compactMoney(last.value)}</dd>
        </div>
        <div>
          <dt>Put in</dt>
          <dd className="num">{compactMoney(last.contributed)}</dd>
        </div>
        <div>
          <dt>Growth</dt>
          <dd className="num">{compactMoney(last.value - last.contributed)}</dd>
        </div>
      </dl>

      <ProjectionChart points={points} />
      <p className="note-line">Compounded monthly at a steady return, before taxes and inflation. Real returns rise and fall.</p>
    </section>
  )
}

const HEIGHT = 220
const PAD = { top: 12, right: 14, bottom: 26, left: 50 }

/** Total value as a line over an area, what was put in as a dashed line; tap or hover for any year. */
function ProjectionChart({ points }: { points: ProjectionPoint[] }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(Math.max(240, el.clientWidth))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const years = points.length - 1
  const max = Math.max(...points.map((pt) => pt.value), 1)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (year: number) => PAD.left + (years ? (year / years) * plotW : 0)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const line = (key: 'value' | 'contributed') => points.map((pt, i) => `${i ? 'L' : 'M'}${x(pt.year).toFixed(1)} ${y(pt[key]).toFixed(1)}`).join('')
  const area = `${line('value')}L${x(years)} ${y(0)}L${x(0)} ${y(0)}Z`
  const every = years <= 10 ? 2 : years <= 30 ? 5 : 10
  const xTicks = points.filter((pt) => pt.year % every === 0).map((pt) => pt.year)
  const end = points[years]
  const shown = active === null ? null : points[active]

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const year = Math.round(((e.clientX - rect.left - PAD.left) / plotW) * years)
    setActive(Math.min(years, Math.max(0, year)))
  }

  return (
    <div className="chart" ref={box}>
      <div className="legend" aria-hidden="true">
        <span>
          <i className="key value" /> Total value
        </span>
        <span>
          <i className="key put-in" /> Put in
        </span>
      </div>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={`Projected value after ${years} years: ${money(end.value)}, of which ${money(end.contributed)} put in.`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="tick" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {compactMoney(t)}
            </text>
          </g>
        ))}
        {xTicks.map((yr) => (
          <text key={yr} className="tick" x={x(yr)} y={HEIGHT - 6} textAnchor={yr === 0 ? 'start' : yr === years ? 'end' : 'middle'}>
            {yr === 0 ? 'Now' : `${yr}y`}
          </text>
        ))}
        <path className="area" d={area} />
        <path className="put-in" d={line('contributed')} />
        <path className="value" d={line('value')} />
        <circle className="end" cx={x(years)} cy={y(end.value)} r={4} />
        {shown && (
          <g>
            <line className="cross" x1={x(shown.year)} x2={x(shown.year)} y1={PAD.top} y2={PAD.top + plotH} />
            <circle className="dot put-in-dot" cx={x(shown.year)} cy={y(shown.contributed)} r={4} />
            <circle className="dot value-dot" cx={x(shown.year)} cy={y(shown.value)} r={5} />
          </g>
        )}
      </svg>
      {shown && (
        <div
          className="tip num"
          role="status"
          style={{ left: Math.min(Math.max(x(shown.year), 90), width - 90), top: Math.max(y(shown.value) - 64, 0) }}
        >
          <strong>{shown.year === 0 ? 'Now' : `Year ${shown.year}`}</strong>
          <span>{money(Math.round(shown.value))} total</span>
          <span className="muted">{money(Math.round(shown.contributed))} put in</span>
        </div>
      )}
    </div>
  )
}
