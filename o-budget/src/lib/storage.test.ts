import { orionBudget, sameBudget } from './budget'
import { loadBudget, saveBudget, STORAGE_KEY, type KeyValueStore } from './storage'

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('storage', () => {
  it('saves and loads a budget', () => {
    const store = memory()
    const b = orionBudget()
    expect(saveBudget(b, store)).toBe(true)
    expect(JSON.parse(store.data.get(STORAGE_KEY)!).version).toBe(1)
    expect(sameBudget(loadBudget(store), b)).toBe(true)
  })

  it('has nothing to load at first', () => {
    expect(loadBudget(memory())).toBeNull()
  })

  it('shrugs off broken saves and stores that throw', () => {
    const store = memory()
    store.data.set(STORAGE_KEY, '{not json')
    expect(loadBudget(store)).toBeNull()
    const full: KeyValueStore = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('quota')
      },
    }
    expect(loadBudget(full)).toBeNull()
    expect(saveBudget(orionBudget(), full)).toBe(false)
    expect(saveBudget(orionBudget(), null)).toBe(false)
  })
})
