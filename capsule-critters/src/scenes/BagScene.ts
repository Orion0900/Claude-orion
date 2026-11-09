import { ITEM_IDS, item as itemData, type ItemId, type Pocket } from '../data/items'
import { move as moveData } from '../data/moves'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import { CH, padStart, wrap } from '../ui/font'
import { BOX_Y } from '../ui/Dialog'
import { ListState, scrollArrows } from '../ui/widgets'

export interface BagOptions {
  /** field: browse and use; battle: only what works in battle; sell: pick something to sell. */
  mode: 'field' | 'battle' | 'sell'
  /** Field mode: called with the item picked; resolve true to close the bag. */
  onUse?: (id: ItemId) => Promise<boolean>
  /** Field mode: called to toss an item. */
  onToss?: (id: ItemId) => Promise<void>
}

const POCKETS: readonly Pocket[] = ['items', 'capsules', 'discs', 'key']
const POCKET_NAME: Record<Pocket, string> = { items: 'ITEMS', capsules: 'CAPSULES', discs: 'DISCS', key: 'KEY ITEMS' }

/** What works from the bag in battle. */
function battleUsable(id: ItemId): boolean {
  const k = itemData(id).effect.kind
  return k === 'heal' || k === 'cure' || k === 'revive' || k === 'pp' || k === 'battleStat' || k === 'capsule'
}

const ROWS = 5

/** The bag: four pockets, a list with counts, and a description of the item under the cursor. */
export class BagScene extends Modal<ItemId | null> {
  readonly opaque = true
  private pocket = 0
  private readonly lists: ListState[]
  private busy = false

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    private readonly o: BagOptions,
  ) {
    super()
    this.lists = POCKETS.map(() => new ListState(0, { rows: ROWS, sound: (k) => game.audio.sfx(k) }))
    if (o.mode === 'battle') this.pocket = 0
  }

  private pockets(): readonly Pocket[] {
    if (this.o.mode === 'battle') return ['items', 'capsules']
    if (this.o.mode === 'sell') return ['items', 'capsules', 'discs']
    return POCKETS
  }

  private items(): ItemId[] {
    const p = this.pockets()[this.pocket]
    return ITEM_IDS.filter((id) => (this.save.bag[id] ?? 0) > 0 && itemData(id).pocket === p && (this.o.mode !== 'battle' || battleUsable(id)) && (this.o.mode !== 'sell' || itemData(id).price > 0))
  }

  private list(): ListState {
    const l = this.lists[this.pocket]
    l.count = this.items().length + 1
    l.clamp()
    return l
  }

  update(pad: Pad, top: boolean): void {
    if (!top || this.busy) return
    const pockets = this.pockets()
    if (pad.pressed('left') || pad.pressed('right')) {
      this.pocket = (this.pocket + (pad.pressed('left') ? pockets.length - 1 : 1)) % pockets.length
      this.game.audio.sfx('cursor')
      return
    }
    const l = this.list()
    const r = l.update(pad)
    if (r === 'b') this.finish(null)
    else if (r === 'a') void this.pick(l.index)
  }

  tap(x: number, y: number): boolean {
    if (this.busy) return true
    if (y < 16) {
      const pockets = this.pockets()
      this.pocket = (this.pocket + (x < 80 ? pockets.length - 1 : 1)) % pockets.length
      return true
    }
    const l = this.list()
    const row = Math.floor((y - 20) / 16)
    if (y >= 16 && y < 96 && row >= 0) {
      const i = l.scroll + row
      if (i < l.count) {
        if (i === l.index) void this.pick(i)
        else l.index = i
      }
    } else if (y >= 96) this.finish(null)
    return true
  }

  private async pick(i: number): Promise<void> {
    const items = this.items()
    if (i >= items.length) {
      this.finish(null)
      return
    }
    const id = items[i]
    if (this.o.mode !== 'field') {
      this.finish(id)
      return
    }
    this.busy = true
    try {
      const it = itemData(id)
      const canToss = it.pocket !== 'key' && it.price > 0
      const opts = canToss ? ['USE', 'TOSS', 'CANCEL'] : ['USE', 'CANCEL']
      const k = await this.game.choose(opts, { y: 0 })
      if (opts[k] === 'USE' && this.o.onUse) {
        if (await this.o.onUse(id)) this.finish(null)
      } else if (opts[k] === 'TOSS' && this.o.onToss) await this.o.onToss(id)
    } finally {
      this.busy = false
    }
  }

  draw(g: Gfx): void {
    g.clear(0, 15)
    const pockets = this.pockets()
    const p = pockets[this.pocket]
    g.window(0, 0, 160, 18)
    g.text('←', 4, 5)
    g.textCenter(POCKET_NAME[p], 80, 5)
    g.text('→', 148, 5)
    g.window(0, 16, 160, 82)
    const items = this.items()
    const l = this.list()
    for (const [i, row] of l.visible()) {
      const y = 22 + row * 14
      if (i >= items.length) {
        g.text('CANCEL', 16, y)
        continue
      }
      const id = items[i]
      const it = itemData(id)
      let name = it.name
      if (it.effect.kind === 'disc') name = `${it.name.replace('FIELD DISC ', 'F')} ${moveData(it.effect.move).name}`
      g.text(name.length > 15 ? name.slice(0, 15) : name, 16, y)
      if (it.pocket !== 'key') g.textRight(`${CH.times}${padStart(this.save.bag[id] ?? 0, 2)}`, 152, y + (it.pocket === 'discs' ? 0 : 0))
    }
    g.cursor(8, 22 + (l.index - l.scroll) * 14)
    scrollArrows(g, 148, 20, 84, l, ROWS, this.game.frame)
    g.window(0, BOX_Y, 160, 48)
    const cur = items[l.index]
    if (cur) {
      const it = itemData(cur)
      const desc = it.effect.kind === 'disc' ? `Teaches ${moveData(it.effect.move).name}. ${moveData(it.effect.move).desc}` : it.desc
      wrap(desc, 18)
        .slice(0, 3)
        .forEach((line, k) => g.text(line, 8, BOX_Y + 8 + k * 12))
    } else g.text('Close the bag.', 8, BOX_Y + 8)
  }
}
