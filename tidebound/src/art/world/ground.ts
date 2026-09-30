/**
 * Ground textures and edge blending shared by every terrain tile. Textures
 * are functions of the global pixel position (cell × 16 + offset), so tiles
 * line up seamlessly and vary without ever repeating on the grid. Edges use a
 * per-quadrant signed distance with rounded convex corners.
 */
import type { TerrainKind } from '../../world/terrain'
import { hex, ihash, type Rgba } from './gfx'

export type K = TerrainKind | null
export type Nb = readonly K[]

export const N = 0
export const NE = 1
export const E = 2
export const SE = 3
export const S = 4
export const SW = 5
export const W = 6
export const NW = 7
export const DX = [0, 1, 1, 1, 0, -1, -1, -1] as const
export const DY = [-1, -1, 0, 1, 1, 1, 0, -1] as const

const h = hex

// ---------------------------------------------------------------- palettes

export const GRASS = { hi: h('#98dc70'), lt: h('#80d060'), base: h('#68c050'), sh: h('#52a844'), dk: h('#3e8c36'), lip: h('#2e6c2a') }
export const TALL = { tip: h('#9cdc6c'), hi: h('#6cbc50'), base: h('#3c9838'), sh: h('#2e7e2e'), dk: h('#206024'), out: h('#18481c') }
export const PATH = { hi: h('#f0dcaa'), base: h('#e0c890'), sh: h('#cdb277'), dk: h('#b09460'), rim: h('#c4a468') }
export const SAND = { hi: h('#fff6d4'), base: h('#f4e4a8'), sh: h('#e4d090'), dk: h('#ccb474'), wet: h('#dcc488') }
export const WATER = { foam: h('#f4fcff'), hi: h('#a8d8ff'), lt: h('#78b8f8'), base: h('#4890f0'), sh: h('#3c80e0'), dk: h('#3070d0') }
export const CAVEWATER = { foam: h('#b8d8f0'), hi: h('#88b8e8'), lt: h('#5890d0'), base: h('#3868b0'), sh: h('#305ca0'), dk: h('#284c88') }
export const CLIFF = { hi: h('#ecc088'), lt: h('#dca468'), base: h('#c0864c'), sh: h('#9a6538'), dk: h('#6e4424'), out: h('#46281a') }
export const CAVE = { hi: h('#d4c0a0'), base: h('#b8a080'), sh: h('#9c8466'), dk: h('#7c6850'), glow: h('#c8fff0'), glow2: h('#78e8c8') }
export const CAVEWALL = { hi: h('#a88c70'), base: h('#8a7058'), sh: h('#6c5644'), dk: h('#4e3e32'), top: h('#5c4a3c'), topHi: h('#76604c'), out: h('#2c2018') }
export const FOLIAGE_OUT = h('#203018')

export function isGrassy(k: K): boolean {
  return k === 'grass' || k === 'tallgrass' || k === 'flowers' || k === 'ledgeS' || k === 'ledgeE' || k === 'ledgeW'
}

export function isWatery(k: K): boolean {
  return k === 'water' || k === 'waterRock' || k === 'bridgeH' || k === 'bridgeV' || k === 'pier'
}

export function isCliffy(k: K): boolean {
  return k === 'cliff' || k === 'stairs' || k === 'caveEntrance'
}

/** Outdoor objects drawn on top of whatever ground their neighbours suggest. */
export function isOutdoorObject(k: K): boolean {
  return k === 'tree' || k === 'palm' || k === 'bush' || k === 'rock' || k === 'fence' || k === 'sign' || k === 'mailbox'
}

/** Indoor furniture drawn on the floor its neighbours suggest. */
export function isFurniture(k: K): boolean {
  switch (k) {
    case 'table':
    case 'bed':
    case 'tv':
    case 'bookshelf':
    case 'plant':
    case 'counter':
    case 'pc':
    case 'healer':
    case 'shelf':
    case 'machine':
    case 'crate':
    case 'barrel':
    case 'statue':
    case 'mat':
    case 'rug':
    case 'stairsUp':
    case 'stairsDown':
      return true
  }
  return false
}

export type Ground = 'grass' | 'sand' | 'path' | 'cave' | 'floor' | 'floorTile' | 'deck' | 'pier'

/** What ground a neighbour kind votes for when an object picks its base. */
function vote(k: K): { g: Ground; w: number } | null {
  if (k === null) return null
  if (isGrassy(k)) return { g: 'grass', w: 1 }
  switch (k) {
    case 'sand':
      return { g: 'sand', w: 1 }
    case 'path':
    case 'stairs':
      return { g: 'path', w: 1 }
    case 'water':
    case 'waterRock':
      return { g: 'sand', w: 0.5 }
    case 'pier':
    case 'bridgeH':
    case 'bridgeV':
      return { g: 'pier', w: 0.6 }
    case 'caveFloor':
    case 'caveLadder':
    case 'caveRock':
    case 'caveWater':
      return { g: 'cave', w: 1 }
    case 'floor':
      return { g: 'floor', w: 1 }
    case 'floorTile':
      return { g: 'floorTile', w: 1 }
    case 'deck':
      return { g: 'deck', w: 1 }
  }
  return null
}

const ORDER: readonly Ground[] = ['grass', 'sand', 'path', 'pier', 'cave', 'floor', 'floorTile', 'deck']

/**
 * Picks the ground under an object from the kinds around it. `cells` are the
 * orthogonal neighbours (any subset); `prefer` breaks ties and is the answer
 * when nothing votes.
 */
export function baseFromVotes(cells: readonly K[], prefer: Ground): Ground {
  const tally = new Map<Ground, number>()
  for (const k of cells) {
    const v = vote(k)
    if (v) tally.set(v.g, (tally.get(v.g) ?? 0) + v.w)
  }
  let best: Ground = prefer
  let bestW = tally.get(prefer) ?? 0
  for (const g of ORDER) {
    const w = tally.get(g) ?? 0
    if (w > bestW + 1e-9) {
      best = g
      bestW = w
    }
  }
  return best
}

/** Default ground for an object kind when its neighbours say nothing. */
export function preferredGround(k: TerrainKind): Ground {
  if (k === 'palm') return 'sand'
  if (k === 'crate' || k === 'barrel') return 'floor'
  if (k === 'statue') return 'floorTile'
  if (isFurniture(k)) return 'floor'
  return 'grass'
}

/** The ground an object at this cell stands on. */
export function objectBase(kind: TerrainKind, n: Nb): Ground {
  return baseFromVotes([n[N], n[E], n[S], n[W]], preferredGround(kind))
}

/**
 * Best guess at the ground of neighbour `dir` when it is an object: only the
 * cells we can see around it vote (plus this cell's own ground).
 */
export function neighbourGround(n: Nb, dir: number, self: Ground): Ground | null {
  const k = n[dir]
  if (k === null) return null
  const v = vote(k)
  if (v && k !== 'water' && k !== 'waterRock') return v.g
  if (isOutdoorObject(k) || isFurniture(k)) {
    const dx = DX[dir]
    const dy = DY[dir]
    const known: K[] = []
    // Orthogonal neighbours of (dx, dy) that are also our neighbours or us.
    for (const [ox, oy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const tx = dx + ox
      const ty = dy + oy
      if (tx === 0 && ty === 0) {
        known.push(groundKind(self))
        continue
      }
      if (Math.abs(tx) > 1 || Math.abs(ty) > 1) continue
      const i = dirIndex(tx, ty)
      known.push(n[i])
    }
    return baseFromVotes(known, preferredGround(k))
  }
  return null
}

function groundKind(g: Ground): K {
  switch (g) {
    case 'grass':
      return 'grass'
    case 'sand':
      return 'sand'
    case 'path':
      return 'path'
    case 'cave':
      return 'caveFloor'
    case 'floor':
      return 'floor'
    case 'floorTile':
      return 'floorTile'
    case 'deck':
      return 'deck'
    case 'pier':
      return 'pier'
  }
}

export function dirIndex(dx: number, dy: number): number {
  for (let i = 0; i < 8; i++) if (DX[i] === dx && DY[i] === dy) return i
  return -1
}

// ---------------------------------------------------------------- edges

export interface EdgeHit {
  /** Signed distance in pixels from the edge; > 0 is inside the region. */
  d: number
  /** The neighbour direction whose ground lies outside, or -1. */
  dir: number
  /** Outward normal of the nearest edge (-1, 0, 1). */
  nx: number
  ny: number
}

/**
 * Where pixel (x, y) of a tile sits relative to its region's edge. `same(dir)`
 * says whether that neighbour continues the region; `inset(dir)` how far the
 * outside reaches into this tile along that side; `r` rounds convex corners.
 */
export function edgeAt(
  x: number,
  y: number,
  same: (dir: number) => boolean,
  inset: (dir: number) => number,
  r: number,
): EdgeHit {
  const left = x < 8
  const top = y < 8
  const u = left ? x + 0.5 : 16 - (x + 0.5)
  const v = top ? y + 0.5 : 16 - (y + 0.5)
  const hd = left ? W : E
  const vd = top ? N : S
  const dd = left ? (top ? NW : SW) : top ? NE : SE
  const H = same(hd)
  const V = same(vd)
  const nx = left ? -1 : 1
  const ny = top ? -1 : 1
  if (H && V) {
    if (same(dd)) return { d: 99, dir: -1, nx: 0, ny: 0 }
    const rr = inset(dd)
    return { d: Math.hypot(u, v) - rr, dir: dd, nx, ny }
  }
  if (!H && !V) {
    const ih = inset(hd)
    const iv = inset(vd)
    const cu = ih + r
    const cv = iv + r
    if (u < cu && v < cv) {
      const d = r - Math.hypot(cu - u, cv - v)
      return { d, dir: u - ih < v - iv ? hd : vd, nx, ny }
    }
    const du = u - ih
    const dv = v - iv
    return du < dv ? { d: du, dir: hd, nx, ny: 0 } : { d: dv, dir: vd, nx: 0, ny }
  }
  if (!H) return { d: u - inset(hd), dir: hd, nx, ny: 0 }
  return { d: v - inset(vd), dir: vd, nx: 0, ny }
}

// ---------------------------------------------------------------- textures

/** Grass: flat base with little tufts scattered on a jittered 8-px grid. */
export function grassAt(gx: number, gy: number): Rgba {
  const bx = gx >> 3
  const by = gy >> 3
  const hh = ihash(bx, by, 101)
  const lx = gx & 7
  const ly = gy & 7
  const kind = hh % 10
  if (kind < 5) {
    const ox = 1 + ((hh >>> 4) % 4)
    const oy = 1 + ((hh >>> 8) % 5)
    const tx = lx - ox
    const ty = ly - oy
    if (tx >= 0 && tx < 4 && ty >= 0 && ty < 2) {
      const shape = TUFTS[(hh >>> 12) % TUFTS.length]
      const ch = shape[ty][tx]
      if (ch === 'd') return GRASS.sh
      if (ch === 'l') return GRASS.lt
    }
  } else if (kind === 9 && (hh >>> 16) % 3 === 0) {
    // a rare light speck pair
    const ox = 2 + ((hh >>> 4) % 4)
    const oy = 2 + ((hh >>> 8) % 4)
    if (ly === oy && (lx === ox || lx === ox + 2)) return GRASS.lt
  }
  return GRASS.base
}

const TUFTS: readonly (readonly string[])[] = [
  ['l.l.', 'd.d.'],
  ['.l.l', 'd.d.'],
  ['l..l', '.dd.'],
  ['.l..', 'd.d.'],
]

/** Dirt path: warm tan with small lit pebbles. */
export function pathAt(gx: number, gy: number): Rgba {
  const bx = gx >> 3
  const by = gy >> 3
  const hh = ihash(bx, by, 202)
  const lx = gx & 7
  const ly = gy & 7
  if (hh % 10 < 6) {
    const ox = 1 + ((hh >>> 4) % 5)
    const oy = 1 + ((hh >>> 8) % 5)
    const t = (hh >>> 12) % 3
    if (t === 0) {
      if (lx === ox && ly === oy) return PATH.hi
      if (lx === ox + 1 && ly === oy) return PATH.sh
      if (lx === ox && ly === oy + 1) return PATH.sh
    } else if (t === 1) {
      if (lx === ox && ly === oy) return PATH.sh
    } else {
      if (ly === oy && (lx === ox || lx === ox + 1)) return PATH.hi
      if (ly === oy + 1 && (lx === ox || lx === ox + 1)) return PATH.sh
    }
  }
  return PATH.base
}

/** Sand: pale with sparse little grain clusters. */
export function sandAt(gx: number, gy: number): Rgba {
  const bx = gx >> 3
  const by = gy >> 3
  const hh = ihash(bx, by, 303)
  const lx = gx & 7
  const ly = gy & 7
  if (hh % 10 < 5) {
    const ox = 1 + ((hh >>> 4) % 5)
    const oy = 1 + ((hh >>> 8) % 5)
    const t = (hh >>> 12) % 3
    if (t === 0) {
      if ((lx === ox && ly === oy) || (lx === ox + 2 && ly === oy + 1)) return SAND.sh
    } else if (t === 1) {
      if (lx === ox && ly === oy) return SAND.sh
      if (lx === ox + 1 && ly === oy) return SAND.hi
    } else {
      if (lx === ox && ly === oy) return SAND.hi
      if (lx === ox + 1 && ly === oy + 1) return SAND.sh
    }
  }
  return SAND.base
}

const SWAY = [0, 1, 2, 1] as const

/** Open water: wavelets on a jittered grid that sway with the frame. */
export function waterAt(gx: number, gy: number, frame: number, pal = WATER): Rgba {
  const bw = 16
  const bh = 8
  const bx = Math.floor(gx / bw)
  const by = gy >> 3
  const lx = gx - bx * bw
  const ly = gy & 7
  const hh = ihash(bx, by, 404)
  // Wavelet: a short bright crest with a darker trough under it.
  const len = 3 + ((hh >>> 4) % 3) + (frame % 2)
  const ox = 1 + ((hh >>> 8) % (bw - len - 4)) + SWAY[frame % 4]
  const oy = 1 + ((hh >>> 12) % (bh - 3))
  if (ly === oy && lx >= ox && lx < ox + len) return lx === ox || lx === ox + len - 1 ? pal.lt : pal.hi
  if (ly === oy + 1 && lx >= ox - 1 && lx < ox + len - 1 && (hh >>> 16) % 2 === 0) return pal.sh
  // Second, fainter ripple in some blocks.
  if ((hh >>> 20) % 3 === 0) {
    const ox2 = (ox + 7) % (bw - 3)
    const oy2 = (oy + 4) % bh
    const l2 = 2 + ((frame + 1) % 2)
    if (ly === oy2 && lx >= ox2 && lx < ox2 + l2) return pal.lt
  }
  return pal.base
}

/** Cave floor: dusty stone with pebbles and the odd glowing speck. */
export function caveAt(gx: number, gy: number): Rgba {
  const bx = gx >> 3
  const by = gy >> 3
  const hh = ihash(bx, by, 505)
  const lx = gx & 7
  const ly = gy & 7
  const t = hh % 16
  const ox = 1 + ((hh >>> 4) % 5)
  const oy = 1 + ((hh >>> 8) % 5)
  if (t < 5) {
    // pebble: lit top-left, dark bottom-right
    if (lx === ox && ly === oy) return CAVE.hi
    if (lx === ox + 1 && ly === oy) return CAVE.sh
    if (lx === ox && ly === oy + 1) return CAVE.sh
    if (lx === ox + 1 && ly === oy + 1) return CAVE.dk
  } else if (t < 9) {
    if (lx === ox && ly === oy) return CAVE.sh
    if (lx === ox + 2 && ly === oy + 1) return CAVE.sh
  } else if (t === 9) {
    // a hairline crack
    if (ly === oy && lx >= ox && lx <= ox + 2) return CAVE.sh
    if (ly === oy + 1 && lx === ox + 3) return CAVE.sh
  } else if (t === 10 && (hh >>> 16) % 3 === 0) {
    if (lx === ox && ly === oy) return CAVE.glow
    if ((lx === ox + 1 && ly === oy) || (lx === ox && ly === oy + 1)) return CAVE.glow2
  }
  return CAVE.base
}

/**
 * Natural rock for cliff faces and cave walls: packed boulders (a jittered
 * cell pattern) each lit along its top-left rim and shaded at its
 * bottom-right, with dark cracks between them.
 */
export function rockFaceAt(
  gx: number,
  gy: number,
  pal: { hi: Rgba; base: Rgba; sh: Rgba; dk: Rgba; lt?: Rgba },
  seed: number,
): Rgba {
  const cw = 11
  const chh = 8
  const bx = Math.floor(gx / cw)
  const by = Math.floor(gy / chh)
  let best = 1e9
  let second = 1e9
  let fx = 0
  let fy = 0
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const cx = bx + ox
      const cy = by + oy
      const hh = ihash(cx, cy, seed)
      // rows of boulders shift sideways so the pattern never lines up
      const px = cx * cw + (cy & 1) * 5 + 1 + (hh % 7)
      const py = cy * chh + 1 + ((hh >>> 4) % 5)
      const dx = (gx + 0.5 - px) * 0.85
      const dy = gy + 0.5 - py
      const d = dx * dx + dy * dy
      if (d < best) {
        second = best
        best = d
        fx = dx
        fy = dy
      } else if (d < second) second = d
    }
  const edge = Math.sqrt(second) - Math.sqrt(best)
  if (edge < 0.9) return pal.dk
  const s = fx * 0.6 + fy * 0.8
  if (edge < 1.9 && s < 0) return pal.lt ?? pal.hi
  if (s < -3) return pal.hi
  if (edge < 1.9 && s > 0) return pal.sh
  if (s > 3.2) return pal.sh
  return pal.base
}

// ---------------------------------------------------------------- floors

const WOOD = { hi: h('#ecc28a'), base: h('#dcaa70'), sh: h('#cc985e'), seam: h('#b07c48') }
const TILEF = { a: h('#f6f4ee'), b: h('#e6eaee'), hi: h('#ffffff'), grout: h('#c4c8d4'), sh: h('#d4d8e0') }
const DECK = { hi: h('#b89a70'), base: h('#9c7e58'), sh: h('#846646'), seam: h('#54402c'), nail: h('#3c3030'), stain: h('#8a7050') }
const PIERW = { hi: h('#e8c890'), base: h('#c89c60'), sh: h('#a07440'), seam: h('#704c28') }

function planks(gx: number, gy: number, pal: { hi: Rgba; base: Rgba; sh: Rgba; seam: Rgba }, seed: number, weather = false): Rgba {
  const row = gy >> 2
  const ly = gy & 3
  if (ly === 3) return pal.seam
  const off = ihash(row, 0, seed) % 24
  const len = 24
  const lx = (((gx + off) % len) + len) % len
  if (lx === 0) return pal.seam
  if (lx === 1 && ly < 2) return pal.hi
  if (ly === 0 && lx < 12) return pal.hi
  if (weather) {
    const hh = ihash((gx + off) >> 3, row, seed + 5)
    if (hh % 9 === 0 && ly === 1 && ((gx + off) & 7) === 3) return DECK.nail
    if (hh % 7 === 0 && ly === 2) return DECK.stain
  }
  if (ly === 2 && ihash(gx >> 2, row, seed + 1) % 4 === 0) return pal.sh
  return pal.base
}

/** Floor textures by global pixel (also used for furniture bases). */
export function floorAt(g: Ground, gx: number, gy: number): Rgba {
  switch (g) {
    case 'floorTile': {
      const lx = gx & 7
      const ly = gy & 7
      if (lx === 7 || ly === 7) return TILEF.grout
      const odd = ((gx >> 3) + (gy >> 3)) & 1
      if (ly === 0 || lx === 0) return TILEF.hi
      if (ly === 6 || lx === 6) return odd ? TILEF.sh : TILEF.b
      return odd ? TILEF.b : TILEF.a
    }
    case 'deck':
      return planks(gx, gy, DECK, 31, true)
    case 'pier':
      return planks(gx, gy, PIERW, 41)
    default:
      return planks(gx, gy, WOOD, 21)
  }
}

