import { critterIcon } from '../art/creatures'
import { displayName, itemWouldWork, maxHp } from '../battle/creature'
import type { ItemId } from '../data/items'
import { canLearnDisc } from '../data/learn'
import { FIELD_MOVES, move as moveData, type FieldMoveId, type MoveId } from '../data/moves'
import { species } from '../data/species'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL } from '../engine/palettes'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { SaveData } from '../game/state'
import { CH, padStart } from '../ui/font'
import { drawBoxText } from '../ui/Dialog'
import { hpBar, hpPalette, STATUS_TAG } from '../ui/widgets'
import { SummaryScene } from './SummaryScene'

export interface PartyOptions {
  /**
   * field: browse, check stats, reorder, use field moves.
   * switch: pick a critter to send into battle (B cancels).
   * forced: must pick a healthy critter (after a faint).
   * pick: choose who gets an item.
   * teach: choose who learns a disc move.
   */
  mode: 'field' | 'switch' | 'forced' | 'pick' | 'teach'
  battle?: boolean
  /** The critter already battling. */
  active?: number
  item?: ItemId
  teach?: MoveId
  prompt?: string
  /** A field move chosen from a critter's menu; resolve true to close the screen. */
  onFieldMove?: (index: number, move: FieldMoveId) => Promise<boolean>
}

const ROW = 16

/** The party screen: up to six critters with icons, levels and HP. */
export class PartyScene extends Modal<number | null> {
  readonly opaque = true
  private index = 0
  /** A critter picked up to swap places with another. */
  private moving: number | null = null
  private busy = false
  private t = 0

  constructor(
    private readonly game: Game,
    private readonly save: SaveData,
    private readonly o: PartyOptions,
  ) {
    super()
    if (o.active !== undefined && o.mode === 'forced') this.index = save.party.findIndex((c) => c.hp > 0)
    this.index = Math.max(0, this.index)
  }

  private get party() {
    return this.save.party
  }

  private prompt(): string {
    if (this.o.prompt) return this.o.prompt
    if (this.moving !== null) return 'Move to where?'
    switch (this.o.mode) {
      case 'forced':
        return 'Bring out which critter?'
      case 'switch':
        return 'Switch to which critter?'
      case 'pick':
        return 'Use on which critter?'
      case 'teach':
        return 'Teach which critter?'
      default:
        return 'Choose a critter.'
    }
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top || this.busy) return
    const n = this.party.length
    if (pad.repeat('up')) {
      this.index = (this.index + n - 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % n
      this.game.audio.sfx('cursor')
    } else if (pad.pressed('a')) {
      this.game.audio.sfx('select')
      void this.choose(this.index)
    } else if (pad.pressed('b')) {
      if (this.moving !== null) {
        this.moving = null
        this.game.audio.sfx('cancel')
      } else if (this.o.mode !== 'forced') {
        this.game.audio.sfx('cancel')
        this.finish(null)
      }
    }
  }

  tap(x: number, y: number): boolean {
    if (this.busy) return true
    const row = Math.floor(y / ROW)
    if (y < 96 && row < this.party.length) {
      this.index = row
      void this.choose(row)
    } else if (y >= 96 && this.o.mode !== 'forced' && this.moving === null) this.finish(null)
    void x
    return true
  }

  private async choose(i: number): Promise<void> {
    const c = this.party[i]
    if (!c) return
    this.busy = true
    try {
      if (this.moving !== null) {
        const from = this.moving
        this.moving = null
        if (from !== i) {
          const p = this.party
          ;[p[from], p[i]] = [p[i], p[from]]
          this.game.audio.sfx('select')
        }
        return
      }
      switch (this.o.mode) {
        case 'forced':
          if (c.hp <= 0) await this.game.say(`${displayName(c)} has no energy left to fight!`)
          else if (i === this.o.active) await this.game.say(`${displayName(c)} is already out!`)
          else this.finish(i)
          return
        case 'pick':
          if (this.o.item && !itemWouldWork(c, this.o.item) && !(this.o.battle === false)) {
            const ok = itemWouldWork(c, this.o.item) || itemData(this.o.item).effect.kind === 'pp' || itemData(this.o.item).effect.kind === 'ppUp' || itemData(this.o.item).effect.kind === 'level' || itemData(this.o.item).effect.kind === 'evolve'
            if (!ok) {
              await this.game.say("It won't have any effect.")
              return
            }
          }
          this.finish(i)
          return
        case 'teach':
          if (this.o.teach && !canLearnDisc(c.species, this.o.teach)) {
            await this.game.say(`${displayName(c)} can't learn ${moveData(this.o.teach).name}.`)
            return
          }
          this.finish(i)
          return
        case 'switch': {
          const k = await this.game.choose(['SWITCH', 'STATS', 'CANCEL'], { prompt: `Do what with ${displayName(c)}?` })
          if (k === 0) {
            if (c.hp <= 0) await this.game.say(`${displayName(c)} has no energy left to fight!`)
            else if (i === this.o.active) await this.game.say(`${displayName(c)} is already out!`)
            else this.finish(i)
          } else if (k === 1) await this.game.run(new SummaryScene(this.game, this.save, i))
          return
        }
        case 'field': {
          const fieldMoves = c.moves.map((m) => m.id).filter((m): m is FieldMoveId => m in FIELD_MOVES)
          const items = [...fieldMoves.map((m) => moveData(m).name), 'STATS', 'SWITCH', 'CANCEL']
          const k = await this.game.choose(items, { prompt: `Do what with ${displayName(c)}?` })
          if (k < fieldMoves.length) {
            if (this.o.onFieldMove && (await this.o.onFieldMove(i, fieldMoves[k]))) this.finish(null)
          } else if (items[k] === 'STATS') await this.game.run(new SummaryScene(this.game, this.save, i))
          else if (items[k] === 'SWITCH') this.moving = i
          return
        }
      }
    } finally {
      this.busy = false
    }
  }

  draw(g: Gfx): void {
    g.clear(0, 15)
    this.party.forEach((c, i) => {
      const y = i * ROW
      const slot = 1 + i
      const sp = species(c.species)
      g.setPal(slot, PAL[c.shiny ? sp.shinyPal : sp.pal])
      g.setPal(8 + i, hpPalette(c.hp, maxHp(c)))
      const bob = i === this.index ? (Math.floor(this.t / 10) % 2 as 0 | 1) : 0
      g.sprite(critterIcon(c.species, bob), 10, y, { slot })
      g.text(displayName(c), 28, y + 1)
      const tag = c.hp <= 0 ? 'FNT' : c.status ? STATUS_TAG[c.status] : null
      if (this.o.mode === 'teach' && this.o.teach) {
        g.text(canLearnDisc(c.species, this.o.teach) ? 'ABLE' : 'NOT ABLE', 88, y + 9)
      } else {
        hpBar(g, 44, y + 11, 48, c.hp, maxHp(c), 8 + i)
        g.textRight(`${padStart(c.hp, 3)}/${padStart(maxHp(c), 3)}`, 160, y + 8)
      }
      g.text(tag ?? `${CH.level}${c.level}`, 120, y + 1)
      if (this.moving === i) g.cursor(0, y + 4, true)
    })
    g.cursor(0, this.index * ROW + 4, false)
    drawBoxText(g, this.prompt())
  }
}

import { item as itemData } from '../data/items'
