/**
 * Renders every creature sprite into preview sheets for eyeballing:
 *
 *   npx vite-node scripts/preview-creatures.ts            # all sheets
 *   npx vite-node scripts/preview-creatures.ts leafolin   # plus a big detail sheet per id
 *
 * Output goes to preview/creatures/ (gitignored):
 *   fronts.png, backs.png, icons.png, shiny.png — every species, zoom 3
 *   lines.png   — front / back / icon / shiny side by side per species
 *   battle-<n>.png — mock 240×160 battle scenes (foe front top-right, own back bottom-left), zoom 3
 *   detail-<id>.png — one species at zoom 6
 */
import { blit, createPixels, fillRect, hex, scale, setPx, type Pixels } from '../src/core/pixels'
import { DEX, SPECIES_IDS, type SpeciesId } from '../src/data/dex'
import { bounds, creatureBack, creatureFront, creatureIcon } from '../src/art/creatures/index'
import { sheet, writePng } from './png'

const OUT = 'preview/creatures'

function safe(f: () => Pixels, w: number): Pixels {
  try {
    return f()
  } catch {
    const p = createPixels(w, w)
    for (let i = 0; i < w; i++) {
      setPx(p, i, i, 0xff0000ff)
      setPx(p, w - 1 - i, i, 0xff0000ff)
    }
    return p
  }
}

/** A tile with a light checker so transparent areas and outlines read. */
function onTile(img: Pixels, bg = 0xf0f4f8ff): Pixels {
  const p = createPixels(img.w, img.h)
  fillRect(p, 0, 0, p.w, p.h, bg)
  blit(p, img, 0, 0)
  return p
}

const ids: SpeciesId[] = [...SPECIES_IDS]
const want = process.argv.slice(2).filter((a) => (SPECIES_IDS as readonly string[]).includes(a)) as SpeciesId[]
const only = want.length ? want : ids

const t0 = performance.now()
const fronts = only.map((id) => safe(() => creatureFront(id), 64))
const t1 = performance.now()
const backs = only.map((id) => safe(() => creatureBack(id), 64))
const icons0 = only.map((id) => safe(() => creatureIcon(id, 0), 32))
const icons1 = only.map((id) => safe(() => creatureIcon(id, 1), 32))
const shinies = only.map((id) => safe(() => creatureFront(id, true), 64))
const shinyBacks = only.map((id) => safe(() => creatureBack(id, true), 64))
console.log(`rendered ${only.length} fronts in ${(t1 - t0).toFixed(1)} ms (${((t1 - t0) / only.length).toFixed(2)} ms each)`)

const suffix = want.length ? '-sel' : ''
writePng(`${OUT}/fronts${suffix}.png`, sheet(fronts.map((f) => onTile(f)), 8), 3)
writePng(`${OUT}/backs${suffix}.png`, sheet(backs.map((f) => onTile(f)), 8), 3)
writePng(`${OUT}/shiny${suffix}.png`, sheet(shinies.map((f) => onTile(f)), 8), 3)
writePng(`${OUT}/icons${suffix}.png`, sheet(icons0.flatMap((f, i) => [onTile(f), onTile(icons1[i])]), 12), 3)

// Per-species rows: front, back, icon ×2, shiny front, shiny back.
const rows: Pixels[] = []
only.forEach((id, i) => {
  const icon2 = scale(onTile(icons0[i]), 2)
  rows.push(onTile(fronts[i]), onTile(backs[i]), icon2, onTile(shinies[i]), onTile(shinyBacks[i]))
})
writePng(`${OUT}/lines${suffix}.png`, sheet(rows, 10), 2)

// Size report.
for (const [i, id] of only.entries()) {
  const b = bounds(fronts[i])
  const bi = bounds(icons0[i])
  const d = DEX.find((e) => e.id === id)!
  console.log(
    `${String(d.num).padStart(2)} ${id.padEnd(12)} front ${b.x1 - b.x0 + 1}×${b.y1 - b.y0 + 1} (x ${b.x0}-${b.x1}, y ${b.y0}-${b.y1})  icon ${bi.x1 - bi.x0 + 1}×${bi.y1 - bi.y0 + 1}`,
  )
}

// Mock battles: foe front top-right, own back bottom-left, text box below.
function battle(foe: Pixels, own: Pixels): Pixels {
  const p = createPixels(240, 160)
  fillRect(p, 0, 0, 240, 160, hex('#f8f8e8'))
  for (let y = 0; y < 112; y++) fillRect(p, 0, y, 240, 1, y < 60 ? hex('#c8e8f8') : hex('#e8f0c8'))
  const ell = (cx: number, cy: number, rx: number, ry: number, c: number, c2: number) => {
    for (let y = -ry; y <= ry; y++)
      for (let x = -rx; x <= rx; x++) {
        const d = (x * x) / (rx * rx) + (y * y) / (ry * ry)
        if (d <= 1) setPx(p, cx + x, cy + y, d > 0.8 ? c2 : c)
      }
  }
  ell(176, 74, 44, 11, hex('#a8d078'), hex('#78a850'))
  ell(72, 110, 52, 12, hex('#a8d078'), hex('#78a850'))
  blit(p, foe, 144, 14)
  blit(p, own, 40, 48)
  fillRect(p, 0, 112, 240, 48, hex('#384858'))
  fillRect(p, 3, 115, 234, 42, hex('#f8f8f8'))
  return p
}
const pairs: [SpeciesId, SpeciesId][] = []
for (let i = 0; i < only.length; i++) pairs.push([only[i], only[(i + Math.max(1, Math.floor(only.length / 2))) % only.length]])
const scenes = pairs.map(([a, b]) => battle(safe(() => creatureFront(a), 64), safe(() => creatureBack(b), 64)))
for (let i = 0; i < scenes.length; i += 4) writePng(`${OUT}/battle${suffix}-${i / 4}.png`, sheet(scenes.slice(i, i + 4), 2, 4), 3)

if (want.length)
  for (const [i, id] of want.entries()) {
    const big = [onTile(fronts[i]), onTile(backs[i]), scale(onTile(icons0[i]), 2), onTile(shinies[i])]
    writePng(`${OUT}/detail-${id}.png`, sheet(big, 4), 6)
  }
console.log('wrote', OUT)
