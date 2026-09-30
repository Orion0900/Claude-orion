/**
 * The terrain dispatcher: one opaque 16×16 cell per (kind, neighbours,
 * position, frame), plus the tall-grass overlay.
 */
import type { TerrainKind } from '../../world/terrain'
import { createPixels, type Pixels } from './gfx'
import type { Nb } from './ground'
import * as I from './indoor'
import * as O from './outdoor'

const FRAMES: Partial<Record<TerrainKind, number>> = {
  water: 4,
  waterRock: 4,
  caveWater: 4,
  flowers: 4,
  tallgrass: 1,
  ...I.INDOOR_ANIM,
}

export function framesOf(kind: TerrainKind): number {
  return FRAMES[kind] ?? 1
}

const NULLS: Nb = [null, null, null, null, null, null, null, null]

export function drawTile(kind: TerrainKind, n: Nb, x: number, y: number, frame: number): Pixels {
  const p = createPixels(16, 16)
  const nb = n.length === 8 ? n : NULLS.map((_, i) => n[i] ?? null)
  const nf = framesOf(kind)
  const fr = (((Math.floor(frame) || 0) % nf) + nf) % nf
  const c: O.Cell = { p, n: nb, gx0: x * 16, gy0: y * 16, frame: fr }
  switch (kind) {
    case 'grass':
      O.paintGround(c, 'grass')
      break
    case 'tallgrass':
      O.drawTallGrass(c)
      break
    case 'flowers':
      O.drawFlowers(c)
      break
    case 'path':
      O.paintGround(c, 'path')
      break
    case 'sand':
      O.paintGround(c, 'sand')
      break
    case 'water':
      O.paintWater(c, false)
      break
    case 'ledgeS':
      O.drawLedge(c, 'S')
      break
    case 'ledgeE':
      O.drawLedge(c, 'E')
      break
    case 'ledgeW':
      O.drawLedge(c, 'W')
      break
    case 'tree':
      O.drawTree(c)
      break
    case 'palm':
      O.drawPalm(c)
      break
    case 'bush':
      O.drawBush(c)
      break
    case 'rock':
      O.drawRock(c)
      break
    case 'fence':
      O.drawFence(c)
      break
    case 'sign':
      O.drawSign(c)
      break
    case 'mailbox':
      O.drawMailbox(c)
      break
    case 'cliff':
      O.drawCliff(c)
      break
    case 'stairs':
      O.drawStairs(c)
      break
    case 'bridgeH':
      O.drawBridge(c, true)
      break
    case 'bridgeV':
      O.drawBridge(c, false)
      break
    case 'pier':
      O.drawPier(c)
      break
    case 'waterRock':
      O.drawWaterRock(c)
      break
    case 'caveEntrance':
      O.drawCaveEntrance(c)
      break
    case 'caveFloor':
      O.drawCaveFloor(c)
      break
    case 'caveWall':
      O.drawCaveWall(c)
      break
    case 'caveRock':
      O.drawCaveRock(c)
      break
    case 'caveLadder':
      O.drawCaveLadder(c)
      break
    case 'caveWater':
      O.drawCaveWater(c)
      break
    case 'floor':
      I.drawFloor(c, false)
      break
    case 'floorTile':
      I.drawFloor(c, true)
      break
    case 'wall':
      I.drawWall(c)
      break
    case 'window':
      I.drawWindow(c)
      break
    case 'mat':
      I.drawMat(c)
      break
    case 'rug':
      I.drawRug(c)
      break
    case 'stairsUp':
      I.drawStairsUp(c)
      break
    case 'stairsDown':
      I.drawStairsDown(c)
      break
    case 'table':
      I.drawTable(c)
      break
    case 'bed':
      I.drawBed(c)
      break
    case 'tv':
      I.drawTv(c)
      break
    case 'bookshelf':
      I.drawBookshelf(c)
      break
    case 'plant':
      I.drawPlant(c)
      break
    case 'counter':
      I.drawCounter(c)
      break
    case 'pc':
      I.drawPc(c)
      break
    case 'healer':
      I.drawHealer(c)
      break
    case 'shelf':
      I.drawShelf(c)
      break
    case 'machine':
      I.drawMachine(c)
      break
    case 'crate':
      I.drawCrate(c)
      break
    case 'barrel':
      I.drawBarrel(c)
      break
    case 'statue':
      I.drawStatue(c)
      break
    case 'void':
      I.drawVoid(c)
      break
    case 'deck':
      I.drawDeck(c)
      break
    case 'hull':
      I.drawHull(c)
      break
  }
  return p
}

export function overlayOf(kind: TerrainKind, frame: number): Pixels | null {
  if (kind === 'tallgrass') return O.tallGrassOverlay(frame)
  return null
}
