import type { SongMeta } from '../chart/types'
import type { SongPackage } from './importer'

/**
 * Imported songs in IndexedDB: a small summary per song for the song list,
 * and the song's files (chart, audio, art) stored apart so listing songs
 * never touches the audio.
 */

/** What the song list needs, without any file contents. */
export interface StoredSong {
  id: string
  meta: SongMeta
  chartFile: string
  fileNames: string[]
  addedAt: number
}

interface SummaryRecord extends StoredSong {
  source: string
}

const DB_NAME = 'fretfire'
const DB_VERSION = 1
const SUMMARIES = 'summaries'
const FILES = 'files'
const UNAVAILABLE = 'Song storage is unavailable in this browser mode'
/** Some private modes never answer an open request at all. */
const OPEN_TIMEOUT_MS = 10_000

let connection: Promise<IDBDatabase> | undefined

/** Saves a song and its files, replacing any song with the same id. */
export async function saveSong(pkg: SongPackage): Promise<void> {
  const summary: SummaryRecord = {
    id: pkg.id,
    meta: pkg.meta,
    chartFile: pkg.chartFile,
    fileNames: Object.keys(pkg.files),
    addedAt: pkg.addedAt,
    source: pkg.source,
  }
  await transact([SUMMARIES, FILES], 'readwrite', (tx) => {
    tx.objectStore(SUMMARIES).put(summary)
    tx.objectStore(FILES).put({ ...pkg.files }, pkg.id)
    return () => undefined
  })
}

/** Every saved song's summary, oldest first. Never loads file contents. */
export async function listSongs(): Promise<StoredSong[]> {
  const records = await transact([SUMMARIES], 'readonly', (tx) => {
    const request = tx.objectStore(SUMMARIES).getAll()
    return () => request.result as SummaryRecord[]
  })
  return records
    .map(({ id, meta, chartFile, fileNames, addedAt }) => ({ id, meta, chartFile, fileNames, addedAt }))
    .sort((a, b) => a.addedAt - b.addedAt)
}

/** A saved song with its files, or undefined when there's no such song. */
export async function loadSong(id: string): Promise<SongPackage | undefined> {
  const [summary, files] = await transact([SUMMARIES, FILES], 'readonly', (tx) => {
    const summaryRequest = tx.objectStore(SUMMARIES).get(id)
    const filesRequest = tx.objectStore(FILES).get(id)
    return () => [summaryRequest.result as SummaryRecord | undefined, filesRequest.result as Record<string, Blob> | undefined]
  })
  if (!summary || !files) return undefined
  const { meta, chartFile, addedAt, source } = summary
  return { id: summary.id, meta, chartFile, files, source: source ?? '', addedAt }
}

/** Removes a song and its files. Deleting a missing song is not an error. */
export async function deleteSong(id: string): Promise<void> {
  await transact([SUMMARIES, FILES], 'readwrite', (tx) => {
    tx.objectStore(SUMMARIES).delete(id)
    tx.objectStore(FILES).delete(id)
    return () => undefined
  })
}

/** Asks the browser not to evict saved songs under storage pressure. Resolves false when it can't. */
export async function requestPersistence(): Promise<boolean> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (!storage || typeof storage.persist !== 'function') return false
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (connection) return connection
  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const fail = () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(new Error(UNAVAILABLE))
    }
    let request: IDBOpenDBRequest
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error(UNAVAILABLE)
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      fail()
      return
    }
    timer = setTimeout(fail, OPEN_TIMEOUT_MS)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(SUMMARIES)) db.createObjectStore(SUMMARIES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
    }
    request.onsuccess = () => {
      const db = request.result
      if (settled) {
        db.close()
        return
      }
      settled = true
      clearTimeout(timer)
      // Let another tab upgrade the database, and reopen next time if the browser drops us.
      db.onversionchange = () => {
        db.close()
        connection = undefined
      }
      db.onclose = () => {
        connection = undefined
      }
      resolve(db)
    }
    request.onerror = (event) => {
      event.preventDefault()
      fail()
    }
  })
  connection = opening
  opening.catch(() => {
    if (connection === opening) connection = undefined
  })
  return opening
}

/**
 * Runs one transaction. `body` queues requests and returns a function that
 * reads their results once the transaction has committed.
 */
async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => () => T,
): Promise<T> {
  let tx: IDBTransaction
  try {
    tx = (await openDatabase()).transaction(stores, mode)
  } catch (error) {
    if (error instanceof Error && error.message === UNAVAILABLE) throw error
    // The connection was closed under us (iOS does this to suspended pages): open a fresh one.
    connection = undefined
    try {
      tx = (await openDatabase()).transaction(stores, mode)
    } catch {
      throw new Error(UNAVAILABLE)
    }
  }
  return new Promise<T>((resolve, reject) => {
    let read: () => T
    try {
      read = body(tx)
    } catch (error) {
      try {
        tx.abort()
      } catch {
        // already finished
      }
      reject(storageError(error))
      return
    }
    tx.oncomplete = () => resolve(read())
    tx.onabort = () => reject(storageError(tx.error))
  })
}

function storageError(error: unknown): Error {
  const name = (error as { name?: string } | null)?.name
  if (name === 'QuotaExceededError') return new Error('Not enough storage space to save this song')
  if (error instanceof Error) return error
  const message = (error as { message?: string } | null)?.message
  return new Error(message || 'Song storage failed')
}
