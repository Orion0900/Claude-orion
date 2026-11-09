/**
 * A tiny software rasterizer for creature sprites. A beast is built from
 * parts — ellipses, tapered limbs, tubes along curves, polygons and blobs —
 * each with a colour ramp. Every part carries an analytic surface normal, so
 * it is shaded per pixel with light from the top left and quantised to four
 * tones. Then parts get dark lines where they overlap what is behind them,
 * the whole silhouette gets a hue-tinted 1px outline, and pixel-precise
 * details (eyes, mouths, marks) go on top.
 *
 * Recipes draw in "design space": the 64×64 front-view frame, facing left.
 * A transform maps that to the target buffer, so one recipe can also draw
 * the mirrored, enlarged back view and the small party icon.
 */
import { createPixels, getPx, setPx, type Pixels, type Rgba } from '../../core/pixels'
import type { Ramp } from './color'

export type View = 'front' | 'back' | 'icon'

/** Maps design space to pixels: X = ox + sx·x, Y = oy + sy·y. |sx| = |sy|. */
export interface Xform {
  sx: number
  sy: number
  ox: number
  oy: number
}

export interface Shape {
  /** Merge group: shapes sharing a name are one part (no lines between them, unioned like solids). */
  g?: string
  /** Draw a dark line where this part overlaps earlier parts. Default true. */
  line?: boolean
  /** Which colour that line takes: this part's line colour, its outline, or the part underneath's deep tone. */
  ln?: 'line' | 'out' | 'soft'
  /** Contribute to the silhouette outline. Default true. */
  out?: boolean
  /** Tone offset: +1 one step darker, -1 one step lighter. */
  bias?: number
  /** Fixed tone 0..3 instead of lighting. */
  flat?: number
  /** Added to the light term (brighter > 0). */
  lift?: number
  /** Profile exponent: 1 is a dome, 2+ flattens the middle. */
  prof?: number
  /** Recolour already-drawn pixels only, keeping their shading (a decal). */
  paint?: boolean
  /** Restrict drawing or painting to pixels of these groups. */
  onto?: readonly string[]
  /** Restrict drawing or painting to pixels NOT in these groups. */
  notOnto?: readonly string[]
  /** Erase. */
  cut?: boolean
  /** Only fill empty pixels: the part sits behind everything drawn so far. */
  under?: boolean
  /** Height offset when merging with its group (higher wins). */
  z?: number
  /** Polygon and blob edge rounding width, in design pixels. */
  bevel?: number
  /** Surface tilt for flat regions: the normal's x and y (−1..1). */
  tilt?: readonly [number, number]
  /** Rotation in degrees for ellipses. */
  rot?: number
  /** Width in design pixels of the shadow this part casts down-right onto parts behind it. */
  cast?: number
  /**
   * 0..1: how much of the lighting underneath to keep where this part covers
   * another. Scales and plates on a body use it so the body's big form still
   * reads through them.
   */
  blend?: number
}

const LX = -0.45
const LY = -0.6
const LZ = 0.9
const LN = Math.hypot(LX, LY, LZ)
const L = [LX / LN, LY / LN, LZ / LN] as const

/** Light thresholds on N·L for tones 0 (highlight), 1 (base), 2 (shade); below the last is deep shade. */
export const TONE_T = [0.95, 0.45, -0.1] as const

const F_LINE = 1
const F_OUT = 2
const LN_LINE = 0
const LN_OUT = 1
const LN_SOFT = 2

type Detail = (c: Canvas, out: Pixels) => void
type Retone = (c: Canvas) => void

export class Canvas {
  readonly w: number
  readonly h: number
  readonly view: View
  readonly T: Xform
  /** Scale factor from design pixels to output pixels. */
  readonly k: number

  // Per-pixel buffers.
  readonly grp: Int32Array
  readonly ord: Int32Array
  readonly mat: Int16Array
  readonly nl: Float32Array
  readonly zb: Float32Array
  readonly bias: Int8Array
  readonly flat: Int8Array
  readonly flags: Uint8Array
  readonly lnm: Uint8Array
  readonly cast: Uint8Array
  readonly lift0: Float32Array
  /** Tone per pixel, filled by finish(). */
  readonly tone: Int8Array

  readonly mats: Ramp[] = []
  private readonly matIdx = new Map<Ramp, number>()
  private readonly groups = new Map<string, number>()
  private nextGroup = 0
  private seq = 1
  private underSeq = -1
  private readonly details: Detail[] = []
  private readonly retones: Retone[] = []

  constructor(w: number, h: number, view: View, T: Xform) {
    this.w = w
    this.h = h
    this.view = view
    this.T = T
    this.k = Math.abs(T.sx)
    const n = w * h
    this.grp = new Int32Array(n).fill(-1)
    this.ord = new Int32Array(n)
    this.mat = new Int16Array(n)
    this.nl = new Float32Array(n)
    this.zb = new Float32Array(n)
    this.bias = new Int8Array(n)
    this.flat = new Int8Array(n).fill(-1)
    this.flags = new Uint8Array(n)
    this.lnm = new Uint8Array(n)
    this.cast = new Uint8Array(n)
    this.lift0 = new Float32Array(n)
    this.tone = new Int8Array(n)
  }

  get front(): boolean {
    return this.view === 'front'
  }
  get back(): boolean {
    return this.view === 'back'
  }
  get icon(): boolean {
    return this.view === 'icon'
  }
  /** True when the view is mirrored (the back view faces right). */
  get mirrored(): boolean {
    return this.T.sx < 0
  }

  X(x: number): number {
    return this.T.ox + this.T.sx * x
  }
  Y(y: number): number {
    return this.T.oy + this.T.sy * y
  }
  S(r: number): number {
    return r * this.k
  }

  groupId(name: string): number {
    let id = this.groups.get(name)
    if (id === undefined) {
      id = this.nextGroup++
      this.groups.set(name, id)
    }
    return id
  }

  private matId(r: Ramp): number {
    let id = this.matIdx.get(r)
    if (id === undefined) {
      id = this.mats.length
      this.mats.push(r)
      this.matIdx.set(r, id)
    }
    return id
  }

  // ---- shape state for the current draw ----
  private cG = 0
  private cOrd = 0
  private cMat = 0
  private cO: Shape = {}
  private cOnto: Set<number> | null = null
  private cNot: Set<number> | null = null
  private cFlags = 0
  private cLn = 0
  private cProf = 1
  private cTx = 0
  private cTy = 0

  private begin(r: Ramp, o: Shape): void {
    this.cO = o
    this.cMat = this.matId(r)
    this.cG = o.g !== undefined ? this.groupId(o.g) : this.nextGroup++
    if (o.under) this.cOrd = this.underSeq--
    else this.cOrd = this.seq++
    this.cOnto = o.onto ? new Set(o.onto.map((n) => this.groupId(n))) : null
    this.cNot = o.notOnto ? new Set(o.notOnto.map((n) => this.groupId(n))) : null
    this.cFlags = (o.line === false ? 0 : F_LINE) | (o.out === false ? 0 : F_OUT)
    this.cLn = o.ln === 'out' ? LN_OUT : o.ln === 'soft' ? LN_SOFT : LN_LINE
    this.cProf = o.prof ?? 1
    let tx = o.tilt ? o.tilt[0] : 0
    if (this.mirrored) tx = -tx
    this.cTx = tx
    this.cTy = o.tilt ? o.tilt[1] : 0
  }

  /**
   * Writes one covered pixel of the current shape. rho is 0 in the middle of
   * the surface and 1 at its rim; (dx, dy) is the outward direction there;
   * hgt is the surface height used when merging a group.
   */
  private put(px: number, py: number, rho: number, dx: number, dy: number, hgt: number): void {
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return
    const i = py * this.w + px
    const o = this.cO
    const g = this.grp[i]
    if (this.cOnto && (g < 0 || !this.cOnto.has(g))) return
    if (this.cNot && g >= 0 && this.cNot.has(g)) return
    if (o.cut) {
      this.grp[i] = -1
      return
    }
    if (o.paint) {
      if (g < 0) return
      this.mat[i] = this.cMat
      if (o.bias !== undefined) this.bias[i] = o.bias
      if (o.flat !== undefined) this.flat[i] = o.flat
      if (o.lift !== undefined) this.nl[i] += o.lift
      return
    }
    if (o.under && g >= 0) return
    const h = hgt + (o.z ?? 0)
    if (g === this.cG && this.zb[i] >= h) return
    const s = rho <= 0 ? 0 : Math.pow(Math.min(1, rho), this.cProf)
    let nx = dx * s + this.cTx * (1 - s)
    let ny = dy * s + this.cTy * (1 - s)
    const m2 = nx * nx + ny * ny
    if (m2 > 1) {
      const m = Math.sqrt(m2)
      nx /= m
      ny /= m
    }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    let lit = nx * L[0] + ny * L[1] + nz * L[2]
    if (o.blend && g >= 0) lit = lit * (1 - o.blend) + (this.nl[i] - this.lift0[i]) * o.blend
    this.grp[i] = this.cG
    this.ord[i] = this.cOrd
    this.mat[i] = this.cMat
    this.nl[i] = lit + (o.lift ?? 0)
    this.lift0[i] = o.lift ?? 0
    this.zb[i] = h
    this.bias[i] = o.bias ?? 0
    this.flat[i] = o.flat ?? -1
    this.flags[i] = this.cFlags
    this.lnm[i] = this.cLn
    this.cast[i] = Math.round(this.S(o.cast ?? 0))
  }

  // ---------------------------------------------------------------- shapes

  /** Ellipse (a dome), centre and radii in design pixels. `o.rot` rotates it. */
  ellipse(cx: number, cy: number, rx: number, ry: number, r: Ramp, o: Shape = {}): this {
    this.begin(r, o)
    const X = this.X(cx)
    const Y = this.Y(cy)
    const RX = Math.max(0.3, this.S(rx))
    const RY = Math.max(0.3, this.S(ry))
    let a = ((o.rot ?? 0) * Math.PI) / 180
    if (this.mirrored) a = -a
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const ext = Math.max(RX, RY) + 1
    const minR = Math.min(RX, RY)
    for (let py = Math.floor(Y - ext); py <= Math.ceil(Y + ext); py++) {
      for (let px = Math.floor(X - ext); px <= Math.ceil(X + ext); px++) {
        const dx = px + 0.5 - X
        const dy = py + 0.5 - Y
        const u = (dx * ca + dy * sa) / RX
        const v = (-dx * sa + dy * ca) / RY
        const d2 = u * u + v * v
        if (d2 > 1) continue
        const gx = u / RX
        const gy = v / RY
        let sx = gx * ca - gy * sa
        let sy = gx * sa + gy * ca
        const m = Math.hypot(sx, sy) || 1
        sx /= m
        sy /= m
        this.put(px, py, Math.sqrt(d2), sx, sy, Math.sqrt(1 - d2) * minR)
      }
    }
    return this
  }

  circle(cx: number, cy: number, rad: number, r: Ramp, o: Shape = {}): this {
    return this.ellipse(cx, cy, rad, rad, r, o)
  }

  /** Superellipse: n = 2 is an ellipse, 3–5 is a rounded box (loaves, slabs). */
  squircle(cx: number, cy: number, rx: number, ry: number, n: number, r: Ramp, o: Shape = {}): this {
    this.begin(r, o)
    const X = this.X(cx)
    const Y = this.Y(cy)
    const RX = this.S(rx)
    const RY = this.S(ry)
    let a = ((o.rot ?? 0) * Math.PI) / 180
    if (this.mirrored) a = -a
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const ext = Math.max(RX, RY) * 1.5 + 1
    const minR = Math.min(RX, RY)
    for (let py = Math.floor(Y - ext); py <= Math.ceil(Y + ext); py++) {
      for (let px = Math.floor(X - ext); px <= Math.ceil(X + ext); px++) {
        const dx = px + 0.5 - X
        const dy = py + 0.5 - Y
        const u = (dx * ca + dy * sa) / RX
        const v = (-dx * sa + dy * ca) / RY
        const au = Math.abs(u)
        const av = Math.abs(v)
        const f = Math.pow(au, n) + Math.pow(av, n)
        if (f > 1) continue
        const rho = Math.pow(f, 1 / n)
        const gx = (Math.sign(u) * Math.pow(au, n - 1)) / RX
        const gy = (Math.sign(v) * Math.pow(av, n - 1)) / RY
        let sx = gx * ca - gy * sa
        let sy = gx * sa + gy * ca
        const m = Math.hypot(sx, sy) || 1
        sx /= m
        sy /= m
        this.put(px, py, rho, sx, sy, Math.sqrt(Math.max(0, 1 - rho * rho)) * minR)
      }
    }
    return this
  }

  /** A tapered capsule from (x1, y1) radius r1 to (x2, y2) radius r2: limbs, horns, necks. */
  limb(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number, r: Ramp, o: Shape = {}): this {
    return this.tubeRaw([[x1, y1, r1], [x2, y2, r2]], r, o)
  }

  /**
   * A smooth tube through control points [x, y, radius] (Catmull-Rom):
   * tails, eels, curled horns, antennae.
   */
  tube(pts: readonly (readonly [number, number, number])[], r: Ramp, o: Shape = {}, steps = 0): this {
    return this.tubeRaw(spline(pts, steps || Math.max(4, Math.ceil(this.S(pathLen(pts)) / (pts.length - 1) / 1.5))), r, o)
  }

  private tubeRaw(pts: readonly (readonly [number, number, number])[], r: Ramp, o: Shape): this {
    this.begin(r, o)
    const src = pts.length === 1 ? [pts[0], pts[0]] : pts
    const n = src.length
    const PX = new Float64Array(n)
    const PY = new Float64Array(n)
    const PR = new Float64Array(n)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < n; i++) {
      const x = this.X(src[i][0])
      const y = this.Y(src[i][1])
      const rad = Math.max(0.35, this.S(src[i][2]))
      PX[i] = x
      PY[i] = y
      PR[i] = rad
      if (x - rad < x0) x0 = x - rad
      if (y - rad < y0) y0 = y - rad
      if (x + rad > x1) x1 = x + rad
      if (y + rad > y1) y1 = y + rad
    }
    const bx0 = Math.max(-1, Math.floor(x0) - 1)
    const by0 = Math.max(-1, Math.floor(y0) - 1)
    const bx1 = Math.min(this.w, Math.ceil(x1) + 1)
    const by1 = Math.min(this.h, Math.ceil(y1) + 1)
    if (bx1 < bx0 || by1 < by0) return this
    const W = bx1 - bx0 + 1
    const H = by1 - by0 + 1
    const best = new Float32Array(W * H).fill(2)
    const bdx = new Float32Array(W * H)
    const bdy = new Float32Array(W * H)
    const bh = new Float32Array(W * H)
    // Each segment only visits the pixels near it; keep the most interior hit.
    for (let s = 0; s < n - 1; s++) {
      const ax = PX[s]
      const ay = PY[s]
      const ar = PR[s]
      const ex = PX[s + 1] - ax
      const ey = PY[s + 1] - ay
      const dr = PR[s + 1] - ar
      const l2 = ex * ex + ey * ey
      const rm = Math.max(ar, PR[s + 1])
      const sx0 = Math.max(bx0, Math.floor(Math.min(ax, ax + ex) - rm) - 1)
      const sx1 = Math.min(bx1, Math.ceil(Math.max(ax, ax + ex) + rm) + 1)
      const sy0 = Math.max(by0, Math.floor(Math.min(ay, ay + ey) - rm) - 1)
      const sy1 = Math.min(by1, Math.ceil(Math.max(ay, ay + ey) + rm) + 1)
      for (let py = sy0; py <= sy1; py++) {
        const qy = py + 0.5
        const row = (py - by0) * W - bx0
        for (let px = sx0; px <= sx1; px++) {
          const qx = px + 0.5
          let t = l2 > 0 ? ((qx - ax) * ex + (qy - ay) * ey) / l2 : 0
          t = t < 0 ? 0 : t > 1 ? 1 : t
          const dx = qx - ax - ex * t
          const dy = qy - ay - ey * t
          const rad = ar + dr * t
          const d = Math.sqrt(dx * dx + dy * dy)
          const rho = d / rad
          const j = row + px
          if (rho < best[j]) {
            best[j] = rho
            bdx[j] = d > 1e-6 ? dx / d : 0
            bdy[j] = d > 1e-6 ? dy / d : 0
            bh[j] = rad
          }
        }
      }
    }
    for (let py = by0; py <= by1; py++)
      for (let px = bx0; px <= bx1; px++) {
        const j = (py - by0) * W + (px - bx0)
        const b = best[j]
        if (b > 1) continue
        this.put(px, py, b, bdx[j], bdy[j], Math.sqrt(1 - b * b) * bh[j])
      }
    return this
  }

  /** A polygon with rounded (bevelled) edges and an optionally tilted flat face. */
  poly(pts: readonly (readonly [number, number])[], r: Ramp, o: Shape = {}): this {
    this.begin(r, o)
    const n = pts.length
    if (n < 3) return this
    const PX = new Float64Array(n)
    const PY = new Float64Array(n)
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (let i = 0; i < n; i++) {
      const x = this.X(pts[i][0])
      const y = this.Y(pts[i][1])
      PX[i] = x
      PY[i] = y
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
    }
    const bevel = this.S(o.bevel ?? 2)
    const needDist = bevel > 0 && !o.paint && !o.cut
    const xs: number[] = []
    const cand: number[] = []
    const py0 = Math.max(0, Math.floor(y0))
    const py1 = Math.min(this.h - 1, Math.ceil(y1))
    for (let py = py0; py <= py1; py++) {
      const qy = py + 0.5
      xs.length = 0
      cand.length = 0
      for (let a = 0, b = n - 1; a < n; b = a++) {
        const ay = PY[a]
        const by = PY[b]
        if (ay > qy !== by > qy) xs.push(PX[a] + ((qy - ay) * (PX[b] - PX[a])) / (by - ay))
        if (needDist && Math.min(ay, by) - bevel <= qy && Math.max(ay, by) + bevel >= qy) cand.push(a, b)
      }
      if (xs.length < 2) continue
      xs.sort((u, v) => u - v)
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const pa = Math.max(0, Math.floor(xs[k] - 0.5) + 1)
        const pb = Math.min(this.w - 1, Math.ceil(xs[k + 1] - 0.5) - 1)
        for (let px = pa; px <= pb; px++) {
          if (!needDist) {
            this.put(px, py, 0, 0, 0, 1)
            continue
          }
          const qx = px + 0.5
          let bd = Infinity
          let ndx = 0
          let ndy = 0
          for (let c = 0; c < cand.length; c += 2) {
            const ax = PX[cand[c]]
            const ay = PY[cand[c]]
            const ex = PX[cand[c + 1]] - ax
            const ey = PY[cand[c + 1]] - ay
            const l2 = ex * ex + ey * ey
            let t = l2 > 0 ? ((qx - ax) * ex + (qy - ay) * ey) / l2 : 0
            t = t < 0 ? 0 : t > 1 ? 1 : t
            const dx = ax + ex * t - qx
            const dy = ay + ey * t - qy
            const d2 = dx * dx + dy * dy
            if (d2 < bd) {
              bd = d2
              ndx = dx
              ndy = dy
            }
          }
          if (bd === Infinity) {
            this.put(px, py, 0, 0, 0, bevel + 1)
            continue
          }
          const d = Math.sqrt(bd)
          const rho = Math.max(0, 1 - d / bevel)
          this.put(px, py, rho, d > 1e-6 ? ndx / d : 0, d > 1e-6 ? ndy / d : 0, Math.min(d, bevel) + 0.01 * d)
        }
      }
    }
    return this
  }

  /** A smooth closed shape through points (Catmull-Rom), shaded like a pillow. */
  blob(pts: readonly (readonly [number, number])[], r: Ramp, o: Shape = {}): this {
    return this.poly(closedSpline(pts, 6), r, { bevel: 3, ...o })
  }

  /** An elliptical ring (halos, bands). */
  ring(cx: number, cy: number, rx: number, ry: number, th: number, r: Ramp, o: Shape = {}): this {
    this.begin(r, o)
    const X = this.X(cx)
    const Y = this.Y(cy)
    const RX = this.S(rx)
    const RY = this.S(ry)
    const TH = Math.max(0.5, this.S(th))
    const ext = Math.max(RX, RY) + TH + 1
    for (let py = Math.floor(Y - ext); py <= Math.ceil(Y + ext); py++) {
      for (let px = Math.floor(X - ext); px <= Math.ceil(X + ext); px++) {
        const dx = px + 0.5 - X
        const dy = py + 0.5 - Y
        const ang = Math.atan2(dy / RY, dx / RX)
        const ex = Math.cos(ang) * RX
        const ey = Math.sin(ang) * RY
        const d = Math.hypot(dx, dy) - Math.hypot(ex, ey)
        const rho = Math.abs(d) / TH
        if (rho > 1) continue
        const m = Math.hypot(dx, dy) || 1
        const sg = Math.sign(d) || 1
        this.put(px, py, rho, (sg * dx) / m, (sg * dy) / m, Math.sqrt(1 - rho * rho) * TH)
      }
    }
    return this
  }

  /**
   * A custom surface: `sample` gets each pixel centre in design coordinates
   * inside the design-space box and returns null (not covered) or the
   * surface there: rho 0..1 from middle to rim and the outward direction
   * (dx, dy) in design space. `tag` in the result, if any, picks a ramp from
   * `ramps` (default the first).
   */
  field(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    sample: (x: number, y: number) => { rho: number; dx: number; dy: number; h?: number; ramp?: number } | null,
    ramps: readonly Ramp[],
    o: Shape = {},
  ): this {
    this.begin(ramps[0], o)
    const ids = ramps.map((r) => this.matId(r))
    const ax = this.X(x0)
    const bx = this.X(x1)
    const ay = this.Y(y0)
    const by = this.Y(y1)
    const mir = this.mirrored ? -1 : 1
    for (let py = Math.floor(Math.min(ay, by)); py <= Math.ceil(Math.max(ay, by)); py++)
      for (let px = Math.floor(Math.min(ax, bx)); px <= Math.ceil(Math.max(ax, bx)); px++) {
        const x = (px + 0.5 - this.T.ox) / this.T.sx
        const y = (py + 0.5 - this.T.oy) / this.T.sy
        const hit = sample(x, y)
        if (!hit) continue
        this.cMat = ids[hit.ramp ?? 0]
        this.put(px, py, hit.rho, hit.dx * mir, hit.dy, hit.h ?? 1 - hit.rho)
      }
    return this
  }

  /** A leaf / lens between two points, `wid` wide at its fattest, bent sideways by `bend`. */
  leaf(x1: number, y1: number, x2: number, y2: number, wid: number, r: Ramp, o: Shape = {}, bend = 0): this {
    return this.poly(leafPts(x1, y1, x2, y2, wid, bend), r, { bevel: wid * 0.5, ...o })
  }

  // --------------------------------------------------------------- details

  /** Queue a direct pixel write in design coordinates (after outlining). */
  px(x: number, y: number, c: Rgba): this {
    this.details.push((cv, out) => {
      setPx(out, Math.floor(cv.X(x + 0.5)), Math.floor(cv.Y(y + 0.5)), c)
    })
    return this
  }

  /** Several pixels of one colour: [x, y, x, y, ...]. */
  pxs(xy: readonly number[], c: Rgba): this {
    for (let i = 0; i + 1 < xy.length; i += 2) this.px(xy[i], xy[i + 1], c)
    return this
  }

  /** A 1px line in design coordinates, drawn after outlining. */
  line(x1: number, y1: number, x2: number, y2: number, c: Rgba): this {
    this.details.push((cv, out) => {
      plotLine(Math.floor(cv.X(x1 + 0.5)), Math.floor(cv.Y(y1 + 0.5)), Math.floor(cv.X(x2 + 0.5)), Math.floor(cv.Y(y2 + 0.5)), (x, y) => setPx(out, x, y, c))
    })
    return this
  }

  /**
   * Stamps a small image with its top-left at design (x, y). Stamps are not
   * scaled; in a mirrored view they are flipped so they keep facing forward.
   * Opaque pixels only.
   */
  stamp(img: Pixels, x: number, y: number): this {
    this.details.push((cv, out) => {
      const X0 = cv.X(x)
      const Y0 = Math.round(cv.Y(y))
      const mir = cv.mirrored
      const left = mir ? Math.round(X0 - img.w) : Math.round(X0)
      for (let yy = 0; yy < img.h; yy++)
        for (let xx = 0; xx < img.w; xx++) {
          const c = getPx(img, mir ? img.w - 1 - xx : xx, yy)
          if ((c & 255) === 0) continue
          setPx(out, left + xx, Y0 + yy, c)
        }
    })
    return this
  }

  /** Stamps a small image centred on design (x, y), unscaled (for icon-size details). */
  stampC(img: Pixels, x: number, y: number): this {
    this.details.push((cv, out) => {
      const mir = cv.mirrored
      const left = Math.round(cv.X(x) - img.w / 2)
      const top = Math.round(cv.Y(y) - img.h / 2)
      for (let yy = 0; yy < img.h; yy++)
        for (let xx = 0; xx < img.w; xx++) {
          const c = getPx(img, mir ? img.w - 1 - xx : xx, yy)
          if ((c & 255) === 0) continue
          setPx(out, left + xx, top + yy, c)
        }
    })
    return this
  }

  /** Runs an arbitrary detail pass with direct access to the output (pixel space). */
  detail(fn: Detail): this {
    this.details.push(fn)
    return this
  }

  /** Nudges the tone of one design pixel after lighting (+1 darker). Keeps the material. */
  shadePx(x: number, y: number, d: number): this {
    this.retones.push((cv) => {
      const px = Math.floor(cv.X(x + 0.5))
      const py = Math.floor(cv.Y(y + 0.5))
      if (px < 0 || py < 0 || px >= cv.w || py >= cv.h) return
      const i = py * cv.w + px
      if (cv.grp[i] < 0) return
      cv.tone[i] = Math.max(0, Math.min(3, cv.tone[i] + d))
    })
    return this
  }

  /** Tone nudge along a line (cracks, creases, fur strokes). */
  shadeLine(x1: number, y1: number, x2: number, y2: number, d: number): this {
    this.retones.push((cv) => {
      plotLine(Math.floor(cv.X(x1 + 0.5)), Math.floor(cv.Y(y1 + 0.5)), Math.floor(cv.X(x2 + 0.5)), Math.floor(cv.Y(y2 + 0.5)), (px, py) => {
        if (px < 0 || py < 0 || px >= cv.w || py >= cv.h) return
        const i = py * cv.w + px
        if (cv.grp[i] < 0) return
        cv.tone[i] = Math.max(0, Math.min(3, cv.tone[i] + d))
      })
    })
    return this
  }

  /** Sets material + tone on one design pixel after lighting (a coloured dot that keeps the outline logic). */
  dot(x: number, y: number, r: Ramp, tone: number): this {
    this.retones.push((cv) => {
      const px = Math.floor(cv.X(x + 0.5))
      const py = Math.floor(cv.Y(y + 0.5))
      if (px < 0 || py < 0 || px >= cv.w || py >= cv.h) return
      const i = py * cv.w + px
      if (cv.grp[i] < 0) return
      cv.mat[i] = cv.matId(r)
      cv.tone[i] = tone
      cv.flat[i] = tone
    })
    return this
  }

  /** Is design pixel (x, y) covered by the named group (after drawing so far)? */
  covered(x: number, y: number, group?: string): boolean {
    const px = Math.floor(this.X(x + 0.5))
    const py = Math.floor(this.Y(y + 0.5))
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return false
    const g = this.grp[py * this.w + px]
    if (g < 0) return false
    return group === undefined || g === this.groups.get(group)
  }

  // ---------------------------------------------------------------- finish

  finish(): Pixels {
    const { w, h, grp, ord, tone, flat, bias, nl, mat, flags, lnm, cast } = this
    const n = w * h
    // 1. Quantise lighting to tones.
    for (let i = 0; i < n; i++) {
      if (grp[i] < 0) continue
      if (flat[i] >= 0) {
        tone[i] = flat[i]
        continue
      }
      const v = nl[i]
      const t = v > TONE_T[0] ? 0 : v > TONE_T[1] ? 1 : v > TONE_T[2] ? 2 : 3
      tone[i] = Math.max(0, Math.min(3, t + bias[i]))
    }
    // 2. Shadows cast down-right by parts in front onto parts behind.
    const shadowed = new Uint8Array(n)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (grp[i] < 0) continue
        for (let d = 1; d <= 3; d++) {
          const sx = x - d
          const sy = y - d
          if (sx < 0 || sy < 0) break
          const j = sy * w + sx
          if (grp[j] >= 0 && grp[j] !== grp[i] && ord[j] > ord[i] && cast[j] >= d) {
            shadowed[i] = 1
            break
          }
        }
      }
    for (let i = 0; i < n; i++) if (shadowed[i] && flat[i] < 0) tone[i] = Math.min(3, tone[i] + 1)
    // 3. Clean single-pixel tone specks inside a part.
    const t2 = new Int8Array(tone)
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (grp[i] < 0 || flat[i] >= 0) continue
        const g = grp[i]
        const m = mat[i]
        const ti = tone[i]
        let other = -1
        let ok = true
        for (let k = 0; k < 4 && ok; k++) {
          const j = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - w : i + w
          if (grp[j] !== g || mat[j] !== m || tone[j] === ti) ok = false
          else if (other < 0) other = tone[j]
          else if (other !== tone[j]) ok = false
        }
        if (ok && other >= 0) t2[i] = other
      }
    tone.set(t2)
    // 4. Hand edits to tones.
    for (const f of this.retones) f(this)
    // 5. Colours.
    const out = createPixels(w, h)
    const col = new Uint32Array(n)
    for (let i = 0; i < n; i++) if (grp[i] >= 0) col[i] = this.mats[mat[i]].t[tone[i]]
    // 6. Lines where a later part meets an earlier one (drawn on the earlier part).
    const lined = new Uint32Array(col)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const gi = grp[i]
        if (gi < 0) continue
        let best = -1
        let bestOrd = ord[i]
        for (let k = 0; k < 4; k++) {
          if ((k === 0 && x === 0) || (k === 1 && x === w - 1) || (k === 2 && y === 0) || (k === 3 && y === h - 1)) continue
          const j = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - w : i + w
          if (grp[j] < 0 || grp[j] === gi || !(flags[j] & F_LINE)) continue
          if (ord[j] > bestOrd) {
            best = j
            bestOrd = ord[j]
          }
        }
        if (best >= 0) {
          const m = this.mats[mat[best]]
          const mode = lnm[best]
          lined[i] = mode === LN_OUT ? m.out : mode === LN_SOFT ? this.mats[mat[i]].t[3] : m.line
        }
      }
    // 7. Silhouette outline on transparent pixels next to the sprite.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (grp[i] >= 0) continue
        let best = -1
        let bestOrd = -Infinity
        for (let k = 0; k < 4; k++) {
          if ((k === 0 && x === 0) || (k === 1 && x === w - 1) || (k === 2 && y === 0) || (k === 3 && y === h - 1)) continue
          const j = k === 0 ? i - 1 : k === 1 ? i + 1 : k === 2 ? i - w : i + w
          if (grp[j] < 0 || !(flags[j] & F_OUT)) continue
          if (ord[j] > bestOrd) {
            best = j
            bestOrd = ord[j]
          }
        }
        if (best >= 0) lined[i] = this.mats[mat[best]].out
      }
    for (let i = 0; i < n; i++) {
      const c = lined[i]
      if (c === 0) continue
      const d = out.data
      d[i * 4] = c >>> 24
      d[i * 4 + 1] = (c >>> 16) & 255
      d[i * 4 + 2] = (c >>> 8) & 255
      d[i * 4 + 3] = 255
    }
    // 8. Details.
    for (const f of this.details) f(this, out)
    return out
  }
}

// ------------------------------------------------------------ geometry utils

export type P3 = readonly [number, number, number]
export type P2 = readonly [number, number]

function pathLen(pts: readonly P3[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return s
}

/** Catmull-Rom through [x, y, r] points (open), `steps` samples per span. */
export function spline(pts: readonly P3[], steps: number): P3[] {
  if (pts.length < 3) return pts.slice()
  const out: P3[] = []
  const get = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = get(i - 1)
    const p1 = get(i)
    const p2 = get(i + 1)
    const p3 = get(i + 2)
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t), p1[2] + (p2[2] - p1[2]) * t])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/** Closed Catmull-Rom through [x, y] points. */
export function closedSpline(pts: readonly P2[], steps: number): P2[] {
  const n = pts.length
  if (n < 3) return pts.slice()
  const out: P2[] = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    for (let s = 0; s < steps; s++) {
      const t = s / steps
      out.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)])
    }
  }
  return out
}

function cr(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
}

/** Points of a lens shape from (x1,y1) to (x2,y2). */
export function leafPts(x1: number, y1: number, x2: number, y2: number, wid: number, bend = 0, n = 10): P2[] {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const nx = -uy
  const ny = ux
  const a: P2[] = []
  const b: P2[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const half = (wid / 2) * Math.sin(Math.PI * t) ** 0.8
    const off = bend * Math.sin(Math.PI * t)
    const cx = x1 + dx * t + nx * off
    const cy = y1 + dy * t + ny * off
    a.push([cx + nx * half, cy + ny * half])
    b.push([cx - nx * half, cy - ny * half])
  }
  return [...a, ...b.reverse().slice(1, -1)]
}

/** Pixel-perfect line (Bresenham). */
export function plotLine(x0: number, y0: number, x1: number, y1: number, plot: (x: number, y: number) => void): void {
  const dx = Math.abs(x1 - x0)
  const dy = -Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx + dy
  for (;;) {
    plot(x0, y0)
    if (x0 === x1 && y0 === y1) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x0 += sx
    }
    if (e2 <= dx) {
      err += dx
      y0 += sy
    }
  }
}
