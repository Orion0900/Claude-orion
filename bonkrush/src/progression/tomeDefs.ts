import type { Rng } from '../core/rng'
import type { StatId, StatMod, TomeDef } from '../game/types'

const add = (stat: StatId, value: number): StatMod => ({ stat, op: 'add', value })

/** Tomes cap at 99 levels; a few cap much earlier. */
export const TOME_MAX_LEVEL = 99
const LEVEL_CAPS: Readonly<Record<string, number>> = { quantity: 10 }

export function tomeMaxLevel(id: string): number {
  return LEVEL_CAPS[id] ?? TOME_MAX_LEVEL
}

/** Its levels roll a random step instead of a fixed `perLevel`. */
export const CHAOS_TOME = 'chaos'

/** Each tome grants `perLevel` once per level at common rarity; rarity multiplies the step. */
export const TOMES: readonly TomeDef[] = [
  { id: 'damage', name: 'Tome of Might', icon: '💪', description: 'Hit harder with everything.', perLevel: [add('damage', 0.08)] },
  { id: 'cooldown', name: 'Tome of Haste', icon: '⏱️', description: 'Weapons fire more often.', perLevel: [add('attackSpeed', 0.075)] },
  { id: 'precision', name: 'Tome of Precision', icon: '🎯', description: 'More critical hits.', perLevel: [add('critChance', 0.07)] },
  { id: 'size', name: 'Tome of Girth', icon: '🔶', description: 'Bigger swings, blasts and projectiles.', perLevel: [add('size', 0.1)] },
  { id: 'velocity', name: 'Tome of Velocity', icon: '💨', description: 'Projectiles fly faster.', perLevel: [add('projectileSpeed', 0.15)] },
  { id: 'knockback', name: 'Tome of Shove', icon: '🥊', description: 'Hits push enemies further.', perLevel: [add('knockback', 0.2)] },
  { id: 'agility', name: 'Tome of Agility', icon: '👟', description: 'Run faster.', perLevel: [add('moveSpeed', 0.08)] },
  { id: 'vitality', name: 'Tome of Vitality', icon: '❤️', description: 'More maximum HP.', perLevel: [add('maxHp', 25)] },
  { id: 'regen', name: 'Tome of Mending', icon: '💚', description: 'Regenerate HP over time.', perLevel: [add('regen', 0.7)] },
  { id: 'shield', name: 'Tome of Warding', icon: '🛡️', description: 'A shield that recharges when you stop getting hit.', perLevel: [add('shield', 25)] },
  { id: 'evasion', name: 'Tome of Evasion', icon: '🌀', description: 'A chance to dodge hits entirely.', perLevel: [add('evasion', 0.07)] },
  { id: 'armor', name: 'Tome of Iron', icon: '🪖', description: 'Take less damage from every hit.', perLevel: [add('armor', 0.08)] },
  { id: 'golden', name: 'Tome of Greed', icon: '💰', description: 'Collect more gold.', perLevel: [add('goldGain', 0.15)] },
  { id: 'silver', name: 'Tome of Silver', icon: '🥈', description: 'Earn more silver at the end of the run.', perLevel: [add('silverGain', 0.12)] },
  { id: 'attraction', name: 'Tome of Attraction', icon: '🧲', description: 'Pick things up from further away.', perLevel: [add('pickupRange', 0.25)] },
  { id: 'bloody', name: 'Tome of Blood', icon: '🩸', description: 'A chance to heal on every hit.', perLevel: [add('lifesteal', 0.06)] },
  { id: 'duration', name: 'Tome of Lingering', icon: '⏳', description: 'Effects and projectiles last longer.', perLevel: [add('duration', 0.15)] },
  { id: 'luck', name: 'Tome of Fortune', icon: '🍀', description: 'Rarer upgrades, items and procs.', perLevel: [add('luck', 0.07)] },
  { id: 'quantity', name: 'Tome of Plenty', icon: '➕', description: 'One more projectile for every weapon (max level 10).', perLevel: [add('projectiles', 1)] },
  { id: 'thorns', name: 'Tome of Thorns', icon: '🌵', description: 'Enemies that touch you get hurt.', perLevel: [add('thorns', 12)] },
  { id: 'xp', name: 'Tome of Wisdom', icon: '📘', description: 'Gain more XP.', perLevel: [add('xpGain', 0.09)] },
  {
    id: 'cursed',
    name: 'Cursed Tome',
    icon: '💀',
    description: 'More, tougher enemies — and more XP and gold for killing them.',
    perLevel: [add('difficulty', 0.08), add('xpGain', 0.04), add('goldGain', 0.04)],
  },
  { id: CHAOS_TOME, name: 'Tome of Chaos', icon: '🎲', description: 'Each level grants a random stat.', perLevel: [] },
]

export const TOME_BY_ID: ReadonlyMap<string, TomeDef> = new Map(TOMES.map((t) => [t.id, t]))

/**
 * What Chaos can roll: every other tome's step, minus the ones that would
 * hurt (difficulty) or dodge a level cap (projectiles).
 */
export const CHAOS_POOL: readonly StatMod[] = TOMES.filter((t) => t.id !== CHAOS_TOME)
  .flatMap((t) => t.perLevel)
  .filter((m) => m.stat !== 'difficulty' && m.stat !== 'projectiles')

/** One random common-rarity stat step for a Chaos level (a copy, safe to scale). */
export function rollChaosMod(rng: Rng): StatMod {
  return { ...rng.pick(CHAOS_POOL) }
}
