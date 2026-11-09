import { person, PEOPLE } from '../art/world/people'
import { scaleSprite, type Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import { CH, padStart } from '../ui/font'

export const MEDAL_NAMES = ['HIVE', 'WAVE', 'COIL', 'BLOOM', 'VEIL', 'IRON', 'EMBER', 'DELVE'] as const

/** The player's card: name, ID, money, time played, ALMANAC and medals. */
export class TrainerCard extends Modal<void> {
  readonly opaque = true

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
  ) {
    super()
  }

  update(pad: Pad, top: boolean): void {
    if (top && (pad.pressed('a') || pad.pressed('b') || pad.pressed('start'))) {
      this.game.audio.sfx('cancel')
      this.finish()
    }
  }

  tap(): boolean {
    this.finish()
    return true
  }

  draw(g: Gfx): void {
    const s = this.save
    g.setPal(1, PAL.skin)
    g.setPal(2, PAL.gold)
    g.clear(0, 15)
    g.window(0, 0, 160, 80)
    g.text(`NAME/${s.name}`, 8, 8)
    g.text(`${CH.id}/${padStart(s.id, 5, '0')}`, 8, 20)
    g.text(`MONEY/¤${s.money}`, 8, 32)
    const mins = Math.floor(s.playSeconds / 60)
    g.text(`TIME/${Math.floor(mins / 60)}:${padStart(mins % 60, 2, '0')}`, 8, 44)
    g.text(`ALMANAC/${s.caught.length}`, 8, 56)
    g.sprite(scaleSprite(person(PEOPLE.player).frames.down[0], 2), 118, 16, { slot: 1 })
    g.window(0, 80, 160, 64)
    g.text('MEDALS', 8, 86)
    MEDAL_NAMES.forEach((name, i) => {
      const x = 8 + (i % 4) * 38
      const y = 100 + Math.floor(i / 4) * 20
      const has = s.medals.includes(i + 1)
      if (has) {
        for (let yy = 0; yy < 9; yy++) for (let xx = 0; xx < 9; xx++) if ((xx - 4) ** 2 + (yy - 4) ** 2 <= 17) g.px(x + xx, y + yy, (xx - 3) ** 2 + (yy - 3) ** 2 < 5 ? 0 : xx + yy > 10 ? 2 : 1, 2)
        g.box(x, y, 9, 9, 3)
      } else g.box(x + 2, y + 2, 5, 5, 1)
      g.text(name.slice(0, 3), x + 10, y + 1)
    })
  }
}
