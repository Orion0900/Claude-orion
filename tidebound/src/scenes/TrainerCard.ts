import { PLAYER_LOOKS } from '../art/look'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { CH } from '../ui/font'

export const CRESTS = [
  { id: 'crag', name: 'CRAG CREST', color: '#a88858', edge: '#584028' },
  { id: 'spark', name: 'SPARK CREST', color: '#f8d038', edge: '#907010' },
  { id: 'tide', name: 'TIDE CREST', color: '#48a0f0', edge: '#1c5090' },
] as const

export function playTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
}

/** The trainer card: name, ID, money, Beastiary count, time and crests. */
export class TrainerCard extends Modal<void> {
  readonly opaque = true
  private t = 0

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
  ) {
    super()
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (top && (pad.pressed('a') || pad.pressed('b') || pad.pressed('start'))) {
      this.game.audio.sfx('cancel')
      this.finish()
    }
  }

  draw(g: Gfx): void {
    const s = this.save
    g.clear('#203858')
    g.panel(8, 8, 224, 144, '#f0e8d0', '#704828')
    g.rect(12, 12, 216, 18, '#c85838')
    g.text('TRAINER CARD', 18, 16, { color: '#fff8e8', shadow: '#702818' })
    g.text(`ID No.${s.trainerId}`, 144, 16, { color: '#fff8e8', shadow: '#702818' })
    const rows: [string, string][] = [
      ['NAME', s.name],
      ['MONEY', `${CH.shell}${s.money}`],
      ['BEASTIARY', `${s.caught.length}`],
      ['TIME', playTime(s.playSeconds)],
    ]
    rows.forEach(([k, v], i) => {
      g.text(k, 20, 38 + i * 16, { color: '#806850' })
      g.text(v, 92, 38 + i * 16)
    })
    const portrait = Art.portrait(PLAYER_LOOKS[s.lookIndex] ?? PLAYER_LOOKS[0])
    g.image(portrait, 160, 32)
    g.rect(16, 104, 208, 44, '#e0d4b0')
    g.text('CRESTS', 22, 108, { color: '#806850' })
    CRESTS.forEach((c, i) => {
      const x = 84 + i * 46
      const has = s.crests.includes(c.id)
      if (has) {
        g.rect(x + 4, 120, 24, 22, c.edge)
        g.rect(x + 5, 121, 22, 20, c.color)
        g.rect(x + 9, 125, 6, 4, '#ffffff')
      } else {
        g.rect(x + 4, 120, 24, 22, '#c8bc98')
        g.rect(x + 5, 121, 22, 20, '#d8ccac')
      }
    })
  }
}
