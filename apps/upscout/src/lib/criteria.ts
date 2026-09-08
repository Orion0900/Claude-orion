/**
 * The hard filter, kept separate from the ranking on purpose.
 *
 * Criteria answer "would I even look at this?" — a yes or no. Ranking answers
 * "which of these first?" Mixing them hides jobs behind a low score when what
 * you meant was a rule, and it makes a rule out of what you meant as a
 * preference.
 *
 * Rejections are returned rather than swallowed, so the app can say "31 jobs
 * fetched, 24 filtered out: 18 too many proposals" instead of showing an empty
 * list and letting you wonder whether the search is broken.
 */
import { containsTerm, matchedTerms, normalise } from './text'
import type { Criteria, Job } from './types'

export interface FilterResult {
  kept: Job[]
  /** Every dropped job with the first rule it broke, newest rule order preserved. */
  dropped: { job: Job; reason: string }[]
  /** Rule → how many jobs it dropped, for the "why is this empty" line. */
  reasons: Record<string, number>
}

export const EMPTY_CRITERIA: Criteria = {
  query: '',
  includeKeywords: [],
  excludeKeywords: [],
  requiredSkills: [],
  payType: 'any',
  paymentVerifiedOnly: false,
  countriesAllow: [],
  countriesDeny: [],
  experienceLevels: [],
}

/**
 * The first rule a job breaks, or undefined when it passes. Order matters
 * only for which reason gets reported.
 */
export function rejectionReason(job: Job, criteria: Criteria, now = new Date()): string | undefined {
  const haystack = `${job.title} ${job.skills.join(' ')} ${job.description}`

  if (criteria.excludeKeywords.length) {
    const hit = matchedTerms(haystack, criteria.excludeKeywords)[0]
    if (hit) return `Excluded word "${hit}"`
  }

  if (criteria.includeKeywords.length && matchedTerms(haystack, criteria.includeKeywords).length === 0) {
    return 'No required keyword'
  }

  if (criteria.requiredSkills.length) {
    const missing = criteria.requiredSkills.find(
      (skill) => !containsTerm(`${job.title} ${job.skills.join(' ')}`, skill),
    )
    if (missing) return `Missing skill "${missing}"`
  }

  if (criteria.payType !== 'any' && job.budget.type !== criteria.payType) {
    return `Not ${criteria.payType}`
  }

  // A missing budget is never a rejection on its own: plenty of good posts
  // leave it out, and the ranking already discounts them.
  const stated = job.budget.min ?? job.budget.max
  if (stated !== undefined) {
    if (job.budget.type === 'hourly' && criteria.minHourly !== undefined && stated < criteria.minHourly) {
      return `Under $${criteria.minHourly}/hr`
    }
    if (job.budget.type === 'fixed' && criteria.minFixed !== undefined && stated < criteria.minFixed) {
      return `Under $${criteria.minFixed} fixed`
    }
  }

  if (criteria.maxProposals !== undefined && job.proposals !== undefined && job.proposals > criteria.maxProposals) {
    return `Over ${criteria.maxProposals} proposals`
  }

  if (criteria.maxPostedHoursAgo !== undefined) {
    const posted = Date.parse(job.postedAt)
    if (Number.isFinite(posted)) {
      const hours = (now.getTime() - posted) / 3_600_000
      if (hours > criteria.maxPostedHoursAgo) return `Older than ${criteria.maxPostedHoursAgo}h`
    }
  }

  if (criteria.paymentVerifiedOnly && job.client.paymentVerified === false) {
    return 'Payment unverified'
  }
  if (
    criteria.minClientSpend !== undefined &&
    job.client.totalSpend !== undefined &&
    job.client.totalSpend < criteria.minClientSpend
  ) {
    return `Client spend under $${criteria.minClientSpend}`
  }
  if (criteria.minClientRating !== undefined && job.client.rating !== undefined && job.client.rating < criteria.minClientRating) {
    return `Client rated under ${criteria.minClientRating}★`
  }

  const country = job.client.country ? normalise(job.client.country) : ''
  if (country) {
    if (criteria.countriesDeny.some((deny) => normalise(deny) === country)) return `Client in ${job.client.country}`
    if (criteria.countriesAllow.length && !criteria.countriesAllow.some((allow) => normalise(allow) === country)) {
      return `Client outside your countries`
    }
  }

  if (criteria.experienceLevels.length && job.experienceLevel && !criteria.experienceLevels.includes(job.experienceLevel)) {
    return `${job.experienceLevel} level`
  }

  if (criteria.maxConnects !== undefined && job.connects !== undefined && job.connects > criteria.maxConnects) {
    return `Costs ${job.connects} connects`
  }

  return undefined
}

export function filterJobs(jobs: Job[], criteria: Criteria, now = new Date()): FilterResult {
  const kept: Job[] = []
  const dropped: { job: Job; reason: string }[] = []
  const reasons: Record<string, number> = {}

  for (const job of jobs) {
    const reason = rejectionReason(job, criteria, now)
    if (reason === undefined) {
      kept.push(job)
    } else {
      dropped.push({ job, reason })
      reasons[reason] = (reasons[reason] ?? 0) + 1
    }
  }
  return { kept, dropped, reasons }
}

/** The rules in one line, for the header above the results. */
export function describeCriteria(criteria: Criteria): string {
  const parts: string[] = []
  if (criteria.query) parts.push(`"${criteria.query}"`)
  if (criteria.payType !== 'any') parts.push(criteria.payType)
  if (criteria.minHourly !== undefined) parts.push(`$${criteria.minHourly}+/hr`)
  if (criteria.minFixed !== undefined) parts.push(`$${criteria.minFixed}+ fixed`)
  if (criteria.requiredSkills.length) parts.push(criteria.requiredSkills.join(' + '))
  if (criteria.maxProposals !== undefined) parts.push(`under ${criteria.maxProposals} bids`)
  if (criteria.maxPostedHoursAgo !== undefined) parts.push(`last ${criteria.maxPostedHoursAgo}h`)
  if (criteria.paymentVerifiedOnly) parts.push('verified clients')
  return parts.length ? parts.join(' · ') : 'Everything the sources return'
}
