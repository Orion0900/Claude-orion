import { describe, expect, it } from 'vitest'
import { fromBackup, backupFileName, toBackup } from './backup'
import { newAttempt, type AppState } from './challenge'
import { emptyLog } from './tasks'
import { loadState, saveState, STORAGE_KEY, type KeyValueStore } from './storage'

const state: AppState = {
  attempt: { ...newAttempt('2026-10-01'), logs: { '2026-10-01': { ...emptyLog(), hyperextensions: 9, note: 'push day' } } },
  history: [{ start: '2026-09-01', end: '2026-09-03', completed: 2, outcome: 'restarted' }],
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

describe('backups', () => {
  it('round-trips the whole run', () => {
    const text = toBackup(state, new Date('2026-10-01T20:00:00Z'))
    expect(fromBackup(text)).toEqual(state)
    expect(JSON.parse(text)).toMatchObject({ app: '92hard', version: 3, exportedAt: '2026-10-01T20:00:00.000Z' })
  })

  it('restores a backup made by the first version', () => {
    const old = JSON.stringify({
      app: '92hard',
      version: 1,
      attempt: { start: '2026-10-01', carried: 0, logs: { '2026-10-01': { sets: 15, neck: true, vlog: true, makerSchool: true } } },
      history: [],
    })
    expect(fromBackup(old).attempt!.logs['2026-10-01']).toEqual({ ...emptyLog(), lifted: true, makerSchool: true, vlog: true })
  })

  it('turns away files that are not backups', () => {
    expect(() => fromBackup('not json')).toThrow("isn't a 92 Hard backup")
    expect(() => fromBackup(JSON.stringify({ attempt: null, history: [] }))).toThrow("isn't a 92 Hard backup")
    expect(() => fromBackup(JSON.stringify({ app: '92hard' }))).toThrow("isn't a 92 Hard backup")
  })

  it('names the file by the day', () => {
    expect(backupFileName(new Date(2026, 9, 1, 21))).toBe('92-hard-backup-2026-10-01.json')
  })
})

describe('storage', () => {
  it('saves and loads the run', () => {
    const store = memoryStore()
    expect(saveState(state, store)).toBe(true)
    expect(loadState(store)).toEqual(state)
  })

  it('starts empty on nothing, or on something unreadable', () => {
    expect(loadState(memoryStore())).toEqual({ attempt: null, history: [] })
    const store = memoryStore()
    store.data.set(STORAGE_KEY, '{oops')
    expect(loadState(store)).toEqual({ attempt: null, history: [] })
    expect(loadState(null)).toEqual({ attempt: null, history: [] })
  })

  it('reports a save that failed instead of throwing', () => {
    const full: KeyValueStore = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    }
    expect(saveState(state, full)).toBe(false)
    expect(saveState(state, null)).toBe(false)
  })
})
