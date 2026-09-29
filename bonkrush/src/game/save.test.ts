import { DEFAULT_SETTINGS, defaultSave, loadSave, silverForRun, writeSave } from './save'

describe('silverForRun', () => {
  const base = { totalTime: 0, kills: 0, bossesKilled: 3, silverGain: 1, silver: 0 }

  it('pays more for every stage cleared', () => {
    expect(silverForRun({ ...base, stageIndex: 3 })).toBe(54)
    expect(silverForRun({ ...base, stageIndex: 2 })).toBe(46)
  })

  it('adds silver picked up during the run', () => {
    expect(silverForRun({ ...base, stageIndex: 0, bossesKilled: 0, silver: 7 })).toBe(7)
  })
})

describe('save', () => {
  it('round-trips through storage', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    const save = defaultSave()
    save.silver = 42
    save.unlockedCharacters.push('kage')
    writeSave(save, storage)
    expect(loadSave(storage)).toEqual(save)
  })

  it('cleans each setting on its own', () => {
    const raw = JSON.stringify({ settings: { master: 'loud', music: 7, sensitivity: null, quality: 'ultra', invertY: 'yes', screenShake: false } })
    const s = loadSave({ getItem: () => raw }).settings
    expect(s.master).toBe(DEFAULT_SETTINGS.master)
    expect(s.music).toBe(1)
    expect(s.sensitivity).toBe(DEFAULT_SETTINGS.sensitivity)
    expect(s.quality).toBe(DEFAULT_SETTINGS.quality)
    expect(s.invertY).toBe(false)
    expect(s.screenShake).toBe(false)
  })

  it('survives a corrupt save', () => {
    expect(loadSave({ getItem: () => '{not json' })).toEqual(defaultSave())
    expect(loadSave({ getItem: () => JSON.stringify({ silver: 'lots', settings: 3 }) }).silver).toBe(0)
  })
})
