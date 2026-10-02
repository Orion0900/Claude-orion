/**
 * The run, kept on the phone in localStorage. Nothing here throws: private
 * browsing and full disks are facts of life, and the app keeps working from
 * memory when it can't save.
 */
import { EMPTY_STATE, normalizeState, type AppState } from './challenge'

export const STORAGE_KEY = '92hard.state'

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

export function loadState(store = defaultStore()): AppState {
  try {
    const raw = store?.getItem(STORAGE_KEY)
    return (raw && normalizeState(JSON.parse(raw))) || EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

/** False when the state couldn't be written, so the app can say so. */
export function saveState(state: AppState, store = defaultStore()): boolean {
  if (!store) return false
  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ version: 2, ...state }))
    return true
  } catch {
    return false
  }
}
