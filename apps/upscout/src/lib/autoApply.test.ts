import { describe, expect, it } from 'vitest'
import { makeJob, makeProfile, NOW } from './__fixtures__/jobs'
import { alreadyApplied, applicationsFromPlan, DEFAULT_AUTO_APPLY, planAutoApply, spentToday } from './autoApply'
import { rankJobs } from './scoring'
import { STARTER_TEMPLATE } from './template'
import type { Application, AutoApplySettings, Job, Template } from './types'

const profile = makeProfile()
const templates: Template[] = [
  { id: 'general', name: 'General', body: STARTER_TEMPLATE, matchKeywords: [], isDefault: true },
]

const settings = (overrides: Partial<AutoApplySettings> = {}): AutoApplySettings => ({
  ...DEFAULT_AUTO_APPLY,
  enabled: true,
  ...overrides,
})

const application = (overrides: Partial<Application> = {}): Application => ({
  id: 'a1',
  jobId: '~01abc',
  jobTitle: 'React dashboard',
  jobUrl: 'https://www.upwork.com/jobs/~01abc',
  letter: 'hi',
  status: 'submitted',
  score: 90,
  connects: 8,
  createdAt: NOW.toISOString(),
  auto: true,
  ...overrides,
})

const plan = (jobs: Job[], overrides: Partial<AutoApplySettings> = {}, history: Application[] = []) =>
  planAutoApply({
    ranked: rankJobs(jobs, profile, undefined, NOW),
    profile,
    templates,
    settings: settings(overrides),
    history,
    now: NOW,
  })

describe('planAutoApply', () => {
  it('does nothing at all while auto-apply is off', () => {
    const result = plan([makeJob()], { enabled: false })
    expect(result.blocked).toBe('Auto-apply is off')
    expect(result.toApply).toEqual([])
    expect(result.decisions[0].action).toBe('skip')
  })

  it('applies to a job that clears the bar', () => {
    const result = plan([makeJob()])
    expect(result.toApply).toHaveLength(1)
    expect(result.toApply[0].letter).toContain('React dashboard')
  })

  it('skips anything under the score threshold', () => {
    const result = plan([makeJob({ proposals: 70, budget: { type: 'hourly', min: 41, currency: 'USD' } })], {
      minScore: 90,
    })
    expect(result.toApply).toEqual([])
    expect(result.decisions[0].reason).toMatch(/under your 90/)
  })

  it('never bids twice on the same job', () => {
    const result = plan([makeJob()], {}, [application()])
    expect(result.decisions[0].reason).toBe('Already applied')
  })

  it('bids again after a failed send', () => {
    const result = plan([makeJob()], {}, [application({ status: 'failed' })])
    expect(result.toApply).toHaveLength(1)
  })

  it('spends the daily limit on the best jobs first', () => {
    const best = makeJob({ id: '~01best' })
    const worse = makeJob({ id: '~01worse', proposals: 12, budget: { type: 'hourly', min: 55, currency: 'USD' } })
    const result = plan([worse, best], { maxPerDay: 1 })
    expect(result.toApply.map((decision) => decision.job.id)).toEqual(['~01best'])
    expect(result.decisions[1].reason).toBe("Today's application limit reached")
  })

  it('counts what today already spent', () => {
    const result = plan([makeJob({ id: '~01other' })], { maxPerDay: 2 }, [application(), application({ id: 'a2', jobId: 'x' })])
    expect(result.applicationsLeftToday).toBe(0)
    expect(result.blocked).toMatch(/Daily limit/)
  })

  it('stops when the connects budget runs out', () => {
    const jobs = [1, 2, 3].map((n) => makeJob({ id: `~01job${n}`, connects: 8 }))
    const result = plan(jobs, { maxPerDay: 10, connectsPerDay: 16 })
    expect(result.toApply).toHaveLength(2)
    expect(result.decisions[2].reason).toBe('Not enough connects left today')
  })

  it('refuses a job that trips a red flag however well it scores', () => {
    const result = plan([makeJob({ description: 'React dashboard, unpaid trial first' })], { minScore: 0 })
    expect(result.toApply).toEqual([])
    expect(result.decisions[0].reason).toMatch(/unpaid/)
  })

  it('refuses to send a letter with a hole in it', () => {
    const result = planAutoApply({
      ranked: rankJobs([makeJob()], profile, undefined, NOW),
      profile: makeProfile({ portfolio: '' }),
      templates: [{ id: 'x', name: 'x', body: 'See {{me.portfolio}}', matchKeywords: [], isDefault: true }],
      settings: settings(),
      history: [],
      now: NOW,
    })
    expect(result.decisions[0].reason).toBe('Letter needs me.portfolio')
  })

  it('respects its own proposal ceiling', () => {
    const result = plan([makeJob({ proposals: 30 })], { minScore: 0, maxProposals: 20 })
    expect(result.decisions[0].reason).toBe('30 proposals already')
  })
})

describe('applicationsFromPlan', () => {
  it('queues rather than claiming anything was sent', () => {
    const applications = applicationsFromPlan(plan([makeJob()]), NOW)
    expect(applications).toHaveLength(1)
    expect(applications[0].status).toBe('queued')
    expect(applications[0].auto).toBe(true)
  })
})

describe('spentToday', () => {
  it('counts queued and submitted, but not skipped or failed', () => {
    const history = [
      application({ id: '1', status: 'submitted', connects: 8 }),
      application({ id: '2', status: 'queued', connects: 6 }),
      application({ id: '3', status: 'failed', connects: 8 }),
      application({ id: '4', status: 'submitted', connects: 8, createdAt: '2026-03-09T12:00:00.000Z' }),
    ]
    expect(spentToday(history, NOW)).toEqual({ count: 2, connects: 14 })
  })
})

describe('alreadyApplied', () => {
  it('finds a live application and ignores a dead one', () => {
    expect(alreadyApplied([application()], '~01abc')?.id).toBe('a1')
    expect(alreadyApplied([application({ status: 'skipped' })], '~01abc')).toBeUndefined()
  })
})
