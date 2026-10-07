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
  { id: 'berries', label: 'BERRIES' },
  { id: 'key', label: 'KEY ITEMS' },
]

const ROWS = 6

/** 'give' lists only what a beast can hold. */
export type BagMode = 'field' | 'battle' | 'sell' | 'give'

/**
 * The bag: four pockets, a scrolling list with counts, and the item's
 * picture and description. Returns the item picked, or null.
 */
export class BagScene extends Modal<ItemId | null> {
  /** The pocket the bag last showed, so it reopens there. */
  private static lastPocket = 0
  readonly opaque = true
  private pocket = 0
  private index = POCKETS.map(() => 0)
  private top = POCKETS.map(() => 0)
  private t = 0

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    private readonly mode: BagMode,
    startPocket = BagScene.lastPocket,
  ) {
    super()
    this.pocket = startPocket
    // Never open on an empty pocket when another has something to use.
    if (this.items().length === 0) {
      const full = POCKETS.findIndex((_, i) => this.items(i).length > 0)
      if (full >= 0) this.pocket = full
    }
    BagScene.lastPocket = this.pocket
  }

  private turn(by: number): void {
    this.pocket = (this.pocket + POCKETS.length + by) % POCKETS.length
    BagScene.lastPocket = this.pocket
    this.game.audio.sfx('cursor')
  }

  private items(p = this.pocket): ItemId[] {
    const pocket = POCKETS[p].id
    return ALL_ITEMS.filter((i) => i.pocket === pocket && (this.save.bag[i.id] ?? 0) > 0)
      .filter((i) => this.mode !== 'battle' || i.battle)
      .filter((i) => this.mode !== 'sell' || i.price > 0)
      .filter((i) => this.mode !== 'give' || !!i.hold)
      .map((i) => i.id)
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top) return
    const audio = this.game.audio
    const list = this.items()
    const count = list.length + 1
    const p = this.pocket
    if (pad.pressed('left')) this.turn(-1)
    else if (pad.pressed('right')) this.turn(1)
    else if (pad.repeat('up')) {
      this.index[p] = (this.index[p] + count - 1) % count
      audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index[p] = (this.index[p] + 1) % count
      audio.sfx('cursor')
    } else if (pad.pressed('b')) {
      audio.sfx('cancel')
      this.finish(null)
    } else if (pad.pressed('a')) this.activate()
    this.settle()
  }

  /** Keeps the cursor on the list and the list scrolled to it. */
  private settle(): void {
    this.index[this.pocket] = Math.min(this.index[this.pocket], this.items().length)
    this.top[this.pocket] = scrollTop(this.index[this.pocket], this.top[this.pocket], ROWS, this.items().length + 1)
  }

  private activate(): void {
    const list = this.items()
    const i = Math.min(this.index[this.pocket], list.length)
    if (i === list.length) {
      this.game.audio.sfx('cancel')
      this.finish(null)
    } else {
      this.game.audio.sfx('select')
      this.finish(list[i])
    }
  }

  /**
   * Tapping the pocket name's left or right half turns the pocket. Tapping an
   * item highlights it so its description shows; tapping it again picks it.
   * CLOSE BAG closes at once. The D-pad scrolls longer lists.
   */
  tap(x: number, y: number): boolean {
    if (this.done) return true
    const audio = this.game.audio
    if (x < 96 && y < 24) {
      this.turn(x < 48 ? -1 : 1)
      this.settle()
      return true
    }
    if (x < 98 || y >= 112) return true
    const k = Math.floor((y - 4) / 16)
    const count = this.items().length + 1
    const i = this.top[this.pocket] + k
    if (k < 0 || k >= ROWS || i >= count) return true
    if (i === this.index[this.pocket] || i === count - 1) {
      this.index[this.pocket] = i
      this.activate()
    } else {
      this.index[this.pocket] = i
      audio.sfx('cursor')
    }
    this.settle()
    return true
  }

  draw(g: Gfx): void {
    menuBackdrop(g, '#c88848', '#d09050', this.t)
    // Pocket tabs.
    g.window(0, 0, 96, 24)
    const label = POCKETS[this.pocket].label
    g.text(`< ${label} >`, 6, 7)
    POCKETS.forEach((_, i) => g.rect(64 + i * 7, 18, 5, 2, i === this.pocket ? '#e04040' : '#a0a0a0'))
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
