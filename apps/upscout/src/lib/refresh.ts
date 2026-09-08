/**
 * When to fetch without being asked.
 *
 * "Refresh at will" should mostly mean not having to. Once a bridge is set up
 * the app pulls when you open it and while you're looking at it, so the list
 * in front of you is the list as it stands — but on a schedule that respects
 * that it's someone else's server: never more than once a minute, never while
 * a fetch is already running, and never at all while the app is in the
 * background or the setting is off.
 */
import type { SourceConfig } from './types'

/** Jobs older than this are worth replacing when you come back to the app. */
export const DEFAULT_REFRESH_MINUTES = 10

/** How stale the list may get before an auto-refresh, in minutes. 0 is off. */
export const REFRESH_CHOICES = [0, 5, 10, 30, 60]

export function liveSources(sources: SourceConfig[]): SourceConfig[] {
  return sources.filter((source) => source.enabled && source.kind !== 'manual' && source.url.trim().length > 0)
}

export interface RefreshInput {
  sources: SourceConfig[]
  lastFetchedAt?: string
  /** 0 turns automatic refreshing off entirely. */
  everyMinutes: number
  fetching: boolean
  /** False while the app is in another tab or the phone is asleep. */
  visible: boolean
  now: Date
}

export function shouldAutoRefresh({ sources, lastFetchedAt, everyMinutes, fetching, visible, now }: RefreshInput): boolean {
  if (!visible || fetching || everyMinutes <= 0) return false
  if (liveSources(sources).length === 0) return false
  if (!lastFetchedAt) return true

  const last = Date.parse(lastFetchedAt)
  // An unreadable or future timestamp shouldn't start a fetch loop.
  if (!Number.isFinite(last) || last > now.getTime()) return false
  return now.getTime() - last >= everyMinutes * 60_000
}

/** "updated 2 min ago", for the line under the heading. */
export function describeFetchedAt(lastFetchedAt: string | undefined, now: Date): string {
  if (!lastFetchedAt) return 'not fetched yet'
  const last = Date.parse(lastFetchedAt)
  if (!Number.isFinite(last)) return 'not fetched yet'
  const minutes = Math.floor(Math.max(0, now.getTime() - last) / 60_000)
  if (minutes < 1) return 'updated just now'
  if (minutes < 60) return `updated ${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `updated ${hours} hr ago`
  return `updated ${Math.round(hours / 24)} d ago`
}
