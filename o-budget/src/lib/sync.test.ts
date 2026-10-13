import { emptyBudget, orionBudget, sameBudget, setPaycheck, type Budget } from './budget'
import { STORAGE_KEY, type KeyValueStore } from './storage'
import { createSync, type CloudDoc, type DocSnapshot, type SyncStatus } from './sync'

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

/** A stand-in for the artifact database's one document. */
function fakeDoc(initial?: Record<string, unknown>) {
  let body = initial
  let listener: ((snap: DocSnapshot) => void) | null = null
  const writes: Record<string, unknown>[] = []
  let fail: { code: string } | null = null
  let release: (() => void) | null = null
  let hold = false
  const snap = (pending = false): DocSnapshot => ({
    exists: body !== undefined,
    data: () => body,
    metadata: { hasPendingWrites: pending },
  })
  const doc: CloudDoc = {
    async set(data) {
      if (fail) throw fail
      writes.push(data)
      if (hold) await new Promise<void>((r) => (release = r))
      body = data
      listener?.(snap())
    },
    onSnapshot(next) {
      listener = next
      queueMicrotask(() => next(snap()))
      return () => (listener = null)
    },
  }
  return {
    doc,
    writes,
    /** Another device saves. */
    remote(data: Record<string, unknown>) {
      body = data
      listener?.(snap())
    },
    failWith(code: string | null) {
      fail = code ? { code } : null
    },
    holdWrites() {
      hold = true
    },
    releaseWrite() {
      hold = false
      release?.()
    },
  }
}

function harness(connect: () => Promise<CloudDoc | null>, store = memory()) {
  const shown: Budget[] = []
  const statuses: SyncStatus[] = []
  const sync = createSync({
    store,
    connect,
    fallback: emptyBudget,
    onBudget: (b) => shown.push(b),
    onStatus: (s) => statuses.push(s),
    delay: 10,
    retryDelay: () => 40,
  })
  return { sync, shown, statuses, store, last: () => statuses.at(-1) }
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms))

describe('sync on the phone', () => {
  it('starts from the budget it was given and saves edits to localStorage', async () => {
    const h = harness(async () => null)
    const b = orionBudget()
    h.sync.start(false, b)
    expect(h.last()).toBe('device')
    expect(h.shown).toEqual([])
    h.sync.edit(setPaycheck(b, 8000))
    await settle()
    expect(JSON.parse(h.store.data.get(STORAGE_KEY)!).paycheck).toBe(8000)
    expect(h.last()).toBe('device')
  })

  it('says so when this browser keeps nothing', async () => {
    const h = harness(async () => null, null as unknown as ReturnType<typeof memory>)
    h.sync.start(false, orionBudget())
    h.sync.edit(orionBudget())
    await h.sync.flush()
    expect(h.last()).toBe('unsaved')
  })

  it('writes the waiting edit at once on flush', async () => {
    const h = harness(async () => null)
    h.sync.start(false, orionBudget())
    h.sync.edit(setPaycheck(orionBudget(), 9000))
    await h.sync.flush()
    expect(JSON.parse(h.store.data.get(STORAGE_KEY)!).paycheck).toBe(9000)
  })
})

describe('sync in an artifact', () => {
  it('loads the shared copy', async () => {
    const saved = orionBudget()
    const cloud = fakeDoc({ version: 1, ...saved })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    expect(h.last()).toBe('loading')
    await settle()
    expect(h.shown).toHaveLength(1)
    expect(sameBudget(h.shown[0], saved)).toBe(true)
    expect(h.last()).toBe('synced')
  })

  it('shows the fallback, unsaved, when there is no shared copy yet', async () => {
    const cloud = fakeDoc()
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    expect(h.shown).toEqual([emptyBudget()])
    expect(cloud.writes).toHaveLength(0)
  })

  it('falls back to this browser when the database is out of reach', async () => {
    const h = harness(async () => null)
    const local = orionBudget()
    h.sync.start(true, local)
    await settle()
    expect(h.shown).toEqual([local])
    expect(h.last()).toBe('device')
  })

  it('writes edits after they settle, once, and keeps a local copy', async () => {
    const cloud = fakeDoc({ ...orionBudget() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    const base = h.shown[0]
    h.sync.edit(setPaycheck(base, 7900))
    h.sync.edit(setPaycheck(base, 8000))
    h.sync.edit(setPaycheck(base, 8100))
    await settle()
    expect(cloud.writes.map((w) => w.paycheck)).toEqual([8100])
    expect(cloud.writes[0].savedAt).toEqual(expect.any(String))
    expect(JSON.parse(h.store.data.get(STORAGE_KEY)!).paycheck).toBe(8100)
    expect(h.last()).toBe('synced')
    // Its own write coming back doesn't put anything new on screen.
    expect(h.shown).toHaveLength(1)
  })

  it('writes one at a time and sends the latest edit after the one in flight', async () => {
    const cloud = fakeDoc({ ...orionBudget() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    const base = h.shown[0]
    cloud.holdWrites()
    h.sync.edit(setPaycheck(base, 8000))
    await settle()
    expect(h.last()).toBe('saving')
    h.sync.edit(setPaycheck(base, 8500))
    await settle()
    expect(cloud.writes).toHaveLength(1)
    cloud.releaseWrite()
    await settle()
    expect(cloud.writes.map((w) => w.paycheck)).toEqual([8000, 8500])
    expect(h.last()).toBe('synced')
  })

  it("shows another device's change", async () => {
    const cloud = fakeDoc({ ...orionBudget() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    cloud.remote({ ...setPaycheck(h.shown[0], 9100) })
    expect(h.shown).toHaveLength(2)
    expect(h.shown[1].paycheck).toBe(9100)
  })

  it("keeps an edit that hasn't been written over another device's change", async () => {
    const cloud = fakeDoc({ ...orionBudget() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    h.sync.edit(setPaycheck(h.shown[0], 8000))
    cloud.remote({ ...setPaycheck(h.shown[0], 9100) })
    expect(h.shown).toHaveLength(1)
    await settle()
    expect(cloud.writes.at(-1)!.paycheck).toBe(8000)
  })

  it('turns read-only when the database refuses the write', async () => {
    const cloud = fakeDoc({ ...orionBudget() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    cloud.failWith('invalid_argument')
    h.sync.edit(setPaycheck(h.shown[0], 8000))
    await settle()
    expect(h.last()).toBe('readonly')
    cloud.failWith(null)
    h.sync.edit(setPaycheck(h.shown[0], 8100))
    await settle()
    expect(cloud.writes).toHaveLength(0)
    expect(h.last()).toBe('readonly')
  })

  it('retries a failed write once, then waits for the next edit', async () => {
    const cloud = fakeDoc({ ...orionBudget() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    cloud.failWith('unavailable')
    h.sync.edit(setPaycheck(h.shown[0], 8000))
    await settle()
    expect(h.last()).toBe('offline')
    cloud.failWith(null)
    await settle(80)
    expect(cloud.writes.map((w) => w.paycheck)).toEqual([8000])
    expect(h.last()).toBe('synced')
  })

  it('stops listening when stopped', async () => {
    const cloud = fakeDoc({ ...orionBudget() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    h.sync.stop()
    cloud.remote({ ...setPaycheck(h.shown[0], 9100) })
    expect(h.shown).toHaveLength(1)
  })
})
