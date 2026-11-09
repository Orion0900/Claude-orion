/**
 * Buildings, each drawn as one piece over its footprint: a roof layer in the
 * building's own palette slot and a walls layer in the wood slot. CLINICs
 * always wear red roofs with a heart, SHOPs blue roofs with a coin.
 */
import type { Sprite } from '../../engine/gfx'
import { BUILDING_SIZE, type BuildingKind } from '../../world/terrain'
import { Pen } from './draw'
import { SLOT } from './tiles'

export interface BuildingArt {
  layers: { sprite: Sprite; slot: number }[]
}

const HEART = ['_##_##_', '#..#..#', '#.....#', '_#...#_', '__#.#__', '___#___']
const COIN = ['__###__', '_#...#_', '#..#..#', '#.###.#', '#..#..#', '_#...#_', '__###__']
const STAR = ['___#___', '__#.#__', '##...##', '#.....#', '_#...#_', '#..#..#', '##_#_##']

/** A pitched roof filling rows y0..y1 of a w-wide building, shingled. */
function roof(p: Pen, w: number, y0: number, y1: number, inset = 2): void {
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0)
    const pad = Math.round(inset * (1 - t))
    p.hline(pad, y, w - pad * 2, 1)
    p.px(pad, y, 3).px(w - pad - 1, y, 3)
  }
  p.hline(inset, y0, w - inset * 2, 3)
  p.hline(0, y1, w, 3)
  p.hline(1, y1 - 1, w - 2, 2)
  // Shingle courses.
  for (let y = y0 + 3; y < y1 - 1; y += 3) {
    const t = (y - y0) / Math.max(1, y1 - y0)
    const pad = Math.round(inset * (1 - t)) + 1
    p.hline(pad, y, w - pad * 2, 2)
    for (let x = pad + ((y / 3) % 2 ? 1 : 3); x < w - pad; x += 4) p.px(x, y - 1, 2)
  }
  p.hline(inset + 1, y0 + 1, w - inset * 2 - 2, 0)
}

/** Plain plastered walls with an outline. */
function walls(p: Pen, w: number, y0: number, h: number): void {
  p.rect(0, y0, w, h, 0)
  p.box(0, y0, w, h, 3)
  p.hline(1, y0 + h - 2, w - 2, 1)
  p.hline(1, y0 + 1, w - 2, 1)
}

function window(p: Pen, x: number, y: number, w = 10, h = 8): void {
  p.rect(x, y, w, h, 3)
  p.rect(x + 1, y + 1, w - 2, h - 2, 1)
  p.hline(x + 1, y + 1, w - 2, 0)
  p.vline(x + Math.floor(w / 2), y + 1, h - 2, 3)
  p.px(x + 2, y + 2, 0)
}

function door(p: Pen, x: number, y: number, w = 12, h = 14): void {
  p.rect(x, y, w, h, 3)
  p.rect(x + 1, y + 1, w - 2, h - 1, 2)
  p.rect(x + 2, y + 2, w - 4, 4, 1)
  p.px(x + w - 3, y + Math.floor(h / 2) + 1, 0)
}

function stamp(p: Pen, art: readonly string[], x: number, y: number): void {
  p.paste(x, y, art)
}

function house(kind: BuildingKind): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE[kind]
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  const roofEnd = Math.round(h * 0.5)
  walls(base, w, roofEnd - 2, h - roofEnd + 2)
  roof(top, w, 2, roofEnd)
  const dx = d.x * 16 + 2
  door(base, dx, h - 15)
  const wy = roofEnd + 4
  for (let x = 4; x + 10 < w - 2; x += 16) if (Math.abs(x - dx) > 12) window(base, x, wy)
  // A chimney.
  top.rect(w - 14, 0, 6, 8, 3).rect(w - 13, 1, 4, 7, 2)
  return { layers: [{ sprite: base.s, slot: SLOT.wood }, { sprite: top.s, slot: SLOT.roof }] }
}

function clinicOrShop(kind: 'clinic' | 'shop'): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE[kind]
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  const roofEnd = 30
  walls(base, w, roofEnd - 2, h - roofEnd + 2)
  roof(top, w, 4, roofEnd, 3)
  // A sign board on the roof front.
  const sx = Math.round(w / 2) - 7
  top.rect(sx, 12, 14, 12, 3).rect(sx + 1, 13, 12, 10, 0)
  stamp(top, kind === 'clinic' ? HEART : COIN, sx + 3, kind === 'clinic' ? 15 : 14)
  if (kind === 'clinic') top.paste(sx + 3, 15, ['_xx_xx_', 'xooxoox', 'xooooox', '_xooox_', '__xox__', '___x___'])
  // Glass doors and windows.
  const dx = d.x * 16 - 1
  base.rect(dx, h - 16, 18, 16, 3)
  base.rect(dx + 1, h - 15, 7, 15, 1).rect(dx + 10, h - 15, 7, 15, 1)
  base.vline(dx + 2, h - 14, 6, 0).vline(dx + 11, h - 14, 6, 0)
  window(base, 4, roofEnd + 6, 12, 9)
  window(base, w - 16, roofEnd + 6, 12, 9)
  // A stripe above the door in the roof colour.
  top.rect(1, roofEnd + 1, w - 2, 3, 2)
  return { layers: [{ sprite: base.s, slot: SLOT.wood }, { sprite: top.s, slot: kind === 'clinic' ? SLOT.roofRed : SLOT.roofBlue }] }
}

function lab(): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE.lab
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  walls(base, w, 20, h - 20)
  // A flat roof with a parapet and a dish.
  top.rect(0, 12, w, 10, 3).rect(1, 13, w - 2, 8, 1).hline(1, 13, w - 2, 0).hline(1, 19, w - 2, 2)
  top.disc(16, 7, 5, 3).disc(16, 7, 4, 0).disc(17, 8, 2, 1).vline(16, 11, 2, 3)
  for (let x = 6; x < w - 12; x += 16) if (Math.abs(x - d.x * 16) > 14) window(base, x, 28, 12, 9)
  door(base, d.x * 16 + 2, h - 15)
  base.rect(4, 42, w - 8, 2, 1)
  return { layers: [{ sprite: base.s, slot: SLOT.wood }, { sprite: top.s, slot: SLOT.roof }] }
}

function arena(): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE.arena
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  walls(base, w, 28, h - 28)
  // Stone courses.
  for (let y = 34; y < h - 2; y += 6) {
    base.hline(1, y, w - 2, 1)
    for (let x = (y / 6) % 2 ? 4 : 10; x < w - 2; x += 12) base.vline(x, y - 5, 5, 1)
  }
  // A great roof with the medal star.
  roof(top, w, 2, 30, 6)
  const sx = Math.round(w / 2) - 4
  top.rect(sx - 3, 9, 13, 13, 3).rect(sx - 2, 10, 11, 11, 0)
  stamp(top, STAR, sx - 1, 11)
  top.paste(sx - 1, 11, ['___x___', '__xox__', 'xxoooxx', 'xooooox', '_xooox_', 'xooxoox', 'xx_x_xx'])
  // Pillars by the door and a big double door.
  const dx = d.x * 16 - 4
  base.rect(dx - 6, 40, 4, h - 40, 3).rect(dx - 5, 41, 2, h - 41, 1)
  base.rect(dx + 26, 40, 4, h - 40, 3).rect(dx + 27, 41, 2, h - 41, 1)
  base.rect(dx, h - 20, 24, 20, 3).rect(dx + 1, h - 19, 10, 19, 2).rect(dx + 13, h - 19, 10, 19, 2)
  base.px(dx + 9, h - 10, 0).px(dx + 14, h - 10, 0)
  return { layers: [{ sprite: base.s, slot: SLOT.stone }, { sprite: top.s, slot: SLOT.roof }] }
}

function tower(): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE.tower
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  walls(base, w, 22, h - 22)
  for (let y = 30; y < h - 24; y += 18) {
    window(base, 8, y, 8, 10)
    window(base, w - 16, y, 8, 10)
  }
  for (let y = 26; y < h; y += 8) base.hline(1, y, w - 2, 1)
  // A tall pointed roof.
  for (let y = 0; y <= 24; y++) {
    const half = Math.round((y / 24) * (w / 2))
    top.hline(w / 2 - half, y, half * 2, 2)
    top.px(w / 2 - half, y, 3).px(w / 2 + half - 1, y, 3)
  }
  top.hline(0, 24, w, 3)
  door(base, d.x * 16 - 4, h - 16, 12, 16)
  return { layers: [{ sprite: base.s, slot: SLOT.stone }, { sprite: top.s, slot: SLOT.roof }] }
}

function store(): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE.store
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  walls(base, w, 10, h - 10)
  top.rect(0, 4, w, 8, 3).rect(1, 5, w - 2, 6, 2).hline(1, 5, w - 2, 1)
  for (let y = 16; y < h - 20; y += 14) for (let x = 6; x < w - 10; x += 14) window(base, x, y, 10, 9)
  const dx = d.x * 16 - 1
  base.rect(dx, h - 18, 34, 18, 3).rect(dx + 1, h - 17, 15, 17, 1).rect(dx + 18, h - 17, 15, 17, 1)
  base.vline(dx + 2, h - 16, 8, 0).vline(dx + 19, h - 16, 8, 0)
  stamp(top, COIN, Math.round(w / 2) - 3, 0)
  return { layers: [{ sprite: base.s, slot: SLOT.wood }, { sprite: top.s, slot: SLOT.roofBlue }] }
}

function gate(): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE.gate
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  walls(base, w, 16, h - 16)
  top.rect(0, 6, w, 12, 3).rect(1, 7, w - 2, 10, 1).hline(1, 7, w - 2, 0).hline(1, 15, w - 2, 2)
  door(base, d.x * 16 + 2, h - 15)
  window(base, w - 16, 22, 10, 8)
  return { layers: [{ sprite: base.s, slot: SLOT.wood }, { sprite: top.s, slot: SLOT.roof }] }
}

function hall(): BuildingArt {
  const { w: cw, h: ch, door: d } = BUILDING_SIZE.hall
  const w = cw * 16
  const h = ch * 16
  const top = new Pen(w, h)
  const base = new Pen(w, h)
  walls(base, w, 26, h - 26)
  roof(top, w, 0, 28, 10)
  for (let x = 6; x < w - 6; x += 16) {
    base.rect(x, 32, 6, h - 34, 3).rect(x + 1, 33, 4, h - 35, 0).vline(x + 4, 33, h - 35, 1)
  }
  const dx = d.x * 16 - 4
  base.rect(dx, h - 22, 24, 22, 3).rect(dx + 1, h - 21, 22, 21, 2).vline(dx + 12, h - 21, 21, 3)
  stamp(top, STAR, Math.round(w / 2) - 3, 10)
  return { layers: [{ sprite: base.s, slot: SLOT.stone }, { sprite: top.s, slot: SLOT.roof }] }
}

const cache = new Map<BuildingKind, BuildingArt>()

export function buildingArt(kind: BuildingKind): BuildingArt {
  let a = cache.get(kind)
  if (!a) {
    switch (kind) {
      case 'house':
      case 'bigHouse':
        a = house(kind)
        break
      case 'clinic':
      case 'shop':
        a = clinicOrShop(kind)
        break
      case 'lab':
        a = lab()
        break
      case 'arena':
        a = arena()
        break
      case 'tower':
        a = tower()
        break
      case 'store':
        a = store()
        break
      case 'gate':
        a = gate()
        break
      case 'hall':
        a = hall()
        break
    }
    cache.set(kind, a)
  }
  return a
}
