/**
 * The player's survival rules — armor, shield, healing and knockback — kept
 * pure so the numbers in docs/DESIGN.md can be checked by tests.
 */

/** Invulnerability after a hit (or a dodge), seconds. */
export const IFRAMES = 0.5
/** Seconds without damage before the shield starts recharging. */
export const SHIELD_DELAY = 4
/** Fraction of the maximum shield restored per second while recharging. */
export const SHIELD_RECHARGE = 0.2
const ARMOR_CAP = 0.8

export interface HitResult {
  /** Damage left after armor. */
  total: number
  /** The part the shield soaked up. */
  absorbed: number
  /** The part that reaches HP. */
  toHp: number
}

/** Armor first, then the shield takes what it can. */
export function resolveHit(amount: number, armor: number, shield: number): HitResult {
  const total = Math.max(0, amount || 0) * (1 - Math.min(ARMOR_CAP, Math.max(0, armor || 0)))
  const absorbed = Math.min(Math.max(0, shield || 0), total)
  return { total, absorbed, toHp: total - absorbed }
}

export interface HealResult {
  hp: number
  shield: number
  /** HP actually restored. */
  healed: number
  shieldGained: number
}

/**
 * Heals up to max HP; the overflow × `overheal` becomes shield, which
 * overheal can't raise past max HP (a bigger natural shield is kept).
 */
export function resolveHeal(hp: number, maxHp: number, shield: number, amount: number, overheal: number): HealResult {
  if (!(amount > 0)) return { hp, shield, healed: 0, shieldGained: 0 }
  const healed = Math.min(Math.max(0, maxHp - hp), amount)
  let next = shield
  const overflow = amount - healed
  if (overflow > 0 && overheal > 0) next = Math.min(Math.max(shield, maxHp), shield + overflow * overheal)
  return { hp: hp + healed, shield: next, healed, shieldGained: next - shield }
}

/** The shield refills at 20% of its maximum per second once 4 s have passed since the last hit. */
export function rechargeShield(shield: number, maxShield: number, sinceHit: number, dt: number): number {
  if (maxShield <= 0 || shield >= maxShield || sinceHit < SHIELD_DELAY || !(dt > 0)) return shield
  return Math.min(maxShield, shield + maxShield * SHIELD_RECHARGE * dt)
}

/** How hard a hit shoves the player (m/s): bigger hits push further. */
export function knockbackSpeed(damage: number): number {
  return Math.min(10, 2 + Math.max(0, damage || 0) * 0.2)
}
