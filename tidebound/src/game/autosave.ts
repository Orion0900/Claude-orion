import type { Game } from './Game'
import { writeGame, type SaveData } from './state'

/** Ticks between saves while exploring: ten seconds. */
export const AUTOSAVE_TICKS = 600

/**
 * Saves the game by itself, so closing the app (or the phone clearing it
 * from memory) loses a few seconds at most. It only saves when the player
 * could have saved by hand: walking around with nothing else going on,
 * never in a battle, a menu, a fade or a cutscene. It saves on arriving
 * somewhere new, every ten seconds after that, and when the app is put away.
 */
export class AutoSave {
  /** The frame of the last save. */
  private last = -Infinity
  private lastMap: string | null = null

  constructor(
    private readonly game: Pick<Game, 'top' | 'frame' | 'faded' | 'save'>,
    private readonly write: (s: SaveData) => boolean = writeGame,
  ) {}

  /** The save, brought up to date, when this is a safe moment; else null. */
  private resting(): SaveData | null {
    if (!this.game.save || this.game.faded > 0) return null
    return this.game.top?.restingSave?.() ?? null
  }

  /** Every tick, after the game has updated. */
  tick(): void {
    const save = this.game.save
    if (!save) return
    if (save.map === this.lastMap && this.game.frame - this.last < AUTOSAVE_TICKS) return
    const s = this.resting()
    if (s) this.commit(s)
  }

  /** The app is going into the background: save now if it's a safe moment. */
  flush(): boolean {
    const s = this.resting()
    if (!s) return false
    this.commit(s)
    return true
  }

  private commit(s: SaveData): void {
    this.write(s)
    this.last = this.game.frame
    this.lastMap = s.map
  }
}
