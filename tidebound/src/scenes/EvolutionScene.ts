import { displayName, evolve, learnMove } from '../battle/creature'
import type { Creature } from '../battle/types'
import { dex, type SpeciesId } from '../data/dex'
import { move as moveData } from '../data/moves'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import type { Scene } from '../game/scene'
import { markCaught, type SaveData } from '../game/state'
import { tinted, type Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { SummaryScene } from './SummaryScene'

/**
 * "What? X is evolving!" — the old and new shapes flicker faster and faster
 * as white silhouettes until the new one bursts through. B stops it.
 */
export class EvolutionScene implements Scene {
  readonly opaque = true
  private showNew = false
  private white = false
  private flash = 0
  private t = 0
  private stars: { x: number; y: number; vx: number; vy: number; life: number }[] = []

  constructor(
    private readonly game: Game,
    private readonly c: Creature,
    private readonly into: SpeciesId,
  ) {}

  /** Plays the evolution; resolves true if it happened. */
  async play(save: SaveData): Promise<boolean> {
    const g = this.game
    const from = this.c.species
    const oldName = displayName(this.c)
    g.audio.stopMusic(0.3)
    await g.fadeIn(16)
    await g.audio.cry(from)
    await g.say(`What? ${oldName} is evolving!`)
    g.audio.playMusic('evolution')
    this.white = true
    let cancelled = false
    // Flicker between the two shapes, speeding up.
    let gap = 24
    for (let k = 0; k < 18 && !cancelled; k++) {
      this.showNew = !this.showNew
      for (let i = 0; i < gap; i++) {
        if (g.input.pressed('b')) cancelled = true
        await g.wait(1)
      }
      gap = Math.max(3, Math.round(gap * 0.82))
    }
    if (cancelled) {
      this.showNew = false
      this.white = false
      g.audio.stopMusic(0.2)
      await g.say(`Huh? ${oldName} stopped evolving!`)
      return false
    }
    this.showNew = true
    this.flash = 30
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      this.stars.push({ x: 120, y: 72, vx: Math.cos(a) * 2.5, vy: Math.sin(a) * 2.5, life: 40 })
    }
    await g.wait(20)
    this.white = false
    const result = evolve(this.c, this.into)
    markCaught(save, this.into)
    g.audio.stopMusic(0.1)
    await g.audio.cry(this.into)
    await g.audio.playJingle('evolved')
    await g.say(`Congratulations! Your ${oldName} evolved into ${dex(this.into).name}!`)
    for (const id of result?.newMoves ?? []) await learnFlow(g, save, this.c, id)
    return true
  }

  update(_pad: Pad, _top: boolean): void {
    this.t++
    if (this.flash > 0) this.flash--
    for (const s of this.stars) {
      s.x += s.vx
      s.y += s.vy
      s.life--
    }
    this.stars = this.stars.filter((s) => s.life > 0)
  }

  draw(g: Gfx): void {
    // A dark, softly pulsing backdrop.
    g.clear('#101828')
    for (let r = 0; r < 6; r++) {
      const pulse = (Math.sin(this.t / 20 + r) + 1) / 2
      g.rect(0, 20 + r * 16, 240, 8, pulse > 0.5 ? '#182438' : '#142030')
    }
    const species = this.showNew ? this.into : this.c.species
    const base = Art.front(species, this.c.shiny)
    const img = this.white ? tinted(base, '#f8f8f8') : base
    g.image(img, 88, 32)
    for (const s of this.stars) g.rect(Math.round(s.x), Math.round(s.y), 2, 2, '#f8f0a0')
    if (this.flash > 0) g.overlay('#ffffff', this.flash / 30)
  }
}

/**
 * Teaching a move outside battle: learned outright with room, otherwise the
 * player picks one to forget (or gives up).
 */
export async function learnFlow(game: Game, save: SaveData, c: Creature, id: string): Promise<void> {
  const name = displayName(c)
  const mv = moveData(id).name
  if (c.moves.some((m) => m.id === id)) return
  if (c.moves.length < 4) {
    learnMove(c, id)
    void game.audio.playJingle('itemGet')
    await game.say(`${name} learned ${mv}!`)
    return
  }
  await game.say(`${name} wants to learn ${mv}.\fBut ${name} already knows four moves.`)
  for (;;) {
    if (await game.ask(`Forget a move to make room for ${mv}?`)) {
      const party = [c]
      const slot = await game.run(new SummaryScene(game, party, 0, { move: id }, { name: save.name, id: save.trainerId }))
      if (slot !== null) {
        const old = moveData(c.moves[slot].id).name
        learnMove(c, id, slot)
        await game.say(`1, 2 and… … … Poof!\f${name} forgot ${old}.\fAnd… ${name} learned ${mv}!`)
        return
      }
    }
    if (await game.ask(`Stop learning ${mv}?`)) {
      await game.say(`${name} did not learn ${mv}.`)
      return
    }
  }
}
