/**
 * 24×24 bag icons for every item: balm tins, bottles, seeds, orbs and the
 * key items, each drawn with a lit top-left and a tinted outline.
 */
import type { ItemId } from '../../data/items'
import { createPixels, getPx, hex, inEllipse, line, mixc, outlineOf, ramp, setPx, type Pixels, type Ramp, type Rgba } from './gfx'
import { paintOrb, type OrbKind } from './sprites'

const h = hex
const S = 24

function outlineLayer(layer: Pixels, dark: Rgba): Pixels {
  const p = createPixels(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const c = getPx(layer, x, y)
      if ((c & 255) !== 0) {
        setPx(p, x, y, c)
        continue
      }
      let src = 0
      for (const [ax, ay] of [
        [x, y + 1],
        [x, y - 1],
        [x - 1, y],
        [x + 1, y],
      ] as const) {
        const cc = getPx(layer, ax, ay)
        if ((cc & 255) !== 0) {
          src = cc
          break
        }
      }
      if (src) setPx(p, x, y, mixc(outlineOf(src), dark, 0.5))
    }
  return p
}

/** Fill an ellipse with ramp shading lit from the top-left. */
function ball(p: Pixels, cx: number, cy: number, rx: number, ry: number, r: Ramp): void {
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++)
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (!inEllipse(x, y, cx, cy, rx, ry)) continue
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      const lit = -(nx * 0.62 + ny * 0.78)
      const d = Math.sqrt(nx * nx + ny * ny)
      setPx(p, x, y, lit > 0.5 && d > 0.3 ? r[0] : lit > -0.15 ? r[1] : lit > -0.6 ? r[2] : r[3])
    }
}

function rect(p: Pixels, x: number, y: number, w: number, hh: number, c: Rgba): void {
  for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) setPx(p, xx, yy, c)
}

function sparkle(p: Pixels, x: number, y: number): void {
  const c = h('#fff8d0')
  setPx(p, x, y, h('#ffffff'))
  setPx(p, x - 1, y, c)
  setPx(p, x + 1, y, c)
  setPx(p, x, y - 1, c)
  setPx(p, x, y + 1, c)
}

// ---------------------------------------------------------------- icons

function tin(lid: string, symbol: 'leaf' | 'cross' | 'drop' | 'star'): Pixels {
  const l = createPixels(S, S)
  const L = ramp(lid)
  const body: Ramp = [h('#ffffff'), h('#f0ece4'), h('#d0c8bc'), h('#a8a094')]
  // body cylinder
  for (let y = 11; y <= 19; y++)
    for (let x = 4; x <= 19; x++) {
      const u = (x - 4) / 15
      setPx(l, x, y, u < 0.15 ? body[0] : u < 0.7 ? body[1] : u < 0.9 ? body[2] : body[3])
    }
  for (let x = 4; x <= 19; x++) if (inEllipse(x, 19, 12, 19, 8, 2.4)) setPx(l, x, 20, body[2])
  // coloured band round the tin
  for (let x = 4; x <= 19; x++) {
    const u = (x - 4) / 15
    setPx(l, x, 17, u < 0.7 ? L[1] : L[2])
    setPx(l, x, 18, u < 0.7 ? L[2] : L[3])
  }
  // lid: side band and top ellipse
  for (let y = 8; y <= 11; y++)
    for (let x = 3; x <= 20; x++) {
      const u = (x - 3) / 17
      setPx(l, x, y, u < 0.15 ? L[0] : u < 0.7 ? L[1] : L[2])
    }
  for (let y = 3; y <= 10; y++)
    for (let x = 3; x <= 20; x++) {
      if (!inEllipse(x, y, 12, 7, 9, 3.6)) continue
      const hi = inEllipse(x, y, 10, 6, 5, 1.6)
      setPx(l, x, y, hi ? L[0] : mixc(L[0], L[1], 0.5))
    }
  // symbol on the label
  const sym = L[2]
  if (symbol === 'cross') {
    rect(l, 11, 12, 2, 5, sym)
    rect(l, 9, 13, 6, 2, sym)
  } else if (symbol === 'leaf') {
    for (const [x, y] of [
      [10, 15],
      [11, 14],
      [12, 13],
      [13, 12],
      [11, 13],
      [12, 14],
      [10, 14],
      [13, 13],
    ] as const)
      setPx(l, x, y, sym)
  } else if (symbol === 'drop') {
    for (const [x, y] of [
      [12, 12],
      [11, 13],
      [12, 13],
      [11, 14],
      [12, 14],
      [13, 14],
      [11, 15],
      [12, 15],
    ] as const)
      setPx(l, x, y, sym)
  } else {
    for (const [x, y] of [
      [12, 12],
      [11, 13],
      [12, 13],
      [13, 13],
      [10, 14],
      [11, 14],
      [12, 14],
      [13, 14],
      [14, 14],
      [11, 15],
      [13, 15],
    ] as const)
      setPx(l, x, y, sym)
  }
  return outlineLayer(l, h('#282030'))
}

function remedy(): Pixels {
  const l = createPixels(S, S)
  const glass = ramp('#d88838')
  // bottle body
  for (let y = 10; y <= 21; y++)
    for (let x = 6; x <= 17; x++) {
      if ((y === 10 || y === 21) && (x === 6 || x === 17)) continue
      const u = (x - 6) / 11
      let c = u < 0.2 ? glass[0] : u < 0.65 ? glass[1] : u < 0.88 ? glass[2] : glass[3]
      if (x === 8 && y > 11 && y < 19) c = h('#f8d8a0')
      setPx(l, x, y, c)
    }
  // label
  rect(l, 9, 14, 7, 5, h('#f8f4ec'))
  rect(l, 10, 15, 5, 1, h('#58b058'))
  rect(l, 12, 14, 1, 3, h('#58b058'))
  // neck and bulb
  rect(l, 10, 7, 4, 3, h('#c8c8d0'))
  setPx(l, 10, 7, h('#f0f0f8'))
  ball(l, 12, 4.5, 3.2, 3, ramp('#e84848'))
  return outlineLayer(l, h('#301c10'))
}

function seed(): Pixels {
  const l = createPixels(S, S)
  const gold = ramp('#f0b830')
  for (let y = 8; y <= 21; y++)
    for (let x = 5; x <= 18; x++) {
      // teardrop: round bottom, pointed top
      const t = (y - 8) / 13
      const half = 6.5 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62 + 0.2)
      if (Math.abs(x + 0.5 - 12) > half) continue
      const nx = (x + 0.5 - 12) / 6.5
      const lit = -(nx * 0.7 + (t - 0.5) * 0.9)
      setPx(l, x, y, lit > 0.45 ? gold[0] : lit > -0.2 ? gold[1] : lit > -0.6 ? gold[2] : gold[3])
    }
  // groove
  for (let y = 11; y <= 19; y++) setPx(l, 13, y, gold[2])
  // sprout
  const leaf = ramp('#58c048')
  line(l, 12, 8, 12, 4, leaf[2])
  for (const [x, y] of [
    [9, 3],
    [10, 3],
    [10, 4],
    [11, 4],
    [8, 2],
  ] as const)
    setPx(l, x, y, leaf[1])
  for (const [x, y] of [
    [13, 3],
    [14, 3],
    [14, 2],
    [15, 2],
    [13, 4],
  ] as const)
    setPx(l, x, y, leaf[0])
  const out = outlineLayer(l, h('#302010'))
  sparkle(out, 19, 7)
  return out
}

function ppDrop(): Pixels {
  const l = createPixels(S, S)
  const b = ramp('#4888e8')
  for (let y = 5; y <= 21; y++)
    for (let x = 4; x <= 19; x++) {
      const t = (y - 5) / 16
      const half = t < 0.45 ? 7.2 * Math.sin((t / 0.45) * Math.PI * 0.5) ** 0.8 : 7.2 * Math.sqrt(Math.max(0, 1 - ((t - 0.45) / 0.55) ** 2))
      if (Math.abs(x + 0.5 - 12) > half) continue
      const nx = (x + 0.5 - 12) / 7.2
      const lit = -(nx * 0.7 + (t - 0.55) * 0.9)
      setPx(l, x, y, lit > 0.45 ? b[0] : lit > -0.15 ? b[1] : lit > -0.6 ? b[2] : b[3])
    }
  setPx(l, 9, 12, h('#ffffff'))
  setPx(l, 9, 13, h('#ffffff'))
  setPx(l, 10, 11, h('#e0f0ff'))
  // "PP" mark
  for (const [x, y] of [
    [11, 15],
    [11, 16],
    [11, 17],
    [12, 15],
    [13, 16],
    [12, 16],
  ] as const)
    setPx(l, x, y, h('#f8f8f8'))
  return outlineLayer(l, h('#182048'))
}

function spray(): Pixels {
  const l = createPixels(S, S)
  const can = ramp('#9858d0')
  for (let y = 9; y <= 21; y++)
    for (let x = 7; x <= 16; x++) {
      const u = (x - 7) / 9
      let c = u < 0.2 ? can[0] : u < 0.65 ? can[1] : u < 0.88 ? can[2] : can[3]
      if (y === 13 || y === 14) c = u < 0.65 ? h('#f8f0f8') : h('#d0c0d8')
      setPx(l, x, y, c)
    }
  rect(l, 9, 6, 6, 3, h('#e8e8f0'))
  rect(l, 13, 5, 2, 2, h('#c8c8d0'))
  // puff of scent
  const puff = [h('#f0d8ff'), h('#d8b8f0')]
  for (const [x, y, r] of [
    [18, 5, 1.6],
    [20.5, 3, 1.2],
    [21, 7, 1.1],
  ] as const)
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) if (inEllipse(xx, yy, x, y, r, r)) setPx(l, xx, yy, yy < y ? puff[0] : puff[1])
  return outlineLayer(l, h('#281838'))
}

function wing(): Pixels {
  const l = createPixels(S, S)
  const vane = [h('#ffffff'), h('#e8f0f8'), h('#b8d0e8'), h('#5890d8')]
  // quill from bottom-left to top-right with vanes either side
  for (let i = 0; i <= 16; i++) {
    const x = 4 + i
    const y = 20 - i
    const w = i < 3 ? 0 : Math.round(3.2 * Math.sin(((i - 3) / 13) * Math.PI))
    for (let k = 1; k <= w; k++) {
      setPx(l, x - k, y - k + 1, k === w ? vane[2] : vane[0])
      setPx(l, x + k - 1, y + k, k === w ? vane[3] : vane[1])
      setPx(l, x + k, y + k, k === w ? vane[3] : vane[1])
    }
    setPx(l, x, y, h('#a0a8b8'))
  }
  return outlineLayer(l, h('#20304c'))
}

function shoe(): Pixels {
  const l = createPixels(S, S)
  const up = ramp('#e84838')
  const rows = [
    '.........rrrr.......',
    '........rRRrrd......',
    '........rRrrrd......',
    '.......rRrrrrd......',
    '......rRwwwrrrd.....',
    '.....rRrrwrwrrrd....',
    '...rrRrrrrwrwrrrrd..',
    '..rRRrrrrrrrrrrrrrd.',
    '.rRrrrrrrrrrrrrrrrrd',
    '.rrrrrrrrrrrrrrrrrdd',
    'ssssssssssssssssssss',
    'SSSSSSSSSSSSSSSSSSS.',
  ]
  const pal: Record<string, Rgba> = { r: up[1], R: up[0], d: up[2], w: h('#f8f8f8'), s: h('#f4f4f0'), S: h('#b8b8c4') }
  rows.forEach((row, y) => [...row].forEach((ch, x) => pal[ch] !== undefined && setPx(l, x + 2, y + 6, pal[ch])))
  // a swoosh stripe
  line(l, 7, 15, 15, 12, h('#f8f8f8'))
  line(l, 8, 15, 15, 13, h('#f8f8f8'))
  return outlineLayer(l, h('#301818'))
}

function rod(): Pixels {
  const l = createPixels(S, S)
  // cork handle, reel, blank, line and bobber
  line(l, 3, 20, 7, 16, h('#d8b078'))
  line(l, 4, 20, 8, 16, h('#b08850'))
  line(l, 8, 15, 20, 3, h('#5c3c24'))
  line(l, 9, 15, 20, 4, h('#8c6038'))
  ball(l, 8.5, 17.5, 2.2, 2.2, ramp('#b0b8c8'))
  // line hanging from the tip
  for (let y = 4; y <= 14; y++) setPx(l, 21, y, h('#e8f0f8'))
  const out = outlineLayer(l, h('#281810'))
  // bobber (after outline so the line stays thin)
  ball(out, 21, 16.5, 1.8, 2, ramp('#f04040'))
  setPx(out, 21, 17, h('#f8f8f8'))
  setPx(out, 20, 17, h('#f8f8f8'))
  return out
}

function charm(): Pixels {
  const l = createPixels(S, S)
  const sh = ramp('#40c0c8')
  // a scallop shell fanning up from its hinge
  for (let y = 6; y <= 20; y++)
    for (let x = 3; x <= 20; x++) {
      if (!inEllipse(x, y, 12, 18, 9, 12) || y > 18) continue
      const ang = Math.atan2(x + 0.5 - 12, 18 - (y + 0.5))
      const rib = Math.abs(Math.sin(ang * 5)) < 0.28
      const nx = (x + 0.5 - 12) / 9
      let c = rib ? sh[2] : nx < -0.3 ? sh[0] : sh[1]
      if (nx > 0.6 && !rib) c = sh[2]
      setPx(l, x, y, c)
    }
  rect(l, 9, 18, 6, 3, sh[2])
  rect(l, 10, 18, 4, 1, sh[1])
  // cord loop
  for (let y = 1; y < 7; y++)
    for (let x = 8; x < 16; x++) if (inEllipse(x, y, 12, 4, 3.2, 2.8) && !inEllipse(x, y, 12, 4, 2, 1.6)) setPx(l, x, y, h('#e8c878'))
  const out = outlineLayer(l, h('#10303c'))
  sparkle(out, 7, 10)
  return out
}

function parcel(): Pixels {
  const l = createPixels(S, S)
  const box = ramp('#c89458')
  // top face
  for (let y = 5; y <= 10; y++)
    for (let x = 4 + (10 - y) * 0; x <= 19; x++) setPx(l, x, y, y === 5 ? box[0] : mixc(box[0], box[1], 0.5))
  // front face
  for (let y = 11; y <= 20; y++) for (let x = 4; x <= 19; x++) setPx(l, x, y, x > 16 ? box[2] : box[1])
  for (let x = 4; x <= 19; x++) setPx(l, x, 11, box[2])
  // string
  const str = h('#f0e8d8')
  for (let y = 5; y <= 20; y++) setPx(l, 12, y, str)
  for (let x = 4; x <= 19; x++) setPx(l, x, 8, str)
  setPx(l, 11, 4, str)
  setPx(l, 13, 4, str)
  setPx(l, 10, 3, str)
  setPx(l, 14, 3, str)
  // label
  rect(l, 6, 14, 5, 4, h('#f8f8f0'))
  rect(l, 7, 15, 3, 1, h('#5878c8'))
  return outlineLayer(l, h('#301c0c'))
}

function key(): Pixels {
  const l = createPixels(S, S)
  const brass = ramp('#c89040')
  // bow ring
  for (let y = 2; y < 12; y++)
    for (let x = 2; x < 12; x++) {
      if (!inEllipse(x, y, 7, 7, 4.5, 4.5) || inEllipse(x, y, 7, 7, 2.2, 2.2)) continue
      const lit = x + y < 13
      setPx(l, x, y, lit ? brass[0] : brass[2])
    }
  // shaft diagonal
  for (let i = 0; i < 11; i++) {
    setPx(l, 10 + i, 10 + i, brass[1])
    setPx(l, 11 + i, 10 + i, brass[2])
  }
  // bit teeth
  for (const [x, y] of [
    [17, 20],
    [18, 21],
    [15, 18],
    [16, 19],
    [14, 19],
  ] as const)
    setPx(l, x, y, brass[2])
  // rust spots
  setPx(l, 13, 13, h('#a0502c'))
  setPx(l, 5, 9, h('#a0502c'))
  setPx(l, 18, 18, h('#8c4424'))
  return outlineLayer(l, h('#2c1c0c'))
}

function orbIcon(kind: OrbKind): Pixels {
  const p = createPixels(S, S)
  paintOrb(p, kind, 12, 12.5, 9)
  return p
}

const cache = new Map<ItemId, Pixels>()

export function icon(id: ItemId): Pixels {
  let p = cache.get(id)
  if (!p) {
    switch (id) {
      case 'salve':
        p = tin('#58b858', 'leaf')
        break
      case 'superSalve':
        p = tin('#f08830', 'cross')
        break
      case 'hyperSalve':
        p = tin('#e04890', 'cross')
        break
      case 'fullSalve':
        p = tin('#f8c830', 'star')
        sparkle(p, 20, 4)
        break
      case 'remedy':
        p = remedy()
        break
      case 'revivalSeed':
        p = seed()
        break
      case 'ppDrop':
        p = ppDrop()
        break
      case 'muskSpray':
        p = spray()
        break
      case 'returnWing':
        p = wing()
        break
      case 'orb':
      case 'superOrb':
      case 'hyperOrb':
      case 'tideOrb':
      case 'duskOrb':
        p = orbIcon(id)
        break
      case 'sprintShoes':
        p = shoe()
        break
      case 'driftRod':
        p = rod()
        break
      case 'tideCharm':
        p = charm()
        break
      case 'labParcel':
        p = parcel()
        break
      case 'wreckKey':
        p = key()
        break
    }
    cache.set(id, p)
  }
  return { w: p.w, h: p.h, data: new Uint8ClampedArray(p.data) }
}
