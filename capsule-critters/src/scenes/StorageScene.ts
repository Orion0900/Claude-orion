import { critterIcon } from '../art/creatures'
import { displayName, restore } from '../battle/creature'
import type { Critter } from '../battle/types'
import { species } from '../data/species'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { BOX_COUNT, BOX_SIZE, type SaveData } from '../game/state'
import { CH } from '../ui/font'
import { BOX_Y } from '../ui/Dialog'
import { ListState, scrollArrows } from '../ui/widgets'
import { SummaryScene } from './SummaryScene'

const ROWS = 5

/** Picks a critter from a list (party or a box). Resolves with the index or null. */
class CritterPicker extends Modal<number | null> {
  readonly opaque = true
  private readonly list: ListState

  constructor(
    private readonly game: Game,
    private readonly title: string,
    private readonly critters: Critter[],
  ) {
    super()
    this.list = new ListState(critters.length + 1, { rows: ROWS, sound: (k) => game.audio.sfx(k) })
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    const r = this.list.update(pad)
    if (r === 'b') this.finish(null)
    else if (r === 'a') this.finish(this.list.index < this.critters.length ? this.list.index : null)
  }

  tap(x: number, y: number): boolean {
    const row = Math.floor((y - 24) / 16)
    if (y >= 20 && y < 104 && row >= 0) {
      const i = this.list.scroll + row
      if (i === this.list.index) this.finish(i < this.critters.length ? i : null)
      else if (i < this.list.count) this.list.index = i
    } else this.finish(null)
    void x
    return true
  }

  draw(g: Gfx): void {
    g.clear(0, 15)
    g.window(0, 0, 160, 18)
    g.text(this.title, 8, 5)
    g.window(0, 16, 160, 92)
    for (const [i, row] of this.list.visible()) {
      const y = 24 + row * 16
      if (i >= this.critters.length) {
        g.text('CANCEL', 28, y + 4)
        continue
      }
      const c = this.critters[i]
      const sp = species(c.species)
      g.setPal(1 + row, PAL[c.shiny ? sp.shinyPal : sp.pal])
      g.sprite(critterIcon(c.species), 12, y, { slot: 1 + row })
      g.text(displayName(c), 30, y + 4)
      g.textRight(`${CH.level}${c.level}`, 152, y + 4)
    }
    g.cursor(4, 28 + (this.list.index - this.list.scroll) * 16)
    scrollArrows(g, 148, 18, 98, this.list, ROWS, this.game.frame)
    g.window(0, BOX_Y + 12, 160, 36)
    g.text(this.critters.length ? 'Pick a critter.' : 'There are none.', 8, BOX_Y + 24)
  }
}

/** The storage PC: deposit, withdraw, release and change boxes. */
export class StorageScene extends Modal<void> {
  readonly opaque = false

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
  ) {
    super()
  }

  enter(): void {
    void this.run()
  }

  update(): void {}

  draw(): void {}

  private box(): Critter[] {
    return this.save.boxes[this.save.box]
  }

  private async run(): Promise<void> {
    this.game.audio.sfx('select')
    await this.game.say(`${this.save.name} switched on the PC.`)
    for (;;) {
      const label = `BOX ${this.save.box + 1} has ${this.box().length}/${BOX_SIZE}.`
      const k = await this.game.choose(['WITHDRAW', 'DEPOSIT', 'RELEASE', 'BOX', 'LOG OFF'], { x: 0, y: 0, prompt: label })
      if (k === 0) await this.withdraw()
      else if (k === 1) await this.deposit()
      else if (k === 2) await this.release()
      else if (k === 3) await this.changeBox()
      else break
    }
    this.finish()
  }

  private async withdraw(): Promise<void> {
    for (;;) {
      const i = await this.game.run(new CritterPicker(this.game, `WITHDRAW · BOX ${this.save.box + 1}`, this.box()))
      if (i === null) return
      const c = this.box()[i]
      const k = await this.game.choose(['WITHDRAW', 'STATS', 'CANCEL'], { prompt: `${displayName(c)}?` })
      if (k === 1) await this.game.run(new SummaryScene(this.game, this.save, i, this.box()))
      if (k !== 0) continue
      if (this.save.party.length >= 6) {
        await this.game.say("You can't carry any more critters.")
        return
      }
      this.box().splice(i, 1)
      this.save.party.push(c)
      await this.game.say(`${displayName(c)} is taken out. Got ${displayName(c)}.`)
    }
  }

  private async deposit(): Promise<void> {
    for (;;) {
      const i = await this.game.run(new CritterPicker(this.game, 'DEPOSIT', this.save.party))
      if (i === null) return
      const c = this.save.party[i]
      const k = await this.game.choose(['DEPOSIT', 'STATS', 'CANCEL'], { prompt: `${displayName(c)}?` })
      if (k === 1) await this.game.run(new SummaryScene(this.game, this.save, i))
      if (k !== 0) continue
      if (this.save.party.length <= 1) {
        await this.game.say("You can't deposit your last critter!")
        return
      }
      if (this.box().length >= BOX_SIZE) {
        await this.game.say('This box is full. Change boxes first.')
        return
      }
      this.save.party.splice(i, 1)
      restore(c)
      this.box().push(c)
      await this.game.say(`${displayName(c)} was stored in BOX ${this.save.box + 1}.`)
    }
  }

  private async release(): Promise<void> {
    const i = await this.game.run(new CritterPicker(this.game, `RELEASE · BOX ${this.save.box + 1}`, this.box()))
    if (i === null) return
    const c = this.box()[i]
    if (!(await this.game.ask(`Release ${displayName(c)} into the wild?`, { careful: true }))) return
    this.box().splice(i, 1)
    await this.game.say(`${displayName(c)} was released. Bye bye, ${displayName(c)}!`)
  }

  private async changeBox(): Promise<void> {
    const labels = Array.from({ length: BOX_COUNT }, (_, b) => `BOX ${b + 1} ${String(this.save.boxes[b].length).padStart(2)}`)
    const k = await this.game.choose([...labels, 'CANCEL'], { x: 0, y: 0, start: this.save.box, prompt: 'Which box?' })
    if (k < BOX_COUNT) this.save.box = k
  }
}
