import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { CH, wrap } from '../ui/font'

export type StartItem = 'dex' | 'party' | 'bag' | 'card' | 'save' | 'options' | 'exit'

const HELP: Record<StartItem, string> = {
  dex: 'Every beast you have seen and caught.',
  party: 'Check and reorder your beasts.',
  bag: 'Items, orbs and key items.',
  card: 'Your trainer card and crests.',
  save: 'Save your progress.',
  options: 'Text speed, sound and more.',
  exit: 'Close this menu.',
}

/** The START menu down the right side of the overworld. */
export class StartMenu extends Modal<StartItem | null> {
  readonly opaque = false
  private readonly items: { id: StartItem; label: string }[]
  private static last = 0
  private index: number

  constructor(
    private readonly game: Game,
    save: SaveData,
  ) {
    super()
    this.items = [
      ...(save.flags.dex ? [{ id: 'dex' as const, label: 'BEASTIARY' }] : []),
      ...(save.party.length ? [{ id: 'party' as const, label: 'BEASTS' }] : []),
      { id: 'bag', label: 'BAG' },
      { id: 'card', label: save.name },
      { id: 'save', label: 'SAVE' },
      { id: 'options', label: 'OPTIONS' },
      { id: 'exit', label: 'EXIT' },
    ]
    this.index = Math.min(StartMenu.last, this.items.length - 1)
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    const n = this.items.length
    if (pad.repeat('up')) {
      this.index = (this.index + n - 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      StartMenu.last = this.index
      const id = this.items[this.index].id
      this.finish(id === 'exit' ? null : id)
    } else if (pad.pressed('b') || pad.pressed('start')) {
      this.game.audio.sfx('cancel')
      this.finish(null)
    }
  }

  draw(g: Gfx): void {
    const w = 84
    const h = this.items.length * 16 + 10
    g.window(240 - w, 0, w, h)
    this.items.forEach((it, i) => g.text(it.label, 240 - w + 18, 6 + i * 16))
    g.text(CH.cursor, 240 - w + 8, 7 + this.index * 16)
    g.window(0, 128, 240, 32)
    wrap(HELP[this.items[this.index].id], 222)
      .slice(0, 1)
      .forEach((l) => g.text(l, 9, 139))
  }
}
