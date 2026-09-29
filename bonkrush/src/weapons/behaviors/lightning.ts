import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import { sizeMul, type Armed, type WeaponKit } from '../kit'
import { forwardX, forwardZ, fanOffset } from '../weaponGeom'
import type { WeaponBehavior } from './types'

/** Delay between the bolts of one volley, and between chain jumps. */
const STRIKE_GAP = 0.06
const CHAIN_GAP = 0.07
/** How far a chain can jump from one enemy to the next. */
const CHAIN_RANGE = 7
/** With nothing in range, strikes land this far ahead. */
const GROUND_STRIKE_AHEAD = 6

/** One bolt and the chain that follows it. */
interface Strike {
  delay: number
  /** True until the sky bolt lands; then it is chaining. */
  fromSky: boolean
  target: Enemy | null
  /** Where the lightning is now (the last enemy's centre). */
  readonly point: THREE.Vector3
  readonly hits: Set<number>
  chains: number
}

const _top = new THREE.Vector3()
const _to = new THREE.Vector3()
const _g = new THREE.Vector3()

/** Bolts from the sky onto the nearest enemies, each chaining on to the next. */
export class LightningBehavior implements WeaponBehavior {
  private readonly live: Strike[] = []
  private readonly spare: Strike[] = []
  private readonly targets: Enemy[] = []
  private readonly splash: Enemy[] = []
  private readonly color: THREE.Color
  private readonly white = new THREE.Color('#eaffff')

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.color = new THREE.Color(arm.w.def.color)
  }

  fire(): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    const player = kit.ctx.player
    const n = eff.count
    const found = kit.pickTargets(eff.range, n, this.targets)
    for (let k = 0; k < n; k++) {
      const s = this.spare.pop() ?? { delay: 0, fromSky: true, target: null, point: new THREE.Vector3(), hits: new Set<number>(), chains: 0 }
      s.delay = k * STRIKE_GAP
      s.fromSky = true
      s.hits.clear()
      s.chains = eff.bounces
      // Spare bolts beyond the targets found strike them again.
      s.target = found > 0 ? this.targets[k % found] : null
      // If the target dies before its bolt lands, the bolt still hits where it stood.
      if (s.target) kit.centerOf(s.target, s.point)
      else {
        const yaw = player.yaw + fanOffset(k, n, 0.5)
        const x = player.pos.x + forwardX(yaw) * GROUND_STRIKE_AHEAD
        const z = player.pos.z + forwardZ(yaw) * GROUND_STRIKE_AHEAD
        s.point.set(x, kit.groundY(x, z) + 0.2, z)
      }
      this.live.push(s)
    }
    kit.sound('zap', 0.38, 1, player.pos)
    return true
  }

  update(dt: number): void {
    const list = this.live
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      s.delay -= dt
      if (s.delay > 0) continue
      const keep = s.fromSky ? this.strike(s) : this.chain(s)
      if (!keep) {
        const last = list.pop()
        if (last && i < list.length) list[i] = last
        s.target = null
        this.spare.push(s)
      }
    }
  }

  /** The bolt from the sky. Returns whether a chain follows. */
  private strike(s: Strike): boolean {
    const kit = this.kit
    const eff = this.arm.eff
    let e = s.target
    if (e && !e.alive) e = kit.nearest(eff.range, s.hits)
    s.target = e
    if (e) kit.centerOf(e, s.point)
    _to.copy(s.point)
    _top.set(_to.x + (Math.random() - 0.5) * 3, _to.y + 16 + Math.random() * 4, _to.z + (Math.random() - 0.5) * 3)
    const grow = Math.sqrt(sizeMul(this.arm))
    kit.bolts.bolt(_top, _to, this.color, 0.22 * grow, 0.24, 0.28)

    const n = kit.hitArea(this.arm, _to, eff.size, 1, 1, this.splash)
    for (let i = 0; i < n; i++) s.hits.add(this.splash[i].uid)

    _g.set(_to.x, kit.groundY(_to.x, _to.z) + 0.1, _to.z)
    kit.blasts.spawn(_to, eff.size * 0.9, this.color, 0.18)
    kit.embers.burst(_to, this.white, kit.count(7), 8, 0.1, 0.3, 6)
    kit.ctx.fx.ring(_g, eff.size + 0.6, this.arm.w.def.color, 0.25)
    kit.ctx.fx.shake(0.04)
    kit.breakables(_g, eff.size)

    s.fromSky = false
    s.delay = CHAIN_GAP
    return e !== null && s.chains > 0
  }

  /** One jump to the nearest enemy not yet struck. Returns whether another follows. */
  private chain(s: Strike): boolean {
    const kit = this.kit
    if (s.chains <= 0) return false
    const grow = Math.sqrt(sizeMul(this.arm))
    const next = kit.ctx.enemies.nearest(s.point, CHAIN_RANGE * grow, s.hits)
    if (!next) return false
    kit.centerOf(next, _to)
    kit.bolts.bolt(s.point, _to, this.color, 0.12 * grow, 0.2, 0.45)
    kit.hit(this.arm, next, _to.x - s.point.x, _to.z - s.point.z)
    kit.embers.burst(_to, this.white, kit.count(4), 6, 0.08, 0.25, 6)
    kit.sound('zap', 0.18, 1.45, _to)
    s.hits.add(next.uid)
    s.point.copy(_to)
    s.chains--
    s.delay = CHAIN_GAP
    return s.chains > 0
  }

  clear(): void {
    for (const s of this.live) {
      s.target = null
      this.spare.push(s)
    }
    this.live.length = 0
  }

  dispose(): void {
    this.clear()
    this.spare.length = 0
  }
}
