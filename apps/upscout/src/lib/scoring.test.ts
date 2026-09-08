import { describe, expect, it } from 'vitest'
import { makeJob, makeProfile, NOW } from './__fixtures__/jobs'
import { DEFAULT_WEIGHTS, describeAge, explain, rankJobs, scoreJob } from './scoring'

const profile = makeProfile()
const score = (job = makeJob()) => scoreJob(job, profile, DEFAULT_WEIGHTS, NOW)
const factor = (job: ReturnType<typeof makeJob>, key: string) =>
  score(job).factors.find((entry) => entry.key === key)!

describe('scoreJob', () => {
  it('rates a fresh, well paid, on-skill job from a good client highly', () => {
    expect(score().total).toBeGreaterThanOrEqual(85)
    expect(score().tier).toBe('strong')
  })

  it('stays within 0 and 100 whatever the inputs', () => {
    const awful = makeJob({
      budget: { type: 'hourly', min: 3, currency: 'USD' },
      skills: ['Wordpress'],
      title: 'Unpaid internship',
      description: 'unpaid work for exposure',
      proposals: 90,
      postedAt: '2026-01-01T00:00:00.000Z',
      client: { paymentVerified: false, rating: 1, totalSpend: 0, hireRate: 0 },
    })
    const result = score(awful)
    expect(result.total).toBeGreaterThanOrEqual(0)
    expect(result.total).toBeLessThanOrEqual(100)
    expect(result.tier).toBe('weak')
  })
})

describe('the pay factor', () => {
  it('gives nothing below your floor and full marks at your target', () => {
    expect(factor(makeJob({ budget: { type: 'hourly', min: 20, currency: 'USD' } }), 'pay').value).toBe(0)
    expect(factor(makeJob({ budget: { type: 'hourly', min: 70, currency: 'USD' } }), 'pay').value).toBe(1)
  })

  it('judges a range on its low end, not its top', () => {
    const wide = factor(makeJob({ budget: { type: 'hourly', min: 45, max: 200, currency: 'USD' } }), 'pay')
    expect(wide.value).toBeLessThan(0.7)
  })

  it('marks a missing budget unknown rather than bad', () => {
    const unknown = factor(makeJob({ budget: { type: 'fixed', currency: 'USD' } }), 'pay')
    expect(unknown.unknown).toBe(true)
    expect(unknown.value).toBeGreaterThan(0.3)
  })

  it('scores a fixed budget above the floor on a log scale', () => {
    const small = factor(makeJob({ budget: { type: 'fixed', min: 600, currency: 'USD' } }), 'pay')
    const big = factor(makeJob({ budget: { type: 'fixed', min: 4000, currency: 'USD' } }), 'pay')
    expect(big.value).toBeGreaterThan(small.value)
    expect(factor(makeJob({ budget: { type: 'fixed', min: 100, currency: 'USD' } }), 'pay').value).toBe(0)
  })
})

describe('the other factors', () => {
  it('rewards fewer proposals', () => {
    expect(factor(makeJob({ proposals: 2 }), 'competition').value).toBeGreaterThan(
      factor(makeJob({ proposals: 30 }), 'competition').value,
    )
  })

  it('halves freshness every twelve hours', () => {
    const fresh = factor(makeJob({ postedAt: '2026-03-10T12:00:00.000Z' }), 'freshness').value
    const older = factor(makeJob({ postedAt: '2026-03-10T00:00:00.000Z' }), 'freshness').value
    expect(fresh).toBeCloseTo(1, 5)
    expect(older).toBeCloseTo(0.5, 5)
  })

  it('treats an unknown client as neutral, not as a bad one', () => {
    const unknown = factor(makeJob({ client: {} }), 'client')
    const bad = factor(makeJob({ client: { paymentVerified: false, rating: 4, totalSpend: 0 } }), 'client')
    expect(unknown.unknown).toBe(true)
    expect(unknown.value).toBeGreaterThan(bad.value)
  })

  it('counts your skills, and counts one in the title for more', () => {
    const inBody = factor(
      makeJob({ title: 'Internal tool build', description: 'react typescript', skills: [] }),
      'skills',
    ).value
    const inTitle = factor(makeJob({ title: 'React build', description: 'react typescript', skills: [] }), 'skills').value
    expect(inTitle).toBeGreaterThan(inBody)
  })
})

describe('red flags', () => {
  it('takes points off for each word on your avoid list', () => {
    const clean = score(makeJob())
    const flagged = score(makeJob({ description: 'This is unpaid work for exposure.' }))
    expect(flagged.redFlags).toEqual(['unpaid'])
    expect(flagged.total).toBeLessThan(clean.total)
  })
})

describe('rankJobs', () => {
  it('puts the better job first and stays stable across calls', () => {
    const good = makeJob({ id: '~01good' })
    const poor = makeJob({
      id: '~01poor',
      budget: { type: 'hourly', min: 15, currency: 'USD' },
      proposals: 60,
      skills: [],
      title: 'Data entry',
      description: 'copy paste rows',
    })
    const first = rankJobs([poor, good], profile, DEFAULT_WEIGHTS, NOW)
    const second = rankJobs([good, poor], profile, DEFAULT_WEIGHTS, NOW)
    expect(first.map((entry) => entry.job.id)).toEqual(['~01good', '~01poor'])
    expect(second.map((entry) => entry.job.id)).toEqual(first.map((entry) => entry.job.id))
  })

  it('respects reweighting: pay only ranks by pay', () => {
    const wellPaidNoMatch = makeJob({
      id: '~01pay',
      title: 'Cobol migration',
      skills: ['Cobol'],
      description: 'legacy migration',
      budget: { type: 'hourly', min: 120, currency: 'USD' },
      proposals: 40,
    })
    const onSkillLowPay = makeJob({ id: '~01skill', budget: { type: 'hourly', min: 42, currency: 'USD' } })
    const ranked = rankJobs(
      [onSkillLowPay, wellPaidNoMatch],
      profile,
      { pay: 100, skills: 0, client: 0, competition: 0, freshness: 0, fit: 0 },
      NOW,
    )
    expect(ranked[0].job.id).toBe('~01pay')
  })
})

describe('explain', () => {
  it('names the strong factors and the weak one', () => {
    const result = explain(score(makeJob({ proposals: 80 })))
    expect(result.good.length).toBeGreaterThan(0)
    expect(result.bad?.key).toBe('competition')
  })
})

describe('describeAge', () => {
  it('reads the way a person would say it', () => {
    expect(describeAge(0.25)).toBe('15 min ago')
    expect(describeAge(5)).toBe('5 hr ago')
    expect(describeAge(30)).toBe('1 day ago')
    expect(describeAge(72)).toBe('3 days ago')
  })
})
