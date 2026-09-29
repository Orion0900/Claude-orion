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
      settings: cleanSettings(data.settings),
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

/** Settings from storage, each checked: a hand-edited or stale save falls back per field, never breaks a slider. */
function cleanSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Partial<Record<keyof Settings, unknown>>
  const range = (v: unknown, min: number, max: number, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
  const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  return {
    master: range(s.master, 0, 1, d.master),
    music: range(s.music, 0, 1, d.music),
    sfx: range(s.sfx, 0, 1, d.sfx),
    sensitivity: range(s.sensitivity, 0.2, 3, d.sensitivity),
    invertY: flag(s.invertY, d.invertY),
    quality: s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : d.quality,
    showDamageNumbers: flag(s.showDamageNumbers, d.showDamageNumbers),
    screenShake: flag(s.screenShake, d.screenShake),
  }
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
