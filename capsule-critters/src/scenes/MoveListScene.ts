import { maxPp } from '../battle/creature'
import type { Critter } from '../battle/types'
import { move as moveData, type MoveId } from '../data/moves'
import { TYPE_NAME } from '../data/types'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { CH, padStart, wrap } from '../ui/font'
import { BOX_Y } from '../ui/Dialog'

export interface MoveListOptions {
  title: string
  /** A fifth row: the move waiting to be learned (choosing it means "don't learn"). */
  extra?: MoveId
}

/** Picks one of a critter's moves (to forget, or to restore PP). Resolves with the slot, or null. */
export class MoveListScene extends Modal<number | null> {
  readonly opaque = false
  private index = 0

  constructor(
    private readonly game: Game,
    private readonly c: Critter,
    private readonly o: MoveListOptions,
  ) {
    super()
  }

  private get ids(): MoveId[] {
    const ids = this.c.moves.map((m) => m.id)
    return this.o.extra ? [...ids, this.o.extra] : ids
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    const n = this.ids.length
    if (pad.repeat('up')) {
      this.index = (this.index + n - 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      this.finish(this.index)
    } else if (pad.pressed('b')) {
      this.game.audio.sfx('cancel')
      this.finish(null)
    }
  }

  tap(x: number, y: number): boolean {
    const row = Math.floor((y - 12) / 16)
    if (row >= 0 && row < this.ids.length) this.finish(row)
    else this.finish(null)
    void x
    return true
  }

  draw(g: Gfx): void {
    const ids = this.ids
    const h = ids.length * 16 + 16
    g.window(0, 0, 160, h)
    ids.forEach((id, i) => {
      const d = moveData(id)
      const slot = this.c.moves[i]
      g.text(d.name, 16, 8 + i * 16)
      const pp = slot ? `${CH.pp}${padStart(slot.pp, 2)}/${padStart(maxPp(slot), 2)}` : `${CH.pp}${padStart(d.pp, 2)}/${padStart(d.pp, 2)}`
      g.textRight(pp, 152, 8 + i * 16)
    })
    g.cursor(8, 8 + this.index * 16)
    const d = moveData(ids[this.index])
    g.window(0, BOX_Y, 160, 48)
    g.text(`${TYPE_NAME[d.type]} ${d.power > 0 ? `POW ${d.power}` : 'STATUS'}`, 8, BOX_Y + 8)
    wrap(d.desc, 18)
      .slice(0, 2)
      .forEach((l, i) => g.text(l, 8, BOX_Y + 20 + i * 12))
    g.text(this.o.title, 8, h - 0 > 100 ? 4 : h + 2)
  }
}
