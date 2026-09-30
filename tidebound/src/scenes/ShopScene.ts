import { item, type ItemId } from '../data/items'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { addItem, type SaveData } from '../game/state'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { CH, wrap } from '../ui/font'
import { scrollTop } from '../ui/widgets'

const ROWS = 6

/**
 * Buying from a Market: the stock with prices on the right, your money top
 * left, the item's picture and description below, and a quantity picker.
 */
export class ShopScene extends Modal<void> {
  readonly opaque = false
  private index = 0
  private top = 0
  private qty: number | null = null
  private busy = false

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    private readonly stock: readonly ItemId[],
  ) {
    super()
  }

  update(pad: Pad, top: boolean): void {
    if (!top || this.busy) return
    const audio = this.game.audio
    const count = this.stock.length + 1
    if (this.qty !== null) {
      const id = this.stock[this.index]
      const price = item(id).price
      const most = Math.max(1, Math.min(99, Math.floor(this.save.money / price)))
      if (pad.repeat('up')) this.qty = this.qty >= most ? 1 : this.qty + 1
      else if (pad.repeat('down')) this.qty = this.qty <= 1 ? most : this.qty - 1
      else if (pad.repeat('right')) this.qty = Math.min(most, this.qty + 10)
      else if (pad.repeat('left')) this.qty = Math.max(1, this.qty - 10)
      else if (pad.pressed('b')) {
        audio.sfx('cancel')
        this.qty = null
      } else if (pad.pressed('a')) void this.buy(id, this.qty)
      if (pad.repeat('up') || pad.repeat('down') || pad.repeat('left') || pad.repeat('right')) audio.sfx('cursor')
      return
    }
    if (pad.repeat('up')) {
      this.index = (this.index + count - 1) % count
      audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % count
      audio.sfx('cursor')
    } else if (pad.pressed('b')) {
      audio.sfx('cancel')
      this.finish()
    } else if (pad.pressed('a')) {
      if (this.index === this.stock.length) {
        audio.sfx('cancel')
        this.finish()
        return
      }
      const price = item(this.stock[this.index]).price
      if (this.save.money < price) {
        audio.sfx('error')
        void this.message("You don't have enough money.")
        return
      }
      audio.sfx('select')
      this.qty = 1
    }
    this.top = scrollTop(this.index, this.top, ROWS, count)
  }

  private async message(text: string): Promise<void> {
    this.busy = true
    await this.game.say(text)
    this.busy = false
  }

  private async buy(id: ItemId, qty: number): Promise<void> {
    this.busy = true
    const data = item(id)
    const cost = data.price * qty
    const ok = await this.game.ask(`${data.name}, and you want ${qty}? That will be ${CH.shell}${cost}. OK?`)
    if (ok) {
      this.save.money -= cost
      addItem(this.save, id, qty)
      this.game.audio.sfx('buy')
      await this.game.say('Here you are! Thank you!')
      if (id === 'orb' && qty >= 10) {
        addItem(this.save, 'superOrb', 1)
        await this.game.say("You bought ten ORBS, so here's a SUPER ORB on the house!")
      }
    }
    this.qty = null
    this.busy = false
  }

  draw(g: Gfx): void {
    g.window(0, 0, 100, 24)
    g.text(`${CH.shell}${this.save.money}`, 10, 7)
    g.window(100, 0, 140, 112)
    const rows = [...this.stock.map((id) => ({ id, label: item(id).name })), { id: null as ItemId | null, label: 'CANCEL' }]
    rows.slice(this.top, this.top + ROWS).forEach((r, k) => {
      const y = 8 + k * 16
      g.text(r.label, 118, y)
      if (r.id) g.textRight(`${CH.shell}${item(r.id).price}`, 230, y)
    })
    g.cursor(108, 8 + (this.index - this.top) * 16)
    const cur = this.index < this.stock.length ? this.stock[this.index] : null
    g.window(0, 112, 240, 48)
    if (cur) {
      const icon = Art.item(cur)
      g.image(icon, 8, 124)
      wrap(item(cur).desc, 196)
        .slice(0, 2)
        .forEach((l, k) => g.text(l, 38, 119 + k * 16))
    } else g.text('Quit shopping.', 10, 119)
    if (this.qty !== null && cur) {
      const own = this.save.bag[cur] ?? 0
      g.window(0, 60, 100, 50)
      g.text(`IN BAG: ${own}`, 8, 66, { color: '#788088' })
      g.text(`${CH.times}${String(this.qty).padStart(2, '0')}`, 8, 84)
      g.textRight(`${CH.shell}${item(cur).price * this.qty}`, 92, 84)
    }
  }
}

/** Selling from the bag: pick an item, choose how many, get half its price. */
export async function sellFlow(game: Game, save: SaveData, pick: () => Promise<ItemId | null>): Promise<void> {
  for (;;) {
    const id = await pick()
    if (!id) return
    const data = item(id)
    if (data.price <= 0) {
      await game.say(`${data.name}? I'm afraid I can't buy that.`)
      continue
    }
    const each = Math.floor(data.price / 2)
    const have = save.bag[id] ?? 0
    const opts = [1, 5, 10, have].filter((n, i, a) => n <= have && a.indexOf(n) === i)
    const qi = await game.choose(
      opts.map((n) => (n === have ? `ALL (${n})` : `${CH.times}${n}`)),
      { prompt: `How many ${data.name} will you sell?`, cancel: null },
    )
    const n = opts[qi]
    if (await game.ask(`I can pay ${CH.shell}${each * n}. Is that OK?`)) {
      save.bag[id] = have - n
      if (save.bag[id]! <= 0) delete save.bag[id]
      save.money += each * n
      game.audio.sfx('buy')
      await game.say(`Turned over the ${data.name} and received ${CH.shell}${each * n}.`)
    }
  }
}
