/**
 * The shapes every part of the app agrees on.
 *
 * A job can arrive from an RSS saved search, from the Upwork API through a
 * bridge, or pasted in by hand, and every one of those knows a different amount
 * about the posting. So almost everything here is optional: the ranking treats
 * "not stated" as its own case rather than pretending a missing client rating
 * is a bad one.
 */

export type PayType = 'hourly' | 'fixed'

export interface Budget {
  type: PayType
  /** Hourly: the rate per hour. Fixed: the whole budget. */
  min?: number
  max?: number
  currency: string
}

export interface ClientInfo {
  country?: string
  paymentVerified?: boolean
  /** Out of 5. */
  rating?: number
  /** Lifetime spend in USD. */
  totalSpend?: number
  hires?: number
  jobsPosted?: number
  /** 0–1, hires divided by jobs posted where both are known. */
  hireRate?: number
}

export type ExperienceLevel = 'entry' | 'intermediate' | 'expert'

export interface Job {
  /** Stable across refreshes — the Upwork ciphertext id where one is available. */
  id: string
  title: string
  description: string
  url: string
  /** ISO timestamp. */
  postedAt: string
  budget: Budget
  skills: string[]
  category?: string
  /** Bids already placed, or the low end of Upwork's bucket ("20 to 50" → 20). */
  proposals?: number
  /** Connects it costs to bid. */
  connects?: number
  duration?: string
  experienceLevel?: ExperienceLevel
  client: ClientInfo
  /** Id of the source that produced it. */
  source: string
  fetchedAt: string
}

/** Who you are, in the terms the ranking and the letters need. */
export interface Profile {
  name: string
  headline: string
  /** The rate you're aiming for; jobs at or above it score full marks on pay. */
  targetHourly: number
  /** Below this you don't want the work at all. */
  minHourly: number
  minFixed: number
  skills: string[]
  /** Words that mark work you're unusually good at. */
  strengths: string[]
  /** Words that mark work you don't want, however well it pays. */
  avoid: string[]
  portfolio: string
  timezone: string
}

/** The search itself: what to pull, and what to throw away on arrival. */
export interface Criteria {
  query: string
  /** A job must mention at least one of these (empty means no requirement). */
  includeKeywords: string[]
  /** A job mentioning any of these is dropped. */
  excludeKeywords: string[]
  /** Every one of these must appear in the job's skills or title. */
  requiredSkills: string[]
  payType: PayType | 'any'
  minHourly?: number
  minFixed?: number
  maxProposals?: number
  maxPostedHoursAgo?: number
  minClientSpend?: number
  minClientRating?: number
  paymentVerifiedOnly: boolean
  /** Empty means anywhere. Matched case-insensitively against the client country. */
  countriesAllow: string[]
  countriesDeny: string[]
  experienceLevels: ExperienceLevel[]
  maxConnects?: number
}

export interface Template {
  id: string
  name: string
  body: string
  /** Auto-selection: the template whose keywords the job hits most often wins. */
  matchKeywords: string[]
  isDefault: boolean
}

export type ApplicationStatus = 'draft' | 'queued' | 'submitted' | 'failed' | 'skipped'

export interface Application {
  id: string
  jobId: string
  jobTitle: string
  jobUrl: string
  templateId?: string
  letter: string
  status: ApplicationStatus
  /** The viability score at the time it was drafted, for later review. */
  score: number
  connects: number
  /** Why it failed or was skipped. */
  reason?: string
  createdAt: string
  submittedAt?: string
  /** True when auto-apply produced it rather than a tap. */
  auto: boolean
}

/** How the ranking weighs each factor. Whole numbers so the UI can use sliders. */
export interface Weights {
  pay: number
  skills: number
  competition: number
  client: number
  freshness: number
  fit: number
}

export type SourceKind = 'rss' | 'json' | 'upwork-api' | 'manual'

export interface SourceConfig {
  id: string
  kind: SourceKind
  label: string
  enabled: boolean
  /** Feed URL, bridge endpoint, or GraphQL endpoint depending on the kind. */
  url: string
  /** Sent as a bearer token where the source takes one. Stored on this device only. */
  token?: string
}

export interface AutoApplySettings {
  enabled: boolean
  /** Nothing below this score is ever sent. */
  minScore: number
  maxPerDay: number
  /** Connects the run may spend in a day. */
  connectsPerDay: number
  /** Queue for review instead of sending. On by default, and worth leaving on. */
  requireApproval: boolean
  /** Never bid on a job with more proposals than this, whatever it scores. */
  maxProposals?: number
  /** Where applications are actually sent. Without it, sending is manual. */
  submitUrl: string
  submitToken?: string
}
