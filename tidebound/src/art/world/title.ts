/**
 * Title screen art: the TIDEBOUND wordmark (chunky extruded letters riding a
 * wave) and a 240×160 golden-hour seascape with island silhouettes.
 */
import { createPixels, getPx, hash, hex, ihash, inEllipse, mixc, setPx, type Pixels, type Rgba } from './gfx'

const h = hex

// ---------------------------------------------------------------- letters

const GLYPHS: Record<string, readonly string[]> = {
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  D: ['#####.', '######', '##..##', '##..##', '##..##', '##..##', '######', '#####.'],
  E: ['######', '######', '##....', '#####.', '#####.', '##....', '######', '######'],
  B: ['#####.', '######', '##..##', '#####.', '######', '##..##', '######', '#####.'],
  O: ['.####.', '######', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  N: ['##..##', '###.##', '######', '######', '##.###', '##..##', '##..##', '##..##'],
}

const K = 3 // glyph cell size in pixels

/** The letter mask at pixel resolution, with convex corners rounded off. */
function glyphMask(ch: string): { w: number; h: number; on: (x: number, y: number) => boolean } {
  const g = GLYPHS[ch]
  const gw = g[0].length
  const cell = (cx: number, cy: number): boolean => cy >= 0 && cy < g.length && cx >= 0 && cx < gw && g[cy][cx] === '#'
  return {
    w: gw * K,
    h: g.length * K,
    on: (x, y) => {
      const cx = Math.floor(x / K)
      const cy = Math.floor(y / K)
      if (!cell(cx, cy)) return false
      const lx = x - cx * K
      const ly = y - cy * K
      // trim the outer corner pixel where both neighbours are empty
      const left = lx === 0 && !cell(cx - 1, cy)
      const right = lx === K - 1 && !cell(cx + 1, cy)
      const top = ly === 0 && !cell(cx, cy - 1)
      const bottom = ly === K - 1 && !cell(cx, cy + 1)
      if ((left && top && !cell(cx - 1, cy - 1)) || (right && top && !cell(cx + 1, cy - 1))) return false
      if ((left && bottom && !cell(cx - 1, cy + 1)) || (right && bottom && !cell(cx + 1, cy + 1))) return false
      return true
    },
  }
}

const FILL = [h('#ffffff'), h('#e0faff'), h('#a8ecff'), h('#70d4f8'), h('#48b0f0'), h('#3890e8'), h('#2c78d8')]
const EXTRUDE = [h('#2458b0'), h('#1c4490')]
const OUTLINE = h('#0c1c40')

function logo(): Pixels {
  const word = 'TIDEBOUND'
  const gap = 2
  const masks = [...word].map(glyphMask)
  const totalW = masks.reduce((s, m) => s + m.w, 0) + gap * (word.length - 1)
  const W = Math.min(224, totalW + 12)
  const H = 64
  const p = createPixels(W, H)
  const ox = Math.floor((W - totalW) / 2)
  const baseY = 8
  // per-letter wave offsets
  const offs = [...word].map((_, i) => Math.round(3 * Math.sin(i * 0.75 + 0.4)))
  // which pixel belongs to a letter face, and its local y for the gradient
  const face = (x: number, y: number): { i: number; ly: number } | null => {
    let lx0 = ox
    for (let i = 0; i < masks.length; i++) {
      const m = masks[i]
      const lx = x - lx0
      const ly = y - baseY - offs[i]
      if (lx >= 0 && lx < m.w && ly >= 0 && ly < m.h && m.on(lx, ly)) return { i, ly }
      lx0 += m.w + gap
    }
    return null
  }
  const EX = 4
  // a breaking wave behind the lower half of the word
  const waveTop = (x: number): number => 38 + Math.round(3 * Math.sin(x * 0.045 + 1.2) + 1.5 * Math.sin(x * 0.13))
  const thick = (x: number): number => Math.round(14 * Math.pow(Math.sin((Math.PI * (x + 2)) / (W + 4)), 0.6))
  const waveLayer = createPixels(W, H)
  for (let x = 0; x < W; x++) {
    const top = waveTop(x)
    const th = thick(x)
    for (let y = top; y < top + th && y < H - 2; y++) {
      const d = y - top
      let c = d < 2 ? h('#ffffff') : d < 3 ? h('#c8f4ff') : d < 6 ? h('#78d4f8') : d < 10 ? h('#48a8f0') : h('#3080e0')
      if (d > 4 && ihash(x >> 2, y, 91) % 7 === 0 && (x & 3) !== 3) c = d < 10 ? h('#90e0ff') : h('#58b8f8')
      setPx(waveLayer, x, y, c)
    }
    // spray above the crest
    if (ihash(x, 1, 93) % 6 === 0) setPx(waveLayer, x, top - 2 - (ihash(x, 2, 93) % 3), h('#ffffff'))
  }
  // the curl at the left end: a crescent of foam rolling over into the wave
  for (let y = 28; y < 62; y++)
    for (let x = 0; x < 40; x++) {
      if (!inEllipse(x, y, 17, 44, 12, 11)) continue
      const hole = inEllipse(x, y, 21, 46, 7.5, 7)
      const open = x > 19 && y > 43
      if (hole || open) {
        if (hole && !open) setPx(waveLayer, x, y, inEllipse(x, y, 22, 47, 4.5, 4) ? h('#2c70d0') : h('#3c90e8'))
        continue
      }
      const lip = !inEllipse(x, y, 17, 44, 10, 9)
      setPx(waveLayer, x, y, lip ? h('#ffffff') : x + y < 55 ? h('#c8f4ff') : h('#78d4f8'))
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = getPx(waveLayer, x, y)
      if ((c & 255) !== 0) {
        setPx(p, x, y, c)
        continue
      }
      const near = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([ax, ay]) => (getPx(waveLayer, ax, ay) & 255) !== 0)
      if (near) setPx(p, x, y, h('#1c3c78'))
    }
  // extrusion (drawn first, offset down-right), then faces
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      for (let k = EX; k >= 1; k--) {
        if (face(x - Math.ceil(k / 2), y - k)) {
          setPx(p, x, y, k > EX / 2 ? EXTRUDE[1] : EXTRUDE[0])
          break
        }
      }
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const f = face(x, y)
      if (!f) continue
      const m = masks[f.i]
      const t = f.ly / (m.h - 1)
      let c = FILL[Math.min(FILL.length - 1, Math.floor(t * FILL.length))]
      // bevel: lit top/left edges, shaded bottom/right edges
      if (!face(x, y - 1) || !face(x - 1, y)) c = FILL[0]
      else if (!face(x, y + 1) || !face(x + 1, y)) c = FILL[Math.min(FILL.length - 1, Math.floor(t * FILL.length) + 2)]
      setPx(p, x, y, c)
    }
  // thick outline around faces + extrusion
  const src = { w: W, h: H, data: new Uint8ClampedArray(p.data) }
  const solidLetter = (x: number, y: number): boolean => {
    const c = getPx(src, x, y)
    return (c & 255) !== 0 && (FILL.includes(c) || EXTRUDE.includes(c))
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (solidLetter(x, y)) continue
      let near = false
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dx = -2; dx <= 2 && !near; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && solidLetter(x + dx, y + dy)) near = true
      if (near) setPx(p, x, y, OUTLINE)
    }
  // a glint on the first and last letters
  const glint = (x: number, y: number): void => {
    setPx(p, x, y, h('#ffffff'))
    setPx(p, x - 1, y, h('#fff8c0'))
    setPx(p, x + 1, y, h('#fff8c0'))
    setPx(p, x, y - 1, h('#fff8c0'))
    setPx(p, x, y + 1, h('#fff8c0'))
  }
  glint(ox + 3, baseY + offs[0] + 2)
  glint(ox + totalW - 4, baseY + offs[8] + 3)
  return p
}

// ---------------------------------------------------------------- backdrop

function backdrop(): Pixels {
  const W = 240
  const H = 160
  const p = createPixels(W, H)
  const horizon = 100
  // golden-hour sky in hard bands
  const sky = [h('#2850a8'), h('#3060b8'), h('#3c70c8'), h('#4c84d8'), h('#6098e0'), h('#78a8e0'), h('#98b8e0'), h('#b8c8e0'), h('#e0c8c0'), h('#f8d0a8'), h('#f8dca0'), h('#fce8b0')]
  for (let y = 0; y < horizon; y++) {
    const t = y / horizon
    const i = Math.min(sky.length - 1, Math.floor(Math.pow(t, 1.35) * sky.length))
    for (let x = 0; x < W; x++) setPx(p, x, y, sky[i])
  }
  // sun on the horizon
  const sunX = 150
  for (let y = 70; y < horizon; y++)
    for (let x = sunX - 20; x < sunX + 20; x++) {
      if (inEllipse(x, y, sunX, horizon, 16, 16)) setPx(p, x, y, y < 88 ? h('#fff4c8') : h('#ffe8a0'))
      else if (inEllipse(x, y, sunX, horizon, 19, 19)) setPx(p, x, y, mixc(getPx(p, x, y), h('#fff0c0'), 0.45))
    }
  // clouds lit from below
  const cloud = (cx: number, cy: number, w: number): void => {
    for (let y = cy - 8; y < cy + 6; y++)
      for (let x = cx - w; x < cx + w; x++) {
        const u = (x - cx) / w
        const top = cy - Math.round(5 * Math.sqrt(Math.max(0, 1 - u * u)) + 2 * Math.sin(x * 0.5))
        if (y < top || y > cy + 2) continue
        const c = y > cy ? h('#f8c8a8') : y > cy - 2 ? h('#e8d0d8') : h('#d8e0f0')
        setPx(p, x, y, c)
      }
  }
  cloud(40, 62, 26)
  cloud(200, 50, 22)
  cloud(110, 74, 16)
  cloud(222, 80, 12)
  // birds
  for (const [bx, by] of [
    [70, 40],
    [80, 44],
    [180, 30],
  ] as const) {
    setPx(p, bx - 1, by, h('#283858'))
    setPx(p, bx, by + 1, h('#283858'))
    setPx(p, bx + 1, by, h('#283858'))
    setPx(p, bx - 2, by - 1, h('#283858'))
    setPx(p, bx + 2, by - 1, h('#283858'))
  }
  // distant islands
  const island = (x0: number, x1: number, peak: number, col: Rgba): void => {
    for (let x = x0; x <= x1; x++) {
      const t = (x - x0) / (x1 - x0)
      const top = horizon - Math.round(Math.pow(Math.sin(t * Math.PI), 0.7) * peak)
      for (let y = top; y < horizon; y++) setPx(p, x, y, col)
    }
  }
  island(186, 238, 8, h('#6878a0'))
  island(-10, 70, 18, h('#3c4c78'))
  island(90, 118, 6, h('#58689a'))
  // lighthouse on the far right island
  for (let y = 80; y < horizon - 5; y++) for (let x = 212; x < 216; x++) setPx(p, x, y, h('#5c6c94'))
  setPx(p, 213, 79, h('#fff0a0'))
  setPx(p, 214, 79, h('#fff0a0'))
  setPx(p, 212, 78, h('#fff8d0'))
  setPx(p, 215, 78, h('#fff8d0'))
  // palms on the near island
  const palm = (bx: number, by: number, lean: number): void => {
    const col = h('#2c3a64')
    for (let i = 0; i < 16; i++) setPx(p, bx + Math.round((lean * i * i) / 256), by - i, col)
    const tx = bx + lean
    const ty = by - 16
    for (const [dx, dy] of [
      [-1, 0.2],
      [1, 0.2],
      [-0.8, -0.5],
      [0.8, -0.5],
      [-0.4, 0.8],
      [0.5, 0.7],
    ] as const)
      for (let s = 0; s < 8; s++) setPx(p, tx + Math.round(dx * s), ty + Math.round(dy * s + (s * s) / 18), col)
  }
  palm(22, horizon - 16, 3)
  palm(40, horizon - 17, -2)
  // sea: bands getting lighter toward us, with sun glitter
  const sea = [h('#28508c'), h('#2c5c9c'), h('#3068ac'), h('#3474bc'), h('#3880c8'), h('#3c8cd4'), h('#4498dc')]
  for (let y = horizon; y < H; y++) {
    const t = (y - horizon) / (H - horizon)
    const c = sea[Math.min(sea.length - 1, Math.floor(t * sea.length))]
    for (let x = 0; x < W; x++) setPx(p, x, y, c)
  }
  for (let i = 0; i < 160; i++) {
    const t = Math.pow(hash(i, 1, 61), 1.4)
    const y = horizon + 1 + Math.floor(t * (H - horizon - 1))
    const x = ihash(i, 2, 61) % W
    const len = 2 + Math.floor(t * 9)
    for (let k = 0; k < len; k++) setPx(p, x + k, y, t < 0.3 ? h('#6c90c8') : h('#78b0e8'))
  }
  // the sun's path on the water
  for (let y = horizon + 1; y < H; y++) {
    const spread = 6 + (y - horizon) * 0.35
    for (let k = 0; k < 3; k++) {
      const x = Math.round(sunX + (hash(y, k, 71) - 0.5) * 2 * spread)
      const len = 2 + (ihash(y, k, 72) % 5)
      if ((y + k) % 2 === 0) for (let j = 0; j < len; j++) setPx(p, x + j, y, j === 0 || j === len - 1 ? h('#f8d890') : h('#fff4c8'))
    }
  }
  // a horizon line glint
  for (let x = 0; x < W; x++) if (Math.abs(x - sunX) < 30) setPx(p, x, horizon, h('#fff0c0'))
  return p
}

let cached: { logo: Pixels; backdrop: Pixels } | null = null

export function title(): { logo: Pixels; backdrop: Pixels } {
  if (!cached) cached = { logo: logo(), backdrop: backdrop() }
  return {
    logo: { w: cached.logo.w, h: cached.logo.h, data: new Uint8ClampedArray(cached.logo.data) },
    backdrop: { w: cached.backdrop.w, h: cached.backdrop.h, data: new Uint8ClampedArray(cached.backdrop.data) },
  }
}
