import { CH } from '../ui/font'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { Modal } from '../game/scene'
import type { Audio } from '../audio/api'

const PAGES = [
  ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ '],
  ['abcdefghi', 'jklmnopqr', 'stuvwxyz '],
  ['012345678', "9!?.-'&  ", '         '],
]
const PAGE_NAMES = ['UPPER', 'lower', 'OTHERS']
export const NAME_MAX = 8

/**
 * The name-entry grid: pick letters with the D-pad and A, B deletes, SELECT
 * flips between upper case, lower case and symbols, START (or OK) finishes.
 */
export class NamingScene extends Modal<string> {
  readonly opaque = true
  private name: string
  private page = 0
  private cx = 0
  private cy = 0
  /** cx === 9 is the side column: PAGE, BACK, OK. */
  private blink = 0

  constructor(
    private readonly title: string,
    initial: string,
    private readonly audio: Audio,
    private readonly fallback: string,
  ) {
    super()
    this.name = initial.slice(0, NAME_MAX)
  }

  update(pad: Pad, top: boolean): void {
    this.blink++
    if (!top) return
    const cols = 10
    if (pad.repeat('left')) {
      this.cx = (this.cx + cols - 1) % cols
      this.audio.sfx('cursor')
    } else if (pad.repeat('right')) {
      this.cx = (this.cx + 1) % cols
      this.audio.sfx('cursor')
    } else if (pad.repeat('up')) {
      this.cy = (this.cy + 2) % 3
      this.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.cy = (this.cy + 1) % 3
      this.audio.sfx('cursor')
    } else if (pad.pressed('select')) this.flip()
    else if (pad.pressed('b')) this.back()
    else if (pad.pressed('start')) this.done_()
    else if (pad.pressed('a')) this.press()
  }

  /** A on the highlighted key: type it, or flip, delete or finish. */
  private press(): void {
    if (this.cx === 9) {
      if (this.cy === 0) this.flip()
      else if (this.cy === 1) this.back()
      else this.done_()
      return
    }
    const ch = PAGES[this.page][this.cy][this.cx]
    if (ch === ' ' && this.name.length === 0) return
    if (this.name.length < NAME_MAX) {
      this.name += ch
      this.audio.sfx('select')
      if (this.name.length === NAME_MAX) {
        this.cx = 9
        this.cy = 2
      }
    } else this.audio.sfx('error')
  }

  /** Tap a letter to type it, or the side keys to flip, delete or finish. */
  tap(x: number, y: number): boolean {
    const row = Math.floor((y - 59) / 26)
    if (row < 0 || row > 2) return true
    // Each key's hit box is centred on its letter (drawn at 26 + col * 18).
    if (x >= 180 && x < 232) this.cx = 9
    else if (x >= 20 && x < 180) {
      const col = Math.floor((x - 20) / 18)
      if (PAGES[this.page][row][col] === ' ') return true
      this.cx = col
    } else return true
    this.cy = row
    this.press()
    return true
  }

  private flip(): void {
    this.page = (this.page + 1) % PAGES.length
    this.audio.sfx('select')
  }

  private back(): void {
    if (this.name.length) {
      this.name = this.name.slice(0, -1)
      this.audio.sfx('cancel')
    }
  }

  private done_(): void {
    const n = this.name.trim()
    this.audio.sfx('select')
    this.finish(n.length ? n : this.fallback)
  }

  draw(g: Gfx): void {
    g.clear('#284878')
    for (let y = 0; y < 160; y += 8) g.rect(0, y, 240, 4, '#2c5080')
    g.window(8, 6, 224, 40)
    g.text(this.title, 18, 12)
    const slotW = 10
    for (let i = 0; i < NAME_MAX; i++) {
      const x = 70 + i * slotW
      const ch = this.name[i]
      if (ch) g.text(ch, x + 1, 27)
      const under = i === this.name.length && Math.floor(this.blink / 16) % 2 === 0 ? '#e04848' : '#8898b0'
      g.rect(x, 38, 7, 1, under)
    }
    g.window(8, 52, 224, 100)
    const rows = PAGES[this.page]
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const ch = row[rx]
        if (ch !== ' ') g.text(ch, 26 + rx * 18, 66 + ry * 26)
      }
    })
    const side = [PAGE_NAMES[(this.page + 1) % PAGES.length], 'BACK', 'OK']
    side.forEach((label, i) => g.text(label, 186, 66 + i * 26))
    const hx = this.cx === 9 ? 176 : 17 + this.cx * 18
    g.text(CH.cursor, hx, 67 + this.cy * 26)
    g.text(`SELECT: ${PAGE_NAMES[(this.page + 1) % PAGES.length]}   START: OK`, 18, 142, { color: '#6878a0', shadow: null })
  }
}
