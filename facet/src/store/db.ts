import type { FaceShape } from '../face/faceShape'
import type { PixelStats } from '../face/pixels'
import type { PointAdjustments } from '../face/points'
import type { ProfilePoints } from '../face/profile'
import type { FaceDetection, Sex } from '../face/types'

/**
 * Everything needed to recompute an analysis. Results are never stored: they
 * are derived from the detection and the user's corrections each time, so a
 * better formula improves old analyses too.
 */
export interface StoredAnalysis {
  id: string
  createdAt: number
  updatedAt: number
  sex: Sex
  front: {
    width: number
    height: number
    detection: FaceDetection
    pixels: PixelStats
    adjustments: PointAdjustments
    hairlineHidden: boolean
    focal35: number | null
  }
  profile?: {
    width: number
    height: number
    /** When this photo was attached: a replaced photo gets a new one. */
    attachedAt: number
    points: ProfilePoints | null
    /** How many of the points have been confirmed, in placement order. */
    confirmed: number
  }
  /** A small face crop for lists, as a data URL. */
  thumbnail: string
  summary: { harmony: number; symmetry: number; shape: FaceShape; profile: number | null }
  /** Marks the built-in demo, which isn't the user's own face. */
  demo?: boolean
}

interface StoredPhoto {
  key: string
  type: string
  bytes: ArrayBuffer
}

const DB_NAME = 'facet'
const VERSION = 1
const ANALYSES = 'analyses'
const PHOTOS = 'photos'

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ANALYSES)) db.createObjectStore(ANALYSES, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  dbPromise.catch(() => {
    dbPromise = null
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode)
        const req = fn(tx.objectStore(store))
        tx.oncomplete = () => resolve(req ? req.result : (undefined as T))
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

export const photoKey = (id: string, which: 'front' | 'profile') => `${id}:${which}`

export async function listAnalyses(): Promise<StoredAnalysis[]> {
  const all = await run<StoredAnalysis[]>(ANALYSES, 'readonly', (s) => s.getAll())
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

export const getAnalysis = (id: string) => run<StoredAnalysis | undefined>(ANALYSES, 'readonly', (s) => s.get(id))

export async function putAnalysis(a: StoredAnalysis): Promise<void> {
  await run(ANALYSES, 'readwrite', (s) => s.put(a))
}

/**
 * Photos live apart from the analyses so lists never load them. They are
 * kept as bytes rather than Blobs, which some Safari versions can't store.
 */
export async function putPhoto(key: string, blob: Blob): Promise<void> {
  const photo: StoredPhoto = { key, type: blob.type || 'image/jpeg', bytes: await blob.arrayBuffer() }
  await run(PHOTOS, 'readwrite', (s) => s.put(photo))
}

export async function getPhoto(key: string): Promise<Blob | null> {
  const p = await run<StoredPhoto | undefined>(PHOTOS, 'readonly', (s) => s.get(key))
  return p ? new Blob([p.bytes], { type: p.type }) : null
}

export async function deleteAnalysis(id: string): Promise<void> {
  await run(ANALYSES, 'readwrite', (s) => s.delete(id))
  await run(PHOTOS, 'readwrite', (s) => {
    s.delete(photoKey(id, 'front'))
    s.delete(photoKey(id, 'profile'))
  })
}

export async function clearAll(): Promise<void> {
  await run(ANALYSES, 'readwrite', (s) => s.clear())
  await run(PHOTOS, 'readwrite', (s) => s.clear())
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.()
  } catch {
    // Best effort.
  }
}

export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
