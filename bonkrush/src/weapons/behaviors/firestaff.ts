import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { sizeMul, type Armed, type WeaponKit } from '../kit'
import { fireballGeometry, glowMaterial } from '../models'
import { InstancePool } from '../pool'
import { makeShot, resetShot, type Shot } from './shot'
import type { WeaponBehavior } from './types'

/** Burn damage per second, as a share of the weapon's hit damage. */
const BURN_SHARE = 0.25
/** Seconds between trail embers per fireball (at full quality). */
const TRAIL_GAP = 0.022

const _from = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _g = new THREE.Vector3()
const _euler = new THREE.Euler()

/** Fireballs streak at their target and burst, splashing and setting the crowd alight. */
export class FirestaffBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Shot>
  private readonly found: Enemy[] = []
  private readonly targets: Enemy[] = []
  private readonly burned: Enemy[] = []
  private readonly orange = new THREE.Color('#ff6a14')
  private readonly yellow = new THREE.Color('#ffd23f')
  private readonly blast = new THREE.Color('#ff7a1a')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool(kit.ctx.scene, fireballGeometry(), glowMaterial(), 48, makeShot, true)
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const n = eff.count
    const found = kit.pickTargets(eff.range, n, this.targets)
    kit.muzzle(_from)
    const grow = Math.sqrt(sizeMul(this.arm))
    for (let k = 0; k < n; k++) {
      const s = this.pool.spawn()
      if (!s) break
      resetShot(s)
      kit.aimVolley(k, n, this.targets, found, _from, 0.22, _dir, eff.speed)
      s.pos.copy(_from).addScaledVector(_dir, 0.5)
      s.prev.copy(s.pos)
      s.vel.copy(_dir).multiplyScalar(eff.speed)
      s.life = Math.max(0.3, eff.duration)
      s.travel = eff.range * 1.3
      s.radius = 0.35 * grow
      s.k = 0.36 * grow
      s.spin = Math.random() * 6
      s.scale.setScalar(s.k)
    }
    kit.sound('fire', 0.34, 1, kit.ctx.player.pos)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const list = this.pool.active
    const trailGap = TRAIL_GAP / kit.fxScale
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      if (s.age >= s.life || s.travel <= 0) {
        this.explode(s.pos)
        this.pool.removeAt(i)
        continue
      }
      s.prev.copy(s.pos)
      s.pos.addScaledVector(s.vel, dt)
      s.travel -= s.vel.length() * dt
      const gy = kit.groundY(s.pos.x, s.pos.z)
      if (s.pos.y < gy + 0.1) {
        s.pos.y = gy + 0.1
        this.explode(s.pos)
        this.pool.removeAt(i)
        continue
      }
      if (kit.sweep(s.prev, s.pos, s.radius, null, this.found) > 0) {
        this.explode(s.pos)
        this.pool.removeAt(i)
        continue
      }
      s.timer -= dt
      while (s.timer <= 0) {
        s.timer += trailGap
        const hot = Math.random() < 0.4
        kit.embers.spark(
          s.pos.x + (Math.random() - 0.5) * s.k,
          s.pos.y + (Math.random() - 0.5) * s.k,
          s.pos.z + (Math.random() - 0.5) * s.k,
          -s.vel.x * 0.08 + (Math.random() - 0.5),
          1 + Math.random(),
          -s.vel.z * 0.08 + (Math.random() - 0.5),
          hot ? this.yellow : this.orange,
          s.k * (hot ? 0.35 : 0.5),
          0.35,
          -2.5,
        )
      }
      s.spin += 9 * dt
      s.quat.setFromEuler(_euler.set(s.spin, s.spin * 0.7, 0))
      s.scale.setScalar(s.k * (1 + 0.14 * Math.sin(s.age * 32)))
    }
    this.pool.sync()
  }

  private explode(pos: THREE.Vector3): void {
    const kit = this.kit
    const eff = this.arm.eff
    const r = eff.size
    const n = kit.hitArea(this.arm, pos, r, 1, 1, this.burned)
    const dps = eff.damage * BURN_SHARE
    for (let i = 0; i < n; i++) {
      const e = this.burned[i]
      if (e.alive) kit.ctx.enemies.applyBurn(e, dps, eff.duration, this.arm.w.def.id)
    }
    kit.blasts.spawn(pos, r * 0.85, this.blast, 0.32)
    kit.embers.burst(pos, this.orange, kit.count(10), 7, 0.2, 0.5, 6)
    kit.embers.burst(pos, this.yellow, kit.count(5), 5, 0.14, 0.4, 3)
    const fx = kit.ctx.fx
    fx.ring(_g.set(pos.x, kit.groundY(pos.x, pos.z) + 0.1, pos.z), r, this.arm.w.def.color, 0.35)
    fx.burst(pos, '#ffcf5a', kit.count(6), 6, 0.2)
    fx.shake(0.05)
    kit.sound('explode', 0.26, 1.3, pos)
    kit.breakables(pos, r)
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}
