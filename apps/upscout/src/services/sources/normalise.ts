/**
 * One job shape out of four different kinds of input.
 *
 * A feed gives strings, a bridge gives whatever its author felt like, and a
 * paste gives whatever was on the clipboard. Rather than trusting any of it,
 * every field is coerced here and anything unusable is dropped — a job with no
 * title or no link can't be ranked or applied to, so it never enters the app.
 */
import { stripHtml } from '../../lib/text'
import type { Budget, ClientInfo, ExperienceLevel, Job, PayType } from '../../lib/types'

/** The loose shape a bridge or a paste is allowed to send. */
export interface RawJob {
  id?: unknown
  title?: unknown
  description?: unknown
  url?: unknown
  link?: unknown
  postedAt?: unknown
  published?: unknown
  createdDateTime?: unknown
  budget?: unknown
  amount?: unknown
  hourlyMin?: unknown
  hourlyMax?: unknown
  type?: unknown
  skills?: unknown
  category?: unknown
  proposals?: unknown
  totalApplicants?: unknown
  connects?: unknown
  duration?: unknown
  experienceLevel?: unknown
  client?: unknown
  [key: string]: unknown
}

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

const asNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const asBoolean = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

const asStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => asString(typeof item === 'object' && item ? (item as { name?: unknown }).name : item)).filter(
      (item): item is string => Boolean(item),
    )
  }
  const single = asString(value)
  return single ? single.split(/\s*,\s*/).filter(Boolean) : []
}

/** ISO timestamp, accepting the several date shapes feeds use. */
export function asTimestamp(value: unknown, fallback: Date): string {
  const text = asString(value)
  if (text) {
    const parsed = Date.parse(text)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds or milliseconds, whichever lands in a sane decade.
    const ms = value > 1e11 ? value : value * 1000
    return new Date(ms).toISOString()
  }
  return fallback.toISOString()
}

function normaliseBudget(raw: RawJob): Budget {
  const nested = typeof raw.budget === 'object' && raw.budget ? (raw.budget as Record<string, unknown>) : undefined
  const type: PayType =
    asString(nested?.type ?? raw.type)?.toLowerCase() === 'fixed'
      ? 'fixed'
      : raw.hourlyMin !== undefined || raw.hourlyMax !== undefined || asString(nested?.type ?? raw.type)?.toLowerCase() === 'hourly'
        ? 'hourly'
        : 'fixed'

  const min = asNumber(nested?.min ?? raw.hourlyMin ?? (type === 'fixed' ? (raw.amount ?? raw.budget) : undefined))
  const max = asNumber(nested?.max ?? raw.hourlyMax)
  return {
    type,
    min,
    max,
    currency: asString(nested?.currency ?? raw.currency)?.toUpperCase() ?? 'USD',
  }
}

function normaliseClient(raw: RawJob): ClientInfo {
  const client = typeof raw.client === 'object' && raw.client ? (raw.client as Record<string, unknown>) : {}
  const hires = asNumber(client.hires ?? client.totalHires)
  const jobsPosted = asNumber(client.jobsPosted ?? client.totalPostedJobs)
  return {
    country: asString(client.country ?? raw.country),
    paymentVerified: asBoolean(client.paymentVerified ?? client.verified ?? raw.paymentVerified),
    rating: asNumber(client.rating ?? client.feedback ?? client.totalFeedback),
    totalSpend: asNumber(client.totalSpend ?? client.spend ?? client.totalCharges),
    hires,
    jobsPosted,
    hireRate:
      asNumber(client.hireRate) ?? (hires !== undefined && jobsPosted ? Math.min(1, hires / jobsPosted) : undefined),
  }
}

const LEVELS: ExperienceLevel[] = ['entry', 'intermediate', 'expert']

/** One raw job, or undefined when there isn't enough of it to use. */
export function normaliseJob(raw: RawJob, source: string, now = new Date()): Job | undefined {
  const title = asString(raw.title)
  const url = asString(raw.url ?? raw.link) ?? ''
  if (!title) return undefined

  const level = asString(raw.experienceLevel)?.toLowerCase()
  const description = stripHtml(asString(raw.description) ?? '')

  return {
    // An id from the source is best; failing that the link is stable enough
    // to keep the same job from arriving twice under different ids.
    id: asString(raw.id) ?? url ?? `${source}:${title}`,
    title,
    description,
    url,
    postedAt: asTimestamp(raw.postedAt ?? raw.published ?? raw.createdDateTime, now),
    budget: normaliseBudget(raw),
    skills: asStringArray(raw.skills),
    category: asString(raw.category),
    proposals: asNumber(raw.proposals ?? raw.totalApplicants),
    connects: asNumber(raw.connects),
    duration: asString(raw.duration),
    experienceLevel: LEVELS.find((known) => known === level),
    client: normaliseClient(raw),
    source,
    fetchedAt: now.toISOString(),
  }
}

/**
 * Same job, one entry.
 *
 * Two sources covering overlapping searches is the normal setup, so jobs are
 * keyed by their Upwork posting id where the URL carries one, and the earlier
 * copy wins — it holds the first-seen timestamp the freshness score uses.
 */
export function dedupeJobs(jobs: Job[]): Job[] {
  const byKey = new Map<string, Job>()
  for (const job of jobs) {
    const key = dedupeKey(job)
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, job)
      continue
    }
    // Keep whichever copy knows more; ties go to the one already there.
    byKey.set(key, richness(job) > richness(existing) ? { ...job, fetchedAt: existing.fetchedAt } : existing)
  }
  return [...byKey.values()]
}

/** Upwork job links end in a ~ciphertext id, which is the true identity. */
export function dedupeKey(job: Job): string {
  const fromUrl = /~[0-9a-z]{10,}/i.exec(job.url)?.[0]
  if (fromUrl) return fromUrl.toLowerCase()
  const fromId = /~[0-9a-z]{10,}/i.exec(job.id)?.[0]
  if (fromId) return fromId.toLowerCase()
  // Lowercased on both halves: two sources rarely agree on capitalisation.
  return `${job.title.toLowerCase().replace(/\s+/g, ' ').trim()}|${(job.client.country ?? '').toLowerCase()}`
}

function richness(job: Job): number {
  let score = job.description.length > 0 ? 1 : 0
  score += job.skills.length ? 1 : 0
  score += job.proposals !== undefined ? 1 : 0
  score += job.budget.min !== undefined || job.budget.max !== undefined ? 1 : 0
  score += job.client.paymentVerified !== undefined ? 1 : 0
  score += job.client.totalSpend !== undefined ? 1 : 0
  return score
}
