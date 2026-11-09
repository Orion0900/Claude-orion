import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { DISPLAY_MODES } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { writeOptions, type Options } from '../game/state'

interface Row {
  label: string
  values: readonly string[]
  get(o: Options): number
  set(o: Options, i: number): void
}

const ROWS: Row[] = [
  {
    label: 'TEXT SPEED',
    values: ['SLOW', 'MID', 'FAST'],
    get: (o) => o.textSpeed,
    set: (o, i) => (o.textSpeed = i as Options['textSpeed']),
  },
  {
    label: 'ANIMATIONS',
    values: ['ON', 'OFF'],
    get: (o) => (o.animations ? 0 : 1),
    set: (o, i) => (o.animations = i === 0),
  },
  {
    label: 'BATTLE STYLE',
    values: ['SHIFT', 'SET'],
    get: (o) => (o.battleStyle === 'shift' ? 0 : 1),
    set: (o, i) => (o.battleStyle = i === 0 ? 'shift' : 'set'),
  },
  {
    label: 'SCREEN',
    values: DISPLAY_MODES,
    get: (o) => DISPLAY_MODES.indexOf(o.display),
    set: (o, i) => (o.display = DISPLAY_MODES[i]),
  },
  {
    label: 'MUSIC',
    values: ['OFF', '1', '2', '3', '4', '5'],
    get: (o) => Math.round(o.music * 5),
    set: (o, i) => (o.music = i / 5),
  },
  {
    label: 'SOUND',
    values: ['OFF', '1', '2', '3', '4', '5'],
    get: (o) => Math.round(o.sfx * 5),
    set: (o, i) => (o.sfx = i / 5),
  },
]

/** OPTIONS: LEFT / RIGHT change the value on the row under the cursor. */
export class OptionsScene extends Modal<void> {
  readonly opaque = true
  private index = 0

  constructor(private readonly game: Game) {
    super()
  }

  private change(row: number, d: number): void {
    const r = ROWS[row]
    const o = this.game.options
    const i = (r.get(o) + d + r.values.length) % r.values.length
    r.set(o, i)
    this.game.audio.setVolumes(o.music, o.sfx)
    if (this.game.save) this.game.save.options = { ...o }
    writeOptions(o)
    this.game.audio.sfx('cursor')
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    const n = ROWS.length + 1
    if (pad.repeat('up')) {
      this.index = (this.index + n - 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % n
      this.game.audio.sfx('cursor')
    } else if (this.index < ROWS.length && (pad.repeat('left') || pad.repeat('right'))) this.change(this.index, pad.repeat('left') ? -1 : 1)
    else if (pad.pressed('a')) {
      if (this.index === ROWS.length) this.finish()
      else this.change(this.index, 1)
    } else if (pad.pressed('b') || pad.pressed('start')) {
      this.game.audio.sfx('cancel')
      this.finish()
    }
  }

  tap(x: number, y: number): boolean {
    const row = Math.floor((y - 8) / 20)
    if (row >= 0 && row < ROWS.length) {
      this.index = row
      this.change(row, x < 80 ? -1 : 1)
    } else this.finish()
    return true
  }

  draw(g: Gfx): void {
    g.clear(0, 15)
    g.window(0, 0, 160, 144)
    ROWS.forEach((r, i) => {
      const y = 8 + i * 20
      g.text(r.label, 16, y)
      g.text(`← ${r.values[r.get(this.game.options)]} →`, 32, y + 9)
    })
    g.text('CANCEL', 16, 8 + ROWS.length * 20)
    g.cursor(8, 8 + this.index * 20)
  }
}
