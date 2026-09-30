import { displayName, maxHp } from '../battle/creature'
import type { Creature } from '../battle/types'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { hpBar, menuBackdrop, statusBadge } from '../ui/widgets'

export type PartyMode =
  /** From the START menu: look, reorder. */
  | 'field'
  /** In battle, choosing who to send in. */
  | 'battle'
  /** After a faint in battle: someone must go in. */
  | 'forced'
  /** Choosing who an item is for. */
  | 'item'
  /** Choosing who goes into storage, or any one pick. */
  | 'pick'

export interface PartyResult {
  index: number
  action: 'summary' | 'switch' | 'use'
}

/**
 * The party screen: the lead beast in the big panel on the left, the rest
 * stacked on the right, with HP, level and status for each.
 */
export class PartyScene extends Modal<PartyResult | null> {
  readonly opaque = true
  private index = 0
  /** The first pick while reordering. */
  private swapFrom: number | null = null
  private t = 0
  private note: string

  constructor(
    private readonly game: Game,
    private readonly party: Creature[],
    private readonly mode: PartyMode,
    note?: string,
    private readonly subMenu?: (i: number) => Promise<PartyResult['action'] | null>,
    start = 0,
  ) {
    super()
    this.index = Math.min(start, party.length - 1)
    this.note = note ?? (mode === 'item' ? 'Use on which beast?' : mode === 'forced' ? 'Choose a beast to send out.' : 'Choose a beast.')
  }

  setNote(n: string): void {
    this.note = n
  }

  private busy = false

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top || this.busy) return
    const n = this.party.length
    const cancelSlot = this.mode === 'forced' ? -1 : n
    const count = this.mode === 'forced' ? n : n + 1
    const audio = this.game.audio
    if (pad.repeat('up')) {
      this.index = (this.index + count - 1) % count
      audio.sfx('cursor')
    } else if (pad.repeat('down')) {
      this.index = (this.index + 1) % count
      audio.sfx('cursor')
    } else if (pad.pressed('left') && this.index > 0 && this.index < n) {
      this.index = 0
      audio.sfx('cursor')
    } else if (pad.pressed('right') && this.index === 0 && n > 1) {
      this.index = 1
      audio.sfx('cursor')
    } else if (pad.pressed('b')) {
      if (this.swapFrom !== null) {
        this.swapFrom = null
        audio.sfx('cancel')
        return
      }
      if (this.mode === 'forced') return
      audio.sfx('cancel')
      this.finish(null)
    } else if (pad.pressed('a')) {
      if (this.index === cancelSlot) {
        audio.sfx('cancel')
        this.finish(null)
        return
      }
      audio.sfx('select')
      if (this.swapFrom !== null) {
        const a = this.swapFrom
        const b = this.index
        if (a !== b) [this.party[a], this.party[b]] = [this.party[b], this.party[a]]
        this.swapFrom = null
        this.note = 'Choose a beast.'
        return
      }
      if (this.subMenu) {
        this.busy = true
        void this.subMenu(this.index).then((action) => {
          this.busy = false
          if (action === 'switch' && this.mode === 'field') {
            this.swapFrom = this.index
            this.note = 'Move to where?'
            return
          }
          if (action) this.finish({ index: this.index, action })
        })
        return
      }
      this.finish({ index: this.index, action: 'use' })
    }
  }

  /** Where each slot's panel is, for placing sub-menus. */
  slotRect(i: number): { x: number; y: number; w: number; h: number } {
    return i === 0 ? { x: 4, y: 18, w: 84, h: 58 } : { x: 92, y: 2 + (i - 1) * 25, w: 144, h: 23 }
  }

  draw(g: Gfx): void {
    menuBackdrop(g, '#3a8878', '#428f80', this.t)
    this.party.forEach((c, i) => this.drawSlot(g, c, i))
    for (let i = this.party.length; i < 6; i++) {
      if (i === 0) continue
      const r = this.slotRect(i)
      g.panel(r.x, r.y, r.w, r.h, '#5a9888', '#2c6858')
    }
    // Message and CANCEL.
    g.window(0, 128, 186, 32)
    g.text(this.note, 10, 139)
    if (this.mode !== 'forced') {
      const sel = this.index === this.party.length
      g.panel(188, 132, 50, 24, sel ? '#f8e0a0' : '#e8e8e0', sel ? '#c05030' : '#606860')
      g.text('CANCEL', 194, 139)
    }
  }

  private drawSlot(g: Gfx, c: Creature, i: number): void {
    const r = this.slotRect(i)
    const selected = i === this.index
    const swapping = i === this.swapFrom
    const fainted = c.hp <= 0
    const fill = swapping ? '#f8c8a0' : selected ? '#f8f0c0' : fainted ? '#d8b0a8' : '#e8f4f0'
    const edge = selected ? '#e05030' : '#2c5850'
    g.panel(r.x, r.y, r.w, r.h, fill, edge)
    const frame = selected && Math.floor(this.t / 10) % 2 === 1 ? 1 : 0
    const icon = Art.icon(c.species, frame as 0 | 1)
    const mhp = maxHp(c)
    if (i === 0) {
      g.image(icon, r.x + 2, r.y + 2)
      g.text(displayName(c), r.x + 34, r.y + 8)
      g.small('Lv', r.x + 34, r.y + 22, '#404840')
      g.small(String(c.level), r.x + 44, r.y + 22, '#404840')
      statusBadge(g, r.x + 58, r.y + 21, c.status, fainted)
      hpBar(g, r.x + 30, r.y + 38, c.hp, mhp, 48)
      g.smallRight(`${c.hp}/${mhp}`, r.x + 78, r.y + 46, '#404840')
    } else {
      g.image(icon, r.x + 1, r.y - 7)
      g.text(displayName(c), r.x + 34, r.y + 2)
      g.smallRight(`${c.hp}/${mhp}`, r.x + 140, r.y + 5, '#404840')
      g.small('Lv', r.x + 34, r.y + 15, '#404840')
      g.small(String(c.level), r.x + 44, r.y + 15, '#404840')
      statusBadge(g, r.x + 56, r.y + 14, c.status, fainted)
      hpBar(g, r.x + 92, r.y + 16, c.hp, mhp, 48)
    }
  }
}
