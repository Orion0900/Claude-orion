import { Vector3 } from 'three'
import type { Rng } from '../core/rng'
import type { WorldApi } from '../game/types'
import { nearRamp } from './ramps'
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
  /** ...and for the altar and shrines, whose ground gets levelled, so the pad edges stay gentle... */
  padSlope: 14,
  /** ...no steeper than this anywhere around the rim once levelled (walking tops out at 50°). */
  padRim: 42,
}

/** The levelled pads: flat out to `radius`, easing back into the hills over `blend`. */
export const SPOT_PADS = { altar: { radius: 5, blend: 5 }, shrine: { radius: 3.2, blend: 3 } }

/**
 * Room each spot keeps to itself, metres. Two spots of different kinds stay
 * the sum of their clearances apart, and props stay out of it too. The altar
 * is a big archway and a charge shrine has a 3 m ring to stand in.
 */
export const SPOT_CLEARANCE = { altar: 7, shrine: 4.5, chest: 2.2, pot: 1.2 }

/**
 * How far each kind of spot stays from a slide ramp's lane, so nothing sits
 * in a slide's way and levelling a pad never dents a ramp: the altar levels
 * 10 m around itself and a shrine 6.2 m (`SPOT_PADS`).
 */
export const SPOT_RAMP_CLEAR = { altar: 11, shrine: 7.5, chest: 3.5, pot: 2.5 }

/**
 * Whether levelling a pad at (x, z) keeps its rim walkable: where the pad
 * eases back into the hills, the ground's own slope fades out while the
 * step between the pad and the hills fades in, and together they must stay
 * under `maxSlope` degrees. Checked on a ring of points across the rim.
 */
export function padRimFits(field: HeightField, x: number, z: number, pad: { radius: number; blend: number }, maxSlope: number): boolean {
  const level = field.heightAt(x, z)
  const limit = Math.tan((maxSlope * Math.PI) / 180)
  for (const t of [0.2, 0.4, 0.6, 0.8]) {
    const r = pad.radius + pad.blend * t
    // The pad's weight 1 − smoothstep(t), and how fast it falls off per metre.
    const w = 1 - t * t * (3 - 2 * t)
    const fall = (6 * t * (1 - t)) / pad.blend
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8
      const px = x + Math.cos(a) * r
      const pz = z + Math.sin(a) * r
      const f = field.flatness(px, pz)
      const own = Math.sqrt(Math.max(0, 1 / (f * f) - 1))
      if (own * w + Math.abs(field.heightAt(px, pz) - level) * fall > limit) return false
    }
  }
  return true
}

/**
 * Picks every interactable spot for a map. Spots go down before props so the
 * props can keep out of their way. Levels the ground under the altar and the
 * shrines (mutating `field`), then reads each spot's y off the ground.
 */
export function placeSpots(field: HeightField, rng: Rng, rules = SPOT_RULES): WorldSpots {
  const taken: Array<{ x: number; z: number; keep: number }> = []
  const flatFor = (degrees: number) => Math.cos((degrees * Math.PI) / 180)

  const fits = (
    x: number,
    z: number,
    keep: number,
    spacing: number,
    same: readonly Vector3[],
    minFlat: number,
    rampClear: number,
    pad?: { radius: number; blend: number },
  ): boolean => {
    const r2 = x * x + z * z
    if (r2 < rules.startClear ** 2 || r2 > rules.maxRadius ** 2) return false
    if (field.flatness(x, z) < minFlat) return false
    if (nearRamp(field.ramps, x, z, rampClear)) return false
    for (const t of taken) {
      const need = t.keep + keep
      if ((x - t.x) ** 2 + (z - t.z) ** 2 < need * need) return false
    }
    for (const s of same) if ((x - s.x) ** 2 + (z - s.z) ** 2 < spacing * spacing) return false
    return !pad || padRimFits(field, x, z, pad, rules.padRim)
  }

  const add = (x: number, z: number, keep: number, list: Vector3[]): void => {
    list.push(new Vector3(x, 0, z))
    taken.push({ x, z, keep })
  }

  /** Rejection sampling, uniform by area; a rough map slowly accepts steeper ground rather than coming up short. */
  const scatter = (
    list: Vector3[],
    count: number,
    keep: number,
    spacing: number,
    minR: number,
    maxR: number,
    slope: number,
    rampClear: number,
    pad?: { radius: number; blend: number },
  ) => {
    let minFlat = flatFor(slope)
    for (let tries = 1; list.length < count && tries <= 60000; tries++) {
      if (tries % 5000 === 0) minFlat *= 0.97
      const a = rng.range(0, Math.PI * 2)
      const r = Math.sqrt(rng.range(minR * minR, maxR * maxR))
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r
      if (fits(x, z, keep, spacing, list, minFlat, rampClear, pad)) add(x, z, keep, list)
    }
  }

  const { altar: altarPad, shrine: shrinePad } = SPOT_PADS
  const altars: Vector3[] = []
  scatter(altars, 1, SPOT_CLEARANCE.altar, 0, rules.altarMin, rules.altarMax, rules.padSlope, SPOT_RAMP_CLEAR.altar, altarPad)
  if (altars.length === 0) add(rules.altarMin, 0, SPOT_CLEARANCE.altar, altars)
  const altar = altars[0]
  field.flatten(altar.x, altar.z, altarPad.radius, altarPad.blend)

  // Shrines stand 14 m apart, so their pads never overlap; the altar's is already levelled.
  const shrines: Vector3[] = []
  scatter(shrines, rules.shrines, SPOT_CLEARANCE.shrine, rules.shrineSpacing, rules.startClear, rules.maxRadius, rules.padSlope, SPOT_RAMP_CLEAR.shrine, shrinePad)
  for (const s of shrines) field.flatten(s.x, s.z, shrinePad.radius, shrinePad.blend)

  const chests: Vector3[] = []
  scatter(chests, rules.chests, SPOT_CLEARANCE.chest, rules.chestSpacing, rules.startClear, rules.maxRadius, rules.maxSlope, SPOT_RAMP_CLEAR.chest)

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
      if (fits(x, z, SPOT_CLEARANCE.pot, rules.potSpacing, pots, potFlat, SPOT_RAMP_CLEAR.pot)) add(x, z, SPOT_CLEARANCE.pot, pots)
    }
  }

  const playerStart = new Vector3(0, 0, 0)
  for (const list of [shrines, chests, pots, altars, [playerStart]]) {
    for (const p of list) p.y = field.heightAt(p.x, p.z)
  }
  return { chests, shrines, pots, altar, playerStart }
}
