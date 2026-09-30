import { DEX, type DexEntry } from '../data/dex'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { CH, wrap } from '../ui/font'
import { menuBackdrop, scrollTop, typeBadge } from '../ui/widgets'

const ROWS = 8

/**
 * The Beastiary: every species by number, named once seen and marked once
 * caught. Opening an entry shows its picture, kind, size and description.
 */
export class DexScene extends Modal<void> {
  readonly opaque = true
  private index = 0
  private top = 0
  private open: DexEntry | null = null
  private t = 0

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    /** Open straight onto one entry (after a catch). */
    only?: DexEntry,
  ) {
    super()
    if (only) {
      this.open = only
      this.index = only.num - 1
      this.single = true
    }
  }

  private single = false

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top) return
    const audio = this.game.audio
    if (this.open) {
      if (pad.pressed('a') || pad.pressed('b')) {
        audio.sfx('cancel')
        if (this.single) this.finish()
        this.open = null
      } else if (!this.single && (pad.repeat('up') || pad.repeat('down'))) {
        // Step to the previous/next seen entry.
        const dir = pad.repeat('up') ? -1 : 1
        for (let i = this.index + dir; i >= 0 && i < DEX.length; i += dir) {
          if (this.save.seen.includes(DEX[i].id)) {
            this.index = i
            this.open = DEX[i]
            audio.sfx('cursor')
            void audio.cry(DEX[i].id)
            break
          }
        }
      }
      return
    }
    if (pad.repeat('up')) {
      this.index = Math.max(0, this.index - 1)
      audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = Math.min(DEX.length - 1, this.index + 1)
      audio.sfx('cursor')
    } else if (pad.repeat('left')) {
      this.index = Math.max(0, this.index - ROWS)
      audio.sfx('cursor')
    } else if (pad.repeat('right')) {
      this.index = Math.min(DEX.length - 1, this.index + ROWS)
      audio.sfx('cursor')
    } else if (pad.pressed('b')) {
      audio.sfx('cancel')
      this.finish()
    } else if (pad.pressed('a')) {
      const d = DEX[this.index]
      if (this.save.seen.includes(d.id)) {
        audio.sfx('select')
        this.open = d
        void audio.cry(d.id)
      } else audio.sfx('error')
    }
    this.top = scrollTop(this.index, this.top, ROWS, DEX.length)
  }

  draw(g: Gfx): void {
    menuBackdrop(g, '#c04848', '#c85050', this.t)
    if (this.open) return this.drawEntry(g, this.open)
    g.window(0, 0, 240, 22)
    g.text('BEASTIARY', 8, 6)
    g.text(`SEEN ${this.save.seen.length}  OWN ${this.save.caught.length}`, 118, 6)
    g.window(88, 22, 152, 138)
    DEX.slice(this.top, this.top + ROWS).forEach((d, k) => {
      const y = 30 + k * 16
      const seen = this.save.seen.includes(d.id)
      const own = this.save.caught.includes(d.id)
      g.text(`No${String(d.num).padStart(3, '0')}`, 106, y, { color: '#788088' })
      g.text(seen ? d.name : '----------', 146, y)
      if (own) g.text(CH.star, 227, y, { color: '#e04848', shadow: null })
    })
    g.cursor(96, 30 + (this.index - this.top) * 16)
    // Picture of the highlighted beast.
    g.window(0, 22, 88, 96)
    const d = DEX[this.index]
    if (this.save.seen.includes(d.id)) g.image(Art.front(d.id), 12, 34)
    else g.text('?', 40, 60, { color: '#a0a0a0' })
    g.window(0, 118, 88, 42)
    g.text('A: OPEN', 8, 126)
    g.text('B: CLOSE', 8, 142)
  }

  private drawEntry(g: Gfx, d: DexEntry): void {
    const own = this.save.caught.includes(d.id)
    g.window(0, 0, 240, 104)
    g.rect(8, 8, 80, 80, '#e8f0e8')
    g.image(Art.front(d.id), 16, 16)
    g.text(`No${String(d.num).padStart(3, '0')}`, 98, 10, { color: '#788088' })
    g.text(d.name, 140, 10)
    g.text(`${d.kind} beast`, 98, 28)
    d.types.forEach((t, i) => typeBadge(g, 98 + i * 40, 44, t))
    if (own) {
      g.text(`HT ${d.height.toFixed(1)} m`, 98, 64)
      g.text(`WT ${d.weight.toFixed(1)} kg`, 98, 80)
    } else {
      g.text('HT ??? m', 98, 64)
      g.text('WT ??? kg', 98, 80)
    }
    g.window(0, 104, 240, 56)
    const text = own ? d.entry : 'Catch this beast to learn more about it.'
    wrap(text, 222)
      .slice(0, 3)
      .forEach((l, i) => g.text(l, 10, 110 + i * 15))
  }
}
