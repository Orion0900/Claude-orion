/**
 * Buildings in the handheld 3/4 view: a sloped roof on top, the front wall
 * with windows below, the door in the contract's door cell. Transparent
 * wherever the ground should show.
 */
import { BUILDING_SIZE, type BuildingKind } from '../../world/terrain'
import { createPixels, ellipse, getPx, hex, inEllipse, line, mixc, outlineOf, ramp, setPx, type Pixels, type Ramp, type Rgba } from './gfx'

const h = hex

type P = Pixels

function R(p: P, x: number, y: number, w: number, hh: number, c: Rgba): void {
  for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) setPx(p, xx, yy, c)
}

function hl(p: P, x0: number, x1: number, y: number, c: Rgba): void {
  for (let x = x0; x <= x1; x++) setPx(p, x, y, c)
}

function vl(p: P, x: number, y0: number, y1: number, c: Rgba): void {
  for (let y = y0; y <= y1; y++) setPx(p, x, y, c)
}

const solid = (p: P, x: number, y: number): boolean => x >= 0 && y >= 0 && x < p.w && y < p.h && (getPx(p, x, y) & 255) !== 0

/** Outlines the whole sprite's silhouette in a tint of what it touches. */
function outlineAll(p: P, dark: Rgba): void {
  const src = { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) }
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if (solid(src, x, y)) continue
      let c = 0
      for (const [ax, ay] of [
        [x, y + 1],
        [x, y - 1],
        [x - 1, y],
        [x + 1, y],
      ] as const)
        if (solid(src, ax, ay)) {
          c = getPx(src, ax, ay)
          break
        }
      if (c) setPx(p, x, y, mixc(outlineOf(c), dark, 0.5))
    }
}

// ---------------------------------------------------------------- parts

export const ROOFS: readonly string[] = ['#e05848', '#4a7ed8', '#4aa84a', '#9860c0']

/**
 * A sloped roof seen from the front: shingle rows with a lit top edge and a
 * deep shadow under each row, a ridge cap on top, the far side in shade and
 * the eave's fascia along the bottom. Sides slant in by `slant` px toward the top.
 */
function roof(p: P, x0: number, y0: number, x1: number, y1: number, r: Ramp, slant = 3, rowH = 4, style: 'shingle' | 'tile' | 'thatch' | 'metal' = 'shingle'): void {
  const out = outlineOf(r[3], 0.12)
  const H = y1 - y0 + 1
  const deep = mixc(r[3], out, 0.35)
  for (let y = y0; y <= y1; y++) {
    const t = (y1 - y) / H
    const inset = Math.round(slant * t)
    const a = x0 + inset
    const b = x1 - inset
    const span = b - a
    for (let x = a; x <= b; x++) {
      const ly = y - y0
      const u = (x - a) / span
      let c = r[1]
      if (ly === 0) c = out
      else if (ly === 1) c = r[0]
      else if (ly === 2) c = mixc(r[0], r[1], 0.5)
      else if (ly === 3) c = r[3]
      else if (y === y1) c = out
      else if (y === y1 - 1) c = deep
      else if (y === y1 - 2) c = r[2]
      else if (y === y1 - 3) c = mixc(r[0], r[1], 0.4)
      else {
        const rl = (ly - 4) % rowH
        const row = Math.floor((ly - 4) / rowH)
        if (style === 'thatch') {
          const streak = (x * 3 + row * 5 + (x >> 2)) % 7 === 0
          c = rl === rowH - 1 ? r[3] : streak ? r[2] : rl === 0 ? r[0] : r[1]
        } else if (style === 'metal') {
          const k = (x - a) % 6
          c = k === 0 ? r[3] : k === 1 ? r[0] : k === 5 ? r[2] : r[1]
          if (rl === rowH - 1 && row % 3 === 2) c = r[2]
        } else {
          if (rl === rowH - 1) c = r[3]
          else if (rl === rowH - 2) c = r[2]
          else if (rl === 0) c = u < 0.55 ? r[0] : r[1]
          const joint = style === 'tile' ? 5 : 8
          const off = row % 2 === 0 ? 0 : Math.floor(joint / 2)
          if ((x - x0 + off) % joint === 0 && rl < rowH - 1) c = rl === 0 ? r[1] : r[3]
          if (style === 'tile' && (x - x0 + off) % joint === 1 && rl < rowH - 2) c = r[0]
        }
        // the far (right) side of the roof falls into shade
        if (u > 0.93 && c !== r[3]) c = mixc(c, r[3], 0.45)
        else if (u < 0.04) c = mixc(c, r[0], 0.5)
      }
      if (x === a || x === b) c = out
      setPx(p, x, y, c)
    }
  }
}

/** A plain wall with its shaded right edge, shadow under the eave and a base. */
function wall(p: P, x0: number, y0: number, x1: number, y1: number, r: Ramp, planks = 0, base: Ramp | null = STONE): void {
  const out = outlineOf(r[3], 0.14)
  const shadow = mixc(r[2], h('#403848'), 0.35)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      let c = r[1]
      if (planks > 0 && (y - y0) % planks === planks - 1) c = mixc(r[1], r[2], 0.6)
      if (x >= x1 - 2) c = r[2]
      if (x <= x0 + 1) c = mixc(r[1], r[0], 0.6)
      if (y - y0 < 2) c = shadow
      else if (y - y0 < 3) c = r[2]
      if (x === x0 || x === x1) c = out
      setPx(p, x, y, c)
    }
  if (base) {
    for (let x = x0; x <= x1; x++) {
      setPx(p, x, y1 - 2, base[0])
      setPx(p, x, y1 - 1, (x & 3) === 0 ? base[2] : base[1])
      setPx(p, x, y1, base[3])
    }
    setPx(p, x0, y1 - 1, base[3])
    setPx(p, x1, y1 - 1, base[3])
  }
}

const STONE: Ramp = [h('#d8d4cc'), h('#b0aca4'), h('#8c8884'), h('#5c5860')]
const GLASS: Ramp = [h('#e8f8ff'), h('#a8dcf8'), h('#70b4e8'), h('#4888c8')]
const WOODR: Ramp = ramp('#a86a3a')
const WHITE_FRAME: Ramp = [h('#ffffff'), h('#eceef0'), h('#c4c8d4'), h('#8c90a4')]

function windowAt(p: P, x: number, y: number, w: number, hh: number, frame: Ramp = WHITE_FRAME, cross = true, box: Ramp | null = null): void {
  R(p, x, y, w, hh, frame[1])
  for (let yy = y + 1; yy < y + hh - 1; yy++)
    for (let xx = x + 1; xx < x + w - 1; xx++) {
      const d = xx - x + (yy - y)
      let c = yy < y + 3 ? GLASS[2] : GLASS[1]
      if (d === 4 || d === 5 || d === w + 2) c = GLASS[0]
      if (yy === y + hh - 2) c = GLASS[3]
      setPx(p, xx, yy, c)
    }
  if (cross) {
    const mx = x + Math.floor(w / 2)
    vl(p, mx, y + 1, y + hh - 2, frame[1])
    hl(p, x + 1, x + w - 2, y + Math.floor(hh / 2), frame[1])
  }
  hl(p, x, x + w - 1, y, frame[0])
  hl(p, x, x + w - 1, y + hh - 1, frame[2])
  vl(p, x + w - 1, y, y + hh - 1, frame[2])
  const o = frame[3]
  hl(p, x - 1, x + w, y - 1, o)
  hl(p, x - 1, x + w, y + hh, o)
  vl(p, x - 1, y, y + hh - 1, o)
  vl(p, x + w, y, y + hh - 1, o)
  if (box) {
    // a flower box under the sill
    const by = y + hh + 1
    R(p, x - 1, by, w + 2, 3, box[1])
    hl(p, x - 1, x + w, by, box[0])
    hl(p, x - 1, x + w, by + 2, box[3])
    const petals = [h('#f85868'), h('#f8f0f0'), h('#f8c838'), h('#f890c0')]
    for (let i = 0; i < w; i += 2) {
      setPx(p, x + i, by - 1, petals[(i >> 1) % petals.length])
      setPx(p, x + i + 1, by - 1, h('#48a040'))
    }
  }
}

function door(p: P, x: number, y: number, w: number, hh: number, r: Ramp = WOODR, glassTop = true): void {
  const out = outlineOf(r[3], 0.1)
  R(p, x - 1, y - 1, w + 2, hh + 1, out)
  R(p, x, y, w, hh, r[1])
  vl(p, x, y, y + hh - 1, r[0])
  vl(p, x + w - 1, y, y + hh - 1, r[2])
  hl(p, x, x + w - 1, y, r[0])
  // panels
  for (let yy = y + 2; yy < y + hh - 1; yy++) {
    if ((yy - y) % 5 === 1) hl(p, x + 2, x + w - 3, yy, r[2])
  }
  if (glassTop) {
    R(p, x + 2, y + 2, w - 4, 3, GLASS[1])
    hl(p, x + 2, x + w - 3, y + 2, GLASS[0])
  }
  setPx(p, x + w - 3, y + Math.floor(hh / 2) + 1, h('#f8d048'))
  setPx(p, x + w - 3, y + Math.floor(hh / 2) + 2, r[3])
}

/** A doorway into darkness with a frame (halls, shrines, the wreck). */
function darkDoor(p: P, x: number, y: number, w: number, hh: number, frame: Ramp): void {
  R(p, x - 1, y - 1, w + 2, hh + 1, outlineOf(frame[3], 0.1))
  R(p, x, y, w, hh, h('#181420'))
  for (let yy = y; yy < y + hh; yy++) {
    setPx(p, x, yy, h('#282434'))
  }
  hl(p, x, x + w - 1, y, h('#302c40'))
}

/** Glass sliding doors. */
function glassDoors(p: P, x: number, y: number, w: number, hh: number, frame: Ramp): void {
  const out = frame[3]
  R(p, x - 1, y - 1, w + 2, hh + 1, out)
  R(p, x, y, w, hh, frame[1])
  const half = Math.floor(w / 2)
  for (const sx of [x + 1, x + half + 1]) {
    for (let yy = y + 1; yy < y + hh; yy++)
      for (let xx = sx; xx < sx + half - 2; xx++) {
        const d = xx - sx + (yy - y)
        setPx(p, xx, yy, d === 3 || d === 4 ? GLASS[0] : yy > y + hh - 3 ? GLASS[2] : GLASS[1])
      }
  }
  vl(p, x + half, y, y + hh - 1, out)
}

function stepAt(p: P, x: number, y: number, w: number): void {
  hl(p, x, x + w - 1, y, STONE[0])
  hl(p, x, x + w - 1, y + 1, STONE[2])
}

/** Round emblem plate with a picture drawn by `art` into a small box. */
function emblem(p: P, cx: number, cy: number, r: number, bg: Ramp, ring: Rgba, art: (x: number, y: number) => Rgba | null): void {
  for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++)
    for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (inEllipse(x, y, cx, cy, r + 1, r + 1)) {
        let c: Rgba = inEllipse(x, y, cx, cy, r, r) ? bg[1] : ring
        if (inEllipse(x, y, cx, cy, r, r) && x + 0.5 < cx - r * 0.3 && y + 0.5 < cy - r * 0.3) c = bg[0]
        const a = art(x - Math.round(cx - r), y - Math.round(cy - r))
        if (a !== null && inEllipse(x, y, cx, cy, r, r)) c = a
        setPx(p, x, y, c)
      } else if (inEllipse(x, y, cx, cy, r + 2, r + 2)) setPx(p, x, y, outlineOf(ring, 0.12))
    }
}

function fromArt(rows: readonly string[], pal: Record<string, Rgba>): (x: number, y: number) => Rgba | null {
  return (x, y) => {
    const row = rows[y]
    if (!row) return null
    const ch = row[x]
    return ch && pal[ch] !== undefined ? pal[ch] : null
  }
}

// ---------------------------------------------------------------- kinds

function house(variant: number): P {
  const p = createPixels(80, 64)
  const r = ramp(ROOFS[((variant % 4) + 4) % 4])
  // chimney behind the ridge
  const brick = ramp('#b86848')
  R(p, 58, 1, 8, 10, brick[1])
  for (let y = 2; y < 10; y += 3) hl(p, 58, 65, y, brick[2])
  vl(p, 58, 1, 10, brick[0])
  hl(p, 57, 66, 0, outlineOf(brick[3]))
  vl(p, 57, 0, 10, outlineOf(brick[3]))
  vl(p, 66, 0, 10, outlineOf(brick[3]))
  hl(p, 58, 65, 1, h('#302828'))
  roof(p, 0, 5, 79, 35, r, 4)
  wall(p, 3, 36, 76, 63, ramp('#f4ead2'), 4)
  windowAt(p, 10, 41, 14, 9, WHITE_FRAME, true, ramp('#a86a3a'))
  windowAt(p, 56, 41, 14, 9, WHITE_FRAME, true, ramp('#a86a3a'))
  door(p, 34, 47, 12, 15, ramp(ROOFS[variant % 4] === ROOFS[0] ? '#8c5a34' : '#a86a3a'))
  stepAt(p, 33, 62, 14)
  return p
}

function hut(variant: number): P {
  const p = createPixels(48, 48)
  const r = ramp(ROOFS[((variant % 4) + 4) % 4])
  roof(p, 0, 2, 47, 24, r, 5, 3, 'thatch')
  const planks = ramp('#c89060')
  wall(p, 3, 25, 44, 47, planks, 3, null)
  // plank seams
  for (let x = 6; x < 44; x += 5) vl(p, x, 28, 46, planks[2])
  windowAt(p, 7, 30, 8, 7, ramp('#a06a3a'), true)
  windowAt(p, 33, 30, 8, 7, ramp('#a06a3a'), true)
  door(p, 18, 33, 12, 14, ramp('#7c4c2c'), false)
  // stilts / step
  hl(p, 17, 30, 47, STONE[1])
  return p
}

function haven(): P {
  const p = createPixels(112, 80)
  const r = ramp('#f07c90')
  roof(p, 0, 4, 111, 41, r, 5, 5, 'tile')
  const w = ramp('#f8f4ee')
  wall(p, 3, 42, 108, 79, w)
  // a pink stripe along the wall
  for (let x = 4; x < 108; x++) {
    setPx(p, x, 45, r[0])
    setPx(p, x, 46, r[1])
  }
  windowAt(p, 12, 52, 20, 12, WHITE_FRAME, true)
  windowAt(p, 80, 52, 20, 12, WHITE_FRAME, true)
  glassDoors(p, 49, 60, 14, 18, ramp('#d8dce8'))
  stepAt(p, 47, 78, 18)
  // sign: a heart held in a shell
  emblem(p, 56, 38, 9, ramp('#fff8f8'), r[1], (x, y) => {
    const heart = ['..hh.hh..', '.hHhhhhh.', '.hHhhhhh.', '.hhhhhhh.', '..hhhhh..', '...hhh...', '....h....']
    const shell = ['s.s.s.s.s', 'sssssssss', '.sssssss.']
    if (y >= 2 && y < 9 && x >= 5 && x < 14) {
      const ch = heart[y - 2][x - 5]
      if (ch === 'h') return h('#f04868')
      if (ch === 'H') return h('#ffa0b0')
    }
    if (y >= 11 && y < 14 && x >= 5 && x < 14) {
      const ch = shell[y - 11][x - 5]
      if (ch === 's') return h('#f8b8a0')
    }
    return null
  })
  return p
}

function market(): P {
  const p = createPixels(80, 64)
  const r = ramp('#f0a830')
  roof(p, 0, 4, 79, 31, r, 4, 4, 'tile')
  const w = ramp('#f6f2e6')
  wall(p, 3, 32, 76, 63, w)
  // striped awning over the display windows
  for (let x = 4; x <= 75; x++) {
    const stripe = Math.floor((x - 4) / 4) % 2 === 0
    for (let y = 35; y <= 38; y++) setPx(p, x, y, stripe ? (y === 38 ? h('#3c78c0') : h('#5898e0')) : y === 38 ? h('#d8d8e0') : h('#f8f8f8'))
  }
  windowAt(p, 8, 42, 20, 12, WHITE_FRAME, false)
  windowAt(p, 52, 42, 20, 12, WHITE_FRAME, false)
  // goods behind the glass
  const goods = [h('#f05048'), h('#58b050'), h('#f8d048'), h('#4880e0')]
  for (let i = 0; i < 6; i++) {
    R(p, 10 + i * 3, 50, 2, 3, goods[i % 4])
    R(p, 54 + i * 3, 50, 2, 3, goods[(i + 2) % 4])
  }
  glassDoors(p, 34, 47, 12, 15, ramp('#d8dce8'))
  stepAt(p, 33, 62, 14)
  // sign: a shopping bag
  emblem(p, 40, 28, 8, ramp('#fffaf0'), r[1], fromArt(['................', '................', '.....hhhhhh.....', '....h......h....', '....h......h....', '...bbbbbbbbbb...', '...bBBBBBBBBb...', '...bBBBBBBBBb...', '...bBBwwBBBBb...', '...bBBBBBBBBb...', '...bbbbbbbbbb...'], { h: h('#806040'), b: h('#2860b0'), B: h('#4890e8'), w: h('#f8f8f8') }))
  return p
}

function lab(): P {
  const p = createPixels(112, 80)
  const r = ramp('#6c90a8')
  // rooftop gear: a dish and a vane
  line(p, 90, 2, 90, 12, h('#606878'))
  ellipse(p, 90, 5, 5, 3, h('#d8e0e8'))
  ellipse(p, 90, 5, 3, 1.6, h('#a8b4c4'))
  roof(p, 0, 8, 111, 35, r, 3, 5, 'metal')
  // solar panels
  for (let i = 0; i < 3; i++) {
    const x = 14 + i * 16
    R(p, x, 14, 13, 12, h('#283c78'))
    for (let yy = 14; yy < 26; yy += 3) hl(p, x, x + 12, yy, h('#4868b8'))
    for (let xx = x; xx < x + 13; xx += 4) vl(p, xx, 14, 25, h('#4868b8'))
    hl(p, x, x + 12, 26, h('#181c38'))
  }
  const w = ramp('#eef2f4')
  wall(p, 3, 36, 108, 79, w, 0, ramp('#8c98a8'))
  // a teal band
  for (let x = 4; x < 108; x++) {
    setPx(p, x, 40, h('#48b0b8'))
    setPx(p, x, 41, h('#3890a0'))
  }
  for (let i = 0; i < 2; i++) windowAt(p, 10 + i * 18, 48, 14, 12, WHITE_FRAME, true)
  for (let i = 0; i < 2; i++) windowAt(p, 70 + i * 18, 48, 14, 12, WHITE_FRAME, true)
  glassDoors(p, 49, 60, 14, 18, ramp('#c8d0dc'))
  stepAt(p, 47, 78, 18)
  // sign: a flask
  emblem(p, 56, 33, 7, ramp('#ffffff'), h('#48b0b8'), fromArt(['..............', '..............', '.....kkkk.....', '......gg......', '......gg......', '.....gggg.....', '....gggggg....', '...gGGGGGGg...', '...gGGGGGGg...', '....gggggg....'], { k: h('#606878'), g: h('#90a0b0'), G: h('#48d098') }))
  return p
}

function bigHouse(variant: number): P {
  const p = createPixels(112, 80)
  const r = ramp(['#c86838', '#5870c8', '#58a058', '#a060b0'][((variant % 4) + 4) % 4])
  roof(p, 0, 6, 111, 37, r, 5)
  // a dormer window in the roof
  R(p, 70, 14, 20, 14, ramp('#f4ead2')[1])
  roof(p, 67, 6, 92, 16, r, 3, 3)
  windowAt(p, 74, 18, 12, 8, WHITE_FRAME, true)
  hl(p, 68, 91, 28, r[3])
  const w = ramp('#f2e4c8')
  wall(p, 3, 38, 108, 79, w, 4)
  windowAt(p, 60, 44, 14, 10, WHITE_FRAME, true, ramp('#a86a3a'))
  windowAt(p, 84, 44, 14, 10, WHITE_FRAME, true, ramp('#a86a3a'))
  windowAt(p, 10, 44, 14, 10, WHITE_FRAME, true, ramp('#a86a3a'))
  door(p, 34, 62, 12, 16, ramp('#8c5a34'))
  stepAt(p, 33, 78, 14)
  // porch lamp
  setPx(p, 48, 64, h('#f8e070'))
  setPx(p, 48, 65, h('#c8a030'))
  return p
}

interface HallStyle {
  roof: string
  wall: string
  trim: string
  art: readonly string[]
  artPal: Record<string, Rgba>
}

const HALLS: readonly HallStyle[] = [
  {
    roof: '#8c8478',
    wall: '#d4ccc0',
    trim: '#6c6458',
    art: ['..............', '..............', '......kk......', '.....kLLk.....', '....kLLLsk....', '...kLLLssk.k..', '..kLLLLsssksk.', '.kLLLLssssssk.', '.kkkkkkkkkkkk.'],
    artPal: { k: h('#484038'), L: h('#c8c0b0'), s: h('#8c8070') },
  },
  {
    roof: '#f0c830',
    wall: '#f4f0e0',
    trim: '#303040',
    art: ['..............', '.......yyy....', '......yyy.....', '.....yyy......', '....yyyyyyy...', '.......yyy....', '......yyy.....', '.....yy.......', '....y.........'],
    artPal: { y: h('#f8d830') },
  },
  {
    roof: '#3c80d8',
    wall: '#e8f4f8',
    trim: '#28508c',
    art: ['..............', '..............', '.....www......', '...wwbbbw.....', '..wbb...bw....', '.wb..bbb.bw...', '.b..b...b.bb..', '.bbbbbbbbbbbb.', '..............'],
    artPal: { w: h('#f8ffff'), b: h('#48a8e8') },
  },
]

function hall(variant: number): P {
  const v = ((variant % 3) + 3) % 3
  const st = HALLS[v]
  const p = createPixels(144, 96)
  const r = ramp(st.roof)
  // roof ornaments behind the ridge: boulders, lightning rods or a wave crest
  if (v === 0) {
    const rock = ramp('#a09888')
    for (const [cx, cy, rx] of [
      [14, 7, 7],
      [24, 8, 5],
      [128, 7, 7],
      [119, 8, 5],
    ] as const)
      for (let y = 0; y < 14; y++)
        for (let x = cx - rx - 1; x <= cx + rx + 1; x++)
          if (inEllipse(x, y, cx, cy, rx, rx * 0.8)) setPx(p, x, y, x < cx - 1 && y < cy ? rock[0] : x > cx + 2 ? rock[2] : rock[1])
  } else if (v === 1) {
    for (const px of [22, 121]) {
      vl(p, px, 1, 10, h('#686878'))
      vl(p, px + 1, 1, 10, h('#484858'))
      R(p, px - 1, 0, 4, 3, h('#f8d830'))
      setPx(p, px - 1, 0, h('#fff8b0'))
    }
  } else {
    const foam = [h('#ffffff'), h('#c8ecff'), h('#58a8e8')]
    for (let x = 44; x < 100; x++) {
      const t = (x - 44) / 56
      const top = 6 - Math.round(Math.sin(t * Math.PI) * 5)
      for (let y = top; y < 9; y++) setPx(p, x, y, y === top ? foam[0] : y === top + 1 ? foam[1] : foam[2])
    }
    for (let y = 0; y < 8; y++) for (let x = 38; x < 52; x++) if (inEllipse(x, y, 45, 5, 5, 4) && !inEllipse(x, y, 47, 6, 3, 2.2)) setPx(p, x, y, x + y < 48 ? foam[0] : foam[1])
  }
  roof(p, 0, 6, 143, 45, r, 6, 5, v === 1 ? 'metal' : v === 0 ? 'tile' : 'shingle')
  const w = ramp(st.wall)
  wall(p, 3, 46, 140, 95, w, v === 0 ? 5 : 0, v === 0 ? ramp('#6c6458') : STONE)
  // pillars flanking the entrance
  const pil = ramp(v === 0 ? '#b8b0a4' : '#f8f8f8')
  for (const px of [50, 88]) {
    R(p, px, 50, 6, 44, pil[1])
    vl(p, px, 50, 93, pil[0])
    vl(p, px + 5, 50, 93, pil[2])
    hl(p, px - 1, px + 6, 50, pil[0])
    hl(p, px - 1, px + 6, 51, pil[2])
    hl(p, px - 1, px + 6, 93, pil[2])
  }
  // a band of trim and windows
  const trim = ramp(st.trim)
  for (let x = 4; x < 140; x++) {
    setPx(p, x, 49, trim[1])
    setPx(p, x, 50, trim[2])
  }
  windowAt(p, 14, 58, 22, 14, WHITE_FRAME, true)
  windowAt(p, 108, 58, 22, 14, WHITE_FRAME, true)
  // wide double doors in the door cell (4, 5)
  darkDoor(p, 64, 76, 16, 18, trim)
  R(p, 64, 76, 16, 18, trim[2])
  vl(p, 71, 76, 93, trim[3])
  vl(p, 72, 76, 93, trim[3])
  for (let yy = 78; yy < 93; yy += 4) {
    hl(p, 66, 69, yy, trim[1])
    hl(p, 74, 77, yy, trim[1])
  }
  stepAt(p, 60, 94, 24)
  // the Warden's emblem over the door
  emblem(p, 72, 42, 10, ramp('#fffcf4'), trim[1], fromArt(st.art.map((row) => '...' + row), st.artPal))
  return p
}

function lighthouse(): P {
  const p = createPixels(48, 128)
  const red = ramp('#e04848')
  const wht = ramp('#f8f8f4')
  // tower: tapering from 30 px wide at the base to 20 at the gallery
  const top = 34
  const bot = 121
  for (let y = top; y <= bot; y++) {
    const t = (y - top) / (bot - top)
    const half = Math.round(10 + 5 * t)
    const x0 = 24 - half
    const x1 = 23 + half
    const band = Math.floor((y - top) / 12) % 2 === 1
    const r = band ? red : wht
    for (let x = x0; x <= x1; x++) {
      const u = (x - x0) / (x1 - x0)
      let c = u < 0.2 ? r[0] : u < 0.62 ? r[1] : u < 0.85 ? r[2] : r[3]
      if (x === x0 || x === x1) c = outlineOf(r[3], 0.12)
      setPx(p, x, y, c)
    }
  }
  // stone base
  for (let y = 118; y <= 127; y++)
    for (let x = 6; x <= 41; x++) {
      let c = y === 118 ? STONE[0] : (x + (y >> 1)) % 6 === 0 ? STONE[2] : STONE[1]
      if (x === 6 || x === 41 || y === 127) c = STONE[3]
      if (x === 40) c = STONE[2]
      setPx(p, x, y, c)
    }
  // small windows up the tower
  for (const wy of [52, 76, 98]) windowAt(p, 22, wy, 4, 6, WHITE_FRAME, false)
  door(p, 18, 111, 12, 15, ramp('#6c4c34'), false)
  // gallery and lantern room
  R(p, 9, 28, 30, 6, h('#383848'))
  hl(p, 9, 38, 28, h('#686878'))
  for (let x = 10; x <= 38; x += 3) vl(p, x, 24, 28, h('#484858'))
  hl(p, 9, 38, 24, h('#585868'))
  for (let y = 12; y <= 27; y++)
    for (let x = 15; x <= 32; x++) {
      let c = y < 20 ? h('#fff4a0') : h('#f8d860')
      if (x === 15 || x === 32) c = h('#383848')
      if ((x - 15) % 6 === 0 && x > 15 && x < 32) c = h('#585868')
      if (x > 17 && x < 21 && y > 13 && y < 18) c = h('#ffffff')
      setPx(p, x, y, c)
    }
  // dome
  for (let y = 2; y <= 12; y++)
    for (let x = 12; x <= 35; x++) {
      if (!inEllipse(x, y, 24, 12, 12, 10)) continue
      const u = (x - 12) / 24
      setPx(p, x, y, u < 0.3 ? red[0] : u < 0.7 ? red[1] : red[2])
    }
  hl(p, 12, 35, 12, red[3])
  vl(p, 24, 0, 2, h('#383848'))
  outlineAll(p, h('#282030'))
  return p
}

function wreck(): P {
  const p = createPixels(144, 80)
  const hull = ramp('#8a6440')
  const wet = ramp('#5c4430')
  const deckR = ramp('#b8946a')
  const mast = ramp('#8c6a44')
  const sail = ramp('#dcd0b4')
  // the ship lists a little: bow (left) rides higher than the stern
  const deckY = (x: number): number => Math.round(27 + (x - 6) * 0.06)
  const bottomY = (x: number): number => 72 - Math.round(Math.max(0, 26 - x) * 1.25) - Math.round(Math.max(0, x - 128) * 0.9)
  const bowX = (y: number): number => 4 + Math.round(Math.max(0, y - 30) * 0.45)
  // deck seen from above: planks between the rails
  for (let x = 8; x < 136; x++) {
    const d = deckY(x)
    for (let y = d - 9; y < d; y++) {
      const ly = y - (d - 9)
      let c = ly % 3 === 2 ? deckR[2] : deckR[1]
      if (ly === 0) c = deckR[3]
      if ((x * 5 + ly * 11) % 37 === 0) c = h('#3a2a1e')
      setPx(p, x, y, c)
    }
  }
  // hull side: planks, darker and wetter toward the waterline
  for (let x = 4; x < 140; x++) {
    const top = deckY(x)
    const bot = bottomY(x)
    for (let y = top; y <= bot; y++) {
      if (x < bowX(y)) continue
      const ly = y - top
      const lower = y > 60
      const r = lower ? wet : hull
      let c = ly % 5 === 4 ? r[2] : ly % 5 === 0 ? r[0] : r[1]
      if (ly <= 1) c = ly === 0 ? hull[0] : hull[3]
      if (y > 66 && (x * 3 + y) % 7 === 0) c = h('#3c7050')
      if ((x * 7 + (ly >> 2) * 13) % 61 === 0) c = r[3]
      if (x > 136) c = r[2]
      setPx(p, x, y, c)
    }
  }
  // the stern castle with lit windows
  for (let y = 10; y < deckY(118); y++)
    for (let x = 112; x < 140; x++) {
      let c = y === 10 ? hull[0] : y < 13 ? hull[3] : (y - 13) % 5 === 4 ? hull[2] : hull[1]
      if (x > 136) c = hull[2]
      setPx(p, x, y, c)
    }
  for (const wx of [117, 126]) {
    R(p, wx, 16, 5, 6, h('#302418'))
    R(p, wx + 1, 17, 3, 4, h('#f0c060'))
    setPx(p, wx + 1, 17, h('#fff0b0'))
  }
  hl(p, 110, 139, 9, hull[3])
  // a gash in the side, splintered edges
  for (let y = 38; y < 56; y++)
    for (let x = 36; x < 60; x++) {
      if (!inEllipse(x, y, 47, 47, 10, 7)) continue
      const jag = (x * 13 + y * 7) % 5 === 0
      setPx(p, x, y, jag ? hull[3] : h('#140e0a'))
    }
  // portholes
  for (const px of [24, 80, 100]) {
    ellipse(p, px, 44, 3.2, 3.2, h('#c8a048'))
    ellipse(p, px, 44, 2, 2, h('#1c2c38'))
    setPx(p, px - 1, 43, h('#58a0b0'))
  }
  // hatch in door cell (4, 4)
  R(p, 64, 60, 16, 20, h('#3a2a1e'))
  R(p, 66, 62, 12, 18, h('#140e0a'))
  hl(p, 64, 79, 60, h('#c8a048'))
  vl(p, 64, 60, 79, hull[0])
  vl(p, 79, 60, 79, hull[3])
  for (let y = 66; y < 80; y += 4) hl(p, 67, 76, y, h('#241a12'))
  // broken main mast with a torn sail, and a snapped foremast
  R(p, 58, 0, 4, 22, mast[1])
  vl(p, 58, 0, 21, mast[0])
  vl(p, 61, 0, 21, mast[2])
  hl(p, 44, 74, 5, mast[2])
  hl(p, 44, 74, 6, mast[3])
  for (let y = 7; y < 20; y++)
    for (let x = 46; x < 74; x++) {
      if (x >= 58 && x <= 61) continue
      const torn = (x * 3 + y * 5) % 11 === 0 || (y > 13 && (x + y) % 6 < 2) || (x > 66 && y > 11) || (x < 50 && y > 15)
      if (torn) continue
      setPx(p, x, y, (x + y) % 9 === 0 ? sail[2] : y < 10 ? sail[0] : sail[1])
    }
  R(p, 26, 10, 4, 12, mast[1])
  vl(p, 26, 10, 21, mast[0])
  line(p, 26, 10, 30, 8, mast[3])
  line(p, 29, 9, 30, 12, mast[2])
  // rail posts along the deck edge
  for (let x = 10; x < 110; x += 7) vl(p, x, deckY(x) - 12, deckY(x) - 9, hull[3])
  outlineAll(p, h('#201810'))
  // foam where the hull meets the water
  for (let x = 6; x < 138; x++) {
    const y = bottomY(x) + 1
    if (x >= 64 && x <= 79) continue
    if ((x & 3) !== 0) setPx(p, x, Math.min(79, y + ((x >> 3) & 1)), h('#f0f8ff'))
  }
  return p
}

function shrine(): P {
  const p = createPixels(48, 48)
  const st = ramp('#c8c4bc')
  const r = ramp('#38a8a0')
  // stone plinth and steps
  for (let y = 38; y <= 47; y++)
    for (let x = 2; x <= 45; x++) {
      let c = (y - 38) % 3 === 0 ? st[0] : st[1]
      if (x === 2 || x === 45) c = st[3]
      if (x === 44) c = st[2]
      setPx(p, x, y, c)
    }
  // pillars
  for (const px of [6, 38]) {
    R(p, px, 18, 5, 21, st[1])
    vl(p, px, 18, 38, st[0])
    vl(p, px + 4, 18, 38, st[2])
  }
  // back wall and the dark sanctum opening (door cell 1, 2)
  R(p, 11, 18, 27, 20, st[2])
  for (let y = 22; y <= 47; y++)
    for (let x = 17; x <= 30; x++) {
      if (y < 27 && !inEllipse(x, y, 24, 27, 7, 5)) continue
      setPx(p, x, y, y > 44 ? h('#2c2838') : h('#141020'))
    }
  // a pearl glinting inside
  ellipse(p, 24, 33, 2.2, 2.2, h('#f0f0ff'))
  setPx(p, 23, 32, h('#ffffff'))
  // curved roof with a shell crest
  roof(p, 0, 4, 47, 18, r, 3, 3, 'tile')
  for (let x = 0; x < 48; x++) {
    const lift = Math.round(Math.abs(x - 23.5) < 20 ? 0 : 2)
    if (lift) setPx(p, x, 18 - lift, 0)
  }
  emblem(p, 24, 8, 5, ramp('#fff4ec'), r[1], (x, y) => {
    if (y >= 3 && y <= 8 && Math.abs(x - 5) <= y - 3 + 1 && (x + y) % 2 === 0) return h('#f0a090')
    return null
  })
  outlineAll(p, h('#202830'))
  return p
}

// ---------------------------------------------------------------- entry

const cache = new Map<string, P>()

export function building(kind: BuildingKind, variant: number): P {
  const key = `${kind}:${variant}`
  let b = cache.get(key)
  if (!b) {
    switch (kind) {
      case 'house':
        b = house(variant)
        break
      case 'hut':
        b = hut(variant)
        break
      case 'haven':
        b = haven()
        break
      case 'market':
        b = market()
        break
      case 'lab':
        b = lab()
        break
      case 'bigHouse':
        b = bigHouse(variant)
        break
      case 'hall':
        b = hall(variant)
        break
      case 'lighthouse':
        b = lighthouse()
        break
      case 'wreck':
        b = wreck()
        break
      case 'shrine':
        b = shrine()
        break
    }
    const size = BUILDING_SIZE[kind]
    if (b.w !== size.w * 16 || b.h !== size.h * 16) throw new Error(`building ${kind} drawn at ${b.w}×${b.h}`)
    cache.set(key, b)
  }
  return { w: b.w, h: b.h, data: new Uint8ClampedArray(b.data) }
}
