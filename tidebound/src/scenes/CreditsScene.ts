import { displayName } from '../battle/creature'
import type { Creature } from '../battle/types'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import type { Scene } from '../game/scene'
import type { SaveData } from '../game/state'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { measure } from '../ui/font'
import { playTime } from './TrainerCard'

interface Line {
  text?: string
  beast?: Creature
  gap?: number
  big?: boolean
}

/**
 * The end: a record of the champion and their team, then the credits
 * scroll up over a night sea with the lighthouse beam sweeping by.
 */
export class CreditsScene implements Scene {
  readonly opaque = true
  private y = 170
  private t = 0
  private readonly lines: Line[]
  private height = 0
  private resolve: (() => void) | null = null

  constructor(
    private readonly game: Game,
    save: SaveData,
  ) {
    this.lines = [
      { text: 'CONGRATULATIONS!', big: true },
      { gap: 8 },
      { text: `${save.name}, CHAMPION OF THE AZURE ISLES` },
      { text: `TIME ${playTime(save.playSeconds)}   BEASTIARY ${save.caught.length}` },
      { gap: 24 },
      { text: 'THE CHAMPION TEAM' },
      { gap: 6 },
      ...save.party.map((c) => ({ beast: c })),
      { gap: 24 },
      { text: 'TIDEBOUND', big: true },
      { text: 'An island adventure' },
      { gap: 20 },
      { text: 'WORLD, STORY & BEASTS' },
      { text: 'Made for this game, in code' },
      { gap: 14 },
      { text: 'MUSIC & SOUND' },
      { text: 'Synthesised live in your browser' },
      { gap: 14 },
      { text: 'STARRING' },
      { text: 'PROF. MARIS   SKYE   MUM' },
      { text: 'BRECK   VOLTA   MARINA' },
      { text: 'CAPTAIN SCRAG & THE TIDEWRACK CREW' },
      { text: 'CHAMPION NERISSA' },
      { gap: 14 },
      { text: 'SPECIAL THANKS' },
      { text: 'Every beast of the isles,' },
      { text: 'and you, for playing.' },
      { gap: 40 },
      { text: 'THE TIDE ALWAYS RETURNS…', big: true },
    ]
    this.height = this.lines.reduce((h, l) => h + this.lineHeight(l), 0)
  }

  private lineHeight(l: Line): number {
    if (l.gap) return l.gap
    if (l.beast) return 70
    return l.big ? 20 : 14
  }

  play(): Promise<void> {
    this.game.audio.playMusic('credits')
    return new Promise((r) => (this.resolve = r))
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    const speed = top && (pad.held('a') || pad.held('b')) ? 1.5 : 0.35
    this.y -= speed
    if (this.y + this.height < 60 && this.resolve) {
      const r = this.resolve
      this.resolve = null
      r()
    }
  }

  draw(g: Gfx): void {
    // Night sea, stars, and the lighthouse beam.
    g.clear('#0a1024')
    for (let i = 0; i < 40; i++) {
      const x = (i * 53) % 240
      const y = (i * 37) % 100
      if ((this.t + i * 7) % 90 < 80) g.rect(x, y, 1, 1, '#c8d8f8')
    }
    g.rect(0, 120, 240, 40, '#0c1a38')
    for (let i = 0; i < 8; i++) g.rect(((this.t / 2 + i * 31) % 260) - 20, 128 + i * 4, 14, 1, '#1c3460')
    const sweep = Math.sin(this.t / 90)
    for (let k = 0; k < 40; k++) {
      const x = 120 + sweep * k * 4
      g.rect(Math.round(x), 60 + Math.round(k * 0.3), 3, 1, '#f8f0b0')
    }
    let y = this.y
    for (const l of this.lines) {
      const h = this.lineHeight(l)
      if (y > -80 && y < 170) {
        if (l.beast) {
          const img = Art.front(l.beast.species, l.beast.shiny)
          g.image(img, 60, y)
          g.text(displayName(l.beast), 130, y + 22, { color: '#f8f8f8', shadow: '#202848' })
          g.small(`Lv${l.beast.level}`, 130, y + 36, '#a8b8e0')
        } else if (l.text) {
          const color = l.big ? '#f8e070' : '#f8f8f8'
          g.text(l.text, 120 - Math.floor(measure(l.text) / 2), y, { color, shadow: '#202848' })
        }
      }
      y += h
    }
  }
}
