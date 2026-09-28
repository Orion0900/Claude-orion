import { Rng } from '../core/rng'
import { segmentPointDistance } from './colliders'
import { smoothstep } from './noise'

/**
 * Long, smooth slide ramps baked into the terrain, so every map has a few
 * places where a slide reliably runs up to 3–4× speed: a flat deck to start
 * from, a 30–40 m face at 15–25° and a flat run-out. The face eases in at
 * the lip and out at the foot, so a fast slide neither launches off the top
 * nor slams into the bottom, and the ground around the lane blends back
 * into the hills no steeper than a player can walk.
 *
 * A ramp is described in its own frame: `u` metres downhill from the lip
 * (negative on the deck), `v` metres across the lane.
 */
export interface SlideRamp {
  /** The lip: where the deck tips over into the face. */
  x: number
  z: number
  /** Unit vector pointing downhill along the face. */
  dx: number
  dz: number
  /** Length of the face from lip to foot, metres. */
  length: number
  /** Slope of the steady middle of the face, radians. */
  angle: number
  /** Height of the deck. */
  top: number
  /**
   * How far the ramp blends back into the hills to each side and behind the
   * deck, metres: wider where the lane cuts deep into (or stands proud of)
   * the hills, so the banks around it stay walkable.
   */
  sideBlend: number
  backBlend: number
}

export const RAMP_SHAPE = {
  /** Flat deck behind the lip, and flat run-out past the foot. */
  deck: 5,
  runout: 10,
  /** The face eases in from flat over the first `lip` metres and back out over the last `foot`. */
  lip: 6,
  foot: 8,
  /** Half the width of the smooth lane. */
  halfWidth: 4.5,
  /** The lane is dished this much at its edges, so a slide stays in it. */
  bank: 0.5,
  /**
   * How far the ramp blends back into the hills to each side and behind the
   * deck (at the least; see `RAMP_RULES.maxBank`), and past the run-out.
   */
  sideBlend: 6,
  backBlend: 10,
  frontBlend: 10,
}

export const RAMP_RULES = {
  /** Ramps per map, inclusive. */
  count: [3, 4] as readonly [number, number],
  /** Face length, metres. */
  length: [32, 38] as readonly [number, number],
  /** Steady slope of the face, degrees. */
  angle: [18, 23] as readonly [number, number],
  /** Everything a ramp touches stays inside this square (where the rim has barely begun)... */
  limit: 76,
  /** ...and outside the flat start and its blend... */
  startClear: 22,
  /** ...though blends widened for walkable banks may reach this much further (never into the flat start). */
  blendSlack: 6,
  /** Room between two ramps' footprints, and between their middles. */
  gap: 6,
  spread: 40,
  /** Candidates tried; the ones that fit the hills best win. */
  candidates: 2500,
  /** A ramp may not stand prouder of, or sink deeper into, the natural ground than this. */
  maxMisfit: 6,
  /**
   * Steepest ground a ramp's blend may leave, degrees (walking tops out at
   * 50°); the side and back blends widen in steps until it holds, up to
   * `maxBlend` times their least.
   */
  maxBank: 47,
  maxBlend: 2,
}

/** Metres the face has dropped `u` metres past the lip: 0 on the deck, the full drop at the foot and beyond. */
export function rampDrop(r: SlideRamp, u: number): number {
  if (u <= 0) return 0
  const { lip, foot } = RAMP_SHAPE
  const k = Math.tan(r.angle)
  const L = r.length
  // The slope follows a smoothstep up over the lip and down over the foot; these are its integrals.
  if (u < lip) {
    const t = u / lip
    return k * lip * (t * t * t - (t * t * t * t) / 2)
  }
  if (u <= L - foot) return k * (lip / 2 + u - lip)
  const t = Math.min(1, (u - (L - foot)) / foot)
  return k * (lip / 2 + (L - foot - lip) + foot * (t - t * t * t + (t * t * t * t) / 2))
}

/** Total height the face drops from deck to run-out. */
export function rampFall(r: SlideRamp): number {
  return rampDrop(r, r.length)
}

/** The ramp's own surface height at local (u, v): the face profile plus the dish across the lane. */
export function rampSurface(r: SlideRamp, u: number, v: number): number {
  const across = Math.min(1, (v / RAMP_SHAPE.halfWidth) ** 2)
  return r.top - rampDrop(r, u) + RAMP_SHAPE.bank * across
}

/** How much of the ground the ramp owns at local (u, v): 1 on the lane, easing to 0 at the blend's edge. */
export function rampWeight(r: SlideRamp, u: number, v: number): number {
  const s = RAMP_SHAPE
  const back = -s.deck
  const front = r.length + s.runout
  let wu = 1
  if (u < back) wu = 1 - smoothstep(0, r.backBlend, back - u)
  else if (u > front) wu = 1 - smoothstep(0, s.frontBlend, u - front)
  const side = Math.abs(v) - s.halfWidth
  const wv = side <= 0 ? 1 : 1 - smoothstep(0, r.sideBlend, side)
  return wu * wv
}

/** Local (u, v) of a world point. */
export function rampLocal(r: SlideRamp, x: number, z: number): { u: number; v: number } {
  const ox = x - r.x
  const oz = z - r.z
  return { u: ox * r.dx + oz * r.dz, v: oz * r.dx - ox * r.dz }
}

/** The ground at (x, z) with the ramp blended in, given the natural ground there. */
export function rampHeight(r: SlideRamp, x: number, z: number, ground: number): number {
  const { u, v } = rampLocal(r, x, z)
  const w = rampWeight(r, u, v)
  return w <= 0 ? ground : ground + (rampSurface(r, u, v) - ground) * w
}

/** Distance from (x, z) to the ramp's smooth lane (deck, face and run-out); 0 on it. */
export function laneDistance(r: SlideRamp, x: number, z: number): number {
  const { u, v } = rampLocal(r, x, z)
  const du = Math.max(-RAMP_SHAPE.deck - u, 0, u - (r.length + RAMP_SHAPE.runout))
  const dv = Math.max(Math.abs(v) - RAMP_SHAPE.halfWidth, 0)
  return Math.sqrt(du * du + dv * dv)
}

/** Whether (x, z) is within `margin` of any ramp's lane. Spots and props keep off the lanes with this. */
export function nearRamp(ramps: readonly SlideRamp[], x: number, z: number, margin: number): boolean {
  for (const r of ramps) if (laneDistance(r, x, z) < margin) return true
  return false
}

/** The footprint (everything the ramp changes) as a centre-line segment and a half-width. */
export function rampFootprint(r: SlideRamp): { ax: number; az: number; bx: number; bz: number; half: number } {
  const s = RAMP_SHAPE
  const back = -s.deck - r.backBlend
  const front = r.length + s.runout + s.frontBlend
  return {
    ax: r.x + r.dx * back,
    az: r.z + r.dz * back,
    bx: r.x + r.dx * front,
    bz: r.z + r.dz * front,
    half: s.halfWidth + r.sideBlend,
  }
}

/**
 * Picks where a map's ramps go, from its natural ground. Candidates are
 * random lanes that keep clear of the start and the rim; each one's deck
 * height is fitted to the hills under it, and the lanes that fit best (the
 * least earthwork, so they follow a natural slope) win, spread out over the
 * map, as long as their blends can be made walkable. Deterministic for a seed.
 */
export function planRamps(heightAt: (x: number, z: number) => number, seed: number, rules = RAMP_RULES): SlideRamp[] {
  const rng = new Rng((seed ^ 0x51a1de) >>> 0)
  const s = RAMP_SHAPE
  const deg = Math.PI / 180
  // The blends are fitted when a candidate is first considered; `blend` says whether they could be.
  const candidates: Array<{ ramp: SlideRamp; misfit: number; blend?: boolean }> = []

  for (let n = 0; n < rules.candidates; n++) {
    const length = rng.range(rules.length[0], rules.length[1])
    const angle = rng.range(rules.angle[0], rules.angle[1]) * deg
    const yaw = rng.range(0, Math.PI * 2)
    const cx = rng.range(-rules.limit, rules.limit)
    const cz = rng.range(-rules.limit, rules.limit)
    const dx = Math.cos(yaw)
    const dz = Math.sin(yaw)
    // Centre the whole footprint on (cx, cz).
    const mid = (-s.deck - s.backBlend + length + s.runout + s.frontBlend) / 2
    const ramp: SlideRamp = { x: cx - dx * mid, z: cz - dz * mid, dx, dz, length, angle, top: 0, sideBlend: s.sideBlend, backBlend: s.backBlend }
    if (!fitsMap(ramp, rules)) continue

    // Least-squares deck height against the ground along the middle and both edges of the lane.
    // The run-out counts triple, so it meets the ground ahead instead of ending in a kicker.
    let sum = 0
    let count = 0
    const diffs: number[] = []
    for (let u = -s.deck; u <= length + s.runout; u += 2) {
      const weight = u > length ? 3 : 1
      for (const v of [-s.halfWidth, 0, s.halfWidth]) {
        const x = ramp.x + dx * u - dz * v
        const z = ramp.z + dz * u + dx * v
        const d = heightAt(x, z) - rampSurface(ramp, u, v)
        diffs.push(d)
        sum += d * weight
        count += weight
      }
    }
    const top = sum / count
    let misfit = 0
    for (const d of diffs) misfit = Math.max(misfit, Math.abs(d - top))
    ramp.top = top
    // Ground rising ahead of the run-out would kick a fast slide into the air; count it as misfit too.
    const bottom = top - rampFall(ramp)
    for (let u = length + s.runout; u <= length + s.runout + s.frontBlend + 8; u += 2) {
      misfit = Math.max(misfit, heightAt(ramp.x + dx * u, ramp.z + dz * u) - bottom)
    }
    if (misfit > rules.maxMisfit) continue
    candidates.push({ ramp, misfit })
  }

  candidates.sort((a, b) => a.misfit - b.misfit)
  const want = rng.int(rules.count[0], rules.count[1])
  const picked: SlideRamp[] = []
  // Spread them out first; if the map is too cramped for that, settle for not overlapping.
  for (const spread of [rules.spread, 0]) {
    const roomFor = (r: SlideRamp) => picked.every((p) => apart(p, r, rules.gap, spread))
    for (const c of candidates) {
      if (picked.length >= want) break
      if (picked.includes(c.ramp) || c.blend === false || !roomFor(c.ramp)) continue
      // Fitting the banks is the costly part, so only lanes with room get that far; wider blends need more room.
      if (c.blend === undefined) c.blend = fitBlend(c.ramp, heightAt, rules) && fitsMap(c.ramp, rules, rules.blendSlack)
      if (c.blend && roomFor(c.ramp)) picked.push(c.ramp)
    }
  }
  return picked
}

/**
 * Widens the ramp's side and back blends (from their least, up to
 * `maxBlend` times that) until no ground around the lane is steeper than
 * `maxBank`, or than the hills already were there. False if none does.
 */
function fitBlend(r: SlideRamp, heightAt: (x: number, z: number) => number, rules: typeof RAMP_RULES): boolean {
  const limit = Math.tan((rules.maxBank * Math.PI) / 180)
  const holds = (k: number) => {
    r.sideBlend = RAMP_SHAPE.sideBlend * k
    r.backBlend = RAMP_SHAPE.backBlend * k
    return banksHold(r, heightAt, limit)
  }
  // Most lanes need no widening, and a lane the widest blend can't tame is dropped at once.
  if (holds(1)) return true
  if (!holds(rules.maxBlend)) return false
  for (let k = 1.25; k < rules.maxBlend; k += 0.25) if (holds(k)) return true
  return holds(rules.maxBlend)
}

/** Whether every sampled point of the ramp's blend (its footprint off the lane) is at most `limit` steep, or no steeper than the ground was. */
function banksHold(r: SlideRamp, heightAt: (x: number, z: number) => number, limit: number): boolean {
  const s = RAMP_SHAPE
  const e = 0.5
  const blended = (x: number, z: number) => rampHeight(r, x, z, heightAt(x, z))
  const gradient = (fn: (x: number, z: number) => number, x: number, z: number) =>
    Math.hypot(fn(x + e, z) - fn(x - e, z), fn(x, z + e) - fn(x, z - e)) / (2 * e)
  const u0 = -s.deck - r.backBlend
  const u1 = r.length + s.runout + s.frontBlend
  const half = s.halfWidth + r.sideBlend
  // A blend is at least 6 m wide and smooth, so a sample every metre or two finds its steepest.
  const across = r.sideBlend / 6
  for (let u = u0; u <= u1; u += 1.5) {
    const onLane = u >= -s.deck && u <= r.length + s.runout
    for (let v = -half; v <= half; v += across) {
      if (onLane && Math.abs(v) < s.halfWidth) continue
      const x = r.x + r.dx * u - r.dz * v
      const z = r.z + r.dz * u + r.dx * v
      const g = gradient(blended, x, z)
      if (g > limit && g > gradient(heightAt, x, z) + 0.02) return false
    }
  }
  return true
}

/** Whether a ramp's whole footprint stays inside the square and out of the start clearing, give or take `slack`. */
function fitsMap(r: SlideRamp, rules: typeof RAMP_RULES, slack = 0): boolean {
  const f = rampFootprint(r)
  // The footprint is a rectangle around the segment; its corners bound it.
  const px = -r.dz * f.half
  const pz = r.dx * f.half
  for (const [x, z] of [
    [f.ax + px, f.az + pz],
    [f.ax - px, f.az - pz],
    [f.bx + px, f.bz + pz],
    [f.bx - px, f.bz - pz],
  ]) {
    if (Math.abs(x) > rules.limit + slack || Math.abs(z) > rules.limit + slack) return false
  }
  return segmentPointDistance(f.ax, f.az, f.bx, f.bz, 0, 0) - f.half >= rules.startClear - slack
}

function apart(a: SlideRamp, b: SlideRamp, gap: number, spread: number): boolean {
  const fa = rampFootprint(a)
  const fb = rampFootprint(b)
  const d = segmentDistance(fa.ax, fa.az, fa.bx, fa.bz, fb.ax, fb.az, fb.bx, fb.bz)
  if (d - fa.half - fb.half < gap) return false
  return Math.hypot((fa.ax + fa.bx - fb.ax - fb.bx) / 2, (fa.az + fa.bz - fb.az - fb.bz) / 2) >= spread
}

/** Shortest distance between two 2D segments. */
function segmentDistance(
  ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
): number {
  const cross = (ox: number, oz: number, px: number, pz: number, qx: number, qz: number) =>
    (px - ox) * (qz - oz) - (pz - oz) * (qx - ox)
  const d1 = cross(ax, az, bx, bz, cx, cz)
  const d2 = cross(ax, az, bx, bz, dx, dz)
  const d3 = cross(cx, cz, dx, dz, ax, az)
  const d4 = cross(cx, cz, dx, dz, bx, bz)
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(
    segmentPointDistance(ax, az, bx, bz, cx, cz),
    segmentPointDistance(ax, az, bx, bz, dx, dz),
    segmentPointDistance(cx, cz, dx, dz, ax, az),
    segmentPointDistance(cx, cz, dx, dz, bx, bz),
  )
}
