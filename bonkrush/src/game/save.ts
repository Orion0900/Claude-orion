import type { MetaSave, Settings } from './types'

const KEY = 'bonkrush.save.v1'

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.5,
  sfx: 0.8,
  sensitivity: 1,
  invertY: false,
  quality: 'medium',
  showDamageNumbers: true,
  screenShake: true,
}

export function defaultSave(): MetaSave {
  return {
    silver: 0,
    unlockedCharacters: [],
    bestTime: 0,
    bestKills: 0,
    bestStage: 0,
    runs: 0,
    settings: { ...DEFAULT_SETTINGS },
  }
}

/**
 * Reads the save, filling anything missing from defaults so an old or
 * hand-edited save never crashes the game. Storage can be missing (private
 * mode) or throw; the game then plays with a fresh save each time.
 */
export function loadSave(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): MetaSave {
  const fresh = defaultSave()
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return fresh
    const data = JSON.parse(raw) as Partial<MetaSave>
    return {
      silver: num(data.silver, 0),
      unlockedCharacters: Array.isArray(data.unlockedCharacters)
        ? data.unlockedCharacters.filter((c): c is string => typeof c === 'string')
        : [],
      bestTime: num(data.bestTime, 0),
      bestKills: num(data.bestKills, 0),
      bestStage: num(data.bestStage, 0),
      runs: num(data.runs, 0),
      settings: { ...DEFAULT_SETTINGS, ...(typeof data.settings === 'object' ? data.settings : {}) },
    }
  } catch {
    return fresh
  }
}

export function writeSave(save: MetaSave, storage: Pick<Storage, 'setItem'> | undefined = safeStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(save))
  } catch {
    // Full or blocked storage: progress lives for this session only.
  }
}

/**
 * Silver paid out at the end of a run: a little for time and kills, more for
 * stages cleared and bosses beaten, so pushing further is always worth it.
 */
export function silverForRun(r: { totalTime: number; kills: number; stageIndex: number; bossesKilled: number; silverGain: number; silver: number }): number {
  const base = r.totalTime / 60 + r.kills / 150 + r.stageIndex * 8 + r.bossesKilled * 10
  return Math.max(0, Math.floor(base * r.silverGain) + Math.floor(r.silver))
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
