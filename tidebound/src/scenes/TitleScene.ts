import { Art } from '../game/art'
import type { Game } from '../game/Game'
import type { Scene } from '../game/scene'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { hasSave } from '../game/state'
import { measure } from '../ui/font'

export type TitleChoice = 'continue' | 'new' | 'options'

export interface TitleHints {
  /** Say TAP rather than PRESS. */
  touch: boolean
  /** In iPhone Safari but not yet installed: show how to add it to the home screen. */
  install: boolean
}

/**
 * The title: the TIDEBOUND wordmark over the sea, PRESS START, then
 * CONTINUE / NEW GAME / OPTIONS.
 */
export class TitleScene implements Scene {
  readonly opaque = true
  private t = 0
  private phase: 'press' | 'menu' = 'press'
  private index = 0
  private items: { label: string; value: TitleChoice }[] = []
  private resolve: ((c: TitleChoice) => void) | null = null

  constructor(
    private readonly game: Game,
    private readonly hints: TitleHints = { touch: false, install: false },
  ) {}

  enter(): void {
    this.game.audio.playMusic('title')
  }

  /** Resolves when the player picks something from the menu (shown at once with `menu`). */
  choose(menu = false): Promise<TitleChoice> {
    this.phase = menu ? 'menu' : 'press'
    this.items = [
      ...(hasSave() ? [{ label: 'CONTINUE', value: 'continue' as const }] : []),
      { label: 'NEW GAME', value: 'new' as const },
      { label: 'OPTIONS', value: 'options' as const },
    ]
    this.index = 0
    return new Promise((r) => (this.resolve = r))
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top) return
    if (this.phase === 'press') {
      if (pad.pressed('start') || pad.pressed('a')) {
        this.game.audio.sfx('select')
        this.phase = 'menu'
      }
      return
    }
    if (pad.repeat('up')) {
      this.index = (this.index + this.items.length - 1) % this.items.length
      this.game.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % this.items.length
      this.game.audio.sfx('cursor')
    } else if (pad.pressed('b')) {
      this.phase = 'press'
      this.game.audio.sfx('cancel')
    } else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      const r = this.resolve
      this.resolve = null
      r?.(this.items[this.index].value)
    }
  }

  /** On the menu, tap an entry to choose it; otherwise a tap is a press of A. */
  tap(x: number, y: number): boolean {
    if (this.phase !== 'menu') return false
    const { x: mx, y: my, w } = this.menuBox()
    const row = Math.floor((y - my - 3) / 16)
    if (x >= mx && x < mx + w && row >= 0 && row < this.items.length) {
      this.index = row
      this.game.audio.sfx('select')
      const r = this.resolve
      this.resolve = null
      r?.(this.items[row].value)
    }
    return true
  }

  private menuBox(): { x: number; y: number; w: number; h: number } {
    const w = 96
    return { x: 120 - w / 2, y: 104 - Math.max(0, this.items.length - 2) * 8, w, h: this.items.length * 16 + 12 }
  }

  draw(g: Gfx): void {
    const { logo, backdrop } = Art.title()
    g.image(backdrop, 0, 0)
    const bob = Math.round(Math.sin(this.t / 40) * 2)
    g.image(logo, Math.round((240 - logo.w) / 2), 14 + bob)
    if (this.phase === 'press') {
      if (Math.floor(this.t / 30) % 2 === 0) {
        const label = this.hints.touch ? 'TAP TO START' : 'PRESS START'
        g.text(label, 120 - Math.floor(measure(label) / 2), 124, { color: '#f8f8f8', shadow: '#284068' })
      }
      const foot = this.hints.install ? 'To install: Share, then Add to Home Screen' : 'A FAN-MADE ISLAND ADVENTURE'
      g.text(foot, 120 - Math.floor(measure(foot) / 2), 148, { color: '#c8e0f8', shadow: '#284068' })
      return
    }
    const { x, y, w, h } = this.menuBox()
    g.window(x, y, w, h)
    this.items.forEach((it, i) => g.text(it.label, x + 22, y + 7 + i * 16))
    g.cursor(x + 12, y + 7 + this.index * 16)
  }
}
