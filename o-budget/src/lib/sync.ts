/**
 * Where the budget is saved, and keeping the screen and the saved copy in
 * step.
 *
 * Installed from the site, O-Budget keeps the budget on the phone in
 * localStorage. Opened as a Claude artifact, the page can also reach the
 * artifact's own database through `window.claude`, and the budget lives
 * there instead, so it's the same on every device the artifact is opened
 * on. Edits land on screen at once and are written a moment later, one
 * write at a time; a copy changed on another device shows up here unless
 * an edit made here is still on its way.
 */
import { normalizeBudget, sameBudget, type Budget } from './budget'
import { defaultStore, saveBudget, STORAGE_VERSION, type KeyValueStore } from './storage'

/** The one document the shared copy lives in. */
export const CLOUD_COLLECTION = 'budget'
export const CLOUD_DOC_ID = 'main'

export interface DocSnapshot {
  exists: boolean
  data(): Record<string, unknown> | undefined
  metadata: { hasPendingWrites: boolean }
}

/** The part of the artifact database this app uses. */
export interface CloudDoc {
  set(data: Record<string, unknown>): Promise<void>
  onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: { code?: string }) => void): () => void
}

interface Host {
  use(name: 'db'): Promise<{ doc(path: string): CloudDoc } | null>
}

const host = (): Host | null => {
  const claude = (globalThis as { claude?: Partial<Host> }).claude
  return typeof claude?.use === 'function' ? (claude as Host) : null
}

/** True when the page is running inside a Claude artifact viewer. */
export const isHosted = () => host() !== null

/** The shared budget document, or null when this view can't reach a database. */
export async function connectCloud(): Promise<CloudDoc | null> {
  try {
    const db = await host()?.use('db')
    return db ? db.doc(`${CLOUD_COLLECTION}/${CLOUD_DOC_ID}`) : null
  } catch {
    return null
  }
}

export const toCloudDoc = (budget: Budget): Record<string, unknown> => ({
  version: STORAGE_VERSION,
  ...budget,
  savedAt: new Date().toISOString(),
})

export type SyncStatus =
  /** Waiting for the artifact's database to answer. */
  | 'loading'
  /** Saved in this browser only. */
  | 'device'
  /** This browser won't keep anything (private browsing, a full disk). */
  | 'unsaved'
  /** Saved to the artifact's database. */
  | 'synced'
  | 'saving'
  /** A write didn't go through; the next edit tries again. */
  | 'offline'
  /** This viewer can look but not change the shared copy. */
  | 'readonly'

export interface SyncOptions {
  store?: KeyValueStore | null
  connect?: () => Promise<CloudDoc | null>
  /** The budget to show when nothing is saved yet. */
  fallback: () => Budget
  /** A budget to put on screen: the saved one once it loads, or another device's change. */
  onBudget: (budget: Budget) => void
  onStatus: (status: SyncStatus) => void
  /** How long edits settle before they're written. */
  delay?: number
  /** How long to wait before the one retry of a failed write. */
  retryDelay?: () => number
}

export interface Sync {
  /** Starts from `local` when there's no host; otherwise loads the shared copy. */
  start(hosted: boolean, local: Budget | null): void
  /** An edit made on screen. */
  edit(budget: Budget): void
  /** Writes any edit still waiting, now. */
  flush(): Promise<void>
  stop(): void
}

export function createSync({
  store = defaultStore(),
  connect = connectCloud,
  fallback,
  onBudget,
  onStatus,
  delay = 400,
  retryDelay = () => 1500 + Math.random() * 1500,
}: SyncOptions): Sync {
  let doc: CloudDoc | null = null
  let unsubscribe = () => {}
  let latest: Budget | null = null
  let unsaved = false
  let writing = false
  let retried = false
  let readonly = false
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const status = (s: SyncStatus) => {
    if (!stopped) onStatus(s)
  }
  const show = (budget: Budget) => {
    latest = budget
    if (!stopped) onBudget(budget)
  }
  const saveLocally = (budget: Budget) => saveBudget(budget, store)

  async function start(hosted: boolean, local: Budget | null) {
    if (!hosted) {
      latest = local ?? fallback()
      status('device')
      return
    }
    status('loading')
    const found = await connect()
    if (stopped) return
    if (!found) {
      show(local ?? fallback())
      status('device')
      return
    }
    doc = found
    let first = true
    unsubscribe = found.onSnapshot(
      (snap) => {
        // A change made here and not yet written wins over what's stored.
        if (snap.metadata.hasPendingWrites || unsaved || writing) return
        const remote = snap.exists ? normalizeBudget(snap.data()) : null
        if (remote && !sameBudget(remote, latest)) show(remote)
        else if (!remote && first) show(local ?? fallback())
        first = false
        status(readonly ? 'readonly' : 'synced')
      },
      () => status('offline'),
    )
  }

  function edit(budget: Budget) {
    latest = budget
    unsaved = true
    retried = false
    clearTimeout(timer)
    timer = setTimeout(() => void flush(), delay)
  }

  async function flush() {
    clearTimeout(timer)
    if (!unsaved || !latest) return
    const budget = latest
    const kept = saveLocally(budget)
    if (!doc || readonly) {
      unsaved = false
      status(doc ? 'readonly' : kept ? 'device' : 'unsaved')
      return
    }
    // The write in flight picks this edit up when it lands.
    if (writing) return
    writing = true
    unsaved = false
    status('saving')
    let failed = false
    try {
      await doc.set(toCloudDoc(budget))
    } catch (error) {
      failed = true
      // A viewer without write access is told so once, then edits stay on screen.
      if ((error as { code?: string })?.code === 'invalid_argument') readonly = true
      else unsaved = true
    } finally {
      writing = false
    }
    if (readonly) return status('readonly')
    if (failed) {
      status('offline')
      // One quiet retry; after that the next edit tries again.
      if (!retried) {
        retried = true
        timer = setTimeout(() => void flush(), retryDelay())
      }
      return
    }
    if (unsaved) return flush()
    status('synced')
  }

  function stop() {
    stopped = true
    clearTimeout(timer)
    unsubscribe()
  }

  return { start: (hosted, local) => void start(hosted, local), edit, flush, stop }
}
