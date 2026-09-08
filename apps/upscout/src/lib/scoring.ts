/**
 * How worth bidding a job is, as a number you can argue with.
 *
 * Every factor is scored 0–1 on its own terms and then weighted, so the total
 * is only ever a weighted average — no magic. The breakdown travels with the
 * score because the point isn't the number, it's being able to see that a job
 * ranked third only because forty people had already bid on it.
 *
 * Missing information is never scored as bad news. A post that doesn't state
 * the client's rating gets a neutral value with a note saying so, because
 * scoring it zero would bury every job from a source that reports less.
 */
import { containsTerm, matchedTerms, normalise } from './text'
import type { Job, Profile, Weights } from './types'

export interface ScoreFactor {
  key: keyof Weights
  label: string
  /** 0–1 before weighting. */
  value: number
  /** The points this factor contributed to the 0–100 total. */
  points: number
  /** Short human sentence: what this factor saw. */
  note: string
  /** True when the source didn't say, and the value is a neutral stand-in. */
  unknown?: boolean
}

export type Tier = 'strong' | 'good' | 'fair' | 'weak'

export interface JobScore {
  /** 0–100. */
  total: number
  tier: Tier
  factors: ScoreFactor[]
  /** Skills of yours the job asks for. */
  matchedSkills: string[]
  /** Words from your avoid list the job hit, each costing points. */
  redFlags: string[]
}

export interface ScoredJob {
  job: Job
  score: JobScore
}

export const DEFAULT_WEIGHTS: Weights = {
  pay: 30,
  skills: 22,
  client: 16,
  competition: 14,
  freshness: 10,
  fit: 8,
}

/** Each avoid-list hit costs this many points off the total. */
const RED_FLAG_PENALTY = 12

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

export function scoreJob(job: Job, profile: Profile, weights: Weights = DEFAULT_WEIGHTS, now = new Date()): JobScore {
  const haystack = `${job.title} ${job.skills.join(' ')} ${job.description}`
  const matchedSkills = matchedTerms(haystack, profile.skills)
  const redFlags = matchedTerms(haystack, profile.avoid)

  const factors: ScoreFactor[] = [
    payFactor(job, profile),
    skillsFactor(job, profile, matchedSkills),
    clientFactor(job),
    competitionFactor(job),
    freshnessFactor(job, now),
    fitFactor(job, profile),
  ]

  const totalWeight = factors.reduce((sum, factor) => sum + Math.max(0, weights[factor.key]), 0)
  let total = 0
  for (const factor of factors) {
    const weight = Math.max(0, weights[factor.key])
    factor.points = totalWeight > 0 ? (factor.value * weight * 100) / totalWeight : 0
    total += factor.points
  }

  total = Math.round(clamp01((total - redFlags.length * RED_FLAG_PENALTY) / 100) * 100)
  return { total, tier: tierFor(total), factors, matchedSkills, redFlags }
}

export function tierFor(total: number): Tier {
  if (total >= 75) return 'strong'
  if (total >= 60) return 'good'
  if (total >= 45) return 'fair'
  return 'weak'
}

export const TIER_LABEL: Record<Tier, string> = {
  strong: 'Strong fit',
  good: 'Worth a bid',
  fair: 'Borderline',
  weak: 'Probably skip',
}

/**
 * Pay, measured against your own floor and target rather than the market's.
 *
 * A range is judged on its low end: the client will not volunteer the top of
 * it. Fixed price is converted to an implied hourly with a rough estimate of
 * the hours a budget of that size means, which is crude but far better than
 * ranking every fixed job as unknown.
 */
function payFactor(job: Job, profile: Profile): ScoreFactor {
  const { min, max, type, currency } = job.budget
  const stated = min ?? max
  const money = (n: number) => `${currency === 'USD' ? '$' : `${currency} `}${Math.round(n).toLocaleString('en-US')}`

  if (stated === undefined || stated <= 0) {
    return {
      key: 'pay',
      label: 'Pay',
      value: 0.45,
      points: 0,
      note: 'No budget stated',
      unknown: true,
    }
  }

  if (type === 'hourly') {
    const value = rampRate(stated, profile.minHourly, profile.targetHourly)
    const range = max && max > stated ? `${money(stated)}–${money(max)}/hr` : `${money(stated)}/hr`
    return { key: 'pay', label: 'Pay', value, points: 0, note: `${range} against your ${money(profile.targetHourly)} target` }
  }

  const floor = Math.max(1, profile.minFixed)
  // A fixed budget is compared on a log scale: the step from $200 to $600
  // matters far more than the one from $5,000 to $5,400.
  const value = clamp01(Math.log(stated / floor) / Math.log(8))
  const below = stated < floor
  return {
    key: 'pay',
    label: 'Pay',
    value: below ? 0 : Math.max(0.15, value),
    points: 0,
    note: below ? `${money(stated)} fixed, under your ${money(floor)} floor` : `${money(stated)} fixed`,
  }
}

/** 0 below the floor, then a straight climb to full marks at the target. */
function rampRate(rate: number, floor: number, target: number): number {
  if (rate < floor) return 0
  if (rate >= target) return 1
  const span = Math.max(1, target - floor)
  // Meeting the floor is already worth half: it's a job you'd take.
  return 0.5 + 0.5 * ((rate - floor) / span)
}

/**
 * Skill overlap. Three of your skills named is treated as a full match —
 * beyond that a post is just listing everything it can think of.
 */
function skillsFactor(job: Job, profile: Profile, matched: string[]): ScoreFactor {
  if (profile.skills.length === 0) {
    return { key: 'skills', label: 'Skills', value: 0.5, points: 0, note: 'No skills on your profile yet', unknown: true }
  }
  const target = Math.min(3, profile.skills.length)
  let value = clamp01(matched.length / target)
  // A skill in the title is what the job is actually about.
  if (matched.some((skill) => containsTerm(job.title, skill))) value = clamp01(value + 0.15)

  const note = matched.length
    ? `Matches ${matched.slice(0, 3).join(', ')}${matched.length > 3 ? ` +${matched.length - 3}` : ''}`
    : 'None of your skills named'
  return { key: 'skills', label: 'Skills', value, points: 0, note }
}

/**
 * Whether the client is worth working for: verified payment, money actually
 * spent, a good rating, and a habit of hiring rather than window shopping.
 */
function clientFactor(job: Job): ScoreFactor {
  const { paymentVerified, rating, totalSpend, hireRate, jobsPosted } = job.client
  const parts: { value: number; weight: number }[] = []
  const notes: string[] = []

  if (paymentVerified !== undefined) {
    parts.push({ value: paymentVerified ? 1 : 0, weight: 0.3 })
    notes.push(paymentVerified ? 'payment verified' : 'payment unverified')
  }
  if (rating !== undefined && rating > 0) {
    // Everything on Upwork sits between 4 and 5, so that's the range that counts.
    parts.push({ value: clamp01((rating - 4) / 1), weight: 0.25 })
    notes.push(`${rating.toFixed(1)}★`)
  }
  if (totalSpend !== undefined) {
    parts.push({ value: clamp01(Math.log10(Math.max(1, totalSpend)) / 5), weight: 0.3 })
    notes.push(`$${Math.round(totalSpend).toLocaleString('en-US')} spent`)
  }
  if (hireRate !== undefined) {
    parts.push({ value: clamp01(hireRate), weight: 0.15 })
    notes.push(`${Math.round(hireRate * 100)}% hire rate`)
  } else if (jobsPosted !== undefined && jobsPosted > 0 && job.client.hires !== undefined) {
    parts.push({ value: clamp01(job.client.hires / jobsPosted), weight: 0.15 })
  }

  if (parts.length === 0) {
    return { key: 'client', label: 'Client', value: 0.45, points: 0, note: 'Nothing known about the client', unknown: true }
  }
  const weight = parts.reduce((sum, part) => sum + part.weight, 0)
  const value = parts.reduce((sum, part) => sum + part.value * part.weight, 0) / weight
  return { key: 'client', label: 'Client', value, points: 0, note: notes.join(', ') }
}

/** Bids already in. The first handful of proposals are the ones clients read. */
function competitionFactor(job: Job): ScoreFactor {
  const proposals = job.proposals
  if (proposals === undefined) {
    return { key: 'competition', label: 'Competition', value: 0.5, points: 0, note: 'Bid count unknown', unknown: true }
  }
  const value =
    proposals < 5 ? 1 : proposals < 10 ? 0.8 : proposals < 15 ? 0.55 : proposals < 20 ? 0.35 : proposals < 50 ? 0.15 : 0.05
  return { key: 'competition', label: 'Competition', value, points: 0, note: `${proposals}+ proposals already` }
}

/**
 * Age, halving every twelve hours. Bidding early is most of the game on
 * Upwork, and a two-day-old post has usually been decided.
 */
function freshnessFactor(job: Job, now: Date): ScoreFactor {
  const posted = Date.parse(job.postedAt)
  if (!Number.isFinite(posted)) {
    return { key: 'freshness', label: 'Freshness', value: 0.5, points: 0, note: 'Posting time unknown', unknown: true }
  }
  const hours = Math.max(0, (now.getTime() - posted) / 3_600_000)
  const value = clamp01(Math.max(0.02, 0.5 ** (hours / 12)))
  return { key: 'freshness', label: 'Freshness', value, points: 0, note: `Posted ${describeAge(hours)}` }
}

export function describeAge(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min ago`
  if (hours < 24) return `${Math.round(hours)} hr ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * The softer read: does this sound like your kind of work? Strengths in the
 * title count double, because that's the job, not a line in a wish list.
 */
function fitFactor(job: Job, profile: Profile): ScoreFactor {
  if (profile.strengths.length === 0) {
    return { key: 'fit', label: 'Fit', value: 0.5, points: 0, note: 'No strengths listed', unknown: true }
  }
  const inTitle = matchedTerms(job.title, profile.strengths)
  const inBody = matchedTerms(`${job.description} ${job.skills.join(' ')}`, profile.strengths).filter(
    (term) => !inTitle.includes(term),
  )
  const hits = inTitle.length * 2 + inBody.length
  const value = clamp01(hits / 3)
  const named = [...inTitle, ...inBody]
  return {
    key: 'fit',
    label: 'Fit',
    value,
    points: 0,
    note: named.length ? `Mentions ${named.slice(0, 3).join(', ')}` : 'None of your strengths mentioned',
  }
}

/** Highest first, with a stable tiebreak so the list doesn't shuffle on refresh. */
export function rankJobs(jobs: Job[], profile: Profile, weights: Weights = DEFAULT_WEIGHTS, now = new Date()): ScoredJob[] {
  return jobs
    .map((job) => ({ job, score: scoreJob(job, profile, weights, now) }))
    .sort((a, b) => b.score.total - a.score.total || Date.parse(b.job.postedAt) - Date.parse(a.job.postedAt) || compareIds(a, b))
}

function compareIds(a: ScoredJob, b: ScoredJob): number {
  return normalise(a.job.id) < normalise(b.job.id) ? -1 : 1
}

/** The two best reasons to bid and the one reason not to, for the card. */
export function explain(score: JobScore): { good: ScoreFactor[]; bad?: ScoreFactor } {
  const known = score.factors.filter((factor) => !factor.unknown)
  const byValue = [...known].sort((a, b) => b.value - a.value)
  const worst = [...known].sort((a, b) => a.points - b.points)[0]
  return {
    good: byValue.filter((factor) => factor.value >= 0.5).slice(0, 2),
    bad: worst && worst.value < 0.5 ? worst : undefined,
  }
}
