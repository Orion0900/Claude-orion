/**
 * Large people: the 64×64 battle portrait (waist up, facing the player) and
 * the player's back view winding up to throw an orb. Drawn per pixel from
 * simple shapes in layers, lit from the top left, outlined in a tint.
 */
import type { Look } from '../look'
import { colorsOf, type Colors } from './people'
import { createPixels, getPx, hex, inEllipse, mixc, outlineOf, ramp, setPx, type Pixels, type Ramp, type Rgba } from './gfx'
import { paintOrb } from './sprites'

const h = hex
const OUT = h('#302028')

interface Layered {
  p: Pixels
}

/** Draws a shape given an inside test and a colour function. */
function fill(L: Layered, inside: (x: number, y: number) => boolean, color: (x: number, y: number) => Rgba, x0 = 0, y0 = 0, x1 = 63, y1 = 63): void {
  for (let y = Math.max(0, y0); y <= Math.min(63, y1); y++)
    for (let x = Math.max(0, x0); x <= Math.min(63, x1); x++) if (inside(x, y)) setPx(L.p, x, y, color(x, y))
}

/** Tone from a ramp by how lit a point is (-1 dark … 1 lit). */
function tone(r: Ramp, lit: number): Rgba {
  return lit > 0.5 ? r[0] : lit > -0.2 ? r[1] : lit > -0.65 ? r[2] : r[3]
}

function shadeEllipse(r: Ramp, cx: number, cy: number, rx: number, ry: number): (x: number, y: number) => Rgba {
  return (x, y) => {
    const nx = (x + 0.5 - cx) / rx
    const ny = (y + 0.5 - cy) / ry
    return tone(r, -(nx * 0.7 + ny * 0.6) + 0.1)
  }
}

/** Inks the old pixels that border a newly drawn layer (e.g. under the chin). */
function inkEdges(before: Pixels, after: Pixels, col: Rgba): void {
  const snap = { w: 64, h: 64, data: new Uint8ClampedArray(after.data) }
  const isNew = (x: number, y: number): boolean => {
    const a = getPx(snap, x, y)
    return (a & 255) !== 0 && a !== getPx(before, x, y)
  }
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      if (isNew(x, y)) continue
      const b = getPx(snap, x, y)
      if ((b & 255) === 0) continue
      // an old pixel just below or beside the new layer gets the ink line
      if (isNew(x, y - 1)) setPx(after, x, y, col)
    }
}

function outlineFig(p: Pixels): Pixels {
  const out = createPixels(64, 64)
  out.data.set(p.data)
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      if ((getPx(p, x, y) & 255) !== 0) continue
      let src = 0
      for (const [ax, ay] of [
        [x, y + 1],
        [x, y - 1],
        [x - 1, y],
        [x + 1, y],
      ] as const) {
        const c = getPx(p, ax, ay)
        if ((c & 255) !== 0) {
          src = c
          break
        }
      }
      if (src) setPx(out, x, y, mixc(outlineOf(src), OUT, 0.55))
    }
  return out
}

// ---------------------------------------------------------------- shared shapes

const HEAD = { cx: 32, cy: 22, rx: 11.5, ry: 12.5 }

function inHeadShape(x: number, y: number, cx = HEAD.cx, cy = HEAD.cy): boolean {
  const px = x + 0.5
  const py = y + 0.5
  // round skull, jaw tapering to a soft chin
  if (py < cy + 3) return inEllipse(x, y, cx, cy, HEAD.rx, HEAD.ry)
  const t = (py - (cy + 3)) / (HEAD.ry - 2)
  if (t > 1) return false
  const half = HEAD.rx * (1 - 0.55 * t * t) - (t > 0.8 ? (t - 0.8) * 10 : 0)
  return Math.abs(px - cx) <= half
}

function longSleeves(o: Look['outfit']): boolean {
  return o === 'jacket' || o === 'labcoat' || o === 'uniform' || o === 'robe' || o === 'sailor'
}

function collarRamp(c: Colors): Ramp {
  return c.white
}

// ---------------------------------------------------------------- portrait

function hairTopMask(style: Look['hair'], x: number, y: number): boolean {
  const px = x + 0.5
  const py = y + 0.5
  const cx = HEAD.cx
  switch (style) {
    case 'bald':
      return false
    case 'mohawk':
      return Math.abs(px - cx) < 4 && py > 0 && py < 18 && inEllipse(x, y, cx, 13, 5, 13)
    case 'spiky': {
      if (inEllipse(x, y, cx, 20, 13, 13.5) && py < 19) return true
      // spikes along the crown
      const k = Math.floor((px - 16) / 6)
      const u = (px - 16) / 6 - k
      const tipY = 2 + ((k * 7) % 3) * 2
      if (px > 16 && px < 49 && py < 14 && py > tipY + Math.abs(u - 0.5) * 16) return true
      return false
    }
    case 'curly': {
      const r = 15 + 1.2 * Math.sin(Math.atan2(py - 20, px - cx) * 9)
      return Math.hypot(px - cx, (py - 20) * 1.05) < r && py < 24 && (py < 15 || Math.abs(px - cx) > 9.5)
    }
    default:
      return inEllipse(x, y, cx, 20.5, 13, 13.5) && py < 19
  }
}

/** Fringe over the forehead: jagged bottom edge. */
function fringe(style: Look['hair'], x: number, y: number): boolean {
  const px = x + 0.5
  const py = y + 0.5
  if (style === 'bald' || style === 'mohawk') return false
  if (!inEllipse(x, y, HEAD.cx, 21, 12.6, 13.5)) return false
  const k = Math.floor((px - 20) / 4)
  const u = (px - 20) / 4 - k
  const depth = style === 'spiky' ? 17 : style === 'curly' ? 14.5 : 16
  const edge = depth + (1 - Math.abs(u - 0.5) * 2) * (style === 'spiky' ? 3 : 2) - ((k & 1) === 0 ? 1 : 0)
  return py < edge
}

/** Hair that falls at the sides and behind the shoulders (drawn behind the body). */
function hairBack(style: Look['hair'], x: number, y: number): boolean {
  const px = x + 0.5
  const py = y + 0.5
  switch (style) {
    case 'long':
      return (inEllipse(x, y, 32, 22, 15, 14) || (py >= 22 && py < 54 && Math.abs(px - 32) < 16 - (py - 22) * 0.05)) && py < 54
    case 'bob':
      return inEllipse(x, y, 32, 23, 15, 13) && py < 35
    case 'curly':
      return inEllipse(x, y, 32, 24, 16.5, 14)
    case 'ponytail':
      return inEllipse(x, y, 47, 30, 4.5, 12) && py > 20
    case 'bun':
      return inEllipse(x, y, 32, 6, 6.5, 5.5)
    case 'braids':
      return false
    default:
      return false
  }
}

/** Side locks framing the face (drawn over the face edges). */
function sideLocks(style: Look['hair'], x: number, y: number): boolean {
  const px = x + 0.5
  const py = y + 0.5
  const dx = Math.abs(px - 32)
  switch (style) {
    case 'short':
    case 'spiky':
    case 'ponytail':
    case 'bun':
      return dx > 9.5 && dx < 13 && py > 14 && py < 25
    case 'long':
    case 'bob':
      return dx > 9 && dx < 14 && py > 14 && py < (style === 'bob' ? 34 : 38)
    case 'curly':
      return dx > 9 && dx < 15 && py > 14 && py < 30
    case 'braids':
      return dx > 9.5 && dx < 13 && py > 14 && py < 26
    case 'bald':
      return dx > 10.5 && dx < 13.5 && py > 15 && py < 25
    default:
      return false
  }
}

function braid(x: number, y: number): boolean {
  const py = y + 0.5
  for (const bx of [19.5, 44.5]) {
    if (py < 24 || py > 55) continue
    const seg = Math.floor((py - 24) / 4)
    const wob = seg % 2 === 0 ? 0 : 0.6
    if (Math.abs(x + 0.5 - bx - wob) < 2.4) return true
  }
  return false
}

function paintEyes(L: Layered, c: Colors, look: Look): void {
  const eye = h('#282030')
  const iris = mixc(c.hair[2], h('#3858b0'), 0.45)
  const irisLt = mixc(iris, h('#ffffff'), 0.3)
  for (const ex of [24, 36]) {
    // lash line, iris with a pupil, two glints, lower lid
    for (let x = ex - (ex < 32 ? 1 : 0); x <= ex + 3 + (ex > 32 ? 1 : 0); x++) setPx(L.p, x, 19, eye)
    for (let y = 20; y <= 24; y++)
      for (let x = ex; x < ex + 4; x++) {
        let col = x === ex || x === ex + 3 ? eye : iris
        if (y >= 22 && x > ex && x < ex + 3) col = y === 24 ? irisLt : iris
        if (y === 21 && x > ex && x < ex + 3) col = eye
        setPx(L.p, x, y, col)
      }
    setPx(L.p, ex + 1, 20, h('#ffffff'))
    setPx(L.p, ex + 1, 21, h('#ffffff'))
    setPx(L.p, ex + 2, 23, h('#e0e8ff'))
    setPx(L.p, ex, 24, c.skin[2])
    setPx(L.p, ex + 3, 24, c.skin[2])
    // brows angle down toward the nose
    const brow = c.hair[3]
    const inner = ex < 32 ? ex + 3 : ex
    const outer = ex < 32 ? ex : ex + 3
    setPx(L.p, outer, 16, brow)
    setPx(L.p, (outer + inner) >> 1, 16, brow)
    setPx(L.p, ex + 1, 16, brow)
    setPx(L.p, ex + 2, 16, brow)
    setPx(L.p, inner, 17, brow)
  }
  // nose and mouth
  setPx(L.p, 32, 27, c.skin[2])
  setPx(L.p, 33, 27, c.skin[2])
  const mouth = mixc(c.skin[3], h('#a03040'), 0.4)
  for (let x = 30; x <= 34; x++) setPx(L.p, x, 30, mouth)
  setPx(L.p, 29, 29, mouth)
  setPx(L.p, 35, 29, mouth)
  // cheeks
  const blush = mixc(c.skin[1], h('#f07878'), 0.35)
  setPx(L.p, 23, 26, blush)
  setPx(L.p, 24, 26, blush)
  setPx(L.p, 40, 26, blush)
  setPx(L.p, 41, 26, blush)
  if (look.accessory === 'glasses') {
    const fr = h('#383848')
    for (const ex of [23, 35]) {
      for (let x = ex; x <= ex + 5; x++) {
        setPx(L.p, x, 18, fr)
        setPx(L.p, x, 25, fr)
      }
      for (let y = 18; y <= 25; y++) {
        setPx(L.p, ex, y, fr)
        setPx(L.p, ex + 5, y, fr)
      }
      setPx(L.p, ex + 4, 19, h('#e0f4ff'))
    }
    for (let x = 29; x <= 34; x++) setPx(L.p, x, 19, fr)
  }
}

function paintTorso(L: Layered, c: Colors, look: Look, top: number): void {
  const T = c.top
  const B = c.bottom
  const o = look.outfit
  const big = look.body === 'big'
  const slim = look.sex === 'f' || look.body === 'kid'
  const half = big ? 23 : slim ? 17 : 19
  const armW = big ? 8 : 7
  const inside = (x: number, y: number): boolean => {
    if (y < top) return false
    const t = y - top
    // rounded shoulders
    const w = t < 6 ? half - (6 - t) * (6 - t) * 0.22 : half - (slim && t > 16 ? 1 : 0)
    return Math.abs(x + 0.5 - 32) < w
  }
  const sleeveR: Ramp = o === 'labcoat' || o === 'vest' ? c.white : o === 'swimsuit' ? c.skin : T
  const shortSleeve = o === 'tee' || o === 'overalls' || o === 'dress' || o === 'vest' || o === 'swimsuit'
  const col = (x: number, y: number): Rgba => {
    const dx = x + 0.5 - 32
    const ax = Math.abs(dx)
    const t = y - top
    const inArm = ax > half - armW && t > 3
    if (inArm) {
      // arms: lit on their left edge, shaded toward the right
      const u = dx < 0 ? (dx + half) / armW : (dx - (half - armW)) / armW
      let r: Ramp = sleeveR
      if (shortSleeve && t > 12) r = c.skin
      if (o === 'swimsuit') r = c.skin
      if (Math.abs(ax - (half - armW)) < 0.8) return r[3]
      if (shortSleeve && t === 12 && o !== 'swimsuit') return r === c.skin ? sleeveR[2] : r[2]
      const lit = dx < 0 ? (u < 0.3 ? 1 : 0) : u > 0.7 ? -1 : 0
      return lit > 0 ? r[0] : lit < 0 ? r[2] : r[1]
    }
    // chest
    let r: Ramp = T
    switch (o) {
      case 'labcoat':
        r = ax < 5 ? T : c.white
        break
      case 'vest':
        r = ax < half - armW - 4 ? c.white : T
        break
      case 'jacket':
        r = ax < 4 ? c.white : T
        break
      case 'overalls':
        r = t > 8 ? B : T
        break
      case 'swimsuit':
        r = look.sex === 'm' ? c.skin : T
        if (look.sex === 'f' && t < 4 && ax > 5) r = c.skin
        break
      default:
        break
    }
    let v = r[1]
    if (dx < -(half - armW - 3) && t < 14) v = r[0]
    if (dx > half - armW - 4) v = r[2]
    if (t === 0 || (t < 3 && ax > half - armW - 3)) v = r[0]
    // a soft fold under the chest on the shaded side
    if (t >= 16 && t <= 19 && Math.abs(dx - (4 + (t - 16))) < 0.6) v = r[2]
    // collars and details
    if (o === 'tee' && t < 3 && ax < 5 - t) v = c.skin[2]
    if (o === 'dress' && t < 3 && ax < 6) v = c.skin[2]
    if (o === 'jacket' && ax >= 4 && ax < 6.5 && t < 12) v = T[0]
    if (o === 'jacket' && Math.abs(ax - 4) < 0.6 && t >= 12) v = T[3]
    if (o === 'labcoat' && Math.abs(ax - 5) < 0.6) v = c.white[3]
    if (o === 'labcoat' && ax >= 5.5 && ax < 8 && t < 10) v = c.white[0]
    if (o === 'uniform') {
      if (ax < 1 && t > 3 && t % 5 === 2) v = h('#f8d860')
      if (t < 3 && ax < 6) v = T[0]
      if (t >= 24 && t < 27) v = B[3]
    }
    if (o === 'sailor') {
      const cr = collarRamp(c)
      if (t < 8 && ax < 12 - t * 0.6 && ax > 1) v = t < 7 ? cr[1] : cr[2]
      if (t >= 2 && t < 8 && Math.abs(ax - (11 - t * 0.6)) < 1) v = h('#3050a8')
      if (ax < 3 && t >= 5 && t < 11) v = h('#e04848')
    }
    if (o === 'robe') {
      if (ax < 1.5 && t < 16) v = r[2]
      if (t >= 20 && t < 23) v = dx < 0 ? B[1] : B[2]
    }
    if (o === 'overalls') {
      if (Math.abs(ax - 6) < 1.2 && t <= 8) v = B[1]
      if (t > 8 && t < 11 && ax < half - armW - 2 && ax > 3) v = B[0]
      if (t === 12 && (ax === 3.5 || Math.abs(ax - 3.5) < 0.6)) v = h('#f8d860')
    }
    if (o === 'vest' && Math.abs(ax - (half - armW - 4)) < 0.6) v = T[3]
    if (o === 'swimsuit' && look.sex === 'm' && t > 22) v = dx < 0 ? B[1] : B[2]
    return v
  }
  fill(L, inside, col, 0, top, 63, 63)
  // neck shadow
  for (let x = 28; x <= 36; x++) setPx(L.p, x, top, c.skin[3])
}

function paintHeadwear(L: Layered, c: Colors, look: Look): void {
  const H = c.hat
  const hw = look.headwear
  if (hw === 'none') return
  const cx = 32
  switch (hw) {
    case 'cap':
      fill(L, (x, y) => inEllipse(x, y, cx, 17, 13.5, 12.5) && y < 16, shadeEllipse(H, cx, 10, 13, 9))
      fill(L, (x, y) => y >= 15 && y <= 18 && inEllipse(x, y, cx, 14, 16, 5), (x, y) => (y === 18 ? H[3] : x < cx ? H[1] : H[2]))
      setPx(L.p, cx, 4, H[0])
      setPx(L.p, cx + 1, 4, H[1])
      break
    case 'bandana':
      fill(L, (x, y) => inEllipse(x, y, cx, 19, 13.3, 13.5) && y < 15, (x, y) => ((x * 3 + y * 5) % 11 === 0 ? mixc(H[1], h('#ffffff'), 0.7) : shadeEllipse(H, cx, 10, 13, 9)(x, y)))
      fill(L, (x, y) => y >= 13 && y <= 15 && Math.abs(x + 0.5 - cx) < 13.5, (x) => (x < cx ? H[1] : H[2]))
      // knot and tails
      fill(L, (x, y) => inEllipse(x, y, 47, 15, 3, 2.5) || (y > 15 && y < 24 && x >= 47 && x <= 50 && x - 47 < (y - 15) * 0.5 + 1), (x, y) => (x + y) % 3 === 0 ? H[3] : H[2])
      break
    case 'sunhat':
      fill(L, (x, y) => inEllipse(x, y, cx, 14, 24, 5.5), (x, y) => (y > 15 ? H[2] : x < cx - 6 ? H[0] : H[1]))
      fill(L, (x, y) => inEllipse(x, y, cx, 9, 11, 9) && y < 13, shadeEllipse(H, cx, 6, 11, 8))
      fill(L, (x, y) => y >= 10 && y <= 12 && inEllipse(x, y, cx, 9, 11.2, 9), (x) => (x < cx ? mixc(H[1], h('#e05050'), 0.7) : mixc(H[2], h('#b03030'), 0.7)))
      break
    case 'beanie':
      fill(L, (x, y) => inEllipse(x, y, cx, 17, 13.5, 13.5) && y < 17, (x, y) => (x % 3 === 0 ? H[2] : shadeEllipse(H, cx, 10, 13, 9)(x, y)))
      fill(L, (x, y) => y >= 14 && y <= 18 && Math.abs(x + 0.5 - cx) < 14, (x) => (x % 2 === 0 ? H[1] : H[2]))
      fill(L, (x, y) => inEllipse(x, y, cx, 3, 3.5, 3), shadeEllipse(ramp(mixc(H[1], h('#ffffff'), 0.5)), cx, 3, 3.5, 3))
      break
    case 'hardhat':
      fill(L, (x, y) => inEllipse(x, y, cx, 16, 14, 13) && y < 16, (x, y) => (Math.abs(x + 0.5 - cx) < 1.5 ? H[0] : shadeEllipse(H, cx - 3, 8, 14, 10)(x, y)))
      fill(L, (x, y) => y >= 15 && y <= 17 && Math.abs(x + 0.5 - cx) < 17, (_x, y) => (y === 17 ? H[3] : H[2]))
      break
    case 'captain':
      fill(L, (x, y) => y >= 2 && y <= 12 && Math.abs(x + 0.5 - cx) < 14 - (12 - y) * 0.1, (x, y) => (y < 4 ? h('#ffffff') : x > cx + 8 ? h('#c8ccd8') : h('#f4f4f4')))
      fill(L, (x, y) => y >= 12 && y <= 15 && Math.abs(x + 0.5 - cx) < 13.5, () => H[1])
      fill(L, (x, y) => inEllipse(x, y, cx, 11, 3.2, 3), (x, y) => (x + y < cx + 11 ? h('#fff0a0') : h('#e0b030')))
      fill(L, (x, y) => y >= 16 && y <= 17 && Math.abs(x + 0.5 - cx) < 14, () => h('#202028'))
      break
    case 'hood':
      fill(
        L,
        (x, y) => {
          const outer = inEllipse(x, y, cx, 22, 16, 17) || (y > 30 && y < 40 && Math.abs(x + 0.5 - cx) < 19)
          const face = inEllipse(x, y, cx, 24, 10.5, 11.5) && y > 13
          return outer && !face
        },
        (x, y) => {
          const nx = (x + 0.5 - cx) / 16
          const ny = (y + 0.5 - 22) / 17
          const lit = -(nx * 0.7 + ny * 0.5)
          if (inEllipse(x, y, cx, 24, 12, 13) && !inEllipse(x, y, cx, 24, 10.5, 11.5)) return H[3]
          return tone(H, lit)
        },
      )
      break
  }
}

function paintPortrait(look: Look): Pixels {
  const c = colorsOf(look)
  const L: Layered = { p: createPixels(64, 64) }
  const kid = look.body === 'kid'
  const torsoTop = kid ? 36 : 35
  // hair behind everything
  if (look.headwear !== 'hood') fill(L, (x, y) => hairBack(look.hair, x, y), (x, y) => tone(c.hair, -((x + 0.5 - 32) / 16) * 0.8 - 0.1 - (y > 34 ? 0.3 : 0)))
  // backpack straps peek behind shoulders
  if (look.accessory === 'backpack') fill(L, (x, y) => y > 34 && y < 44 && Math.abs(x + 0.5 - 32) > 14 && Math.abs(x + 0.5 - 32) < 20, (x) => (x < 32 ? c.pack[1] : c.pack[2]))
  paintTorso(L, c, look, torsoTop)
  // neck
  fill(L, (x, y) => y >= 30 && y <= torsoTop && Math.abs(x + 0.5 - 32) < 4.5, (x) => (x < 31 ? c.skin[1] : c.skin[2]))
  // ears and head
  fill(L, (x, y) => inEllipse(x, y, 20.5, 23, 2.2, 3.2) || inEllipse(x, y, 43.5, 23, 2.2, 3.2), (x) => (x < 32 ? c.skin[1] : c.skin[2]))
  const before = { w: 64, h: 64, data: new Uint8ClampedArray(L.p.data) }
  fill(L, (x, y) => inHeadShape(x, y), (x, y) => {
    const nx = (x + 0.5 - 32) / HEAD.rx
    const ny = (y + 0.5 - 22) / HEAD.ry
    const lit = -(nx * 0.8 + ny * 0.3) + 0.25
    return lit > 0.75 ? c.skin[0] : lit > -0.45 ? c.skin[1] : c.skin[2]
  })
  inkEdges(before, L.p, mixc(c.skin[3], OUT, 0.5))
  paintEyes(L, c, look)
  // hair on top
  if (look.headwear !== 'hood') {
    const hairCol = (x: number, y: number): Rgba => {
      const nx = (x + 0.5 - 32) / 13
      const ny = (y + 0.5 - 12) / 12
      let lit = -(nx * 0.75 + ny * 0.55)
      if (look.hair === 'curly' && (x * 5 + y * 3) % 7 === 0) lit -= 0.6
      // a glossy band
      if (Math.abs(y + 0.5 - (9 + nx * 3)) < 1 && nx < 0.3) lit = 1
      return tone(c.hair, lit)
    }
    const hatLine = look.headwear === 'none' ? -1 : look.headwear === 'sunhat' ? 14 : 16
    fill(L, (x, y) => y > hatLine && (hairTopMask(look.hair, x, y) || fringe(look.hair, x, y) || sideLocks(look.hair, x, y)), hairCol)
    if (look.hair === 'braids') fill(L, braid, (x, y) => (((y - 24) >> 1) % 2 === 0 ? (x < 32 ? c.hair[1] : c.hair[2]) : c.hair[3]))
    if (look.hair === 'mohawk') fill(L, (x, y) => inHeadShape(x, y) && y < 14 && !hairTopMask('mohawk', x, y), () => mixc(c.skin[2], c.hair[2], 0.35))
    if (look.hair === 'bald') {
      setPx(L.p, 26, 12, c.skin[0])
      setPx(L.p, 27, 11, c.skin[0])
      setPx(L.p, 28, 11, c.skin[0])
    }
  }
  // the fringe casts a soft shadow on the forehead
  {
    const hairCols = new Set<number>(c.hair)
    const snap = { w: 64, h: 64, data: new Uint8ClampedArray(L.p.data) }
    for (let y = 1; y < 34; y++)
      for (let x = 0; x < 64; x++) {
        const cur = getPx(snap, x, y)
        if ((cur === c.skin[0] || cur === c.skin[1]) && hairCols.has(getPx(snap, x, y - 1))) setPx(L.p, x, y, c.skin[2])
      }
  }
  paintHeadwear(L, c, look)
  // accessories over the body
  if (look.accessory === 'backpack') {
    const P = c.pack
    fill(L, (x, y) => y > torsoTop && y < 64 && Math.abs(x + 0.5 - 32 - 8.5) < 1.5, (_x, y) => (y === torsoTop + 1 ? P[1] : P[2]))
    fill(L, (x, y) => y > torsoTop && y < 64 && Math.abs(x + 0.5 - 32 + 8.5) < 1.5, (_x, y) => (y === torsoTop + 1 ? P[0] : P[1]))
  }
  if (look.accessory === 'satchel') {
    const S = c.strap
    for (let i = 0; i < 30; i++) {
      const x = 44 - Math.round(i * 0.9)
      const y = torsoTop + 1 + i
      setPx(L.p, x, y, S[1])
      setPx(L.p, x + 1, y, S[2])
      setPx(L.p, x - 1, y, S[0])
    }
  }
  if (look.accessory === 'rod') {
    for (let i = 0; i < 40; i++) {
      const x = 50 + Math.round(i * 0.3)
      const y = 62 - i
      setPx(L.p, x, y, i > 34 ? h('#f0e8d8') : h('#8c5a30'))
      setPx(L.p, x + 1, y, i > 34 ? h('#c8c0b0') : h('#5c3a20'))
    }
  }
  return outlineFig(L.p)
}

// ---------------------------------------------------------------- back view

function paintBack(look: Look, frame: 0 | 1 | 2 | 3): Pixels {
  const c = colorsOf(look)
  const L: Layered = { p: createPixels(64, 64) }
  const cx = 28
  const hy = 18
  const top = 32
  const T = c.top
  const o = look.outfit
  const sleeve = o === 'labcoat' ? c.white : longSleeves(o) || o === 'jacket' ? T : c.skin
  // the throwing arm, behind the body when wound up
  const arm = (layer: 'back' | 'front'): void => {
    // shoulder at (cx + 14, top + 4)
    const sx = cx + 14
    const sy = top + 5
    let ex: number
    let ey: number
    let orbAt: [number, number] | null = null
    switch (frame) {
      case 0:
        ex = sx + 2
        ey = sy + 24
        break
      case 1:
        ex = sx + 12
        ey = sy + 4
        orbAt = [ex + 3, ey - 3]
        break
      case 2:
        ex = sx + 6
        ey = sy - 22
        orbAt = [ex + 1, ey - 4]
        break
      default:
        ex = sx + 16
        ey = sy - 12
        break
    }
    const wantBack = frame === 1
    if ((layer === 'back') !== wantBack) return
    const steps = 28
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = sx + (ex - sx) * t
      const y = sy + (ey - sy) * t
      const r = t > 0.85 ? 3 : 3.6
      const hand = t > 0.85
      const rp: Ramp = hand ? c.skin : sleeve
      for (let yy = Math.floor(y - r); yy <= y + r; yy++)
        for (let xx = Math.floor(x - r); xx <= x + r; xx++) if (inEllipse(xx, yy, x, y, r, r)) setPx(L.p, xx, yy, xx + yy < x + y ? rp[1] : rp[2])
    }
    if (orbAt) paintOrb(L.p, 'orb', orbAt[0], orbAt[1], 4)
  }
  arm('back')
  // body: rounded shoulders tapering a touch toward the waist
  const half = look.body === 'big' ? 20 : look.sex === 'f' || look.body === 'kid' ? 15 : 17
  const bodyHalf = (y: number): number => {
    const t = y - top
    if (t < 0) return -1
    if (t < 7) return half * Math.sqrt(1 - ((7 - t) / 7.5) ** 2)
    return half - Math.min(2, (t - 7) / 10)
  }
  fill(
    L,
    (x, y) => Math.abs(x + 0.5 - cx) < bodyHalf(y),
    (x, y) => {
      const dx = (x + 0.5 - cx) / half
      const t = y - top
      let r: Ramp = o === 'labcoat' ? c.white : T
      if (o === 'overalls' && t > 10) r = c.bottom
      if (o === 'swimsuit' && look.sex === 'm') r = c.skin
      const lit = -dx * 0.9 + 0.15 - t / 70 + (t < 4 ? 0.3 : 0)
      let v = tone(r, lit)
      if (o === 'sailor' && t < 12 && Math.abs(dx) < 0.75) v = t === 10 || t === 11 ? h('#3050a8') : c.white[1]
      if (o === 'vest' && Math.abs(dx) > 0.72) v = tone(c.white, -dx)
      if (o === 'overalls' && t <= 10 && Math.abs(Math.abs(dx) - 0.35) < 0.08) v = c.bottom[1]
      if (o === 'robe' && t > 18 && t < 21) v = tone(c.bottom, -dx)
      if (o === 'uniform' && t > 26 && t < 29) v = c.bottom[3]
      if (o === 'jacket' && Math.abs(dx) < 0.04 && t > 6) v = T[2]
      return v
    },
    0,
    top,
    63,
    63,
  )
  // resting left arm, a little apart from the body
  const ax = cx - half + 1
  fill(
    L,
    (x, y) => y > top + 3 && y < 64 && inEllipse(x, y, ax, top + 30, 4, 27) && x + 0.5 < ax + 3,
    (x, y) => {
      const hand = y > top + 25
      const r = hand ? c.skin : sleeve
      return x + 0.5 < ax - 1 ? r[1] : r[2]
    },
  )
  for (let y = top + 8; y < 64; y++) setPx(L.p, ax + 3, y, mixc((o === 'labcoat' ? c.white : T)[3], OUT, 0.3))
  // neck
  fill(L, (x, y) => y >= hy + 8 && y <= top + 1 && Math.abs(x + 0.5 - cx) < 5, () => c.skin[2])
  // head seen from behind: all hair (or skin when bald)
  const headIn = (x: number, y: number): boolean => inEllipse(x, y, cx, hy, 12.5, 13) && !(y > hy + 9 && Math.abs(x + 0.5 - cx) < 4 && (look.hair === 'short' || look.hair === 'spiky' || look.hair === 'mohawk' || look.hair === 'bald'))
  const bald = look.hair === 'bald' || look.hair === 'mohawk'
  fill(L, (x, y) => inEllipse(x, y, cx - 12.6, hy + 2, 2.2, 3.2) || inEllipse(x, y, cx + 12.6, hy + 2, 2.2, 3.2), () => c.skin[2])
  fill(L, headIn, (x, y) => {
    const nx = (x + 0.5 - cx) / 12.5
    const ny = (y + 0.5 - hy) / 13
    const lit = -(nx * 0.75 + ny * 0.5)
    if (bald) return tone(c.skin, lit)
    if (Math.abs(y + 0.5 - (hy - 6 + nx * 2)) < 1 && nx < 0.2) return c.hair[0]
    // strands sweep down from the crown
    const strand = Math.round((x + 0.5 - cx) * (1 + (y - hy) / 30)) % 5 === 0 && y > hy - 4
    return tone(c.hair, lit - (strand ? 0.45 : 0))
  })
  if (look.hair === 'mohawk') fill(L, (x, y) => Math.abs(x + 0.5 - cx) < 3.5 && y < hy + 8 && inEllipse(x, y, cx, hy - 1, 5, 14), (x) => (x < cx ? c.hair[1] : c.hair[2]))
  // long styles hang down the back
  const hs = look.hair
  if (look.headwear !== 'hood') {
    if (hs === 'long') fill(L, (x, y) => y > hy && y < 54 && Math.abs(x + 0.5 - cx) < 13 - (y - hy) * 0.08, (x, y) => tone(c.hair, -((x + 0.5 - cx) / 12) - (y - hy) / 60))
    if (hs === 'bob' || hs === 'curly') fill(L, (x, y) => y > hy && y < hy + 13 && Math.abs(x + 0.5 - cx) < 14, (x) => tone(c.hair, -((x + 0.5 - cx) / 12)))
    if (hs === 'ponytail') fill(L, (x, y) => inEllipse(x, y, cx, hy + 18, 4, 11), (x) => tone(c.hair, -((x + 0.5 - cx) / 4)))
    if (hs === 'braids')
      for (const bx of [cx - 6, cx + 6])
        fill(L, (x, y) => y > hy + 6 && y < 52 && Math.abs(x + 0.5 - bx) < 2.4, (_x, y) => ((y >> 2) % 2 === 0 ? c.hair[1] : c.hair[2]))
    if (hs === 'bun') fill(L, (x, y) => inEllipse(x, y, cx, hy - 10, 6, 5), (x) => tone(c.hair, -((x + 0.5 - cx) / 6)))
    if (hs === 'spiky' && look.headwear === 'none')
      fill(L, (x, y) => {
        const k = Math.floor((x - 14) / 5)
        const u = (x - 14) / 5 - k
        return x > 14 && x < 44 && y < hy - 8 && y > hy - 16 + Math.abs(u - 0.5) * 14 + (k % 2) * 2
      }, (x) => tone(c.hair, -((x + 0.5 - cx) / 12)))
  }
  // headwear from behind
  const H = c.hat
  switch (look.headwear) {
    case 'cap':
      fill(L, (x, y) => inEllipse(x, y, cx, hy - 1, 13, 12.5) && y < hy + 1, shadeEllipse(H, cx - 3, hy - 8, 13, 10))
      fill(L, (x, y) => y >= hy - 2 && y <= hy && Math.abs(x + 0.5 - cx) < 3, () => mixc(H[1], h('#ffffff'), 0.6))
      break
    case 'bandana':
      fill(L, (x, y) => inEllipse(x, y, cx, hy + 1, 13, 13) && y < hy - 1, shadeEllipse(H, cx - 3, hy - 8, 13, 10))
      fill(L, (x, y) => inEllipse(x, y, cx, hy, 3, 2.5) || (y > hy && y < hy + 12 && Math.abs(x + 0.5 - cx - (y - hy) * 0.3) < 1.6) || (y > hy && y < hy + 10 && Math.abs(x + 0.5 - cx + (y - hy) * 0.35) < 1.6), (x) => (x < cx ? H[1] : H[2]))
      break
    case 'sunhat':
      fill(L, (x, y) => inEllipse(x, y, cx, hy - 2, 24, 6), (x, y) => (y > hy - 1 ? H[2] : x < cx - 6 ? H[0] : H[1]))
      fill(L, (x, y) => inEllipse(x, y, cx, hy - 8, 11, 9) && y < hy - 3, shadeEllipse(H, cx - 2, hy - 12, 11, 8))
      fill(L, (x, y) => y >= hy - 6 && y <= hy - 4 && inEllipse(x, y, cx, hy - 8, 11.2, 9), () => mixc(H[1], h('#e05050'), 0.7))
      break
    case 'beanie':
      fill(L, (x, y) => inEllipse(x, y, cx, hy, 13.5, 13.5) && y < hy + 1, (x, y) => (x % 3 === 0 ? H[2] : shadeEllipse(H, cx - 3, hy - 8, 13, 10)(x, y)))
      fill(L, (x, y) => inEllipse(x, y, cx, hy - 14, 3.5, 3), () => mixc(H[1], h('#ffffff'), 0.5))
      break
    case 'hardhat':
      fill(L, (x, y) => inEllipse(x, y, cx, hy, 14, 13) && y < hy + 1, (x, y) => (Math.abs(x + 0.5 - cx) < 1.5 ? H[0] : shadeEllipse(H, cx - 4, hy - 8, 14, 10)(x, y)))
      fill(L, (x, y) => y >= hy && y <= hy + 1 && Math.abs(x + 0.5 - cx) < 16, () => H[2])
      break
    case 'captain':
      fill(L, (x, y) => y >= hy - 14 && y <= hy - 3 && Math.abs(x + 0.5 - cx) < 14, (x) => (x > cx + 8 ? h('#c8ccd8') : h('#f4f4f4')))
      fill(L, (x, y) => y >= hy - 3 && y <= hy && Math.abs(x + 0.5 - cx) < 13.5, () => H[1])
      break
    case 'hood':
      fill(L, (x, y) => inEllipse(x, y, cx, hy + 1, 15, 15) || (y > hy + 8 && y < top + 8 && Math.abs(x + 0.5 - cx) < 18), (x, y) => tone(H, -((x + 0.5 - cx) / 15) * 0.8 - (y - hy) / 40))
      break
  }
  // pack on the back
  if (look.accessory === 'backpack') {
    const P = c.pack
    fill(L, (x, y) => y >= top + 6 && y < 64 && Math.abs(x + 0.5 - cx) < 11, (x, y) => {
      const t = y - top - 6
      if (t < 2) return P[0]
      if (t === 7 || t === 8) return P[2]
      if (Math.abs(x + 0.5 - cx) > 9.5) return x < cx ? P[1] : P[3]
      if (t > 14 && t < 22 && Math.abs(x + 0.5 - cx) < 6) return t === 15 ? P[0] : P[1]
      return x < cx - 4 ? P[1] : P[2]
    })
  }
  if (look.accessory === 'satchel') {
    for (let i = 0; i < 30; i++) {
      setPx(L.p, cx - 14 + Math.round(i * 0.9), top + 2 + i, c.strap[1])
      setPx(L.p, cx - 13 + Math.round(i * 0.9), top + 2 + i, c.strap[2])
    }
  }
  if (look.accessory === 'rod') {
    for (let i = 0; i < 40; i++) {
      setPx(L.p, cx - 16 + Math.round(i * 0.35), 62 - i, h('#8c5a30'))
      setPx(L.p, cx - 15 + Math.round(i * 0.35), 62 - i, h('#5c3a20'))
    }
  }
  arm('front')
  return outlineFig(L.p)
}

const pcache = new Map<string, Pixels>()

function key(l: Look): string {
  return [l.body, l.sex, l.skin, l.hair, l.hairColor, l.headwear, l.headwearColor, l.outfit, l.top, l.bottom, l.accessory].join('|')
}

export function portrait(look: Look): Pixels {
  const k = key(look)
  let p = pcache.get(k)
  if (!p) {
    p = paintPortrait(look)
    if (pcache.size > 512) pcache.clear()
    pcache.set(k, p)
  }
  return { w: 64, h: 64, data: new Uint8ClampedArray(p.data) }
}

export function back(look: Look, frame: 0 | 1 | 2 | 3): Pixels {
  const k = `${key(look)}|${frame}`
  let p = pcache.get(k)
  if (!p) {
    p = paintBack(look, frame)
    if (pcache.size > 512) pcache.clear()
    pcache.set(k, p)
  }
  return { w: 64, h: 64, data: new Uint8ClampedArray(p.data) }
}

