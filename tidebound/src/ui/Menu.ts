import { measure } from './font'
import { BOX_Y, drawBoxText } from './Dialog'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { Modal } from '../game/scene'

export interface ChoiceOptions {
  /** Top-left; defaults to the right edge, just above the text box. */
  x?: number
  y?: number
  /** Minimum inner width. */
  width?: number
  /** Value returned on B; null makes B do nothing. Defaults to the last option. */
  cancel?: number | null
  /** Text kept in the dialog box while choosing. */
  prompt?: string
  start?: number
  /** Called when the cursor moves or a choice is made, for sounds. */
  sound?: (kind: 'cursor' | 'select' | 'cancel') => void
}

export const ROW_H = 16

/** A framed vertical list with the ▶ cursor, the game's basic menu. */
export class ChoiceMenu extends Modal<number> {
  readonly opaque = false
  private index: number
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number

  constructor(
    private readonly items: readonly string[],
    private readonly o: ChoiceOptions = {},
  ) {
    super()
    this.index = Math.max(0, Math.min(items.length - 1, o.start ?? 0))
    const inner = Math.max(o.width ?? 0, ...items.map((i) => measure(i)))
    this.w = inner + 26
    this.h = items.length * ROW_H + 12
    this.x = o.x ?? 240 - this.w
    this.y = o.y ?? (o.prompt !== undefined ? BOX_Y : 160) - this.h
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    if (pad.repeat('up')) {
      this.index = (this.index + this.items.length - 1) % this.items.length
      this.o.sound?.('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % this.items.length
      this.o.sound?.('cursor')
    } else if (pad.pressed('a')) {
      this.o.sound?.('select')
      this.finish(this.index)
    } else if (pad.pressed('b')) {
      const c = this.o.cancel === undefined ? this.items.length - 1 : this.o.cancel
      if (c !== null) {
        this.o.sound?.('cancel')
        this.finish(c)
      }
    }
  }

  /** Tapping an option chooses it; taps elsewhere are ignored so nothing is picked by accident. */
  tap(x: number, y: number): boolean {
    const row = Math.floor((y - this.y - 3) / ROW_H)
    if (x >= this.x && x < this.x + this.w && row >= 0 && row < this.items.length) {
      this.index = row
      this.o.sound?.('select')
      this.finish(row)
    }
    return true
  }

  draw(g: Gfx): void {
    if (this.o.prompt !== undefined) drawBoxText(g, this.o.prompt)
    g.window(this.x, this.y, this.w, this.h)
    this.items.forEach((item, i) => {
      g.text(item, this.x + 17, this.y + 7 + i * ROW_H)
    })
    g.cursor(this.x + 8, this.y + 7 + this.index * ROW_H)
  }
}
