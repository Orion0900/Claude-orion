/**
 * Overworld people: 16×32 chibi sprites for any Look, built from layered
 * parts per facing (down, up, left; right mirrors left) with a standing frame
 * and two walking frames.
 */
import type { BodyType, Facing, Look } from '../look'
import { EYES, HAIR, HAT, HAT_LINE, SKULL, type View } from './heads'
import { createPixels, getPx, hex, mixc, outlineTinted, ramp, setPx, toHsl, type Pixels, type Ramp, type Rgba } from './gfx'

const h = hex

// ---------------------------------------------------------------- palettes

const SKIN: readonly (readonly [string, string, string, string])[] = [
  ['#fff2e6', '#fce0c8', '#eebc9c', '#cc9478'],
  ['#fde2c6', '#f6c49c', '#dc9c74', '#b87656'],
  ['#f2c69a', '#dea676', '#be8056', '#985e3c'],
  ['#d2966a', '#b67650', '#955a38', '#724228'],
  ['#a86e4a', '#8a5636', '#6c3e26', '#4e2a1a'],
]

export interface Colors {
  skin: Ramp
  hair: Ramp
  hat: Ramp
  top: Ramp
  bottom: Ramp
  shoe: Ramp
  white: Ramp
  pack: Ramp
  strap: Ramp
  eye: Rgba
}

/** A look's colour, tolerating malformed strings by falling back. */
function safe(s: string, fallback: string): Rgba {
  try {
    return hex(s)
  } catch {
    return hex(fallback)
  }
}

export function colorsOf(look: Look): Colors {
  const sk = SKIN[look.skin] ?? SKIN[1]
  const top = ramp(safe(look.top, '#e04838'))
  const [th] = toHsl(top[1])
  const packBase = Math.abs(((th - 40 + 540) % 360) - 180) < 40 ? '#48a0e0' : '#f0b030'
  return {
    skin: [h(sk[0]), h(sk[1]), h(sk[2]), h(sk[3])],
    hair: ramp(safe(look.hairColor, '#503020')),
    hat: ramp(safe(look.headwearColor, '#f8f8f8')),
    top,
    bottom: ramp(safe(look.bottom, '#304060')),
    shoe: [h('#8a7c8c'), h('#5c4e60'), h('#3e3244'), h('#2a2030')],
    white: [h('#ffffff'), h('#f0f0ec'), h('#c8ccd8'), h('#9ca0b4')],
    pack: ramp(packBase),
    strap: ramp('#a86c3c'),
    eye: h('#28202c'),
  }
}

// ---------------------------------------------------------------- geometry

export interface Geo {
  headY: number
  torsoTop: number
  torsoBot: number
  legTop: number
  tw: number
  sw: number
  stoop: number
}

const GEO: Record<BodyType, Geo> = {
  kid: { headY: 11, torsoTop: 22, torsoBot: 25, legTop: 26, tw: 8, sw: 6, stoop: 0 },
  teen: { headY: 8, torsoTop: 19, torsoBot: 24, legTop: 25, tw: 8, sw: 6, stoop: 0 },
  adult: { headY: 6, torsoTop: 17, torsoBot: 23, legTop: 24, tw: 10, sw: 7, stoop: 0 },
  elder: { headY: 8, torsoTop: 19, torsoBot: 24, legTop: 25, tw: 10, sw: 7, stoop: 1 },
  big: { headY: 6, torsoTop: 17, torsoBot: 25, legTop: 26, tw: 12, sw: 9, stoop: 0 },
}

export function geoOf(look: Look): Geo {
  const g = GEO[look.body] ?? GEO.teen
  if (look.sex === 'f' && g.tw === 10) return { ...g, tw: 8, sw: 6 }
  return g
}

const LEG_BOT = 28

// ---------------------------------------------------------------- canvas helpers

type Canvas = Pixels

function put(p: Canvas, x: number, y: number, c: Rgba): void {
  setPx(p, x, y, c)
}

function span(p: Canvas, x0: number, x1: number, y: number, c: Rgba): void {
  for (let x = x0; x <= x1; x++) setPx(p, x, y, c)
}

function stampRows(p: Canvas, rows: readonly string[], pal: Readonly<Record<string, Rgba>>, dx: number, dy: number, minRow = 0): void {
  for (let y = minRow; y < rows.length; y++) {
    const row = rows[y]
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]]
      if (c !== undefined) setPx(p, dx + x, dy + y, c)
    }
  }
}

const isSolid = (p: Canvas, x: number, y: number): boolean => (getPx(p, x, y) & 255) !== 0

// ---------------------------------------------------------------- outfits


interface Kit {
  look: Look
  c: Colors
  g: Geo
  view: View
  frame: 0 | 1 | 2
}

/** Whether the outfit gives long sleeves. */
function longSleeves(o: Look['outfit']): boolean {
  return o === 'jacket' || o === 'labcoat' || o === 'uniform' || o === 'robe' || o === 'sailor'
}

function shorts(k: Kit): boolean {
  const o = k.look.outfit
  if (o === 'swimsuit') return true
  if (o === 'tee' || o === 'vest') return k.look.body === 'kid' || k.look.body === 'teen'
  return false
}

/** Colour ramp for the sleeves. */
function sleeveRamp(k: Kit): Ramp {
  const o = k.look.outfit
  if (o === 'labcoat') return k.c.white
  if (o === 'vest') return k.c.white
  if (o === 'swimsuit') return k.c.skin
  return k.c.top
}

/** Paints the arms (and hands) for down/up views. */
function paintArmsFront(p: Canvas, k: Kit): void {
  const { g, look, frame } = k
  const x0 = 8 - g.tw / 2
  const x1 = x0 + g.tw - 1
  const inside = g.tw >= 12
  const ax = inside ? [x0, x1 - 1] : [x0 - 2, x1 + 1]
  const top = g.torsoTop + 1
  const len = g.torsoBot - g.torsoTop + 1
  const sr = sleeveRamp(k)
  const sleeveRows = longSleeves(look.outfit) ? len - 1 : look.outfit === 'swimsuit' ? 0 : 2
  for (let side = 0; side < 2; side++) {
    // walking swings one arm forward (a pixel lower) and the other back
    let swing = 0
    if (frame === 1) swing = side === 0 ? -1 : 1
    if (frame === 2) swing = side === 0 ? 1 : -1
    if (k.view === 'up') swing = -swing
    const n = len + (swing > 0 ? 0 : swing)
    for (let i = 0; i < n; i++) {
      const y = top + i
      const outer = side === 0 ? ax[0] : ax[1] + 1
      const inner = side === 0 ? ax[0] + 1 : ax[1]
      const isHand = i >= n - 1
      const isSleeve = i < sleeveRows && !isHand
      const r = isHand ? k.c.skin : isSleeve ? sr : k.c.skin
      const lit = side === 0
      put(p, outer, y, lit ? r[1] : r[2])
      put(p, inner, y, lit ? r[2] : r[3])
      if (i === 0) put(p, outer, y, lit ? r[0] : r[1])
    }
  }
}

/** Torso for the down/up views. */
function paintTorsoFront(p: Canvas, k: Kit): void {
  const { g, look, c, view } = k
  const x0 = 8 - g.tw / 2
  const x1 = x0 + g.tw - 1
  const T = c.top
  const back = view === 'up'
  for (let y = g.torsoTop; y <= g.torsoBot; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y - g.torsoTop
      const edgeR = x === x1
      const edgeL = x === x0
      const mid = x === 7 || x === 8
      let col = T[1]
      if (edgeR || y === g.torsoBot) col = T[2]
      if (edgeL && i > 0) col = T[1]
      if (i === 0 && (x === x0 || x === x1)) col = T[2]
      switch (look.outfit) {
        case 'tee':
          if (!back && i <= 1 && mid) col = c.skin[i === 0 ? 1 : 2]
          break
        case 'jacket':
          if (!back && mid) col = i < 2 ? c.white[1] : c.white[2]
          if (!back && (x === 6 || x === 9) && i < 3) col = T[0]
          break
        case 'dress':
          if (!back && i === 0 && mid) col = c.skin[2]
          if (y === g.torsoBot) col = T[2]
          break
        case 'labcoat': {
          const W = c.white
          col = edgeR ? W[2] : W[1]
          if (!back && mid) col = i === 0 ? c.skin[2] : T[1]
          if (!back && (x === 6 || x === 9)) col = W[2]
          if (back && x === 8 && i > 2) col = W[2]
          break
        }
        case 'uniform':
          if (y === g.torsoBot) col = c.bottom[3]
          else if (!back && x === 8 && i > 0 && i % 2 === 1) col = mixc(T[0], h('#f8e070'), 0.6)
          if (!back && i === 0 && mid) col = T[0]
          break
        case 'swimsuit':
          if (look.sex === 'm') col = edgeR ? c.skin[2] : c.skin[1]
          else if (!back && i === 0 && (x < 7 || x > 8) && !edgeL && !edgeR) col = c.skin[1]
          if (look.sex === 'm' && y === g.torsoBot) col = c.bottom[1]
          break
        case 'overalls': {
          const B = c.bottom
          const bib = x >= x0 + 2 && x <= x1 - 2
          if (!back && bib && i >= 2) col = i === 2 ? B[0] : B[1]
          if (back && i >= 3) col = B[1]
          if ((x === x0 + 1 || x === x1 - 1) && i < 3) col = B[2]
          if (i >= g.torsoBot - g.torsoTop - 1) col = edgeR ? B[2] : B[1]
          if (!back && x === 7 && i === 3) col = B[0]
          break
        }
        case 'robe':
          if (y === g.torsoBot) col = c.bottom[1]
          if (!back && i < 3 && (x === 7 || x === 8)) col = x === 7 ? T[0] : T[2]
          break
        case 'vest': {
          const W = c.white
          const open = x >= x0 + 2 && x <= x1 - 2
          if (!back && open) col = i === 0 && mid ? c.skin[2] : W[1]
          if (!back && open && x === x1 - 2) col = W[2]
          if (y === g.torsoBot && !back) col = open ? W[2] : T[2]
          break
        }
        case 'sailor': {
          const collar = T[1] === c.white[1] || toHsl(T[1])[2] > 0.72 ? ramp('#304c98') : c.white
          if (!back && i <= 1 && x >= x0 + 1 && x <= x1 - 1) col = collar[1]
          if (!back && i === 1 && (x === x0 + 1 || x === x1 - 1)) col = collar[0]
          if (!back && i === 2 && mid) col = h('#e84848')
          if (!back && i === 1 && mid) col = h('#e84848')
          if (back && i <= 2 && x >= x0 + 1 && x <= x1 - 1) col = i === 2 ? collar[0] : collar[1]
          break
        }
      }
      put(p, x, y, col)
    }
}

/** Legs, skirts and shoes for the down/up views. */
function paintLegsFront(p: Canvas, k: Kit): void {
  const { g, look, c, frame } = k
  const lw = g.tw >= 10 ? 4 : 3
  const B = c.bottom
  const o = look.outfit
  const bare = o === 'swimsuit'
  for (let side = 0; side < 2; side++) {
    // frame 1 has the left foot forward: facing us that planted foot is on our right,
    // seen from behind it is on our left, so the other foot lifts
    const back = k.view === 'up' ? 1 - side : side
    const lift = (frame === 1 && back === 0) || (frame === 2 && back === 1) ? 1 : 0
    const xa = side === 0 ? 8 - lw : 8
    const xb = side === 0 ? 7 : 7 + lw
    for (let y = g.legTop; y <= LEG_BOT - lift; y++) {
      const i = y - g.legTop
      let r: Ramp = B
      if (shorts(k) && i >= 1) r = c.skin
      if (o === 'dress' || o === 'robe') r = c.skin
      if (bare && i >= 1) r = c.skin
      for (let x = xa; x <= xb; x++) {
        let col = r[1]
        if (x === xb && side === 0) col = r[2]
        if (x === xa && side === 1) col = r[2]
        if (x === xb && side === 1) col = r[2]
        put(p, x, y, col)
      }
    }
    // shoes
    const sy = LEG_BOT + 1 - lift
    const S = bare ? c.skin : c.shoe
    for (let x = xa; x <= xb; x++) {
      put(p, x, sy, S[bare ? 1 : 1])
      put(p, x, sy + 1, S[2])
    }
    put(p, side === 0 ? xa : xb, sy, S[side === 0 ? 0 : 2])
  }
  // skirts and robes hang over the legs
  const x0 = 8 - g.tw / 2
  const x1 = x0 + g.tw - 1
  const T = c.top
  if (o === 'dress') {
    const len = look.body === 'kid' ? 2 : 3
    for (let i = 0; i < len; i++) {
      const flare = look.sex === 'f' ? Math.min(1, i) : 0
      const y = g.legTop + i
      for (let x = x0 - flare; x <= x1 + flare; x++) put(p, x, y, x >= x1 + flare - 1 ? T[2] : i === len - 1 ? T[2] : T[1])
    }
  }
  if (o === 'robe') {
    for (let y = g.legTop; y <= LEG_BOT; y++) {
      const flare = y > g.legTop + 1 && look.sex === 'f' ? 1 : 0
      for (let x = x0 - flare; x <= x1 + flare; x++) {
        let col = T[1]
        if (x >= x1 + flare - 1) col = T[2]
        if (x === 8 && k.view === 'down') col = T[2]
        if (y === LEG_BOT) col = T[2]
        put(p, x, y, col)
      }
    }
  }
  if (o === 'labcoat') {
    for (let y = g.legTop; y <= g.legTop + 1; y++) {
      for (let x = x0; x <= x0 + 1; x++) put(p, x, y, c.white[x === x0 ? 1 : 2])
      for (let x = x1 - 1; x <= x1; x++) put(p, x, y, c.white[2])
      if (k.view === 'up') for (let x = x0; x <= x1; x++) put(p, x, y, x === 8 ? c.white[2] : c.white[1])
    }
  }
  if (o === 'sailor' && look.sex === 'f') {
    for (let i = 0; i < 2; i++) {
      const y = g.legTop + i
      for (let x = x0 - i; x <= x1 + i; x++) put(p, x, y, (x & 1) === 0 ? B[1] : B[2])
    }
    for (let y = g.legTop + 2; y <= LEG_BOT; y++)
      for (let x = 8 - lw; x <= 7 + lw; x++) if (isSolid(p, x, y) && getPx(p, x, y) !== c.shoe[1] && getPx(p, x, y) !== c.shoe[2]) put(p, x, y, x === 7 || x === 8 ? c.skin[2] : c.skin[1])
  }
}

// ---------------------------------------------------------------- side view

function paintSide(p: Canvas, k: Kit, layer: 'back' | 'front'): void {
  const { g, look, c, frame } = k
  const T = c.top
  const B = c.bottom
  const o = look.outfit
  const cx = 8
  const x0 = cx - Math.floor(g.sw / 2)
  const x1 = x0 + g.sw - 1
  const lw = g.sw >= 9 ? 4 : 3
  if (layer === 'back') {
    // legs: a stride on walking frames, together when standing
    const legH = LEG_BOT - g.legTop + 1
    const strides: [number, number, boolean][] =
      frame === 0
        ? [[0, 0, true]]
        : [
            [3, 0, false],
            [-3, 0, true],
          ]
    if (frame === 2) {
      strides[0][2] = true
      strides[1][2] = false
    }
    for (const [foot, , near] of strides) {
      for (let i = 0; i < legH; i++) {
        const y = g.legTop + i
        const off = Math.round((foot * (i + 1)) / legH)
        const xa = cx - Math.ceil(lw / 2) + off
        let r: Ramp = B
        if (shorts(k) && i >= 1) r = c.skin
        if (o === 'dress' || o === 'robe') r = c.skin
        for (let x = xa; x < xa + lw; x++) put(p, x, y, near ? (x === xa + lw - 1 ? r[2] : r[1]) : r[2])
      }
      const sx = cx - Math.ceil(lw / 2) + foot
      const S = o === 'swimsuit' ? c.skin : c.shoe
      for (let x = sx - 1; x < sx + lw; x++) {
        put(p, x, LEG_BOT + 1, near ? S[1] : S[2])
        put(p, x, LEG_BOT + 2, S[2])
      }
      put(p, sx - 1, LEG_BOT + 1, near ? S[0] : S[1])
    }
    // backpack behind the body
    if (look.accessory === 'backpack') {
      const P = c.pack
      for (let y = g.torsoTop + 1; y <= g.torsoBot; y++)
        for (let x = x1 - 1; x <= x1 + 2; x++) put(p, x, y, x === x1 + 2 || y === g.torsoBot ? P[2] : y === g.torsoTop + 1 ? P[0] : P[1])
    }
    return
  }
  // torso
  for (let y = g.torsoTop; y <= g.torsoBot; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y - g.torsoTop
      let col = x === x1 ? T[2] : x === x0 ? T[0] : T[1]
      if (y === g.torsoBot) col = T[2]
      switch (o) {
        case 'labcoat':
          col = x === x1 ? c.white[2] : c.white[1]
          if (x === x0 && i > 0) col = T[1]
          break
        case 'swimsuit':
          if (look.sex === 'm') col = x === x1 ? c.skin[2] : c.skin[1]
          if (look.sex === 'm' && y === g.torsoBot) col = B[1]
          break
        case 'uniform':
          if (y === g.torsoBot) col = B[3]
          break
        case 'overalls':
          if (i >= 2) col = x === x1 ? B[2] : B[1]
          break
        case 'robe':
          if (y === g.torsoBot) col = B[1]
          break
        case 'vest':
          if (x === x0 || x === x0 + 1) col = c.white[1]
          break
        case 'jacket':
          if (x === x0) col = c.white[1]
          break
        case 'sailor':
          if (i <= 1 && x > x0 + 1) col = (T[1] === c.white[1] || toHsl(T[1])[2] > 0.72 ? ramp('#304c98') : c.white)[1]
          if (i === 1 && x === x0) col = h('#e84848')
          break
        case 'tee':
        case 'dress':
          break
      }
      put(p, x, y, col)
    }
  if (look.accessory === 'backpack') {
    for (let y = g.torsoTop + 1; y <= g.torsoTop + 3; y++) put(p, x0 + 1, y, c.pack[3])
  }
  // skirt / robe / labcoat tails
  if (o === 'dress' || o === 'robe' || o === 'labcoat' || (o === 'sailor' && look.sex === 'f')) {
    const len = o === 'robe' ? LEG_BOT - g.legTop + 1 : o === 'labcoat' ? 2 : look.body === 'kid' ? 2 : 3
    const R = o === 'labcoat' ? c.white : o === 'sailor' ? B : T
    for (let i = 0; i < len; i++) {
      const flare = look.sex === 'f' && i > 0 ? 1 : 0
      const y = g.legTop + i
      for (let x = x0 - flare; x <= x1 + (o === 'robe' ? 0 : flare); x++) put(p, x, y, x >= x1 ? R[2] : i === len - 1 ? R[2] : R[1])
    }
  }
  // the near arm, swinging
  const len = g.torsoBot - g.torsoTop + 1
  const sr = sleeveRamp(k)
  const sleeveRows = longSleeves(o) ? len - 1 : o === 'swimsuit' ? 0 : 2
  const swing = frame === 1 ? -1 : frame === 2 ? 1 : 0
  const ax = cx - 1
  for (let i = 0; i < len; i++) {
    const y = g.torsoTop + 1 + i
    const off = Math.round((swing * 2 * i) / len)
    const isHand = i === len - 1
    const r = isHand ? c.skin : i < sleeveRows ? sr : c.skin
    put(p, ax + off, y, r[1])
    put(p, ax + 1 + off, y, r[2])
    if (i === 0) put(p, ax + off, y, r[0])
  }
  if (look.accessory === 'satchel') {
    const S = c.strap
    for (let y = g.torsoTop + 1; y < g.torsoBot; y++) put(p, cx + 1, y, S[2])
    for (let y = g.torsoBot - 1; y <= g.torsoBot + 1; y++) for (let x = cx - 1; x <= cx + 2; x++) put(p, x, y, y === g.torsoBot - 1 ? S[0] : x === cx + 2 ? S[2] : S[1])
  }
}

// ---------------------------------------------------------------- heads

function hairPal(c: Colors): Record<string, Rgba> {
  return { H: c.hair[0], h: c.hair[1], d: c.hair[2], D: c.hair[3], L: c.skin[0], x: mixc(c.hat[1], h('#e04848'), 0.5) }
}

function paintHead(p: Canvas, k: Kit): void {
  const { look, c, g, view } = k
  const hx = view === 'left' ? -g.stoop : 0
  const hy = g.headY + (look.body === 'elder' ? 1 : 0)
  const skinPal = { s: c.skin[1], S: c.skin[2], L: c.skin[0] }
  stampRows(p, SKULL[view], skinPal, hx, hy)
  const hat = look.headwear
  const line = HAT_LINE[hat] ?? 0
  const hairRows = HAIR[look.hair][view]
  const hp = hairPal(c)
  if (look.hair === 'mohawk' && view !== 'up') {
    // shaved sides: a faint stubble tone over the skull top
    const stub = mixc(c.skin[2], c.hair[2], 0.35)
    stampRows(p, ['................', '................', '.....ssssss.....', '...ssssssssss...', '..ssssssssssss..', '..ssssssssssss..'], { s: stub }, hx, hy)
  }
  if (look.hair === 'mohawk' && view === 'up') {
    const stub = mixc(c.skin[2], c.hair[2], 0.35)
    stampRows(p, SKULL.up.slice(0, 10), { s: stub, S: stub, L: stub }, hx, hy)
  }
  if (hat === 'none') stampRows(p, hairRows, hp, hx, hy)
  else {
    // under a hat, hair above the brim is hidden and the rest stays within the skull's width
    const trimmed = hairRows.map((row, y) => (y < 10 ? '..' + row.slice(2, 14) + '..' : row))
    stampRows(p, trimmed, hp, hx, hy, line)
  }
  // eyes (and glasses) go on before the hat so brims can shade them
  if (view !== 'up') {
    for (const [ex, ey] of EYES[view]) put(p, ex + hx, ey + hy, c.eye)
    if (view === 'down') {
      // a touch of cheek colour under the eyes
      put(p, 4 + hx, 9 + hy, mixc(c.skin[1], h('#f08080'), 0.35))
      put(p, 11 + hx, 9 + hy, mixc(c.skin[1], h('#f08080'), 0.35))
    }
  }
  if (look.accessory === 'glasses' && view !== 'up') {
    const fr = h('#383848')
    const glint = h('#e8f8ff')
    if (view === 'down') {
      // rims drawn as a bar over the eyes with bright lenses beside them
      span(p, 4 + hx, 11 + hx, 6 + hy, fr)
      for (const ex of [4, 9]) {
        put(p, ex + hx, 7 + hy, glint)
        put(p, ex + 2 + hx, 7 + hy, glint)
        put(p, ex + hx, 8 + hy, fr)
        put(p, ex + 2 + hx, 8 + hy, fr)
      }
    } else {
      span(p, 3 + hx, 7 + hx, 6 + hy, fr)
      put(p, 3 + hx, 7 + hy, glint)
      put(p, 5 + hx, 7 + hy, glint)
      put(p, 3 + hx, 8 + hy, fr)
      put(p, 5 + hx, 8 + hy, fr)
      put(p, 6 + hx, 7 + hy, fr)
      put(p, 7 + hx, 7 + hy, fr)
    }
  }
  if (hat !== 'none') {
    const H = c.hat
    const accent = hat === 'sunhat' ? ramp(mixc(H[1], h('#e05050'), 0.7)) : hat === 'captain' ? ramp('#e8c040') : ramp(mixc(H[1], 0xffffffff, 0.45))
    const pal: Record<string, Rgba> = {
      A: H[0],
      a: H[1],
      b: H[2],
      B: H[3],
      x: accent[1],
      X: accent[2],
      w: hat === 'captain' ? h('#f8f8f8') : mixc(H[1], 0xffffffff, 0.7),
      W: hat === 'captain' ? h('#c8ccd8') : H[2],
      k: hat === 'captain' ? H[1] : H[3],
    }
    if (hat === 'cap') {
      pal.x = H[1]
      pal.X = H[3]
    }
    if (hat === 'captain') pal.B = h('#202028')
    stampRows(p, HAT[hat][view], pal, hx, hy)
  }
}

// ---------------------------------------------------------------- accessories (front views)

function paintAccessoryFront(p: Canvas, k: Kit, stage: 'under' | 'over'): void {
  const { look, c, g, view } = k
  const x0 = 8 - g.tw / 2
  const x1 = x0 + g.tw - 1
  if (look.accessory === 'backpack') {
    const P = c.pack
    if (view === 'up' && stage === 'over') {
      for (let y = g.torsoTop + 1; y <= g.torsoBot; y++)
        for (let x = x0 + 1; x <= x1 - 1; x++) {
          const i = y - g.torsoTop - 1
          let col = P[1]
          if (i === 0) col = P[0]
          if (i === 1) col = P[2]
          if (x === x1 - 1) col = P[2]
          if (y === g.torsoBot) col = P[3]
          if (i === 3 && x > x0 + 2 && x < x1 - 2) col = P[0]
          put(p, x, y, col)
        }
    }
    if (view === 'down' && stage === 'over') {
      for (let y = g.torsoTop + 1; y <= g.torsoTop + 3; y++) {
        put(p, x0 + 1, y, P[2])
        put(p, x1 - 1, y, P[3])
      }
    }
    if (view === 'down' && stage === 'under') {
      // the pack's top shows over the shoulders
      span(p, x0 - 1, x1 + 1, g.torsoTop, P[2])
    }
  }
  if (look.accessory === 'satchel' && stage === 'over') {
    const S = c.strap
    const n = g.torsoBot - g.torsoTop
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const x = view === 'down' ? Math.round(x0 + t * (x1 - x0)) : Math.round(x1 - t * (x1 - x0))
      put(p, x, g.torsoTop + i, S[2])
    }
    const bx = view === 'down' ? x1 - 1 : x0 - 1
    for (let y = g.torsoBot - 1; y <= g.torsoBot + 1; y++)
      for (let x = bx; x <= bx + 3; x++) put(p, x, y, y === g.torsoBot - 1 ? S[0] : x === bx + 3 ? S[2] : S[1])
  }
}

function paintRod(p: Canvas, k: Kit): void {
  const { g, view } = k
  const shaft = h('#b07840')
  const dark = h('#6c4424')
  const tip = h('#f0e8d8')
  const reel = h('#b8c0d0')
  if (view === 'left') {
    const hx = 6
    const hy = g.torsoBot
    for (let i = 0; i < 15; i++) {
      const x = hx - Math.round(i * 0.42)
      const y = hy - i
      put(p, x, y, i > 12 ? tip : shaft)
    }
    put(p, hx + 1, hy - 1, reel)
    return
  }
  // held in the right hand, the rod leans out past the shoulder
  const hx = view === 'down' ? 8 + g.tw / 2 + 1 : 8 - g.tw / 2 - 2
  const dir = view === 'down' ? 1 : -1
  const hy = g.torsoBot + 1
  for (let i = 0; i < 17; i++) {
    const x = hx + dir * Math.round(i * 0.12)
    const y = hy - i
    put(p, x, y, i > 14 ? tip : i < 3 ? dark : shaft)
  }
  put(p, hx - dir, hy - 2, reel)
}

// ---------------------------------------------------------------- assembly

const OUTLINE = h('#302028')

function build(look: Look, view: View, frame: 0 | 1 | 2): Pixels {
  const p = createPixels(16, 32)
  const k: Kit = { look, c: colorsOf(look), g: geoOf(look), view, frame }
  if (view === 'left') {
    paintSide(p, k, 'back')
    paintSide(p, k, 'front')
    paintHead(p, k)
    if (look.accessory === 'rod') paintRod(p, k)
  } else {
    if (look.accessory === 'rod' && view === 'up') paintRod(p, k)
    paintAccessoryFront(p, k, 'under')
    paintLegsFront(p, k)
    paintTorsoFront(p, k)
    paintArmsFront(p, k)
    if (view === 'down') paintAccessoryFront(p, k, 'over')
    paintHead(p, k)
    if (view === 'up') paintAccessoryFront(p, k, 'over')
    if (look.accessory === 'rod' && view === 'down') paintRod(p, k)
  }
  // a dark line under the chin separates head from body
  const chinY = k.g.headY + (look.body === 'elder' ? 1 : 0) + 12
  if (view !== 'up') {
    for (let x = 0; x < 16; x++) if (isSolid(p, x, chinY - 1) && isSolid(p, x, chinY)) {
      const above = getPx(p, x, chinY - 1)
      if (above === k.c.skin[2] || above === k.c.skin[1]) put(p, x, chinY, mixc(k.c.skin[3], OUTLINE, 0.4))
    }
  }
  return outlineTinted(p, OUTLINE, 0.55)
}

const cache = new Map<string, Pixels>()

function lookKey(l: Look): string {
  return [l.body, l.sex, l.skin, l.hair, l.hairColor, l.headwear, l.headwearColor, l.outfit, l.top, l.bottom, l.accessory].join('|')
}

export function person(look: Look, facing: Facing, frame: 0 | 1 | 2): Pixels {
  const key = `${lookKey(look)}|${facing}|${frame}`
  let hit = cache.get(key)
  if (!hit) {
    if (facing === 'right') {
      const src = person(look, 'left', frame)
      hit = createPixels(16, 32)
      for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) setPx(hit, 15 - x, y, getPx(src, x, y))
    } else hit = build(look, facing, frame)
    if (cache.size > 2048) cache.clear()
    cache.set(key, hit)
  }
  return { w: hit.w, h: hit.h, data: new Uint8ClampedArray(hit.data) }
}

