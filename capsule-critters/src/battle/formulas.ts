/**
 * The numbers behind battles, after the classic handheld rules: stats from
 * base stats, determinant values (0–15) and stat experience; experience
 * curves; the damage formula with its random 217–255 spread; critical hits
 * that come more often to fast critters; the 13-step stat stage table; the
 * capsule shake checks; and running away. Pure functions, unit tested.
 */
import type { Growth } from '../data/species'
import type { Rng } from '../core/rng'
import type { StatusId } from '../data/moves'

export const MAX_LEVEL = 100
export const MAX_STAT_EXP = 65535

export interface Dvs {
  atk: number
  def: number
  spd: number
  spc: number
}

/** The HP determinant is built from the low bits of the other four. */
export function hpDv(d: Dvs): number {
  return ((d.atk & 1) << 3) | ((d.def & 1) << 2) | ((d.spd & 1) << 1) | (d.spc & 1)
}

/** The stat-experience bonus: a quarter of the (rounded-up) square root. */
export function statExpBonus(statExp: number): number {
  return Math.floor(Math.ceil(Math.sqrt(Math.max(0, Math.min(MAX_STAT_EXP, statExp)))) / 4)
}

/** A non-HP stat. */
export function calcStat(base: number, dv: number, statExp: number, level: number): number {
  return Math.floor((((base + dv) * 2 + statExpBonus(statExp)) * level) / 100) + 5
}

export function calcHpStat(base: number, dv: number, statExp: number, level: number): number {
  return Math.floor((((base + dv) * 2 + statExpBonus(statExp)) * level) / 100) + level + 10
}

/** Total experience needed to be at `level`. */
export function xpForLevel(growth: Growth, level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, level))
  if (n <= 1) return 0
  switch (growth) {
    case 'fast':
      return Math.floor((4 * n ** 3) / 5)
    case 'mediumFast':
      return n ** 3
    case 'mediumSlow':
      return Math.max(0, Math.floor((6 * n ** 3) / 5 - 15 * n ** 2 + 100 * n - 140))
    case 'slow':
      return Math.floor((5 * n ** 3) / 4)
  }
}

/** The level a total of experience reaches. */
export function levelForXp(growth: Growth, xp: number): number {
  let lv = 1
  while (lv < MAX_LEVEL && xpForLevel(growth, lv + 1) <= xp) lv++
  return lv
}

/** Experience for defeating a critter, before it is shared out. */
export function xpYield(baseExp: number, foeLevel: number, trainer: boolean): number {
  const x = Math.floor((baseExp * foeLevel) / 7)
  return trainer ? Math.floor(x * 1.5) : x
}

/** Stage multipliers for −6…+6, as fractions (the classic table). */
const STAGE_NUM = [25, 28, 33, 40, 50, 66, 100, 150, 200, 250, 300, 350, 400]

export function stageMultiplier(stage: number): number {
  return STAGE_NUM[Math.max(-6, Math.min(6, stage)) + 6] / 100
}

export function clampStage(n: number): number {
  return Math.max(-6, Math.min(6, n))
}

/** A stat with its stage applied, never below 1 or above 999. */
export function staged(stat: number, stage: number): number {
  return Math.max(1, Math.min(999, Math.floor(stat * stageMultiplier(stage))))
}

export interface DamageInput {
  level: number
  power: number
  attack: number
  defense: number
  /** Same-type attack bonus applies. */
  stab: boolean
  /** Type effectiveness multiplier (0, 0.25 … 4). */
  eff: number
  crit: boolean
  /** The random factor, 217–255. */
  roll: number
}

/** The damage formula. Returns 0 only when the type has no effect. */
export function damage(d: DamageInput): number {
  if (d.eff === 0) return 0
  const level = d.crit ? d.level * 2 : d.level
  let a = Math.max(1, d.attack)
  let df = Math.max(1, d.defense)
  // Big stats are scaled down together so the arithmetic stays small, as on the handheld.
  if (a > 255 || df > 255) {
    a = Math.max(1, Math.floor(a / 4))
    df = Math.max(1, Math.floor(df / 4))
  }
  let dmg = Math.floor(Math.floor((Math.floor((2 * level) / 5 + 2) * d.power * a) / df) / 50)
  dmg = Math.min(997, dmg) + 2
  if (d.stab) dmg = Math.floor(dmg * 1.5)
  dmg = Math.floor(dmg * d.eff)
  if (dmg > 1) dmg = Math.floor((dmg * d.roll) / 255)
  return Math.max(1, dmg)
}

/**
 * Chance of a critical hit: half the base SPEED in 256, eight times that for
 * moves that aim for weak spots, four times with FOCUS. Capped at 255/256.
 */
export function critChance(baseSpeed: number, highCrit: boolean, focused: boolean): number {
  let t = Math.floor(baseSpeed / 2)
  if (focused) t *= 4
  if (highCrit) t *= 8
  return Math.min(255, t) / 256
}

/** Chance a move with `acc`% accuracy lands, given the user's accuracy stage and the target's evasion stage. */
export function hitChance(acc: number, accStage: number, evaStage: number): number {
  if (acc <= 0) return 1
  return Math.min(1, (acc / 100) * (stageMultiplier(accStage) / stageMultiplier(evaStage)))
}

/** Hits for a 2–5 multi-hit move: 2 and 3 three times in eight each, 4 and 5 once in eight each. */
export function multiHitCount(rng: Rng): number {
  const r = rng.int(0, 7)
  return r < 3 ? 2 : r < 6 ? 3 : r === 6 ? 4 : 5
}

export interface CatchResult {
  /** Shakes to show before it either breaks free or clicks shut (0–3). */
  shakes: number
  caught: boolean
}

/**
 * Throwing a capsule. The weaker the critter (and the better the capsule,
 * and if it's asleep, frozen or otherwise afflicted) the likelier each of
 * four checks passes; it shakes once per pass and is caught if all four do.
 * A rate of 0 is a capsule that never fails.
 */
export function rollCatch(maxHp: number, hp: number, catchRate: number, capsuleRate: number, status: StatusId | null, rng: Rng): CatchResult {
  if (capsuleRate === 0) return { shakes: 3, caught: true }
  const bonus = status === 'slp' || status === 'frz' ? 2 : status ? 1.5 : 1
  const a = Math.floor((((3 * maxHp - 2 * Math.max(1, hp)) * catchRate * capsuleRate) / (3 * maxHp)) * bonus)
  if (a >= 255) return { shakes: 3, caught: true }
  const b = Math.floor(65536 / Math.pow(255 / Math.max(1, a), 0.25))
  let passes = 0
  while (passes < 4 && rng.int(0, 65535) < b) passes++
  return { shakes: Math.min(3, passes), caught: passes === 4 }
}

/** The chance of getting away from a wild battle on attempt `tries` (1, 2, …). */
export function runChance(playerSpeed: number, foeSpeed: number, tries: number): number {
  if (playerSpeed >= foeSpeed) return 1
  const f = Math.floor((playerSpeed * 128) / Math.max(1, foeSpeed)) + 30 * (tries - 1)
  return f > 255 ? 1 : f / 256
}
