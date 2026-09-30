/**
 * The numbers from docs/DESIGN.md ("Stats and formulas"), as small pure
 * functions so the engine, the menus and the tests all share one copy.
 */
import type { Rng } from '../core/rng'
import type { Growth } from '../data/species'
import type { StatusId } from './types'

export const MAX_LEVEL = 100
export const STAGE_LIMIT = 6

/** HP = ⌊(2·base + IV)·L/100⌋ + L + 10. */
export function hpStat(base: number, iv: number, level: number): number {
  return Math.floor(((2 * base + iv) * level) / 100) + level + 10
}

/** Other stats = ⌊(2·base + IV)·L/100⌋ + 5. */
export function otherStat(base: number, iv: number, level: number): number {
  return Math.floor(((2 * base + iv) * level) / 100) + 5
}

/** Battle stat stages, −6…+6: (2+s)/2 raised, 2/(2−s) lowered. */
export function stageMultiplier(stage: number): number {
  const s = clampStage(stage)
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s)
}

/** Accuracy and evasion stages use thirds: (3+s)/3 and 3/(3−s). */
export function accuracyMultiplier(stage: number): number {
  const s = clampStage(stage)
  return s >= 0 ? (3 + s) / 3 : 3 / (3 - s)
}

export function clampStage(stage: number): number {
  return Math.max(-STAGE_LIMIT, Math.min(STAGE_LIMIT, stage))
}

/**
 * Chance (0–1) that a move of `accuracy` hits: the user's accuracy stage
 * minus the target's evasion stage, in thirds. Accuracy 0 never misses.
 */
export function hitChance(accuracy: number, accStage: number, evaStage: number): number {
  if (accuracy <= 0) return 1
  return Math.min(1, (accuracy / 100) * accuracyMultiplier(accStage - evaStage))
}

/** ⌊⌊⌊2L/5 + 2⌋ · power · A / D⌋ / 50⌋ + 2. */
export function baseDamage(level: number, power: number, atk: number, def: number): number {
  const lv = Math.floor((2 * level) / 5 + 2)
  return Math.floor(Math.floor((lv * power * atk) / Math.max(1, def)) / 50) + 2
}

export interface DamageInput {
  level: number
  power: number
  /** Attacking stat after stages. */
  atk: number
  /** Defending stat after stages. */
  def: number
  stab: boolean
  eff: number
  crit: boolean
  /** Burned attacker using a physical move. */
  burned: boolean
  /** The random factor as a percentage, 85–100. */
  roll: number
}

/**
 * Full damage: base, then × 1.5 STAB, × effectiveness, × 2 critical,
 * × roll/100, then × 0.5 for a burned physical attacker, flooring after each
 * step. At least 1 unless the type has no effect.
 */
export function damage(d: DamageInput): number {
  if (d.eff === 0) return 0
  let n = baseDamage(d.level, d.power, d.atk, d.def)
  if (d.stab) n = Math.floor(n * 1.5)
  n = Math.floor(n * d.eff)
  if (d.crit) n *= 2
  n = Math.floor((n * d.roll) / 100)
  if (d.burned) n = Math.floor(n / 2)
  return Math.max(1, n)
}

/** Smallest and largest damage over the random roll. */
export function damageRange(d: Omit<DamageInput, 'roll'>): [number, number] {
  return [damage({ ...d, roll: 85 }), damage({ ...d, roll: 100 })]
}

/** A critical hit ignores the attacker's lowered stage and the defender's raised one: [attack, defense] stages to use. */
export function critStages(atkStage: number, defStage: number): [number, number] {
  return [Math.max(0, atkStage), Math.min(0, defStage)]
}

/** 1/16, or 1/8 for high-crit moves. */
export function critChance(highCrit: boolean): number {
  return highCrit ? 1 / 8 : 1 / 16
}

const GROWTH_FACTOR: Record<Growth, number> = { fast: 0.8, medium: 1, slow: 1.25 }

/** Total experience needed to reach `level`: fast 0.8·n³, medium n³, slow 1.25·n³. Level 1 is 0. */
export function xpForLevel(growth: Growth, level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  if (n <= 1) return 0
  return Math.floor(GROWTH_FACTOR[growth] * n * n * n)
}

/** The level a beast with `xp` total experience is at (1–100). */
export function levelForXp(growth: Growth, xp: number): number {
  let lv = 1
  while (lv < MAX_LEVEL && xpForLevel(growth, lv + 1) <= xp) lv++
  return lv
}

/** Experience for defeating a beast: ⌊yield·level/7⌋, × 1.5 in trainer battles (before splitting). */
export function xpYield(baseYield: number, foeLevel: number, trainer: boolean): number {
  const n = Math.floor((baseYield * foeLevel) / 7)
  return trainer ? Math.floor(n * 1.5) : n
}

/** Each participant's share of `total`; at least 1. */
export function xpShare(total: number, participants: number): number {
  if (participants <= 0) return 0
  return Math.max(1, Math.floor(total / participants))
}

/** 2 for sleep or freeze, 1.5 for paralysis, poison or burn, else 1. */
export function statusCatchBonus(status: StatusId | null): number {
  if (status === 'slp' || status === 'frz') return 2
  if (status) return 1.5
  return 1
}

/**
 * The catch value a = ⌊(3·maxHP − 2·HP)·rate·orb / (3·maxHP)⌋ × status bonus.
 * a ≥ 255 is a sure catch.
 */
export function catchValue(maxHp: number, hp: number, rate: number, orb: number, status: StatusId | null): number {
  const m = Math.max(1, maxHp)
  const h = Math.max(0, Math.min(m, hp))
  const a = Math.floor(((3 * m - 2 * h) * rate * orb) / (3 * m))
  return Math.floor(a * statusCatchBonus(status))
}

/** The shake threshold b = ⌊1048560 / √√(16711680 / a)⌋. */
export function shakeThreshold(a: number): number {
  if (a <= 0) return 0
  if (a >= 255) return 65536
  return Math.floor(1048560 / Math.sqrt(Math.sqrt(16711680 / a)))
}

/**
 * Throws the orb: four shake checks, each passing when a random 0–65535 is
 * below b. Shakes shown are the checks passed, up to three; all four catch.
 */
export function rollCatch(a: number, rng: Rng): { shakes: number; caught: boolean } {
  if (a >= 255) return { shakes: 3, caught: true }
  const b = shakeThreshold(a)
  let passed = 0
  while (passed < 4 && rng.int(0, 65535) < b) passed++
  return { shakes: Math.min(3, passed), caught: passed === 4 }
}

/** Probability (0–1) that one orb with catch value `a` catches. */
export function catchProbability(a: number): number {
  if (a >= 255) return 1
  const p = Math.min(1, shakeThreshold(a) / 65536)
  return p ** 4
}

/**
 * Chance (0–1) of running: sure when your speed is at least the foe's,
 * otherwise (⌊speed·128/foeSpeed⌋ + 30·attempts) / 256, counting this attempt.
 */
export function runChance(speed: number, foeSpeed: number, attempts: number): number {
  if (speed >= foeSpeed) return 1
  const f = Math.floor((speed * 128) / Math.max(1, foeSpeed)) + 30 * attempts
  return Math.min(1, f / 256)
}

/** Number of hits for a multi-hit move: 2–5 uses 3/8, 3/8, 1/8, 1/8; otherwise uniform. */
export function multiHitCount(min: number, max: number, rng: Rng): number {
  if (max <= min) return min
  if (min === 2 && max === 5) {
    const r = rng.int(0, 7)
    return r < 3 ? 2 : r < 6 ? 3 : r < 7 ? 4 : 5
  }
  return rng.int(min, max)
}
