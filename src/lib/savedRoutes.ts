/**
 * Keeping routes you liked.
 *
 * A search returns different loops every time, so a good run is lost the moment
 * you close the app. Saved routes are stored whole — geometry, elevation and
 * turn instructions — which also means a saved route can be started with no
 * connection at all, since nothing has to be routed again.
 */
import { bounds, type LatLng } from './geo'
import type { RouteResult } from './routeSearch'

export interface SavedRoute {
  id: string
  name: string
  /** ISO timestamp, for ordering the list newest first. */
  savedAt: string
  route: RouteResult
}

export interface RouteStore {
  read(): SavedRoute[]
  write(routes: SavedRoute[]): void
}

/** Routes are stored whole, so a cap keeps the browser's quota out of reach. */
export const MAX_SAVED = 40

export class StorageFullError extends Error {
  constructor() {
    super('No room left to save another route.')
    this.name = 'StorageFullError'
  }
}

/**
 * Identity for "the same run", independent of the search that produced it.
 * Route ids come from the seed and bearing of a particular search, so they
 * differ every time even when the loop is identical.
 */
export function routeSignature(route: Pick<RouteResult, 'path' | 'distance'>): string {
  if (route.path.length === 0) return 'empty'
  const start = route.path[0]
  const [sw, ne] = bounds(route.path)
  const centre: LatLng = { lat: (sw.lat + ne.lat) / 2, lng: (sw.lng + ne.lng) / 2 }
  return [
    start.lat.toFixed(4),
    start.lng.toFixed(4),
    centre.lat.toFixed(3),
    centre.lng.toFixed(3),
    Math.round(route.distance / 10) * 10,
  ].join(':')
}

export function isSaved(routes: SavedRoute[], route: Pick<RouteResult, 'path' | 'distance'>): boolean {
  const signature = routeSignature(route)
  return routes.some((saved) => routeSignature(saved.route) === signature)
}

export function findSaved(
  routes: SavedRoute[],
  route: Pick<RouteResult, 'path' | 'distance'>,
): SavedRoute | undefined {
  const signature = routeSignature(route)
  return routes.find((saved) => routeSignature(saved.route) === signature)
}

/** Newest first, so the list reads the way people expect. */
export function addRoute(routes: SavedRoute[], route: RouteResult, name: string, now = new Date()): SavedRoute[] {
  const existing = findSaved(routes, route)
  if (existing) return routes
  if (routes.length >= MAX_SAVED) throw new StorageFullError()

  const saved: SavedRoute = {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || 'Saved route',
    savedAt: now.toISOString(),
    route,
  }
  return [saved, ...routes]
}

export function removeRoute(routes: SavedRoute[], id: string): SavedRoute[] {
  return routes.filter((saved) => saved.id !== id)
}

export function renameRoute(routes: SavedRoute[], id: string, name: string): SavedRoute[] {
  const trimmed = name.trim()
  if (!trimmed) return routes
  return routes.map((saved) => (saved.id === id ? { ...saved, name: trimmed } : saved))
}

const STORAGE_KEY = 'loopmaker.savedRoutes.v1'

/** A saved route is only useful if it survives a reload, and only that. */
export function createLocalStore(key = STORAGE_KEY): RouteStore {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key)
        if (!raw) return []
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        // Anything malformed is dropped rather than crashing the app around it.
        return parsed.filter(
          (item): item is SavedRoute =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as SavedRoute).id === 'string' &&
            typeof (item as SavedRoute).name === 'string' &&
            Array.isArray((item as SavedRoute).route?.path),
        )
      } catch {
        return []
      }
    },
    write(routes) {
      try {
        localStorage.setItem(key, JSON.stringify(routes))
      } catch {
        throw new StorageFullError()
      }
    },
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A default name a runner would recognise: "5.02 mi NE loop, 8 Sep".
 *
 * The month is spelled out here rather than left to the platform's date
 * formatter, whose abbreviations vary by locale and by browser version.
 */
export function suggestName(label: string, now = new Date()): string {
  return `${label}, ${now.getDate()} ${MONTHS[now.getMonth()]}`
}
