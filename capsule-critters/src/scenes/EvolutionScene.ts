import { critterFront } from '../art/creatures'
import { displayName, evolve, learnFree } from '../battle/creature'
import type { Critter } from '../battle/types'
import { movesLearnedAt } from '../data/learn'
import { move as moveData } from '../data/moves'
import { species, type SpeciesId } from '../data/species'
import { MAPS, type Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import { markCaught, type SaveData } from '../game/state'
import { MoveListScene } from './MoveListScene'

/**
 * "What? It's evolving!" The old and new shapes flicker faster and faster
 * until it changes for good. B stops it. Resolves true if it evolved.
 */
export class EvolutionScene extends Modal<boolean> {
  readonly opaque = true
  private showNew = false
  private flash = false
  private cancelled = false
  private canCancel = true

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    private readonly c: Critter,
    private readonly to: SpeciesId,
    /** Coin evolutions can't be stopped. */
    private readonly forced = false,
  ) {
    super()
  }

  enter(): void {
    void this.run()
  }

  private async run(): Promise<void> {
    const g = this.game
    const from = this.c.species
    const oldName = displayName(this.c)
    g.audio.stopMusic(0.3)
    await g.say(`Whoa! ${oldName} is changing!`)
    void g.audio.cry(from)
    g.audio.playMusic('evolution')
    this.flash = true
    // Flicker between the two shapes, faster and faster.
    let gap = 24
    for (let i = 0; i < 26 && !this.cancelled; i++) {
      this.showNew = !this.showNew
      await g.wait(Math.max(2, Math.round(gap)))
      gap *= 0.88
    }
    this.canCancel = false
    if (this.cancelled && !this.forced) {
      this.showNew = false
      this.flash = false
      g.audio.stopMusic(0.2)
      await g.say(`${oldName} settled down and stayed as it was.`)
      this.finish(false)
      return
    }
    this.showNew = true
    this.flash = false
    evolve(this.c, this.to)
    markCaught(this.save, this.to)
    g.audio.stopMusic(0.2)
    void g.audio.cry(this.to)
    await g.wait(30)
    void g.audio.playJingle('evolved')
    await g.say(`${oldName} became ${species(this.to).name}!`)
    for (const m of movesLearnedAt(this.to, this.c.level)) {
      if (this.c.moves.some((s) => s.id === m)) continue
      const name = displayName(this.c)
      if (learnFree(this.c, m)) {
        void g.audio.playJingle('levelUp')
        await g.say(`${name} picked up ${moveData(m).name}!`)
        continue
      }
      await g.say(`${name} wants to learn ${moveData(m).name}, but already knows four moves.`)
      if (await g.ask(`Forget a move for ${moveData(m).name}?`)) {
        const slot = await g.run(new MoveListScene(g, this.c, { title: 'Forget which move?', extra: m }))
        if (slot !== null && slot < 4) {
          const old = moveData(this.c.moves[slot].id).name
          this.c.moves[slot] = { id: m, pp: moveData(m).pp, ups: 0 }
          await g.say(`${name} forgot ${old} and picked up ${moveData(m).name}!`)
          continue
        }
      }
      await g.say(`${name} did not learn ${moveData(m).name}.`)
    }
    this.finish(true)
  }

  update(pad: Pad, top: boolean): void {
    if (top && this.canCancel && !this.forced && pad.pressed('b') && this.flash) this.cancelled = true
  }

  draw(g: Gfx): void {
    const id = this.showNew ? this.to : this.c.species
    g.setPal(1, PAL[species(id).pal])
    g.clear(0, 15)
    g.sprite(critterFront(id), 52, 24, { slot: 1, map: this.flash ? MAPS.black : undefined })
  }
}
