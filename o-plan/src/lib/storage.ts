/**
 * The plan, kept on the phone in localStorage. Nothing here throws:
 * private browsing and full disks are facts of life, and the app keeps
 * working from memory when it can't save.
 */
import { normalizePlan, type Plan } from './plan'

export const STORAGE_KEY = 'o-plan.state'
/** 1: goals with a finish line, a plan of attack, steps, a status and its history. */
export const STORAGE_VERSION = 1

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** The saved plan, or null when there isn't a readable one. */
export function loadPlan(store = defaultStore()): Plan | null {
  try {
    const raw = store?.getItem(STORAGE_KEY)
    return raw ? normalizePlan(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** False when the plan couldn't be written, so the app can say so. */
export function savePlan(plan: Plan, store = defaultStore()): boolean {
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...plan }))
    return true
  } catch {
    return false
  }
}
