import { FRAMES, type Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { Options } from '../game/state'

interface Row {
  label: string
  values: string[]
  get(o: Options): number
  set(o: Options, i: number): void
}

const VOLUMES = [0, 0.2, 0.4, 0.6, 0.8, 1]

const ROWS: Row[] = [
  {
    label: 'TEXT SPEED',
    values: ['SLOW', 'MID', 'FAST'],
    get: (o) => o.textSpeed,
    set: (o, i) => (o.textSpeed = i as Options['textSpeed']),
  },
  {
    label: 'BATTLE SCENE',
    values: ['ON', 'OFF'],
    get: (o) => (o.battleAnims ? 0 : 1),
    set: (o, i) => (o.battleAnims = i === 0),
  },
  {
    label: 'MUSIC',
    values: VOLUMES.map((v) => `${Math.round(v * 5)}`),
    get: (o) => nearest(o.music),
    set: (o, i) => (o.music = VOLUMES[i]),
  },
  {
    label: 'SOUND',
    values: VOLUMES.map((v) => `${Math.round(v * 5)}`),
    get: (o) => nearest(o.sfx),
    set: (o, i) => (o.sfx = VOLUMES[i]),
  },
  {
    label: 'FRAME',
    values: FRAMES.map((f) => f.name),
    get: (o) => o.frame % FRAMES.length,
    set: (o, i) => (o.frame = i),
  },
]

function nearest(v: number): number {
  let best = 0
  VOLUMES.forEach((x, i) => {
    if (Math.abs(x - v) < Math.abs(VOLUMES[best] - v)) best = i
  })
  return best
}

/** Text speed, battle animations, volumes and the window frame. */
export class OptionsScene extends Modal<void> {
  readonly opaque = true
  private index = 0

  constructor(private readonly game: Game) {
    super()
  }

  update(pad: Pad, top: boolean): void {
    if (!top) return
    const o = this.game.options
    const rows = ROWS.length + 1
    if (pad.repeat('up')) {
      this.index = (this.index + rows - 1) % rows
      this.game.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % rows
      this.game.audio.sfx('cursor')
    } else if ((pad.repeat('left') || pad.repeat('right')) && this.index < ROWS.length) {
      const row = ROWS[this.index]
      const n = row.values.length
      row.set(o, (row.get(o) + (pad.repeat('left') ? n - 1 : 1)) % n)
      this.apply()
      this.game.audio.sfx('cursor')
    } else if (pad.pressed('b') || pad.pressed('start') || (pad.pressed('a') && this.index === ROWS.length)) {
      this.game.audio.sfx('cancel')
      this.finish()
    }
  }

  private apply(): void {
    const o = this.game.options
    this.game.gfx.frameStyle = o.frame
    this.game.audio.setVolumes(o.music, o.sfx)
    if (this.game.save) this.game.save.options = { ...o }
  }

  draw(g: Gfx): void {
    g.clear('#385890')
    for (let y = 0; y < 160; y += 8) g.rect(0, y + 4, 240, 4, '#3c6098')
    g.window(4, 4, 232, 24)
    g.text('OPTIONS', 14, 11)
    g.window(4, 30, 232, 126)
    const o = this.game.options
    ROWS.forEach((row, i) => {
      const y = 40 + i * 20
      g.text(row.label, 22, y)
      const v = row.values[row.get(o)]
      g.text(`${i === this.index ? '< ' : '  '}${v}${i === this.index ? ' >' : ''}`, 126, y, { color: i === this.index ? '#d04040' : undefined })
    })
    g.text('CANCEL', 22, 40 + ROWS.length * 20)
    g.cursor(12, 40 + this.index * 20)
  }
}
