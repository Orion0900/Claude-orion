import { useMemo, type PointerEvent } from 'react'
import type { ElevationProfile as Profile } from '../lib/elevation'
import { formatDistance, formatElevation, type DistanceUnit, type ElevationUnit } from '../lib/units'

interface ElevationProfileProps {
  profile: Profile
  distanceUnit: DistanceUnit
  elevationUnit: ElevationUnit
  /** Fraction along the route currently under the pointer, 0-1. */
  cursor: number | null
  onScrub: (fraction: number | null) => void
}

const WIDTH = 320
const HEIGHT = 72
const PAD_TOP = 6
const PAD_BOTTOM = 10

export function ElevationProfile({
  profile,
  distanceUnit,
  elevationUnit,
  cursor,
  onScrub,
}: ElevationProfileProps) {
  const { area, line } = useMemo(() => {
    const { distances, elevations } = profile
    if (elevations.length < 2) return { area: '', line: '' }

    const total = distances[distances.length - 1] || 1
    // Give flat routes a minimum span so the trace doesn't collapse to a bar.
    const span = Math.max(profile.maxElevation - profile.minElevation, 10)
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM

    const points = elevations.map((elevation, i) => {
      const x = (distances[i] / total) * WIDTH
      const y = PAD_TOP + plotHeight * (1 - (elevation - profile.minElevation) / span)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })

    return {
      line: `M${points.join(' L')}`,
      area: `M0,${HEIGHT - PAD_BOTTOM} L${points.join(' L')} L${WIDTH},${HEIGHT - PAD_BOTTOM} Z`,
    }
  }, [profile])

  const handleMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const fraction = (event.clientX - rect.left) / rect.width
    onScrub(Math.min(1, Math.max(0, fraction)))
  }

  if (!line) return null

  return (
    <div>
      <svg
        className="profile"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        onPointerMove={handleMove}
        onPointerLeave={() => onScrub(null)}
        role="img"
        aria-label={`Elevation profile: ${formatElevation(profile.gain, elevationUnit)} of climbing`}
      >
        <path className="profile-area" d={area} />
        <path className="profile-line" d={line} vectorEffect="non-scaling-stroke" />
        <line
          className="profile-axis"
          x1="0"
          y1={HEIGHT - PAD_BOTTOM}
          x2={WIDTH}
          y2={HEIGHT - PAD_BOTTOM}
          vectorEffect="non-scaling-stroke"
        />
        {cursor === null ? null : (
          <line
            className="profile-cursor"
            x1={cursor * WIDTH}
            y1="0"
            x2={cursor * WIDTH}
            y2={HEIGHT - PAD_BOTTOM}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <div className="profile-caption">
        <span>{formatElevation(profile.minElevation, elevationUnit)}</span>
        <span>
          {cursor === null
            ? `${formatElevation(profile.maxElevation, elevationUnit)} high point`
            : formatDistance(cursor * (profile.distances[profile.distances.length - 1] || 0), distanceUnit)}
        </span>
      </div>
    </div>
  )
}
