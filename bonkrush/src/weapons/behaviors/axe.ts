import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import type { Armed, WeaponKit } from '../kit'
import { axeGeometry, solidMaterial } from '../models'
import { InstancePool } from '../pool'
import { ballisticVelocity, fanOffset, forwardX, forwardZ, yawOf } from '../weaponGeom'
import { makeShot, resetShot, type Shot } from './shot'
import type { WeaponBehavior } from './types'

const GRAVITY = 22
const FLYING = 0
const STUCK = 1
/** An axe that lands stays stuck in the ground this long. */
const STUCK_TIME = 0.4
/** Shortest lob, metres. */
const MIN_THROW = 2.5
/** Seconds between an axe's checks for pots in its path. */
const BREAK_GAP = 0.15

const _from = new THREE.Vector3()
const _c = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

/**
 * Axes lobbed high toward the nearest enemy that tumble end over end and
 * fall through everything beneath them, then thunk into the ground.
 */
export class AxeBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Shot>
  private readonly found: Enemy[] = []
  private readonly spark = new THREE.Color('#ffe2b8')
  private readonly dust = new THREE.Color('#b8a47c')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool(kit.ctx.scene, axeGeometry(arm.w.def.color), solidMaterial(), 48, makeShot)
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const player = kit.ctx.player
    const target = kit.nearest(eff.range)
    kit.muzzle(_from)
    let yaw = player.yaw
    let dist = eff.range * 0.6
    if (target) {
      const dx = target.pos.x - _from.x
      const dz = target.pos.z - _from.z
      yaw = yawOf(dx, dz)
      dist = Math.hypot(dx, dz)
    }
    dist = Math.min(eff.range, Math.max(MIN_THROW, dist))
    // Horizontal speed from the speed stat; the lob's height makes up the rest.
    const along = Math.max(3, eff.speed * 0.6)
    const time = dist / along
    const n = eff.count
    for (let k = 0; k < n; k++) {
      const s = this.pool.spawn()
      if (!s) break
      resetShot(s)
      const a = yaw + fanOffset(k, n, 0.32)
      const tx = _from.x + forwardX(a) * dist
      const tz = _from.z + forwardZ(a) * dist
      const ty = kit.groundY(tx, tz) + 0.6
      s.pos.copy(_from)
      s.prev.copy(_from)
      ballisticVelocity(tx - _from.x, ty - _from.y, tz - _from.z, time, GRAVITY, s.vel)
      s.life = Math.max(time + 0.5, eff.duration)
      s.radius = eff.size
      s.state = FLYING
      s.timer = BREAK_GAP
      s.spin = Math.random() * 2
      s.k = a
      s.scale.setScalar(eff.size * 1.15)
    }
    kit.sound('swing', 0.32, 0.7, player.pos)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      if (s.state === STUCK) {
        s.timer -= dt
        if (s.timer <= 0) {
          this.pool.removeAt(i)
          continue
        }
        // Sinks away once it has had its moment.
        s.scale.setScalar(this.arm.eff.size * 1.15 * Math.min(1, s.timer / 0.15))
        continue
      }
      if (s.age >= s.life) {
        this.pool.removeAt(i)
        continue
      }
      s.prev.copy(s.pos)
      s.vel.y -= GRAVITY * dt
      s.pos.addScaledVector(s.vel, dt)
      s.spin += 15 * dt

      const hits = kit.sweep(s.prev, s.pos, s.radius, s.hits, this.found)
      for (let j = 0; j < hits; j++) {
        const e = this.found[j]
        s.hits.add(e.uid)
        kit.hit(this.arm, e, s.vel.x, s.vel.z)
        kit.embers.burst(kit.centerOf(e, _c), this.spark, kit.count(4), 6, 0.12, 0.3)
      }
      s.timer -= dt
      if (s.timer <= 0) {
        s.timer = BREAK_GAP
        kit.breakables(s.pos, s.radius + 0.2)
      }

      const gy = kit.groundY(s.pos.x, s.pos.z)
      if (s.vel.y < 0 && s.pos.y < gy + 0.25) {
        s.pos.y = gy + 0.25
        s.state = STUCK
        s.timer = STUCK_TIME
        kit.embers.burst(s.pos, this.dust, kit.count(6), 4, 0.14, 0.4)
        kit.ctx.fx.burst(s.pos, '#b8a47c', kit.count(4), 3, 0.2)
        kit.breakables(s.pos, s.radius + 0.5)
      }
      // Negative pitch tumbles the head forward, over the top.
      s.quat.setFromEuler(_euler.set(s.state === STUCK ? -1.1 : -s.spin, s.k, 0))
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
