import type * as THREE from 'three'

/**
 * A prop's silhouette in `bands` equal height bands from 0 to `top`: in
 * each, the widest the model reaches from its own axis, and its extent
 * along the model's own x and z. Metres at scale 1. The circle holds at any
 * yaw; the box is much tighter for slabs, walls and lopsided canopies.
 */
export interface Profile {
  top: number
  radii: Float32Array
  /** Per band: min x, max x, min z, max z. */
  boxes: Float32Array
}

export const PROFILE_BANDS = 24

/**
 * Measures a model's profile exactly for its triangles: a triangle's slice
 * at any height is a segment between two of its edges, and along an edge
 * the distance from the axis is convex and x and z are linear, so the
 * extremes of an edge within a band are at a vertex or where the edge
 * crosses the band's floor or ceiling.
 */
export function measureProfile(geo: THREE.BufferGeometry, bands = PROFILE_BANDS): Profile {
  const pos = geo.getAttribute('position')
  const index = geo.getIndex()
  let top = 0
  for (let v = 0; v < pos.count; v++) top = Math.max(top, pos.getY(v))
  const radii = new Float32Array(bands)
  const boxes = new Float32Array(bands * 4)
  if (top <= 0) return { top: 0, radii, boxes }
  for (let k = 0; k < bands; k++) boxes.set([Infinity, -Infinity, Infinity, -Infinity], k * 4)
  const bandH = top / bands
  const band = (y: number) => Math.min(bands - 1, Math.max(0, Math.floor(y / bandH)))
  const put = (k: number, x: number, z: number) => {
    radii[k] = Math.max(radii[k], Math.hypot(x, z))
    const b = k * 4
    boxes[b] = Math.min(boxes[b], x)
    boxes[b + 1] = Math.max(boxes[b + 1], x)
    boxes[b + 2] = Math.min(boxes[b + 2], z)
    boxes[b + 3] = Math.max(boxes[b + 3], z)
  }
  const vertex = (n: number) => (index ? index.getX(n) : n)
  const count = index ? index.count : pos.count
  for (let n = 0; n + 2 < count; n += 3) {
    for (let e = 0; e < 3; e++) {
      const a = vertex(n + e)
      const b = vertex(n + ((e + 1) % 3))
      const ax = pos.getX(a)
      const ay = pos.getY(a)
      const az = pos.getZ(a)
      const bx = pos.getX(b)
      const by = pos.getY(b)
      const bz = pos.getZ(b)
      put(band(ay), ax, az)
      put(band(by), bx, bz)
      if (ay === by) continue
      const lo = Math.min(ay, by)
      const hi = Math.max(ay, by)
      // Every band boundary the edge crosses counts for the bands on both sides of it.
      for (let k = Math.max(1, Math.ceil(lo / bandH)); k * bandH < hi && k < bands; k++) {
        const s = (k * bandH - ay) / (by - ay)
        const x = ax + (bx - ax) * s
        const z = az + (bz - az) * s
        put(k - 1, x, z)
        put(k, x, z)
      }
    }
  }
  // A band nothing passes through (a gap between parts) is empty.
  for (let k = 0; k < bands; k++) if (boxes[k * 4] > boxes[k * 4 + 1]) boxes.fill(0, k * 4, k * 4 + 4)
  return { top, radii, boxes }
}

/**
 * What the camera has to see: the player's body, from `low` to `high`
 * (world heights on the player's axis at `px`, `pz`), seen from the eye.
 * Together they span a vertical wedge.
 */
export interface Sightline {
  ex: number
  ey: number
  ez: number
  px: number
  pz: number
  low: number
  high: number
}

/** A placed prop: its profile scaled by `sx`, `sy`, `sz`, turned by `yaw` (as cos and sin), and leaning up to `lean` metres per metre of height. */
export interface PlacedProfile {
  profile: Profile
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  cos: number
  sin: number
  lean: number
}

/**
 * How far the kept-clear view reaches sideways `d` metres from the eye:
 * `margin` all along, and near the lens a cone opening at `lensSpread`
 * (metres per metre) that closes again by `lensReach`, since anything in
 * view that close to the camera fills the screen.
 */
export function sightMargin(d: number, margin: number, lensSpread: number, lensReach: number): number {
  return margin + lensSpread * d * Math.max(0, 1 - d / lensReach)
}

/**
 * Whether a prop cuts into the sight wedge in front of the player, grown
 * sideways by `sightMargin` (at the player's end, `margin` is the body's
 * half-width). Each band of the profile is tested against just the stretch
 * of the wedge at its height: first against the band's circle, then its box.
 */
export function blocksSight(p: PlacedProfile, s: Sightline, margin: number, lensSpread: number, lensReach: number): boolean {
  const radii = p.profile.radii
  const bands = radii.length
  const bandH = (p.profile.top * p.sy) / bands
  if (bandH <= 0) return false
  const dx = s.px - s.ex
  const dz = s.pz - s.ez
  const len2 = dx * dx + dz * dz
  const len = Math.sqrt(len2)
  // Where along the eye→player line the prop's axis is nearest. The margin rounds off both ends of the
  // view, so pull them in by as much: it starts at the lens (nothing behind the camera is in view) and ends
  // at the front of the player's body, `margin` short of its axis.
  const tAxis = len2 > 1e-9 ? ((p.x - s.ex) * dx + (p.z - s.ez) * dz) / len2 : 0
  const inset = margin / Math.max(len, 1e-6)
  const tStart = Math.min(inset, 0.5)
  const tEnd = Math.max(tStart, 1 - 2 * inset)
  const lowRate = s.low - s.ey
  const highRate = s.high - s.ey
  const spread = Math.max(p.sx, p.sz)
  // Where the lens cone is widest.
  const tWide = len > 1e-6 ? lensReach / 2 / len : 0
  for (let b = 0; b < bands; b++) {
    const r = radii[b]
    if (r <= 0) continue
    const h0 = p.y + b * bandH
    const h1 = h0 + bandH
    // The stretch [ta, tb] where the wedge's bottom is under the band's top and its top over the band's floor.
    let ta = tStart
    let tb = tEnd
    if (Math.abs(lowRate) < 1e-9) {
      if (s.ey > h1) continue
    } else if (lowRate > 0) tb = Math.min(tb, (h1 - s.ey) / lowRate)
    else ta = Math.max(ta, (h1 - s.ey) / lowRate)
    if (Math.abs(highRate) < 1e-9) {
      if (s.ey < h0) continue
    } else if (highRate > 0) ta = Math.max(ta, (h0 - s.ey) / highRate)
    else tb = Math.min(tb, (h0 - s.ey) / highRate)
    if (ta > tb) continue
    const shift = p.lean * (h1 - p.y)
    let near = false
    // Against the circle: at the nearest point to the axis, the lens end, and where the lens cone is widest.
    for (let k = 0; k < 3 && !near; k++) {
      const t = k === 0 ? Math.min(tb, Math.max(ta, tAxis)) : k === 1 ? ta : Math.min(tb, Math.max(ta, tWide))
      const reach = r * spread + shift + sightMargin(t * len, margin, lensSpread, lensReach)
      const qx = s.ex + dx * t - p.x
      const qz = s.ez + dz * t - p.z
      near = qx * qx + qz * qz < reach * reach
    }
    if (!near) continue
    // Against the box, grown by the widest the margin gets along this stretch.
    const grow = shift + (ta < tWide && tWide < tb
      ? sightMargin(tWide * len, margin, lensSpread, lensReach)
      : Math.max(sightMargin(ta * len, margin, lensSpread, lensReach), sightMargin(tb * len, margin, lensSpread, lensReach)))
    if (crossesBox(p, s.ex + dx * ta, s.ez + dz * ta, s.ex + dx * tb, s.ez + dz * tb, b, grow)) return true
  }
  return false
}

/** Whether the world segment a→b crosses band `b`'s box, grown by `grow` metres, in the prop's own frame. */
function crossesBox(p: PlacedProfile, ax: number, az: number, bx: number, bz: number, b: number, grow: number): boolean {
  const box = p.profile.boxes
  const k = b * 4
  // Into the model's frame: undo the position and yaw, then the scale (the growth is in metres, so it scales too).
  const ox = ax - p.x
  const oz = az - p.z
  const ex = bx - p.x
  const ez = bz - p.z
  let t0 = 0
  let t1 = 1
  for (let axis = 0; axis < 2; axis++) {
    const scale = axis === 0 ? p.sx : p.sz
    const from = (axis === 0 ? ox * p.cos - oz * p.sin : ox * p.sin + oz * p.cos) / scale
    const to = (axis === 0 ? ex * p.cos - ez * p.sin : ex * p.sin + ez * p.cos) / scale
    const lo = box[k + axis * 2] - grow / scale
    const hi = box[k + axis * 2 + 1] + grow / scale
    const d = to - from
    if (Math.abs(d) < 1e-12) {
      if (from < lo || from > hi) return false
      continue
    }
    const u0 = (lo - from) / d
    const u1 = (hi - from) / d
    t0 = Math.max(t0, Math.min(u0, u1))
    t1 = Math.min(t1, Math.max(u0, u1))
    if (t0 > t1) return false
  }
  return true
}

/** Widest reach of a placed prop from its axis, for padding a broad-phase query. */
export function placedReach(p: PlacedProfile): number {
  let r = 0
  for (const v of p.profile.radii) r = Math.max(r, v)
  return r * Math.max(p.sx, p.sz) + p.lean * p.profile.top * p.sy
}

/**
 * Whether the camera sits inside a prop's bounds or within `clear` metres of
 * them. Dithering such a prop would put a screen-door over the whole view,
 * so it's faded out completely instead.
 */
export function lensInside(p: PlacedProfile, s: Sightline, clear: number): boolean {
  const reach = placedReach(p) + clear
  const dx = s.ex - p.x
  const dz = s.ez - p.z
  if (dx * dx + dz * dz > reach * reach) return false
  return s.ey < p.y + p.profile.top * p.sy + clear && s.ey > p.y - clear
}
