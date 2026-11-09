/**
 * Renders world art into a preview sheet: every tile, every building and the
 * cast of people, in COLOR mode. Output: preview/world.png (gitignored).
 */
import { createPixels, setPx, type Pixels } from '../src/core/pixels'
import { CLEAR, type Sprite } from '../src/engine/gfx'
import { PAL, type Palette } from '../src/engine/palettes'
import { TILE_ART, SLOT } from '../src/art/world/tiles'
import { buildingArt } from '../src/art/world/buildings'
import { PEOPLE, person } from '../src/art/world/people'
import { BUILDING_KINDS, TERRAIN_KINDS } from '../src/world/terrain'
import { sheet, writePng } from './png'

const SLOTPAL: Record<number, Palette> = {
  [SLOT.land]: PAL.land, [SLOT.tree]: PAL.tree, [SLOT.water]: PAL.water, [SLOT.roof]: PAL.roofRed, [SLOT.wood]: PAL.wall,
  [SLOT.roofRed]: PAL.roofRed, [SLOT.roofBlue]: PAL.roofBlue, [SLOT.stone]: PAL.stone, [SLOT.flower]: PAL.flower, [SLOT.sand]: PAL.sand,
  [SLOT.people]: PAL.skin, [SLOT.peopleBlue]: PAL.skinBlue, [SLOT.peopleGreen]: PAL.skinGreen, [SLOT.peoplePurple]: PAL.skinPurple, [SLOT.fx]: PAL.ui,
}

function canvas(w: number, h: number): Pixels {
  const p = createPixels(w, h)
  for (let i = 0; i < w * h; i++) setPx(p, i % w, Math.floor(i / w), 0xffffffff)
  return p
}
function draw(dst: Pixels, s: Sprite, x0: number, y0: number, pal: Palette): void {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const v = s.px[y * s.w + x]
    if (v === CLEAR) continue
    setPx(dst, x0 + x, y0 + y, ((pal[v] << 8) | 0xff) >>> 0)
  }
}
const tiles: Pixels[] = []
for (const k of TERRAIN_KINDS) {
  const p = canvas(16, 16)
  for (const l of TILE_ART[k].layers) draw(p, l.frames[0], 0, 0, SLOTPAL[l.slot])
  tiles.push(p)
}
writePng('preview/tiles.png', sheet(tiles, 12, 2), 4)
const bs: Pixels[] = []
for (const k of BUILDING_KINDS) {
  const a = buildingArt(k)
  const p = canvas(a.layers[0].sprite.w, a.layers[0].sprite.h)
  for (const l of a.layers) draw(p, l.sprite, 0, 0, SLOTPAL[l.slot])
  bs.push(p)
}
writePng('preview/buildings.png', sheet(bs, 5, 4), 3)
const ps: Pixels[] = []
for (const [id, look] of Object.entries(PEOPLE)) {
  const f = person(look).frames
  const pal = [PAL.skin, PAL.skinBlue, PAL.skinGreen, PAL.skinPurple][look.tint ?? 0]
  const p = canvas(16 * 6, 16)
  ;[f.down[0], f.down[1], f.up[0], f.up[1], f.left[0], f.left[1]].forEach((s, i) => draw(p, s, i * 16, 0, pal))
  ps.push(p)
  void id
}
writePng('preview/people.png', sheet(ps, 4, 4), 4)
console.log('wrote preview/tiles.png, buildings.png, people.png')
