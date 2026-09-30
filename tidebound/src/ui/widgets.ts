import type { StatusId } from '../battle/types'
import { TYPE_COLOR, TYPE_NAME, type TypeId } from '../data/types'
import type { Gfx } from '../engine/gfx'
import { measure } from './font'

/** Small pieces shared by the menu screens. */

export function hpColor(frac: number): [string, string] {
  return frac > 0.5 ? ['#58d080', '#38a060'] : frac > 0.2 ? ['#f8c030', '#c89010'] : ['#f05050', '#b83030']
}

/** An HP bar with the little HP label, `w` pixels of fill. */
export function hpBar(g: Gfx, x: number, y: number, hp: number, max: number, w = 48): void {
  g.rect(x - 16, y - 1, w + 18, 5, '#404840')
  g.small('HP', x - 13, y - 1, '#f8c848')
  g.rect(x, y, w, 3, '#586058')
  const frac = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0
  const fill = Math.ceil(frac * w)
  const [c, d] = hpColor(frac)
  if (fill > 0) {
    g.rect(x, y, fill, 3, c)
    g.rect(x, y + 2, fill, 1, d)
  }
}

export const STATUS_COLOR: Record<StatusId, string> = { psn: '#a050b8', tox: '#702888', brn: '#e06030', par: '#d8b020', slp: '#8890a0', frz: '#58b8e0' }
export const STATUS_LABEL: Record<StatusId, string> = { psn: 'PSN', tox: 'PSN', brn: 'BRN', par: 'PAR', slp: 'SLP', frz: 'FRZ' }

export function statusBadge(g: Gfx, x: number, y: number, st: StatusId | null, fainted = false): void {
  if (fainted) {
    g.rect(x, y, 17, 7, '#c03838')
    g.small('FNT', x + 2, y + 1, '#ffffff')
    return
  }
  if (!st) return
  g.rect(x, y, 17, 7, STATUS_COLOR[st])
  g.small(STATUS_LABEL[st], x + 2, y + 1, '#ffffff')
}

/** A coloured type label, 34×11. */
export function typeBadge(g: Gfx, x: number, y: number, t: TypeId): void {
  const [fill, edge] = TYPE_COLOR[t]
  g.rect(x, y, 36, 12, edge)
  g.rect(x + 1, y + 1, 34, 10, fill)
  const label = TYPE_NAME[t]
  // Six letters don't fit at full size; squeeze by drawing tighter.
  g.text(label, x + 18 - Math.floor(measure(label) / 2), y + 1, { color: '#ffffff', shadow: edge })
}

/** A tiled two-tone background for full-screen menus. */
export function menuBackdrop(g: Gfx, a: string, b: string, t = 0): void {
  g.clear(a)
  const off = Math.floor(t / 4) % 16
  for (let y = -16; y < 160; y += 16) for (let x = -16; x < 240; x += 16) if (((x + y) / 16) % 2 === 0) g.rect(x + off, y + off, 8, 8, b)
}

/**
 * Keeps a cursor inside a scrolling list: returns the first visible row
 * for `index` given `rows` visible rows.
 */
export function scrollTop(index: number, top: number, rows: number, count: number): number {
  let t = top
  if (index < t) t = index
  if (index >= t + rows) t = index - rows + 1
  return Math.max(0, Math.min(t, Math.max(0, count - rows)))
}
