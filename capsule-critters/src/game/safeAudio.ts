import type { Audio } from '../audio/api'

/**
 * Wraps the sound system so the game never waits on it forever: a jingle or
 * a cry that can't play (audio blocked, muted, a suspended context) still
 * lets the story move on after a moment.
 */
export function safeAudio(inner: Audio): Audio {
  const capped = (p: Promise<void>, ms: number): Promise<void> =>
    Promise.race([p.catch(() => undefined), new Promise<void>((r) => setTimeout(r, ms))])
  return {
    unlock: () => inner.unlock(),
    playMusic: (id) => inner.playMusic(id),
    stopMusic: (s) => inner.stopMusic(s),
    get currentTrack() {
      return inner.currentTrack
    },
    playJingle: (id) => capped(safely(() => inner.playJingle(id)), 6000),
    sfx: (id) => {
      try {
        inner.sfx(id)
      } catch {
        // A missing sound is never worth a crash.
      }
    },
    moveSound: (spec) => {
      try {
        inner.moveSound(spec)
      } catch {
        // As above.
      }
    },
    cry: (species, faint) => capped(safely(() => inner.cry(species, faint)), 2500),
    setVolumes: (m, s) => inner.setVolumes(m, s),
    setHidden: (hidden) => {
      try {
        inner.setHidden(hidden)
      } catch {
        // Backgrounding must never throw.
      }
    },
  }
}

function safely(f: () => Promise<void>): Promise<void> {
  try {
    return f()
  } catch {
    return Promise.resolve()
  }
}
