/**
 * Small choices the app should remember between runs.
 *
 * Kept apart from saved routes because the failure modes differ: a preference
 * that cannot be stored should quietly fall back to a sensible default rather
 * than telling anyone about it, whereas a route that cannot be saved is
 * something the runner needs to know.
 */

export interface Preference<T extends string> {
  read(): T
  write(value: T): void
}

export interface PreferenceStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function browserStorage(): PreferenceStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    // Blocked entirely in some privacy modes.
    return null
  }
}

export function createPreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
  storage: PreferenceStorage | null = browserStorage(),
): Preference<T> {
  return {
    read() {
      try {
        const stored = storage?.getItem(key)
        // Anything unrecognised is treated as absent: an old or corrupted value
        // should not leave the app in a state it has no code for.
        return stored !== null && allowed.includes(stored as T) ? (stored as T) : fallback
      } catch {
        return fallback
      }
    },
    write(value) {
      if (!allowed.includes(value)) return
      try {
        storage?.setItem(key, value)
      } catch {
        // A preference is not worth interrupting anyone over.
      }
    },
  }
}

/** How the map is drawn while running. */
export type MapPerspective = '3d' | '2d'

export const MAP_PERSPECTIVES: readonly MapPerspective[] = ['3d', '2d']

export function createMapPerspectivePreference(storage?: PreferenceStorage | null) {
  return createPreference<MapPerspective>(
    'loopmaker.mapPerspective.v1',
    MAP_PERSPECTIVES,
    '3d',
    storage === undefined ? browserStorage() : storage,
  )
}
