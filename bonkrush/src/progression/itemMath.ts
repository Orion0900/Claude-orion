import type { StatMod } from '../game/types'

/**
 * Chance for a proc item with `base` odds per stack. Stacks combine like
 * independent rolls (so ten Ice Cubes are 65%, not 100%), then luck scales
 * the result: +100% luck doubles it.
 */
export function procChance(base: number, stacks: number, luck: number): number {
  if (!(stacks > 0) || !(base > 0)) return 0
  const stacked = 1 - Math.pow(1 - Math.min(1, base), stacks)
  return Math.min(1, stacked * (1 + Math.max(0, luck || 0)))
}

/** Lifesteal heal for one hit: the whole part always, the fraction as a chance. `roll` is uniform [0, 1). */
export function lifestealHeal(lifesteal: number, roll: number): number {
  if (!(lifesteal > 0)) return 0
  const whole = Math.floor(lifesteal)
  return whole + (roll < lifesteal - whole ? 1 : 0)
}

/** Idle Juice ramps up to +50% per stack over two seconds of standing still. */
export const IDLE_RAMP_SECONDS = 2
export function idleBonus(stillSeconds: number, stacks: number): number {
  if (!(stacks > 0) || !(stillSeconds > 0)) return 0
  return 0.5 * stacks * Math.min(1, stillSeconds / IDLE_RAMP_SECONDS)
}

/** Seconds between Vacuum Magnet pulls: 15 s, 2 s faster per extra stack, never under 5 s. */
export function vacuumInterval(stacks: number): number {
  return Math.max(5, 15 - 2 * (Math.max(1, stacks) - 1))
}

/** Souls per kill: one, plus one for every two more Soul Reapers. */
export function soulCount(stacks: number): number {
  return stacks > 0 ? 1 + Math.floor((stacks - 1) / 2) : 0
}

/** Rusty Key: chance a chest is free, k / (k + 1) with k = 0.1 per key. */
export function keyFreeChance(stacks: number): number {
  const k = 0.1 * Math.max(0, stacks)
  return k / (k + 1)
}

/** Everything the conditional damage items look at for one hit. */
export interface HitConditions {
  /** Enemy hp / maxHp. */
  enemyHpFrac: number
  airborne: boolean
  /** Distance from the player to the enemy's edge, metres. */
  distance: number
  stillSeconds: number
  maxHp: number
  shroudActive: boolean
}

/** Stacks held of each conditional damage item. */
export interface ConditionalStacks {
  glasses: number
  scarf: number
  knuckles: number
  idle: number
  beefy: number
  shroud: number
}

export const BRASS_KNUCKLES_RANGE = 4

/**
 * Damage multiplier from Tactical Glasses, Sky Scarf, Brass Knuckles, Idle
 * Juice, Beefy Ring and the Phantom Shroud buff. Each multiplies separately,
 * so combining conditions pays off.
 */
export function conditionalMultiplier(s: ConditionalStacks, c: HitConditions): number {
  let m = 1
  if (s.glasses > 0 && c.enemyHpFrac >= 0.9) m *= 1 + 0.25 * s.glasses
  if (s.scarf > 0 && c.airborne) m *= 1 + 0.3 * s.scarf
  if (s.knuckles > 0 && c.distance <= BRASS_KNUCKLES_RANGE) m *= 1 + 0.25 * s.knuckles
  if (s.idle > 0) m *= 1 + idleBonus(c.stillSeconds, s.idle)
  if (s.beefy > 0 && c.maxHp > 0) m *= 1 + 0.1 * s.beefy * (c.maxHp / 100)
  if (s.shroud > 0 && c.shroudActive) m *= 1 + s.shroud
  return m
}

/** An item's per-stack mods for `stacks` copies: adds scale linearly, multipliers compound. */
export function stackMods(mods: readonly StatMod[], stacks: number): StatMod[] {
  if (!(stacks > 0)) return []
  return mods.map((m) => ({ ...m, value: m.op === 'add' ? m.value * stacks : Math.pow(m.value, stacks) }))
}

/** Folds `mod` into a list, combining with an existing entry for the same stat and op. */
export function mergeMod(list: StatMod[], mod: StatMod): StatMod[] {
  const same = list.find((m) => m.stat === mod.stat && m.op === mod.op)
  if (!same) list.push({ ...mod })
  else if (mod.op === 'add') same.value += mod.value
  else same.value *= mod.value
  return list
}
