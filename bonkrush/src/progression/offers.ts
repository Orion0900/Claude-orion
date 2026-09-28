/**
 * Offer generation for level-ups, charge shrines and chests. Pure: every
 * pool, owned state, luck and rng comes in as a parameter, so the tests can
 * pin exact rolls without a running game.
 */
import type { Rng } from '../core/rng'
import type { ItemDef, Offer, Rarity, StatId, TomeDef, WeaponDef, WeaponStatKey, WeaponStats } from '../game/types'
import { RARITIES, RARITY_MULT, rollRarity } from './rarity'
import { describeMod, scaleMod } from './stats'
import { tomeMaxLevel } from './tomeDefs'

export const WEAPON_MAX_LEVEL = 40
/** Cooldown upgrades stop at this fraction of the weapon's base cooldown. */
export const MIN_COOLDOWN_FRACTION = 0.2
/** Owned weapons and tomes show up this many times more often than new ones. */
export const OWNED_WEIGHT = 2

/** Whole-number weapon stats: they step by +1, or +2 at legendary, whatever the rarity multiplier says. */
const COUNT_KEYS: ReadonlySet<WeaponStatKey> = new Set<WeaponStatKey>(['count', 'bounces', 'pierce'])

/** Shrine boons skip the curse, silver (a meta currency) and level-capped counts. */
const SHRINE_EXCLUDED: ReadonlySet<StatId> = new Set<StatId>(['difficulty', 'silverGain', 'projectiles'])

export interface OwnedWeapon {
  readonly def: WeaponDef
  readonly level: number
  readonly stats: WeaponStats
}

export interface OwnedTome {
  readonly def: TomeDef
  readonly level: number
}

export interface LevelUpInput {
  weaponPool: readonly WeaponDef[]
  tomePool: readonly TomeDef[]
  weapons: readonly OwnedWeapon[]
  maxWeapons: number
  tomes: readonly OwnedTome[]
  maxTomes: number
  /** Keys from `banishKey`. */
  banished: ReadonlySet<string>
  /** Tome ids whose stats are all capped: a level of them would change nothing. */
  maxed?: ReadonlySet<string>
  luck: number
  /** Holding an Anvil: every weapon upgrade raises three stats. */
  anvil: boolean
  /** Player level and max HP, for the gold/heal fallback amounts. */
  level: number
  maxHp: number
}

export type LevelUpCandidate =
  | { type: 'newWeapon' | 'newTome' | 'tomeUpgrade'; id: string; weight: number }
  | { type: 'weaponUpgrade'; id: string; weight: number; weapon: OwnedWeapon }

/** Where a banish is recorded: weapons, tomes and items are separate namespaces. */
export function banishKey(offer: Offer): string | null {
  switch (offer.type) {
    case 'newWeapon':
    case 'weaponUpgrade':
      return `weapon:${offer.id}`
    case 'newTome':
    case 'tomeUpgrade':
      return `tome:${offer.id}`
    case 'item':
      return `item:${offer.id}`
    default:
      return null
  }
}

/** Level-up cards: three, and a fourth once luck reaches 100%. */
export function offerCount(luck: number): number {
  return luck >= 1 ? 4 : 3
}

/** Everything a level-up could offer right now, one entry per target. */
export function levelUpCandidates(input: LevelUpInput): LevelUpCandidate[] {
  const out: LevelUpCandidate[] = []
  const ownedWeapons = new Set(input.weapons.map((w) => w.def.id))
  const ownedTomes = new Set(input.tomes.map((t) => t.def.id))

  if (input.weapons.length < input.maxWeapons) {
    for (const def of input.weaponPool) {
      if (def.locked || ownedWeapons.has(def.id) || input.banished.has(`weapon:${def.id}`)) continue
      ownedWeapons.add(def.id) // a pool listing the same weapon twice still offers it once
      out.push({ type: 'newWeapon', id: def.id, weight: 1 })
    }
  }
  for (const weapon of input.weapons) {
    if (weapon.level >= WEAPON_MAX_LEVEL || input.banished.has(`weapon:${weapon.def.id}`)) continue
    if (upgradableKeys(weapon.def, weapon.stats).length === 0) continue
    out.push({ type: 'weaponUpgrade', id: weapon.def.id, weight: OWNED_WEIGHT, weapon })
  }

  if (input.tomes.length < input.maxTomes) {
    for (const def of input.tomePool) {
      if (def.locked || ownedTomes.has(def.id) || input.banished.has(`tome:${def.id}`) || input.maxed?.has(def.id))
        continue
      ownedTomes.add(def.id)
      out.push({ type: 'newTome', id: def.id, weight: 1 })
    }
  }
  for (const tome of input.tomes) {
    const id = tome.def.id
    if (tome.level >= tomeMaxLevel(id) || input.banished.has(`tome:${id}`) || input.maxed?.has(id)) continue
    out.push({ type: 'tomeUpgrade', id, weight: OWNED_WEIGHT })
  }
  return out
}

/**
 * The level-up cards: weighted picks without repeating a target, each with
 * its own rarity roll. New weapons have no rarity to speak of (they arrive
 * at their base stats), so they always read Common. If nothing at all is
 * left to offer, gold and a heal stand in.
 */
export function rollLevelUpOffers(input: LevelUpInput, rng: Rng): Offer[] {
  const candidates = levelUpCandidates(input)
  const count = offerCount(input.luck)
  const offers: Offer[] = []
  while (offers.length < count && candidates.length > 0) {
    const pick = rng.weighted(candidates, (c) => c.weight)
    candidates.splice(candidates.indexOf(pick), 1)
    switch (pick.type) {
      case 'newWeapon':
        offers.push({ type: 'newWeapon', id: pick.id, rarity: 'common' })
        break
      case 'weaponUpgrade': {
        const rarity = rollRarity(rng, input.luck)
        const changes = rollWeaponUpgrade(pick.weapon.def, pick.weapon.stats, rarity, rng, input.anvil)
        offers.push({ type: 'weaponUpgrade', id: pick.id, rarity, changes })
        break
      }
      case 'newTome':
      case 'tomeUpgrade':
        offers.push({ type: pick.type, id: pick.id, rarity: rollRarity(rng, input.luck) })
        break
    }
  }
  return offers.length > 0 ? offers : fallbackOffers(input.level, input.maxHp, input.luck, rng)
}

/** Gold and a heal, for when every slot is full and everything is maxed or banished. */
export function fallbackOffers(level: number, maxHp: number, luck: number, rng: Rng): Offer[] {
  const goldRarity = rollRarity(rng, luck)
  const healRarity = rollRarity(rng, luck)
  return [
    { type: 'gold', amount: Math.round((10 + 4 * Math.max(1, level)) * RARITY_MULT[goldRarity]), rarity: goldRarity },
    { type: 'heal', amount: Math.max(1, Math.round(Math.max(1, maxHp) * 0.3 * RARITY_MULT[healRarity])), rarity: healRarity },
  ]
}

/** Stats a weapon upgrade can still raise (skips infinite pierce and cooldowns already at the floor). */
export function upgradableKeys(def: WeaponDef, stats: WeaponStats): WeaponStatKey[] {
  const keys: WeaponStatKey[] = []
  for (const key of Object.keys(def.upgrades) as WeaponStatKey[]) {
    const step = def.upgrades[key]
    if (step === undefined || !Number.isFinite(step) || step === 0) continue
    if (COUNT_KEYS.has(key) && !Number.isFinite(stats[key])) continue
    if (key === 'cooldown' && step < 0 && stats.cooldown <= cooldownFloor(def) + 1e-9) continue
    keys.push(key)
  }
  return keys
}

export function cooldownFloor(def: WeaponDef): number {
  return def.base.cooldown * MIN_COOLDOWN_FRACTION
}

/**
 * The stat changes (deltas to add to the weapon's stats) for one upgrade.
 * Common raises 1–2 stats, anything better raises 2, and an Anvil makes it 3.
 */
export function rollWeaponUpgrade(
  def: WeaponDef,
  stats: WeaponStats,
  rarity: Rarity,
  rng: Rng,
  anvil: boolean,
): Partial<WeaponStats> {
  const keys = rng.shuffle(upgradableKeys(def, stats))
  const n = Math.min(keys.length, anvil ? 3 : rarity === 'common' ? rng.int(1, 2) : 2)
  const changes: Partial<WeaponStats> = {}
  for (let i = 0; i < n; i++) changes[keys[i]] = upgradeStep(def, stats, keys[i], rarity)
  return changes
}

/** One stat's delta at `rarity`; cooldown steps never take it under the floor. */
export function upgradeStep(def: WeaponDef, stats: WeaponStats, key: WeaponStatKey, rarity: Rarity): number {
  const step = def.upgrades[key] ?? 0
  if (COUNT_KEYS.has(key)) return (rarity === 'legendary' ? 2 : 1) * Math.sign(step)
  let delta = step * RARITY_MULT[rarity]
  if (key === 'cooldown' && delta < 0) delta = Math.max(delta, Math.min(0, cooldownFloor(def) - stats.cooldown))
  return round4(delta)
}

export interface ShrineInput {
  tomePool: readonly TomeDef[]
  banished: ReadonlySet<string>
  /** Tome ids whose stats are all capped; their boons would do nothing. */
  maxed?: ReadonlySet<string>
  luck: number
  count?: number
  /** Golden shrines are always legendary. */
  forceRarity?: Rarity
  /** Chance each boon rolls one rarity higher (Wrench). */
  bumpChance?: number
}

/** Tomes whose step a charge shrine can hand out. */
export function shrinePool(
  tomes: readonly TomeDef[],
  banished: ReadonlySet<string>,
  maxed?: ReadonlySet<string>,
): TomeDef[] {
  return tomes.filter(
    (t) =>
      !t.locked &&
      t.perLevel.length > 0 &&
      !banished.has(`tome:${t.id}`) &&
      !maxed?.has(t.id) &&
      t.perLevel.every((m) => !SHRINE_EXCLUDED.has(m.stat)),
  )
}

/** Charge shrine boons: one tome-level of a random stat each, times the rarity multiplier. */
export function rollShrineOffers(input: ShrineInput, rng: Rng): Offer[] {
  const pool = shrinePool(input.tomePool, input.banished, input.maxed)
  const count = input.count ?? 3
  const offers: Offer[] = []
  while (offers.length < count && pool.length > 0) {
    const [tome] = pool.splice(rng.int(0, pool.length - 1), 1)
    let rarity = input.forceRarity ?? rollRarity(rng, input.luck)
    if (!input.forceRarity && (input.bumpChance ?? 0) > 0 && rng.chance(input.bumpChance ?? 0)) rarity = nextRarity(rarity)
    const mods = tome.perLevel.map((m) => {
      const scaled = scaleMod(m, RARITY_MULT[rarity])
      return { ...scaled, value: round4(scaled.value) }
    })
    offers.push({ type: 'stat', rarity, mods, label: mods.map(describeMod).join(', ') })
  }
  return offers
}

export function nextRarity(r: Rarity): Rarity {
  return RARITIES[Math.min(RARITIES.length - 1, RARITIES.indexOf(r) + 1)]
}

export interface ChestInput {
  itemPool: readonly ItemDef[]
  banished: ReadonlySet<string>
  luck: number
}

/**
 * A chest's item: roll a rarity on the item table, then a random item of
 * that rarity. If none exist at that rarity, the nearest rarity that has
 * some (lower first) stands in. Null only if every item is gone.
 */
export function rollChestItem(input: ChestInput, rng: Rng): Offer | null {
  const available = input.itemPool.filter((i) => !i.locked && !input.banished.has(`item:${i.id}`))
  if (available.length === 0) return null
  const rolled = RARITIES.indexOf(rollRarity(rng, input.luck, 'item'))
  for (let d = 0; d < RARITIES.length; d++) {
    for (const idx of d === 0 ? [rolled] : [rolled - d, rolled + d]) {
      if (idx < 0 || idx >= RARITIES.length) continue
      const group = available.filter((i) => i.rarity === RARITIES[idx])
      if (group.length === 0) continue
      const item = rng.pick(group)
      return { type: 'item', id: item.id, rarity: item.rarity }
    }
  }
  return null
}

/** Keeps card numbers tidy (0.42, not 0.41999999999999998). */
function round4(v: number): number {
  return Math.round(v * 1e4) / 1e4
}
