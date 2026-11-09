import { critterFront } from '../art/creatures'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../data/species'
import { TYPE_NAME } from '../data/types'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import { padStart, wrap } from '../ui/font'
import { ListState, scrollArrows } from '../ui/widgets'

const ROWS = 7

/**
 * The ALMANAC: every species in order — numbers for the unseen, names for
 * the seen, a capsule mark for the caught — and an entry page for each
 * species you've seen.
 */
export class AlmanacScene extends Modal<void> {
  readonly opaque = true
  private readonly list: ListState
  private entry: SpeciesId | null = null

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
  ) {
    super()
    this.list = new ListState(this.shown().length, { rows: ROWS, sound: (k) => game.audio.sfx(k) })
  }

  /** Species up to the highest number seen so far. */
  private shown(): SpeciesId[] {
    let last = 0
    for (const id of this.save.seen) last = Math.max(last, SPECIES[id].num)
    return SPECIES_IDS.slice(0, Math.max(10, last))
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    if (this.entry) {
      if (pad.pressed('a') || pad.pressed('b')) {
        this.entry = null
        this.game.audio.sfx('cancel')
      } else if (pad.pressed('up') || pad.pressed('down')) {
        const ids = this.shown().filter((id) => this.save.seen.includes(id))
        const i = ids.indexOf(this.entry)
        const next = ids[(i + (pad.pressed('up') ? ids.length - 1 : 1)) % ids.length]
        if (next) {
          this.entry = next
          void this.game.audio.cry(next)
        }
      }
      return
    }
    if (pad.repeat('left')) this.list.index = Math.max(0, this.list.index - ROWS)
    if (pad.repeat('right')) this.list.index = Math.min(this.list.count - 1, this.list.index + ROWS)
    const r = this.list.update(pad)
    if (r === 'b') this.finish()
    else if (r === 'a') this.open(this.shown()[this.list.index])
  }

  private open(id: SpeciesId | undefined): void {
    if (!id || !this.save.seen.includes(id)) {
      this.game.audio.sfx('error')
      return
    }
    this.entry = id
    this.game.audio.sfx('dexOpen')
    void this.game.audio.cry(id)
  }

  tap(x: number, y: number): boolean {
    if (this.entry) {
      this.entry = null
      return true
    }
    const row = Math.floor((y - 24) / 16)
    if (y >= 24 && row < ROWS && x < 112) {
      const i = this.list.scroll + row
      if (i === this.list.index) this.open(this.shown()[i])
      else if (i < this.list.count) this.list.index = i
    } else if (x >= 112 && y > 100) this.finish()
    return true
  }

  draw(g: Gfx): void {
    g.clear(0, 15)
    if (this.entry) {
      this.drawEntry(g, this.entry)
      return
    }
    const ids = this.shown()
    g.window(0, 0, 112, 18)
    g.text('ALMANAC', 8, 5)
    g.window(0, 16, 112, 128)
    for (const [i, row] of this.list.visible()) {
      const id = ids[i]
      const y = 22 + row * 16
      const seen = this.save.seen.includes(id)
      g.text(padStart(SPECIES[id].num, 3, '0'), 16, y)
      g.text(seen ? SPECIES[id].name.slice(0, 10) : '-----', 16, y + 8)
      if (this.save.caught.includes(id)) g.text('¤', 48, y)
    }
    g.cursor(8, 26 + (this.list.index - this.list.scroll) * 16)
    scrollArrows(g, 100, 20, 128, this.list, ROWS, this.game.frame)
    g.text('SEEN', 116, 16)
    g.textRight(String(this.save.seen.length), 156, 26)
    g.text('OWN', 116, 44)
    g.textRight(String(this.save.caught.length), 156, 54)
    g.text('A:', 116, 100)
    g.text('READ', 124, 110)
    g.text('B:', 116, 120)
    g.text('QUIT', 124, 130)
  }

  private drawEntry(g: Gfx, id: SpeciesId): void {
    const sp = SPECIES[id]
    const caught = this.save.caught.includes(id)
    g.setPal(1, PAL[sp.pal])
    g.window(0, 0, 160, 144)
    g.sprite(critterFront(id), 6, 6, { slot: 1 })
    g.text(sp.name, 66, 10)
    g.text(sp.kind, 66, 22)
    g.text(`No.${padStart(sp.num, 3, '0')}`, 66, 34)
    if (caught) {
      g.text(`HT ${sp.height.toFixed(1)}m`, 66, 46)
      g.text(`WT ${sp.weight >= 100 ? Math.round(sp.weight) : sp.weight.toFixed(1)}kg`, 66, 56)
      g.text(sp.types.map((t) => TYPE_NAME[t]).join('/'), 8, 64)
      g.rect(6, 74, 148, 1, 3, 15)
      wrap(sp.dex, 18)
        .slice(0, 5)
        .forEach((line, i) => g.text(line, 8, 80 + i * 11))
    } else {
      g.text('HT  ?.?m', 66, 46)
      g.text('WT  ?.?kg', 66, 56)
      g.rect(6, 74, 148, 1, 3, 15)
      g.text('Catch one to learn', 8, 84)
      g.text('more about it.', 8, 96)
    }
  }
}
