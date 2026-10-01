/**
 * Backups: the whole run as one JSON file. Ninety-two days is a long time to
 * trust a browser's storage, and a backup is also how a run moves to a new
 * phone.
 */
import { normalizeState, type AppState } from './challenge'
import { dateKey } from './dates'

const APP = '92hard'
const NOT_A_BACKUP = "That file isn't a 92 Hard backup."

export function backupFileName(now: Date): string {
  return `92-hard-backup-${dateKey(now)}.json`
}

export function toBackup(state: AppState, now: Date): string {
  return JSON.stringify({ app: APP, version: 1, exportedAt: now.toISOString(), ...state }, null, 2)
}

/** The state inside a backup file; throws a message fit to show when it isn't one. */
export function fromBackup(text: string): AppState {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(NOT_A_BACKUP)
  }
  const state = raw && typeof raw === 'object' && (raw as { app?: unknown }).app === APP ? normalizeState(raw) : null
  if (!state) throw new Error(NOT_A_BACKUP)
  return state
}
