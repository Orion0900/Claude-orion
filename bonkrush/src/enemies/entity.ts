/**
 * The concrete enemy object. It satisfies the contract's `Enemy` and carries
 * the manager's private per-enemy state alongside, so the hot loop touches
 * one object per enemy and nothing is looked up in side tables.
 */
import * as THREE from 'three'
import type { Enemy, EnemyDef } from '../game/types'
import type { EnemyTier } from './enemyDefs'

export class EnemyEntity implements Enemy {
  uid = 0
  def: EnemyDef
  pos = new THREE.Vector3()
  vel = new THREE.Vector3()
  yaw = 0
  hp = 1
  maxHp = 1
  scale = 1
  elite = false
  boss = false
  alive = false
  slow = 0
  burn = 0
  burnDps = 0
  freeze = 0
  hitFlash = 99
  t = 0
  state = 0

  tier: EnemyTier = 'normal'
  /** Multiplies def.damage and projectile damage (director scale, elite, swarm tier). */
  damageScale = 1
  /** Instance tint (final-swarm tiers); multiplies the vertex colours. */
  tintR = 1
  tintG = 1
  tintB = 1
  /** Knockback velocity, decaying; kept apart from steering so steering can't cancel it. */
  kbX = 0
  kbZ = 0
  /** Steering velocity chosen by the AI this frame. */
  moveX = 0
  moveZ = 0
  burnTick = 0
  /** Seconds alive, for the pop-in and animation. */
  age = 0
  /** Seconds, so individuals don't animate in lockstep. */
  phase = 0
  /** ±1: which way it flanks or strafes. */
  side = 1
  /** Hover height above ground for fliers. */
  hover = 0
  groundY = 0
  /** Seconds until the next shot. */
  fireT = 0
  /** Locked direction for dashes, beams and similar. */
  dirX = 0
  dirZ = 1
  dashSpeed = 0
  dashT = 0
  /** Boss / miniboss pattern state. */
  attackCd = 0
  attackIdx = 0
  busy = 0
  /** Contact damage multiplier while an attack (a charge) is active. */
  contactMult = 1
  /** True while winding up an attack: the renderer shakes and blinks it. */
  windup = false
  /** A sweeping beam: seconds left, current angle (0 = +Z) and turn rate. */
  sweepT = 0
  sweepAngle = 0
  sweepSpeed = 0
  /** Sets to false for enemies other systems hold on to (challenge elites, bosses), so the object is never reused. */
  recyclable = true
  diedAt = 0

  constructor(def: EnemyDef) {
    this.def = def
  }

  /** Back to a blank enemy of `def` (pooled objects are reused). */
  reset(def: EnemyDef): void {
    this.def = def
    this.uid = 0
    this.pos.set(0, 0, 0)
    this.vel.set(0, 0, 0)
    this.yaw = 0
    this.hp = this.maxHp = 1
    this.scale = 1
    this.elite = this.boss = this.alive = false
    this.slow = this.burn = this.burnDps = this.freeze = 0
    this.hitFlash = 99
    this.t = 0
    this.state = 0
    this.tier = 'normal'
    this.damageScale = 1
    this.tintR = this.tintG = this.tintB = 1
    this.kbX = this.kbZ = this.moveX = this.moveZ = 0
    this.burnTick = 0
    this.age = 0
    this.phase = 0
    this.side = 1
    this.hover = 0
    this.groundY = 0
    this.fireT = 0
    this.dirX = 0
    this.dirZ = 1
    this.dashSpeed = this.dashT = 0
    this.attackCd = this.attackIdx = this.busy = 0
    this.contactMult = 1
    this.windup = false
    this.sweepT = this.sweepAngle = this.sweepSpeed = 0
    this.recyclable = true
    this.diedAt = 0
  }

  get radius(): number {
    return this.def.radius * this.scale
  }

  get height(): number {
    return this.def.height * this.scale
  }

  get flier(): boolean {
    return this.def.behavior === 'flier'
  }
}

/**
 * Moves an enemy to a fresh spot as if it had just arrived (the spawner
 * recycles far stragglers this way). Works on any `Enemy`, but only clears
 * internal state on our own entities.
 */
export function relocate(e: Enemy, x: number, y: number, z: number): void {
  e.pos.set(x, y, z)
  e.vel.set(0, 0, 0)
  e.state = 0
  e.t = 0
  if (e instanceof EnemyEntity) {
    e.kbX = e.kbZ = 0
    e.moveX = e.moveZ = 0
    e.age = 0
    e.groundY = y
    e.dashT = 0
    e.contactMult = 1
    e.windup = false
    e.sweepT = 0
  }
}

/** Final-swarm tint and damage for an enemy the spawner just created. */
export function setVariant(e: Enemy, damageMult: number, tint: readonly [number, number, number]): void {
  if (!(e instanceof EnemyEntity)) return
  e.damageScale *= damageMult
  e.tintR = tint[0]
  e.tintG = tint[1]
  e.tintB = tint[2]
}

/** Marks an enemy that another system will track, so its object is never pooled and reused. */
export function pin(e: Enemy): void {
  if (e instanceof EnemyEntity) e.recyclable = false
}
