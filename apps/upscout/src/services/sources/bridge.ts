/**
 * Talking to a bridge you've set up once.
 *
 * A bridge is the difference between "paste a search in" and "press Refresh".
 * It holds the Upwork connection — the OAuth tokens, the renewals — so the app
 * never has to, and answers three questions: are you connected, where do I
 * send someone to connect you, and what are the jobs.
 *
 * The URL you paste is treated generously. `https://x.workers.dev`,
 * `https://x.workers.dev/`, and `https://x.workers.dev/jobs` all mean the same
 * bridge, because on a phone that's not a detail worth getting wrong.
 */
import type { Criteria, Job } from '../../lib/types'
import { requestText } from '../http'
import { normaliseJob, type RawJob } from './normalise'
import { looksLikeFeed, parseFeed } from './rss'

export interface BridgeStatus {
  connected: boolean
  /** When the current access token runs out; the bridge renews it itself. */
  expiresAt?: string
  connectedAt?: string
  /** Where to send someone to authorise. Defaults to `${base}/connect`. */
  connectUrl: string
}

/** Trims a pasted URL back to the bridge's root. */
export function bridgeBase(url: string): string {
  return url.trim().replace(/\/+$/, '').replace(/\/(jobs|status|connect)$/i, '')
}

/** A bridge link with the shared secret attached, for opening in a browser. */
export function bridgeLink(url: string, path: string, token?: string): string {
  const base = bridgeBase(url)
  return token ? `${base}${path}?key=${encodeURIComponent(token)}` : `${base}${path}`
}

const auth = (token?: string) => (token ? { Authorization: `Bearer ${token}` } : undefined)

export async function fetchBridgeStatus(url: string, token?: string, signal?: AbortSignal): Promise<BridgeStatus> {
  const base = bridgeBase(url)
  const text = await requestText(`${base}/status`, { headers: auth(token), signal, retries: 1 })
  let parsed: Partial<BridgeStatus> & { error?: string }
  try {
    parsed = JSON.parse(text) as Partial<BridgeStatus>
  } catch {
    throw new Error("That URL answered, but not like a bridge. Check it's the worker's address.")
  }
  if (parsed.error) throw new Error(parsed.error)
  return {
    connected: Boolean(parsed.connected),
    expiresAt: parsed.expiresAt,
    connectedAt: parsed.connectedAt,
    connectUrl: parsed.connectUrl ?? `${base}/connect`,
  }
}

/**
 * The jobs themselves.
 *
 * Either shape is accepted — `{jobs: [...]}` from the full bridge, or feed XML
 * from a plain pass-through proxy — so the simplest possible bridge works too.
 */
export async function fetchBridgeJobs(
  url: string,
  criteria: Criteria,
  options: { token?: string; signal?: AbortSignal; sourceId: string; now?: Date; limit?: number },
): Promise<Job[]> {
  const now = options.now ?? new Date()
  const endpoint = new URL(`${bridgeBase(url)}/jobs`)
  if (criteria.query) endpoint.searchParams.set('q', criteria.query)
  if (criteria.requiredSkills.length) endpoint.searchParams.set('skills', criteria.requiredSkills.join(','))
  if (criteria.maxPostedHoursAgo !== undefined) endpoint.searchParams.set('hours', String(criteria.maxPostedHoursAgo))
  endpoint.searchParams.set('limit', String(options.limit ?? 50))

  const text = await requestText(endpoint.toString(), { headers: auth(options.token), signal: options.signal })
  if (looksLikeFeed(text)) return parseFeed(text, options.sourceId, now)

  let payload: unknown
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('The bridge answered with something that is neither JSON nor a feed.')
  }

  if (payload && typeof payload === 'object' && 'error' in payload) {
    // A bridge that isn't connected says so in words worth passing through.
    throw new Error(String((payload as { error: unknown }).error))
  }

  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { jobs?: unknown }).jobs)
      ? (payload as { jobs: unknown[] }).jobs
      : []

  return list
    .map((item) => (item && typeof item === 'object' ? normaliseJob(item as RawJob, options.sourceId, now) : undefined))
    .filter((job): job is Job => Boolean(job))
}
