/**
 * Which moves a critter knows and can learn: by level, and from skill discs.
 */
import { move, type MoveId } from './moves'
import { species, type SpeciesId } from './species'
import type { TypeId } from './types'

/** Disc moves almost any critter can learn. */
const UNIVERSAL: ReadonlySet<MoveId> = new Set<MoveId>(['ram', 'flatten', 'seeker', 'nap', 'blur', 'overdrive', 'stampede', 'pumpUp'])

/** Disc moves only for the critters that list them. */
const EXPLICIT_ONLY: ReadonlySet<MoveId> = new Set<MoveId>(['kaboom', 'mend', 'bodyThrow', 'suplex'])

/** Which types can use each field move, beyond the critters that list it. */
const FIELD_TYPES: Readonly<Partial<Record<MoveId, readonly TypeId[]>>> = {
  chop: ['NORMAL', 'PLANT', 'BUG', 'BRAWL', 'DRAKE'],
  paddle: ['WATER'],
  heave: ['BRAWL', 'STONE', 'EARTH'],
  glow: ['SPARK', 'MIND', 'FIRE'],
  soar: ['SKY'],
}

/** Critters too simple to learn from discs at all. */
const NO_DISCS: ReadonlySet<SpeciesId> = new Set<SpeciesId>(['grublet', 'caskling'])

/** Whether a species can be taught a move from a disc. */
export function canLearnDisc(id: SpeciesId, m: MoveId): boolean {
  if (NO_DISCS.has(id)) return false
  const s = species(id)
  if (s.discs?.includes(m)) return true
  if (s.learn.some(([, lm]) => lm === m)) return true
  const field = FIELD_TYPES[m]
  if (field) return s.types.some((t) => field.includes(t))
  if (EXPLICIT_ONLY.has(m)) return false
  if (UNIVERSAL.has(m)) return true
  const t = move(m).type
  return s.types.includes(t)
}

/** The moves a critter of this level knows when met in the wild: the last four it learned. */
export function movesAtLevel(id: SpeciesId, level: number): MoveId[] {
  const out: MoveId[] = []
  for (const [lv, m] of species(id).learn) {
    if (lv > level) continue
    const i = out.indexOf(m)
    if (i >= 0) out.splice(i, 1)
    out.push(m)
  }
  return out.slice(-4)
}

/** Moves learned on reaching exactly this level. */
export function movesLearnedAt(id: SpeciesId, level: number): MoveId[] {
  return species(id)
    .learn.filter(([lv]) => lv === level)
    .map(([, m]) => m)
}
