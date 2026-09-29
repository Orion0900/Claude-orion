import * as THREE from 'three'
import type { Enemy } from '../../game/types'
import type { Armed, WeaponKit } from '../kit'
import { rockGeometry, solidMaterial } from '../models'
import { InstancePool, pooled, type Pooled } from '../pool'
import type { WeaponBehavior } from './types'

const MAX_ROCKS = 40
/** Seconds between a rock's checks for pots in its path. */
const BREAK_GAP = 0.2
/** How often old hit timestamps are forgotten. */
const PRUNE_GAP = 1

interface Rock extends Pooled {
  /** Enemy uid → game time this rock last hit it. */
  readonly hits: Map<number, number>
  breakTimer: number
}

const _euler = new THREE.Euler()
const _c = new THREE.Vector3()

/**
 * Boulders circling the player. Each rock hits a given enemy at most once
 * per cooldown and shoves it outward.
 */
export class ChunkersBehavior implements WeaponBehavior {
  private readonly pool: InstancePool<Rock>
  private readonly found: Enemy[] = []
  private readonly dust = new THREE.Color('#c9b08a')
  private phase = 0
  private pruneTimer = PRUNE_GAP

  constructor(
    private readonly kit: WeaponKit,
    private readonly arm: Armed,
  ) {
    this.pool = new InstancePool<Rock>(
      kit.ctx.scene,
      rockGeometry(),
      solidMaterial(),
      MAX_ROCKS,
      () => ({ ...pooled(), hits: new Map<number, number>(), breakTimer: 0 }),
    )
  }

  /** The rocks are always out; the cooldown is their per-enemy hit interval. */
  fire(): boolean {
    return true
  }

  update(dt: number): void {
    const kit = this.kit
    const eff = this.arm.eff
    const player = kit.ctx.player.pos
    const now = kit.ctx.time
    const want = Math.min(MAX_ROCKS, eff.count)
    while (this.pool.active.length < want) {
      const rock = this.pool.spawn()
      if (!rock) break
      rock.hits.clear()
      rock.breakTimer = Math.random() * BREAK_GAP
    }
    while (this.pool.active.length > want) this.pool.removeAt(this.pool.active.length - 1)

    this.phase += eff.speed * dt
    const n = this.pool.active.length
    const orbit = eff.range
    const r = eff.size
    for (let i = 0; i < n; i++) {
      const rock = this.pool.active[i]
      const a = this.phase + (i / n) * Math.PI * 2
      const x = player.x + Math.cos(a) * orbit
      const z = player.z + Math.sin(a) * orbit
      const y = Math.max(kit.groundY(x, z) + r * 0.9, player.y + 0.9) + Math.sin(now * 3 + i) * 0.12
      rock.pos.set(x, y, z)
      rock.quat.setFromEuler(_euler.set(now * 2.1 + i, now * 1.3 + i * 2, 0))
      rock.scale.setScalar(r)

      const hitCount = kit.touching(rock.pos, r, null, this.found)
      for (let j = 0; j < hitCount; j++) {
        const e = this.found[j]
        const last = rock.hits.get(e.uid)
        if (last !== undefined && now - last < eff.cooldown) continue
        rock.hits.set(e.uid, now)
        kit.hit(this.arm, e, e.pos.x - player.x, e.pos.z - player.z)
        kit.embers.burst(kit.centerOf(e, _c), this.dust, kit.count(4), 5, 0.14, 0.35)
      }

      rock.breakTimer -= dt
      if (rock.breakTimer <= 0) {
        rock.breakTimer = BREAK_GAP
        kit.breakables(rock.pos, r + 0.3)
      }
    }

    this.pruneTimer -= dt
    if (this.pruneTimer <= 0) {
      this.pruneTimer = PRUNE_GAP
      const forget = Math.max(PRUNE_GAP, eff.cooldown)
      for (let i = 0; i < n; i++) {
        const hits = this.pool.active[i].hits
        for (const [uid, t] of hits) if (now - t > forget || now < t) hits.delete(uid)
      }
    }
    this.pool.sync()
  }

  clear(): void {
    for (const rock of this.pool.active) rock.hits.clear()
  }

  dispose(): void {
    this.pool.dispose()
  }
}
