import { compassLabel } from '../lib/routeSearch'
import type { SavedRoute } from '../lib/savedRoutes'
import type { RouteResult } from '../lib/routeSearch'
import {
  formatDistance,
  formatElevation,
  type DistanceUnit,
  type ElevationUnit,
} from '../lib/units'

interface SavedRoutesProps {
  routes: SavedRoute[]
  distanceUnit: DistanceUnit
  elevationUnit: ElevationUnit
  onOpen: (route: RouteResult) => void
  onRemove: (id: string) => void
}

export function SavedRoutes({
  routes,
  distanceUnit,
  elevationUnit,
  onOpen,
  onRemove,
}: SavedRoutesProps) {
  if (routes.length === 0) return null

  return (
    <section className="panel-section">
      <h2>Saved routes</h2>
      <ul className="saved-list">
        {routes.map((saved) => (
          <li key={saved.id}>
            <button type="button" className="saved-open" onClick={() => onOpen(saved.route)}>
              <span className="saved-name">{saved.name}</span>
              <span className="saved-stats">
                {formatDistance(saved.route.distance, distanceUnit)} ·{' '}
                {formatElevation(saved.route.profile.gain, elevationUnit)} climb ·{' '}
                {compassLabel(saved.route.outboundBearing)}
              </span>
            </button>
            <button
              type="button"
              className="saved-remove"
              aria-label={`Remove ${saved.name}`}
              onClick={() => onRemove(saved.id)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <p className="hint">Saved routes work without a connection — no searching needed.</p>
    </section>
  )
}
