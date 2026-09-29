import type { StatBlock, WeaponStatKey, WeaponStats } from '../game/types'

/** Fastest any weapon may fire, however high attack speed goes. */
export const MIN_COOLDOWN = 0.05
/** Cooldown upgrades stop here; attack speed can still push past it. */
export const MIN_UPGRADED_COOLDOWN = 0.1

export const WEAPON_STAT_KEYS: readonly WeaponStatKey[] = [
  'damage',
  'cooldown',
  'count',
  'size',
  'speed',
  'duration',
  'pierce',
  'bounces',
  'range',
  'knockback',
  'critChance',
]

/** Swings and orbits: a bigger body reaches a little further. */
const REACH_GROWS_WITH_SIZE: ReadonlySet<string> = new Set(['sword', 'katana', 'chunkers', 'mines', 'frostwalker'])
/** There is only ever one aura, however many projectiles the player stacks. */
const SINGLE_INSTANCE: ReadonlySet<string> = new Set(['aura'])

export function blankStats(): WeaponStats {
  return {
    damage: 0,
    cooldown: 0,
    count: 0,
    size: 0,
    speed: 0,
    duration: 0,
    pierce: 0,
    bounces: 0,
    range: 0,
    knockback: 0,
    critChance: 0,
  }
}

/**
 * A weapon's numbers after the player's stats. Writes into `out` so the
 * manager can refresh every weapon every frame without allocating.
 */
export function effectiveStats(
  base: Readonly<WeaponStats>,
  stats: Readonly<StatBlock>,
  behavior: string,
  out: WeaponStats = blankStats(),
): WeaponStats {
  const attackSpeed = stats.attackSpeed > 0 ? stats.attackSpeed : 1
  const size = stats.size > 0 ? stats.size : 1
  out.damage = base.damage * stats.damage
  out.cooldown = Math.max(MIN_COOLDOWN, base.cooldown / attackSpeed)
  out.count = SINGLE_INSTANCE.has(behavior) ? 1 : Math.max(1, Math.round(base.count + stats.projectiles))
  out.size = base.size * size
  out.speed = base.speed * stats.projectileSpeed
  out.duration = base.duration * stats.duration
  out.pierce = base.pierce
  out.bounces = Math.max(0, Math.round(base.bounces + stats.bounces))
  out.range = REACH_GROWS_WITH_SIZE.has(behavior) ? base.range * Math.sqrt(size) : base.range
  out.knockback = base.knockback * stats.knockback
  out.critChance = base.critChance + stats.critChance
  return out
}

/**
 * How many times a hit crits, from one uniform roll in [0, 1). A chance over
 * 100% "overcrits": 1.4 is one guaranteed crit plus a 40% chance of stacking
 * a second, and so on for every whole 100%.
 */
export function critTiers(chance: number, roll: number): number {
  if (!(chance > 0)) return 0
  const whole = Math.floor(chance)
  return whole + (roll < chance - whole ? 1 : 0)
}

/** Damage multiplier for `tiers` crits: critDamage, critDamage², … */
export function critMultiplier(tiers: number, critDamage: number): number {
  if (tiers <= 0) return 1
  return Math.pow(Math.max(1, critDamage), tiers)
}

/**
 * Adds an upgrade's changes to a weapon's own stats (mutates and returns
 * `stats`). Counts stay whole and cooldown stops at a sane floor so no
 * stack of upgrades can break the weapon.
 */
export function applyUpgrade(stats: WeaponStats, changes: Partial<WeaponStats>): WeaponStats {
  for (const key of WEAPON_STAT_KEYS) {
    const delta = changes[key]
    if (delta === undefined || !Number.isFinite(delta)) continue
    stats[key] += delta
  }
  stats.cooldown = Math.max(MIN_UPGRADED_COOLDOWN, stats.cooldown)
  stats.count = Math.max(1, Math.round(stats.count))
  stats.bounces = Math.max(0, Math.round(stats.bounces))
  if (Number.isFinite(stats.pierce)) stats.pierce = Math.max(1, Math.round(stats.pierce))
  stats.size = Math.max(0.05, stats.size)
  stats.speed = Math.max(0, stats.speed)
  stats.duration = Math.max(0, stats.duration)
  stats.range = Math.max(0, stats.range)
  return stats
}

const LABEL: Record<WeaponStatKey, string> = {
  damage: 'Damage',
  cooldown: 'Cooldown',
  count: 'Projectiles',
  size: 'Size',
  speed: 'Speed',
  duration: 'Duration',
  pierce: 'Pierce',
  bounces: 'Bounces',
  range: 'Range',
  knockback: 'Knockback',
  critChance: 'Crit Chance',
}

/** "+3 Damage", "-0.08s Cooldown", "+4% Crit Chance" — for upgrade cards. */
export function describeWeaponChange(key: WeaponStatKey, value: number): string {
  const sign = value >= 0 ? '+' : '-'
  const v = Math.abs(value)
  switch (key) {
    case 'critChance':
      return `${sign}${trim(v * 100)}% ${LABEL[key]}`
    case 'cooldown':
    case 'duration':
      return `${sign}${trim(v)}s ${LABEL[key]}`
    case 'count':
    case 'pierce':
    case 'bounces':
      return `${sign}${Math.round(v)} ${LABEL[key]}`
    default:
      return `${sign}${trim(v)} ${LABEL[key]}`
  }
}

function trim(v: number): string {
  return String(Math.round(v * 100) / 100)
}
