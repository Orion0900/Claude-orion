import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLAUDE_MODELS, hasAi, loadAiSettings, saveAiSettings } from './settings'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => {
      data.delete(key)
    },
    setItem: (key, value) => {
      data.set(key, String(value))
    },
  }
}

/** Safari in private mode, or storage blocked outright. */
function blockedStorage(): Storage {
  const fail = () => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
  }
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail }
}

afterEach(() => vi.unstubAllGlobals())

describe('AI settings', () => {
  it('offers the three models, Opus 5.5 first as the default', () => {
    expect(CLAUDE_MODELS.map((m) => m.id)).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'])
    vi.stubGlobal('localStorage', memoryStorage())
    expect(loadAiSettings()).toEqual({ apiKey: '', model: 'claude-opus-5-5' })
  })

  it('saves under cutline.ai and loads back, trimming a pasted key', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    saveAiSettings({ apiKey: '  sk-ant-abc\n', model: 'claude-haiku-4-5' })
    expect(JSON.parse(storage.getItem('cutline.ai') ?? '')).toEqual({ apiKey: 'sk-ant-abc', model: 'claude-haiku-4-5' })
    expect(loadAiSettings()).toEqual({ apiKey: 'sk-ant-abc', model: 'claude-haiku-4-5' })
  })

  it('falls back to defaults for anything it does not recognise', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    storage.setItem('cutline.ai', JSON.stringify({ apiKey: 'sk-ant-abc', model: 'claude-opus-5-5-20260101' }))
    expect(loadAiSettings()).toEqual({ apiKey: 'sk-ant-abc', model: 'claude-opus-5-5' })
    storage.setItem('cutline.ai', JSON.stringify({ apiKey: 42 }))
    expect(loadAiSettings()).toEqual({ apiKey: '', model: 'claude-opus-5-5' })
    storage.setItem('cutline.ai', '"just a string"')
    expect(loadAiSettings()).toEqual({ apiKey: '', model: 'claude-opus-5-5' })
    storage.setItem('cutline.ai', '{broken')
    expect(loadAiSettings()).toEqual({ apiKey: '', model: 'claude-opus-5-5' })
  })

  it('copes with storage that throws, or none at all', () => {
    vi.stubGlobal('localStorage', blockedStorage())
    expect(loadAiSettings()).toEqual({ apiKey: '', model: 'claude-opus-5-5' })
    expect(() => saveAiSettings({ apiKey: 'sk-ant-abc', model: 'claude-opus-5-5' })).not.toThrow()
    vi.stubGlobal('localStorage', undefined)
    expect(loadAiSettings()).toEqual({ apiKey: '', model: 'claude-opus-5-5' })
    expect(() => saveAiSettings({ apiKey: 'sk-ant-abc', model: 'claude-opus-5-5' })).not.toThrow()
  })

  it('turns AI on only with a key', () => {
    expect(hasAi({ apiKey: '', model: 'claude-opus-5-5' })).toBe(false)
    expect(hasAi({ apiKey: '  \n', model: 'claude-opus-5-5' })).toBe(false)
    expect(hasAi({ apiKey: 'sk-ant-abc', model: 'claude-sonnet-5-5' })).toBe(true)
  })
})
