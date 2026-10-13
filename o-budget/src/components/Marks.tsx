/**
 * The app's two drawn marks: the O, a ring split the way income is split,
 * and the guilloché band, the fine twisted lines printed on checks and pay
 * stubs.
 */

const R = 12
const LOOP = 2 * Math.PI * R

/** The logo: Investing's share of the ring in its color, Living's in the other. */
export function Ring({ investing, size = 30 }: { investing: number | null; size?: number }) {
  const share = investing === null ? null : Math.min(1, Math.max(0, investing))
  const both = share !== null && share > 0 && share < 1
  // A sliver of surface between the two arcs, so the split reads without color.
  const gap = both ? 2.2 : 0
  const investLength = share === null ? 0 : Math.max(0, share * LOOP - gap)
  const livingLength = share === null ? 0 : Math.max(0, (1 - share) * LOOP - gap)
  return (
    <svg className="ring" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle className="ring-track" cx="16" cy="16" r={R} />
      {share !== null && (
        <g transform="rotate(-90 16 16)">
          {investLength > 0 && (
            <circle
              className="ring-invest"
              cx="16"
              cy="16"
              r={R}
              strokeDasharray={`${investLength} ${LOOP}`}
              strokeDashoffset={-gap / 2}
            />
          )}
          {livingLength > 0 && (
            <circle
              className="ring-living"
              cx="16"
              cy="16"
              r={R}
              strokeDasharray={`${livingLength} ${LOOP}`}
              strokeDashoffset={-(share * LOOP + gap / 2)}
            />
          )}
        </g>
      )}
    </svg>
  )
}

const WIDTH = 320
const HEIGHT = 30

/** One sine across the band, as path data. */
function wave(phase: number, amplitude: number, period: number): string {
  const points: string[] = []
  for (let x = 0; x <= WIDTH; x += 4) {
    const y = HEIGHT / 2 + amplitude * Math.sin((2 * Math.PI * x) / period + phase)
    points.push(`${x} ${y.toFixed(2)}`)
  }
  return `M${points.join('L')}`
}

// Eight copies of one wave, each a little further along, twist into a rope.
const ROPE = Array.from({ length: 8 }, (_, i) => wave((i * Math.PI) / 8, 11, 64))

export function Guilloche() {
  return (
    <svg className="guilloche" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
      {ROPE.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
