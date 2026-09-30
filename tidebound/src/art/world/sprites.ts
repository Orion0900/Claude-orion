/**
 * Small sprites: capture orbs, the item ball on the ground, emote bubbles and
 * overworld field effects.
 */
import { createPixels, getPx, hex, inEllipse, mixc, ramp, setPx, stamp, type Pixels, type Rgba } from './gfx'

const h = hex

export type OrbKind = 'orb' | 'superOrb' | 'hyperOrb' | 'tideOrb' | 'duskOrb'
export type EmoteKind = 'exclaim' | 'question' | 'heart' | 'note' | 'dots' | 'angry'
export type FieldEffect = 'grassRustle' | 'splash' | 'shadow' | 'dust' | 'ripple' | 'sparkle'

// ---------------------------------------------------------------- orbs

/**
 * Orbs are sea-glass spheres held in a scalloped shell clasp, a pearl or gem
 * on top. Each kind has its own glass, clasp and a little inner detail.
 */
interface OrbStyle {
  glass: string
  clasp: string
  gem: string
  /** Extra detail inside the glass, in orb units (u right, v down, radius 1). */
  inner?: (u: number, v: number) => Rgba | null
}

const ORBS: Record<OrbKind, OrbStyle> = {
  orb: { glass: '#38c8c8', clasp: '#f4dcc0', gem: '#fff8f0' },
  superOrb: { glass: '#9468e0', clasp: '#c4ccdc', gem: '#78d0ff' },
  hyperOrb: { glass: '#f0a828', clasp: '#b03848', gem: '#fff0a0' },
  tideOrb: {
    glass: '#2c64d8',
    clasp: '#a8ecf0',
    gem: '#e8fcff',
    inner: (u, v) => {
      const wave = 0.18 + 0.14 * Math.sin(u * 6.5)
      return Math.abs(v - wave) < 0.1 && Math.abs(u) < 0.72 ? h('#a8e0ff') : null
    },
  },
  duskOrb: {
    glass: '#2c2468',
    clasp: '#8c80b0',
    gem: '#f8e080',
    inner: (u, v) => {
      const s = Math.round(u * 5 + 7) * 7 + Math.round(v * 5 + 7) * 13
      return s % 9 === 0 && u * u + v * v < 0.6 ? h('#f8f0c0') : null
    },
  },
}

/**
 * Renders an orb of radius r centred at (cx, cy), tilted by `tilt` radians.
 * `lift` raises the clasp to show it opening (light pours out); `dim`
 * darkens it once caught.
 */
export function paintOrb(p: Pixels, kind: OrbKind, cx: number, cy: number, r: number, tilt = 0, lift = 0, dim = 0): void {
  const st = ORBS[kind]
  const g = ramp(st.glass)
  const cl = ramp(st.clasp)
  const glassDeep = mixc(g[3], h('#101830'), 0.3)
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)
  const d = (c: Rgba): Rgba => (dim ? mixc(c, h('#202030'), dim) : c)
  const layer = createPixels(p.w, p.h)
  const glow = lift > 0
  const box = Math.ceil(r + 3 + lift)
  // the scalloped lower edge of the clasp, in rotated orb units
  const capEdge = (u: number): number => -0.36 - 0.12 * Math.abs(Math.cos(u * Math.PI * 1.5))
  for (let y = Math.floor(cy - box); y <= cy + box; y++)
    for (let x = Math.floor(cx - box); x <= cx + box; x++) {
      const dx = (x + 0.5 - cx) / r
      const dy = (y + 0.5 - cy) / r
      const rr = dx * dx + dy * dy
      // rotated frame for the clasp and inner detail
      const u = dx * cos + dy * sin
      const v = -dx * sin + dy * cos
      // clasp (possibly lifted off the glass)
      const lu = u
      const lv = v + lift / r
      const inClasp = lu * lu + lv * lv <= 1.06 && lv < capEdge(lu)
      if (inClasp) {
        const ang = Math.atan2(lu, -lv)
        const rib = Math.abs(Math.sin(ang * 4)) < 0.3
        const lit = -(lu * 0.7 + lv * 0.5)
        let c = rib ? cl[2] : lit > 0.35 ? cl[0] : cl[1]
        if (lv > capEdge(lu) - 0.16) c = cl[3]
        setPx(layer, x, y, d(c))
        continue
      }
      if (rr > 1) continue
      const R = Math.sqrt(rr)
      let c: Rgba
      if (glow) c = R < 0.55 ? h('#ffffff') : R < 0.8 ? h('#fff8c8') : g[0]
      else {
        // sea glass: dark rim, clear body, refracted glow low right, a crisp glint top left
        const glint = (dx + 0.42) ** 2 + (dy + 0.08) ** 2
        const caustic = (dx - 0.3) ** 2 + (dy - 0.4) ** 2
        if (R > 0.86) c = dx + dy > 0.2 ? glassDeep : g[2]
        else if (glint < 0.035) c = h('#ffffff')
        else if (glint < 0.09) c = g[0]
        else if (caustic < 0.1) c = mixc(g[0], g[1], 0.35)
        else if (dx - dy > 0.55) c = g[2]
        else c = g[1]
        const det = st.inner?.(u, v) ?? null
        if (det !== null && R <= 0.86 && glint >= 0.09) c = det
      }
      setPx(layer, x, y, d(c))
    }
  // the pearl or gem on top of the clasp
  const gem = ramp(st.gem)
  const gr = r >= 7 ? 1.6 : 1
  // snap the bead to the pixel grid so it stays round when small
  const tx = Math.round(cx + sin * (r + 0.2 + lift))
  const ty = Math.round(cy - cos * (r + 0.2 + lift))
  for (let y = Math.floor(ty - gr - 1); y <= ty + gr + 1; y++)
    for (let x = Math.floor(tx - gr - 1); x <= tx + gr + 1; x++)
      if (inEllipse(x, y, tx, ty, gr + 0.05, gr + 0.05)) setPx(layer, x, y, d(x + 0.5 < tx && y + 0.5 < ty ? gem[0] : x + 0.5 > tx && y + 0.5 > ty ? gem[2] : gem[1]))
  // rays spill from an opening orb
  if (glow) {
    const ray = h('#fff8c8')
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2
      for (let s = r + 1.5; s < r + 3.5; s++) {
        const x = Math.round(cx + Math.cos(a) * s - 0.5)
        const y = Math.round(cy + Math.sin(a) * s * 0.9 - 0.5)
        if (x >= 0 && y >= 0 && x < p.w && y < p.h && (getPx(layer, x, y) & 255) === 0) setPx(layer, x, y, ray)
      }
    }
  }
  // outline in a dark tint of the glass
  const out = mixc(g[3], h('#101020'), 0.6)
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = getPx(layer, x, y)
      if ((c & 255) !== 0) {
        setPx(p, x, y, c)
        continue
      }
      const n = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([ax, ay]) => {
        const cc = getPx(layer, ax, ay)
        return (cc & 255) !== 0 && cc !== h('#fff8c8')
      })
      if (n) setPx(p, x, y, d(out))
    }
}

function star(p: Pixels, cx: number, cy: number, size: number, c: Rgba, core: Rgba): void {
  for (let i = -size; i <= size; i++) {
    setPx(p, cx + i, cy, c)
    setPx(p, cx, cy + i, c)
  }
  if (size >= 2) {
    setPx(p, cx - 1, cy - 1, c)
    setPx(p, cx + 1, cy - 1, c)
    setPx(p, cx - 1, cy + 1, c)
    setPx(p, cx + 1, cy + 1, c)
  }
  setPx(p, cx, cy, core)
}

export function orb(kind: OrbKind, frame: 0 | 1 | 2 | 3 | 4): Pixels {
  const p = createPixels(16, 16)
  switch (frame) {
    case 0:
      paintOrb(p, kind, 8, 9, 6)
      break
    case 1:
      paintOrb(p, kind, 8, 10, 5, 0, 2.5)
      break
    case 2:
      paintOrb(p, kind, 8, 9, 6, -0.5)
      break
    case 3:
      paintOrb(p, kind, 8, 9, 6, 0.5)
      break
    case 4:
      paintOrb(p, kind, 7, 9.5, 6, 0, 0, 0.35)
      star(p, 13, 3, 2, h('#f8e060'), h('#ffffff'))
      break
  }
  return p
}

export function groundItem(): Pixels {
  const p = createPixels(16, 16)
  // shadow first, then a small orb resting on it
  for (let y = 12; y < 16; y++) for (let x = 2; x < 14; x++) if (inEllipse(x, y, 8, 14, 5, 1.5)) setPx(p, x, y, h('#385030'))
  paintOrb(p, 'orb', 8, 9.5, 4.5)
  return p
}

// ---------------------------------------------------------------- emotes

const BUBBLE = ['.bbbbbbbbbbbbb..', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bwwwwwwwwwwwwwb.', 'bSwwwwwwwwwwwSb.', '.bbbbwwbbbbbbb..', '....bwb.........', '....bb..........']

const ICONS: Record<EmoteKind, { rows: readonly string[]; pal: Record<string, string> }> = {
  exclaim: {
    rows: ['..rr..', '..rR..', '..rR..', '..rR..', '..rR..', '......', '..rr..', '..RR..'],
    pal: { r: '#f04040', R: '#b02030' },
  },
  question: {
    rows: ['.bbbb.', 'bB..bB', '....bB', '...bB.', '..bB..', '......', '..bb..', '..BB..'],
    pal: { b: '#3c70e0', B: '#2448a8' },
  },
  heart: {
    rows: ['.rr.rr..', 'rHrrrrr.', 'rrrrrrR.', 'rrrrrrR.', '.rrrrR..', '..rrR...', '...R....'],
    pal: { r: '#f04868', R: '#b82848', H: '#ffb0c0' },
  },
  note: {
    rows: ['...kkkk', '...kkkk', '...k..k', '...k..k', '...k..k', '.kkk.kk', 'kkkk.kk', '.kk....'],
    pal: { k: '#383048' },
  },
  dots: {
    rows: ['........', '........', '........', '........', '........', 'kk.kk.kk', 'kk.kk.kk'],
    pal: { k: '#484058' },
  },
  angry: {
    rows: ['.r..r.', 'rR..Rr', '......', '......', 'rR..Rr', '.r..r.'],
    pal: { r: '#f04040', R: '#b02030' },
  },
}

export function emote(kind: EmoteKind): Pixels {
  const p = createPixels(16, 16)
  stamp(p, BUBBLE, { b: h('#383040'), w: h('#ffffff'), S: h('#d8dce8') }, 0, 1)
  const ic = ICONS[kind]
  const pal: Record<string, Rgba> = {}
  for (const [k, v] of Object.entries(ic.pal)) pal[k] = h(v)
  const w = ic.rows.reduce((m, r) => Math.max(m, r.length), 0)
  const x = Math.floor((15 - w) / 2)
  const y = 2 + Math.floor((10 - ic.rows.length) / 2)
  stamp(p, ic.rows, pal, x, y)
  return p
}

// ---------------------------------------------------------------- field effects

export const FIELD_FRAMES: Record<FieldEffect, number> = {
  grassRustle: 3,
  splash: 3,
  shadow: 1,
  dust: 3,
  ripple: 3,
  sparkle: 4,
}

function outlined(layer: Pixels, out: Rgba): Pixels {
  const p = createPixels(layer.w, layer.h)
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = getPx(layer, x, y)
      if ((c & 255) !== 0) {
        setPx(p, x, y, c)
        continue
      }
      const n = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ].some(([ax, ay]) => (getPx(layer, ax, ay) & 255) !== 0)
      if (n) setPx(p, x, y, out)
    }
  return p
}

export function fieldEffect(kind: FieldEffect, frame: number): Pixels {
  const n = FIELD_FRAMES[kind]
  const f = (((Math.floor(frame) || 0) % n) + n) % n
  const p = createPixels(16, 16)
  switch (kind) {
    case 'grassRustle': {
      // blades flicking over the tall grass, and a leaf or two thrown up
      const lean = [-1, 1, 0][f]
      const blade = [h('#9cdc6c'), h('#6cbc50'), h('#3c9838')]
      const layer = createPixels(16, 16)
      for (const [bx, ht] of [
        [3, 6],
        [6, 8],
        [9, 7],
        [12, 6],
      ] as const)
        for (let i = 0; i < ht; i++) {
          const x = bx + Math.round((lean * i * i) / (ht * 2))
          const y = 15 - i
          setPx(layer, x, y, i > ht - 3 ? blade[0] : blade[1])
          if (i < ht - 2) setPx(layer, x + 1, y, blade[2])
        }
      if (f < 2) {
        const lx = f === 0 ? 2 : 12
        const ly = f === 0 ? 5 : 3
        setPx(layer, lx, ly, blade[0])
        setPx(layer, lx + 1, ly, blade[1])
        setPx(layer, lx + 1, ly - 1, blade[1])
      }
      return outlined(layer, h('#18481c'))
    }
    case 'splash': {
      const layer = createPixels(16, 16)
      const water = [h('#ffffff'), h('#c8e8ff'), h('#78b8f8')]
      if (f === 0) {
        for (let x = 4; x < 12; x++) setPx(layer, x, 14, water[1])
        for (const x of [5, 8, 10]) setPx(layer, x, 12, water[0])
        setPx(layer, 7, 11, water[0])
      } else if (f === 1) {
        for (let x = 3; x < 13; x++) setPx(layer, x, 14, water[1])
        for (const [x, y] of [
          [3, 9],
          [4, 11],
          [6, 7],
          [8, 5],
          [10, 7],
          [12, 10],
          [11, 12],
          [7, 10],
        ] as const) {
          setPx(layer, x, y, water[0])
          setPx(layer, x, y + 1, water[1])
        }
      } else {
        for (let x = 2; x < 14; x += 2) setPx(layer, x, 14, water[1])
        for (const [x, y] of [
          [2, 12],
          [13, 11],
          [5, 10],
          [11, 9],
        ] as const)
          setPx(layer, x, y, water[0])
      }
      return outlined(layer, h('#3068c0'))
    }
    case 'shadow': {
      for (let y = 10; y < 16; y++) for (let x = 1; x < 15; x++) if (inEllipse(x, y, 8, 13.5, 6, 2.2)) setPx(p, x, y, h('#283028'))
      return p
    }
    case 'dust': {
      const layer = createPixels(16, 16)
      const puff = [h('#f8f4ec'), h('#d8d0c0')]
      const spread = [2, 4, 6][f]
      const rad = [2, 2.4, 1.6][f]
      for (const side of [-1, 1]) {
        const cx = 8 + side * spread
        const cy = 13 - f * 0.6
        for (let y = 8; y < 16; y++)
          for (let x = 0; x < 16; x++) if (inEllipse(x, y, cx, cy, rad, rad * 0.8)) setPx(layer, x, y, y > cy ? puff[1] : puff[0])
      }
      return outlined(layer, h('#8c8070'))
    }
    case 'ripple': {
      const rx = [3, 5, 7][f]
      const ry = [1.2, 2, 2.8][f]
      const col = [h('#ffffff'), h('#d8f0ff'), h('#a8d8ff')][f]
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) if (inEllipse(x, y, 8, 12, rx, ry) && !inEllipse(x, y, 8, 12, rx - 1, Math.max(0.3, ry - 1))) setPx(p, x, y, col)
      return p
    }
    case 'sparkle': {
      const size = [1, 2, 3, 1][f]
      const col = [h('#fff8c0'), h('#fff0a0'), h('#ffffff'), h('#f8e080')][f]
      star(p, 8, 8, size, col, h('#ffffff'))
      if (f === 2) {
        setPx(p, 3, 4, h('#fff0a0'))
        setPx(p, 12, 12, h('#fff0a0'))
      }
      return outlined(p, h('#c89820'))
    }
  }
}

