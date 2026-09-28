import type { Armed, WeaponKit } from '../kit'

/**
 * What drives one owned weapon. The manager refreshes `arm.eff`, calls
 * `update` every frame, and `fire` whenever the weapon's timer runs out.
 */
export interface WeaponBehavior {
  /** Moves everything this weapon has out in the world. */
  update(dt: number): void
  /** One activation. False means "not now": the manager asks again next frame. */
  fire(): boolean
  /** Drops everything in flight (stage change). */
  clear(): void
  dispose(): void
}

export type BehaviorFactory = (kit: WeaponKit, arm: Armed) => WeaponBehavior
