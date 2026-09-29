import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { sizeMul, type Armed, type WeaponKit } from '../kit'
import { arrowGeometry, glowMaterial, solidMaterial, tracerGeometry } from '../models'
import { InstancePool } from '../pool'
import { fanOffset } from '../weaponGeom'
import { makeShot, resetShot, type Shot } from './shot'
import type { WeaponBehavior } from './types'

/** How a straight-shooting weapon looks and fires. */
export interface ShotStyle {
  /** Arrows are solid; tracers glow. */
  model: 'arrow' | 'tracer'
  /** 'fan' fires every projectile at once; 'burst' fires them one after another at different targets. */
  pattern: 'fan' | 'burst'
  /** Radians between neighbours in a fan. */
  spread: number
  gravity: number
  volume: number
  pitch: number
}

export const BOW_STYLE: ShotStyle = { model: 'arrow', pattern: 'fan', spread: 0.12, gravity: 3, volume: 0.24, pitch: 0.8 }
export const REVOLVER_STYLE: ShotStyle = { model: 'tracer', pattern: 'burst', spread: 0.08, gravity: 0, volume: 0.28, pitch: 1.25 }

/** Seconds between the shots of a burst. */
const BURST_GAP = 0.07
/** How far a ricochet looks for its next target. */
const BOUNCE_RANGE = 12

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const _from = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _c = new THREE.Vector3()

/**
 * Longbow and Six-Shooter: fast straight projectiles that pierce and, with
 * bounces, ricochet to the next enemy.
 */
export class ShotBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Shot>
  private readonly found: Enemy[] = []
  private readonly burstTargets = new Set<number>()
  private readonly spark: THREE.Color
  private readonly dust = new THREE.Color('#b8a47c')
  private queued = 0
  private gap = 0

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
    private readonly style: ShotStyle,
  ) {
    const glow = style.model === 'tracer'
    this.pool = new InstancePool(
      kit.ctx.scene,
      glow ? tracerGeometry() : arrowGeometry(arm.w.def.color),
      glow ? glowMaterial() : solidMaterial(),
      160,
      makeShot,
      glow,
    )
    this.spark = new THREE.Color(arm.w.def.color).lerp(new THREE.Color(1, 1, 1), 0.3)
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    if (this.style.pattern === 'burst') {
      if (this.queued === 0) {
        this.gap = 0
        this.burstTargets.clear()
      }
      this.queued = Math.min(this.queued + eff.count, eff.count * 2)
      return true
    }
    const target = kit.nearest(eff.range)
    kit.muzzle(_from)
    kit.aimAt(target, _from, _dir, eff.speed)
    const base = _c.copy(_dir)
    for (let k = 0; k < eff.count; k++) {
      _dir.copy(base).applyAxisAngle(Y_AXIS, fanOffset(k, eff.count, this.style.spread))
      this.launch(_from, _dir)
    }
    kit.sound('shoot', this.style.volume, this.style.pitch, kit.ctx.player.pos)
    return true
  }

  update(dt: number): void {
    if (this.queued > 0) {
      this.gap -= dt
      if (this.gap <= 0) {
        this.burstShot()
        this.queued--
        this.gap = BURST_GAP
      }
    }

    const kit = this.kit
    const list = this.pool.active
    const g = this.style.gravity
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      if (s.age >= s.life || s.travel <= 0) {
        this.pool.removeAt(i)
        continue
      }
      s.prev.copy(s.pos)
      s.vel.y -= g * dt
      s.pos.addScaledVector(s.vel, dt)
      s.travel -= s.vel.length() * dt

      let dead = false
      const hits = kit.sweep(s.prev, s.pos, s.radius, s.hits, this.found)
      for (let j = 0; j < hits; j++) {
        const e = this.found[j]
        kit.hit(this.arm, e, s.vel.x, s.vel.z)
        s.hits.add(e.uid)
        kit.embers.burst(kit.centerOf(e, _c), this.spark, kit.count(3), 5, 0.08, 0.22, 5)
        s.pierce--
        if (s.pierce > 0) continue
        if (s.bounces > 0 && this.ricochet(s, e)) break
        dead = true
        break
      }
      if (hits > 0) kit.breakables(s.pos, 0.6)
      if (!dead && s.pos.y < kit.groundY(s.pos.x, s.pos.z)) {
        kit.embers.burst(s.pos, this.dust, kit.count(3), 3, 0.1, 0.3)
        kit.breakables(s.pos, 0.8)
        dead = true
      }
      if (dead) {
        this.pool.removeAt(i)
        continue
      }
      const speed = s.vel.length()
      if (speed > 1e-6) s.quat.setFromUnitVectors(Z_AXIS, _dir.copy(s.vel).divideScalar(speed))
    }
    this.pool.sync()
  }

  /** One shot of a burst, at the nearest enemy this burst hasn't aimed at yet. */
  private burstShot(): void {
    const kit = this.kit
    const eff = this.arm.eff
    const target = kit.nearest(eff.range, this.burstTargets) ?? kit.nearest(eff.range)
    if (target) this.burstTargets.add(target.uid)
    kit.muzzle(_from)
    kit.aimAt(target, _from, _dir, eff.speed)
    this.launch(_from, _dir)
    kit.embers.burst(_c.copy(_from).addScaledVector(_dir, 0.6), this.spark, kit.count(3), 3, 0.1, 0.12, 0)
    kit.sound('shoot', this.style.volume, this.style.pitch, kit.ctx.player.pos)
  }

  private launch(from: THREE.Vector3, dir: THREE.Vector3): void {
    const s = this.pool.spawn()
    if (!s) return
    const eff = this.arm.eff
    resetShot(s)
    s.pos.copy(from).addScaledVector(dir, 0.4)
    s.prev.copy(s.pos)
    s.vel.copy(dir).multiplyScalar(eff.speed)
    s.life = Math.max(0.2, eff.duration)
    s.travel = eff.range * 1.25
    s.pierce = eff.pierce
    s.bounces = eff.bounces
    s.radius = eff.size
    s.quat.setFromUnitVectors(Z_AXIS, dir)
    const grow = sizeMul(this.arm)
    if (this.style.model === 'tracer') s.scale.set(0.2 * grow, 0.2 * grow, 1.7)
    else s.scale.setScalar(grow)
  }

  /** Redirects a spent shot at the next enemy. Returns false if there is none. */
  private ricochet(s: Shot, from: Enemy): boolean {
    const kit = this.kit
    const next = kit.ctx.enemies.nearest(from.pos, BOUNCE_RANGE, s.hits)
    if (!next) return false
    const speed = Math.max(1, this.arm.eff.speed)
    kit.aimAt(next, s.pos, _dir, speed)
    s.vel.copy(_dir).multiplyScalar(speed)
    s.bounces--
    s.pierce = this.arm.eff.pierce
    s.travel = this.arm.eff.range
    s.life = Math.max(s.life, s.age + 0.6)
    return true
  }

  clear(): void {
    this.queued = 0
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}
