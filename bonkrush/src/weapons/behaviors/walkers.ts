import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import type { Armed, WeaponKit } from '../kit'
import { firePatchGeometry, frostPatchGeometry, glowMaterial, solidMaterial } from '../models'
import { InstancePool, pooled, type Pooled } from '../pool'
import { fanOffset } from '../weaponGeom'
import type { WeaponBehavior } from './types'

/** Frostwalker leaves a footprint this often while moving. */
const FOOTSTEP_GAP = 0.25
/** Seconds between hits on any one enemy, before attack speed, however many patches it stands in. */
const TICK = 0.5
/** How often each patch looks for enemies standing in it. */
const CHECK = 0.1
/** Patches crack pots on every this-many checks. */
const BREAK_EVERY = 5
/** How often hit times are forgotten. */
const PRUNE_GAP = 1
/** Slower than this (m/s) counts as standing still. */
const MIN_MOVE = 1.5
/** No footprints while this far above the ground. */
const MAX_HOVER = 2
/** Frost slow and freeze lengths, before the duration stat. */
const SLOW = 1.2
const FREEZE = 1
/** Flame burn per second as a share of the weapon's damage, and its length. */
const BURN_SHARE = 0.4
const BURN_TIME = 1.5
const GROW = 0.15
const SHRINK = 0.35

interface Patch extends Pooled {
  age: number
  life: number
  radius: number
  check: number
  checks: number
}

const UP = new THREE.Vector3(0, 1, 0)
const _n = new THREE.Vector3()
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _c = new THREE.Vector3()

/**
 * Frostwalker and Flamewalker: ground patches left behind as the player
 * moves, ticking damage on whatever stands in them. Frost slows and adds a
 * freeze nova every cooldown; flame sets things burning.
 */
export class WalkerBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Patch>
  private readonly found: Enemy[] = []
  /** Enemy uid → game time this weapon's patches last hit it. */
  private readonly lastHit = new Map<number, number>()
  private readonly ice = new THREE.Color('#bff4ff')
  private readonly flame = new THREE.Color('#ff7a1a')
  private readonly ember = new THREE.Color('#ffd23f')
  private stepTimer = 0
  private stepSide = 1
  private pruneTimer = PRUNE_GAP

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
    private readonly frost: boolean,
  ) {
    this.pool = new InstancePool<Patch>(
      kit.ctx.scene,
      frost ? frostPatchGeometry() : firePatchGeometry(),
      frost ? polygonOffset(solidMaterial('#1d4a5c')) : glowMaterial(),
      128,
      () => ({ ...pooled(), age: 0, life: 1, radius: 1, check: 0, checks: 0 }),
      !frost,
    )
  }

  /** Frost: the freeze nova, held until something is in reach. Flame: a patch, while moving. */
  fire(): boolean {
    return this.frost ? this.nova() : this.step()
  }

  update(dt: number): void {
    const kit = this.kit
    if (this.frost) {
      this.stepTimer -= dt
      if (this.stepTimer <= 0 && this.step()) this.stepTimer = FOOTSTEP_GAP
    }

    const now = kit.ctx.time
    const tickGap = TICK / Math.max(0.2, kit.ctx.progression.stats.attackSpeed)
    const emberChance = 5 * dt * kit.fxScale
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      if (s.age >= s.life) {
        this.pool.removeAt(i)
        continue
      }
      s.check -= dt
      if (s.check <= 0) {
        s.check += CHECK
        this.scorch(s, now, tickGap)
      }
      const k = Math.min(1, s.age / GROW) * Math.min(1, (s.life - s.age) / SHRINK)
      const r = s.radius * k
      const tall = Math.sqrt(s.radius) * k
      if (this.frost) {
        s.scale.set(r, tall, r)
      } else {
        const flicker = 0.75 + Math.random() * 0.5
        s.scale.set(r, tall * flicker, r)
        s.tint.setScalar(k * (0.75 + 0.3 * flicker))
        if (Math.random() < emberChance) {
          const a = Math.random() * Math.PI * 2
          const d = Math.random() * r * 0.8
          kit.embers.spark(
            s.pos.x + Math.cos(a) * d,
            s.pos.y + 0.2,
            s.pos.z + Math.sin(a) * d,
            (Math.random() - 0.5) * 0.6,
            1.5 + Math.random() * 1.5,
            (Math.random() - 0.5) * 0.6,
            Math.random() < 0.5 ? this.flame : this.ember,
            0.12,
            0.6,
            -1.5,
          )
        }
      }
    }

    this.pruneTimer -= dt
    if (this.pruneTimer <= 0) {
      this.pruneTimer = PRUNE_GAP
      const forget = Math.max(PRUNE_GAP, tickGap)
      for (const [uid, t] of this.lastHit) if (now - t > forget || now < t) this.lastHit.delete(uid)
    }
    this.pool.sync()
  }

  /** Drops this step's patches where the player is walking. Returns false when standing still or airborne. */
  private step(): boolean {
    const kit = this.kit
    const p = kit.ctx.player
    const speed = kit.playerSpeed()
    if (speed < MIN_MOVE) return false
    const gy = kit.groundY(p.pos.x, p.pos.z)
    if (p.pos.y - gy > MAX_HOVER) return false
    const dirX = p.vel.x / speed
    const dirZ = p.vel.z / speed
    const eff = this.arm.eff
    const n = eff.count
    // Frost footprints alternate left and right; fire trails a little behind.
    const back = this.frost ? 0 : 0.7
    const side = this.frost ? 0.3 * this.stepSide : 0
    this.stepSide = -this.stepSide
    for (let k = 0; k < n; k++) {
      const off = fanOffset(k, n, eff.size * 1.3) + side
      this.spawn(p.pos.x - dirX * back - dirZ * off, p.pos.z - dirZ * back + dirX * off)
    }
    return true
  }

  private spawn(x: number, z: number): void {
    const kit = this.kit
    const s = this.pool.spawn() ?? this.oldest()
    if (!s) return
    s.pos.set(x, kit.groundY(x, z) + 0.04, z)
    kit.ctx.world.normalAt(x, z, _n)
    _qa.setFromUnitVectors(UP, _n)
    _qb.setFromAxisAngle(UP, Math.random() * Math.PI * 2)
    s.quat.multiplyQuaternions(_qa, _qb)
    s.scale.setScalar(0.001)
    s.tint.setScalar(0)
    s.age = 0
    s.life = Math.max(GROW + SHRINK, this.arm.eff.duration)
    s.radius = this.arm.eff.size
    s.check = Math.random() * CHECK
    s.checks = 0
  }

  /** When the pool is full, the oldest patch makes way. */
  private oldest(): Patch | null {
    const list = this.pool.active
    let best: Patch | null = null
    for (const s of list) if (!best || s.age > best.age) best = s
    return best
  }

  /**
   * Hurts whatever stands in the patch. The per-enemy gap is shared by every
   * patch, so a trail of overlapping footprints hits no harder than one.
   */
  private scorch(s: Patch, now: number, gap: number): void {
    const kit = this.kit
    const eff = this.arm.eff
    const durationStat = kit.ctx.progression.stats.duration
    const n = kit.inRadius(s.pos, s.radius * Math.min(1, s.age / GROW), 0.6, 2.5, this.found)
    for (let i = 0; i < n; i++) {
      const e = this.found[i]
      const last = this.lastHit.get(e.uid)
      if (last !== undefined && now - last < gap && now >= last) continue
      this.lastHit.set(e.uid, now)
      kit.hit(this.arm, e, e.pos.x - s.pos.x, e.pos.z - s.pos.z)
      if (!e.alive) continue
      if (this.frost) kit.ctx.enemies.applySlow(e, SLOW * durationStat)
      else kit.ctx.enemies.applyBurn(e, eff.damage * BURN_SHARE, BURN_TIME * durationStat)
    }
    if (s.checks++ % BREAK_EVERY === 0) kit.breakables(s.pos, s.radius)
  }

  /** A ring of frost that damages and freezes everything close. */
  private nova(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const p = kit.ctx.player.pos
    const r = eff.range
    if (!kit.ctx.enemies.nearest(p, r)) return false
    const n = kit.hitArea(this.arm, p, r, 1, 1, this.found)
    const freeze = FREEZE * kit.ctx.progression.stats.duration
    for (let i = 0; i < n; i++) {
      const e = this.found[i]
      if (e.alive) kit.ctx.enemies.applyFreeze(e, freeze)
    }
    _c.set(p.x, p.y + 0.3, p.z)
    kit.blasts.spawn(_c, r, this.ice, 0.45, 0.22)
    const shards = kit.count(16)
    for (let i = 0; i < shards; i++) {
      const a = (i / shards) * Math.PI * 2
      kit.embers.spark(_c.x, _c.y, _c.z, Math.cos(a) * r * 3, 2 + Math.random() * 2, Math.sin(a) * r * 3, this.ice, 0.14, 0.35, 6, 4)
    }
    kit.ctx.fx.ring(p, r, '#c9f6ff', 0.5)
    kit.sound('zap', 0.26, 0.55, p)
    kit.breakables(p, r)
    return true
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
    this.lastHit.clear()
  }

  dispose(): void {
    this.pool.dispose()
    this.lastHit.clear()
  }
}

/** Lets flat ice win depth fights with the terrain under it. */
function polygonOffset<M extends THREE.Material>(m: M): M {
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  m.polygonOffsetUnits = -2
  return m
}
