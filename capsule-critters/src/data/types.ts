/**
 * The fifteen critter types and how they match up. Every move has a type,
 * and every critter one or two. The chart below is the game's own: elements
 * behave the way you'd guess (water douses fire, fire burns plants), and a
 * few matchups are pure Capsule Critters.
 *
 * As in the handheld games this is modelled on, a move's type also decides
 * which stats it uses: the SPECIAL types attack with SPC against SPC, the
 * rest with ATK against DEF.
 */
import type { PalId } from '../engine/palettes'

export const TYPES = [
  'NORMAL',
  'FIRE',
  'WATER',
  'PLANT',
  'SPARK',
  'FROST',
  'BRAWL',
  'VENOM',
  'EARTH',
  'SKY',
  'MIND',
  'BUG',
  'STONE',
  'SPOOK',
  'DRAKE',
] as const

export type TypeId = (typeof TYPES)[number]

/** Types whose moves use the SPECIAL stat. */
export const SPECIAL_TYPES: ReadonlySet<TypeId> = new Set<TypeId>(['FIRE', 'WATER', 'PLANT', 'SPARK', 'FROST', 'MIND', 'DRAKE'])

export function isSpecial(t: TypeId): boolean {
  return SPECIAL_TYPES.has(t)
}

/** Attacking type → defending type → multiplier, listing only what isn't 1. */
const CHART: Readonly<Record<TypeId, Partial<Record<TypeId, number>>>> = {
  NORMAL: { STONE: 0.5, SPOOK: 0 },
  FIRE: { PLANT: 2, FROST: 2, BUG: 2, FIRE: 0.5, WATER: 0.5, STONE: 0.5, DRAKE: 0.5 },
  WATER: { FIRE: 2, EARTH: 2, STONE: 2, WATER: 0.5, PLANT: 0.5, DRAKE: 0.5 },
  PLANT: { WATER: 2, EARTH: 2, STONE: 2, FIRE: 0.5, PLANT: 0.5, VENOM: 0.5, SKY: 0.5, BUG: 0.5, DRAKE: 0.5 },
  SPARK: { WATER: 2, SKY: 2, SPARK: 0.5, PLANT: 0.5, DRAKE: 0.5, EARTH: 0 },
  FROST: { PLANT: 2, EARTH: 2, SKY: 2, DRAKE: 2, FIRE: 0.5, WATER: 0.5, FROST: 0.5 },
  BRAWL: { NORMAL: 2, FROST: 2, STONE: 2, VENOM: 0.5, SKY: 0.5, MIND: 0.5, BUG: 0.5, SPOOK: 0 },
  VENOM: { PLANT: 2, BUG: 2, VENOM: 0.5, EARTH: 0.5, STONE: 0.5, SPOOK: 0.5 },
  EARTH: { FIRE: 2, SPARK: 2, VENOM: 2, STONE: 2, PLANT: 0.5, BUG: 0.5, SKY: 0 },
  SKY: { PLANT: 2, BRAWL: 2, BUG: 2, SPARK: 0.5, STONE: 0.5 },
  MIND: { BRAWL: 2, VENOM: 2, MIND: 0.5 },
  BUG: { PLANT: 2, MIND: 2, FIRE: 0.5, BRAWL: 0.5, SKY: 0.5, SPOOK: 0.5, VENOM: 0.5 },
  STONE: { FIRE: 2, FROST: 2, SKY: 2, BUG: 2, BRAWL: 0.5, EARTH: 0.5 },
  SPOOK: { MIND: 2, SPOOK: 2, NORMAL: 0 },
  DRAKE: { DRAKE: 2 },
}

/** Multiplier for one attacking type against one defending type. */
export function matchup(attack: TypeId, defend: TypeId): number {
  return CHART[attack][defend] ?? 1
}

/** Multiplier against a critter's one or two types. */
export function effectiveness(attack: TypeId, defend: readonly TypeId[]): number {
  let m = 1
  for (const d of defend) m *= matchup(attack, d)
  return m
}

/** A short label for menus. */
export const TYPE_NAME: Readonly<Record<TypeId, string>> = {
  NORMAL: 'NORMAL',
  FIRE: 'FIRE',
  WATER: 'WATER',
  PLANT: 'PLANT',
  SPARK: 'SPARK',
  FROST: 'FROST',
  BRAWL: 'BRAWL',
  VENOM: 'VENOM',
  EARTH: 'EARTH',
  SKY: 'SKY',
  MIND: 'MIND',
  BUG: 'BUG',
  STONE: 'STONE',
  SPOOK: 'SPOOK',
  DRAKE: 'DRAKE',
}

/** The colour a type's moves flash in battle and its label wears in COLOR mode. */
export const TYPE_PAL: Readonly<Record<TypeId, PalId>> = {
  NORMAL: 'gray',
  FIRE: 'red',
  WATER: 'blue',
  PLANT: 'green',
  SPARK: 'yellow',
  FROST: 'ice',
  BRAWL: 'orange',
  VENOM: 'purple',
  EARTH: 'brown',
  SKY: 'teal',
  MIND: 'pink',
  BUG: 'green',
  STONE: 'brown',
  SPOOK: 'night',
  DRAKE: 'purple',
}
