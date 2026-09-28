import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { sizeMul, type Armed, type WeaponKit } from '../kit'
import { glowMaterial, mineGeometry, mineLightGeometry, solidMaterial } from '../models'
import { InstancePool, pooled, type Pooled } from '../pool'
import type { WeaponBehavior } from './types'

const MAX_MINES = 48
/** Seconds from dropping to armed. */
const ARM_TIME = 0.5
/** How long a dropped mine takes to hit the ground. */
const DROP_TIME = 0.25
/** Armed mines look for enemies this often. */
const CHECK_GAP = 0.08
/** A mine caught in a blast goes off this much later: a satisfying ripple. */
const CHAIN_FUSE = 0.1
/** Triggered mines pop after this beat. */
const TRIGGER_FUSE = 0.05
/** Extra trigger reach so big enemies set mines off at their edge. */
const TRIGGER_SLACK = 0.5
const MIN_MOVE = 1.5

interface Mine extends Pooled {
  age: number
  life: number
  /** Seconds until it blows; Infinity while waiting. */
  fuse: number
  check: number
  startY: number
  groundY: number
  size: number
}

const UP = new THREE.Vector3(0, 1, 0)
const _n = new THREE.Vector3()
const _c = new THREE.Vector3()

/**
 * Mines dropped behind the player that arm after a beat, blink, and blow up
 * when an enemy wanders close (or when their time runs out). Blasts set
 * off nearby armed mines in a chain.
 */
export class MinesBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Mine>
  private readonly lights: InstancePool<Pooled>
  private readonly found: Enemy[] = []
  private readonly red = new THREE.Color('#ff2a2a')
  private readonly amber = new THREE.Color('#ffb020')
  private readonly fire1 = new THREE.Color('#ff6a1a')
  private readonly core = new THREE.Color('#fff0b0')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool<Mine>(
      kit.ctx.scene,
      mineGeometry(),
      solidMaterial(),
      MAX_MINES,
      () => ({ ...pooled(), age: 0, life: 1, fuse: Infinity, check: 0, startY: 0, groundY: 0, size: 1 }),
    )
    this.lights = new InstancePool(kit.ctx.scene, mineLightGeometry(), glowMaterial(), MAX_MINES, pooled, true)
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const p = kit.ctx.player
    // Behind means opposite the way you're running, or your back when standing.
    const speed = kit.playerSpeed()
    kit.facing(_c)
    let backX = -_c.x
    let backZ = -_c.z
    if (speed > MIN_MOVE) {
      backX = -p.vel.x / speed
      backZ = -p.vel.z / speed
    }
    const size = 0.62 * Math.sqrt(sizeMul(this.arm))
    for (let k = 0; k < eff.count; k++) {
      const m = this.pool.spawn()
      if (!m) break
      const dist = 1.3 + k * 0.7
      const side = (kit.rng.next() - 0.5) * 1.6
      const x = p.pos.x + backX * dist - backZ * side
      const z = p.pos.z + backZ * dist + backX * side
      m.groundY = kit.groundY(x, z)
      m.startY = Math.max(m.groundY, p.pos.y + 0.8)
      m.pos.set(x, m.startY, z)
      kit.ctx.world.normalAt(x, z, _n)
      m.quat.setFromUnitVectors(UP, _n)
      m.size = size
      m.scale.setScalar(size)
      m.age = 0
      m.life = Math.max(ARM_TIME + 0.5, eff.duration)
      m.fuse = Infinity
      m.check = ARM_TIME
    }
    kit.sound('swing', 0.16, 1.7, p.pos)
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const trigger = this.arm.eff.range + TRIGGER_SLACK
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i]
      m.age += dt
      m.fuse -= dt
      if (m.fuse <= 0 || m.age >= m.life) {
        this.explode(m)
        this.pool.removeAt(i)
        continue
      }
      const t = Math.min(1, m.age / DROP_TIME)
      m.pos.y = m.startY + (m.groundY - m.startY) * t * t
      if (m.age >= ARM_TIME && m.fuse === Infinity) {
        m.check -= dt
        if (m.check <= 0) {
          m.check = CHECK_GAP
          if (kit.ctx.enemies.nearest(m.pos, trigger)) m.fuse = TRIGGER_FUSE
        }
      }
    }
    this.syncLights()
    this.pool.sync()
  }

  /** One blinking light per mine: amber while arming, red and quickening as it ages. */
  private syncLights(): void {
    this.lights.clear()
    for (const m of this.pool.active) {
      const l = this.lights.spawn()
      if (!l) break
      l.pos.set(0, 0.4 * m.size, 0).applyQuaternion(m.quat).add(m.pos)
      let on: boolean
      if (m.age < ARM_TIME) {
        on = true
        l.tint.copy(this.amber).multiplyScalar(0.7)
      } else {
        const period = 0.55 - 0.45 * Math.min(1, m.age / m.life)
        on = m.fuse !== Infinity || m.age % period < period * 0.45
        l.tint.copy(this.red).multiplyScalar(on ? 2.2 : 0.25)
      }
      l.scale.setScalar(m.size * (on ? 0.16 : 0.11))
    }
    this.lights.sync()
  }

  private explode(m: Mine): void {
    const kit = this.kit
    const eff = this.arm.eff
    const r = eff.size
    _c.set(m.pos.x, m.pos.y + 0.4, m.pos.z)
    kit.hitArea(this.arm, _c, r, 1, 1, this.found)
    const reach2 = r * 0.8 * (r * 0.8)
    for (const o of this.pool.active) {
      if (o === m || o.fuse !== Infinity || o.age < ARM_TIME) continue
      const dx = o.pos.x - m.pos.x
      const dz = o.pos.z - m.pos.z
      if (dx * dx + dz * dz <= reach2) o.fuse = CHAIN_FUSE
    }
    kit.blasts.spawn(_c, r, this.fire1, 0.38)
    kit.blasts.spawn(_c, r * 0.5, this.core, 0.2)
    kit.embers.burst(_c, this.fire1, kit.count(14), 9, 0.2, 0.55, 8)
    kit.embers.burst(_c, this.core, kit.count(6), 5, 0.14, 0.35, 4)
    const fx = kit.ctx.fx
    fx.ring(m.pos, r, this.arm.w.def.color, 0.4)
    fx.burst(_c, '#ffb347', kit.count(8), 8, 0.25)
    fx.shake(0.12)
    kit.sound('explode', 0.42, 1, _c)
    kit.breakables(_c, r)
  }

  clear(): void {
    this.pool.clear()
    this.pool.sync()
    this.lights.clear()
    this.lights.sync()
  }

  dispose(): void {
    this.pool.dispose()
    this.lights.dispose()
  }
}
