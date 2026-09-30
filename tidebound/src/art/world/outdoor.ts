/**
 * Outdoor and cave terrain tiles. Each draw function paints one opaque 16×16
 * cell given its eight neighbours and its global origin (gx0, gy0).
 */
import {
  CAVE,
  CAVEWALL,
  CAVEWATER,
  CLIFF,
  DX,
  DY,
  E,
  FOLIAGE_OUT,
  GRASS,
  N,
  PATH,
  S,
  SAND,
  TALL,
  W,
  WATER,
  caveAt,
  edgeAt,
  floorAt,
  grassAt,
  isCliffy,
  isGrassy,
  isFurniture,
  isWatery,
  neighbourGround,
  objectBase,
  pathAt,
  rockFaceAt,
  sandAt,
  waterAt,
  type Ground,
  type K,
  type Nb,
} from './ground'
import {
  createPixels,
  hex,
  ihash,
  inEllipse,
  mixc,
  outlineOf,
  setPx,
  getPx,
  type Pixels,
  type Rgba,
} from './gfx'

const h = hex

export interface Cell {
  p: Pixels
  n: Nb
  gx0: number
  gy0: number
  frame: number
}

// ---------------------------------------------------------------- ground

const PRIORITY: Partial<Record<Ground, number>> = { grass: 0, sand: 1, path: 2 }

/** The texture colour of a ground at a global pixel. */
export function groundColor(g: Ground, gx: number, gy: number): Rgba {
  switch (g) {
    case 'grass':
      return grassAt(gx, gy)
    case 'sand':
      return sandAt(gx, gy)
    case 'path':
      return pathAt(gx, gy)
    case 'cave':
      return caveAt(gx, gy)
    case 'floor':
    case 'floorTile':
    case 'deck':
    case 'pier':
      return floorAt(g, gx, gy)
  }
}

/** Ground of a neighbour cell for blending purposes (null = no blend). */
function blendGround(n: Nb, dir: number, self: Ground): Ground | null {
  const k = n[dir]
  if (k === null) return null
  if (isGrassy(k)) return 'grass'
  if (k === 'sand') return 'sand'
  if (k === 'path') return 'path'
  if (isWatery(k) || isCliffy(k)) return null
  return neighbourGround(n, dir, self)
}

/**
 * Paints a ground over the whole cell, letting lower-priority neighbours
 * (grass under sand, sand or grass under path) reach in with soft rounded
 * edges, lipped and shadowed as if the path were worn slightly lower.
 */
export function paintGround(c: Cell, g: Ground): void {
  const { p, n, gx0, gy0 } = c
  const pr = PRIORITY[g]
  if (pr === undefined || pr === 0) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(p, x, y, groundColor(g, gx0 + x, gy0 + y))
    return
  }
  const og: (Ground | null)[] = []
  for (let d = 0; d < 8; d++) {
    const b = blendGround(n, d, g)
    og.push(b !== null && (PRIORITY[b] ?? 99) < pr ? b : null)
  }
  const same = (d: number): boolean => og[d] === null
  const inset = (): number => 2
  const tileHash = ihash(gx0 >> 4, gy0 >> 4, 404)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const gx = gx0 + x
      const gy = gy0 + y
      const hit = edgeAt(x, y, same, inset, 3)
      // Straight edges wander a little in the middle of the cell.
      if (hit.d < 3 && (hit.nx === 0) !== (hit.ny === 0)) {
        const t = hit.nx === 0 ? x : y
        const prof = WOBBLE[(tileHash >>> (hit.dir * 2)) % WOBBLE.length]
        hit.d -= prof[t]
      }
      if (hit.d > 1) {
        setPx(p, x, y, groundColor(g, gx, gy))
        continue
      }
      const shadowSide = hit.ny < 0 || hit.nx < 0
      const outer = hit.dir >= 0 ? og[hit.dir] ?? 'grass' : 'grass'
      if (hit.d > 0) {
        // Rim just inside: shadow under the higher ground's lip.
        const base = groundColor(g, gx, gy)
        const rim = g === 'path' ? PATH.sh : SAND.sh
        setPx(p, x, y, shadowSide ? rim : base)
        continue
      }
      if (hit.d > -1) {
        // The lip of the higher ground.
        let lip: Rgba
        if (outer === 'grass') lip = shadowSide ? GRASS.dk : GRASS.lt
        else if (outer === 'sand') lip = shadowSide ? SAND.sh : SAND.base
        else lip = PATH.dk
        setPx(p, x, y, lip)
        continue
      }
      setPx(p, x, y, groundColor(outer, gx, gy))
    }
}

/** Bumps along straight edges, zero near the corners so cells join cleanly. */
const WOBBLE: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, -1, -1, -1, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
]

export function drawPlainGround(c: Cell, g: Ground): void {
  paintGround(c, g)
}

// ---------------------------------------------------------------- tall grass & flowers

/** One clump of the tall-grass scale pattern (8×8); rows stagger by 4 px. */
const TG_CLUMP = ['kkktkkkk', 'ktkhtktk', 'thtbhtdt', 'hbhbbhdd', 'hbbbbddh', 'hbbbdddb', 'bdddddkd', 'kkkkkkKk']
const TG_PAL: Record<string, Rgba> = { K: TALL.out, k: TALL.dk, d: TALL.sh, b: TALL.base, h: TALL.hi, t: TALL.tip }

/** The tall-grass character at (x, y) of a 16×16 cell. */
function tgChar(x: number, y: number): string {
  const row = TG_CLUMP[y & 7]
  const shift = y >= 8 ? 4 : 0
  return row[(x + shift) & 7]
}

export function drawTallGrass(c: Cell): void {
  const { p, n, gx0, gy0 } = c
  const tallN = n[N] === 'tallgrass'
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ch = tgChar(x, y)
      // Tips poke up into open lawn along the patch's top edge.
      if (!tallN && y < 3 && (ch === 'k' || ch === 'K' || (y === 0 && ch !== 't'))) {
        setPx(p, x, y, grassAt(gx0 + x, gy0 + y))
        continue
      }
      setPx(p, x, y, TG_PAL[ch])
    }
}

/** Front blades of tall grass drawn over a standing character's feet. */
export function tallGrassOverlay(frame: number): Pixels {
  void frame
  const p = createPixels(16, 16)
  for (let y = 8; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ch = tgChar(x, y)
      if (y < 11 && (ch === 'k' || ch === 'K')) continue
      setPx(p, x, y, TG_PAL[ch])
    }
  return p
}

const FLOWER_COLS: readonly (readonly [string, string, string])[] = [
  ['#f85850', '#c83038', '#f8e068'],
  ['#f8f8f8', '#c8d0e0', '#f8c840'],
  ['#f8d838', '#d8a020', '#f07830'],
  ['#f898c8', '#d06098', '#f8e068'],
]

function paintFlower(p: Pixels, x: number, y: number, pal: readonly [string, string, string], lean: number): void {
  const pe = h(pal[0])
  const ps = h(pal[1])
  const ce = h(pal[2])
  // leaves
  setPx(p, x, y + 4, GRASS.dk)
  setPx(p, x + 1, y + 4, GRASS.sh)
  setPx(p, x + 3, y + 4, GRASS.dk)
  setPx(p, x + 2, y + 4, GRASS.dk)
  const hx = x + lean
  // a round four-petal bloom with a two-pixel heart
  setPx(p, hx + 1, y, pe)
  setPx(p, hx + 2, y, pe)
  setPx(p, hx, y + 1, pe)
  setPx(p, hx + 1, y + 1, ce)
  setPx(p, hx + 2, y + 1, ce)
  setPx(p, hx + 3, y + 1, ps)
  setPx(p, hx, y + 2, pe)
  setPx(p, hx + 1, y + 2, ce)
  setPx(p, hx + 2, y + 2, ps)
  setPx(p, hx + 3, y + 2, ps)
  setPx(p, hx + 1, y + 3, ps)
  setPx(p, hx + 2, y + 3, ps)
}

export function drawFlowers(c: Cell): void {
  paintGround(c, 'grass')
  const { p, gx0, gy0, frame } = c
  const hh = ihash(gx0 >> 4, gy0 >> 4, 77)
  const a = FLOWER_COLS[hh % 4]
  const b = FLOWER_COLS[(hh >>> 3) % 4]
  const sway = [0, 1, 0, -1][frame % 4]
  // clear tufts where the blooms sit so they read cleanly
  for (const [fx, fy] of [
    [1, 2],
    [9, 9],
  ] as const)
    for (let yy = fy - 1; yy < fy + 6; yy++) for (let xx = fx - 1; xx < fx + 6; xx++) setPx(p, xx, yy, GRASS.base)
  paintFlower(p, 1, 2, a, sway)
  paintFlower(p, 9, 9, b, -sway)
  // a couple of buds
  setPx(p, 11, 3, h(a[0]))
  setPx(p, 11, 4, GRASS.dk)
  setPx(p, 4, 11, h(b[0]))
  setPx(p, 4, 12, GRASS.dk)
}

// ---------------------------------------------------------------- water

function landInset(n: Nb, dir: number): number {
  const k = n[dir]
  if (k === 'sand') return 3
  if (isCliffy(k)) return 0
  return 2
}

function landGround(n: Nb, dir: number): Ground | 'rock' {
  const k = n[dir]
  if (k === 'sand') return 'sand'
  if (k === 'path') return 'path'
  if (isCliffy(k)) return 'rock'
  if (isGrassy(k)) return 'grass'
  if (k === 'caveFloor' || k === 'caveLadder' || k === 'caveRock' || k === 'caveWall') return 'cave'
  const g = neighbourGround(n, dir, 'sand')
  return g ?? 'grass'
}

const FOAM_SHIFT = [0, 1, 2, 1] as const

/** Whether neighbour `d` has pier planks beside it (among the cells we can see). */
function touchesPier(n: Nb, d: number): boolean {
  const dx = DX[d]
  const dy = DY[d]
  for (const [ox, oy] of [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ] as const) {
    const tx = dx + ox
    const ty = dy + oy
    if ((tx === 0 && ty === 0) || Math.abs(tx) > 1 || Math.abs(ty) > 1) continue
    for (let i = 0; i < 8; i++) if (DX[i] === tx && DY[i] === ty && (n[i] === 'pier' || isFurniture(n[i]))) return true
  }
  return false
}

/** Water with shorelines: a strip of the neighbouring land, foam and shallows. */
export function paintWater(c: Cell, cave: boolean): void {
  const { p, n, gx0, gy0, frame } = c
  const pal = cave ? CAVEWATER : WATER
  const same = (d: number): boolean => {
    const k = n[d]
    if (k === null) return true
    if (cave) return k === 'caveWater'
    if (isWatery(k)) return true
    // cargo standing on a pier is part of the pier
    return isFurniture(k) && touchesPier(n, d)
  }
  const inset = (d: number): number => (cave ? (n[d] === 'caveWall' ? 0 : 2) : landInset(n, d))
  const shift = FOAM_SHIFT[frame % 4]
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const gx = gx0 + x
      const gy = gy0 + y
      const hit = edgeAt(x, y, same, inset, 3)
      if (hit.d >= 4) {
        setPx(p, x, y, waterAt(gx, gy, frame, pal))
        continue
      }
      if (hit.d <= 0) {
        const lg = landGround(n, hit.dir)
        let col: Rgba
        if (lg === 'rock') col = CLIFF.dk
        else if (hit.d > -1) {
          col = lg === 'sand' ? SAND.wet : lg === 'grass' ? h('#8c7448') : lg === 'path' ? PATH.dk : lg === 'cave' ? CAVE.dk : h('#6c5038')
        } else if (hit.d > -2 && lg === 'grass') col = GRASS.dk
        else col = groundColor(lg, gx, gy)
        setPx(p, x, y, col)
        continue
      }
      // foam line moving up and down the shore
      const f = hit.d - shift * 0.5
      let col: Rgba
      if (f > 0 && f <= 1) col = pal.foam
      else if (hit.d <= 1) col = pal.hi
      else if (f <= 2.5) col = pal.lt
      else col = waterAt(gx, gy, frame, pal)
      setPx(p, x, y, col)
    }
}

// ---------------------------------------------------------------- ledges

const LEDGE = [h('#a8e078'), h('#78c458'), h('#5aa844'), h('#4a9438'), h('#3a7c30'), h('#285a24')]

export function drawLedge(c: Cell, dir: 'S' | 'E' | 'W'): void {
  paintGround(c, 'grass')
  const { p, n } = c
  const kind = dir === 'S' ? 'ledgeS' : dir === 'E' ? 'ledgeE' : 'ledgeW'
  if (dir === 'S') {
    const contW = n[W] === kind
    const contE = n[E] === kind
    for (let x = 0; x < 16; x++) {
      // round the ends of a ledge run
      let top = 8
      if (!contW && x < 3) top += [4, 2, 1][x]
      if (!contE && x > 12) top += [1, 2, 4][x - 13]
      for (let y = top; y < 16; y++) {
        const k = y - top
        let col: Rgba
        if (k === 0) col = LEDGE[0]
        else if (k === 1) col = LEDGE[1]
        else if (k === 2 || k === 3) col = (x + (k === 3 ? 1 : 0)) % 4 === 0 ? LEDGE[4] : LEDGE[2 + (k - 2)]
        else if (k === 4) col = LEDGE[4]
        else if (k === 5) col = LEDGE[5]
        else col = GRASS.sh
        if (y === 15 && k > 6) col = GRASS.base
        setPx(p, x, y, col)
      }
      if (top > 8) setPx(p, x, top - 1, GRASS.dk)
    }
    return
  }
  const east = dir === 'E'
  const contN = n[N] === kind
  const contS = n[S] === kind
  for (let y = 0; y < 16; y++) {
    let len = 6
    if (!contN && y < 3) len -= [4, 2, 1][y]
    if (!contS && y > 12) len -= [1, 2, 4][y - 13]
    for (let k = 0; k < len; k++) {
      const x = east ? 10 + k : 5 - k
      let col: Rgba
      if (k === 0) col = LEDGE[0]
      else if (k === 1) col = east ? LEDGE[3] : LEDGE[1]
      else if (k === 2) col = east ? ((y & 3) === 0 ? LEDGE[5] : LEDGE[4]) : (y & 3) === 0 ? LEDGE[3] : LEDGE[2]
      else if (k === 3) col = east ? LEDGE[4] : LEDGE[4]
      else if (k === 4) col = LEDGE[5]
      else col = GRASS.sh
      setPx(p, x, y, col)
    }
  }
}

// ---------------------------------------------------------------- foliage (trees, bushes)

interface Clump {
  x: number
  y: number
  r: number
  pal: readonly Rgba[]
}

const TREE_PAL = [h('#80c858'), h('#58b048'), h('#3c9440'), h('#2a7432'), h('#1e5628')]
const BUSH_PAL = [h('#a0dc70'), h('#78c458'), h('#58a846'), h('#3e8a3a'), h('#2c6a2e')]
const TRUNK = [h('#c89058'), h('#a06838'), h('#7c4c28'), h('#56341c')]

const TREE_CLUMPS: readonly (readonly [number, number, number])[] = [
  [8, 4.6, 4.2],
  [4.4, 6.8, 3.8],
  [11.6, 6.8, 3.8],
  [8, 7.8, 4.0],
  [5.0, 9.8, 3.4],
  [11.0, 9.8, 3.4],
]

const BUSH_CLUMPS: readonly (readonly [number, number, number])[] = [
  [8, 7.4, 4.2],
  [4.6, 9.6, 3.6],
  [11.4, 9.6, 3.6],
  [8, 10.4, 3.8],
]

function clumpColor(cl: Clump, px: number, py: number): Rgba {
  const nx = (px + 0.5 - cl.x) / cl.r
  const ny = (py + 0.5 - cl.y) / cl.r
  const rr = Math.sqrt(nx * nx + ny * ny)
  const lit = -(nx * 0.62 + ny * 0.78)
  const P = cl.pal
  if (rr > 0.82 && lit < -0.1) return P[4]
  if (lit > 0.55 && rr > 0.45) return P[0]
  if (lit > 0.1) return P[1]
  if (lit > -0.45) return P[2]
  return P[3]
}

function inClump(cl: Clump, px: number, py: number): boolean {
  const dx = px + 0.5 - cl.x
  const dy = py + 0.5 - cl.y
  return dx * dx + dy * dy <= cl.r * cl.r
}

/**
 * All clumps of the trees that may touch this cell, in global paint order.
 * Each crown keeps its rounded top; it fills down to the cell edge when a tree
 * stands below it (hiding its trunk) and out to the side toward tree
 * neighbours, so a forest reads as rows of round crowns. Every extension that
 * can reach this cell depends only on cells this cell can see.
 */
function foliageClumps(n: Nb, isSame: (k: K) => boolean, shape: readonly (readonly [number, number, number])[], pal: readonly Rgba[], grow: boolean): Clump[] {
  const out: Clump[] = []
  const at = (dx: number, dy: number): boolean => {
    if (dx === 0 && dy === 0) return true
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return false
    for (let d = 0; d < 8; d++) if (DX[d] === dx && DY[d] === dy) return isSame(n[d])
    return false
  }
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!at(dx, dy)) continue
      const ox = dx * 16
      const oy = dy * 16
      for (const [x, y, r] of shape) out.push({ x: x + ox, y: y + oy, r, pal })
      if (!grow) continue
      const w = at(dx - 1, dy)
      const e = at(dx + 1, dy)
      const s = at(dx, dy + 1)
      if (w) out.push({ x: ox + 1, y: oy + 8, r: 3.8, pal })
      if (e) out.push({ x: ox + 15, y: oy + 8, r: 3.8, pal })
      if (s) {
        out.push({ x: ox + 4.5, y: oy + 13.5, r: 4, pal })
        out.push({ x: ox + 11.5, y: oy + 13.5, r: 4, pal })
        if (w) out.push({ x: ox + 1, y: oy + 13, r: 4, pal })
        if (e) out.push({ x: ox + 15, y: oy + 13, r: 4, pal })
      }
    }
  out.sort((a, b) => a.y - b.y || a.x - b.x)
  return out
}

function paintFoliage(c: Cell, base: Ground, clumps: Clump[], trunk: boolean, shadow: boolean, enclosed: (x: number, y: number) => boolean = () => false): void {
  const { p, gx0, gy0 } = c
  const inTrunk = (x: number, y: number): boolean => trunk && x >= 6 && x <= 9 && y >= 11 && y <= 15
  // topmost clump index per pixel over an 18×18 window (one pixel of margin)
  const tops = new Int16Array(18 * 18).fill(-1)
  for (let i = 0; i < clumps.length; i++) {
    const cl = clumps[i]
    const x0 = Math.max(-1, Math.floor(cl.x - cl.r))
    const x1 = Math.min(16, Math.ceil(cl.x + cl.r))
    const y0 = Math.max(-1, Math.floor(cl.y - cl.r))
    const y1 = Math.min(16, Math.ceil(cl.y + cl.r))
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inClump(cl, x, y)) tops[(y + 1) * 18 + x + 1] = i
  }
  const topAt = (x: number, y: number): number => (x < -1 || y < -1 || x > 16 || y > 16 ? -1 : tops[(y + 1) * 18 + x + 1])
  const union = (x: number, y: number): boolean => topAt(x, y) >= 0 || inTrunk(x, y)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const ti = topAt(x, y)
      const top: Clump | null = ti >= 0 ? clumps[ti] : null
      if (inTrunk(x, y) && (top === null || top.y < 12)) {
        const col = y === 11 || (y === 12 && (x === 6 || x === 9)) ? TRUNK[3] : x === 6 ? TRUNK[0] : x === 9 ? TRUNK[2] : y === 15 ? TRUNK[2] : TRUNK[1]
        setPx(p, x, y, col)
        continue
      }
      if (top) {
        setPx(p, x, y, clumpColor(top, x, y))
        continue
      }
      // shadowed hollows between crowns inside a forest
      if (enclosed(x, y)) {
        const edge = union(x - 1, y) || union(x + 1, y) || union(x, y - 1) || union(x, y + 1)
        setPx(p, x, y, edge ? FOLIAGE_OUT : TREE_PAL[4])
        continue
      }
      if (union(x - 1, y) || union(x + 1, y) || union(x, y - 1) || union(x, y + 1)) {
        setPx(p, x, y, trunk && x >= 5 && x <= 10 && y >= 11 ? TRUNK[3] : FOLIAGE_OUT)
        continue
      }
      let g = groundColor(base, gx0 + x, gy0 + y)
      if (shadow && y >= 13 && inEllipse(x, y, 8, 15, 6, 2.2)) g = mixc(g, h('#1c4020'), 0.35)
      setPx(p, x, y, g)
    }
}

export function drawTree(c: Cell): void {
  const base = objectBase('tree', c.n)
  // off the map the forest simply carries on
  const isTree = (k: K): boolean => k === 'tree' || k === null
  const t = (d: number): boolean => isTree(c.n[d])
  const clumps = foliageClumps(c.n, isTree, TREE_CLUMPS, TREE_PAL, true)
  // a hollow is enclosed when trees stand on both sides of its corner
  const enclosed = (x: number, y: number): boolean => {
    const hd = x < 8 ? W : E
    const vd = y < 8 ? N : S
    return t(hd) && t(vd)
  }
  paintFoliage(c, base, clumps, !t(S), !t(S), enclosed)
}

export function drawBush(c: Cell): void {
  const base = objectBase('bush', c.n)
  const clumps = foliageClumps(c.n, (k) => k === 'bush', BUSH_CLUMPS, BUSH_PAL, false)
  // hedges: bridge sideways only
  const same = (d: number): boolean => c.n[d] === 'bush'
  if (same(E)) clumps.push({ x: 16, y: 9, r: 4.2, pal: BUSH_PAL })
  if (same(W)) clumps.push({ x: 0, y: 9, r: 4.2, pal: BUSH_PAL })
  clumps.sort((a, b) => a.y - b.y || a.x - b.x)
  // only keep clumps from this row so hedges stay one row tall
  const row = clumps.filter((cl) => cl.y > 0 && cl.y < 16)
  paintFoliage(c, base, row, false, true)
  // a few berries
  const hh = ihash(c.gx0 >> 4, c.gy0 >> 4, 91)
  if (hh % 3 === 0) {
    const berry = h('#f06070')
    const bx = 4 + (hh >>> 4) % 7
    const by = 7 + (hh >>> 8) % 4
    if (getPx(c.p, bx, by) !== FOLIAGE_OUT) setPx(c.p, bx, by, berry)
    if (getPx(c.p, bx + 3, by + 2) !== FOLIAGE_OUT) setPx(c.p, bx + 3, by + 2, berry)
  }
}

// ---------------------------------------------------------------- palm

const FROND = [h('#a8e070'), h('#70c050'), h('#48a040'), h('#2e7a32')]
const PALM_TRUNK = [h('#e0b880'), h('#c09058'), h('#98683c'), h('#6c4828')]

type Pt = readonly [number, number]

/**
 * One palm frond: a quadratic curve from the crown, thick in the middle,
 * lit along its upper edge, with its own outline so overlapping fronds part.
 */
function frond(dst: Pixels, p0: Pt, p1: Pt, p2: Pt, width: number): void {
  const layer = createPixels(16, 16)
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = (1 - t) * (1 - t)
    const b = 2 * (1 - t) * t
    const cc = t * t
    const x = a * p0[0] + b * p1[0] + cc * p2[0]
    const y = a * p0[1] + b * p1[1] + cc * p2[1]
    // tangent and the normal that points up
    const tx = 2 * (1 - t) * (p1[0] - p0[0]) + 2 * t * (p2[0] - p1[0])
    const ty = 2 * (1 - t) * (p1[1] - p0[1]) + 2 * t * (p2[1] - p1[1])
    const len = Math.hypot(tx, ty) || 1
    let nx = -ty / len
    let ny = tx / len
    if (ny > 0) {
      nx = -nx
      ny = -ny
    }
    const w = 0.55 + width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7)
    for (let k = -w; k <= w; k += 0.35) {
      const px = Math.floor(x + nx * k)
      const py = Math.floor(y + ny * k)
      const col = k > w * 0.35 ? FROND[0] : k > -w * 0.35 ? FROND[1] : FROND[2]
      if ((getPx(layer, px, py) & 255) === 0 || col === FROND[0]) setPx(layer, px, py, col)
    }
  }
  // leaflet notches along the underside
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (getPx(layer, x, y) === FROND[2] && (getPx(layer, x, y + 1) & 255) === 0 && (x + y) % 2 === 0) setPx(layer, x, y + 1, FROND[3])
  const out = outlineLayer(layer, FOLIAGE_OUT)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const col = getPx(out, x, y)
      if ((col & 255) !== 0) setPx(dst, x, y, col)
    }
}

export function drawPalm(c: Cell): void {
  const base = objectBase('palm', c.n)
  paintGround(c, base)
  const { p } = c
  const layer = createPixels(16, 16)
  // shadow on the ground
  for (let y = 13; y < 16; y++)
    for (let x = 2; x < 15; x++)
      if (inEllipse(x, y, 8.5, 15.2, 5.5, 1.8)) setPx(p, x, y, mixc(getPx(p, x, y), h('#604818'), 0.3))
  // trunk: gently curved and ringed, with its own outline
  const trunk = createPixels(16, 16)
  for (let y = 6; y <= 15; y++) {
    const t = (15 - y) / 9
    const cx = Math.round(7 + 1.6 * t * t)
    const ring = (y & 1) === 0
    setPx(trunk, cx - 1, y, ring ? PALM_TRUNK[1] : PALM_TRUNK[0])
    setPx(trunk, cx, y, ring ? PALM_TRUNK[2] : PALM_TRUNK[1])
    setPx(trunk, cx + 1, y, ring ? PALM_TRUNK[3] : PALM_TRUNK[2])
  }
  const tr = outlineLayer(trunk, FOLIAGE_OUT)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const col = getPx(tr, x, y)
      if ((col & 255) !== 0) setPx(layer, x, y, col)
    }
  // back fronds, coconuts, then the fronds in front
  frond(layer, [8, 5], [6, 0.8], [3, 2.2], 0.9)
  frond(layer, [9, 5], [11.5, 0.6], [14, 2.6], 0.9)
  const nut = [h('#b07840'), h('#7c4c24'), h('#4c2c14')]
  for (const [x, y] of [
    [7, 6],
    [10, 6],
  ] as const) {
    setPx(layer, x, y, nut[0])
    setPx(layer, x + 1, y, nut[1])
    setPx(layer, x, y + 1, nut[1])
    setPx(layer, x + 1, y + 1, nut[2])
  }
  frond(layer, [8, 5], [3, 2], [0.5, 8], 1.1)
  frond(layer, [9, 5], [14, 1.6], [15.5, 7.5], 1.1)
  frond(layer, [8, 6], [5, 6.5], [2.5, 11], 0.8)
  frond(layer, [9, 6], [12, 6.2], [14, 10.5], 0.8)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const col = getPx(layer, x, y)
      if ((col & 255) !== 0) setPx(p, x, y, col)
    }
}

/** Outline an object layer: trunk-coloured edges get a brown outline, leaves green. */
function outlineLayer(layer: Pixels, out: Rgba): Pixels {
  const res = createPixels(16, 16)
  res.data.set(layer.data)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if ((getPx(layer, x, y) & 255) !== 0) continue
      let src = 0
      for (const [ax, ay] of [
        [x, y + 1],
        [x, y - 1],
        [x - 1, y],
        [x + 1, y],
      ] as const) {
        const col = getPx(layer, ax, ay)
        if ((col & 255) !== 0) {
          src = col
          break
        }
      }
      if (src === 0) continue
      setPx(res, x, y, isGreenish(src) ? out : outlineOf(src, 0.16))
    }
  return res
}

function isGreenish(c: Rgba): boolean {
  const r = c >>> 24
  const g = (c >>> 16) & 255
  const b = (c >>> 8) & 255
  return g > r + 20 && g > b
}

/** Composites an object layer (with its own outline) over the cell. */
export function compositeObject(c: Cell, layer: Pixels, out: Rgba | null): void {
  const src = out === null ? layer : outlineLayer(layer, out)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const col = getPx(src, x, y)
      if ((col & 255) !== 0) setPx(c.p, x, y, col)
    }
}

// ---------------------------------------------------------------- rocks

const STONE = [h('#e8e4dc'), h('#c8c0b8'), h('#a09890'), h('#787070'), h('#484048')]

function paintBoulder(layer: Pixels, cx: number, cy: number, rx: number, ry: number, pal: readonly Rgba[]): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      // flattened bottom
      const d = nx * nx + (ny > 0 ? ny * ny * 1.6 : ny * ny)
      if (d > 1) continue
      const lit = -(nx * 0.6 + ny * 0.8)
      let col = pal[1]
      if (lit > 0.5 && d > 0.25) col = pal[0]
      else if (lit < -0.55) col = pal[3]
      else if (lit < -0.1) col = pal[2]
      setPx(layer, x, y, col)
    }
}

export function drawRock(c: Cell): void {
  const base = objectBase('rock', c.n)
  paintGround(c, base)
  const layer = createPixels(16, 16)
  paintBoulder(layer, 8, 9, 6.6, 5.6, STONE)
  // crack
  setPx(layer, 8, 6, STONE[3])
  setPx(layer, 9, 7, STONE[3])
  setPx(layer, 9, 8, STONE[2])
  setPx(layer, 5, 10, STONE[2])
  setPx(layer, 6, 11, STONE[2])
  shadowUnder(c, 8, 14.5, 6.5, 1.6)
  compositeObject(c, layer, STONE[4])
}

function shadowUnder(c: Cell, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (inEllipse(x, y, cx, cy, rx, ry)) setPx(c.p, x, y, mixc(getPx(c.p, x, y), h('#203020'), 0.3))
}

export function drawWaterRock(c: Cell): void {
  paintWater(c, false)
  const layer = createPixels(16, 16)
  paintBoulder(layer, 8, 8.5, 6.2, 5.2, STONE)
  // wet dark band at the waterline
  for (let x = 0; x < 16; x++)
    for (let y = 10; y < 14; y++) if ((getPx(layer, x, y) & 255) !== 0 && (getPx(layer, x, y + 1) & 255) === 0) setPx(layer, x, y, STONE[3])
  setPx(layer, 7, 5, STONE[3])
  setPx(layer, 8, 6, STONE[3])
  compositeObject(c, layer, STONE[4])
  // foam ring
  const foam = WATER.foam
  const f = c.frame % 2
  for (let x = 1; x < 15; x++) {
    const y = 14 - (x === 1 || x === 14 ? 1 : 0)
    if ((x + f) % 3 !== 0) setPx(c.p, x, y, foam)
  }
  setPx(c.p, 0, 11 + f, foam)
  setPx(c.p, 15, 12 - f, foam)
}

// ---------------------------------------------------------------- fences, signs, mailbox

const FENCE = [h('#f0d8a8'), h('#d0a868'), h('#a87c44'), h('#7a5430'), h('#48301c')]

export function drawFence(c: Cell): void {
  const base = objectBase('fence', c.n)
  paintGround(c, base)
  const { n } = c
  const f = (d: number): boolean => n[d] === 'fence'
  const layer = createPixels(16, 16)
  const rail = (x0: number, x1: number, y: number): void => {
    for (let x = x0; x <= x1; x++) {
      setPx(layer, x, y, FENCE[0])
      setPx(layer, x, y + 1, FENCE[2])
    }
  }
  if (f(W)) {
    rail(0, 7, 5)
    rail(0, 7, 9)
  }
  if (f(E)) {
    rail(8, 15, 5)
    rail(8, 15, 9)
  }
  if (f(N)) for (let y = 0; y < 6; y++) {
    setPx(layer, 7, y, FENCE[0])
    setPx(layer, 8, y, FENCE[2])
  }
  if (f(S)) for (let y = 10; y < 16; y++) {
    setPx(layer, 7, y, FENCE[1])
    setPx(layer, 8, y, FENCE[2])
  }
  // the post
  for (let y = 3; y <= 13; y++) {
    setPx(layer, 6, y, FENCE[0])
    setPx(layer, 7, y, FENCE[1])
    setPx(layer, 8, y, FENCE[1])
    setPx(layer, 9, y, FENCE[2])
  }
  setPx(layer, 7, 2, FENCE[0])
  setPx(layer, 8, 2, FENCE[1])
  setPx(layer, 6, 13, FENCE[2])
  setPx(layer, 7, 13, FENCE[2])
  setPx(layer, 8, 13, FENCE[3])
  setPx(layer, 9, 13, FENCE[3])
  if (!f(S)) shadowUnder(c, 8, 15, 4, 1.2)
  compositeObject(c, layer, FENCE[4])
}

const SIGN = [h('#f4d8a0'), h('#dcb070'), h('#b88848'), h('#8c6030'), h('#4c3018')]

export function drawSign(c: Cell): void {
  const base = objectBase('sign', c.n)
  paintGround(c, base)
  const layer = createPixels(16, 16)
  // post
  for (let y = 10; y <= 14; y++) {
    setPx(layer, 7, y, SIGN[2])
    setPx(layer, 8, y, SIGN[3])
  }
  // board
  for (let y = 2; y <= 10; y++)
    for (let x = 2; x <= 13; x++) {
      let col = SIGN[1]
      if (y === 2 || x === 2) col = SIGN[0]
      if (y === 10 || x === 13) col = SIGN[3]
      if (y === 9 && x > 2 && x < 13) col = SIGN[2]
      setPx(layer, x, y, col)
    }
  // text lines
  const ink = SIGN[3]
  for (let x = 4; x <= 11; x++) if (x !== 8) setPx(layer, x, 5, ink)
  for (let x = 4; x <= 9; x++) setPx(layer, x, 7, ink)
  shadowUnder(c, 8, 15, 3.5, 1.1)
  compositeObject(c, layer, SIGN[4])
}

export function drawMailbox(c: Cell): void {
  const base = objectBase('mailbox', c.n)
  paintGround(c, base)
  const layer = createPixels(16, 16)
  const hh = ihash(c.gx0 >> 4, c.gy0 >> 4, 61) % 3
  const box = [
    [h('#f8a090'), h('#e85850'), h('#b83838'), h('#6c1c20')],
    [h('#a8d0ff'), h('#5890e8'), h('#3860c0'), h('#1c2c68')],
    [h('#f8f0e0'), h('#e0d8c8'), h('#b0a898'), h('#484050')],
  ][hh]
  for (let y = 9; y <= 14; y++) {
    setPx(layer, 7, y, SIGN[2])
    setPx(layer, 8, y, SIGN[3])
  }
  // box with a rounded top, seen from the front-left
  for (let y = 3; y <= 9; y++)
    for (let x = 3; x <= 12; x++) {
      if (y === 3 && (x === 3 || x === 12)) continue
      let col = box[1]
      if (y === 3 || (y === 4 && x > 3 && x < 12)) col = box[0]
      if (x === 12 || y === 9) col = box[2]
      if (x === 3) col = box[0]
      setPx(layer, x, y, col)
    }
  // mail slot and flag
  for (let x = 5; x <= 9; x++) setPx(layer, x, 6, box[3])
  setPx(layer, 13, 3, h('#f8d040'))
  setPx(layer, 13, 4, h('#f8d040'))
  setPx(layer, 14, 3, h('#e8a020'))
  setPx(layer, 13, 5, h('#a0a0a0'))
  setPx(layer, 13, 6, h('#a0a0a0'))
  shadowUnder(c, 8, 15, 4, 1.1)
  compositeObject(c, layer, box[3])
}

// ---------------------------------------------------------------- cliffs, stairs, cave entrance

function rimGround(n: Nb): Ground {
  const k = n[N]
  if (k === 'sand') return 'sand'
  if (k === 'path') return 'path'
  return 'grass'
}

/** Rock face with a grassy lip on top, dark base and side edges from neighbours. */
export function paintCliffFace(c: Cell, pal = CLIFF, seed = 7, cave = false): void {
  const { p, n, gx0, gy0 } = c
  const isWall = (k: K): boolean => (cave ? k === 'caveWall' : isCliffy(k))
  const up = isWall(n[N])
  const down = isWall(n[S])
  const left = isWall(n[W])
  const right = isWall(n[E])
  const top = rimGround(n)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const gx = gx0 + x
      const gy = gy0 + y
      let col = rockFaceAt(gx, gy, pal, seed)
      // lip depth varies along the edge
      const lip = 2 + (ihash(gx >> 1, 0, 13) % 2)
      if (!up) {
        if (y < lip - 1) col = cave ? CAVEWALL.top : groundColor(top, gx, gy)
        else if (y === lip - 1) col = cave ? CAVEWALL.topHi : top === 'grass' ? GRASS.lt : top === 'sand' ? SAND.hi : PATH.hi
        else if (y === lip) col = cave ? CAVEWALL.out : top === 'grass' ? GRASS.lip : CLIFF.out
        else if (y === lip + 1) col = pal.hi
      }
      if (!down) {
        if (y === 15) col = cave ? CAVEWALL.out : CLIFF.out
        else if (y === 14) col = pal.dk
      }
      if (!left && x === 0 && (up || y > lip)) col = cave ? CAVEWALL.out : CLIFF.out
      if (!right && x === 15 && (up || y > lip)) col = cave ? CAVEWALL.out : CLIFF.out
      if (!left && x === 1 && (up || y > lip + 1) && y < 14) col = pal.lt ?? pal.hi
      if (!right && x === 14 && (up || y > lip + 1) && y < 14) col = pal.sh
      // rounded top corners
      if (!up && ((!left && x < 2) || (!right && x > 13)) && y <= lip + 1) {
        const edgeX = !left && x < 2 ? x : 15 - x
        if (edgeX + (y - lip) < 1) col = cave ? CAVEWALL.top : groundColor(top, gx, gy)
        else if (edgeX === 0 || y === lip) col = cave ? CAVEWALL.out : CLIFF.out
      }
      setPx(p, x, y, col)
    }
}

export function drawCliff(c: Cell): void {
  paintCliffFace(c)
}

const STEP = [h('#f0e8d8'), h('#d8ccb4'), h('#b0a088'), h('#887860'), h('#584838')]

export function drawStairs(c: Cell): void {
  const { p, n } = c
  // stone steps; where a cliff flanks the stairs, a low stone wall frames them
  const sideW = n[W] !== 'stairs'
  const sideE = n[E] !== 'stairs'
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const k = y & 3
      let col = k === 0 ? STEP[0] : k === 1 ? STEP[1] : k === 2 ? STEP[2] : STEP[3]
      if (sideW && x <= 2) col = x === 0 ? STEP[4] : x === 1 ? (k === 0 ? CLIFF.hi : CLIFF.lt ?? CLIFF.hi) : CLIFF.base
      if (sideE && x >= 13) col = x === 15 ? STEP[4] : x === 14 ? CLIFF.sh : CLIFF.base
      if ((sideW && x === 3) || (sideE && x === 12)) col = k === 3 ? STEP[4] : STEP[3]
      setPx(p, x, y, col)
    }
}

export function drawCaveEntrance(c: Cell): void {
  paintCliffFace(c)
  const { p } = c
  const dark = [h('#100808'), h('#201410'), h('#302018')]
  for (let y = 3; y < 16; y++)
    for (let x = 2; x < 14; x++) {
      const inside = y >= 8 ? x >= 3 && x <= 12 : inEllipse(x, y, 8, 8.5, 5.2, 5.6)
      const rim = y >= 8 ? x >= 2 && x <= 13 : inEllipse(x, y, 8, 8.5, 6.4, 6.6)
      if (inside) setPx(p, x, y, y > 12 ? dark[1] : dark[0])
      else if (rim) setPx(p, x, y, x < 8 && y < 9 ? CLIFF.hi : CLIFF.out)
    }
  // threshold stones
  for (let x = 3; x <= 12; x++) setPx(p, x, 15, dark[2])
}

// ---------------------------------------------------------------- bridges & pier

const PLANK = [h('#e8c890'), h('#c89c60'), h('#a07440'), h('#704c28'), h('#402818')]

export function drawBridge(c: Cell, horizontal: boolean): void {
  paintWater(c, false)
  const { p, n } = c
  const kind = horizontal ? 'bridgeH' : 'bridgeV'
  const railA = horizontal ? n[N] !== kind : n[W] !== kind
  const railB = horizontal ? n[S] !== kind : n[E] !== kind
  for (let v = 0; v < 16; v++)
    for (let u = 0; u < 16; u++) {
      // u runs along the bridge, v across it
      let col: Rgba | null = null
      const a0 = railA ? 2 : 0
      const b1 = railB ? 12 : 15
      if (v >= a0 && v <= b1) {
        const pk = u % 4
        col = pk === 3 ? PLANK[3] : pk === 0 ? PLANK[0] : PLANK[1]
        if (v === b1 && railB) col = PLANK[2]
      }
      if (railA && v <= 2) col = v === 0 ? PLANK[4] : v === 1 ? PLANK[0] : PLANK[2]
      if (railB && v >= 12) {
        if (v === 12) col = PLANK[0]
        else if (v === 13) col = PLANK[2]
        else if (v === 14) col = PLANK[4]
        else col = null
      }
      if (railA && v <= 2 && (u === 3 || u === 11)) col = v === 0 ? PLANK[4] : PLANK[3]
      if (col === null) continue
      const x = horizontal ? u : v
      const y = horizontal ? v : u
      setPx(p, x, y, col)
    }
  if (railB) {
    // the bridge's shadow on the water
    for (let u = 0; u < 16; u++) {
      const x = horizontal ? u : 15
      const y = horizontal ? 15 : u
      setPx(p, x, y, mixc(getPx(p, x, y), h('#102850'), 0.35))
    }
  }
}

export function drawPier(c: Cell): void {
  const { p, gx0, gy0 } = c
  // boards run east–west whichever way the pier goes, the same as cargo stands on
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(p, x, y, floorAt('pier', gx0 + x, gy0 + y))
  pierEdges(c)
}

/** Beams and posts where a pier (or cargo standing on one) meets open water. */
export function pierEdges(c: Cell): void {
  const { p, n } = c
  const wet = (d: number): boolean => {
    const k = n[d]
    return (k === 'water' || k === 'waterRock')
  }
  if (wet(N)) for (let x = 0; x < 16; x++) setPx(p, x, 0, PLANK[4])
  if (wet(W)) for (let y = 0; y < 16; y++) setPx(p, 0, y, PLANK[4])
  if (wet(E))
    for (let y = 0; y < 16; y++) {
      setPx(p, 15, y, PLANK[4])
      setPx(p, 14, y, PLANK[2])
    }
  if (wet(S)) {
    for (let x = 0; x < 16; x++) {
      setPx(p, x, 13, PLANK[2])
      setPx(p, x, 14, PLANK[3])
      setPx(p, x, 15, PLANK[4])
    }
    // posts
    for (const x of [1, 13]) {
      setPx(p, x, 14, PLANK[1])
      setPx(p, x + 1, 14, PLANK[2])
      setPx(p, x, 15, PLANK[2])
      setPx(p, x + 1, 15, PLANK[3])
    }
  }
}

// ---------------------------------------------------------------- caves

export function drawCaveFloor(c: Cell): void {
  const { p, gx0, gy0 } = c
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(p, x, y, caveAt(gx0 + x, gy0 + y))
}

export function drawCaveWall(c: Cell): void {
  const { p, n, gx0, gy0 } = c
  const wall = (k: K): boolean => k === 'caveWall' || k === null
  if (!wall(n[S])) {
    // A face we look at: the wall drops to the floor in front.
    paintCliffFace(c, { ...CAVEWALL, lt: CAVEWALL.hi }, 29, true)
    // and a lit strip of floor-shadow at its foot is drawn by the floor itself
    return
  }
  // The top of the rock mass: dark, lumpy, with lit rims toward open floor.
  const same = (d: number): boolean => wall(n[d]) || n[d] === 'caveEntrance'
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const gx = gx0 + x
      const gy = gy0 + y
      const hit = edgeAt(x, y, same, () => 0, 3)
      let col = rockTopAt(gx, gy)
      if (hit.d <= 1) col = CAVEWALL.out
      else if (hit.d <= 2) col = hit.ny < 0 || hit.nx < 0 ? CAVEWALL.hi : CAVEWALL.base
      setPx(p, x, y, col)
    }
}

/** The top of a cave's rock mass: dark stone packed with rounded lumps. */
function rockTopAt(gx: number, gy: number): Rgba {
  const cw = 6
  const chh = 5
  const bx = Math.floor(gx / cw)
  const by = Math.floor(gy / chh)
  let best: Rgba | null = null
  let bestY = -1e9
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const cx = bx + ox
      const cy = by + oy
      const hh = ihash(cx, cy, 71)
      const mx = cx * cw + 1 + (hh % 4) + 0.5
      const my = cy * chh + 1 + ((hh >>> 3) % 3) + 0.5
      const rx = 2.2 + ((hh >>> 6) % 2)
      const ry = 1.8 + ((hh >>> 8) % 2) * 0.6
      const dx = (gx + 0.5 - mx) / rx
      const dy = (gy + 0.5 - my) / ry
      if (dx * dx + dy * dy > 1) continue
      if (my < bestY) continue
      bestY = my
      const lit = -(dx * 0.6 + dy * 0.8)
      best = lit > 0.35 ? CAVEWALL.topHi : lit < -0.45 ? CAVEWALL.dk : CAVEWALL.top
    }
  return best ?? mixc(CAVEWALL.top, CAVEWALL.dk, 0.5)
}

export function drawCaveRock(c: Cell): void {
  drawCaveFloor(c)
  const layer = createPixels(16, 16)
  const pal = [h('#d8c8b0'), h('#a89078'), h('#88705c'), h('#645040'), h('#382820')]
  paintBoulder(layer, 8, 9, 6.4, 5.6, pal)
  setPx(layer, 6, 7, pal[3])
  setPx(layer, 7, 8, pal[3])
  setPx(layer, 10, 10, pal[2])
  shadowUnder(c, 8, 14.5, 6.5, 1.6)
  compositeObject(c, layer, pal[4])
}

export function drawCaveLadder(c: Cell): void {
  drawCaveFloor(c)
  const { p } = c
  const hole = [h('#0c0808'), h('#1c1410'), h('#3c3028')]
  for (let y = 4; y < 15; y++)
    for (let x = 2; x < 14; x++) {
      if (!inEllipse(x, y, 8, 9.5, 6, 5.5)) continue
      const edge = !inEllipse(x, y, 8, 9.8, 5, 4.6)
      setPx(p, x, y, edge ? (y < 9 ? hole[2] : hole[1]) : hole[0])
    }
  const wood = [h('#e0b070'), h('#b88040'), h('#805428'), h('#4c3018')]
  for (let y = 1; y <= 12; y++) {
    setPx(p, 4, y, wood[3])
    setPx(p, 5, y, wood[1])
    setPx(p, 10, y, wood[1])
    setPx(p, 11, y, wood[3])
  }
  for (let y = 2; y <= 12; y += 3)
    for (let x = 5; x <= 10; x++) {
      setPx(p, x, y, wood[0])
      setPx(p, x, y + 1, wood[2])
    }
}

export function drawCaveWater(c: Cell): void {
  paintWater(c, true)
}

