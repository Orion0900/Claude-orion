import { Vector3 } from 'three'
import type { Rng } from '../core/rng'
import type { WorldApi } from '../game/types'
import type { HeightField } from './terrain'

export type WorldSpots = WorldApi['spots']

export const SPOT_RULES = {
  chests: 26,
  shrines: 24,
  pots: 40,
  /** Every spot sits within this distance of the centre... */
  maxRadius: 95,
  /** ...and no closer than this, so the start clearing stays clear. */
  startClear: 12,
  altarMin: 55,
  altarMax: 80,
  /** Minimum distance between two spots of the same kind. */
  chestSpacing: 10,
  shrineSpacing: 14,
  potSpacing: 2.5,
  /** Steepest ground (degrees) a spot may sit on... */
  maxSlope: 24,
  /** ...and for the altar and shrines, whose ground gets levelled, so the pad edges stay gentle. */
  padSlope: 14,
}

/**
 * Room each spot keeps to itself, metres. Two spots of different kinds stay
 * the sum of their clearances apart, and props stay out of it too. The altar
 * is a big archway and a charge shrine has a 3 m ring to stand in.
 */
export const SPOT_CLEARANCE = { altar: 7, shrine: 4.5, chest: 2.2, pot: 1.2 }

/**
 * Picks every interactable spot for a map. Spots go down before props so the
 * props can keep out of their way. Levels the ground under the altar and the
 * shrines (mutating `field`), then reads each spot's y off the ground.
 */
export function placeSpots(field: HeightField, rng: Rng, rules = SPOT_RULES): WorldSpots {
  const taken: Array<{ x: number; z: number; keep: number }> = []
  const flatFor = (degrees: number) => Math.cos((degrees * Math.PI) / 180)

  const fits = (x: number, z: number, keep: number, spacing: number, same: readonly Vector3[], minFlat: number): boolean => {
    const r2 = x * x + z * z
    if (r2 < rules.startClear ** 2 || r2 > rules.maxRadius ** 2) return false
    if (field.flatness(x, z) < minFlat) return false
    for (const t of taken) {
      const need = t.keep + keep
      if ((x - t.x) ** 2 + (z - t.z) ** 2 < need * need) return false
    }
    for (const s of same) if ((x - s.x) ** 2 + (z - s.z) ** 2 < spacing * spacing) return false
    return true
  }

  const add = (x: number, z: number, keep: number, list: Vector3[]): void => {
    list.push(new Vector3(x, 0, z))
    taken.push({ x, z, keep })
  }

  /** Rejection sampling, uniform by area; a rough map slowly accepts steeper ground rather than coming up short. */
  const scatter = (list: Vector3[], count: number, keep: number, spacing: number, minR: number, maxR: number, slope: number) => {
    let minFlat = flatFor(slope)
    for (let tries = 1; list.length < count && tries <= 60000; tries++) {
      if (tries % 5000 === 0) minFlat *= 0.97
      const a = rng.range(0, Math.PI * 2)
      const r = Math.sqrt(rng.range(minR * minR, maxR * maxR))
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (fits(x, z, keep, spacing, list, minFlat)) add(x, z, keep, list)
    }
  }

  const altars: Vector3[] = []
  scatter(altars, 1, SPOT_CLEARANCE.altar, 0, rules.altarMin, rules.altarMax, rules.padSlope)
  if (altars.length === 0) add(rules.altarMin, 0, SPOT_CLEARANCE.altar, altars)
  const altar = altars[0]
  field.flatten(altar.x, altar.z, 5, 5)

  const shrines: Vector3[] = []
  scatter(shrines, rules.shrines, SPOT_CLEARANCE.shrine, rules.shrineSpacing, rules.startClear, rules.maxRadius, rules.padSlope)
  for (const s of shrines) field.flatten(s.x, s.z, 3.2, 3)

  const chests: Vector3[] = []
  scatter(chests, rules.chests, SPOT_CLEARANCE.chest, rules.chestSpacing, rules.startClear, rules.maxRadius, rules.maxSlope)

  // Pots come in little clusters of one to three, like in the original.
  const pots: Vector3[] = []
  const potFlat = flatFor(rules.maxSlope)
  for (let tries = 0; pots.length < rules.pots && tries < 30000; tries++) {
    const a = rng.range(0, Math.PI * 2)
    const r = Math.sqrt(rng.range(rules.startClear ** 2, rules.maxRadius ** 2))
    const cx = Math.cos(a) * r
    const cz = Math.sin(a) * r
    const group = Math.min(rules.pots - pots.length, rng.int(1, 3))
    for (let g = 0; g < group; g++) {
      const x = g === 0 ? cx : cx + rng.range(-3, 3)
      const z = g === 0 ? cz : cz + rng.range(-3, 3)
      if (fits(x, z, SPOT_CLEARANCE.pot, rules.potSpacing, pots, potFlat)) add(x, z, SPOT_CLEARANCE.pot, pots)
    }
  }

  const playerStart = new Vector3(0, 0, 0)
  for (const list of [shrines, chests, pots, altars, [playerStart]]) {
    for (const p of list) p.y = field.heightAt(p.x, p.z)
  }
  return { chests, shrines, pots, altar, playerStart }
}
