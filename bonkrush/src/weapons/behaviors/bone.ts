import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import type { Armed, WeaponKit } from '../kit'
import { boneGeometry, solidMaterial } from '../models'
import { InstancePool } from '../pool'
import { ballisticVelocity, yawOf } from '../weaponGeom'
import { makeShot, resetShot, type Shot } from './shot'
import type { WeaponBehavior } from './types'

const GRAVITY = 16
/** How far a bone looks for its next skull. */
const BOUNCE_RANGE = 12
/** Ground bounces a bone gets before it clatters to a stop. */
const MAX_GROUND_BOUNCES = 3
/** Longest arc a bone takes to reach its target, seconds. */
const MAX_FLIGHT = 1.1

const STATE_LIVE = 0
const STATE_SPENT = 1

const _from = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _c = new THREE.Vector3()
const _n = new THREE.Vector3()
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

/**
 * Bones are lobbed on a ballistic arc at a target, then ricochet to the next
 * one; they also bounce off the ground, looking for something to hit.
 */
export class BoneBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Shot>
  private readonly found: Enemy[] = []
  private readonly targets: Enemy[] = []
  private readonly spark = new THREE.Color('#fff4d6')
  private readonly dust = new THREE.Color('#b8a47c')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool(kit.ctx.scene, boneGeometry(), solidMaterial(), 64, makeShot)
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
      s.pos.copy(_from)
      s.prev.copy(_from)
      s.life = Math.max(0.5, eff.duration)
      s.pierce = eff.pierce
      s.bounces = eff.bounces
      s.radius = eff.size
      s.spin = Math.random() * 6
      s.scale.setScalar(eff.size * 1.8)
      const target = kit.aimVolley(k, n, this.targets, found, _from, 0.3, _dir)
      if (target) this.launchAt(s, target)
      else s.vel.copy(_dir).multiplyScalar(eff.speed).setY(_dir.y * eff.speed + 4)
    }
    kit.sound('swing', 0.26, 1.3, kit.ctx.player.pos)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      if (s.age >= s.life) {
        this.poof(s)
        this.pool.removeAt(i)
        continue
      }
      s.prev.copy(s.pos)
      s.vel.y -= GRAVITY * dt
      s.pos.addScaledVector(s.vel, dt)
      s.spin += 16 * dt
      if (s.state === STATE_LIVE && kit.sweep(s.prev, s.pos, s.radius, s.hits, this.found) > 0) {
        this.strike(s, this.found[0])
      }
      const gy = kit.groundY(s.pos.x, s.pos.z)
      if (s.pos.y < gy + 0.15) {
        if (s.state === STATE_SPENT || s.n >= MAX_GROUND_BOUNCES || s.vel.lengthSq() < 16) {
          this.poof(s)
          this.pool.removeAt(i)
          continue
        }
        this.groundBounce(s, gy)
      }
      s.quat.setFromEuler(_euler.set(s.spin, yawOf(s.vel.x, s.vel.z), 0))
    }
    this.pool.sync()
  }

  /** Lobs `s` so it lands on `e` (leading it a little). */
  private launchAt(s: Shot, e: Enemy): void {
    this.kit.centerOf(e, _c)
    const speed = Math.max(1, this.arm.eff.speed)
    let t = Math.min(MAX_FLIGHT, Math.max(0.12, _c.distanceTo(s.pos) / speed))
    _c.x += e.vel.x * t * 0.6
    _c.z += e.vel.z * t * 0.6
    t = Math.min(MAX_FLIGHT, Math.max(0.12, _c.distanceTo(s.pos) / speed))
    ballisticVelocity(_c.x - s.pos.x, _c.y - s.pos.y, _c.z - s.pos.z, t, GRAVITY, s.vel)
    s.target = e
  }

  private strike(s: Shot, e: Enemy): void {
    const kit = this.kit
    kit.hit(this.arm, e, s.vel.x, s.vel.z)
    s.hits.add(e.uid)
    kit.embers.burst(kit.centerOf(e, _c), this.spark, kit.count(4), 5, 0.1, 0.3)
    s.pierce--
    if (s.pierce > 0) return
    if (s.bounces > 0) {
      const next = kit.ctx.enemies.nearest(e.pos, BOUNCE_RANGE, s.hits)
      if (next) {
        s.bounces--
        s.pierce = this.arm.eff.pierce
        s.life = Math.max(s.life, s.age + 1.2)
        this.launchAt(s, next)
        return
      }
    }
    // Spent: it pops off the last skull and clatters down.
    s.state = STATE_SPENT
    s.vel.set(-s.vel.x * 0.2, 6, -s.vel.z * 0.2)
  }

  private groundBounce(s: Shot, gy: number): void {
    const kit = this.kit
    s.pos.y = gy + 0.15
    kit.ctx.world.normalAt(s.pos.x, s.pos.z, _n)
    const into = s.vel.dot(_n)
    if (into < 0) s.vel.addScaledVector(_n, -2 * into)
    s.vel.multiplyScalar(0.62)
    s.vel.y = Math.max(s.vel.y, 3.5)
    s.n++
    // A lively bounce hops toward whoever is closest.
    if (s.bounces > 0) {
      const next = kit.ctx.enemies.nearest(s.pos, BOUNCE_RANGE, s.hits)
      if (next) this.launchAt(s, next)
    }
    kit.embers.burst(s.pos, this.dust, kit.count(3), 3, 0.12, 0.3)
    kit.breakables(s.pos, 1)
  }

  private poof(s: Shot): void {
    this.kit.embers.burst(s.pos, this.dust, this.kit.count(4), 2.5, 0.12, 0.35)
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}
