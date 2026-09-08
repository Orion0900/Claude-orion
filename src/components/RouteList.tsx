import { useState } from 'react'
import { compassLabel, type RouteResult } from '../lib/routeSearch'
import { appleMapsUrl, isAppleDevice, shareRoute } from '../lib/share'
import { simplicityLabel } from '../lib/turns'
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
  followingId: string | null
  onFollow: (id: string) => void
}

/** Share sheet on a phone, plain download everywhere else. */
function ShareButton({ route, name }: { route: RouteResult; name: string }) {
  const [status, setStatus] = useState<'idle' | 'working' | 'saved'>('idle')
  const onPhone = typeof navigator !== 'undefined' && isAppleDevice()

  return (
    <button
      type="button"
      className="btn btn-secondary"
      disabled={status === 'working'}
      onClick={async (event) => {
        event.stopPropagation()
        setStatus('working')
        const outcome = await shareRoute(route, name)
        setStatus(outcome === 'downloaded' ? 'saved' : 'idle')
        if (outcome === 'downloaded') setTimeout(() => setStatus('idle'), 2500)
      }}
    >
      {status === 'saved' ? 'GPX saved' : onPhone ? 'Send to phone' : 'Download GPX'}
    </button>
  )
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
  followingId,
  onFollow,
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
              {route.turns === null ? null : (
                <span>
                  <strong>{route.turns}</strong> turns
                </span>
              )}
            </div>

            {route.turns === null ? null : (
              <p className="route-note">{simplicityLabel(route.turns, route.distance)} to follow</p>
            )}

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
                    className="btn"
                    disabled={followingId === route.id}
                    onClick={(event) => {
                      event.stopPropagation()
                      onFollow(route.id)
                    }}
                  >
                    {followingId === route.id ? 'Following…' : 'Follow this route'}
                  </button>
                  <ShareButton route={route} name={name} />
                  <a
                    className="btn btn-secondary"
                    href={appleMapsUrl(route.path[0], 'Run start')}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Directions to start
                  </a>
                </div>
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
