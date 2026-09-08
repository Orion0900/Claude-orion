/**
 * Deciding what to apply to without you there.
 *
 * This is the part that can spend your connects and put your name on a letter,
 * so it is written as a plan you can read before anything happens: a decision
 * per job, each with the rule that produced it. The same function drives the
 * preview and the run, which is the only way the preview can be trusted.
 *
 * Every limit fails closed. An unset daily cap doesn't mean unlimited, a job
 * already applied to is never bid on twice, and the whole thing does nothing
 * at all unless it's switched on.
 */
import type { ScoredJob } from './scoring'
import { draftLetter } from './template'
import type { Application, AutoApplySettings, Profile, Template } from './types'

export interface AutoApplyDecision {
  job: ScoredJob['job']
  score: number
  action: 'apply' | 'skip'
  reason: string
  letter: string
  templateId?: string
  connects: number
}

export interface AutoApplyPlan {
  decisions: AutoApplyDecision[]
  /** The ones that would be sent, in the order they'd go. */
  toApply: AutoApplyDecision[]
  applicationsLeftToday: number
  connectsLeftToday: number
  /** Set when the whole run is off, e.g. auto-apply disabled. */
  blocked?: string
}

/** What a bid costs when the source doesn't say. Upwork's common case. */
export const DEFAULT_CONNECTS = 8

export const DEFAULT_AUTO_APPLY: AutoApplySettings = {
  enabled: false,
  minScore: 70,
  maxPerDay: 5,
  connectsPerDay: 40,
  requireApproval: true,
  maxProposals: 20,
  submitUrl: '',
}

/** Applications counted against today's caps: sent or waiting to be sent. */
export function spentToday(history: Application[], now = new Date()): { count: number; connects: number } {
  const day = now.toISOString().slice(0, 10)
  const todays = history.filter(
    (application) =>
      application.createdAt.slice(0, 10) === day &&
      (application.status === 'submitted' || application.status === 'queued'),
  )
  return {
    count: todays.length,
    connects: todays.reduce((sum, application) => sum + (application.connects || 0), 0),
  }
}

export function alreadyApplied(history: Application[], jobId: string): Application | undefined {
  return history.find(
    (application) => application.jobId === jobId && application.status !== 'failed' && application.status !== 'skipped',
  )
}

export interface PlanInput {
  ranked: ScoredJob[]
  profile: Profile
  templates: Template[]
  settings: AutoApplySettings
  history: Application[]
  now?: Date
}

/**
 * Walks the ranked list top down, spending the day's budget on the best jobs
 * first and recording why each of the rest was passed over.
 */
export function planAutoApply({ ranked, profile, templates, settings, history, now = new Date() }: PlanInput): AutoApplyPlan {
  const spent = spentToday(history, now)
  const applicationsLeft = Math.max(0, settings.maxPerDay - spent.count)
  const connectsLeft = Math.max(0, settings.connectsPerDay - spent.connects)

  const plan: AutoApplyPlan = {
    decisions: [],
    toApply: [],
    applicationsLeftToday: applicationsLeft,
    connectsLeftToday: connectsLeft,
  }

  if (!settings.enabled) plan.blocked = 'Auto-apply is off'
  else if (templates.length === 0) plan.blocked = 'No template to send'
  else if (applicationsLeft === 0) plan.blocked = `Daily limit of ${settings.maxPerDay} already used`
  else if (connectsLeft === 0) plan.blocked = `Daily budget of ${settings.connectsPerDay} connects already used`

  let remaining = applicationsLeft
  let connects = connectsLeft

  for (const { job, score } of ranked) {
    const cost = job.connects ?? DEFAULT_CONNECTS
    const { template, letter, missing } = draftLetter(job, profile, templates, score)
    const decide = (action: 'apply' | 'skip', reason: string): AutoApplyDecision => ({
      job,
      score: score.total,
      action,
      reason,
      letter,
      templateId: template?.id,
      connects: cost,
    })

    let decision: AutoApplyDecision
    if (plan.blocked) {
      decision = decide('skip', plan.blocked)
    } else if (alreadyApplied(history, job.id)) {
      decision = decide('skip', 'Already applied')
    } else if (score.total < settings.minScore) {
      decision = decide('skip', `Scores ${score.total}, under your ${settings.minScore}`)
    } else if (score.redFlags.length) {
      decision = decide('skip', `Mentions ${score.redFlags[0]}, which you avoid`)
    } else if (settings.maxProposals !== undefined && job.proposals !== undefined && job.proposals > settings.maxProposals) {
      decision = decide('skip', `${job.proposals} proposals already`)
    } else if (!template) {
      decision = decide('skip', 'No template matched')
    } else if (missing.length) {
      // A letter with a hole in it is worse than no letter, so it waits for you.
      decision = decide('skip', `Letter needs ${missing[0]}`)
    } else if (remaining <= 0) {
      decision = decide('skip', "Today's application limit reached")
    } else if (cost > connects) {
      decision = decide('skip', 'Not enough connects left today')
    } else {
      decision = decide('apply', `Scores ${score.total}${settings.requireApproval ? ', queued for your approval' : ''}`)
      remaining -= 1
      connects -= cost
      plan.toApply.push(decision)
    }
    plan.decisions.push(decision)
  }

  return plan
}

/**
 * Turns the decisions that would be sent into application records.
 *
 * With approval required — the default — they land as `queued` and wait for a
 * tap. Without it they're marked `queued` too and the sender moves them on;
 * nothing here ever claims something was submitted.
 */
export function applicationsFromPlan(plan: AutoApplyPlan, now = new Date()): Application[] {
  return plan.toApply.map((decision, index) => ({
    id: `${now.getTime().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
    jobId: decision.job.id,
    jobTitle: decision.job.title,
    jobUrl: decision.job.url,
    templateId: decision.templateId,
    letter: decision.letter,
    status: 'queued' as const,
    score: decision.score,
    connects: decision.connects,
    createdAt: now.toISOString(),
    auto: true,
  }))
}

/** One drafted application from a tap, rather than from a run. */
export function draftApplication(
  job: ScoredJob,
  profile: Profile,
  templates: Template[],
  now = new Date(),
): Application {
  const { template, letter } = draftLetter(job.job, profile, templates, job.score)
  return {
    id: `${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    jobId: job.job.id,
    jobTitle: job.job.title,
    jobUrl: job.job.url,
    templateId: template?.id,
    letter,
    status: 'draft',
    score: job.score.total,
    connects: job.job.connects ?? DEFAULT_CONNECTS,
    createdAt: now.toISOString(),
    auto: false,
  }
}
