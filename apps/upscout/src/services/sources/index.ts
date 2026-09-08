/**
 * Pulling jobs in, from wherever you've told it to look.
 *
 * Four kinds of source, one result:
 *
 * - **rss** — an Upwork saved-search feed URL. Zero setup if you can reach it.
 * - **json** — any endpoint returning `{ "jobs": [...] }` in the documented
 *   shape. This is the hook for your own bridge or worker.
 * - **upwork-api** — the official GraphQL API, through a proxy that holds
 *   your OAuth token.
 * - **manual** — text you paste in. Nothing to configure, works offline,
 *   and it's what makes the app usable the minute you install it.
 *
 * A failing source never takes the others down: each one's error is reported
 * next to it and the jobs that did arrive are still ranked.
 *
 * On the browser: a page can only fetch a URL whose server allows it. Upwork's
 * own domain does not, so an upwork.com feed URL pasted straight in will be
 * blocked by the browser unless it's served through something of yours. That
 * isn't a limitation this app can code around — it's the browser's rule — and
 * it's why the manual and bridge paths exist.
 */
import type { Criteria, Job, SourceConfig } from '../../lib/types'
import { requestJson, requestText } from '../http'
import { dedupeJobs, normaliseJob, type RawJob } from './normalise'
import { looksLikeFeed, parseFeed } from './rss'
import { fetchFromApi } from './upworkApi'

export { dedupeJobs, normaliseJob } from './normalise'
export { parseFeed, looksLikeFeed } from './rss'

export interface SourceResult {
  sourceId: string
  label: string
  jobs: Job[]
  error?: string
}

export interface FetchOutcome {
  jobs: Job[]
  results: SourceResult[]
}

/**
 * Reads whatever's on the clipboard: a feed document, a JSON array, or a
 * `{jobs: [...]}` envelope. Anything else throws with a readable message
 * rather than producing an empty list you'd have to guess about.
 */
export function parsePasted(text: string, sourceId = 'manual', now = new Date()): Job[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  if (looksLikeFeed(trimmed)) return parseFeed(trimmed, sourceId, now)

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new Error("That doesn't look like a feed or JSON. Paste the XML from a feed URL, or a JSON list of jobs.")
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { jobs?: unknown }).jobs)
      ? (parsed as { jobs: unknown[] }).jobs
      : undefined
  if (!list) throw new Error('Expected a JSON array of jobs, or an object with a "jobs" array.')

  return list
    .map((item) => (item && typeof item === 'object' ? normaliseJob(item as RawJob, sourceId, now) : undefined))
    .filter((job): job is Job => Boolean(job))
}

async function fetchOne(source: SourceConfig, criteria: Criteria, signal?: AbortSignal, now = new Date()): Promise<Job[]> {
  switch (source.kind) {
    case 'rss': {
      // The feed is its own saved search, so the app's query is not forced
      // onto it. A token is sent when set, for a feed served via your bridge.
      const xml = await requestText(source.url, {
        signal,
        headers: source.token ? { Authorization: `Bearer ${source.token}` } : undefined,
      })
      return parseFeed(xml, source.id, now)
    }
    case 'json': {
      const url = withQuery(source.url, criteria)
      const payload = await requestJson<{ jobs?: unknown } | unknown[]>(url, {
        signal,
        headers: source.token ? { Authorization: `Bearer ${source.token}` } : undefined,
      })
      const list = Array.isArray(payload) ? payload : Array.isArray(payload.jobs) ? payload.jobs : []
      return list
        .map((item) => (item && typeof item === 'object' ? normaliseJob(item as RawJob, source.id, now) : undefined))
        .filter((job): job is Job => Boolean(job))
    }
    case 'upwork-api':
      return fetchFromApi(source.url, criteria.query, { token: source.token, signal, sourceId: source.id, now })
    case 'manual':
      return []
  }
}

/** The search terms a bridge needs, appended without clobbering its own query. */
export function withQuery(url: string, criteria: Criteria): string {
  try {
    const parsed = new URL(url)
    if (criteria.query) parsed.searchParams.set('q', criteria.query)
    if (criteria.requiredSkills.length) parsed.searchParams.set('skills', criteria.requiredSkills.join(','))
    if (criteria.maxPostedHoursAgo !== undefined) parsed.searchParams.set('hours', String(criteria.maxPostedHoursAgo))
    return parsed.toString()
  } catch {
    return url
  }
}

/**
 * Every enabled source at once. Jobs already held are passed in so that a
 * posting seen yesterday keeps yesterday's first-seen time instead of looking
 * newly posted on every refresh.
 */
export async function fetchAllSources(
  sources: SourceConfig[],
  criteria: Criteria,
  options: { existing?: Job[]; signal?: AbortSignal; now?: Date } = {},
): Promise<FetchOutcome> {
  const now = options.now ?? new Date()
  const enabled = sources.filter((source) => source.enabled && source.kind !== 'manual' && source.url.trim())

  const results = await Promise.all(
    enabled.map(async (source): Promise<SourceResult> => {
      try {
        return { sourceId: source.id, label: source.label, jobs: await fetchOne(source, criteria, options.signal, now) }
      } catch (error) {
        return {
          sourceId: source.id,
          label: source.label,
          jobs: [],
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }),
  )

  const fetched = results.flatMap((result) => result.jobs)
  return { jobs: dedupeJobs([...(options.existing ?? []), ...fetched]), results }
}
