import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import type { Armed, WeaponKit } from '../kit'
import { glowMaterial, slashGeometry } from '../models'
import { InstancePool, pooled, type Pooled } from '../pool'
import { forwardX, forwardZ, inSwept, yawOf } from '../weaponGeom'
import type { WeaponBehavior } from './types'

/** How a melee weapon's swing looks and sounds. */
export interface SlashStyle {
  /** Arc the swing covers (and hits), degrees. */
  arcDeg: number
  /** Crescent thickness as a fraction of the reach. */
  width: number
  /** How far the crescent turns during the swing, radians. */
  turn: number
  /** Roll of the swing plane, radians; flips side each swing. */
  tilt: number
  /** Height of the blade above the feet. */
  height: number
  pitch: number
  volume: number
}

export const SWORD_STYLE: SlashStyle = { arcDeg: 150, width: 0.42, turn: 0.7, tilt: 0.14, height: 0.85, pitch: 0.9, volume: 0.36 }
export const KATANA_STYLE: SlashStyle = { arcDeg: 110, width: 0.24, turn: 1.1, tilt: 0.42, height: 0.95, pitch: 1.35, volume: 0.28 }

/** Extra swings from `count` follow each other this far apart. */
const REPEAT_GAP = 0.08
/** A finished swing lingers this long while it fades. */
const FADE = 0.1

interface Swing extends Pooled {
  readonly hits: Set<number>
  facing: number
  /** +1 sweeps toward increasing yaw, −1 back; alternates every swing. */
  sign: number
  age: number
  dur: number
  reach: number
}

const WHITE = new THREE.Color(1, 1, 1)
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
const _c = new THREE.Vector3()

/**
 * Sword and katana: a crescent that sweeps around the player toward the
 * nearest enemy (or the facing), hitting each enemy once as the blade
 * passes over it.
 */
export class SlashBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Swing>
  private readonly found: Enemy[] = []
  private readonly halfArc: number
  private readonly spark: THREE.Color
  private queued = 0
  private gap = 0
  private sign = 1

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
    private readonly style: SlashStyle,
  ) {
    this.halfArc = (style.arcDeg * Math.PI) / 360
    this.spark = new THREE.Color(arm.w.def.color).lerp(WHITE, 0.4)
    this.pool = new InstancePool<Swing>(
      kit.ctx.scene,
      slashGeometry(style.arcDeg, style.width, arm.w.def.color),
      glowMaterial(),
      24,
      () => ({ ...pooled(), hits: new Set<number>(), facing: 0, sign: 1, age: 0, dur: 0.2, reach: 1 }),
      true,
    )
  }

  fire(): boolean {
    const count = this.arm.eff.count
    if (this.queued === 0) this.gap = 0
    this.queued = Math.min(this.queued + count, count * 2)
    return true
  }

  update(dt: number): void {
    if (this.queued > 0) {
      this.gap -= dt
      if (this.gap <= 0) {
        this.swing()
        this.queued--
        this.gap = REPEAT_GAP
      }
    }

    const p = this.kit.ctx.player.pos
    const list = this.pool.active
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]
      const swinging = s.age < s.dur
      s.age += dt
      if (swinging) this.cut(s, Math.min(1, s.age / s.dur))
      if (s.age >= s.dur + FADE) {
        this.pool.removeAt(i)
        continue
      }
      const t = Math.min(1, s.age / s.dur)
      const ease = 1 - (1 - t) * (1 - t) * (1 - t)
      const r = s.reach * (0.72 + 0.28 * ease)
      // The blade rides along with the player so slides keep their slash.
      s.pos.set(p.x, p.y + this.style.height, p.z)
      s.quat.setFromEuler(_euler.set(0, s.facing + s.sign * (ease - 0.5) * this.style.turn, this.style.tilt * s.sign))
      s.scale.set(r * s.sign, r, r)
      const half = s.dur * 0.5
      const fade = s.age < half ? 1 : Math.max(0, 1 - (s.age - half) / (half + FADE))
      s.tint.setScalar(fade * 1.25)
    }
    this.pool.sync()
  }

  private swing(): void {
    const kit = this.kit
    const eff = this.arm.eff
    const player = kit.ctx.player
    const target = kit.nearest(eff.range)
    const facing = target ? yawOf(target.pos.x - player.pos.x, target.pos.z - player.pos.z) : player.yaw
    const s = this.pool.spawn()
    if (!s) return
    s.hits.clear()
    s.facing = facing
    s.sign = this.sign
    this.sign = -this.sign
    s.age = 0
    s.dur = Math.max(0.06, eff.duration)
    s.reach = eff.size
    kit.sound('swing', this.style.volume, this.style.pitch, player.pos)
    _c.set(
      player.pos.x + forwardX(facing) * s.reach * 0.55,
      player.pos.y + 0.5,
      player.pos.z + forwardZ(facing) * s.reach * 0.55,
    )
    kit.breakables(_c, s.reach * 0.6)
  }

  /** Hits whatever the blade has passed over so far and hasn't hit yet. */
  private cut(s: Swing, progress: number): void {
    const kit = this.kit
    const p = kit.ctx.player.pos
    const n = kit.inRadius(p, s.reach, 1.5, 3, this.found)
    for (let i = 0; i < n; i++) {
      const e = this.found[i]
      if (s.hits.has(e.uid)) continue
      const dx = e.pos.x - p.x
      const dz = e.pos.z - p.z
      if (!inSwept(dx, dz, e.def.radius * e.scale, s.reach, s.facing, this.halfArc, s.sign, progress)) continue
      s.hits.add(e.uid)
      kit.hit(this.arm, e, dx, dz)
      kit.embers.burst(kit.centerOf(e, _c), this.spark, kit.count(3), 6, 0.1, 0.25, 6)
    }
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
