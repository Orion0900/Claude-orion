import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'

const UPPER = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ ', "-?!.,'/  "]
const LOWER = ['abcdefghi', 'jklmnopqr', 'stuvwxyz ', '0123456789'.slice(0, 9)]

/**
 * The naming keyboard: a grid of letters, upper and lower case, with a
 * case switch, delete and done. Typing on a real keyboard works too.
 */
export class NamingScene extends Modal<string> {
  readonly opaque = true
  private name: string
  private row = 0
  private col = 0
  private lower = false
  private readonly onKey = (e: KeyboardEvent) => this.key(e)

  constructor(
    private readonly game: Game,
    private readonly title: string,
    initial = '',
    private readonly max = 7,
    private readonly fallback = 'CRITTER',
  ) {
    super()
    this.name = initial.slice(0, max)
  }

  enter(): void {
    if (typeof window !== 'undefined') window.addEventListener('keydown', this.onKey, true)
  }

  exit(): void {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this.onKey, true)
  }

  private key(e: KeyboardEvent): void {
    if (e.key.length === 1 && /[A-Za-z0-9 \-?!.,'/]/.test(e.key)) {
      if (this.name.length < this.max) this.name += e.key
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'Backspace') {
      this.name = this.name.slice(0, -1)
      e.preventDefault()
      e.stopPropagation()
    } else if (e.key === 'Enter') {
      this.submit()
      e.preventDefault()
      e.stopPropagation()
    }
  }

  private grid(): string[] {
    return this.lower ? LOWER : UPPER
  }

  /** Rows: four of letters, then [CASE, DEL, END]. */
  update(pad: Pad, top: boolean): void {
    if (!top) return
    const rows = 5
    if (pad.repeat('up')) this.row = (this.row + rows - 1) % rows
    else if (pad.repeat('down')) this.row = (this.row + 1) % rows
    else if (pad.repeat('left')) this.col = (this.col + (this.row === 4 ? 2 : 8)) % (this.row === 4 ? 3 : 9)
    else if (pad.repeat('right')) this.col = (this.col + 1) % (this.row === 4 ? 3 : 9)
    else if (pad.pressed('a')) this.press()
    else if (pad.pressed('b')) this.name = this.name.slice(0, -1)
    else if (pad.pressed('start')) this.submit()
    if (this.row === 4) this.col = Math.min(this.col, 2)
  }

  private press(): void {
    this.game.audio.sfx('select')
    if (this.row === 4) {
      if (this.col === 0) this.lower = !this.lower
      else if (this.col === 1) this.name = this.name.slice(0, -1)
      else this.submit()
      return
    }
    const ch = this.grid()[this.row][this.col]
    if (ch && this.name.length < this.max) this.name += ch
    if (this.name.length >= this.max) {
      this.row = 4
      this.col = 2
    }
  }

  private submit(): void {
    const n = this.name.trim()
    this.finish(n.length ? n : this.fallback)
  }

  tap(x: number, y: number): boolean {
    const row = Math.floor((y - 48) / 18)
    if (row >= 0 && row < 4) {
      const col = Math.floor((x - 12) / 16)
      if (col >= 0 && col < 9) {
        this.row = row
        this.col = col
        this.press()
      }
    } else if (row === 4) {
      this.row = 4
      this.col = x < 56 ? 0 : x < 104 ? 1 : 2
      this.press()
    }
    return true
  }

  draw(g: Gfx): void {
    g.clear(0, 15)
    g.window(0, 0, 160, 40)
    g.text(this.title, 8, 6)
    const shown = this.name + (this.name.length < this.max && Math.floor(this.game.frame / 20) % 2 ? '_' : ' ')
    g.text(shown, 24, 22)
    for (let i = 0; i < this.max; i++) g.rect(24 + i * 8, 31, 6, 1, 2)
    g.window(0, 40, 160, 104)
    this.grid().forEach((r, ri) => {
      for (let ci = 0; ci < r.length; ci++) g.text(r[ci], 20 + ci * 16, 50 + ri * 18)
    })
    const actions = [this.lower ? 'UPPER' : 'lower', 'DEL', 'END']
    actions.forEach((a, i) => g.text(a, 16 + i * 48, 50 + 4 * 18))
    if (this.row < 4) g.cursor(12 + this.col * 16, 50 + this.row * 18)
    else g.cursor(8 + this.col * 48, 50 + 4 * 18)
  }
}
