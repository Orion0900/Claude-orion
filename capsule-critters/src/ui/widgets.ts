/**
 * Small pieces shared by the menus: HP bars, status tags, and a scrolling
 * list that handles the cursor, paging and taps.
 */
import type { Gfx } from '../engine/gfx'
import type { Pad } from '../engine/input'
import { PAL, UI_SLOT, type Palette } from '../engine/palettes'
import type { StatusId } from '../data/moves'

export const STATUS_TAG: Readonly<Record<StatusId, string>> = { psn: 'PSN', tox: 'PSN', brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ' }

export function hpPalette(hp: number, max: number): Palette {
  const f = hp / Math.max(1, max)
  return f > 0.5 ? PAL.hpGreen : f > 0.2 ? PAL.hpAmber : PAL.hpRed
}

/** An HP bar `w` wide in palette slot `slot` (set to the HP colour by the caller). */
export function hpBar(g: Gfx, x: number, y: number, w: number, hp: number, max: number, slot: number): void {
  const fill = hp <= 0 ? 0 : Math.max(1, Math.round((hp / Math.max(1, max)) * w))
  g.rect(x - 1, y - 1, w + 2, 5, 3, UI_SLOT)
  g.rect(x, y, w, 3, 0, UI_SLOT)
  g.rect(x, y, fill, 3, 2, slot)
  g.rect(x, y, fill, 1, 1, slot)
}

export interface ListOptions {
  /** Rows visible at once. */
  rows: number
  /** Called for sounds. */
  sound?: (k: 'cursor' | 'select' | 'cancel') => void
  /** Wrap from the bottom to the top. */
  wrap?: boolean
}

/** Cursor and scroll state for a list of `count` entries. */
export class ListState {
  index = 0
  scroll = 0

  constructor(
    public count: number,
    private readonly o: ListOptions,
  ) {}

  /** Handles up/down; returns 'a', 'b' or null. */
  update(pad: Pad): 'a' | 'b' | null {
    const n = this.count
    if (n > 0 && pad.repeat('up')) {
      if (this.index > 0) this.index--
      else if (this.o.wrap) this.index = n - 1
      this.o.sound?.('cursor')
    } else if (n > 0 && pad.repeat('down')) {
      if (this.index < n - 1) this.index++
      else if (this.o.wrap) this.index = 0
      this.o.sound?.('cursor')
    } else if (pad.pressed('a') && n > 0) {
      this.o.sound?.('select')
      return 'a'
    } else if (pad.pressed('b')) {
      this.o.sound?.('cancel')
      return 'b'
    }
    this.clamp()
    return null
  }

  clamp(): void {
    this.index = Math.max(0, Math.min(this.count - 1, this.index))
    if (this.index < this.scroll) this.scroll = this.index
    if (this.index >= this.scroll + this.o.rows) this.scroll = this.index - this.o.rows + 1
    this.scroll = Math.max(0, Math.min(Math.max(0, this.count - this.o.rows), this.scroll))
  }

  /** Visible entries: [list index, row]. */
  visible(): [number, number][] {
    const out: [number, number][] = []
    for (let r = 0; r < this.o.rows; r++) {
      const i = this.scroll + r
      if (i >= this.count) break
      out.push([i, r])
    }
    return out
  }
}

/** Little up/down arrows showing there is more of a list. */
export function scrollArrows(g: Gfx, x: number, yTop: number, yBottom: number, s: ListState, rows: number, frame: number): void {
  if (Math.floor(frame / 20) % 2) return
  if (s.scroll > 0) g.text('↑', x, yTop)
  if (s.scroll + rows < s.count) g.text('↓', x, yBottom)
}
