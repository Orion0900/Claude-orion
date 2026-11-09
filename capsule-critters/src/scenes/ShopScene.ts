import { item as itemData, type ItemId } from '../data/items'
import { move as moveData } from '../data/moves'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { addItem, removeItem, type SaveData } from '../game/state'
import { CH, padStart, wrap } from '../ui/font'
import { BOX_Y } from '../ui/Dialog'
import { ListState, scrollArrows } from '../ui/widgets'
import { BagScene } from './BagScene'

const ROWS = 5

/** Asks how many, from 1 up to `max`, showing the total price. */
class QuantityScene extends Modal<number | null> {
  readonly opaque = false
  private n = 1

  constructor(
    private readonly game: Game,
    private readonly max: number,
    private readonly price: number,
  ) {
    super()
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    const step = (d: number) => {
      this.n = ((this.n - 1 + d + this.max * 10) % this.max) + 1
      this.game.audio.sfx('cursor')
    }
    if (pad.repeat('up')) step(1)
    else if (pad.repeat('down')) step(-1)
    else if (pad.repeat('right')) step(10)
    else if (pad.repeat('left')) step(-10)
    else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      this.finish(this.n)
    } else if (pad.pressed('b')) {
      this.game.audio.sfx('cancel')
      this.finish(null)
    }
  }

  tap(x: number, y: number): boolean {
    if (y < 72) this.n = Math.min(this.max, this.n + 1)
    else if (y < 88) this.n = Math.max(1, this.n - 1)
    else this.finish(this.n)
    void x
    return true
  }

  draw(g: Gfx): void {
    g.window(64, 64, 96, 32)
    g.text(`${CH.times}${padStart(this.n, 2, '0')}`, 72, 76)
    g.textRight(`¤${this.n * this.price}`, 152, 76)
  }
}

/** A SHOP counter: BUY from the stock, SELL from the bag. */
export class ShopScene extends Modal<void> {
  readonly opaque = false
  private readonly list: ListState
  private busy = false
  private buying = false

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    private readonly stock: readonly ItemId[],
  ) {
    super()
    this.list = new ListState(stock.length + 1, { rows: ROWS, sound: (k) => game.audio.sfx(k) })
  }

  enter(): void {
    void this.menu()
  }

  private async menu(): Promise<void> {
    this.busy = true
    await this.game.say('Welcome! What can I get for you?', { hold: true })
    for (;;) {
      const k = await this.game.choose(['BUY', 'SELL', 'QUIT'], { x: 0, y: 0, prompt: 'Welcome! What can I get for you?' })
      if (k === 0) {
        this.buying = true
        this.busy = false
        await new Promise<void>((r) => (this.doneBuying = r))
        this.buying = false
        this.busy = true
      } else if (k === 1) await this.sell()
      else break
    }
    await this.game.say('Thank you! Come again!')
    this.finish()
  }

  private doneBuying: (() => void) | null = null

  private async sell(): Promise<void> {
    for (;;) {
      const id = await this.game.run(new BagScene(this.game, this.save, { mode: 'sell' }))
      if (!id) return
      const it = itemData(id)
      const price = Math.floor(it.price / 2)
      const have = this.save.bag[id] ?? 0
      const n = await this.game.run(new QuantityScene(this.game, have, price))
      if (!n) continue
      if (await this.game.ask(`I can pay ¤${price * n} for that. Is that OK?`)) {
        removeItem(this.save, id, n)
        this.save.money += price * n
        this.game.audio.sfx('buy')
      }
    }
  }

  private async buy(i: number): Promise<void> {
    if (i >= this.stock.length) {
      this.doneBuying?.()
      return
    }
    this.busy = true
    try {
      const id = this.stock[i]
      const it = itemData(id)
      const max = Math.max(1, Math.min(99 - (this.save.bag[id] ?? 0), Math.floor(this.save.money / it.price)))
      if (this.save.money < it.price) {
        await this.game.say("You don't have enough money.")
        return
      }
      const n = it.pocket === 'discs' ? 1 : await this.game.run(new QuantityScene(this.game, max, it.price))
      if (!n) return
      const total = n * it.price
      if (!(await this.game.ask(`${it.name}, ${n > 1 ? `${n} of them, ` : ''}that'll be ¤${total}. OK?`))) return
      this.save.money -= total
      addItem(this.save, id, n)
      this.game.audio.sfx('buy')
      await this.game.say('Here you are! Thank you!')
    } finally {
      this.busy = false
    }
  }

  update(pad: Pad, top: boolean): void {
    if (!top || this.busy || !this.buying) return
    const r = this.list.update(pad)
    if (r === 'b') this.doneBuying?.()
    else if (r === 'a') void this.buy(this.list.index)
  }

  tap(x: number, y: number): boolean {
    if (!this.buying || this.busy) return false
    const row = Math.floor((y - 24) / 14)
    if (y >= 20 && y < 96 && row >= 0) {
      const i = this.list.scroll + row
      if (i === this.list.index) void this.buy(i)
      else if (i < this.list.count) this.list.index = i
    } else if (y >= 96) this.doneBuying?.()
    void x
    return true
  }

  draw(g: Gfx): void {
    g.window(96, 0, 64, 18)
    g.textRight(`¤${this.save.money}`, 156, 5)
    if (!this.buying) return
    g.window(0, 18, 160, 78)
    for (const [i, row] of this.list.visible()) {
      const y = 26 + row * 14
      if (i >= this.stock.length) {
        g.text('CANCEL', 16, y)
        continue
      }
      const it = itemData(this.stock[i])
      const name = it.effect.kind === 'disc' ? moveData(it.effect.move).name : it.name
      g.text(name.slice(0, 13), 16, y)
      g.textRight(`¤${it.price}`, 152, y + (name.length > 10 ? 0 : 0))
    }
    g.cursor(8, 26 + (this.list.index - this.list.scroll) * 14)
    scrollArrows(g, 148, 20, 86, this.list, ROWS, this.game.frame)
    g.window(0, BOX_Y, 160, 48)
    const cur = this.stock[this.list.index]
    if (cur) {
      const it = itemData(cur)
      const desc = it.effect.kind === 'disc' ? `Teaches ${moveData(it.effect.move).name}.` : it.desc
      wrap(desc, 18)
        .slice(0, 3)
        .forEach((line, k) => g.text(line, 8, BOX_Y + 8 + k * 12))
    }
  }
}
