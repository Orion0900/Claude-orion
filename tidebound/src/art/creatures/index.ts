/**
 * Creature art: the public face of src/art/creatures. Every species in
 * src/data/dex.ts gets an original front sprite, back sprite and party icon,
 * all generated in code.
 *
 * CONTRACT — the rest of the game calls only these functions.
 *
 * How it works: each species has a recipe (src/art/creatures/species/) that
 * builds the beast from shaded parts on a Canvas (canvas.ts) in the 64×64
 * front-view frame. The views run the same recipe through a transform: the
 * front is centred with its feet on the ground row, the back is mirrored,
 * enlarged and cropped by the bottom edge (the recipe swaps face details for
 * back details), and the icon is shrunk to fit 32×32. Results are cached:
 * every call with the same arguments returns the same (shared, read-only)
 * buffer.
 */
import { blit, createPixels, type Pixels } from '../../core/pixels'
import type { SpeciesId } from '../../data/dex'
import { Canvas, type View, type Xform } from './canvas'
import { Pal, type Recipe } from './kit'
import { RECIPES } from './species'

/** Battle sprite size: every front and back sprite is exactly this square. */
export const CREATURE_SIZE = 64
/** Party icon size. */
export const ICON_SIZE = 32

/** The bottom row of the front sprite's outline: two clear rows below it. */
const GROUND = 61
const PROBE = 128

const cache = new Map<string, Pixels>()
const xforms = new Map<string, Xform>()

function recipe(id: SpeciesId): Recipe {
  const r = RECIPES[id]
  if (!r) throw new Error(`no creature art for ${id}`)
  return r
}

function render(id: SpeciesId, view: View, shiny: boolean, T: Xform, size: number): Pixels {
  const r = recipe(id)
  const c = new Canvas(size, size, view, T)
  r.draw(c, new Pal(r.shiny, shiny))
  return c.finish()
}

/** Opaque bounding box of a buffer (x1, y1 inclusive). */
export function bounds(p: Pixels): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = p.w
  let y0 = p.h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if (p.data[(y * p.w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return { x0, y0, x1, y1 }
}

/**
 * Renders a view with scale k (mirrored for the back) on a larger canvas and
 * measures it. Returns the transform used and the opaque bounds in that
 * probe's pixel space, so a whole-pixel shift can place it exactly: shifting
 * by whole pixels leaves the rasterized shapes unchanged.
 */
function probe(id: SpeciesId, view: View, k: number, mirror: boolean): { T: Xform; b: { x0: number; y0: number; x1: number; y1: number } } {
  const T = { sx: mirror ? -k : k, sy: k, ox: PROBE / 2 - (mirror ? -k : k) * 32, oy: PROBE / 2 - k * 32 }
  return { T, b: bounds(render(id, view, false, T, PROBE)) }
}

/** Front framing: scaled by the recipe, centred, the lowest pixel on the ground row. */
function frontXform(id: SpeciesId): Xform {
  let T = xforms.get(`f${id}`)
  if (T) return T
  const r = recipe(id)
  const { T: P, b } = probe(id, 'front', r.front?.k ?? 1, false)
  const dx = Math.round(32 + (r.front?.dx ?? 0) - (b.x0 + b.x1 + 1) / 2)
  const dy = GROUND + Math.round(r.front?.dy ?? 0) - b.y1
  T = { ...P, ox: P.ox + dx, oy: P.oy + dy }
  xforms.set(`f${id}`, T)
  return T
}

/**
 * Back framing: mirrored, scaled up to fill the frame (bounded by its width),
 * centred, and cropped at the bottom edge the way the player's side sits.
 */
function backXform(id: SpeciesId): Xform {
  let T = xforms.get(`b${id}`)
  if (T) return T
  const r = recipe(id)
  const fk = r.front?.k ?? 1
  const first = probe(id, 'back', fk, true).b
  const w = first.x1 - first.x0 + 1
  const h = first.y1 - first.y0 + 1
  const k = fk * Math.max(1, Math.min(1.6, 60 / h, 62 / w)) * (r.back?.k ?? 1)
  const { T: P, b } = probe(id, 'back', k, true)
  const bh = b.y1 - b.y0 + 1
  const crop = Math.round(Math.max(3, Math.min(16, bh - 58)) + (r.back?.dy ?? 0))
  const dx = Math.round(32 + (r.back?.dx ?? 0) - (b.x0 + b.x1 + 1) / 2)
  const dy = 63 + crop - b.y1
  T = { ...P, ox: P.ox + dx, oy: P.oy + dy }
  xforms.set(`b${id}`, T)
  return T
}

function iconXform(id: SpeciesId): Xform {
  let T = xforms.get(`i${id}`)
  if (T) return T
  const r = recipe(id)
  const first = probe(id, 'front', 1, false).b
  const fit = r.size === 'S' ? 24 : r.size === 'M' ? 27 : 28
  const size = Math.max(first.x1 - first.x0 - 1, first.y1 - first.y0 - 1)
  let k = r.icon?.k ?? Math.min(0.72, fit / size)
  let pr = probe(id, 'icon', k, false)
  // Keep rows 1..30 free for the bob: shrink if the outline still overflows.
  for (let i = 0; i < 4 && (pr.b.y1 - pr.b.y0 + 1 > 30 || pr.b.x1 - pr.b.x0 + 1 > 32); i++) {
    k *= 0.96
    pr = probe(id, 'icon', k, false)
  }
  const { T: P, b } = pr
  const dx = Math.round(16 + (r.icon?.dx ?? 0) - (b.x0 + b.x1 + 1) / 2)
  const dy = 30 + Math.round(r.icon?.dy ?? 0) - b.y1
  T = { ...P, ox: P.ox + dx, oy: P.oy + dy }
  xforms.set(`i${id}`, T)
  return T
}

/**
 * The foe-side battle sprite, 64×64, transparent background, facing left (toward
 * the player's beast). Feet or lowest point sit a few pixels above the bottom
 * edge so the sprite stands on its platform. `shiny` swaps to the rare colours.
 */
export function creatureFront(id: SpeciesId, shiny = false): Pixels {
  const key = `f${id}${shiny ? 's' : ''}`
  let p = cache.get(key)
  if (!p) {
    p = render(id, 'front', shiny, frontXform(id), CREATURE_SIZE)
    cache.set(key, p)
  }
  return p
}

/**
 * The player-side battle sprite, 64×64: the same beast seen from behind and a
 * little above, facing up and to the right, larger in frame than the front.
 */
export function creatureBack(id: SpeciesId, shiny = false): Pixels {
  const key = `b${id}${shiny ? 's' : ''}`
  let p = cache.get(key)
  if (!p) {
    p = render(id, 'back', shiny, backXform(id), CREATURE_SIZE)
    cache.set(key, p)
  }
  return p
}

/** The 32×32 party-menu icon; frame 1 is the bob of its two-frame idle. */
export function creatureIcon(id: SpeciesId, frame: 0 | 1): Pixels {
  const key = `i${id}${frame}`
  let p = cache.get(key)
  if (!p) {
    if (frame === 0) p = render(id, 'icon', false, iconXform(id), ICON_SIZE)
    else {
      p = createPixels(ICON_SIZE, ICON_SIZE)
      blit(p, creatureIcon(id, 0), 0, -1)
    }
    cache.set(key, p)
  }
  return p
}
