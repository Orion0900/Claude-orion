import { PLAYER_LOOKS } from '../art/look'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import type { Scene } from '../game/scene'
import { CH } from '../ui/font'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { NamingScene } from './NamingScene'
import { PEOPLE } from '../world/people'

interface Figure {
  kind: 'prof' | 'narlet' | 'player0' | 'player1' | 'chosen'
  x: number
  alpha: number
}

const SUGGESTED = ['KAI', 'REEF', 'NOA', 'MARLO', 'SUNNY', 'ISLA', 'CORBIN', 'WREN']

/**
 * The professor's welcome for a new game: who she is, what beasts are,
 * then choosing how you look and your name.
 */
export class IntroScene implements Scene {
  readonly opaque = true
  private figures: Figure[] = []
  private pick = 0
  private picking = false
  private t = 0
  private resolve: ((v: { name: string; lookIndex: number }) => void) | null = null

  constructor(private readonly game: Game) {}

  /** Runs the whole welcome and resolves with the name and look chosen. */
  play(): Promise<{ name: string; lookIndex: number }> {
    return new Promise((resolve) => {
      this.resolve = resolve
      void this.script()
    })
  }

  private async script(): Promise<void> {
    const g = this.game
    g.audio.playMusic('intro')
    g.setFade(1)
    this.figures = [{ kind: 'prof', x: 88, alpha: 1 }]
    await g.fadeIn(30)
    await g.say("Hello, hello! Welcome to the AZURE ISLES!\fMy name is MARIS. Most people just call me the PROFESSOR.")
    await g.say('These islands are home to wonderful creatures that we call BEASTS.')
    this.figures = [
      { kind: 'prof', x: 56, alpha: 1 },
      { kind: 'narlet', x: 132, alpha: 0 },
    ]
    g.audio.sfx('orbOpen')
    for (let i = 0; i <= 10; i++) {
      this.figures[1].alpha = i / 10
      await g.wait(2)
    }
    await g.audio.cry('narlet')
    await g.say('This little one is a NARLET. It squeaks a song whenever the tide comes in.')
    await g.say('People and beasts share these islands. Some are friends, some are partners, and some train together to battle!\fAs for me, I study how beasts move with the tides. The sea has so many secrets…')
    this.figures = [{ kind: 'prof', x: 88, alpha: 1 }]
    await g.say('But enough about me! Tell me about yourself. Which of these looks like you?')
    this.figures = [
      { kind: 'player0', x: 40, alpha: 1 },
      { kind: 'player1', x: 136, alpha: 1 },
    ]
    let lookIndex = 0
    for (;;) {
      this.picking = true
      lookIndex = await new Promise<number>((resolve) => (this.onPick = resolve))
      this.picking = false
      this.figures = [{ kind: 'chosen', x: 88, alpha: 1 }]
      this.pick = lookIndex
      if (await g.ask('This is you, right?')) break
      this.figures = [
        { kind: 'player0', x: 40, alpha: 1 },
        { kind: 'player1', x: 136, alpha: 1 },
      ]
    }
    await g.say("And what's your name?")
    let name = ''
    for (;;) {
      const suggestion = SUGGESTED[(g.frame >> 3) % SUGGESTED.length]
      name = await g.run(new NamingScene('YOUR NAME?', name, g.audio, suggestion))
      if (await g.ask(`So your name is ${name}?`)) break
    }
    this.figures = [{ kind: 'prof', x: 88, alpha: 1 }]
    await g.say(`${name}! What a splendid name.\fThe tide is turning, ${name}. A beast of your very own is waiting for you at my lab in DRIFTWOOD.\fI'll see you there. Off you go!`)
    this.figures = [{ kind: 'chosen', x: 88, alpha: 1 }]
    await g.wait(40)
    g.audio.stopMusic(1)
    await g.fadeOut(40, '#fff')
    this.resolve?.({ name, lookIndex })
  }

  private onPick: ((i: number) => void) | null = null

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top || !this.picking) return
    if (pad.pressed('left') || pad.pressed('right')) {
      this.pick = 1 - this.pick
      this.game.audio.sfx('cursor')
    } else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      const f = this.onPick
      this.onPick = null
      f?.(this.pick)
    }
  }

  draw(g: Gfx): void {
    // A deep sea gradient with slow light bands.
    const bands = ['#0c1830', '#10203c', '#142848', '#183054', '#1c3860', '#20406c']
    bands.forEach((c, i) => g.rect(0, i * 20, 240, 20, c))
    g.rect(0, 120, 240, 40, '#20406c')
    for (let i = 0; i < 6; i++) {
      const x = ((this.t * 0.3 + i * 47) % 280) - 20
      g.rect(x, 20 + i * 14, 18, 1, '#2c5484')
    }
    // A pool of light the figures stand in.
    g.rect(24, 104, 192, 4, '#28507c')
    g.rect(40, 108, 160, 2, '#2c5a88')

    for (const f of this.figures) {
      const img =
        f.kind === 'prof'
          ? Art.portrait(PEOPLE.prof)
          : f.kind === 'narlet'
            ? Art.front('narlet')
            : Art.portrait(PLAYER_LOOKS[f.kind === 'player0' ? 0 : f.kind === 'player1' ? 1 : this.pick])
      g.image(img, f.x, 104 - img.h + 4, { alpha: f.alpha })
    }
    if (this.picking) {
      const x = this.pick === 0 ? 40 : 136
      g.text(CH.down, x + 28, 20 + (Math.floor(this.t / 12) % 2), { color: '#f8e070', shadow: '#604010' })
    }
  }
}
