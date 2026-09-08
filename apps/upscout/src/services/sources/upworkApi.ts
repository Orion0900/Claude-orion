/**
 * The Upwork GraphQL API, for anyone who has been granted a key.
 *
 * This is the only route that is unambiguously above board, and the one worth
 * setting up if you can: you register an app with Upwork, get an OAuth access
 * token, and search the marketplace the way Upwork intends. The catch is that
 * api.upwork.com sends no CORS headers, so a browser can't call it directly —
 * the URL you configure should be your own thin proxy that forwards the query
 * and adds the token. See connector/worker.js for one that's about forty lines.
 *
 * The response is read defensively: Upwork has changed field names before, and
 * a job that arrives with half its fields is still worth ranking.
 */
import { requestJson } from '../http'
import type { Job } from '../../lib/types'
import { normaliseJob, type RawJob } from './normalise'

const SEARCH = `query JobSearch($query: String, $limit: Int) {
  marketplaceJobPostingsSearch(
    marketPlaceJobFilter: { searchExpression_eq: $query, pagination_eq: { first: $limit, after: "0" } }
    searchType: USER_JOBS_SEARCH
    sortAttributes: [{ field: RECENCY }]
  ) {
    edges {
      node {
        id
        title
        description
        ciphertext
        createdDateTime
        duration
        experienceLevel
        totalApplicants
        amount { rawValue currency }
        hourlyBudgetMin { rawValue }
        hourlyBudgetMax { rawValue }
        skills { name }
        client {
          totalHires
          totalPostedJobs
          totalSpent { rawValue }
          totalFeedback
          verificationStatus
          location { country }
        }
      }
    }
  }
}`

interface GraphQlResponse {
  data?: {
    marketplaceJobPostingsSearch?: {
      edges?: { node?: Record<string, unknown> }[]
    }
  }
  errors?: { message?: string }[]
}

const raw = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object') {
    const inner = (value as { rawValue?: unknown }).rawValue
    const parsed = typeof inner === 'string' ? Number(inner) : inner
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : undefined
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export function mapApiNode(node: Record<string, unknown>, sourceId: string, now = new Date()): Job | undefined {
  const client = (node.client ?? {}) as Record<string, unknown>
  const location = (client.location ?? {}) as Record<string, unknown>
  const hourlyMin = raw(node.hourlyBudgetMin)
  const hourlyMax = raw(node.hourlyBudgetMax)
  const isHourly = hourlyMin !== undefined || hourlyMax !== undefined
  const ciphertext = typeof node.ciphertext === 'string' ? node.ciphertext : undefined

  const rawJob: RawJob = {
    id: ciphertext ?? node.id,
    title: node.title,
    description: node.description,
    // A ciphertext is what the public job URL is built from.
    url: ciphertext ? `https://www.upwork.com/jobs/${ciphertext}` : '',
    postedAt: node.createdDateTime,
    type: isHourly ? 'hourly' : 'fixed',
    hourlyMin,
    hourlyMax,
    amount: isHourly ? undefined : raw(node.amount),
    currency: (node.amount as { currency?: string } | undefined)?.currency,
    skills: node.skills,
    duration: node.duration,
    experienceLevel: typeof node.experienceLevel === 'string' ? node.experienceLevel.toLowerCase() : undefined,
    proposals: raw(node.totalApplicants),
    client: {
      country: location.country,
      paymentVerified:
        typeof client.verificationStatus === 'string' ? client.verificationStatus.toUpperCase() === 'VERIFIED' : undefined,
      rating: raw(client.totalFeedback),
      totalSpend: raw(client.totalSpent),
      hires: raw(client.totalHires),
      jobsPosted: raw(client.totalPostedJobs),
    },
  }
  return normaliseJob(rawJob, sourceId, now)
}

export async function fetchFromApi(
  endpoint: string,
  query: string,
  options: { token?: string; limit?: number; signal?: AbortSignal; sourceId: string; now?: Date },
): Promise<Job[]> {
  const response = await requestJson<GraphQlResponse>(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify({ query: SEARCH, variables: { query, limit: options.limit ?? 50 } }),
    signal: options.signal,
  })

  if (response.errors?.length) {
    throw new Error(response.errors.map((error) => error.message ?? 'Unknown error').join('; '))
  }

  const edges = response.data?.marketplaceJobPostingsSearch?.edges ?? []
  return edges
    .map((edge) => (edge.node ? mapApiNode(edge.node, options.sourceId, options.now) : undefined))
    .filter((job): job is Job => Boolean(job))
}
