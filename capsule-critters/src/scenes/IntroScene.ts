import { critterFront } from '../art/creatures'
import { PEOPLE, person } from '../art/world/people'
import { scaleSprite, type Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { NamingScene } from './NamingScene'

export interface IntroResult {
  name: string
  rival: string
}

type Showing = 'prof' | 'critter' | 'player' | 'rival' | 'none'

/**
 * PROF. STERLING's welcome: who critters are, then your name and your
 * neighbour's, before the adventure begins in your bedroom.
 */
export class IntroScene extends Modal<IntroResult> {
  readonly opaque = true
  private showing: Showing = 'prof'
  private x = 160
  private shrink = 1

  constructor(private readonly game: Game) {
    super()
  }

  enter(): void {
    this.game.audio.playMusic('intro')
    void this.run()
  }

  private async slideIn(what: Showing): Promise<void> {
    this.showing = what
    this.x = 160
    for (let i = 0; i < 24; i++) {
      this.x = Math.round(160 - (i + 1) * (108 / 24))
      await this.game.wait(1)
    }
  }

  private async run(): Promise<void> {
    const g = this.game
    await g.fadeIn()
    await this.slideIn('prof')
    await g.say("Oh! You're awake at last. I'm STERLING, and I run the critter lab down the lane.")
    await this.slideIn('critter')
    void g.audio.cry('nimblamb')
    await g.say('Out there in the ARGENT region live wild creatures we call CRITTERS.')
    await g.say('Some folk keep them as companions. Some test them in friendly battles. I fill notebooks about them!')
    await this.slideIn('player')
    await g.say("Before we go any further, remind me who you are. What's your name?")
    const name = await this.pickName(['NEW NAME', 'ORION', 'JUNO', 'KAI'], 'YOUR NAME?', 'ORION')
    await g.say(`${name}! Of course. I've known your family for years.`)
    await this.slideIn('rival')
    await g.say('And this rascal from next door, always one step ahead, or so they claim. What was their name?')
    const rival = await this.pickName(['NEW NAME', 'VANCE', 'PIPPA', 'REX'], "RIVAL'S NAME?", 'VANCE')
    await g.say(`${rival}! That's it. You two have been racing each other since you could walk.`)
    await this.slideIn('player')
    await g.say(`Right then, ${name}. Come by the lab today. There's a critter there who has been waiting for someone just like you.`)
    for (let i = 0; i <= 20; i++) {
      this.shrink = 1 - i / 24
      await g.wait(2)
    }
    this.showing = 'none'
    g.audio.stopMusic(1)
    await g.fadeOut()
    this.finish({ name, rival })
  }

  private async pickName(options: string[], title: string, fallback: string): Promise<string> {
    const k = await this.game.choose(options, { x: 0, y: 0, cancel: null })
    if (k > 0) return options[k]
    return this.game.run(new NamingScene(this.game, title, '', 7, fallback))
  }

  update(_pad: Pad): void {}

  draw(g: Gfx): void {
    g.setPal(1, PAL.skin)
    g.setPal(2, PAL.skinPurple)
    g.setPal(3, PAL.pink)
    g.setPal(4, PAL.skinBlue)
    g.clear(0, 15)
    const x = this.x
    switch (this.showing) {
      case 'prof':
        g.sprite(scaleSprite(person(PEOPLE.prof).frames.down[0], 3), x, 20, { slot: 2 })
        break
      case 'critter':
        g.sprite(critterFront('nimblamb'), x - 4, 24, { slot: 3 })
        break
      case 'player': {
        const s = scaleSprite(person(PEOPLE.player).frames.down[0], 3)
        const w = 48 * this.shrink
        g.spriteScaled(s, x + (48 - w) / 2, 20 + (48 - w), w, w, { slot: 1 })
        break
      }
      case 'rival':
        g.sprite(scaleSprite(person(PEOPLE.rival).frames.down[0], 3), x, 20, { slot: 4 })
        break
      case 'none':
        break
    }
  }
}
