import type { Rng } from '../core/rng'
import type { Rarity } from '../game/types'

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

/** How much a roll of each rarity is worth compared to a common one. */
export const RARITY_MULT: Record<Rarity, number> = {
  common: 1,
  uncommon: 1.2,
  rare: 1.4,
  epic: 1.6,
  legendary: 2,
}

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#7ddc6a',
  uncommon: '#4aa8ff',
  rare: '#c86bff',
  epic: '#ff4d5e',
  legendary: '#ffd23f',
}

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

/** Level-up / shrine upgrade weights at zero luck. */
const UPGRADE_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1.2,
}

/** Chest item weights at zero luck (items skip uncommon, like the original). */
const ITEM_WEIGHTS: Record<Rarity, number> = {
  common: 70,
  uncommon: 0,
  rare: 15,
  epic: 6,
  legendary: 1.5,
}

/**
 * Luck squeezes the common weight hardest and never lowers legendary. At
 * luck 1 (100%) legendary odds roughly triple, which matches the feel of the
 * original: luck helps, but a legendary is still a moment.
 */
export function rarityWeights(base: Record<Rarity, number>, luck: number): Record<Rarity, number> {
  const l = Math.max(0, luck)
  return {
    common: base.common / (1 + l * 1.5),
    uncommon: base.uncommon * (1 + l * 0.4),
    rare: base.rare * (1 + l * 0.8),
    epic: base.epic * (1 + l * 1.3),
    legendary: base.legendary * (1 + l * 2),
  }
}

export function rollRarity(rng: Rng, luck: number, table: 'upgrade' | 'item' = 'upgrade'): Rarity {
  const weights = rarityWeights(table === 'item' ? ITEM_WEIGHTS : UPGRADE_WEIGHTS, luck)
  return rng.weighted(RARITIES, (r) => weights[r])
}

/** Odds of each rarity for display and tests. */
export function rarityOdds(luck: number, table: 'upgrade' | 'item' = 'upgrade'): Record<Rarity, number> {
  const weights = rarityWeights(table === 'item' ? ITEM_WEIGHTS : UPGRADE_WEIGHTS, luck)
  const total = RARITIES.reduce((sum, r) => sum + weights[r], 0)
  return Object.fromEntries(RARITIES.map((r) => [r, weights[r] / total])) as Record<Rarity, number>
}
