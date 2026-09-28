/**
 * What a dead enemy leaves behind (design doc: Economy). Pure: the manager
 * turns the roll into pickups and chests.
 */
import type { Rng } from '../core/rng'
import type { EnemyDef } from '../game/types'
import type { EnemyTier } from './enemyDefs'

export const ELITE_XP_MULT = 10
export const ELITE_GOLD_MIN = 8
export const ELITE_GOLD_MAX = 15
export const ELITE_CHEST_CHANCE = 0.1
export const MAGNET_CHANCE = 0.004
export const BOMB_CHANCE = 0.003
export const HEALTH_CHANCE = 0.01
/** What the drops are worth when picked up. */
export const HEALTH_VALUE = 25
export const BOMB_DAMAGE = 200
/** Every kill's XP on stages 1, 2 and 3; later stages' XP curve is steeper. */
export const STAGE_XP: readonly number[] = [1, 1.3, 2.0]

/** XP multiplier for a 0-based stage index; past the table it keeps the last value. */
export function stageXpMultiplier(stageIndex: number): number {
  const i = Math.max(0, Math.min(STAGE_XP.length - 1, Math.floor(stageIndex || 0)))
  return STAGE_XP[i]
}

/** Difficulty pays for itself: XP and gold per kill × (1 + 0.5 × difficulty); never below ×1. */
export function difficultyRewardMultiplier(difficulty: number): number {
  return 1 + 0.5 * Math.max(0, difficulty || 0)
}

export interface Drops {
  xp: number
  gold: number
  health: boolean
  magnet: boolean
  bomb: boolean
  /** A free chest (minibosses always, elites sometimes; the boss chest is the interactables' job). */
  chest: boolean
}

export function emptyDrops(): Drops {
  return { xp: 0, gold: 0, health: false, magnet: false, bomb: false, chest: false }
}

/**
 * `difficulty` is the difficulty stat (greed and curse included) and
 * `stageIndex` the 0-based stage; both only scale the amounts, never the rolls.
 */
export function rollDrops(
  rng: Rng, def: EnemyDef, tier: EnemyTier, elite: boolean, out: Drops, difficulty = 0, stageIndex = 0,
): Drops {
  const reward = difficultyRewardMultiplier(difficulty)
  out.xp = def.xp * (elite ? ELITE_XP_MULT : 1) * stageXpMultiplier(stageIndex) * reward
  out.gold = 0
  out.health = out.magnet = out.bomb = out.chest = false

  if (elite && tier === 'normal') out.gold = rng.int(ELITE_GOLD_MIN, ELITE_GOLD_MAX)
  else if (def.gold.chance > 0 && rng.chance(def.gold.chance)) out.gold = rng.int(def.gold.min, Math.max(def.gold.min, def.gold.max))
  out.gold *= reward

  if (tier === 'normal') {
    out.magnet = rng.chance(MAGNET_CHANCE)
    out.bomb = rng.chance(BOMB_CHANCE)
    out.health = rng.chance(HEALTH_CHANCE)
    out.chest = elite && rng.chance(ELITE_CHEST_CHANCE)
  } else if (tier === 'miniboss') {
    out.chest = true
  }
  return out
}

/**
 * How many pickups a big reward is split into so it sprays out satisfyingly:
 * one per `pieceSize`, at most `maxPieces`, at least one.
 */
export function pieceCount(total: number, pieceSize: number, maxPieces: number): number {
  if (!(total > 0)) return 0
  return Math.max(1, Math.min(maxPieces, Math.ceil(total / Math.max(1e-6, pieceSize))))
}
