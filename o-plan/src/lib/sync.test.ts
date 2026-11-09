import { editGoal, emptyPlan, orionPlan, samePlan, type Goal, type Plan } from './plan'
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

/** An edit: the first goal renamed. */
const retitle = (p: Plan, title: string) => editGoal(p, p.goals[0].id, { title })
const titleOf = (saved: Record<string, unknown>) => (saved.goals as Goal[])[0].title

function harness(connect: () => Promise<CloudDoc | null>, store = memory()) {
  const shown: Plan[] = []
  const statuses: SyncStatus[] = []
  const sync = createSync({
    store,
    connect,
    fallback: emptyPlan,
    onPlan: (p) => shown.push(p),
    onStatus: (s) => statuses.push(s),
    delay: 10,
    retryDelay: () => 40,
  })
  return { sync, shown, statuses, store, last: () => statuses.at(-1) }
}

const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms))

describe('sync on the phone', () => {
  it('starts from the plan it was given and saves edits to localStorage', async () => {
    const h = harness(async () => null)
    const p = orionPlan()
    h.sync.start(false, p)
    expect(h.last()).toBe('device')
    expect(h.shown).toEqual([])
    h.sync.edit(retitle(p, '12% bodyfat'))
    await settle()
    expect(titleOf(JSON.parse(h.store.data.get(STORAGE_KEY)!))).toBe('12% bodyfat')
    expect(h.last()).toBe('device')
  })

  it('says so when this browser keeps nothing', async () => {
    const h = harness(async () => null, null as unknown as ReturnType<typeof memory>)
    h.sync.start(false, orionPlan())
    h.sync.edit(orionPlan())
    await h.sync.flush()
    expect(h.last()).toBe('unsaved')
  })

  it('writes the waiting edit at once on flush', async () => {
    const h = harness(async () => null)
    h.sync.start(false, orionPlan())
    h.sync.edit(retitle(orionPlan(), 'Lean'))
    await h.sync.flush()
    expect(titleOf(JSON.parse(h.store.data.get(STORAGE_KEY)!))).toBe('Lean')
  })
})

describe('sync in an artifact', () => {
  it('loads the shared copy', async () => {
    const saved = orionPlan()
    const cloud = fakeDoc({ version: 1, ...saved })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    expect(h.last()).toBe('loading')
    await settle()
    expect(h.shown).toHaveLength(1)
    expect(samePlan(h.shown[0], saved)).toBe(true)
    expect(h.last()).toBe('synced')
  })

  it('shows the fallback, unsaved, when there is no shared copy yet', async () => {
    const cloud = fakeDoc()
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    expect(h.shown).toEqual([emptyPlan()])
    expect(cloud.writes).toHaveLength(0)
  })

  it('falls back to this browser when the database is out of reach', async () => {
    const h = harness(async () => null)
    const local = orionPlan()
    h.sync.start(true, local)
    await settle()
    expect(h.shown).toEqual([local])
    expect(h.last()).toBe('device')
  })

  it('writes edits after they settle, once, and keeps a local copy', async () => {
    const cloud = fakeDoc({ ...orionPlan() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    const base = h.shown[0]
    h.sync.edit(retitle(base, '1'))
    h.sync.edit(retitle(base, '10'))
    h.sync.edit(retitle(base, '10%'))
    await settle()
    expect(cloud.writes.map(titleOf)).toEqual(['10%'])
    expect(cloud.writes[0].savedAt).toEqual(expect.any(String))
    expect(titleOf(JSON.parse(h.store.data.get(STORAGE_KEY)!))).toBe('10%')
    expect(h.last()).toBe('synced')
    // Its own write coming back doesn't put anything new on screen.
    expect(h.shown).toHaveLength(1)
  })

  it('writes one at a time and sends the latest edit after the one in flight', async () => {
    const cloud = fakeDoc({ ...orionPlan() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    const base = h.shown[0]
    cloud.holdWrites()
    h.sync.edit(retitle(base, 'First'))
    await settle()
    expect(h.last()).toBe('saving')
    h.sync.edit(retitle(base, 'Second'))
    await settle()
    expect(cloud.writes).toHaveLength(1)
    cloud.releaseWrite()
    await settle()
    expect(cloud.writes.map(titleOf)).toEqual(['First', 'Second'])
    expect(h.last()).toBe('synced')
  })

  it("shows another device's change", async () => {
    const cloud = fakeDoc({ ...orionPlan() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    cloud.remote({ ...retitle(h.shown[0], 'From the laptop') })
    expect(h.shown).toHaveLength(2)
    expect(h.shown[1].goals[0].title).toBe('From the laptop')
  })

  it("keeps an edit that hasn't been written over another device's change", async () => {
    const cloud = fakeDoc({ ...orionPlan() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    h.sync.edit(retitle(h.shown[0], 'From the phone'))
    cloud.remote({ ...retitle(h.shown[0], 'From the laptop') })
    expect(h.shown).toHaveLength(1)
    await settle()
    expect(titleOf(cloud.writes.at(-1)!)).toBe('From the phone')
  })

  it('turns read-only when the database refuses the write', async () => {
    const cloud = fakeDoc({ ...orionPlan() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    cloud.failWith('invalid_argument')
    h.sync.edit(retitle(h.shown[0], 'Nope'))
    await settle()
    expect(h.last()).toBe('readonly')
    cloud.failWith(null)
    h.sync.edit(retitle(h.shown[0], 'Still no'))
    await settle()
    expect(cloud.writes).toHaveLength(0)
    expect(h.last()).toBe('readonly')
  })

  it('retries a failed write once, then waits for the next edit', async () => {
    const cloud = fakeDoc({ ...orionPlan() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    cloud.failWith('unavailable')
    h.sync.edit(retitle(h.shown[0], 'Retried'))
    await settle()
    expect(h.last()).toBe('offline')
    cloud.failWith(null)
    await settle(80)
    expect(cloud.writes.map(titleOf)).toEqual(['Retried'])
    expect(h.last()).toBe('synced')
  })

  it('stops listening when stopped', async () => {
    const cloud = fakeDoc({ ...orionPlan() })
    const h = harness(async () => cloud.doc)
    h.sync.start(true, null)
    await settle()
    h.sync.stop()
    cloud.remote({ ...retitle(h.shown[0], 'Too late') })
    expect(h.shown).toHaveLength(1)
  })
})
