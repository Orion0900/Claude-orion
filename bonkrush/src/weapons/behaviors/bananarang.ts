import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { MUZZLE_HEIGHT, type Armed, type WeaponKit } from '../kit'
import { boomerangGeometry, solidMaterial } from '../models'
import { InstancePool } from '../pool'
import { boomerangDecel, fanOffset } from '../weaponGeom'
import { makeShot, resetShot, type Shot } from './shot'
import type { WeaponBehavior } from './types'

const OUT = 0
const BACK = 1
/** Glide height over the ground. */
const GLIDE = 1.1
/** Caught when it gets this close to the player. */
const CATCH = 1.1
/** Seconds between a boomerang's checks for pots in its path. */
const BREAK_GAP = 0.15

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const _from = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _c = new THREE.Vector3()

/**
 * Boomerangs thrown flat along the aim: they slow to a stop at full range,
 * then home back to the player, hitting everything both ways.
 */
export class BananarangBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Shot>
  private readonly found: Enemy[] = []
  private readonly spark = new THREE.Color('#fff08a')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool(kit.ctx.scene, boomerangGeometry(), solidMaterial('#3a2a00'), 48, makeShot)
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const target = kit.nearest(eff.range)
    kit.muzzle(_from)
    kit.aimAt(target, _from, _c, eff.speed)
    _c.y = 0
    if (_c.lengthSq() < 1e-6) kit.facing(_c)
    _c.normalize()
    const n = eff.count
    const speed = Math.max(1, eff.speed)
    for (let k = 0; k < n; k++) {
      const s = this.pool.spawn()
      if (!s) break
      resetShot(s)
      _dir.copy(_c).applyAxisAngle(Y_AXIS, fanOffset(k, n, 0.38))
      s.pos.copy(_from)
      s.prev.copy(_from)
      s.aux.copy(_dir)
      s.vel.copy(_dir).multiplyScalar(speed)
      s.k = boomerangDecel(speed, Math.max(2, eff.range))
      s.life = Math.max(eff.duration, (4 * speed) / s.k) + 2
      s.radius = eff.size
      s.state = OUT
      s.timer = BREAK_GAP
      s.spin = Math.random() * 6
      s.scale.setScalar(1.4 * eff.size)
    }
    kit.sound('swing', 0.3, 0.75, kit.ctx.player.pos)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const eff = this.arm.eff
    const player = kit.ctx.player.pos
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      if (s.age >= s.life) {
        this.pool.removeAt(i)
        continue
      }
      s.prev.copy(s.pos)
      const dx = player.x - s.pos.x
      const dz = player.z - s.pos.z
      const d = Math.hypot(dx, dz)
      if (s.state === OUT) {
        s.vel.addScaledVector(s.aux, -s.k * dt)
        if (s.vel.dot(s.aux) <= 0) {
          s.state = BACK
          s.hits.clear()
        }
      } else {
        if (d < CATCH) {
          kit.embers.burst(s.pos, this.spark, kit.count(3), 2, 0.08, 0.2, 0)
          this.pool.removeAt(i)
          continue
        }
        // Homes in harder the longer it's been out, so it always comes back.
        const want = Math.max(1, eff.speed) * (1.05 + Math.min(2, s.age * 0.25))
        const steer = Math.min(1, 6 * dt)
        s.vel.x += ((dx / d) * want - s.vel.x) * steer
        s.vel.z += ((dz / d) * want - s.vel.z) * steer
      }
      s.vel.y = 0
      s.pos.addScaledVector(s.vel, dt)
      // Glide over the hills, and come in to the player's hands at the end.
      const glideY = s.state === BACK && d < 4 ? player.y + MUZZLE_HEIGHT : kit.groundY(s.pos.x, s.pos.z) + GLIDE
      s.pos.y += (glideY - s.pos.y) * Math.min(1, 10 * dt)

      const hits = kit.sweep(s.prev, s.pos, s.radius, s.hits, this.found)
      for (let j = 0; j < hits; j++) {
        const e = this.found[j]
        s.hits.add(e.uid)
        kit.hit(this.arm, e, s.vel.x, s.vel.z)
        kit.embers.burst(kit.centerOf(e, _c), this.spark, kit.count(3), 5, 0.1, 0.25, 5)
      }
      s.timer -= dt
      if (s.timer <= 0) {
        s.timer = BREAK_GAP
        kit.breakables(s.pos, s.radius + 0.3)
      }
      s.spin += 22 * dt
      s.quat.setFromAxisAngle(Y_AXIS, s.spin)
      s.scale.setScalar(1.4 * eff.size)
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
