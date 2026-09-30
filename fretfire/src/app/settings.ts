import type { InputScheme } from '../game/session'

/** Player preferences, kept on the device. */
export interface Settings {
  scheme: InputScheme
  /** Highway speed; 1 shows about 1.3 s of notes. */
  noteSpeed: number
  /** Added to every tap's time: how late this phone registers taps against the music. */
  inputOffsetMs: number
  /** Shifts the notes on screen against the music (Bluetooth headphones, slow displays). */
  videoOffsetMs: number
  lefty: boolean
  ghostPenalty: boolean
  canFail: boolean
  /** A wider hit window. */
  lenient: boolean
  musicVolume: number
  sfxVolume: number
  /** Flick the phone to deploy star power. */
  flick: boolean
  reducedEffects: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  scheme: 'tap',
  noteSpeed: 1,
  inputOffsetMs: 0,
  videoOffsetMs: 0,
  lefty: false,
  ghostPenalty: true,
  canFail: false,
  lenient: false,
  musicVolume: 1,
  sfxVolume: 0.7,
  flick: false,
  reducedEffects: false,
}

const KEY = 'fretfire.settings.v1'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const stored = JSON.parse(raw) as Partial<Settings>
    const merged = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (typeof stored[key] === typeof DEFAULT_SETTINGS[key]) (merged as Record<string, unknown>)[key] = stored[key]
    }
    return merged
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private mode or full storage: settings last for this visit only.
  }
}

/** Seconds of highway visible at a note speed and song speed. */
export function lookaheadFor(noteSpeed: number, rate = 1): number {
  return (1.3 / Math.max(0.3, noteSpeed)) * rate
}
