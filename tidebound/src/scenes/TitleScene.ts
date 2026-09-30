import { Art } from '../game/art'
import type { Game } from '../game/Game'
import type { Scene } from '../game/scene'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { hasSave } from '../game/state'

export type TitleChoice = 'continue' | 'new' | 'options'

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

  constructor(private readonly game: Game) {}

  enter(): void {
    this.game.audio.playMusic('title')
  }

  /** Resolves when the player picks something from the menu. */
  choose(): Promise<TitleChoice> {
    this.phase = 'press'
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

  draw(g: Gfx): void {
    const { logo, backdrop } = Art.title()
    g.image(backdrop, 0, 0)
    const bob = Math.round(Math.sin(this.t / 40) * 2)
    g.image(logo, Math.round((240 - logo.w) / 2), 14 + bob)
    if (this.phase === 'press') {
      if (Math.floor(this.t / 30) % 2 === 0) {
        const label = 'PRESS START'
        g.text(label, 120 - label.length * 3, 124, { color: '#f8f8f8', shadow: '#284068' })
      }
      g.text('A FAN-MADE ISLAND ADVENTURE', 42, 148, { color: '#c8e0f8', shadow: '#284068' })
      return
    }
    const w = 96
    const h = this.items.length * 16 + 12
    const x = 120 - w / 2
    const y = 104 - Math.max(0, this.items.length - 2) * 8
    g.window(x, y, w, h)
    this.items.forEach((it, i) => g.text(it.label, x + 22, y + 7 + i * 16))
    g.cursor(x + 12, y + 7 + this.index * 16)
    void h
  }
}
