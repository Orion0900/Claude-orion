/**
 * Reusable body parts and patterns shared by several species recipes.
 */
import type { Canvas, P2, P3, Shape } from './canvas'
import type { Ramp } from './color'

/** Teardrop outline: a round body of radius r at (x, y) with a tip `tip`·r away along (dx, dy). */
export function teardrop(x: number, y: number, r: number, dx: number, dy: number, tip = 1.6, n = 14): P2[] {
  const m = Math.hypot(dx, dy) || 1
  const ux = dx / m
  const uy = dy / m
  const a0 = Math.atan2(uy, ux)
  const pts: P2[] = [[x + ux * r * tip, y + uy * r * tip]]
  const spread = Math.acos(Math.min(1, 1 / tip)) // tangent angle from the tip
  for (let i = 0; i <= n; i++) {
    const a = a0 + spread + ((2 * Math.PI - 2 * spread) * i) / n
    pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r])
  }
  return pts
}

/**
 * One overlapping scale with a light free edge: a rim-coloured teardrop with
 * the main colour painted over all but its trailing edge. (dx, dy) points
 * toward the free edge. Draw tail-ward scales first so head-ward ones overlap.
 */
export function scale(
  s: Canvas,
  name: string,
  x: number,
  y: number,
  r: number,
  dx: number,
  dy: number,
  body: Ramp,
  rim: Ramp,
  o: { blend?: number; tip?: number; rimW?: number; midrib?: boolean } = {},
): void {
  const tip = o.tip ?? 1.25
  const m = Math.hypot(dx, dy) || 1
  const ux = dx / m
  const uy = dy / m
  s.poly(teardrop(x, y, r, ux, uy, tip), rim, { g: name, blend: o.blend ?? 0.55, bevel: r * 0.8 })
  const w = o.rimW ?? 1.3
  s.poly(teardrop(x - ux * w, y - uy * w, r, ux, uy, tip), body, { paint: true, onto: [name] })
  if (o.midrib) s.shadeLine(x - ux * r * 0.5, y - uy * r * 0.5, x + ux * r * (tip - 0.35), y + uy * r * (tip - 0.35), -1)
}

export function scales(
  s: Canvas,
  tag: string,
  list: readonly P3[],
  dx: number,
  dy: number,
  body: Ramp,
  rim: Ramp,
  o: { blend?: number; tip?: number; rimW?: number; midrib?: boolean } = {},
): void {
  // Icons: every other scale, a little bigger, so the texture stays readable.
  list.forEach(([x, y, r], i) => {
    if (s.icon && i % 2 === 1 && list.length > 2) return
    scale(s, `${tag}${i}`, x, y, s.icon ? r * 1.3 : r, dx, dy, body, rim, o)
  })
}

/** A fan of thin spines from a base point, each a tapered limb. Angles in degrees. */
export function spines(
  s: Canvas,
  x: number,
  y: number,
  a0: number,
  a1: number,
  n: number,
  len: number | ((i: number) => number),
  r0: number,
  r: Ramp,
  o: Shape = {},
): P2[] {
  const tips: P2[] = []
  for (let i = 0; i < n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / Math.max(1, n - 1)) * Math.PI) / 180
    const L = typeof len === 'number' ? len : len(i)
    const tx = x + Math.cos(a) * L
    const ty = y + Math.sin(a) * L
    s.limb(x, y, r0, tx, ty, 0.45, r, o)
    tips.push([tx, ty])
  }
  return tips
}

/** Points along an arc (degrees), handy for placing rows of features. */
export function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): P2[] {
  const out: P2[] = []
  for (let i = 0; i < n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / Math.max(1, n - 1)) * Math.PI) / 180
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return out
}

/** A zigzag polyline between two points (lightning, bands), `n` teeth of amplitude `amp`. */
export function zigzag(x1: number, y1: number, x2: number, y2: number, n: number, amp: number): P2[] {
  const dx = x2 - x1
  const dy = y2 - y1
  const L = Math.hypot(dx, dy) || 1
  const nx = -dy / L
  const ny = dx / L
  const pts: P2[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const o = i === 0 || i === n ? 0 : i % 2 ? amp : -amp
    pts.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o])
  }
  return pts
}

/** Thick polyline as a band polygon (for stripes painted across bodies). */
export function band(pts: readonly P2[], w: number): P2[] {
  const left: P2[] = []
  const right: P2[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    const nx = (-dy / L) * (w / 2)
    const ny = (dx / L) * (w / 2)
    left.push([pts[i][0] + nx, pts[i][1] + ny])
    right.push([pts[i][0] - nx, pts[i][1] - ny])
  }
  return [...left, ...right.reverse()]
}

/**
 * Scales laid in tidy transverse rows: arcs of radius `radii` around a pivot
 * (usually the neck), outermost row first so rows nearer the head overlap
 * the ones behind. A scale is placed only where its centre lies on one of
 * the `on` groups, so the field clips itself to the body in any view. Each
 * scale's free edge points away from the pivot.
 */
export function scaleRows(
  s: Canvas,
  tag: string,
  px: number,
  py: number,
  radii: readonly number[],
  a0: number,
  a1: number,
  spacing: number,
  r: number,
  on: readonly string[],
  body: Ramp,
  rim: Ramp,
  o: { blend?: number; tip?: number; rimW?: number; midrib?: boolean; skip?: (x: number, y: number) => boolean } = {},
): void {
  // Icons are drawn small: fewer, bigger scales read better than fine texture.
  const boost = s.icon ? 1.45 : 1
  const rows = (s.icon ? radii.filter((_, i) => i % 2 === 0) : [...radii]).sort((a, b) => b - a)
  // Decide every position before drawing, since drawn scales cover the body.
  const placed = rows.map((R, ri) => {
    const step = ((spacing * boost) / R) * (180 / Math.PI)
    const off = ri % 2 ? step / 2 : 0
    const cands: P2[] = []
    for (let a = a0 + off; a <= a1 + 1e-6; a += step) {
      const t = (a * Math.PI) / 180
      cands.push([px + Math.cos(t) * R, py + Math.sin(t) * R])
    }
    return cands.filter(([x, y]) => on.some((g) => s.covered(Math.floor(x), Math.floor(y), g)) && !(o.skip?.(x, y) ?? false))
  })
  placed.forEach((ok, ri) => ok.forEach(([x, y], i) => scale(s, `${tag}${ri}_${i}`, x, y, r * boost, x - px, y - py, body, rim, o)))
}

/**
 * Points [x, y, radius] along a spiral around (cx, cy): the path radius goes
 * from R0 to R1 and the tube radius from t0 to t1 while the angle runs a0→a1
 * (degrees; screen y is down, so increasing angles turn clockwise).
 */
export function spiral(cx: number, cy: number, R0: number, R1: number, a0: number, a1: number, t0: number, t1: number, n = 12): P3[] {
  const out: P3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180
    const R = R0 + (R1 - R0) * t
    out.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R, t0 + (t1 - t0) * t])
  }
  return out
}

/**
 * A cluster of domes merged into one part: wool, clouds, foliage, foam. Each
 * bump keeps its own highlight and the crevices between them fall into shade.
 */
export function puff(s: Canvas, list: readonly P3[], r: Ramp, o: Shape & { g: string }): void {
  for (const [x, y, rad] of list) s.circle(x, y, rad, r, o)
}

/** A flame tongue: teardrop pointing up (or along dx, dy) with a bright core. */
export function flame(s: Canvas, x: number, y: number, r: number, h: number, outer: Ramp, core: Ramp, g: string, lean = 0): void {
  s.poly(teardrop(x, y, r, lean, -1, h / r), outer, { g, bevel: r, flat: 1 })
  s.poly(teardrop(x + lean * 0.3, y + r * 0.25, r * 0.55, lean, -1, (h * 0.6) / (r * 0.55)), core, { paint: true, onto: [g], flat: 0 })
}

/**
 * Craggy plates split by cracks (Voronoi cells around `seeds`), drawn only
 * over the `onto` groups so whatever is underneath (magma, stone, glow)
 * shows through the cracks. Each plate gets its own slight tilt so
 * neighbouring plates catch the light differently.
 */
export function plates(
  s: Canvas,
  seeds: readonly P2[],
  crack: number,
  box: readonly [number, number, number, number],
  onto: readonly string[],
  ramps: readonly Ramp[],
  o: Shape & { bevel?: number } = {},
): void {
  const bev = o.bevel ?? 1.8
  const tilts = seeds.map((_, i) => [(((i * 37) % 7) - 3) * 0.11, (((i * 53) % 5) - 2.4) * 0.12] as const)
  s.field(
    box[0],
    box[1],
    box[2],
    box[3],
    (x, y) => {
      let d1 = Infinity
      let d2 = Infinity
      let i1 = 0
      let i2 = 0
      for (let i = 0; i < seeds.length; i++) {
        const d = Math.hypot(x - seeds[i][0], y - seeds[i][1])
        if (d < d1) {
          d2 = d1
          i2 = i1
          d1 = d
          i1 = i
        } else if (d < d2) {
          d2 = d
          i2 = i
        }
      }
      const ax = seeds[i2][0] - seeds[i1][0]
      const ay = seeds[i2][1] - seeds[i1][1]
      const sep = Math.hypot(ax, ay) || 1
      const e = (d2 * d2 - d1 * d1) / (2 * sep)
      if (e < crack / 2) return null
      const edge = Math.max(0, 1 - (e - crack / 2) / bev)
      const [tx, ty] = tilts[i1]
      const nx = (ax / sep) * edge + tx * (1 - edge)
      const ny = (ay / sep) * edge + ty * (1 - edge)
      const m = Math.hypot(nx, ny)
      return { rho: Math.min(1, m), dx: m > 0 ? nx / m : 0, dy: m > 0 ? ny / m : 0, ramp: i1 % ramps.length }
    },
    ramps,
    { onto, line: false, ...o },
  )
}

/** Samples a Catmull-Rom path evenly by arc length: returns [x, y, r, tangentX, tangentY]. */
export function samplePath(pts: readonly P3[], step: number): [number, number, number, number, number][] {
  const fine: P3[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let k = 0; k < 16; k++) {
      const t = k / 16
      const c = (a: number, b: number, cc: number, d: number) =>
        0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t * t + (-a + 3 * b - 3 * cc + d) * t * t * t)
      fine.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t])
    }
  }
  fine.push(pts[pts.length - 1])
  const out: [number, number, number, number, number][] = []
  let acc = 0
  for (let i = 1; i < fine.length; i++) {
    const [ax, ay] = fine[i - 1]
    const [bx, by, br] = fine[i]
    const d = Math.hypot(bx - ax, by - ay)
    acc += d
    if (acc >= step || out.length === 0) {
      out.push([bx, by, br, (bx - ax) / (d || 1), (by - ay) / (d || 1)])
      acc = 0
    }
  }
  return out
}

/**
 * Paints bands across a tube body along its path: every `period` design
 * pixels a band `width` wide, optionally with zigzag (bolt-shaped) edges.
 */
export function stripes(
  s: Canvas,
  pts: readonly P3[],
  period: number,
  width: number,
  r: Ramp,
  onto: readonly string[],
  o: { zig?: number; phase?: number; flat?: number } = {},
): void {
  const path = samplePath(pts, 0.5)
  let dist = o.phase ?? 0
  let prev: [number, number] | null = null
  for (const [x, y, rad, tx, ty] of path) {
    if (prev) dist += Math.hypot(x - prev[0], y - prev[1])
    prev = [x, y]
    const m = ((dist % period) + period) % period
    if (m > width) continue
    const nx = -ty
    const ny = tx
    const z = o.zig ? (m < width / 2 ? 1 : -1) * o.zig : 0
    const R = rad + 1.5
    s.poly(
      [
        [x + nx * R + tx * z, y + ny * R + ty * z],
        [x + tx * 0.8 + nx * R + tx * z, y + ty * 0.8 + ny * R + ty * z],
        [x + tx * 0.8 - nx * R - tx * z, y + ty * 0.8 - ny * R - ty * z],
        [x - nx * R - tx * z, y - ny * R - ty * z],
      ],
      r,
      { paint: true, onto, flat: o.flat },
    )
  }
}

/**
 * A fan of spines joined by webbing: the web reaches `web` of the way up each
 * spine with scalloped edges between them; spines are thin limbs on top.
 */
export function finFan(
  s: Canvas,
  bx: number,
  by: number,
  tips: readonly P2[],
  webR: Ramp,
  spineR: Ramp,
  g: string,
  o: { web?: number; under?: boolean; spine?: number; tipR?: Ramp; sag?: number } = {},
): void {
  const w = o.web ?? 0.75
  const sag = o.sag ?? 0.25
  // Icons: every other spine, so a fan stays a fan instead of dark mush.
  if (s.icon && tips.length > 3) tips = tips.filter((_, i) => i % 2 === 0 || i === tips.length - 1)
  const pts: P2[] = [[bx, by]]
  tips.forEach(([x, y], i) => {
    const wx = bx + (x - bx) * w
    const wy = by + (y - by) * w
    pts.push([wx, wy])
    if (i < tips.length - 1) {
      const [nx, ny] = tips[i + 1]
      const mx = (wx + bx + (nx - bx) * w) / 2
      const my = (wy + by + (ny - by) * w) / 2
      pts.push([mx + (bx - mx) * sag, my + (by - my) * sag])
    }
  })
  // Behind-the-body fins fill only empty pixels, so the first drawn wins:
  // tips, then spines, then web. In front, the reverse.
  const sr = o.spine ?? 0.7
  const web = () => s.poly(pts, webR, { g: `${g}w`, under: o.under, bevel: 1.5, tilt: [0.1, 0.1] })
  const spines = () => {
    for (const [x, y] of tips) s.limb(bx, by, sr, x, y, 0.55, spineR, { g: `${g}s`, under: o.under, line: false })
  }
  const tipDots = () => {
    const tr = o.tipR
    if (tr) for (const [x, y] of tips) s.circle(bx + (x - bx) * 0.95, by + (y - by) * 0.95, 1, tr, { g: `${g}t`, under: o.under, flat: 1 })
  }
  for (const f of o.under ? [tipDots, spines, web] : [web, spines, tipDots]) f()
}

/**
 * A crest fin: spines rising from points along a back line, joined by
 * webbing up to `web` of their length with sagging edges between them.
 */
export function crestFin(
  s: Canvas,
  bases: readonly P2[],
  tips: readonly P2[],
  webR: Ramp,
  spineR: Ramp,
  g: string,
  o: { web?: number; under?: boolean; spine?: number; tipR?: Ramp; sag?: number } = {},
): void {
  const w = o.web ?? 0.55
  const sag = o.sag ?? 0.35
  if (s.icon && bases.length > 3) {
    const keep = (_: unknown, i: number) => i % 2 === 0 || i === bases.length - 1
    tips = tips.filter(keep)
    bases = bases.filter(keep)
  }
  const up: P2[] = []
  bases.forEach(([bx, by], i) => {
    const [tx, ty] = tips[i]
    const wx = bx + (tx - bx) * w
    const wy = by + (ty - by) * w
    up.push([wx, wy])
    if (i < bases.length - 1) {
      const [nbx, nby] = bases[i + 1]
      const [ntx, nty] = tips[i + 1]
      const nx = nbx + (ntx - nbx) * w
      const ny = nby + (nty - nby) * w
      const mx = (wx + nx) / 2
      const my = (wy + ny) / 2
      const bmx = (bx + nbx) / 2
      const bmy = (by + nby) / 2
      up.push([mx + (bmx - mx) * sag, my + (bmy - my) * sag])
    }
  })
  const sr = o.spine ?? 0.7
  const web = () => s.poly([...bases.slice().reverse(), ...up], webR, { g: `${g}w`, under: o.under, bevel: 1.2, tilt: [0.1, 0.1] })
  const spines = () => bases.forEach(([bx, by], i) => s.limb(bx, by, sr, tips[i][0], tips[i][1], 0.55, spineR, { g: `${g}s`, under: o.under, line: false }))
  const tipDots = () => {
    const tr = o.tipR
    if (tr) bases.forEach(([bx, by], i) => s.circle(bx + (tips[i][0] - bx) * 0.95, by + (tips[i][1] - by) * 0.95, 1, tr, { g: `${g}t`, under: o.under, flat: 1 }))
  }
  for (const f of o.under ? [tipDots, spines, web] : [web, spines, tipDots]) f()
}
