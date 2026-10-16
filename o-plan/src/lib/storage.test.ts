import { orionPlan, samePlan } from './plan'
import { loadPlan, savePlan, STORAGE_KEY, STORAGE_VERSION, type KeyValueStore } from './storage'

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('storage', () => {
  it('saves and loads a plan', () => {
    const store = memory()
    const p = orionPlan()
    expect(savePlan(p, store)).toBe(true)
    expect(JSON.parse(store.data.get(STORAGE_KEY)!).version).toBe(STORAGE_VERSION)
    expect(samePlan(loadPlan(store), p)).toBe(true)
  })

  it('has nothing to load at first', () => {
    expect(loadPlan(memory())).toBeNull()
  })

  it('shrugs off broken saves and stores that throw', () => {
    const store = memory()
    store.data.set(STORAGE_KEY, '{not json')
    expect(loadPlan(store)).toBeNull()
    const full: KeyValueStore = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadPlan(full)).toBeNull()
    expect(savePlan(orionPlan(), full)).toBe(false)
    expect(savePlan(orionPlan(), null)).toBe(false)
  })
})
