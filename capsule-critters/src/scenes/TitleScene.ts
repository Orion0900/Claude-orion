import { critterFront } from '../art/creatures'
import { SPECIES, type SpeciesId } from '../data/species'
import { glyph, type Glyph } from '../ui/font'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { isTouchDevice } from '../engine/platform'

/** Critters that take turns on the title screen. */
const PARADE: SpeciesId[] = ['pandle', 'dipple', 'sproth', 'aurigon', 'lumedusa', 'grimwisp', 'bulwark', 'tarseer', 'cumulamb', 'erminarch', 'amparoo', 'galleocrab']

/** Draws text at 2× with a dark outline: the logo lettering. */
export function bigText(g: Gfx, text: string, x: number, y: number, fill: number, slot: number): void {
  const plot = (gl: Glyph, ox: number, oy: number, v: number) => {
    gl.rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) if (row[rx] === '#') g.rect(ox + rx * 2, oy + ry * 2, 2, 2, v, slot)
    })
  }
  let cx = x
  for (const ch of text) {
    const gl = glyph(ch)
    for (const [dx, dy] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
      [2, 2],
      [1, 2],
      [2, 1],
    ])
      plot(gl, cx + dx, y + dy, 3)
    plot(gl, cx, y, fill)
    cx += 16
  }
}

export type TitleChoice = 'new' | 'continue' | 'options'

/** The title: the logo, a parade of critters and PRESS START, then the menu. */
export class TitleScene extends Modal<TitleChoice> {
  readonly opaque = true
  private t = 0
  private who = 0
  private slide = 0
  private menu = false
  private index = 0

  constructor(
    private readonly game: Game,
    private readonly canContinue: boolean,
  ) {
    super()
    this.index = canContinue ? 0 : 0
  }

  enter(): void {
    this.game.audio.playMusic('title')
  }

  private items(): [string, TitleChoice][] {
    const out: [string, TitleChoice][] = []
    if (this.canContinue) out.push(['CONTINUE', 'continue'])
    out.push(['NEW GAME', 'new'], ['OPTIONS', 'options'])
    return out
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (this.t % 150 === 0) {
      this.who = (this.who + 1) % PARADE.length
      this.slide = 16
    }
    if (this.slide > 0) this.slide--
    if (!top) return
    if (!this.menu) {
      if (pad.pressed('a') || pad.pressed('start')) {
        this.game.audio.sfx('select')
        this.menu = true
      }
      return
    }
    const items = this.items()
    if (pad.repeat('up')) this.index = (this.index + items.length - 1) % items.length
    else if (pad.repeat('down')) this.index = (this.index + 1) % items.length
    else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      this.finish(items[this.index][1])
    } else if (pad.pressed('b')) this.menu = false
  }

  tap(x: number, y: number): boolean {
    if (!this.menu) {
      this.menu = true
      return true
    }
    const items = this.items()
    const row = Math.floor((y - 100) / 14)
    if (row >= 0 && row < items.length) this.finish(items[row][1])
    void x
    return true
  }

  /** Re-arms the title after OPTIONS. */
  reopen(): void {
    this.done = false
    this.menu = true
  }

  draw(g: Gfx): void {
    const id = PARADE[this.who]
    g.setPal(0, PAL.ui)
    g.setPal(1, PAL.title)
    g.setPal(2, PAL[SPECIES[id].pal])
    g.clear(0, 0)
    // A sunburst behind the logo.
    for (let y = 0; y < 52; y++) for (let x = 0; x < 160; x++) if (((Math.atan2(y - 60, x - 80) * 12) / Math.PI + this.t / 40) % 2 < 1) g.px(x, y, 1, 0)
    g.rect(0, 50, 160, 2, 3, 0)
    bigText(g, 'CAPSULE', 24, 6, 1, 1)
    bigText(g, 'CRITTERS', 16, 26, 2, 1)
    g.sprite(critterFront(id), 52 + this.slide * 6, 54, { slot: 2 })
    if (!this.menu) {
      if (Math.floor(this.t / 30) % 2 === 0) g.textCenter(isTouchDevice() ? 'TAP TO START' : 'PRESS START', 80, 116, 3, 1)
      g.textCenter('A CLASSIC ADVENTURE', 80, 132, 2, 1)
      return
    }
    const items = this.items()
    g.window(32, 92, 96, items.length * 14 + 12)
    items.forEach(([label], i) => g.text(label, 52, 100 + i * 14))
    g.cursor(40, 100 + this.index * 14)
  }
}
