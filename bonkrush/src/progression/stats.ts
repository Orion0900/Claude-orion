import type { StatBlock, StatId, StatMod } from '../game/types'

/** Where every stat starts before the character, tomes, items and shrines. */
export const BASE_STATS: StatBlock = {
  maxHp: 100,
  regen: 0,
  overheal: 0,
  shield: 0,
  armor: 0,
  evasion: 0,
  lifesteal: 0,
  thorns: 0,
  damage: 1,
  critChance: 0.05,
  critDamage: 2,
  attackSpeed: 1,
  projectiles: 0,
  bounces: 0,
  size: 1,
  projectileSpeed: 1,
  duration: 1,
  eliteDamage: 1,
  knockback: 1,
  moveSpeed: 1,
  extraJumps: 0,
  jumpHeight: 1,
  luck: 0,
  difficulty: 0,
  pickupRange: 1,
  xpGain: 1,
  goldGain: 1,
  silverGain: 1,
}

export const STAT_IDS = Object.keys(BASE_STATS) as StatId[]

/** Hard limits so no build can break the game's maths. */
const CAPS: Partial<Record<StatId, [number, number]>> = {
  maxHp: [1, 100000],
  armor: [0, 0.8],
  evasion: [0, 0.75],
  lifesteal: [0, 1],
  attackSpeed: [0.2, 10],
  size: [0.3, 6],
  moveSpeed: [0.3, 4],
  projectiles: [0, 30],
  bounces: [0, 30],
  extraJumps: [0, 5],
  pickupRange: [0.2, 20],
  critChance: [0, 5],
  damage: [0.05, 1000],
}

/** Counts that must be whole numbers (fractional stacks round down). */
const INTEGER_STATS: ReadonlySet<StatId> = new Set(['projectiles', 'bounces', 'extraJumps'])

/**
 * Final stats from a list of mods: (base + Σ add) × Π mul, then capped.
 * Order of mods never matters.
 */
export function computeStats(mods: Iterable<StatMod>, base: StatBlock = BASE_STATS): StatBlock {
  const add = {} as Record<StatId, number>
  const mul = {} as Record<StatId, number>
  for (const id of STAT_IDS) {
    add[id] = 0
    mul[id] = 1
  }
  for (const mod of mods) {
    if (mod.op === 'add') add[mod.stat] += mod.value
    else mul[mod.stat] *= mod.value
  }
  const out = {} as StatBlock
  for (const id of STAT_IDS) {
    let v = (base[id] + add[id]) * mul[id]
    const cap = CAPS[id]
    if (cap) v = Math.min(cap[1], Math.max(cap[0], v))
    if (INTEGER_STATS.has(id)) v = Math.floor(v + 1e-9)
    out[id] = v
  }
  return out
}

/** A mod scaled by a rarity multiplier (integer stats round, but never to zero). */
export function scaleMod(mod: StatMod, mult: number): StatMod {
  if (mod.op === 'mul') return { ...mod, value: 1 + (mod.value - 1) * mult }
  let value = mod.value * mult
  if (INTEGER_STATS.has(mod.stat)) value = Math.max(1, Math.round(value)) * Math.sign(mod.value || 1)
  return { ...mod, value }
}

/** How a stat reads on cards and the stats panel. */
export const STAT_INFO: Record<StatId, { label: string; format: 'flat' | 'pct' | 'mult' | 'int' | 'perSec' }> = {
  maxHp: { label: 'Max HP', format: 'flat' },
  regen: { label: 'HP Regen', format: 'perSec' },
  overheal: { label: 'Overheal', format: 'pct' },
  shield: { label: 'Shield', format: 'flat' },
  armor: { label: 'Armor', format: 'pct' },
  evasion: { label: 'Evasion', format: 'pct' },
  lifesteal: { label: 'Lifesteal', format: 'pct' },
  thorns: { label: 'Thorns', format: 'flat' },
  damage: { label: 'Damage', format: 'mult' },
  critChance: { label: 'Crit Chance', format: 'pct' },
  critDamage: { label: 'Crit Damage', format: 'mult' },
  attackSpeed: { label: 'Attack Speed', format: 'mult' },
  projectiles: { label: 'Projectiles', format: 'int' },
  bounces: { label: 'Bounces', format: 'int' },
  size: { label: 'Size', format: 'mult' },
  projectileSpeed: { label: 'Projectile Speed', format: 'mult' },
  duration: { label: 'Duration', format: 'mult' },
  eliteDamage: { label: 'Elite Damage', format: 'mult' },
  knockback: { label: 'Knockback', format: 'mult' },
  moveSpeed: { label: 'Move Speed', format: 'mult' },
  extraJumps: { label: 'Extra Jumps', format: 'int' },
  jumpHeight: { label: 'Jump Height', format: 'mult' },
  luck: { label: 'Luck', format: 'pct' },
  difficulty: { label: 'Difficulty', format: 'pct' },
  pickupRange: { label: 'Pickup Range', format: 'mult' },
  xpGain: { label: 'XP Gain', format: 'mult' },
  goldGain: { label: 'Gold Gain', format: 'mult' },
  silverGain: { label: 'Silver Gain', format: 'mult' },
}

/** "+12% Damage", "+1 Projectiles", "+0.8 HP Regen/s". */
export function describeMod(mod: StatMod): string {
  const info = STAT_INFO[mod.stat]
  if (mod.op === 'mul') {
    const pct = Math.round((mod.value - 1) * 100)
    return `${pct >= 0 ? '+' : ''}${pct}% ${info.label}`
  }
  const sign = mod.value >= 0 ? '+' : '-'
  const v = Math.abs(mod.value)
  switch (info.format) {
    case 'pct':
    case 'mult':
      return `${sign}${round(v * 100)}% ${info.label}`
    case 'int':
      return `${sign}${Math.round(v)} ${info.label}`
    case 'perSec':
      return `${sign}${round(v)} ${info.label}/s`
    default:
      return `${sign}${round(v)} ${info.label}`
  }
}

/** A stat's value as it reads in the stats panel. */
export function formatStat(id: StatId, value: number): string {
  switch (STAT_INFO[id].format) {
    case 'pct':
      return `${round(value * 100)}%`
    case 'mult':
      return `${round(value * 100)}%`
    case 'int':
      return `${Math.round(value)}`
    case 'perSec':
      return `${round(value)}/s`
    default:
      return `${round(value)}`
  }
}

function round(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(v < 10 ? 1 : 0).replace(/\.0$/, '')
}
