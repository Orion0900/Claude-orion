/**
 * Projects and their videos, kept on the phone in IndexedDB.
 *
 * A file picked from the camera roll is only a temporary handle in iOS
 * Safari — it's gone after a reload — so the source video itself is copied
 * into the database at import. Project settings are small and saved often;
 * videos are big and saved once, so they live in separate stores.
 */
import type { AudioAnalysis, Project } from '../lib/types'

const DB_NAME = 'cutline'
const VERSION = 1
const PROJECTS = 'projects'
const FILES = 'files'

export type FileKind = 'source' | 'music' | 'analysis'
export const fileKey = (projectId: string, kind: FileKind) => `${projectId}:${kind}`

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (opening) return opening
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no storage for videos (IndexedDB is unavailable).'))
      return
    }
    const request = indexedDB.open(DB_NAME, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
    }
    request.onsuccess = () => {
      const db = request.result
      // Another tab upgrading the schema: let go so it can.
      db.onversionchange = () => {
        db.close()
        opening = null
      }
      // The browser closed the connection itself (iOS does this to apps left
      // in the background): open a fresh one next time.
      db.onclose = () => {
        opening = null
      }
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open storage'))
    request.onblocked = () => reject(new Error('Storage is busy in another tab. Close it and try again.'))
  })
  opening.catch(() => {
    opening = null
  })
  return opening
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('Storage error'))
    tx.onabort = () => reject(tx.error ?? new Error('Storage write was cancelled (is the phone full?)'))
  })
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Storage error'))
  })
}

/**
 * Runs one transaction, reopening the database once if the connection turns
 * out to be dead. WebKit can drop it while the app sits in the background
 * ("Connection to Indexed Database server lost"), and without this every
 * save after that would fail until a reload.
 */
async function withTransaction<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const db = await open()
    try {
      return await run(db.transaction(stores, mode))
    } catch (error) {
      if (attempt > 0 || !isConnectionError(error)) throw error
      opening = null
      try {
        db.close()
      } catch {
        // Already gone.
      }
    }
  }
}

function isConnectionError(error: unknown): boolean {
  if (!(error instanceof Error) && !(typeof DOMException !== 'undefined' && error instanceof DOMException)) return false
  const { name, message } = error as Error
  return name === 'InvalidStateError' || name === 'UnknownError' || /connection|closing|closed/i.test(message)
}

export async function listProjects(): Promise<unknown[]> {
  return withTransaction(PROJECTS, 'readonly', (tx) => result(tx.objectStore(PROJECTS).getAll()))
}

export async function getProject(id: string): Promise<unknown> {
  return withTransaction(PROJECTS, 'readonly', (tx) => result(tx.objectStore(PROJECTS).get(id)))
}

export async function saveProject(project: Project): Promise<void> {
  return withTransaction(PROJECTS, 'readwrite', (tx) => {
    tx.objectStore(PROJECTS).put(project)
    return done(tx)
  })
}

export async function deleteProject(id: string): Promise<void> {
  return withTransaction([PROJECTS, FILES], 'readwrite', (tx) => {
    tx.objectStore(PROJECTS).delete(id)
    const files = tx.objectStore(FILES)
    for (const kind of ['source', 'music', 'analysis'] as FileKind[]) files.delete(fileKey(id, kind))
    return done(tx)
  })
}

export async function putFile(projectId: string, kind: FileKind, value: Blob | StoredAnalysis): Promise<void> {
  return withTransaction(FILES, 'readwrite', (tx) => {
    tx.objectStore(FILES).put(value, fileKey(projectId, kind))
    return done(tx)
  })
}

export async function deleteFile(projectId: string, kind: FileKind): Promise<void> {
  return withTransaction(FILES, 'readwrite', (tx) => {
    tx.objectStore(FILES).delete(fileKey(projectId, kind))
    return done(tx)
  })
}

export async function getBlob(projectId: string, kind: 'source' | 'music'): Promise<Blob | null> {
  const value = await withTransaction(FILES, 'readonly', (tx) => result(tx.objectStore(FILES).get(fileKey(projectId, kind))))
  return value instanceof Blob ? value : null
}

/** How the loudness envelope is stored: a plain buffer survives every browser's structured clone. */
export interface StoredAnalysis {
  envelope: ArrayBuffer
  frameDuration: number
}

export function packAnalysis(analysis: AudioAnalysis): StoredAnalysis {
  const copy = new Float32Array(analysis.envelope)
  return { envelope: copy.buffer, frameDuration: analysis.frameDuration }
}

export function unpackAnalysis(value: unknown): AudioAnalysis | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Partial<StoredAnalysis>
  if (!(v.envelope instanceof ArrayBuffer) || typeof v.frameDuration !== 'number' || !(v.frameDuration > 0)) return null
  return { envelope: new Float32Array(v.envelope), frameDuration: v.frameDuration }
}

export async function getAnalysis(projectId: string): Promise<AudioAnalysis | null> {
  const value = await withTransaction(FILES, 'readonly', (tx) => result(tx.objectStore(FILES).get(fileKey(projectId, 'analysis'))))
  return unpackAnalysis(value)
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function persistStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.()
    if (!estimate) return null
    return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
  } catch {
    return null
  }
}

/** For tests: forget the open connection. */
export function resetConnection(): void {
  opening = null
}

/** For tests: close the connection behind the cache's back, the way iOS can. */
export async function dropConnectionForTests(): Promise<void> {
  const db = await opening
  db?.close()
}
