/**
 * Renders critter sprites into preview sheets for eyeballing:
 *
 *   npx vite-node scripts/preview-art.ts            # every species with art
 *   npx vite-node scripts/preview-art.ts pandle     # just these
 *
 * Output goes to preview/ (gitignored): critters.png has front, back and
 * icon per species in COLOR mode, with the mono CLASSIC palette alongside.
 */
import { createPixels, setPx, type Pixels } from '../src/core/pixels'
import { CLEAR, type Sprite } from '../src/engine/gfx'
import { MONO, PAL, type Palette } from '../src/engine/palettes'
import { SPECIES, SPECIES_IDS, type SpeciesId } from '../src/data/species'
import { critterBack, critterFront, critterIcon, hasArt } from '../src/art/creatures'
import { sheet, writePng } from './png'

function paint(s: Sprite, pal: Palette, bg = 0xffffff): Pixels {
  const out = createPixels(s.w, s.h)
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const v = s.px[y * s.w + x]
      const c = v === CLEAR ? bg : pal[v]
      setPx(out, x, y, ((c << 8) | 0xff) >>> 0)
    }
  return out
}

function pad(p: Pixels, w: number, h: number, bg = 0xe8e8e8): Pixels {
  const out = createPixels(w, h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(out, x, y, ((bg << 8) | 0xff) >>> 0)
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) setPx(out, x, y, p.data[(y * p.w + x) * 4] << 24 | p.data[(y * p.w + x) * 4 + 1] << 16 | p.data[(y * p.w + x) * 4 + 2] << 8 | 255)
  return out
}

const want = process.argv.slice(2).filter((a) => (SPECIES_IDS as readonly string[]).includes(a)) as SpeciesId[]
const ids = (want.length ? want : SPECIES_IDS).filter(hasArt)
const tiles: Pixels[] = []
for (const id of ids) {
  const pal = PAL[SPECIES[id].pal]
  tiles.push(paint(critterFront(id), pal))
  tiles.push(paint(critterBack(id), pal))
  tiles.push(pad(paint(critterIcon(id), pal), 56, 56))
  tiles.push(paint(critterFront(id), MONO.CLASSIC, MONO.CLASSIC[0]))
}
writePng('preview/critters.png', sheet(tiles, 8), 3)
console.log(`wrote preview/critters.png (${ids.length} species)`)
