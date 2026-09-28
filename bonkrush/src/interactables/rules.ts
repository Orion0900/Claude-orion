/**
 * Pure rules for chests, pots and shrines: prices, rolls, charge stepping and
 * which thing the Interact prompt points at. Tested in node.
 */
import type { Rng } from '../core/rng'
import type { InteractableKind, Offer } from '../game/types'
import { RARITY_MULT } from '../progression/rarity'
import { scaleMod } from '../progression/stats'

/** How close (XZ metres) the player must be to use a chest, shrine or altar. */
export const REACH = 2.6
/** Radius of a charge shrine's ring. */
export const CHARGE_RADIUS = 3
/** Seconds standing in the ring to fill a charge shrine at normal speed. */
export const CHARGE_TIME = 3
/** Progress lost per second outside the ring: twice the base fill rate. */
export const CHARGE_DRAIN = 2 / CHARGE_TIME
export const GOLDEN_SHRINE_CHANCE = 0.1
export const SILVER_POT_CHANCE = 1 / 12
export const GREED_GOLD = 40
export const GREED_CURSE = 0.08
export const CURSE_CURSE = 0.15

export type ShrineKind = Extract<
  InteractableKind,
  'shrineCharge' | 'shrineGreed' | 'shrineMagnet' | 'shrineChallenge' | 'shrineCurse'
>

/** How many of each shrine a map gets (24 in all). */
export const SHRINE_COUNTS: Readonly<Record<ShrineKind, number>> = {
  shrineCharge: 12,
  shrineGreed: 4,
  shrineMagnet: 3,
  shrineChallenge: 3,
  shrineCurse: 2,
}

/** Gold price of the next paid chest after `paid` paid chests: 25, 34, 43, 53… */
export function chestCost(paid: number): number {
  const n = Math.max(0, Math.floor(paid))
  return Math.round(25 * 1.18 ** n + 4 * n)
}

/** Rusty Key: k / (k + 1) with k = 0.1 per stack, so it never quite reaches certainty. */
export function keyFreeChance(stacks: number): number {
  const k = 0.1 * Math.max(0, stacks || 0)
  return k / (k + 1)
}

/** Wrench: each stack charges shrines 20% faster, compounding. */
export function chargeSpeed(wrenchStacks: number): number {
  return 1.2 ** Math.max(0, wrenchStacks || 0)
}

/** One step of a charge shrine's 0..1 progress: fills inside the ring, drains outside. */
export function stepCharge(progress: number, inside: boolean, dt: number, speed = 1): number {
  const p = inside ? progress + (dt * Math.max(0, speed)) / CHARGE_TIME : progress - dt * CHARGE_DRAIN
  return Math.min(1, Math.max(0, p))
}

export function chargeText(progress: number): string {
  return `Charging… ${Math.floor(Math.min(1, Math.max(0, progress)) * 100)}%`
}

export type PotLoot =
  | { kind: 'gold'; amount: number }
  | { kind: 'xp'; amount: number }
  | { kind: 'health'; amount: number }
  | { kind: 'silver'; amount: number }
  | null

/**
 * What a broken pot drops: 60% gold (2–6), 20% XP (5), 10% a health snack
 * (+20) and 10% nothing. Silver pots always drop 1–3 silver.
 */
export function rollPotLoot(rng: Rng, silvery: boolean): PotLoot {
  if (silvery) return { kind: 'silver', amount: rng.int(1, 3) }
  const r = rng.next()
  if (r < 0.6) return { kind: 'gold', amount: rng.int(2, 6) }
  if (r < 0.8) return { kind: 'xp', amount: 5 }
  if (r < 0.9) return { kind: 'health', amount: 20 }
  return null
}

/**
 * Shrine kinds for `n` spots. One of each kind is guaranteed before the rest
 * fill in, so a map with fewer spots than usual still has every shrine type;
 * the result is shuffled so kinds land anywhere.
 */
export function assignShrineKinds(n: number, rng: Rng): ShrineKind[] {
  const kinds = Object.keys(SHRINE_COUNTS) as ShrineKind[]
  const rest: ShrineKind[] = []
  for (const kind of kinds) for (let i = 1; i < SHRINE_COUNTS[kind]; i++) rest.push(kind)
  const all = [...kinds, ...rng.shuffle(rest)].slice(0, Math.max(0, Math.floor(n)))
  return rng.shuffle(all)
}

/** Challenge shrines spawn 6 elites on stage 1, and 3 more each stage after. */
export function challengeSize(stageIndex: number): number {
  return 6 + Math.max(0, stageIndex) * 3
}

/**
 * A golden shrine's boon: the same offer, re-scaled to legendary. Stat boons
 * were rolled with their own rarity's multiplier, so their mods are scaled by
 * the ratio rather than only relabelled.
 */
export function forceLegendary(offer: Offer): Offer {
  if (offer.rarity === 'legendary') return offer
  if (offer.type === 'stat') {
    const ratio = RARITY_MULT.legendary / RARITY_MULT[offer.rarity]
    return { ...offer, rarity: 'legendary', mods: offer.mods.map((m) => scaleMod(m, ratio)) }
  }
  if (offer.type === 'gold' || offer.type === 'heal') {
    const ratio = RARITY_MULT.legendary / RARITY_MULT[offer.rarity]
    return { ...offer, rarity: 'legendary', amount: Math.round(offer.amount * ratio) }
  }
  return { ...offer, rarity: 'legendary' }
}

export interface Reachable {
  /** Distance to the player this frame (Infinity when out of reach vertically). */
  dist: number
  /** How close the player must be. */
  reach: number
  usable: boolean
}

/** The nearest usable thing the player is within reach of, or null. */
export function pickNearest<T extends Reachable>(items: readonly T[]): T | null {
  let best: T | null = null
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item.usable || !(item.dist <= item.reach)) continue
    if (!best || item.dist < best.dist) best = item
  }
  return best
}

/**
 * XZ offsets for `n` things spread on a circle, starting at `angle`. Used to
 * fan several reward chests around a spot so they never overlap.
 */
export function ringOffsets(n: number, radius: number, angle = 0): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const count = Math.max(0, Math.floor(n))
  for (let i = 0; i < count; i++) {
    const a = angle + (i / Math.max(1, count)) * Math.PI * 2
    out.push([Math.sin(a) * radius, Math.cos(a) * radius])
  }
  return out
}
