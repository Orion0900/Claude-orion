import { ALL_ITEMS, item, type ItemId, type Pocket } from '../data/items'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { CH, wrap } from '../ui/font'
import { menuBackdrop, scrollTop } from '../ui/widgets'

const POCKETS: { id: Pocket; label: string }[] = [
  { id: 'items', label: 'ITEMS' },
  { id: 'orbs', label: 'ORBS' },
  { id: 'key', label: 'KEY ITEMS' },
]

const ROWS = 6

export type BagMode = 'field' | 'battle' | 'sell'

/**
 * The bag: three pockets, a scrolling list with counts, and the item's
 * picture and description. Returns the item picked, or null.
 */
export class BagScene extends Modal<ItemId | null> {
  readonly opaque = true
  private pocket = 0
  private index = [0, 0, 0]
  private top = [0, 0, 0]
  private t = 0

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    private readonly mode: BagMode,
    startPocket = 0,
  ) {
    super()
    this.pocket = startPocket
  }

  private items(p = this.pocket): ItemId[] {
    const pocket = POCKETS[p].id
    return ALL_ITEMS.filter((i) => i.pocket === pocket && (this.save.bag[i.id] ?? 0) > 0)
      .filter((i) => this.mode !== 'battle' || i.battle)
      .filter((i) => this.mode !== 'sell' || i.price > 0)
      .map((i) => i.id)
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top) return
    const audio = this.game.audio
    const list = this.items()
    const count = list.length + 1
    const p = this.pocket
    if (pad.pressed('left')) {
      this.pocket = (p + POCKETS.length - 1) % POCKETS.length
      audio.sfx('cursor')
    } else if (pad.pressed('right')) {
      this.pocket = (p + 1) % POCKETS.length
      audio.sfx('cursor')
    } else if (pad.repeat('up')) {
      this.index[p] = (this.index[p] + count - 1) % count
      audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index[p] = (this.index[p] + 1) % count
      audio.sfx('cursor')
    } else if (pad.pressed('b')) {
      audio.sfx('cancel')
      this.finish(null)
    } else if (pad.pressed('a')) {
      const i = Math.min(this.index[p], list.length)
      if (i === list.length) {
        audio.sfx('cancel')
        this.finish(null)
      } else {
        audio.sfx('select')
        this.finish(list[i])
      }
    }
    this.index[this.pocket] = Math.min(this.index[this.pocket], this.items().length)
    this.top[this.pocket] = scrollTop(this.index[this.pocket], this.top[this.pocket], ROWS, this.items().length + 1)
  }

  draw(g: Gfx): void {
    menuBackdrop(g, '#c88848', '#d09050', this.t)
    // Pocket tabs.
    g.window(0, 0, 96, 24)
    const label = POCKETS[this.pocket].label
    g.text(`< ${label} >`, 6, 7)
    POCKETS.forEach((_, i) => g.rect(70 + i * 7, 18, 5, 2, i === this.pocket ? '#e04040' : '#a0a0a0'))
    // The satchel picture area.
    g.window(0, 26, 96, 70)
    const list = this.items()
    const i = Math.min(this.index[this.pocket], list.length)
    const current = i < list.length ? list[i] : null
    if (current) {
      const icon = Art.item(current)
      g.image(icon, 48 - icon.w / 2, 60 - icon.h / 2)
    } else g.text('CLOSE', 32, 56, { color: '#909090' })
    // The list.
    g.window(98, 0, 142, 112)
    const top = this.top[this.pocket]
    const rows = [...list.map((id) => ({ id, label: item(id).name })), { id: null as ItemId | null, label: 'CLOSE BAG' }]
    rows.slice(top, top + ROWS).forEach((row, k) => {
      const y = 8 + k * 16
      g.text(row.label, 116, y)
      if (row.id && item(row.id).pocket !== 'key') {
        const n = this.save.bag[row.id] ?? 0
        g.textRight(`${CH.times}${n}`, 230, y)
      }
    })
    g.cursor(106, 8 + (i - top) * 16)
    if (top > 0) g.text(CH.up, 224, 2, { color: '#e04040', shadow: null })
    if (top + ROWS < rows.length) g.text(CH.down, 224, 100, { color: '#e04040', shadow: null })
    // Description.
    g.window(0, 112, 240, 48)
    const desc = current ? item(current).desc : this.mode === 'battle' ? 'Close the bag and return to battle.' : 'Close the bag.'
    wrap(desc, 220)
      .slice(0, 2)
      .forEach((l, k) => g.text(l, 10, 119 + k * 16))
  }
}
