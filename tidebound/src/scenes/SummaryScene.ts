import { ability, abilityOf } from '../battle/abilities'
import { calcStats, displayName, maxHp, typesOf, xpToNextLevel } from '../battle/creature'
import { natureOf } from '../battle/natures'
import { item as itemData } from '../data/items'
import type { Creature, MoveId } from '../battle/types'
import { dex } from '../data/dex'
import { move as moveData } from '../data/moves'
import { Art } from '../game/art'
import type { Game } from '../game/Game'
import { Modal } from '../game/scene'
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { wrap } from '../ui/font'
import { hpBar, statusBadge, typeBadge } from '../ui/widgets'

const PAGES = ['INFO', 'SKILLS', 'MOVES'] as const

/** How wide an ability description may run in the summary box. */
export const ABILITY_TEXT_W = 128

/**
 * Where move row `i` of `rows` sits on the MOVES page. Five rows (choosing a
 * move to forget) sit closer so the new one stays clear of the details box.
 */
function moveRow(i: number, rows: number): { y: number; h: number } {
  const h = rows > 4 ? 18 : 22
  return { y: (rows > 4 ? 22 : 24) + i * h, h }
}

/**
 * A beast's summary: who it is, its stats and its moves. Left and right turn
 * the page, up and down step through the party. In 'forget' mode it opens on
 * the moves with a fifth, new move, and returns the slot to forget.
 */
export class SummaryScene extends Modal<number | null> {
  readonly opaque = true
  private page = 0
  private moveCursor = 0
  private inspecting = false
  private t = 0

  constructor(
    private readonly game: Game,
    private readonly party: readonly Creature[],
    private index: number,
    private readonly forget?: { move: MoveId },
    private readonly ot?: { name: string; id: number },
  ) {
    super()
    if (forget) {
      this.page = 2
      this.inspecting = true
    }
  }

  private get c(): Creature {
    return this.party[this.index]
  }

  update(pad: Pad, top: boolean): void {
    this.t++
    if (!top) return
    const audio = this.game.audio
    if (this.inspecting) {
      const n = this.c.moves.length + (this.forget ? 1 : 0)
      if (pad.repeat('up')) {
        this.moveCursor = (this.moveCursor + n - 1) % n
        audio.sfx('cursor')
      } else if (pad.repeat('down')) {
        this.moveCursor = (this.moveCursor + 1) % n
        audio.sfx('cursor')
      } else if (pad.pressed('a') && this.forget) {
        audio.sfx('select')
        this.finish(this.moveCursor < this.c.moves.length ? this.moveCursor : null)
      } else if (pad.pressed('b')) {
        audio.sfx('cancel')
        if (this.forget) this.finish(null)
        else this.inspecting = false
      }
      return
    }
    if (pad.pressed('left') && this.page > 0) {
      this.page--
      audio.sfx('cursor')
    } else if (pad.pressed('right') && this.page < PAGES.length - 1) {
      this.page++
      audio.sfx('cursor')
    } else if (pad.pressed('up') && this.party.length > 1) {
      this.index = (this.index + this.party.length - 1) % this.party.length
      audio.sfx('cursor')
      void audio.cry(this.c.species)
    } else if (pad.pressed('down') && this.party.length > 1) {
      this.index = (this.index + 1) % this.party.length
      audio.sfx('cursor')
      void audio.cry(this.c.species)
    } else if (pad.pressed('a') && this.page === 2) {
      this.inspecting = true
      this.moveCursor = 0
      audio.sfx('select')
    } else if (pad.pressed('b') || pad.pressed('a')) {
      audio.sfx('cancel')
      this.finish(null)
    }
  }

  /**
   * Tapping a tab turns to that page and tapping a move shows its details
   * (or, when forgetting, highlights it and then picks it). Other taps do
   * nothing; B closes.
   */
  tap(x: number, y: number): boolean {
    if (this.done) return true
    const audio = this.game.audio
    if (y < 18 && !this.inspecting) {
      const p = Math.floor((x - 8) / 60)
      if (x >= 8 && p >= 0 && p < PAGES.length && p !== this.page) {
        this.page = p
        audio.sfx('cursor')
      }
      return true
    }
    if (this.page !== 2 || x < 100) return true
    const n = this.c.moves.length + (this.forget ? 1 : 0)
    const first = moveRow(0, n)
    const i = Math.floor((y - first.y + 2) / first.h)
    if (y < first.y - 2 || i >= n) {
      if (this.inspecting && !this.forget && y >= 112) {
        audio.sfx('cancel')
        this.inspecting = false
      }
      return true
    }
    if (this.forget && this.moveCursor === i) {
      audio.sfx('select')
      this.finish(i < this.c.moves.length ? i : null)
      return true
    }
    if (!this.inspecting || this.moveCursor !== i) audio.sfx(this.inspecting ? 'cursor' : 'select')
    this.inspecting = true
    this.moveCursor = i
    return true
  }

  draw(g: Gfx): void {
    const c = this.c
    const d = dex(c.species)
    const accent = d.colors[1] ?? '#5890d0'
    g.clear('#e8e8e0')
    // Header.
    g.rect(0, 0, 240, 18, '#384858')
    PAGES.forEach((p, i) => {
      const x = 8 + i * 60
      g.rect(x, 3, 56, 13, i === this.page ? '#f8d048' : '#586878')
      g.text(p, x + 28 - p.length * 3, 5, { color: i === this.page ? '#383020' : '#d0d8e0', shadow: null })
    })
    g.text(`No.${String(d.num).padStart(3, '0')}`, 196, 5, { color: '#f8f8f8', shadow: null })
    // The beast on the left.
    g.rect(0, 18, 96, 142, accent)
    g.rect(4, 22, 88, 86, '#f8f8f0')
    const bob = Math.floor(this.t / 20) % 2
    g.image(Art.front(c.species, c.shiny), 16, 30 + bob)
    g.text(displayName(c), 6, 112, { color: '#ffffff', shadow: '#303030' })
    g.small('Lv', 6, 128, '#ffffff')
    g.small(String(c.level), 16, 128, '#ffffff')
    statusBadge(g, 32, 127, c.status, c.hp <= 0)
    if (c.shiny) g.text('★', 80, 112, { color: '#f8e060', shadow: '#806010' })
    typesOf(c).forEach((t, i) => typeBadge(g, 6 + i * 40, 140, t))

    const x = 104
    if (this.page === 0) {
      const rows: [string, string][] = [
        ['BEAST', d.name],
        ['KIND', `${d.kind}`],
        ['OT', this.ot?.name ?? c.ot],
        ['ID No.', String(this.ot?.id ?? '-----')],
        ['ITEM', c.item ? itemData(c.item).name : 'NONE'],
      ]
      rows.forEach(([k, v], i) => {
        g.text(k, x, 24 + i * 13, { color: '#788088' })
        g.text(v, x + 44, 24 + i * 13)
      })
      g.window(x - 4, 92, 140, 66)
      const nature = `${natureOf(c).name} nature.`
      const memo = c.ot === (this.ot?.name ?? c.ot) ? `Met at ${c.metPlace} at Lv. ${c.metLevel}.` : `Traded. Met at ${c.metPlace}.`
      wrap(`${nature} ${memo} ${c.shiny ? 'It sparkles strangely.' : 'A trusty partner.'}`, 124)
        .slice(0, 4)
        .forEach((l, i) => g.text(l, x + 4, 99 + i * 13))
    } else if (this.page === 1) {
      const s = calcStats(c)
      const mhp = maxHp(c)
      g.text('HP', x, 22)
      g.textRight(`${c.hp}/${mhp}`, 232, 22)
      hpBar(g, x + 40, 34, c.hp, mhp, 88)
      // The stat its nature raises is red, the one it lowers blue.
      const n = natureOf(c)
      const rows: [string, number, keyof typeof s][] = [
        ['ATTACK', s.atk, 'atk'],
        ['DEFENSE', s.def, 'def'],
        ['SP. ATK', s.spa, 'spa'],
        ['SP. DEF', s.spd, 'spd'],
        ['SPEED', s.spe, 'spe'],
      ]
      rows.forEach(([k, v, key], i) => {
        const color = key === n.up ? '#d04040' : key === n.down ? '#3868c8' : undefined
        g.text(k, x, 42 + i * 12, { color })
        g.textRight(String(v), 232, 42 + i * 12)
      })
      g.text('NEXT LV.', x, 103, { color: '#788088' })
      g.textRight(String(xpToNextLevel(c)), 232, 103)
      const a = ability(abilityOf(c))
      g.window(x - 4, 116, 140, 42)
      g.text(a.name, x + 4, 121, { color: '#c04040' })
      wrap(a.desc, ABILITY_TEXT_W)
        .slice(0, 2)
        .forEach((l, i) => g.text(l, x + 4, 132 + i * 12))
    } else {
      const ids: MoveId[] = c.moves.map((m) => m.id)
      if (this.forget) ids.push(this.forget.move)
      ids.forEach((id, i) => {
        const m = moveData(id)
        const { y, h } = moveRow(i, ids.length)
        const sel = this.inspecting && i === this.moveCursor
        if (sel) g.rect(x - 4, y - 2, 140, Math.min(20, h), '#f8e8b0')
        // A line above the move being learned, clear of the PP text over it.
        if (i === c.moves.length) g.rect(x - 4, y - 1, 140, 1, '#a0a0a0')
        typeBadge(g, x, y + 2, m.type)
        g.text(m.name, x + 40, y)
        const pp = i < c.moves.length ? c.moves[i].pp : m.pp
        g.small(`PP ${pp}/${m.pp}`, x + 40, y + 12, '#586068')
      })
      if (this.inspecting) {
        const id = ids[this.moveCursor]
        if (id) {
          const m = moveData(id)
          g.window(0, 112, 240, 48)
          const power = m.power > 0 ? String(m.power) : '---'
          const acc = m.accuracy > 0 ? String(m.accuracy) : '---'
          g.text(`${m.category.toUpperCase()}  POW ${power}  ACC ${acc}`, 10, 118, { color: '#606878' })
          wrap(m.desc, 220)
            .slice(0, 1)
            .forEach((l) => g.text(l, 10, 134))
          if (this.forget) g.text(this.moveCursor < c.moves.length ? 'A: Forget this move' : 'A: Keep old moves', 10, 146, { color: '#c04040', shadow: null })
        }
      } else g.text('A: Move details', x, 140, { color: '#788088' })
    }
  }
}
