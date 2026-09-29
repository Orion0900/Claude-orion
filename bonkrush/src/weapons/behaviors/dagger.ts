import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { sizeMul, type Armed, type WeaponKit } from '../kit'
import { daggerGeometry, solidMaterial } from '../models'
import { InstancePool } from '../pool'
import { steerToward } from '../weaponGeom'
import { makeShot, resetShot, type Shot } from './shot'
import type { WeaponBehavior } from './types'

/** Turn rate at launch and how fast it tightens, rad/s and rad/s². Tightening is what makes it never miss. */
const TURN = 4
const TURN_GROWTH = 14
/** Daggers launch this far off their target's line, so they curve in. */
const CURVE = 0.65
/** Daggers skim over hills rather than dying on them. */
const SKIM = 0.3
/** Seconds between trail motes. */
const TRAIL_GAP = 0.04

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const _from = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _want = new THREE.Vector3()
const _c = new THREE.Vector3()

/**
 * Daggers that launch wide and curve onto their targets, retargeting when
 * the target dies first.
 */
export class DaggerBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Shot>
  private readonly found: Enemy[] = []
  private readonly targets: Enemy[] = []
  private readonly trail: THREE.Color
  private readonly spark = new THREE.Color('#f2e6ff')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool(kit.ctx.scene, daggerGeometry(), solidMaterial('#2a1640'), 96, makeShot)
    this.trail = new THREE.Color(arm.w.def.color)
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const n = eff.count
    const found = kit.pickTargets(eff.range, n, this.targets)
    kit.muzzle(_from)
    for (let k = 0; k < n; k++) {
      const s = this.pool.spawn()
      if (!s) break
      resetShot(s)
      const target = kit.aimVolley(k, n, this.targets, found, _from, 0.18, _dir)
      s.target = target ?? (found > 0 ? this.targets[k % found] : null)
      if (s.target) {
        // Alternate sides and flick upward so each pair fans out and swoops back in.
        const side = k % 2 === 0 ? 1 : -1
        _dir.applyAxisAngle(Y_AXIS, side * (CURVE + 0.12 * (k >> 1)))
        _dir.y += 0.35
        _dir.normalize()
      }
      s.pos.copy(_from)
      s.prev.copy(_from)
      s.vel.copy(_dir).multiplyScalar(eff.speed)
      s.life = Math.max(0.3, eff.duration)
      s.pierce = eff.pierce
      s.radius = eff.size + 0.1
      s.scale.setScalar(sizeMul(this.arm) * 0.95)
      s.quat.setFromUnitVectors(Z_AXIS, _dir)
    }
    kit.sound('shoot', 0.2, 1.55, kit.ctx.player.pos)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const eff = this.arm.eff
    const speed = Math.max(1, eff.speed)
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      // A dagger with a live target keeps going a while longer: it never misses.
      if (s.age >= s.life && (!s.target || s.age >= s.life * 2)) {
        this.pool.removeAt(i)
        continue
      }
      if (s.target && !s.target.alive) s.target = kit.ctx.enemies.nearest(s.pos, eff.range, s.hits)

      _dir.copy(s.vel).divideScalar(Math.max(1e-6, s.vel.length()))
      if (s.target) {
        kit.centerOf(s.target, _want).sub(s.pos)
        if (_want.lengthSq() > 1e-6) steerToward(_dir, _want.normalize(), (TURN + s.age * TURN_GROWTH) * dt)
      }
      s.vel.copy(_dir).multiplyScalar(speed)
      s.prev.copy(s.pos)
      s.pos.addScaledVector(s.vel, dt)
      const gy = kit.groundY(s.pos.x, s.pos.z) + SKIM
      if (s.pos.y < gy) s.pos.y = gy

      let dead = false
      const hits = kit.sweep(s.prev, s.pos, s.radius, s.hits, this.found)
      for (let j = 0; j < hits; j++) {
        const e = this.found[j]
        s.hits.add(e.uid)
        kit.hit(this.arm, e, s.vel.x, s.vel.z)
        kit.embers.burst(kit.centerOf(e, _c), this.spark, kit.count(4), 5, 0.08, 0.25, 4)
        s.pierce--
        if (s.pierce > 0) {
          if (s.target === e) s.target = kit.ctx.enemies.nearest(s.pos, eff.range, s.hits)
          continue
        }
        dead = true
        break
      }
      if (dead) {
        kit.breakables(s.pos, 0.6)
        this.pool.removeAt(i)
        continue
      }

      s.timer -= dt
      if (s.timer <= 0) {
        s.timer = TRAIL_GAP / kit.fxScale
        kit.embers.spark(s.pos.x, s.pos.y, s.pos.z, 0, 0.3, 0, this.trail, 0.07 * s.scale.x, 0.25, 0)
      }
      s.quat.setFromUnitVectors(Z_AXIS, _dir)
    }
    this.pool.sync()
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}
