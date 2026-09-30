/**
 * Battle stage art: 240×112 backdrops in horizontal bands, handheld style,
 * and the oval grounds each beast stands on.
 */
import { createPixels, getPx, hash, hex, ihash, inEllipse, mixc, outlineOf, ramp, setPx, type Pixels, type Rgba } from './gfx'

export type BattleBg = 'grass' | 'cave' | 'beach' | 'water' | 'indoor' | 'wreck' | 'night'

const h = hex
const W = 240
const H = 112

function band(p: Pixels, y0: number, y1: number, c: Rgba): void {
  for (let y = y0; y <= y1; y++) for (let x = 0; x < W; x++) setPx(p, x, y, c)
}

/** Vertical gradient in hard bands (no dithering), top to bottom. */
function bands(p: Pixels, y0: number, y1: number, cols: readonly Rgba[]): void {
  const n = cols.length
  for (let y = y0; y <= y1; y++) {
    const i = Math.min(n - 1, Math.floor(((y - y0) / (y1 - y0 + 1)) * n))
    for (let x = 0; x < W; x++) setPx(p, x, y, cols[i])
  }
}

function cloud(p: Pixels, cx: number, cy: number, w: number, lit: Rgba, shade: Rgba): void {
  const puffs: [number, number, number][] = [
    [-w * 0.3, 0, w * 0.28],
    [0, -w * 0.12, w * 0.33],
    [w * 0.32, 0, w * 0.26],
  ]
  for (let y = Math.floor(cy - w * 0.5); y <= cy + w * 0.3; y++)
    for (let x = Math.floor(cx - w); x <= cx + w; x++) {
      let inside = false
      for (const [dx, dy, r] of puffs) if (inEllipse(x, y, cx + dx, cy + dy, r * 1.3, r * 0.8)) inside = true
      if (!inside || y > cy + w * 0.15) continue
      setPx(p, x, y, y > cy + w * 0.02 ? shade : lit)
    }
}

/** A row of rounded treetops or hills along a baseline. */
function canopyLine(p: Pixels, base: number, height: number, bump: number, seed: number, cols: readonly Rgba[], bottom = H - 1): void {
  for (let x = 0; x < W; x++) {
    const k = Math.floor(x / bump)
    const u = (x - k * bump) / bump
    const hk = height * (0.65 + 0.35 * hash(k, 0, seed))
    const top = base - Math.round(Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) * hk)
    for (let y = top; y <= bottom; y++) {
      const d = y - top
      let c = cols[1]
      if (d === 0) c = cols[3]
      else if (d <= 2 && u < 0.55) c = cols[0]
      else if (u > 0.78) c = cols[2]
      setPx(p, x, y, c)
    }
  }
}

function grassBg(night = false): Pixels {
  const p = createPixels(W, H)
  if (night) {
    bands(p, 0, 66, [h('#101838'), h('#18244c'), h('#20305c'), h('#2c3c6c'), h('#384878'), h('#384878')])
    // stars
    for (let i = 0; i < 70; i++) {
      const x = ihash(i, 1, 9) % W
      const y = ihash(i, 2, 9) % 48
      setPx(p, x, y, i % 7 === 0 ? h('#fff8c0') : h('#c8d0f0'))
      if (i % 11 === 0) {
        setPx(p, x - 1, y, h('#6878b0'))
        setPx(p, x + 1, y, h('#6878b0'))
        setPx(p, x, y - 1, h('#6878b0'))
        setPx(p, x, y + 1, h('#6878b0'))
      }
    }
    // moon
    for (let y = 4; y < 26; y++)
      for (let x = 186; x < 212; x++) {
        if (!inEllipse(x, y, 198, 15, 9, 9)) continue
        const cut = inEllipse(x, y, 202, 12, 8, 8)
        if (cut) continue
        setPx(p, x, y, x < 194 ? h('#fffae0') : h('#f0e8b8'))
      }
    canopyLine(p, 60, 16, 22, 3, [h('#2c4c58'), h('#203c48'), h('#18303c'), h('#10202c')])
    canopyLine(p, 68, 10, 14, 5, [h('#28503c'), h('#1c4030'), h('#163426'), h('#0e241a')])
    bands(p, 66, 111, [h('#2c5a3c'), h('#306244'), h('#346a48'), h('#387250'), h('#3c7a54')])
    for (let y = 70; y < H; y += 7) for (let x = (y * 3) % 11; x < W; x += 11) {
      setPx(p, x, y, h('#4c8c60'))
      setPx(p, x + 1, y - 1, h('#4c8c60'))
    }
    return p
  }
  bands(p, 0, 50, [h('#88c8f8'), h('#98d0f8'), h('#a8d8f8'), h('#b8e0f8'), h('#c8e8f8'), h('#d8f0f8')])
  cloud(p, 40, 14, 18, h('#ffffff'), h('#d8ecf8'))
  cloud(p, 150, 24, 14, h('#ffffff'), h('#d8ecf8'))
  cloud(p, 214, 10, 11, h('#ffffff'), h('#d8ecf8'))
  canopyLine(p, 50, 12, 26, 11, [h('#78b8a0'), h('#68a890'), h('#5c9884'), h('#4c8474')])
  canopyLine(p, 60, 12, 17, 13, [h('#70c060'), h('#58a850'), h('#489440'), h('#347c34')])
  bands(p, 58, 111, [h('#88d070'), h('#90d478'), h('#98d880'), h('#a0dc88'), h('#98d880'), h('#90d478')])
  // light tufts scattered on the meadow, sparser near the horizon
  for (let i = 0; i < 90; i++) {
    const y = 62 + Math.floor(Math.pow(hash(i, 3, 17), 0.7) * 48)
    const x = ihash(i, 4, 17) % W
    setPx(p, x, y, h('#68b858'))
    setPx(p, x + 2, y, h('#68b858'))
    setPx(p, x + 1, y - 1, h('#b8e8a0'))
  }
  return p
}

function caveBg(): Pixels {
  const p = createPixels(W, H)
  bands(p, 0, 70, [h('#2c2428'), h('#342a2c'), h('#3c3032'), h('#463836'), h('#50403c'), h('#5a4840')])
  // rock wall ridges
  for (let x = 0; x < W; x++) {
    const k = Math.floor(x / 9)
    const u = (x % 9) / 9
    for (let y = 16; y < 66; y++) {
      if (u < 0.15) setPx(p, x, y, mixc(getPx(p, x, y), h('#806858'), 0.35))
      if (u > 0.85) setPx(p, x, y, mixc(getPx(p, x, y), h('#181010'), 0.4))
    }
    // stalactites
    const len = 4 + (ihash(k, 0, 5) % 18)
    if (u > 0.2 && u < 0.8) {
      const w = Math.abs(u - 0.5) * 2
      const l = Math.round(len * (1 - w))
      for (let y = 0; y < l; y++) setPx(p, x, y, u < 0.5 ? h('#5a4a44') : h('#3c3030'))
    }
  }
  // glowing larvae
  for (let i = 0; i < 26; i++) {
    const x = ihash(i, 1, 21) % W
    const y = 8 + (ihash(i, 2, 21) % 56)
    setPx(p, x, y, h('#c8fff0'))
    setPx(p, x - 1, y, h('#58c8a8'))
    setPx(p, x + 1, y, h('#58c8a8'))
    setPx(p, x, y - 1, h('#58c8a8'))
    setPx(p, x, y + 1, h('#58c8a8'))
  }
  bands(p, 66, 111, [h('#6c5c4c'), h('#766452'), h('#806c58'), h('#8a765e'), h('#947e64')])
  for (let i = 0; i < 60; i++) {
    const y = 68 + (ihash(i, 3, 23) % 44)
    const x = ihash(i, 4, 23) % W
    setPx(p, x, y, h('#5c4c40'))
    setPx(p, x + 1, y, h('#a89070'))
  }
  return p
}

function beachBg(): Pixels {
  const p = createPixels(W, H)
  bands(p, 0, 42, [h('#58b0f8'), h('#68b8f8'), h('#78c0f8'), h('#88c8f8'), h('#98d0f8'), h('#a8d8f8')])
  cloud(p, 60, 12, 16, h('#ffffff'), h('#d8ecf8'))
  cloud(p, 190, 20, 12, h('#ffffff'), h('#d8ecf8'))
  // distant island with palms
  for (let x = 150; x < 230; x++) {
    const t = (x - 150) / 80
    const top = 42 - Math.round(Math.sin(t * Math.PI) * 7)
    for (let y = top; y <= 42; y++) setPx(p, x, y, y === top ? h('#58a878') : h('#489868'))
  }
  bands(p, 43, 62, [h('#2870d0'), h('#3078d8'), h('#3880e0'), h('#4890e8'), h('#58a0f0')])
  for (let i = 0; i < 40; i++) {
    const y = 44 + (ihash(i, 1, 31) % 18)
    const x = ihash(i, 2, 31) % W
    for (let k = 0; k < 3 + (i % 3); k++) setPx(p, x + k, y, h('#a8d8ff'))
  }
  bands(p, 63, 66, [h('#88d0f0'), h('#f0f8ff')])
  bands(p, 67, 111, [h('#e8d498'), h('#eedaa0'), h('#f2e0a8'), h('#f6e6b0'), h('#f8ecb8')])
  for (let i = 0; i < 50; i++) {
    const y = 70 + (ihash(i, 3, 33) % 42)
    const x = ihash(i, 4, 33) % W
    setPx(p, x, y, h('#d8c080'))
    setPx(p, x + 1, y + 1, h('#fff8d8'))
  }
  return p
}

function waterBg(): Pixels {
  const p = createPixels(W, H)
  bands(p, 0, 36, [h('#60b0f8'), h('#70b8f8'), h('#80c0f8'), h('#90c8f8'), h('#a0d0f8')])
  cloud(p, 44, 10, 14, h('#ffffff'), h('#d8ecf8'))
  cloud(p, 176, 16, 18, h('#ffffff'), h('#d8ecf8'))
  bands(p, 37, 111, [h('#2c6cd0'), h('#3074d8'), h('#387ce0'), h('#4084e4'), h('#488ce8'), h('#5094ec'), h('#589cf0')])
  // wave crests: short near the horizon, longer toward us
  for (let i = 0; i < 90; i++) {
    const t = Math.pow(hash(i, 1, 41), 1.3)
    const y = 39 + Math.floor(t * 72)
    const x = ihash(i, 2, 41) % W
    const len = 2 + Math.floor(t * 8)
    for (let k = 0; k < len; k++) setPx(p, x + k, y, k === 0 || k === len - 1 ? h('#80c0f8') : h('#c0e4ff'))
    if (t > 0.4) for (let k = 1; k < len - 1; k++) setPx(p, x + k + 1, y + 1, h('#2c64c0'))
  }
  return p
}

function indoorBg(): Pixels {
  const p = createPixels(W, H)
  // wallpaper
  for (let y = 0; y < 60; y++)
    for (let x = 0; x < W; x++) {
      let c = (x % 12 < 6) ? h('#f0dcc0') : h('#e8d0b0')
      if (x % 24 === 12 && y % 12 === 6) c = h('#d8b890')
      setPx(p, x, y, c)
    }
  // wainscot
  band(p, 44, 44, h('#c89060'))
  band(p, 45, 45, h('#f0c088'))
  for (let y = 46; y < 60; y++) for (let x = 0; x < W; x++) setPx(p, x, y, x % 20 === 0 ? h('#8c5c34') : x % 20 === 1 ? h('#d09c68') : h('#b07c4c'))
  band(p, 60, 61, h('#5c3c24'))
  // floor boards in perspective
  bands(p, 62, 111, [h('#c89868'), h('#cea070'), h('#d4a878'), h('#daae80'), h('#e0b488')])
  for (let y = 64, gap = 3; y < H; y += gap, gap++) band(p, y, y, h('#a87848'))
  for (let x = -120; x < W + 120; x += 20) {
    for (let y = 62; y < H; y++) {
      const t = (y - 62) / 50
      const xx = Math.round(120 + (x - 120) * (0.6 + 0.9 * t))
      setPx(p, xx, y, h('#b88858'))
    }
  }
  // a window with daylight
  for (let y = 10; y < 36; y++)
    for (let x = 30; x < 64; x++) {
      let c = y < 20 ? h('#b8e4fc') : h('#98d4f8')
      if (x === 30 || x === 63 || y === 10 || y === 35 || x === 46 || x === 47 || y === 22) c = h('#f8f8f8')
      setPx(p, x, y, c)
    }
  return p
}

function wreckBg(): Pixels {
  const p = createPixels(W, H)
  // hull planks
  for (let y = 0; y < 70; y++)
    for (let x = 0; x < W; x++) {
      const row = Math.floor(y / 7)
      const off = (row * 17) % 40
      let c = y % 7 === 6 ? h('#2c1e16') : y % 7 === 0 ? h('#6c4c34') : h('#523a28')
      if ((x + off) % 40 === 0) c = h('#2c1e16')
      if (ihash(x >> 3, row, 51) % 17 === 0 && y % 7 === 3) c = h('#3c2a1e')
      setPx(p, x, y, c)
    }
  // ribs
  for (const bx of [20, 100, 180]) {
    for (let y = 0; y < 70; y++)
      for (let x = bx; x < bx + 10; x++) setPx(p, x, y, x === bx ? h('#8c6a4c') : x > bx + 7 ? h('#241810') : h('#5c4230'))
  }
  // porthole light
  for (let y = 16; y < 44; y++)
    for (let x = 128; x < 160; x++) {
      if (inEllipse(x, y, 144, 30, 12, 12)) setPx(p, x, y, inEllipse(x, y, 144, 30, 9, 9) ? (x + y < 170 ? h('#a8f0e8') : h('#58c0c0')) : h('#c8a048'))
    }
  // lantern glow
  for (let y = 10; y < 40; y++)
    for (let x = 50; x < 80; x++) {
      if (inEllipse(x, y, 64, 24, 14, 14)) setPx(p, x, y, mixc(getPx(p, x, y), h('#f8c060'), inEllipse(x, y, 64, 24, 7, 7) ? 0.5 : 0.22))
    }
  for (let y = 20; y < 30; y++) for (let x = 61; x < 67; x++) setPx(p, x, y, y < 22 || y > 27 ? h('#303030') : h('#fff0a0'))
  // deck floor
  bands(p, 70, 111, [h('#5c4430'), h('#644a34'), h('#6c5038'), h('#74563c'), h('#7c5c40')])
  for (let y = 72, gap = 3; y < H; y += gap, gap++) band(p, y, y, h('#3c2c20'))
  return p
}

const cache = new Map<BattleBg, Pixels>()

export function background(kind: BattleBg): Pixels {
  let b = cache.get(kind)
  if (!b) {
    switch (kind) {
      case 'grass':
        b = grassBg()
        break
      case 'night':
        b = grassBg(true)
        break
      case 'cave':
        b = caveBg()
        break
      case 'beach':
        b = beachBg()
        break
      case 'water':
        b = waterBg()
        break
      case 'indoor':
        b = indoorBg()
        break
      case 'wreck':
        b = wreckBg()
        break
    }
    cache.set(kind, b)
  }
  return { w: b.w, h: b.h, data: new Uint8ClampedArray(b.data) }
}

// ---------------------------------------------------------------- platforms

interface PlatformStyle {
  top: string
  rim: string
  detail?: (p: Pixels, x: number, y: number, nx: number, ny: number) => Rgba | null
}

const STYLES: Record<BattleBg, PlatformStyle> = {
  grass: {
    top: '#80c860',
    rim: '#58a040',
    detail: (_p, x, y, nx, ny) => ((x * 7 + y * 13) % 23 === 0 && nx * nx + ny * ny < 0.7 ? h('#5aa848') : null),
  },
  night: { top: '#3c7050', rim: '#28503a' },
  cave: {
    top: '#a08870',
    rim: '#6c5846',
    detail: (_p, x, y) => ((x * 5 + y * 11) % 29 === 0 ? h('#80684f') : null),
  },
  beach: {
    top: '#f4e2a4',
    rim: '#d4bc80',
    detail: (_p, x, y) => ((x * 3 + y * 7) % 31 === 0 ? h('#dcc488') : null),
  },
  water: { top: '#78b8f8', rim: '#4890e8' },
  indoor: { top: '#e8d4b4', rim: '#b89468' },
  wreck: {
    top: '#8c6c4c',
    rim: '#5c4430',
    detail: (_p, _x, y) => (y % 4 === 3 ? h('#6c5038') : null),
  },
}

export function platform(kind: BattleBg, side: 'player' | 'foe'): Pixels {
  const w = side === 'player' ? 128 : 96
  const hh = side === 'player' ? 32 : 24
  const p = createPixels(w, hh)
  const st = STYLES[kind]
  const top = ramp(st.top)
  const rim = ramp(st.rim)
  const cx = w / 2
  const thick = side === 'player' ? 5 : 4
  const rx = w / 2 - 1
  const ry = (hh - thick) / 2 - 1
  const cy = ry + 1
  const out = outlineOf(rim[3], 0.14)
  if (kind === 'water') {
    // rings of ripples on open water, no solid ground
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < w; x++) {
        const nx = (x + 0.5 - cx) / rx
        const ny = (y + 0.5 - (cy + 2)) / (ry + 1)
        const d = Math.sqrt(nx * nx + ny * ny)
        if (d > 1) continue
        let c: Rgba | null = null
        if (d > 0.9) c = h('#d8f0ff')
        else if (d > 0.84) c = h('#90c8f8')
        else if (d > 0.6 && d < 0.66) c = h('#b8e0ff')
        else if (d > 0.32 && d < 0.37) c = h('#a8d8ff')
        else c = d < 0.6 ? h('#68a8f0') : h('#5c9ef0')
        setPx(p, x, y, c)
      }
    return p
  }
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5 - cx) / rx
      // the side of the platform: the ellipse swept down by `thick`
      const onTop = inEllipse(x, y, cx, cy, rx, ry)
      let onSide = false
      for (let k = 1; k <= thick && !onSide; k++) if (inEllipse(x, y - k, cx, cy, rx, ry)) onSide = true
      if (onTop) {
        const ny = (y + 0.5 - cy) / ry
        const d = nx * nx + ny * ny
        let c = d < 0.45 ? top[0] : d < 0.8 ? top[1] : top[2]
        if (ny < -0.2 && d > 0.8) c = top[1]
        const det = st.detail?.(p, x, y, nx, ny) ?? null
        if (det !== null) c = det
        setPx(p, x, y, c)
      } else if (onSide) {
        const depth = y - cy
        let c = nx < -0.6 ? rim[0] : nx > 0.5 ? rim[2] : rim[1]
        if (depth > ry + thick - 2) c = rim[3]
        setPx(p, x, y, c)
      }
    }
  // outline the whole shape
  const src = { w, h: hh, data: new Uint8ClampedArray(p.data) }
  for (let y = 0; y < hh; y++)
    for (let x = 0; x < w; x++) {
      if ((getPx(src, x, y) & 255) !== 0) continue
      const near = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([ax, ay]) => (getPx(src, ax, ay) & 255) !== 0)
      if (near) setPx(p, x, y, out)
    }
  // the rim where the top meets the side
  for (let x = 0; x < w; x++)
    for (let y = hh - 1; y > 0; y--) {
      if (inEllipse(x, y, cx, cy, rx, ry) && !inEllipse(x, y + 1, cx, cy, rx, ry) && y > cy) {
        setPx(p, x, y, top[3])
        break
      }
    }
  return p
}
