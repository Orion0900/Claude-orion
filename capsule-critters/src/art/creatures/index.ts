/**
 * Critter art: the public face of src/art/creatures. Every species gets an
 * original front sprite, back sprite and party icon, all generated in code
 * and all in four shades, so a palette can colour them.
 *
 * Each species has a recipe (species/*.ts) that builds the critter from
 * lit, outlined parts on a Canvas in a 64×64 design frame, facing left. The
 * views run the same recipe through a transform: the front is centred with
 * its feet on the ground row of a 56×56 frame, the back is mirrored, larger
 * and cropped by the bottom edge (the recipe swaps face details for back
 * details), and the icon is shrunk to 16×16. Results are cached.
 */
import { CLEAR, makeSprite, type Sprite } from '../../engine/gfx'
import type { Pixels } from '../../core/pixels'
import type { SpeciesId } from '../../data/species'
import { Canvas, type View, type Xform } from './canvas'
import { Pal, type Recipe } from './kit'
import { RECIPES } from './species'

/** Battle sprites are this square. */
export const CRITTER_SIZE = 56
/** Party icons are this square. */
export const ICON_SIZE = 16

const GROUND = 53
const PROBE = 128

const cache = new Map<string, Sprite>()
const xforms = new Map<string, Xform>()

export function hasArt(id: SpeciesId): boolean {
  return !!RECIPES[id]
}

/** Stand-in art for a species whose recipe isn't written yet: a plain round critter. */
const PLACEHOLDER: Recipe = {
  size: 'M',
  draw(s, p) {
    const body = p.m('light')
    s.ellipse(32, 46, 14, 13, body, { g: 'body' })
    s.circle(22, 32, 9, body, { g: 'head' })
    s.circle(18, 23, 3, body, { g: 'ear1' })
    s.circle(28, 23, 3, body, { g: 'ear2', under: true })
    if (!s.back) {
      s.stamp(p.stamp(['KK', 'KW']), 17, 30)
      s.stamp(p.stamp(['KK', 'KW']), 23, 30)
    }
  },
}

function recipe(id: SpeciesId): Recipe {
  return RECIPES[id] ?? PLACEHOLDER
}

function render(id: SpeciesId, view: View, T: Xform, size: number): Pixels {
  const c = new Canvas(size, size, view, T)
  recipe(id).draw(c, new Pal())
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

function probe(id: SpeciesId, view: View, k: number, mirror: boolean): { T: Xform; b: ReturnType<typeof bounds> } {
  const T = { sx: mirror ? -k : k, sy: k, ox: PROBE / 2 - (mirror ? -k : k) * 32, oy: PROBE / 2 - k * 32 }
  return { T, b: bounds(render(id, view, T, PROBE)) }
}

/** Default front scale by size class: small critters sit smaller in the frame. */
const FRONT_K = { S: 0.74, M: 0.82, L: 0.9 } as const

function frontXform(id: SpeciesId): Xform {
  let T = xforms.get(`f${id}`)
  if (T) return T
  const r = recipe(id)
  let k = r.front?.k ?? FRONT_K[r.size]
  let pr = probe(id, 'front', k, false)
  // Never spill out of the frame.
  for (let i = 0; i < 6 && (pr.b.x1 - pr.b.x0 + 1 > CRITTER_SIZE - 2 || pr.b.y1 - pr.b.y0 + 1 > GROUND); i++) {
    k *= 0.95
    pr = probe(id, 'front', k, false)
  }
  const { T: P, b } = pr
  const dx = Math.round(CRITTER_SIZE / 2 + (r.front?.dx ?? 0) - (b.x0 + b.x1 + 1) / 2)
  const dy = GROUND + Math.round(r.front?.dy ?? 0) - b.y1
  T = { ...P, ox: P.ox + dx, oy: P.oy + dy }
  xforms.set(`f${id}`, T)
  return T
}

function backXform(id: SpeciesId): Xform {
  let T = xforms.get(`b${id}`)
  if (T) return T
  const r = recipe(id)
  const fk = (r.front?.k ?? FRONT_K[r.size]) * 1.15
  const first = probe(id, 'back', fk, true).b
  const w = first.x1 - first.x0 + 1
  const h = first.y1 - first.y0 + 1
  const k = fk * Math.max(0.9, Math.min(1.45, 52 / h, 54 / w)) * (r.back?.k ?? 1)
  const { T: P, b } = probe(id, 'back', k, true)
  const bh = b.y1 - b.y0 + 1
  const crop = Math.round(Math.max(3, Math.min(14, bh - 50)) + (r.back?.dy ?? 0))
  const dx = Math.round(CRITTER_SIZE / 2 + (r.back?.dx ?? 0) - (b.x0 + b.x1 + 1) / 2)
  const dy = CRITTER_SIZE - 1 + crop - b.y1
  T = { ...P, ox: P.ox + dx, oy: P.oy + dy }
  xforms.set(`b${id}`, T)
  return T
}

function iconXform(id: SpeciesId): Xform {
  let T = xforms.get(`i${id}`)
  if (T) return T
  const r = recipe(id)
  const first = probe(id, 'icon', 1, false).b
  const size = Math.max(first.x1 - first.x0 + 1, first.y1 - first.y0 + 1)
  let k = r.icon?.k ?? Math.min(0.32, (r.size === 'S' ? 12 : r.size === 'M' ? 14 : 15) / size)
  let pr = probe(id, 'icon', k, false)
  for (let i = 0; i < 6 && (pr.b.y1 - pr.b.y0 + 1 > 15 || pr.b.x1 - pr.b.x0 + 1 > 16); i++) {
    k *= 0.93
    pr = probe(id, 'icon', k, false)
  }
  const { T: P, b } = pr
  const dx = Math.round(ICON_SIZE / 2 + (r.icon?.dx ?? 0) - (b.x0 + b.x1 + 1) / 2)
  const dy = 15 + Math.round(r.icon?.dy ?? 0) - b.y1
  T = { ...P, ox: P.ox + dx, oy: P.oy + dy }
  xforms.set(`i${id}`, T)
  return T
}

/** RGBA in the four grey shades → a shade sprite. */
export function toSprite(p: Pixels): Sprite {
  const s = makeSprite(p.w, p.h)
  for (let i = 0; i < p.w * p.h; i++) {
    if (p.data[i * 4 + 3] === 0) {
      s.px[i] = CLEAR
      continue
    }
    const lum = p.data[i * 4]
    s.px[i] = lum > 208 ? 0 : lum > 128 ? 1 : lum > 48 ? 2 : 3
  }
  return s
}

function cached(key: string, make: () => Sprite): Sprite {
  let s = cache.get(key)
  if (!s) {
    s = make()
    cache.set(key, s)
  }
  return s
}

/** The foe-side battle sprite: 56×56, facing left, feet on the ground row. */
export function critterFront(id: SpeciesId): Sprite {
  return cached(`f${id}`, () => toSprite(render(id, 'front', frontXform(id), CRITTER_SIZE)))
}

/** The player-side battle sprite: 56×56, seen from behind, facing right. */
export function critterBack(id: SpeciesId): Sprite {
  return cached(`b${id}`, () => toSprite(render(id, 'back', backXform(id), CRITTER_SIZE)))
}

/** The 16×16 party icon; frame 1 bobs up a pixel. */
export function critterIcon(id: SpeciesId, frame: 0 | 1 = 0): Sprite {
  return cached(`i${id}${frame}`, () => {
    const base = toSprite(render(id, 'icon', iconXform(id), ICON_SIZE))
    if (frame === 0) return base
    const s = makeSprite(ICON_SIZE, ICON_SIZE)
    for (let y = 0; y < ICON_SIZE - 1; y++) for (let x = 0; x < ICON_SIZE; x++) s.px[y * ICON_SIZE + x] = base.px[(y + 1) * ICON_SIZE + x]
    return s
  })
}
