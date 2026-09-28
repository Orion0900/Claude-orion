/**
 * The toolbox every weapon behavior works with: dealing hits, finding what a
 * projectile touched, aiming, sounds and the shared cosmetic effects. It
 * reaches other systems through the context at call time, since the
 * per-stage ones are replaced between stages.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import type { DamageOptions, DamageRoll, Enemy, GameContext, SfxId, Vec3, WeaponInstance, WeaponStats } from '../game/types'
import { Blasts, Bolts, Embers } from './vfx'
import { closestT, fanOffset, forwardX, forwardZ } from './weaponGeom'

/** An owned weapon with its numbers after the player's stats. */
export interface Armed {
  readonly w: WeaponInstance
  /** Refreshed in place every frame before the behavior runs. */
  readonly eff: WeaponStats
}

export interface DamageSource {
  /** Rolls one hit of `arm` against `enemy` into `out`, without allocating. */
  rollInto(arm: Armed, enemy: Enemy, out: DamageRoll): DamageRoll
}

/** How much bigger than its base the weapon's size is (player size stat and upgrades). */
export function sizeMul(arm: Armed): number {
  const base = arm.w.def.base.size
  return base > 0 ? arm.eff.size / base : 1
}

/** Height above the feet that shots leave from. */
export const MUZZLE_HEIGHT = 1.1
/** A swept ball still hits a body this far below its feet or above its head. */
const SWEEP_BELOW = 0.4
const SWEEP_ABOVE = 0.2
/** queryRadius's height gate reaches max(radius, this) metres from the centre. */
const QUERY_HEIGHT = 2
/** How far ahead the fallback aim looks to follow the ground. */
const AIM_AHEAD = 8
/** Shots lead a moving target by at most this long and this far. */
const MAX_LEAD_TIME = 0.8
const MAX_LEAD = 3
/** The same sound never restarts faster than this. */
const SOUND_GAP = 0.045

const Y_AXIS = new THREE.Vector3(0, 1, 0)

export class WeaponKit {
  readonly embers: Embers
  readonly blasts: Blasts
  readonly bolts: Bolts

  private readonly cand: Enemy[] = []
  private readonly area: Enemy[] = []
  private readonly picked = new Set<number>()
  private readonly roll: DamageRoll = { amount: 0, crit: false }
  private readonly opts: DamageOptions = { source: '' }
  private readonly push = new THREE.Vector3()
  private readonly mid = new THREE.Vector3()
  private readonly lastSound = new Map<SfxId, number>()

  constructor(
    readonly ctx: GameContext,
    private readonly source: DamageSource,
    readonly rng: Rng,
  ) {
    this.embers = new Embers(ctx.scene, 700)
    this.blasts = new Blasts(ctx.scene, 48)
    this.bolts = new Bolts(ctx.scene, 480)
  }

  /** 0.5 on low quality: cosmetic particle counts scale by it. */
  get fxScale(): number {
    return this.ctx.settings.quality === 'low' ? 0.5 : 1
  }

  /** A cosmetic count scaled for quality, never below one. */
  count(n: number): number {
    return Math.max(1, Math.round(n * this.fxScale))
  }

  // ─────────────────────────── damage ───────────────────────────

  /**
   * One hit of `arm` on `e`, pushed along (dirX, dirZ) by the weapon's
   * knockback (negative knockback pulls). Returns the damage dealt.
   */
  hit(arm: Armed, e: Enemy, dirX: number, dirZ: number, kbScale = 1, dmgScale = 1): number {
    if (!e.alive) return 0
    this.source.rollInto(arm, e, this.roll)
    const amount = this.roll.amount * dmgScale
    const opts = this.opts
    opts.source = arm.w.def.id
    opts.crit = this.roll.crit
    opts.knockback = undefined
    const kb = arm.eff.knockback * kbScale
    const len = Math.hypot(dirX, dirZ)
    if (kb !== 0 && len > 1e-6) opts.knockback = this.push.set((dirX / len) * kb, 0, (dirZ / len) * kb)
    this.ctx.enemies.damage(e, amount, opts)
    return amount
  }

  /**
   * Hits everything within `radius` of `center` once, pushing away from it.
   * The enemies hit are left in `out` so callers can add burns or freezes.
   */
  hitArea(arm: Armed, center: Vec3, radius: number, kbScale = 1, dmgScale = 1, out: Enemy[] = this.area): number {
    const n = this.inRadius(center, radius, 2, 3, out)
    for (let i = 0; i < n; i++) {
      const e = out[i]
      this.hit(arm, e, e.pos.x - center.x, e.pos.z - center.z, kbScale, dmgScale)
    }
    return n
  }

  // ─────────────────────────── queries ───────────────────────────

  /**
   * Living enemies whose body overlaps a circle of `radius` around `center`
   * and whose height span is within `below`/`above` metres of it.
   */
  inRadius(center: Vec3, radius: number, below: number, above: number, out: Enemy[]): number {
    const cand = this.query(center, radius, Math.max(below, above))
    let n = 0
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i]
      if (!e.alive) continue
      const r = radius + e.def.radius * e.scale
      const dx = e.pos.x - center.x
      const dz = e.pos.z - center.z
      if (dx * dx + dz * dz > r * r) continue
      if (e.pos.y + e.def.height * e.scale < center.y - below || e.pos.y > center.y + above) continue
      out[n++] = e
    }
    out.length = n
    return n
  }

  /**
   * Enemies a ball of `radius` touched moving from `a` to `b` this frame,
   * nearest to `a` first, skipping uids in `skip`. Sweeping keeps fast
   * shots from tunnelling through small enemies on slow frames.
   */
  sweep(a: Vec3, b: Vec3, radius: number, skip: ReadonlySet<number> | null, out: Enemy[]): number {
    this.mid.addVectors(a, b).multiplyScalar(0.5)
    // The height test runs at the closest point, up to half the rise away from the middle.
    const vertical = radius + Math.max(SWEEP_BELOW, SWEEP_ABOVE) + Math.abs(b.y - a.y) * 0.5
    const cand = this.query(this.mid, a.distanceTo(b) * 0.5 + radius, vertical)
    let n = 0
    for (let i = 0; i < cand.length; i++) {
      const e = cand[i]
      if (!e.alive || (skip !== null && skip.has(e.uid))) continue
      const t = closestT(a.x, a.z, b.x, b.z, e.pos.x, e.pos.z)
      const x = a.x + (b.x - a.x) * t - e.pos.x
      const z = a.z + (b.z - a.z) * t - e.pos.z
      const r = radius + e.def.radius * e.scale
      if (x * x + z * z > r * r) continue
      const y = a.y + (b.y - a.y) * t
      if (y < e.pos.y - radius - SWEEP_BELOW || y > e.pos.y + e.def.height * e.scale + radius + SWEEP_ABOVE) continue
      out[n++] = e
    }
    out.length = n
    // Insertion sort: n is almost always 0–3.
    for (let i = 1; i < n; i++) {
      const e = out[i]
      const d = dist2(e, a)
      let j = i - 1
      while (j >= 0 && dist2(out[j], a) > d) {
        out[j + 1] = out[j]
        j--
      }
      out[j + 1] = e
    }
    return n
  }

  touching(pos: Vec3, radius: number, skip: ReadonlySet<number> | null, out: Enemy[]): number {
    return this.sweep(pos, pos, radius, skip, out)
  }

  nearest(range: number, exclude?: ReadonlySet<number>): Enemy | null {
    return this.ctx.enemies.nearest(this.ctx.player.pos, range, exclude)
  }

  /** Up to `n` distinct enemies nearest the player within `range`; returns how many. */
  pickTargets(range: number, n: number, out: Enemy[]): number {
    this.picked.clear()
    let found = 0
    for (let i = 0; i < n; i++) {
      const e = this.ctx.enemies.nearest(this.ctx.player.pos, range, this.picked)
      if (!e) break
      out[found++] = e
      this.picked.add(e.uid)
    }
    out.length = found
    return found
  }

  // ─────────────────────────── aiming ───────────────────────────

  centerOf(e: Enemy, out: THREE.Vector3): THREE.Vector3 {
    return out.set(e.pos.x, e.pos.y + e.def.height * e.scale * 0.5, e.pos.z)
  }

  muzzle(out: THREE.Vector3): THREE.Vector3 {
    const p = this.ctx.player.pos
    return out.set(p.x, p.y + MUZZLE_HEIGHT, p.z)
  }

  /** Horizontal unit vector the player faces. */
  facing(out: THREE.Vector3): THREE.Vector3 {
    const yaw = this.ctx.player.yaw
    return out.set(forwardX(yaw), 0, forwardZ(yaw))
  }

  /**
   * Unit direction from `from` to the centre of `e` (led by its velocity for
   * a shot of `speed`); with no enemy, along the player's facing, tilted to
   * follow the ground a few metres ahead.
   */
  aimAt(e: Enemy | null, from: Vec3, out: THREE.Vector3, speed = 0): THREE.Vector3 {
    if (e) {
      this.centerOf(e, out)
      if (speed > 0) {
        const t = Math.min(MAX_LEAD_TIME, out.distanceTo(from) / speed)
        let lx = e.vel.x * t
        let lz = e.vel.z * t
        const len = Math.hypot(lx, lz)
        if (len > MAX_LEAD) {
          lx *= MAX_LEAD / len
          lz *= MAX_LEAD / len
        }
        out.x += lx
        out.z += lz
      }
      out.sub(from)
      if (out.lengthSq() > 1e-6) return out.normalize()
    }
    const p = this.ctx.player
    const ax = p.pos.x + forwardX(p.yaw) * AIM_AHEAD
    const az = p.pos.z + forwardZ(p.yaw) * AIM_AHEAD
    const dy = this.ctx.world.heightAt(ax, az) + 1 - from.y
    const limit = AIM_AHEAD * 0.35
    out.set(ax - from.x, Math.max(-limit, Math.min(limit, dy)), az - from.z)
    if (out.lengthSq() < 1e-6) return this.facing(out)
    return out.normalize()
  }

  /**
   * Aim for shot `k` of an `n`-shot volley: the k-th picked target while
   * there are enough, then fanning out around the first target (or the
   * facing when there is none). Returns the enemy aimed at, if any.
   */
  aimVolley(
    k: number,
    n: number,
    targets: readonly Enemy[],
    found: number,
    from: Vec3,
    spread: number,
    out: THREE.Vector3,
    speed = 0,
  ): Enemy | null {
    if (k < found) {
      this.aimAt(targets[k], from, out, speed)
      return targets[k]
    }
    this.aimAt(found > 0 ? targets[0] : null, from, out, speed)
    let offset: number
    if (found > 0) {
      const j = k - found
      offset = ((j >> 1) + 1) * spread * (j % 2 ? -1 : 1)
    } else {
      offset = fanOffset(k, n, spread)
    }
    if (offset !== 0) out.applyAxisAngle(Y_AXIS, offset)
    return null
  }

  /** The player's horizontal speed, m/s. */
  playerSpeed(): number {
    const v = this.ctx.player.vel
    return Math.hypot(v.x, v.z)
  }

  groundY(x: number, z: number): number {
    return this.ctx.world.heightAt(x, z)
  }

  // ─────────────────────────── feedback ───────────────────────────

  /** A weapon sound, kept under the hit sounds and never stacked within one frame or so. */
  sound(id: SfxId, volume: number, pitch = 1, pos?: Vec3): void {
    const now = this.ctx.time
    const last = this.lastSound.get(id)
    if (last !== undefined && now - last < SOUND_GAP && now >= last) return
    this.lastSound.set(id, now)
    this.ctx.audio.play(id, { volume, pitch: pitch * (0.94 + Math.random() * 0.12), pos })
  }

  breakables(center: Vec3, radius: number): void {
    this.ctx.interactables.hitBreakables(center, radius)
  }

  // ─────────────────────────── lifecycle ───────────────────────────

  update(dt: number): void {
    this.embers.update(dt)
    this.blasts.update(dt)
    this.bolts.update(dt)
  }

  clear(): void {
    this.embers.clear()
    this.blasts.clear()
    this.bolts.clear()
  }

  dispose(): void {
    this.embers.dispose()
    this.blasts.dispose()
    this.bolts.dispose()
    this.cand.length = 0
    this.area.length = 0
  }

  /**
   * Broad phase for the exact tests above. queryRadius already widens its
   * search by the biggest body and tests `radius + body` in XZ, so no pad is
   * added there. Its height gate, though, only reaches max(radius, 2) m, so a
   * small probe that must reach higher (fliers hover 2–3 m up) asks for its
   * `vertical` reach instead.
   */
  private query(center: Vec3, radius: number, vertical: number): Enemy[] {
    const r = vertical > QUERY_HEIGHT ? Math.max(radius, vertical) : radius
    // The contract only says "fills `out`"; never let stale candidates through.
    this.cand.length = 0
    return this.ctx.enemies.queryRadius(center, r, this.cand)
  }
}

function dist2(e: Enemy, a: Vec3): number {
  const dx = e.pos.x - a.x
  const dz = e.pos.z - a.z
  return dx * dx + dz * dz
}
