import { describe, expect, it, vi } from 'vitest'
import { createMapPerspectivePreference, createPreference } from './preferences'

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v
    },
    data,
  }
}

describe('createPreference', () => {
  const allowed = ['a', 'b'] as const

  it('falls back when nothing is stored', () => {
    expect(createPreference('k', allowed, 'a', memoryStorage()).read()).toBe('a')
  })

  it('round-trips a stored choice', () => {
    const pref = createPreference('k', allowed, 'a', memoryStorage())
    pref.write('b')
    expect(pref.read()).toBe('b')
  })

  it('ignores a stored value it has no code for', () => {
    const pref = createPreference('k', allowed, 'a', memoryStorage({ k: 'something-old' }))
    expect(pref.read()).toBe('a')
  })

  it('refuses to write a value outside the allowed set', () => {
    const storage = memoryStorage()
    const pref = createPreference('k', allowed, 'a', storage)
    pref.write('zzz' as 'a')
    expect(storage.data.k).toBeUndefined()
  })

  it('survives storage that throws on read', () => {
    const pref = createPreference('k', allowed, 'a', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => undefined,
    })
    expect(pref.read()).toBe('a')
  })

  it('survives storage that throws on write, without complaining', () => {
    const pref = createPreference('k', allowed, 'a', {
      getItem: () => null,
      setItem: () => {
        throw new Error('full')
      },
    })
    expect(() => pref.write('b')).not.toThrow()
  })

  it('works with no storage at all', () => {
    const pref = createPreference('k', allowed, 'a', null)
    pref.write('b')
    expect(pref.read()).toBe('a')
  })
})

describe('createMapPerspectivePreference', () => {
  it('starts on the tilted view', () => {
    expect(createMapPerspectivePreference(memoryStorage()).read()).toBe('3d')
  })

  it('remembers a switch to flat', () => {
    const storage = memoryStorage()
    createMapPerspectivePreference(storage).write('2d')
    expect(createMapPerspectivePreference(storage).read()).toBe('2d')
  })

  it('ignores a nonsense stored perspective', () => {
    const storage = memoryStorage({ 'loopmaker.mapPerspective.v1': 'isometric' })
    expect(createMapPerspectivePreference(storage).read()).toBe('3d')
  })

  it('does not crash where storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => createMapPerspectivePreference().read()).not.toThrow()
    vi.unstubAllGlobals()
  })
})
