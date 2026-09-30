import { describe, expect, it } from 'vitest'
import { createHistoryStore, lifetimeTotals, MAX_HISTORY, weekStart, weekStreak, weekTotals, type RunRecord } from './runHistory'

function memoryStorage() {
  const data: Record<string, string> = {}
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    data,
  }
}

const run = (id: string, finishedAt: string, distance = 5000, movingSeconds = 1800): RunRecord => ({
  id,
  finishedAt,
  distance,
  movingSeconds,
  gain: 20,
  completed: true,
})

describe('createHistoryStore', () => {
  it('keeps runs newest first across reloads', () => {
    const storage = memoryStorage()
    createHistoryStore(storage).save(run('a', '2026-09-01T08:00:00Z'))
    createHistoryStore(storage).save(run('b', '2026-09-03T08:00:00Z'))
    expect(createHistoryStore(storage).read().map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('replaces a run saved twice instead of doubling it', () => {
    const store = createHistoryStore(memoryStorage())
    store.save(run('a', '2026-09-01T08:00:00Z', 4000))
    const list = store.save(run('a', '2026-09-01T08:05:00Z', 5000))
    expect(list).toHaveLength(1)
    expect(list[0].distance).toBe(5000)
  })

  it('drops the oldest past the cap', () => {
    const store = createHistoryStore(memoryStorage())
    let list: RunRecord[] = []
    for (let i = 0; i < MAX_HISTORY + 3; i++) list = store.save(run(`r${i}`, new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString()))
    expect(list).toHaveLength(MAX_HISTORY)
    expect(list.some((r) => r.id === 'r0')).toBe(false)
  })

  it('survives damaged storage and a full disk', () => {
    const storage = memoryStorage()
    storage.setItem('loopmaker.runHistory.v1', '[{"id":1},"x",null]')
    expect(createHistoryStore(storage).read()).toEqual([])
    storage.setItem('loopmaker.runHistory.v1', '{not json')
    expect(createHistoryStore(storage).read()).toEqual([])
    const full = createHistoryStore({ getItem: () => null, setItem: () => { throw new Error('quota') } })
    expect(() => full.save(run('a', '2026-09-01T08:00:00Z'))).not.toThrow()
    expect(createHistoryStore(null).read()).toEqual([])
  })
})

describe('weeks and streaks', () => {
  it('starts weeks on Monday', () => {
    // Wednesday 10 Sep 2026.
    const start = weekStart(new Date(2026, 8, 10, 15))
    expect(start.getDay()).toBe(1)
    expect(start.getDate()).toBe(7)
    // Sunday belongs to the week before it, not after.
    expect(weekStart(new Date(2026, 8, 13, 9)).getDate()).toBe(7)
  })

  it('totals this week only', () => {
    const now = new Date(2026, 8, 10, 12)
    const records = [
      run('this', new Date(2026, 8, 8, 7).toISOString(), 5000),
      run('also', new Date(2026, 8, 10, 7).toISOString(), 3000),
      run('last', new Date(2026, 8, 5, 7).toISOString(), 8000),
    ]
    expect(weekTotals(records, now)).toMatchObject({ runs: 2, distance: 8000 })
    expect(lifetimeTotals(records)).toMatchObject({ runs: 3, distance: 16000 })
  })

  it('counts consecutive weeks, and a quiet current week does not break it yet', () => {
    const now = new Date(2026, 8, 10, 12) // week of 7 Sep, nothing yet
    const records = [
      run('w-1', new Date(2026, 8, 2).toISOString()),
      run('w-2', new Date(2026, 7, 26).toISOString()),
      run('w-3', new Date(2026, 7, 19).toISOString()),
      run('w-5', new Date(2026, 7, 5).toISOString()),
    ]
    expect(weekStreak(records, now)).toBe(3)
    expect(weekStreak([run('now', new Date(2026, 8, 9).toISOString()), ...records], now)).toBe(4)
    expect(weekStreak([], now)).toBe(0)
  })
})
