/**
 * Owns the player's weapons: adds and upgrades them, turns their numbers
 * into effective stats every frame, fires each one when its timer runs out,
 * and rolls every hit's damage. What a weapon actually does lives in its
 * behavior (`weapons/behaviors`).
 */
import type { Rng } from '../core/rng'
import { tierOf } from '../enemies/enemyDefs'
import type { DamageRoll, Enemy, GameContext, WeaponApi, WeaponDef, WeaponInstance, WeaponStats } from '../game/types'
import { BEHAVIORS } from './behaviors'
import type { BehaviorFactory, WeaponBehavior } from './behaviors/types'
import { WeaponKit, type Armed, type DamageSource } from './kit'
import { WEAPON_BY_ID } from './weaponDefs'
import { applyUpgrade, critMultiplier, critTiers, effectiveStats } from './weaponMath'

/** A new weapon waits this long before its first activation. */
const FIRST_SHOT_DELAY = 0.25
/** Salt for this system's own random stream. */
const RNG_SALT = 0x3ea9

interface Slot extends Armed {
  behavior: WeaponBehavior
}

const IDLE: WeaponBehavior = {
  update() {},
  fire: () => true,
  clear() {},
  dispose() {},
}

export class WeaponManager implements WeaponApi, DamageSource {
  readonly maxSlots = 4

  private readonly slots: Slot[] = []
  private readonly instances: WeaponInstance[] = []
  private readonly byId = new Map<string, Slot>()
  private readonly rng: Rng
  private readonly kit: WeaponKit
  private readonly unsubs: Array<() => void>
  private disposed = false

  constructor(private readonly ctx: GameContext) {
    this.rng = ctx.rng.fork(RNG_SALT)
    // Builds the shared effect pools now (hidden while empty) so Game's shader prewarm compiles them.
    this.kit = new WeaponKit(ctx, this, this.rng)
    this.unsubs = [
      ctx.events.on('enemyHit', ({ source, amount }) => {
        const slot = this.byId.get(source)
        if (slot) slot.w.dealt += amount
      }),
      ctx.events.on('enemyKilled', ({ source }) => {
        const slot = this.byId.get(source)
        if (slot) slot.w.kills++
      }),
      // The next stage is a fresh map: nothing in flight survives the portal.
      ctx.events.on('stageCleared', () => this.clearEffects()),
    ]
  }

  get owned(): readonly WeaponInstance[] {
    return this.instances
  }

  has(defId: string): boolean {
    return this.byId.has(defId)
  }

  /** The new weapon, the existing one if already owned, or null for an unknown id or full slots. */
  add(defId: string): WeaponInstance | null {
    const existing = this.byId.get(defId)
    if (existing) return existing.w
    const def: WeaponDef | undefined = WEAPON_BY_ID[defId]
    if (!def || this.slots.length >= this.maxSlots || this.disposed) return null

    const w: WeaponInstance = { def, level: 1, stats: { ...def.base }, timer: FIRST_SHOT_DELAY, dealt: 0, kills: 0 }
    const slot: Slot = { w, eff: effectiveStats(w.stats, this.ctx.progression.stats, def.behavior), behavior: IDLE }
    const factory: BehaviorFactory | undefined = BEHAVIORS[def.behavior]
    // Behaviors build every mesh they will ever draw here, never on first use, for the same reason.
    if (factory) slot.behavior = factory(this.kit, slot)
    else console.warn(`[weapons] no behavior "${def.behavior}" for ${def.id}`)

    this.slots.push(slot)
    this.instances.push(w)
    this.byId.set(def.id, slot)
    this.ctx.events.emit('weaponAdded', { id: def.id })
    return w
  }

  upgrade(defId: string, changes: Partial<WeaponStats>): void {
    const slot = this.byId.get(defId)
    if (!slot) return
    applyUpgrade(slot.w.stats, changes)
    slot.w.level++
    this.refresh(slot)
  }

  effective(w: WeaponInstance): WeaponStats {
    return effectiveStats(w.stats, this.ctx.progression.stats, w.def.behavior)
  }

  rollDamage(w: WeaponInstance, enemy: Enemy): DamageRoll {
    const slot = this.byId.get(w.def.id)
    let arm: Armed
    if (slot && slot.w === w) {
      // Callers outside the frame loop may have just changed stats.
      this.refresh(slot)
      arm = slot
    } else {
      arm = { w, eff: this.effective(w) }
    }
    return this.rollInto(arm, enemy, { amount: 0, crit: false })
  }

  rollInto(arm: Armed, enemy: Enemy, out: DamageRoll): DamageRoll {
    const stats = this.ctx.progression.stats
    const tiers = critTiers(arm.eff.critChance, this.rng.next())
    let amount = arm.eff.damage * critMultiplier(tiers, stats.critDamage)
    if (isEliteClass(enemy)) amount *= stats.eliteDamage
    amount *= this.ctx.progression.outgoingMultiplier(enemy)
    out.amount = Number.isFinite(amount) ? Math.max(0, amount) : 0
    out.crit = tiers > 0
    return out
  }

  update(dt: number): void {
    if (this.disposed || !this.ctx.player.alive) return
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i]
      this.refresh(slot)
      slot.behavior.update(dt)
      const w = slot.w
      w.timer -= dt
      if (w.timer <= 0) w.timer = slot.behavior.fire() ? Math.max(0, w.timer + slot.eff.cooldown) : 0
    }
    this.kit.update(dt)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const off of this.unsubs) off()
    for (const slot of this.slots) slot.behavior.dispose()
    this.kit.dispose()
    this.slots.length = 0
    this.byId.clear()
  }

  private refresh(slot: Slot): void {
    effectiveStats(slot.w.stats, this.ctx.progression.stats, slot.w.def.behavior, slot.eff)
  }

  private clearEffects(): void {
    for (const slot of this.slots) slot.behavior.clear()
    this.kit.clear()
  }
}

/** Elites, minibosses and bosses all take the eliteDamage bonus; minibosses carry neither flag. */
function isEliteClass(enemy: Enemy): boolean {
  return enemy.elite || enemy.boss || tierOf(enemy.def) !== 'normal'
}
