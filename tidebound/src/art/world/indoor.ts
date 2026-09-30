/**
 * Interior tiles and the old wreck: floors, walls, furniture and machines.
 * Furniture stands on whatever floor its neighbours suggest.
 */
import { N, S, W, E, edgeAt, floorAt, objectBase, type Ground, type K, type Nb } from './ground'
import { paintGround, pierEdges } from './outdoor'
import { createPixels, getPx, hex, ihash, inEllipse, mixc, outlineOf, setPx, type Pixels, type Rgba } from './gfx'
import type { TerrainKind } from '../../world/terrain'

const h = hex

export interface ICell {
  p: Pixels
  n: Nb
  gx0: number
  gy0: number
  frame: number
}

function paintFloor(c: ICell, g: Ground): void {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(c.p, x, y, floorAt(g, c.gx0 + x, c.gy0 + y))
}

function base(c: ICell, kind: TerrainKind): Ground {
  const g = objectBase(kind, c.n)
  return g
}

/** Paint the floor an object stands on. */
function floorUnder(c: ICell, kind: TerrainKind): void {
  const g = base(c, kind)
  if (g === 'floor' || g === 'floorTile' || g === 'deck' || g === 'pier') paintFloor(c, g)
  else paintGround(c, g)
  if (g === 'pier') pierEdges(c)
}


// ---------------------------------------------------------------- layer helpers

function layerOutline(layer: Pixels, out: Rgba | null): Pixels {
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
      setPx(res, x, y, out ?? outlineOf(src, 0.15))
    }
  return res
}

function put(c: ICell, layer: Pixels, out: Rgba | null): void {
  const src = layerOutline(layer, out)
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const col = getPx(src, x, y)
      if ((col & 255) !== 0) setPx(c.p, x, y, col)
    }
}

function R(p: Pixels, x: number, y: number, w: number, hh: number, col: Rgba): void {
  for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) setPx(p, xx, yy, col)
}

function floorShadow(c: ICell, x0: number, x1: number, y: number): void {
  for (let x = x0; x <= x1; x++) setPx(c.p, x, y, mixc(getPx(c.p, x, y), h('#302018'), 0.3))
}

// ---------------------------------------------------------------- walls

const PAPER = { base: h('#f4e2c4'), stripe: h('#ead2ae'), dot: h('#e0c49c') }
const TRIM = [h('#d8a870'), h('#b07c48'), h('#825630'), h('#583820')]
const isWallish = (k: K): boolean => k === 'wall' || k === 'window'

function paintWall(c: ICell): void {
  const { p, n, gx0 } = c
  const topOpen = !isWallish(n[N])
  const bottomOpen = !isWallish(n[S])
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const gx = gx0 + x
      let col = (gx & 3) === 0 ? PAPER.stripe : PAPER.base
      if ((gx & 7) === 4 && (y & 7) === 3) col = PAPER.dot
      if (topOpen) {
        if (y === 0) col = TRIM[3]
        else if (y === 1) col = TRIM[0]
        else if (y === 2) col = TRIM[2]
        else if (y === 3) col = mixc(col, TRIM[2], 0.25)
      }
      if (bottomOpen) {
        if (y === 10) col = TRIM[0]
        else if (y >= 11 && y <= 13) col = (gx & 7) === 0 ? TRIM[2] : TRIM[1]
        else if (y === 14) col = TRIM[2]
        else if (y === 15) col = TRIM[3]
      }
      setPx(p, x, y, col)
    }
}

export function drawWall(c: ICell): void {
  paintWall(c)
}

export function drawWindow(c: ICell): void {
  paintWall(c)
  const { p, n } = c
  // windows stacked in a two-row wall join into one tall window
  const up = n[N] === 'window'
  const down = n[S] === 'window'
  const top = up ? 0 : 1
  const bot = down ? 15 : 10
  const frame = [h('#fcfcf8'), h('#d8d8dc'), h('#9ca0b0')]
  const glass = [h('#e4f6ff'), h('#b0e0fc'), h('#80c4f4'), h('#5ca4e0')]
  for (let y = top; y <= bot; y++)
    for (let x = 2; x <= 13; x++) {
      let col = frame[1]
      if (x > 2 && x < 13 && (y > top || up) && (y < bot || down)) {
        const d = x - 3 + y
        col = glass[2]
        if (y <= 4 && !up) col = glass[1]
        if (d % 12 === 3 || d % 12 === 4 || d % 12 === 9) col = glass[0]
        if (y === bot - 1 && !down) col = glass[3]
      }
      if (x === 7) col = frame[0]
      if (x === 8) col = frame[1]
      if (y === 5 && !up && x > 2 && x < 13) col = frame[0]
      if (x === 2) col = frame[0]
      if (x === 13) col = frame[2]
      if (y === top && !up) col = frame[0]
      if (y === bot && !down) col = frame[2]
      setPx(p, x, y, col)
    }
  // curtains
  const cur = [h('#f8a8b0'), h('#e07888'), h('#b85060')]
  for (let y = top; y <= bot; y++) {
    setPx(p, 1, y, cur[1])
    setPx(p, 2, y, y % 3 === 0 ? cur[2] : cur[0])
    setPx(p, 14, y, cur[1])
    setPx(p, 13, y, y % 3 === 0 ? cur[2] : cur[1])
  }
  if (!up) {
    setPx(p, 1, 0, cur[2])
    setPx(p, 14, 0, cur[2])
  }
  if (!down) for (let x = 1; x <= 14; x++) setPx(p, x, 11, TRIM[0])
}

// ---------------------------------------------------------------- floor dressing

export function drawMat(c: ICell): void {
  floorUnder(c, 'mat')
  const { p } = c
  const m = [h('#f08868'), h('#d05840'), h('#a83c30'), h('#6c2420')]
  for (let y = 3; y <= 13; y++)
    for (let x = 1; x <= 14; x++) {
      let col = m[1]
      if (y === 3 || y === 13 || x === 1 || x === 14) col = m[2]
      else if (y === 5 || y === 11) col = m[0]
      else if (y === 8 && x > 3 && x < 12) col = m[0]
      setPx(p, x, y, col)
    }
  // fringe
  for (let x = 2; x <= 13; x += 2) {
    setPx(p, x, 2, m[0])
    setPx(p, x, 14, m[0])
  }
  for (let x = 1; x <= 14; x++) setPx(p, x, 15, mixc(getPx(p, x, 15), m[3], 0.3))
}

export function drawRug(c: ICell): void {
  const { p, n, gx0, gy0 } = c
  const rg = { out: h('#6c2830'), gold: h('#f0c048'), goldSh: h('#c89830'), base: h('#c84850'), sh: h('#a83840'), motif: h('#f07878'), motif2: h('#f8d8a0') }
  const flo = objectBase('rug', n)
  const same = (d: number): boolean => n[d] === 'rug'
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const gx = gx0 + x
      const gy = gy0 + y
      const hit = edgeAt(x, y, same, () => 1, 1)
      let col: Rgba
      if (hit.d <= 0) col = floorAt(flo === 'floorTile' ? 'floorTile' : 'floor', gx, gy)
      else if (hit.d <= 1) col = rg.out
      else if (hit.d <= 2) col = rg.gold
      else if (hit.d <= 3) col = rg.goldSh
      else {
        // a lattice of fine diagonal lines with a flower at each crossing
        const lx = ((gx % 8) + 8) % 8
        const ly = ((gy % 8) + 8) % 8
        const onA = (lx + ly) % 8 === 0
        const onB = (lx - ly + 8) % 8 === 0
        const cx = Math.abs(lx - 4) + Math.abs(ly - 4)
        col = rg.base
        if (onA || onB) col = rg.sh
        if (cx <= 1) col = cx === 0 ? rg.motif2 : rg.motif
        if (lx === 0 && ly === 0) col = rg.gold
      }
      setPx(p, x, y, col)
    }
}

const STAIR = [h('#f4d8a8'), h('#d8b078'), h('#b08050'), h('#805830'), h('#4c3420')]

export function drawStairsUp(c: ICell): void {
  const { p } = c
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const step = y >> 2
      const k = y & 3
      let col = k === 0 ? STAIR[0] : k === 1 ? STAIR[1] : k === 2 ? STAIR[2] : STAIR[3]
      // higher steps recede into shadow
      if (step === 0) col = mixc(col, STAIR[4], 0.35)
      if (x <= 1 || x >= 14) col = x === 0 || x === 15 ? STAIR[4] : STAIR[3]
      setPx(p, x, y, col)
    }
}

export function drawStairsDown(c: ICell): void {
  floorUnder(c, 'stairsDown')
  const { p } = c
  const dark = [h('#382418'), h('#281810'), h('#180c08')]
  for (let y = 1; y < 16; y++)
    for (let x = 1; x < 15; x++) {
      if (x === 1 || x === 14) {
        setPx(p, x, y, STAIR[4])
        continue
      }
      const step = (y - 2) >> 2
      const k = (y - 2) & 3
      let col = k === 0 ? STAIR[1] : k === 1 ? STAIR[2] : STAIR[3]
      if (y === 1) col = STAIR[4]
      else col = mixc(col, dark[Math.min(2, step)], 0.25 + step * 0.22)
      setPx(p, x, y, col)
    }
  for (let x = 1; x < 15; x++) setPx(p, x, 1, STAIR[4])
}

// ---------------------------------------------------------------- furniture

const TWOOD = [h('#f0c080'), h('#d49a58'), h('#b07840'), h('#80542c'), h('#4c301c')]

export function drawTable(c: ICell): void {
  floorUnder(c, 'table')
  const { n } = c
  const t = (d: number): boolean => n[d] === 'table'
  const layer = createPixels(16, 16)
  const x0 = t(W) ? 0 : 1
  const x1 = t(E) ? 15 : 14
  const y0 = t(N) ? 0 : 3
  const front = !t(S)
  const y1 = front ? 10 : 15
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let col = TWOOD[1]
      if (y === y0 && !t(N)) col = TWOOD[0]
      else if (x === x0 && !t(W)) col = TWOOD[0]
      else if (x === x1 && !t(E)) col = TWOOD[2]
      else if ((c.gy0 + y) % 4 === 2 && ((c.gx0 + x) * 5 + (c.gy0 + y)) % 11 > 3) col = mixc(TWOOD[1], TWOOD[2], 0.45)
      setPx(layer, x, y, col)
    }
  if (front) {
    for (let x = x0; x <= x1; x++) {
      setPx(layer, x, 11, TWOOD[2])
      setPx(layer, x, 12, TWOOD[3])
    }
    if (!t(W)) for (let y = 13; y <= 14; y++) setPx(layer, 2, y, TWOOD[3])
    if (!t(E)) for (let y = 13; y <= 14; y++) setPx(layer, 13, y, TWOOD[3])
    floorShadow(c, x0, x1, 15)
  }
  put(c, layer, TWOOD[4])
}

export function drawBed(c: ICell): void {
  floorUnder(c, 'bed')
  const { n, gx0, gy0 } = c
  const headHere = n[N] !== 'bed'
  const footHere = n[S] !== 'bed'
  const layer = createPixels(16, 16)
  const hue = ihash(gx0 >> 4, gy0 >> 4, 5) % 3
  const blanket = [
    [h('#a8c8ff'), h('#6890e8'), h('#4868c0'), h('#304888')],
    [h('#ffb8b0'), h('#f07870'), h('#c85050'), h('#903838')],
    [h('#b8f0a0'), h('#70c060'), h('#489848'), h('#306830')],
  ][hue]
  const top = headHere ? 0 : 0
  for (let y = top; y < 16; y++)
    for (let x = 1; x <= 14; x++) {
      let col = blanket[1]
      if (x === 1 || x === 14) col = TWOOD[2]
      else if (x === 2) col = blanket[0]
      else if (x === 13) col = blanket[2]
      setPx(layer, x, y, col)
    }
  if (headHere) {
    // headboard, pillow and the turned-down sheet
    for (let x = 1; x <= 14; x++) {
      setPx(layer, x, 0, TWOOD[0])
      setPx(layer, x, 1, TWOOD[1])
      setPx(layer, x, 2, TWOOD[3])
    }
    for (let y = 3; y <= 6; y++)
      for (let x = 3; x <= 12; x++) {
        const edge = (y === 3 || y === 6) && (x === 3 || x === 12)
        if (edge) continue
        setPx(layer, x, y, y === 6 ? h('#c8d0e0') : x === 3 || y === 3 ? h('#ffffff') : h('#eef2f8'))
      }
    for (let x = 2; x <= 13; x++) {
      setPx(layer, x, 8, h('#f8f8f8'))
      setPx(layer, x, 9, h('#d8dce8'))
    }
  }
  if (footHere) {
    for (let x = 1; x <= 14; x++) {
      setPx(layer, x, 13, blanket[2])
      setPx(layer, x, 14, TWOOD[1])
      setPx(layer, x, 15, TWOOD[3])
    }
  }
  put(c, layer, TWOOD[4])
}

export function drawTv(c: ICell): void {
  floorUnder(c, 'tv')
  const { p, frame } = c
  const layer = createPixels(16, 16)
  // cabinet
  R(layer, 1, 10, 14, 5, TWOOD[1])
  for (let x = 1; x <= 14; x++) setPx(layer, x, 10, TWOOD[0])
  for (let x = 1; x <= 14; x++) setPx(layer, x, 14, TWOOD[3])
  setPx(layer, 7, 12, TWOOD[3])
  setPx(layer, 8, 12, TWOOD[3])
  // set
  const case_ = [h('#d8d8e0'), h('#a8a8b8'), h('#787890'), h('#484860')]
  R(layer, 2, 1, 12, 9, case_[1])
  for (let x = 2; x <= 13; x++) setPx(layer, x, 1, case_[0])
  for (let y = 1; y <= 9; y++) setPx(layer, 13, y, case_[2])
  for (let x = 2; x <= 13; x++) setPx(layer, x, 9, case_[2])
  const scr = [h('#284070'), h('#3c68b0'), h('#90c8f8')]
  R(layer, 3, 2, 8, 6, scr[frame % 2 === 0 ? 0 : 1])
  setPx(layer, 4, 3, scr[2])
  setPx(layer, 5, 3, scr[2])
  setPx(layer, 4, 4, scr[2])
  setPx(layer, 12, 3, h('#f04040'))
  setPx(layer, 12, 5, case_[3])
  setPx(layer, 12, 6, case_[3])
  put(c, layer, case_[3])
  floorShadow(c, 1, 14, 15)
  void p
}

const BOOKS = [h('#e05048'), h('#4878d8'), h('#58b050'), h('#f0c040'), h('#9058c0'), h('#f08830'), h('#40a8b0'), h('#f0f0e8')]

export function drawBookshelf(c: ICell): void {
  floorUnder(c, 'bookshelf')
  const { gx0, gy0 } = c
  const layer = createPixels(16, 16)
  R(layer, 1, 0, 14, 16, TWOOD[2])
  for (let x = 1; x <= 14; x++) setPx(layer, x, 0, TWOOD[0])
  for (let y = 0; y < 16; y++) {
    setPx(layer, 1, y, TWOOD[1])
    setPx(layer, 14, y, TWOOD[3])
  }
  for (const sy of [1, 6, 11]) {
    // back of the shelf
    R(layer, 2, sy, 12, 4, TWOOD[3])
    let x = 2
    let i = 0
    while (x <= 13) {
      const hh = ihash(gx0 + x, gy0 + sy, 11 + i)
      const w = 1 + (hh % 2)
      const tall = 3 + ((hh >>> 3) % 2)
      const col = BOOKS[(hh >>> 5) % BOOKS.length]
      if ((hh >>> 9) % 7 === 0) {
        x += 1
        i++
        continue
      }
      for (let bx = x; bx < Math.min(14, x + w); bx++)
        for (let by = sy + 4 - tall; by < sy + 4; by++) setPx(layer, bx, by, by === sy + 4 - tall ? mixc(col, 0xffffffff, 0.3) : bx === x + w - 1 && w > 1 ? mixc(col, 0x000000ff, 0.25) : col)
      x += w
      i++
    }
    for (let x2 = 1; x2 <= 14; x2++) setPx(layer, x2, sy + 4, TWOOD[1])
  }
  put(c, layer, TWOOD[4])
}

export function drawPlant(c: ICell): void {
  floorUnder(c, 'plant')
  const layer = createPixels(16, 16)
  const pot = [h('#f8b080'), h('#e07848'), h('#b05430'), h('#783420')]
  for (let y = 10; y <= 15; y++) {
    const inset = y >= 13 ? 1 : 0
    for (let x = 4 + inset; x <= 11 - inset; x++) {
      let col = pot[1]
      if (x === 4 + inset) col = pot[0]
      if (x === 11 - inset) col = pot[2]
      if (y === 10) col = pot[0]
      if (y === 11) col = pot[2]
      setPx(layer, x, y, col)
    }
  }
  const leaf = [h('#a8e078'), h('#68c050'), h('#40983c'), h('#2c7030')]
  const leaves: readonly (readonly [number, number, number, number])[] = [
    [8, 5, 3.2, 4.2],
    [4.5, 6.5, 3, 2.4],
    [11.5, 6.5, 3, 2.4],
    [6, 3, 2.2, 2.6],
    [10.5, 3.5, 2.2, 2.6],
    [8, 8.5, 4, 2],
  ]
  for (const [cx, cy, rx, ry] of leaves)
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 16; x++) {
        if (!inEllipse(x, y, cx, cy, rx, ry)) continue
        const nx = (x + 0.5 - cx) / rx
        const ny = (y + 0.5 - cy) / ry
        const lit = -(nx * 0.6 + ny * 0.8)
        setPx(layer, x, y, lit > 0.45 ? leaf[0] : lit > -0.1 ? leaf[1] : lit > -0.6 ? leaf[2] : leaf[3])
      }
  put(c, layer, h('#1c3818'))
}

export function drawCounter(c: ICell): void {
  floorUnder(c, 'counter')
  const { n } = c
  const t = (d: number): boolean => n[d] === 'counter'
  const layer = createPixels(16, 16)
  const top = [h('#ffffff'), h('#eeeae0'), h('#d0c8b8')]
  const x0 = t(W) ? 0 : 1
  const x1 = t(E) ? 15 : 14
  for (let y = 1; y <= 6; y++)
    for (let x = x0; x <= x1; x++) setPx(layer, x, y, y === 1 ? top[0] : y === 6 ? top[2] : top[1])
  for (let y = 7; y <= 14; y++)
    for (let x = x0; x <= x1; x++) {
      let col = TWOOD[1]
      if (y === 7) col = TWOOD[3]
      else if ((x & 3) === 0) col = TWOOD[2]
      else if (y === 14) col = TWOOD[2]
      setPx(layer, x, y, col)
    }
  put(c, layer, TWOOD[4])
  floorShadow(c, x0, x1, 15)
}

export function drawPc(c: ICell): void {
  floorUnder(c, 'pc')
  const { frame } = c
  const layer = createPixels(16, 16)
  const body = [h('#f4f4f8'), h('#d0d4e0'), h('#a0a8b8'), h('#686c88')]
  R(layer, 1, 1, 14, 14, body[1])
  for (let x = 1; x <= 14; x++) {
    setPx(layer, x, 1, body[0])
    setPx(layer, x, 14, body[2])
  }
  for (let y = 1; y <= 14; y++) {
    setPx(layer, 1, y, body[0])
    setPx(layer, 14, y, body[2])
  }
  const scr = frame % 2 === 0 ? [h('#1c4c98'), h('#58a0f0'), h('#c0e8ff')] : [h('#1c5ca8'), h('#68b0f8'), h('#e0f4ff')]
  R(layer, 3, 3, 10, 6, scr[0])
  for (let x = 4; x <= 8; x++) setPx(layer, x, 4, scr[1])
  for (let x = 4; x <= 10; x++) setPx(layer, x, 6, scr[1])
  setPx(layer, 4, 4, scr[2])
  // keys
  for (let x = 3; x <= 12; x++) setPx(layer, x, 11, (x & 1) === 0 ? body[3] : body[2])
  setPx(layer, 12, 13, h('#40e070'))
  put(c, layer, body[3])
  floorShadow(c, 1, 14, 15)
}

export function drawHealer(c: ICell): void {
  floorUnder(c, 'healer')
  const { frame } = c
  const layer = createPixels(16, 16)
  const body = [h('#ffe0e8'), h('#f8b0c0'), h('#e07890'), h('#a04860')]
  R(layer, 0, 2, 16, 13, body[1])
  for (let x = 0; x <= 15; x++) {
    setPx(layer, x, 2, body[0])
    setPx(layer, x, 14, body[3])
    setPx(layer, x, 13, body[2])
  }
  // tray of six orbs
  R(layer, 1, 3, 10, 7, h('#f8f0f4'))
  for (let x = 1; x <= 10; x++) setPx(layer, x, 9, body[2])
  for (let i = 0; i < 6; i++) {
    const ox = 2 + (i % 3) * 3
    const oy = 4 + Math.floor(i / 3) * 3
    setPx(layer, ox, oy, h('#f4dcc0'))
    setPx(layer, ox + 1, oy, h('#d8b898'))
    setPx(layer, ox, oy + 1, h('#b0f0f0'))
    setPx(layer, ox + 1, oy + 1, h('#28a0a8'))
  }
  // screen
  const glow = frame % 2 === 0 ? h('#60f0a0') : h('#98ffc8')
  R(layer, 12, 4, 3, 4, h('#205040'))
  setPx(layer, 13, 5, glow)
  setPx(layer, 13, 6, glow)
  setPx(layer, 12, 10, h('#f8d048'))
  put(c, layer, h('#602838'))
  floorShadow(c, 0, 15, 15)
}

export function drawShelf(c: ICell): void {
  floorUnder(c, 'shelf')
  const { gx0, gy0 } = c
  const layer = createPixels(16, 16)
  const metal = [h('#e8ecf0'), h('#c0c8d0'), h('#909aa8'), h('#606878')]
  R(layer, 1, 0, 14, 16, metal[2])
  for (let y = 0; y < 16; y++) {
    setPx(layer, 1, y, metal[1])
    setPx(layer, 14, y, metal[3])
  }
  for (let x = 1; x <= 14; x++) setPx(layer, x, 0, metal[0])
  for (const sy of [1, 6, 11]) {
    R(layer, 2, sy, 12, 4, metal[3])
    for (let i = 0; i < 4; i++) {
      const hh = ihash(gx0 + i, gy0 + sy, 77)
      const x = 2 + i * 3
      const col = BOOKS[hh % BOOKS.length]
      const kind = (hh >>> 4) % 3
      if (kind === 0) {
        // box
        R(layer, x, sy + 1, 3, 3, col)
        setPx(layer, x, sy + 1, mixc(col, 0xffffffff, 0.35))
        setPx(layer, x + 2, sy + 3, mixc(col, 0x000000ff, 0.3))
      } else if (kind === 1) {
        // bottle
        setPx(layer, x + 1, sy, mixc(col, 0xffffffff, 0.4))
        R(layer, x, sy + 1, 3, 3, col)
        setPx(layer, x, sy + 2, mixc(col, 0xffffffff, 0.4))
      } else {
        // orb
        setPx(layer, x, sy + 2, h('#f4dcc0'))
        setPx(layer, x + 1, sy + 2, h('#d8b898'))
        setPx(layer, x, sy + 3, h('#b0f0f0'))
        setPx(layer, x + 1, sy + 3, h('#28a0a8'))
      }
    }
    for (let x = 1; x <= 14; x++) setPx(layer, x, sy + 4, metal[1])
  }
  put(c, layer, h('#383c48'))
}

export function drawMachine(c: ICell): void {
  floorUnder(c, 'machine')
  const { frame } = c
  const layer = createPixels(16, 16)
  const m = [h('#e0e8f0'), h('#b0bcc8'), h('#8090a0'), h('#586070')]
  R(layer, 1, 1, 14, 14, m[1])
  for (let x = 1; x <= 14; x++) {
    setPx(layer, x, 1, m[0])
    setPx(layer, x, 14, m[3])
  }
  for (let y = 1; y <= 14; y++) {
    setPx(layer, 1, y, m[0])
    setPx(layer, 14, y, m[2])
  }
  R(layer, 3, 3, 10, 5, h('#10281c'))
  // waveform
  const wave = [5, 4, 4, 5, 6, 6, 5, 4, 4, 5]
  for (let i = 0; i < 10; i++) setPx(layer, 3 + i, wave[(i + frame * 2) % 10], h('#58f098'))
  // dials and lights
  setPx(layer, 4, 10, m[3])
  setPx(layer, 5, 10, m[0])
  setPx(layer, 4, 11, m[0])
  setPx(layer, 5, 11, m[3])
  setPx(layer, 8, 10, frame % 2 ? h('#f84848') : h('#802020'))
  setPx(layer, 10, 10, h('#f8d048'))
  setPx(layer, 12, 10, frame % 2 ? h('#305830') : h('#48f070'))
  for (let x = 7; x <= 12; x++) setPx(layer, x, 12, m[2])
  put(c, layer, h('#303848'))
  floorShadow(c, 1, 14, 15)
}

export function drawCrate(c: ICell): void {
  floorUnder(c, 'crate')
  const layer = createPixels(16, 16)
  const wd = [h('#f0d098'), h('#d0a060'), h('#a87840'), h('#7c5028')]
  // top face
  for (let y = 2; y <= 5; y++) for (let x = 1; x <= 14; x++) setPx(layer, x, y, y === 2 ? wd[0] : (x & 3) === 0 ? wd[2] : wd[1])
  // front face
  for (let y = 6; y <= 14; y++)
    for (let x = 1; x <= 14; x++) {
      let col = wd[2]
      if (x === 1 || x === 14 || y === 6 || y === 14) col = wd[1]
      if (y === 6) col = wd[3]
      setPx(layer, x, y, col)
    }
  // cross brace
  for (let i = 0; i < 7; i++) {
    setPx(layer, 3 + i + (i > 3 ? 1 : 0), 7 + i, wd[1])
    setPx(layer, 12 - i - (i > 3 ? 1 : 0), 7 + i, wd[1])
  }
  put(c, layer, h('#4c3018'))
  floorShadow(c, 1, 14, 15)
}

export function drawBarrel(c: ICell): void {
  floorUnder(c, 'barrel')
  const layer = createPixels(16, 16)
  const wd = [h('#e8b878'), h('#c08850'), h('#98643a'), h('#6c4424')]
  const band = [h('#b8b8c0'), h('#707080')]
  for (let y = 4; y <= 14; y++) {
    const bulge = y >= 7 && y <= 11 ? 0 : 1
    for (let x = 2 + bulge; x <= 13 - bulge; x++) {
      let col = wd[1]
      if (x <= 3 + bulge) col = wd[0]
      else if (x >= 12 - bulge) col = wd[2]
      else if ((x & 2) === 0 && x % 4 === 0) col = wd[2]
      if (y === 6 || y === 12) col = x <= 4 ? band[0] : band[1]
      setPx(layer, x, y, col)
    }
  }
  // lid
  for (let y = 1; y <= 5; y++)
    for (let x = 2; x <= 13; x++) if (inEllipse(x, y, 8, 3.2, 6, 2.6)) setPx(layer, x, y, inEllipse(x, y, 8, 3.2, 4.6, 1.6) ? wd[1] : wd[0])
  setPx(layer, 7, 3, wd[3])
  setPx(layer, 8, 3, wd[3])
  put(c, layer, h('#40280c'))
  floorShadow(c, 2, 13, 15)
}

const STATUE = [
  '....o......o....',
  '...oAo....oAo...',
  '...oAao..oaBo...',
  '...oAaaooaaBo...',
  '..oAaaaaaaaaBo..',
  '..oAakaaaakaBo..',
  '..oAaaaaaaaaBo..',
  '...oAaaddaaBo...',
  '..ooAaaaaaaBoo..',
  '.oAAaaaaaaaaBBo.',
  'oCCCCCCCCCCCCCCo',
  'oCccccccccccccDo',
  'oEeeeeeeeeeeeeFo',
  'oEeeeeeeeeeeeeFo',
  'oGgggggggggggggo',
  'oooooooooooooooo',
]

export function drawStatue(c: ICell): void {
  floorUnder(c, 'statue')
  const st = [h('#f4f4f8'), h('#cdd0dc'), h('#a0a4b8'), h('#707490'), h('#404058')]
  const pal: Record<string, Rgba> = {
    o: st[4],
    A: st[0],
    a: st[1],
    B: st[2],
    k: st[3],
    d: st[2],
    C: st[0],
    c: st[1],
    D: st[2],
    E: st[1],
    e: st[2],
    F: st[3],
    G: st[3],
    g: st[3],
  }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const col = pal[STATUE[y][x]]
      if (col !== undefined) setPx(c.p, x, y, col)
    }
}

export function drawVoid(c: ICell): void {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(c.p, x, y, 0x000000ff)
}

export function drawDeck(c: ICell): void {
  paintFloor(c, 'deck')
}

export function drawFloor(c: ICell, tile: boolean): void {
  paintFloor(c, tile ? 'floorTile' : 'floor')
}

const HULL = { hi: h('#8c6848'), base: h('#6c5038'), sh: h('#58402c'), dk: h('#3c2c20'), beam: h('#4a3424'), beamHi: h('#9c7850') }

export function drawHull(c: ICell): void {
  const { p, n, gx0, gy0 } = c
  const topOpen = n[N] !== 'hull'
  const bottomOpen = n[S] !== 'hull'
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const gx = gx0 + x
      const lx = ((gx % 5) + 5) % 5
      let col = lx === 0 ? HULL.dk : lx === 1 ? HULL.hi : lx === 4 ? HULL.sh : HULL.base
      const hh = ihash(gx, (gy0 + y) >> 3, 9)
      if (hh % 13 === 0 && lx > 1 && lx < 4) col = HULL.sh
      if (topOpen && y <= 2) col = y === 0 ? HULL.dk : y === 1 ? HULL.beamHi : HULL.beam
      if (bottomOpen && y >= 13) col = y === 13 ? HULL.beamHi : y === 14 ? HULL.beam : HULL.dk
      setPx(p, x, y, col)
    }
  // the odd porthole
  if (ihash(gx0 >> 4, gy0 >> 4, 17) % 4 === 0 && bottomOpen && !topOpen) {
    const ring = [h('#c8a040'), h('#906820')]
    for (let y = 2; y <= 11; y++)
      for (let x = 3; x <= 12; x++) {
        if (!inEllipse(x, y, 8, 6.6, 4.6, 4.6)) continue
        const inner = inEllipse(x, y, 8, 6.6, 3.2, 3.2)
        if (inner) setPx(p, x, y, x + y < 14 ? h('#a8e8f0') : h('#58b0c8'))
        else setPx(p, x, y, x + y < 15 ? ring[0] : ring[1])
      }
  }
}

export const INDOOR_ANIM: Partial<Record<TerrainKind, number>> = { tv: 2, pc: 2, healer: 2, machine: 2 }

