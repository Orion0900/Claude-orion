import { useState } from 'react'
import { HIGHLIGHT_LABELS, viaLabel, type RouteResult } from '../lib/routeSearch'
import { appleMapsUrl, isAppleDevice, shareRoute } from '../lib/share'
import { simplicityLabel } from '../lib/turns'
import { isSaved, type SavedRoute } from '../lib/savedRoutes'
import { estimateDuration } from '../lib/effort'
import { bikewayLabel, busyShare, KIND_LABELS, WAY_KINDS, type WayBreakdown } from '../lib/bikeway'
import { distancePhrase, instructionFor, isInstruction, type RouteStep } from '../lib/navigation'
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
  speed: number
  scrub: number | null
  onSelect: (id: string) => void
  onScrub: (fraction: number | null) => void
  followingId: string | null
  onFollow: (id: string) => void
  savedRoutes: SavedRoute[]
  onToggleSaved: (route: RouteResult) => void
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

/** A stacked bar: how much of the ride is on each kind of road. */
export function LaneBar({ ways }: { ways: WayBreakdown }) {
  if (ways.total <= 0) return null
  return (
    <div className="lane-bar" role="img" aria-label={laneSummary(ways)}>
      {WAY_KINDS.map((kind) => {
        const share = ways.meters[kind] / ways.total
        if (share <= 0) return null
        return <span key={kind} className={`lane-bar-part ${kind}`} style={{ flexGrow: share }} />
      })}
    </div>
  )
}

function laneSummary(ways: WayBreakdown): string {
  return WAY_KINDS.filter((kind) => ways.meters[kind] > 0)
    .map((kind) => `${Math.round((ways.meters[kind] / ways.total) * 100)}% ${KIND_LABELS[kind].toLowerCase()}`)
    .join(', ')
}

/** The written directions, for reading ahead or riding without the phone out. */
function StepList({ steps, distanceUnit }: { steps: RouteStep[]; distanceUnit: DistanceUnit }) {
  const shown = steps.filter((step, index) => index === 0 || isInstruction(step) || step.type === 'arrive')
  return (
    <ol className="steps">
      {shown.map((step, index) => {
        const previous = shown[index - 1]
        const gap = previous ? step.distanceAlong - previous.distanceAlong : 0
        return (
          <li key={`${step.distanceAlong}-${index}`}>
            <span className="step-gap">{index === 0 ? '' : distancePhrase(gap, distanceUnit)}</span>
            <span className="step-text">{instructionFor(step)}</span>
          </li>
        )
      })}
    </ol>
  )
}

export function RouteList({
  routes,
  selectedId,
  distanceUnit,
  elevationUnit,
  speed,
  scrub,
  onSelect,
  onScrub,
  followingId,
  onFollow,
  savedRoutes,
  onToggleSaved,
}: RouteListProps) {
  const [showSteps, setShowSteps] = useState(false)

  return (
    <div className="results">
      {routes.map((route, index) => {
        const isSelected = route.id === selectedId
        const via = viaLabel(route.steps)
        const name = `${formatDistance(route.distance, distanceUnit)} ride${via ? ` ${via}` : ''}`
        const [primary, ...others] = route.highlights
        const busy = route.ways ? busyShare(route.ways) : 0
        return (
          <div key={route.id} className="route-card" aria-current={isSelected}>
            {/* Badge and star sit outside the select button: a control inside
                another control is ambiguous to assistive technology. */}
            <div className="route-card-corner">
              {primary ? (
                <span className={primary === 'recommended' ? 'badge' : 'badge alt'}>{HIGHLIGHT_LABELS[primary]}</span>
              ) : null}
              <button
                type="button"
                className="star"
                aria-pressed={isSaved(savedRoutes, route)}
                aria-label={isSaved(savedRoutes, route) ? `Remove ${name} from saved rides` : `Save ${name}`}
                onClick={() => onToggleSaved(route)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 3.5l2.7 5.6 6.1.85-4.4 4.3 1.05 6.1L12 17.5l-5.45 2.85L7.6 14.25 3.2 9.95l6.1-.85z"
                    fill={isSaved(savedRoutes, route) ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            <button type="button" className="route-select" aria-pressed={isSelected} onClick={() => onSelect(route.id)}>
              <span className="route-name">
                Option {index + 1}
                {via ? ` · ${via}` : ''}
              </span>

              <span className="route-stats">
                <span>
                  <strong>{formatDistance(route.distance, distanceUnit)}</strong>
                </span>
                <span>
                  <strong>{formatElevation(route.profile.gain, elevationUnit)}</strong> climb
                </span>
                <span>
                  ~<strong>{formatDuration(estimateDuration(route.distance, route.profile.gain, speed, distanceUnit))}</strong>
                </span>
                {route.turns === null ? null : (
                  <span>
                    <strong>{route.turns}</strong> turns
                  </span>
                )}
              </span>

              {route.ways ? (
                <>
                  <LaneBar ways={route.ways} />
                  <span className="route-note">
                    <strong>{Math.round(route.bikewayShare * 100)}%</strong> on bike lanes &amp; paths ·{' '}
                    {bikewayLabel(route.bikewayShare).toLowerCase()}
                  </span>
                </>
              ) : (
                <span className="route-note">Road types unknown for this route</span>
              )}

              {busy > 0.02 && route.ways ? (
                <span className="route-note warn">
                  {formatDistance(route.ways.meters.busy, distanceUnit)} on busy roads without a lane
                </span>
              ) : null}

              {others.length > 0 || route.turns !== null ? (
                <span className="route-note">
                  {[
                    ...others.map((highlight) => HIGHLIGHT_LABELS[highlight]),
                    ...(route.turns === null ? [] : [`${simplicityLabel(route.turns, route.distance)} to follow`]),
                  ].join(' · ')}
                </span>
              ) : null}
            </button>

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
                    {followingId === route.id ? 'Ride in progress' : 'Start ride'}
                  </button>
                  <ShareButton route={route} name={name} />
                  <a
                    className="btn btn-secondary"
                    href={appleMapsUrl(route.path[0], 'Ride start')}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                  >
                    Directions to start
                  </a>
                </div>
                {route.steps.length > 0 ? (
                  <div className="route-steps">
                    <button type="button" className="btn-link" onClick={() => setShowSteps((was) => !was)}>
                      {showSteps ? 'Hide turn-by-turn' : 'Show turn-by-turn'}
                    </button>
                    {showSteps ? <StepList steps={route.steps} distanceUnit={distanceUnit} /> : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
