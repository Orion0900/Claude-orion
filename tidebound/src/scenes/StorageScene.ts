import { displayName } from '../battle/creature'
import type { Creature } from '../battle/types'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { BOX_CAPACITY, MAX_PARTY, type SaveData } from '../game/state'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { CH } from '../ui/font'
import { menuBackdrop, scrollTop } from '../ui/widgets'

const ROWS = 7

/**
 * The Haven PC: move beasts between your party and storage. Left shows the
 * party, right the box; A moves the highlighted beast across.
 */
export class StorageScene extends Modal<void> {
  readonly opaque = true
  private side: 'party' | 'box' = 'box'
  private index = 0
  private top = 0
  private t = 0
  private busy = false

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
  ) {
    super()
    if (save.box.length === 0) this.side = 'party'
  }

  private list(): Creature[] {
    return this.side === 'party' ? this.save.party : this.save.box
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top || this.busy) return
    const audio = this.game.audio
    const n = this.list().length
    if (pad.pressed('left') || pad.pressed('right')) {
      this.side = this.side === 'party' ? 'box' : 'party'
      this.index = 0
      this.top = 0
      audio.sfx('cursor')
    } else if (pad.repeat('up') && n > 0) {
      this.index = (this.index + n - 1) % n
      audio.sfx('cursor')
    } else if (pad.repeat('down') && n > 0) {
      this.index = (this.index + 1) % n
      audio.sfx('cursor')
    } else if (pad.pressed('b')) {
      audio.sfx('cancel')
      this.finish()
    } else if (pad.pressed('a') && n > 0) void this.move()
    this.top = scrollTop(this.index, this.top, ROWS, this.list().length)
  }

  private async move(): Promise<void> {
    this.busy = true
    const s = this.save
    if (this.side === 'party') {
      const c = s.party[this.index]
      const healthyLeft = s.party.filter((m, i) => m.hp > 0 && i !== this.index).length
      if (s.party.length <= 1 || healthyLeft === 0) {
        this.game.audio.sfx('error')
        await this.game.say("That's your last beast able to battle!")
      } else if (s.box.length >= BOX_CAPACITY) {
        await this.game.say('Storage is full!')
      } else if (await this.game.ask(`Store ${displayName(c)} in the PC?`)) {
        s.party.splice(this.index, 1)
        s.box.push(c)
        this.game.audio.sfx('select')
        this.index = Math.min(this.index, s.party.length - 1)
      }
    } else {
      const c = s.box[this.index]
      if (s.party.length >= MAX_PARTY) {
        this.game.audio.sfx('error')
        await this.game.say('Your party is full! Store a beast first.')
      } else if (await this.game.ask(`Take ${displayName(c)} with you?`)) {
        s.box.splice(this.index, 1)
        s.party.push(c)
        this.game.audio.sfx('select')
        this.index = Math.max(0, Math.min(this.index, s.box.length - 1))
      }
    }
    this.busy = false
  }

  draw(g: Gfx): void {
    menuBackdrop(g, '#4868a8', '#5070b0', this.t)
    g.window(0, 0, 240, 22)
    g.text('BEAST STORAGE', 8, 6)
    g.text(`BOX ${this.save.box.length}/${BOX_CAPACITY}`, 164, 6)
    this.column(g, 0, 'PARTY', this.save.party, this.side === 'party')
    this.column(g, 120, 'STORAGE', this.save.box, this.side === 'box')
    g.window(0, 138, 240, 22)
    g.text(this.side === 'party' ? 'A: STORE   </>: SWITCH SIDE' : 'A: TAKE   </>: SWITCH SIDE', 8, 144)
  }

  private column(g: Gfx, x: number, title: string, list: Creature[], active: boolean): void {
    g.window(x, 22, 120, 116)
    g.text(title, x + 10, 28, { color: active ? '#d04040' : '#788088' })
    const top = active ? this.top : 0
    list.slice(top, top + ROWS - 1).forEach((c, k) => {
      const y = 42 + k * 14
      g.imagePart(Art.icon(c.species, 0), 4, 8, 24, 16, x + 6, y - 3)
      g.text(displayName(c), x + 30, y)
      g.small(`Lv${c.level}`, x + 94, y + 3, '#586068')
    })
    if (list.length === 0) g.text('(empty)', x + 30, 44, { color: '#a0a0a0' })
    if (active && list.length) g.text(CH.cursor, x + 100 - 100 + 2, 42 + (this.index - top) * 14, { shadow: null })
  }
}
