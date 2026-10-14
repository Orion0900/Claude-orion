/**
 * The budget, kept on the phone in localStorage. Nothing here throws:
 * private browsing and full disks are facts of life, and the app keeps
 * working from memory when it can't save.
 */
import { normalizeBudget, type Budget } from './budget'

export const STORAGE_KEY = 'o-budget.state'
/**
 * 5 builds the paycheck plan from the categories, with fixed and variable
 * Living on their own cards; 4 adds self investment, paid from Investing; 3 marks steps taken out before the paycheck; 2 added the paycheck and its
 * cadence; 1 kept a monthly income.
 */
export const STORAGE_VERSION = 5

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

/** The saved budget, or null when there isn't a readable one. */
export function loadBudget(store = defaultStore()): Budget | null {
  try {
    const raw = store?.getItem(STORAGE_KEY)
    return raw ? normalizeBudget(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** False when the budget couldn't be written, so the app can say so. */
export function saveBudget(budget: Budget, store = defaultStore()): boolean {
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, ...budget }))
    return true
  } catch {
    return false
  }
}
