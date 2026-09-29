/**
 * Keeping a run alive through a reload.
 *
 * A home-screen web app on an iPhone can be thrown out of memory at any time —
 * switching to the music app, taking a photo, or a call is enough — and when the
 * runner comes back the page starts from scratch. Without this, that is the run
 * gone: back on the planning screen, route, progress and clock all lost, which
 * is exactly what "it failed partway through" looks like from the outside.
 *
 * So the run in progress is written down as it goes, and picked back up when
 * the app opens.
 */
import type { RunDirection } from './direction'
import { browserStorage, type PreferenceStorage } from './preferences'
import type { RouteResult } from './routeSearch'

export interface ActiveRun {
  version: 1
  /** The route as chosen, before any reversal. */
  route: RouteResult
  direction: RunDirection
  /** Whether the way round the loop has been decided yet. */
  directionSettled: boolean
  /** Wall-clock start, milliseconds. */
  startedAt: number
  /** Last known progress along the (possibly reversed) route, meters. */
  distanceAlong: number
  /** Matched segment of that progress, to seed matching when resuming. */
  segment: number | null
  /** When this record was last written, milliseconds. */
  updatedAt: number
}

/** Older than this, it was abandoned rather than interrupted. */
export const ACTIVE_RUN_MAX_AGE_MS = 6 * 60 * 60 * 1000

const KEY = 'loopmaker.activeRun.v1'

export interface ActiveRunStore {
  read(now?: number): ActiveRun | null
  begin(route: RouteResult, now?: number): ActiveRun
  update(patch: Partial<Omit<ActiveRun, 'version' | 'route' | 'startedAt'>>, now?: number): void
  clear(): void
}

function isActiveRun(value: unknown): value is ActiveRun {
  if (typeof value !== 'object' || value === null) return false
  const run = value as ActiveRun
  return (
    run.version === 1 &&
    Array.isArray(run.route?.path) &&
    run.route.path.length >= 2 &&
    Array.isArray(run.route.steps) &&
    (run.direction === 'forward' || run.direction === 'reverse') &&
    typeof run.startedAt === 'number' &&
    typeof run.updatedAt === 'number' &&
    typeof run.distanceAlong === 'number'
  )
}

export function createActiveRunStore(
  storage: (PreferenceStorage & { removeItem?(key: string): void }) | null = browserStorage(),
): ActiveRunStore {
  // Kept in memory too, so progress updates don't re-read the whole route.
  let current: ActiveRun | null = null

  const write = (run: ActiveRun | null) => {
    current = run
    try {
      if (run) storage?.setItem(KEY, JSON.stringify(run))
      else if (storage?.removeItem) storage.removeItem(KEY)
      else storage?.setItem(KEY, '')
    } catch {
      // Out of room or blocked: the run carries on, it just won't survive a reload.
    }
  }

  return {
    read(now = Date.now()) {
      try {
        const raw = storage?.getItem(KEY)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        if (!isActiveRun(parsed) || now - parsed.updatedAt > ACTIVE_RUN_MAX_AGE_MS) {
          write(null)
          return null
        }
        current = parsed
        return parsed
      } catch {
        return null
      }
    },
    begin(route, now = Date.now()) {
      const run: ActiveRun = {
        version: 1,
        route,
        direction: 'forward',
        directionSettled: false,
        startedAt: now,
        distanceAlong: 0,
        segment: null,
        updatedAt: now,
      }
      write(run)
      return run
    },
    update(patch, now = Date.now()) {
      if (!current) return
      write({ ...current, ...patch, updatedAt: now })
    },
    clear() {
      write(null)
    },
  }
}
