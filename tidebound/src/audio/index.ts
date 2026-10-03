import type { Audio, TrackId } from './api'
import { ChipAudio, type EngineOptions } from './engine'

/**
 * Tidebound's sound. `createAudio()` makes the real, WebAudio-backed
 * system: call `unlock()` from the first key press or tap, then play away.
 * Where WebAudio is missing it quietly does nothing. `silentAudio()` is a
 * no-op stand-in for tests and headless runs.
 */
export type { Audio, JingleId, MoveSoundSpec, SfxId, TrackId } from './api'
export { JINGLE_IDS, SFX_IDS, TRACK_IDS } from './ids'
export type { EngineOptions } from './engine'

export function createAudio(options?: EngineOptions): Audio {
  try {
    return new ChipAudio(options)
  } catch {
    return silentAudio()
  }
}

/** Plays nothing, but remembers the current track so game logic can be tested against it. */
export function silentAudio(): Audio {
  let current: TrackId | null = null
  return {
    unlock() {},
    playMusic(id) {
      current = id
    },
    stopMusic() {
      current = null
    },
    get currentTrack() {
      return current
    },
    playJingle() {
      return Promise.resolve()
    },
    sfx() {},
    moveSound() {},
    cry() {
      return Promise.resolve()
    },
    setVolumes() {},
    setHidden() {},
  }
}
