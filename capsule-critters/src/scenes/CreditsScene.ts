import { critterFront } from '../art/creatures'
import { displayName } from '../battle/creature'
import { species } from '../data/species'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import { CH } from '../ui/font'
import { bigText } from './TitleScene'

const ROLL = [
  'CAPSULE CRITTERS',
  '',
  'A HANDHELD ADVENTURE',
  'MADE IN CODE',
  '',
  'EVERY CRITTER, TUNE,',
  'TOWN AND TILE',
  'DRAWN AND WRITTEN',
  'FOR THIS GAME',
  '',
  'THANK YOU FOR',
  'PLAYING!',
]

/** The HALL OF FAME: each champion critter in turn, then the credits roll. */
export class CreditsScene extends Modal<void> {
  readonly opaque = true
  private showing = -1
  private scroll = 0
  private rolling = false
  private done2 = false

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
  ) {
    super()
  }

  enter(): void {
    void this.run()
  }

  private async run(): Promise<void> {
    const g = this.game
    g.audio.playMusic('credits')
    await g.fadeIn()
    for (let i = 0; i < this.save.party.length; i++) {
      this.showing = i
      const c = this.save.party[i]
      void g.audio.cry(c.species)
      await g.say(`${displayName(c)} ${CH.level}${c.level}, a champion of ARGENT!`, { auto: 90 })
    }
    this.showing = -1
    await g.say(`${this.save.name} and team entered the HALL OF FAME!`, { auto: 120 })
    this.rolling = true
    while (this.scroll < ROLL.length * 16 + 160) {
      this.scroll += 0.5
      await g.wait(1)
    }
    this.done2 = true
    await g.wait(120)
    this.finish()
  }

  update(pad: Pad, top: boolean): void {
    if (top && this.done2 && (pad.pressed('a') || pad.pressed('start'))) this.finish()
  }

  draw(g: Gfx): void {
    g.setPal(1, PAL.title)
    g.clear(0, 15)
    if (this.showing >= 0) {
      const c = this.save.party[this.showing]
      const sp = species(c.species)
      g.setPal(2, PAL[c.shiny ? sp.shinyPal : sp.pal])
      g.textCenter('HALL OF FAME', 80, 8, 3, 1)
      g.sprite(critterFront(c.species), 52, 24, { slot: 2 })
      return
    }
    if (!this.rolling) {
      bigText(g, 'CHAMPION', 16, 40, 1, 1)
      return
    }
    ROLL.forEach((line, i) => {
      const y = 150 + i * 16 - this.scroll
      if (y > -10 && y < 150) g.textCenter(line, 80, y, 3, 1)
    })
    if (this.done2) bigText(g, 'THE END', 24, 60, 1, 1)
  }
}
