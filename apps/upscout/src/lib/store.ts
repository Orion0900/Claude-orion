/**
 * Everything the app knows, kept on the device.
 *
 * There's no account and no server: your profile, your letters, your feed
 * tokens and the jobs last pulled all live in this browser's storage. That's
 * what makes the app usable on a phone in a queue with no signal, and it's
 * also the only sane place for a token that can read your Upwork searches.
 *
 * Stored data is treated as untrusted on the way back in — a half-written
 * record from an interrupted save, or an older shape from a previous version,
 * must never take the app down. Anything unrecognised falls back to a default.
 */
import { DEFAULT_AUTO_APPLY } from './autoApply'
import { EMPTY_CRITERIA } from './criteria'
import { DEFAULT_REFRESH_MINUTES } from './refresh'
import { DEFAULT_WEIGHTS } from './scoring'
import { STARTER_TEMPLATE } from './template'
import type { Application, Criteria, Job, Profile, SourceConfig, Template, Weights, AutoApplySettings } from './types'

export interface AppState {
  version: number
  profile: Profile
  criteria: Criteria
  weights: Weights
  templates: Template[]
  sources: SourceConfig[]
  autoApply: AutoApplySettings
  applications: Application[]
  /** The last pull, kept so the list is there before the network is. */
  jobs: Job[]
  lastFetchedAt?: string
  /** Minutes before the app refreshes by itself. 0 turns that off. */
  autoRefreshMinutes: number
}

export const STATE_VERSION = 1
const STORAGE_KEY = 'upscout.state.v1'

/** Jobs and history are capped so a year of use can't fill the quota. */
export const MAX_JOBS = 400
export const MAX_APPLICATIONS = 500

export const DEFAULT_PROFILE: Profile = {
  name: '',
  headline: '',
  targetHourly: 60,
  minHourly: 35,
  minFixed: 300,
  skills: [],
  strengths: [],
  avoid: ['unpaid', 'equity only', 'commission only'],
  portfolio: '',
  timezone: typeof Intl !== 'undefined' ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? '') : '',
}

export function defaultState(): AppState {
  return {
    version: STATE_VERSION,
    profile: { ...DEFAULT_PROFILE },
    criteria: { ...EMPTY_CRITERIA, maxPostedHoursAgo: 48 },
    weights: { ...DEFAULT_WEIGHTS },
    templates: [
      {
        id: 'starter',
        name: 'General proposal',
        body: STARTER_TEMPLATE,
        matchKeywords: [],
        isDefault: true,
      },
    ],
    sources: [],
    autoApply: { ...DEFAULT_AUTO_APPLY },
    applications: [],
    jobs: [],
    autoRefreshMinutes: DEFAULT_REFRESH_MINUTES,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Fills a stored blob out to a whole state.
 *
 * Fields added in a later version simply aren't in an older blob, so every
 * object is merged over its default rather than replacing it, and any array
 * that isn't an array is dropped.
 */
export function mergeState(stored: unknown): AppState {
  const base = defaultState()
  if (!isRecord(stored)) return base

  const merged: AppState = {
    ...base,
    profile: { ...base.profile, ...(isRecord(stored.profile) ? stored.profile : {}) } as Profile,
    criteria: { ...base.criteria, ...(isRecord(stored.criteria) ? stored.criteria : {}) } as Criteria,
    weights: { ...base.weights, ...(isRecord(stored.weights) ? stored.weights : {}) } as Weights,
    autoApply: { ...base.autoApply, ...(isRecord(stored.autoApply) ? stored.autoApply : {}) } as AutoApplySettings,
    templates: Array.isArray(stored.templates) ? (stored.templates as Template[]).filter(isTemplate) : base.templates,
    sources: Array.isArray(stored.sources) ? (stored.sources as SourceConfig[]).filter(isSource) : base.sources,
    applications: Array.isArray(stored.applications)
      ? (stored.applications as Application[]).filter(isApplication).slice(0, MAX_APPLICATIONS)
      : [],
    jobs: Array.isArray(stored.jobs) ? (stored.jobs as Job[]).filter(isJob).slice(0, MAX_JOBS) : [],
    lastFetchedAt: typeof stored.lastFetchedAt === 'string' ? stored.lastFetchedAt : undefined,
    autoRefreshMinutes:
      typeof stored.autoRefreshMinutes === 'number' && stored.autoRefreshMinutes >= 0
        ? stored.autoRefreshMinutes
        : base.autoRefreshMinutes,
    version: STATE_VERSION,
  }

  // A profile with no templates left can't draft anything; give the starter back.
  if (merged.templates.length === 0) merged.templates = base.templates
  return normaliseArrays(merged)
}

/** Keeps string-array fields as string arrays whatever the blob said. */
function normaliseArrays(state: AppState): AppState {
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  state.profile.skills = strings(state.profile.skills)
  state.profile.strengths = strings(state.profile.strengths)
  state.profile.avoid = strings(state.profile.avoid)
  state.criteria.includeKeywords = strings(state.criteria.includeKeywords)
  state.criteria.excludeKeywords = strings(state.criteria.excludeKeywords)
  state.criteria.requiredSkills = strings(state.criteria.requiredSkills)
  state.criteria.countriesAllow = strings(state.criteria.countriesAllow)
  state.criteria.countriesDeny = strings(state.criteria.countriesDeny)
  state.criteria.experienceLevels = strings(state.criteria.experienceLevels).filter(
    (level): level is Criteria['experienceLevels'][number] =>
      level === 'entry' || level === 'intermediate' || level === 'expert',
  )
  return state
}

function isTemplate(value: unknown): value is Template {
  return isRecord(value) && typeof value.id === 'string' && typeof value.body === 'string'
}

function isSource(value: unknown): value is SourceConfig {
  return isRecord(value) && typeof value.id === 'string' && typeof value.url === 'string'
}

function isApplication(value: unknown): value is Application {
  return isRecord(value) && typeof value.id === 'string' && typeof value.jobId === 'string'
}

function isJob(value: unknown): value is Job {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string' && isRecord(value.budget)
}

export interface StateStore {
  read(): AppState
  write(state: AppState): void
}

export class StorageFullError extends Error {
  constructor() {
    super('This device is out of storage for saved jobs.')
    this.name = 'StorageFullError'
  }
}

export function createLocalStore(key = STORAGE_KEY): StateStore {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key)
        return mergeState(raw ? JSON.parse(raw) : undefined)
      } catch {
        return defaultState()
      }
    },
    write(state) {
      const trimmed: AppState = {
        ...state,
        jobs: state.jobs.slice(0, MAX_JOBS),
        applications: state.applications.slice(0, MAX_APPLICATIONS),
      }
      try {
        localStorage.setItem(key, JSON.stringify(trimmed))
      } catch {
        // Out of room: the cached jobs are the expendable part, so drop them
        // and keep the profile, letters and history.
        try {
          localStorage.setItem(key, JSON.stringify({ ...trimmed, jobs: [] }))
        } catch {
          throw new StorageFullError()
        }
      }
    },
  }
}

/**
 * The whole state as a file, so a phone and a laptop can be kept in step
 * without an account existing anywhere.
 *
 * Tokens are left out by default — they're keys to your bridge, and an export
 * gets pasted into chat windows and note apps. `includeTokens` is for the case
 * that matters in practice: moving to your own second device, where leaving
 * them out means setting the bridge up twice.
 */
export function exportState(state: AppState, { includeTokens = false }: { includeTokens?: boolean } = {}): string {
  return JSON.stringify(
    {
      ...state,
      sources: state.sources.map(({ token, ...rest }) => (includeTokens ? { ...rest, token } : rest)),
      autoApply: { ...state.autoApply, submitToken: includeTokens ? state.autoApply.submitToken : undefined },
      jobs: [],
    },
    null,
    2,
  )
}

export function importState(json: string): AppState {
  return mergeState(JSON.parse(json))
}
