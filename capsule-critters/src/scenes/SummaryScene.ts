import { critterFront } from '../art/creatures'
import { calcStats, displayName, maxHp, maxPp, xpToNext } from '../battle/creature'
import { move as moveData } from '../data/moves'
import { species } from '../data/species'
import { TYPE_NAME } from '../data/types'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import { CH, padStart } from '../ui/font'
import { hpBar, hpPalette, STATUS_TAG } from '../ui/widgets'

/**
 * A critter's details over two pages: its stats, then its moves and
 * experience. LEFT / RIGHT turn pages; UP / DOWN go through the party.
 */
export class SummaryScene extends Modal<void> {
  readonly opaque = true
  private page = 0

  constructor(
    private readonly game: Game,
    save: SaveData,
    private index: number,
    private readonly list = save.party,
  ) {
    super()
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    if (pad.pressed('right') || pad.pressed('a')) {
      if (this.page === 0) {
        this.page = 1
        this.game.audio.sfx('cursor')
      } else if (pad.pressed('a')) {
        this.game.audio.sfx('cancel')
        this.finish()
      }
    } else if (pad.pressed('left')) {
      if (this.page === 1) {
        this.page = 0
        this.game.audio.sfx('cursor')
      }
    } else if (pad.pressed('up') && this.list.length > 1) {
      this.index = (this.index + this.list.length - 1) % this.list.length
      void this.game.audio.cry(this.list[this.index].species)
    } else if (pad.pressed('down') && this.list.length > 1) {
      this.index = (this.index + 1) % this.list.length
      void this.game.audio.cry(this.list[this.index].species)
    } else if (pad.pressed('b')) {
      this.game.audio.sfx('cancel')
      this.finish()
    }
  }

  tap(x: number): boolean {
    if (x >= 80 && this.page === 0) this.page = 1
    else if (x < 80 && this.page === 1) this.page = 0
    else this.finish()
    return true
  }

  enter(): void {
    void this.game.audio.cry(this.list[this.index].species)
  }

  draw(g: Gfx): void {
    const c = this.list[this.index]
    const sp = species(c.species)
    g.setPal(1, PAL[c.shiny ? sp.shinyPal : sp.pal])
    g.setPal(2, hpPalette(c.hp, maxHp(c)))
    g.clear(0, 15)
    g.sprite(critterFront(c.species), 4, 4, { slot: 1 })
    if (c.shiny) g.text(CH.star, 4, 4)
    g.text(displayName(c), 64, 4)
    g.text(`${CH.level}${c.level}`, 120, 14)
    g.text(`No.${padStart(sp.num, 3, '0')}`, 64, 14)
    hpBar(g, 80, 26, 48, c.hp, maxHp(c), 2)
    g.text('HP', 64, 23)
    g.textRight(`${padStart(c.hp, 3)}/${padStart(maxHp(c), 3)}`, 152, 32)
    g.text(`STATUS/${c.hp <= 0 ? 'FNT' : c.status ? STATUS_TAG[c.status] : 'OK'}`, 64, 44)
    g.rect(0, 62, 160, 1, 3, 15)
    if (this.page === 0) {
      const s = calcStats(c)
      const rows: [string, number][] = [
        ['ATTACK', s.atk],
        ['DEFENSE', s.def],
        ['SPEED', s.spd],
        ['SPECIAL', s.spc],
      ]
      g.window(0, 64, 80, 80)
      rows.forEach(([label, v], i) => {
        g.text(label, 8, 70 + i * 17)
        g.textRight(String(v), 72, 78 + i * 17)
      })
      g.text('TYPE1/', 84, 68)
      g.text(TYPE_NAME[sp.types[0]], 92, 77)
      if (sp.types[1]) {
        g.text('TYPE2/', 84, 88)
        g.text(TYPE_NAME[sp.types[1]], 92, 97)
      }
      g.text(`${CH.id}/${padStart(c.otId, 5, '0')}`, 84, 110)
      g.text(`OT/${c.ot}`, 84, 120)
      g.text('▶', 148, 132)
    } else {
      g.window(0, 64, 160, 80)
      c.moves.forEach((m, i) => {
        const d = moveData(m.id)
        g.text(d.name, 8, 70 + i * 18)
        g.textRight(`${CH.pp}${padStart(m.pp, 2)}/${padStart(maxPp(m), 2)}`, 152, 78 + i * 18)
      })
      for (let i = c.moves.length; i < 4; i++) g.text('-', 8, 70 + i * 18)
      g.text(`XP ${c.xp}`, 64, 52)
      if (c.level < 100) g.text(`NEXT ${xpToNext(c)}`, 64, 44 - 0)
    }
  }
}
