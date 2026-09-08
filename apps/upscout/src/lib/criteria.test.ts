import { describe, expect, it } from 'vitest'
import { makeJob, NOW } from './__fixtures__/jobs'
import { describeCriteria, EMPTY_CRITERIA, filterJobs, rejectionReason } from './criteria'
import type { Criteria } from './types'

const criteria = (overrides: Partial<Criteria> = {}): Criteria => ({ ...EMPTY_CRITERIA, ...overrides })
const reason = (job = makeJob(), rules: Partial<Criteria> = {}) => rejectionReason(job, criteria(rules), NOW)

describe('rejectionReason', () => {
  it('keeps everything when no rules are set', () => {
    expect(reason()).toBeUndefined()
  })

  it('drops jobs mentioning an excluded word', () => {
    expect(reason(makeJob({ description: 'Wordpress theme tweak' }), { excludeKeywords: ['wordpress'] })).toBe(
      'Excluded word "wordpress"',
    )
  })

  it('requires at least one of the include keywords', () => {
    expect(reason(makeJob(), { includeKeywords: ['rust', 'go'] })).toBe('No required keyword')
    expect(reason(makeJob(), { includeKeywords: ['rust', 'react'] })).toBeUndefined()
  })

  it('requires every required skill', () => {
    expect(reason(makeJob(), { requiredSkills: ['React', 'Figma'] })).toBe('Missing skill "Figma"')
    expect(reason(makeJob(), { requiredSkills: ['React', 'TypeScript'] })).toBeUndefined()
  })

  it('filters on pay type and rate', () => {
    expect(reason(makeJob(), { payType: 'fixed' })).toBe('Not fixed')
    expect(reason(makeJob(), { minHourly: 80 })).toBe('Under $80/hr')
    expect(reason(makeJob(), { minHourly: 50 })).toBeUndefined()
  })

  it('never drops a job just for leaving the budget out', () => {
    const noBudget = makeJob({ budget: { type: 'hourly', currency: 'USD' } })
    expect(reason(noBudget, { minHourly: 200 })).toBeUndefined()
  })

  it('filters on proposals, age and connects', () => {
    expect(reason(makeJob({ proposals: 40 }), { maxProposals: 20 })).toBe('Over 20 proposals')
    expect(reason(makeJob({ postedAt: '2026-03-01T00:00:00.000Z' }), { maxPostedHoursAgo: 24 })).toBe('Older than 24h')
    expect(reason(makeJob({ connects: 16 }), { maxConnects: 10 })).toBe('Costs 16 connects')
  })

  it('filters on the client', () => {
    expect(reason(makeJob({ client: { paymentVerified: false } }), { paymentVerifiedOnly: true })).toBe(
      'Payment unverified',
    )
    expect(reason(makeJob(), { minClientSpend: 100_000 })).toBe('Client spend under $100000')
    expect(reason(makeJob(), { minClientRating: 5 })).toBe('Client rated under 5★')
  })

  it('filters on country in both directions', () => {
    expect(reason(makeJob(), { countriesDeny: ['united states'] })).toBe('Client in United States')
    expect(reason(makeJob(), { countriesAllow: ['Canada'] })).toBe('Client outside your countries')
    expect(reason(makeJob(), { countriesAllow: ['United States', 'Canada'] })).toBeUndefined()
  })

  it('leaves an unknown country alone rather than guessing', () => {
    const unknown = makeJob({ client: {} })
    expect(reason(unknown, { countriesAllow: ['Canada'] })).toBeUndefined()
  })
})

describe('filterJobs', () => {
  it('splits the list and counts why', () => {
    const jobs = [
      makeJob({ id: 'a', proposals: 2 }),
      makeJob({ id: 'b', proposals: 50 }),
      makeJob({ id: 'c', proposals: 60 }),
    ]
    const result = filterJobs(jobs, criteria({ maxProposals: 10 }), NOW)
    expect(result.kept.map((job) => job.id)).toEqual(['a'])
    expect(result.dropped).toHaveLength(2)
    expect(result.reasons['Over 10 proposals']).toBe(2)
  })
})

describe('describeCriteria', () => {
  it('reads as a sentence, and says so when there are no rules', () => {
    expect(describeCriteria(criteria())).toBe('Everything the sources return')
    expect(describeCriteria(criteria({ query: 'react', minHourly: 50, maxProposals: 15 }))).toBe(
      '"react" · $50+/hr · under 15 bids',
    )
  })
})
