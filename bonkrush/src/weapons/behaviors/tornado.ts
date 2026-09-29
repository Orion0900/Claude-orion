import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { PLAY_LIMIT } from '../../world/colliders'
import type { Armed, WeaponKit } from '../kit'
import { solidMaterial, tornadoGeometry } from '../models'
import { InstancePool } from '../pool'
import { fanOffset, forwardX, forwardZ, yawOf } from '../weaponGeom'
import { makeShot, resetShot, type Shot } from './shot'
import type { WeaponBehavior } from './types'

const MAX_TWISTERS = 24
/** Seconds between damage ticks. */
const TICK = 0.4
/** Reach of the pull as a multiple of the twister's size. */
const PULL_REACH = 1.4
/** Fastest a twister veers, radians per second. */
const WANDER = 3.5
/** Twisters spawn this far out from the player. */
const SPAWN_OUT = 1.5
const GROW = 0.3
const SHRINK = 0.4

const _euler = new THREE.Euler(0, 0, 0, 'YXZ')

/**
 * Twisters that set off toward the nearest enemy, wander, and suck in and
 * grind everything around them. The pull is the weapon's negative
 * knockback on every tick.
 */
export class TornadoBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Shot>
  private readonly found: Enemy[] = []
  private readonly dust = new THREE.Color('#d8cbb0')
  private readonly mist = new THREE.Color('#e8fbff')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool(
      kit.ctx.scene,
      tornadoGeometry(arm.w.def.color),
      solidMaterial('#27404a'),
      MAX_TWISTERS,
      makeShot,
    )
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const p = kit.ctx.player.pos
    const target = kit.nearest(eff.range)
    const base = target ? yawOf(target.pos.x - p.x, target.pos.z - p.z) : kit.ctx.player.yaw
    const n = eff.count
    for (let k = 0; k < n; k++) {
      const s = this.pool.spawn()
      if (!s) break
      resetShot(s)
      const yaw = base + fanOffset(k, n, 0.7)
      const x = p.x + forwardX(yaw) * SPAWN_OUT
      const z = p.z + forwardZ(yaw) * SPAWN_OUT
      s.pos.set(x, kit.groundY(x, z), z)
      s.k = yaw
      s.life = Math.max(GROW + SHRINK, eff.duration)
      s.radius = eff.size
      s.timer = 0.1
      s.spin = Math.random() * 6
      s.scale.setScalar(0.001)
    }
    kit.sound('swing', 0.3, 0.5, p)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const eff = this.arm.eff
    const limit = Math.min(PLAY_LIMIT, kit.ctx.world.halfSize) - 2
    const dustChance = 14 * dt * kit.fxScale
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.age += dt
      if (s.age >= s.life) {
        kit.embers.burst(s.pos, this.dust, kit.count(6), 3, 0.18, 0.5, 2)
        this.pool.removeAt(i)
        continue
      }
      s.radius = eff.size
      s.k += (kit.rng.next() - 0.5) * 2 * WANDER * dt
      const speed = eff.speed * Math.min(1, 0.3 + s.age * 2)
      let x = s.pos.x + forwardX(s.k) * speed * dt
      let z = s.pos.z + forwardZ(s.k) * speed * dt
      if (Math.abs(x) > limit || Math.abs(z) > limit) {
        s.k += Math.PI
        x = Math.max(-limit, Math.min(limit, x))
        z = Math.max(-limit, Math.min(limit, z))
      }
      s.pos.set(x, kit.groundY(x, z), z)

      s.timer -= dt
      if (s.timer <= 0) {
        s.timer += TICK
        this.grind(s)
      }

      const k = Math.min(1, s.age / GROW) * Math.min(1, (s.life - s.age) / SHRINK)
      const r = s.radius * k
      s.spin += 9 * dt
      const sway = Math.sin(s.age * 5 + s.spin * 0.1) * 0.1
      s.quat.setFromEuler(_euler.set(sway, s.spin, sway * 0.6))
      s.scale.set(r, (0.6 + 0.6 * s.radius) * k, r)

      if (Math.random() < dustChance) {
        const a = Math.random() * Math.PI * 2
        const d = r * 0.7
        kit.embers.spark(
          x + Math.cos(a) * d,
          s.pos.y + 0.2 + Math.random() * 0.5,
          z + Math.sin(a) * d,
          -Math.sin(a) * 4,
          2.5 + Math.random() * 2,
          Math.cos(a) * 4,
          Math.random() < 0.5 ? this.dust : this.mist,
          0.14,
          0.6,
          -1,
          1,
        )
      }
    }
    this.pool.sync()
  }

  private grind(s: Shot): void {
    const kit = this.kit
    const n = kit.inRadius(s.pos, s.radius * PULL_REACH, 1, 4, this.found)
    for (let i = 0; i < n; i++) {
      const e = this.found[i]
      kit.hit(this.arm, e, e.pos.x - s.pos.x, e.pos.z - s.pos.z)
    }
    kit.breakables(s.pos, s.radius)
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
  }

  dispose(): void {
    this.pool.dispose()
  }
}
