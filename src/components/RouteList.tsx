import { compassLabel, type RouteResult } from '../lib/routeSearch'
import { downloadGpx } from '../lib/gpx'
import { estimateDuration } from '../lib/effort'
import {
  formatDistance,
  formatDuration,
  formatElevation,
  type DistanceUnit,
  type ElevationUnit,
} from '../lib/units'
import { ElevationProfile } from './ElevationProfile'

interface RouteListProps {
  routes: RouteResult[]
  selectedId: string | null
  distanceUnit: DistanceUnit
  elevationUnit: ElevationUnit
  paceSeconds: number
  scrub: number | null
  onSelect: (id: string) => void
  onScrub: (fraction: number | null) => void
}

export function RouteList({
  routes,
  selectedId,
  distanceUnit,
  elevationUnit,
  paceSeconds,
  scrub,
  onSelect,
  onScrub,
}: RouteListProps) {
  return (
    <div className="results">
      {routes.map((route, index) => {
        const isSelected = route.id === selectedId
        const name = `${formatDistance(route.distance, distanceUnit)} ${compassLabel(route.outboundBearing)} loop`
        return (
          <div
            key={route.id}
            className="route-card"
            aria-current={isSelected}
            onClick={() => onSelect(route.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(route.id)
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="route-card-head">
              <span className="route-name">
                Option {index + 1} · {compassLabel(route.outboundBearing)}
              </span>
              <span className={route.meetsCriteria ? 'badge' : 'badge miss'}>
                {route.meetsCriteria ? 'Matches' : 'Closest fit'}
              </span>
            </div>

            <div className="route-stats">
              <span>
                <strong>{formatDistance(route.distance, distanceUnit)}</strong>
              </span>
              <span>
                <strong>{formatElevation(route.profile.gain, elevationUnit)}</strong> climb
              </span>
              <span>
                ~
                <strong>
                  {formatDuration(
                    estimateDuration(route.distance, route.profile.gain, paceSeconds, distanceUnit),
                  )}
                </strong>
              </span>
            </div>

            {isSelected ? (
              <>
                <ElevationProfile
                  profile={route.profile}
                  distanceUnit={distanceUnit}
                  elevationUnit={elevationUnit}
                  cursor={scrub}
                  onScrub={onScrub}
                />
                <div className="route-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={(event) => {
                      event.stopPropagation()
                      downloadGpx(route, name)
                    }}
                  >
                    Download GPX
                  </button>
                </div>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
