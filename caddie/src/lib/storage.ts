/** localStorage, but never throwing: private mode and full disks are facts of life. */

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function readJson<T>(key: string, fallback: T, store = defaultStore()): T {
  try {
    const raw = store?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key: string, value: unknown, store = defaultStore()): void {
  try {
    store?.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do; the app keeps working from memory.
  }
}
