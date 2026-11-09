import type { Game } from './Game'
import { writeGame, type SaveData } from './state'

/** Seconds between quiet saves while exploring. */
const EVERY = 20

/**
 * Saves by itself whenever the player is out exploring with nothing on
 * screen (no menu, no text, no script), and when the app is put away, so
 * closing the game never loses much.
 */
export class AutoSave {
  private last = 0
  private ticks = 0

  constructor(private readonly game: Game) {}

  private resting(): SaveData | null {
    return this.game.top?.restingSave?.() ?? null
  }

  tick(): void {
    if (++this.ticks % 60) return
    const now = this.ticks / 60
    if (now - this.last < EVERY) return
    const s = this.resting()
    if (!s) return
    this.last = now
    s.options = { ...this.game.options }
    writeGame(s)
  }

  /** Saves now if it's safe to (the app is being hidden). */
  flush(): void {
    const s = this.resting()
    if (s) {
      s.options = { ...this.game.options }
      writeGame(s)
    }
  }
}
