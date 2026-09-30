import { TYPES, type TypeId } from '../data/types'
import type { Effectiveness } from './types'

/**
 * The type chart, exactly as written out in docs/DESIGN.md. Each row lists
 * only the defenders that differ from normal effectiveness: 2 is super
 * effective, 0.5 not very effective, 0 no effect.
 *
 * Two deliberate differences from the genre's usual chart: VOLT is super
 * effective on METAL (it conducts) and TOXIC is super effective on TIDE (it
 * fouls the water).
 */
const CHART: Record<TypeId, Partial<Record<TypeId, 0 | 0.5 | 2>>> = {
  normal: { stone: 0.5, spirit: 0, metal: 0.5 },
  flame: { flame: 0.5, tide: 0.5, leaf: 2, frost: 2, bug: 2, stone: 0.5, wyrm: 0.5, metal: 2 },
  tide: { flame: 2, tide: 0.5, leaf: 0.5, earth: 2, stone: 2, wyrm: 0.5 },
  leaf: { flame: 0.5, tide: 2, leaf: 0.5, toxic: 0.5, earth: 2, gale: 0.5, bug: 0.5, stone: 2, wyrm: 0.5, metal: 0.5 },
  volt: { tide: 2, leaf: 0.5, volt: 0.5, earth: 0, gale: 2, wyrm: 0.5, metal: 2 },
  frost: { flame: 0.5, tide: 0.5, leaf: 2, frost: 0.5, earth: 2, gale: 2, wyrm: 2, metal: 0.5 },
  brawl: { normal: 2, frost: 2, toxic: 0.5, gale: 0.5, mind: 0.5, bug: 0.5, stone: 2, spirit: 0, metal: 2, shade: 2 },
  toxic: { tide: 2, leaf: 2, toxic: 0.5, earth: 0.5, stone: 0.5, spirit: 0.5, metal: 0 },
  earth: { flame: 2, leaf: 0.5, volt: 2, toxic: 2, gale: 0, bug: 0.5, stone: 2, metal: 2 },
  gale: { leaf: 2, volt: 0.5, brawl: 2, bug: 2, stone: 0.5, metal: 0.5 },
  mind: { brawl: 2, toxic: 2, mind: 0.5, metal: 0.5, shade: 0 },
  bug: { flame: 0.5, leaf: 2, brawl: 0.5, toxic: 0.5, gale: 0.5, mind: 2, spirit: 0.5, metal: 0.5, shade: 2 },
  stone: { flame: 2, frost: 2, brawl: 0.5, earth: 0.5, gale: 2, bug: 2, metal: 0.5 },
  spirit: { normal: 0, mind: 2, spirit: 2, shade: 0.5 },
  wyrm: { wyrm: 2, metal: 0.5 },
  metal: { flame: 0.5, tide: 0.5, volt: 0.5, frost: 2, stone: 2, metal: 0.5 },
  shade: { brawl: 0.5, mind: 2, spirit: 2, shade: 0.5 },
}

/** One attacking type against one defending type: 0, 0.5, 1 or 2. */
export function typeMultiplier(attack: TypeId, defend: TypeId): 0 | 0.5 | 1 | 2 {
  return CHART[attack][defend] ?? 1
}

/** An attacking type against a (possibly dual-typed) defender; dual types multiply. */
export function effectiveness(attack: TypeId, defender: readonly TypeId[]): Effectiveness {
  let m = 1
  for (const d of defender) m *= typeMultiplier(attack, d)
  return m as Effectiveness
}

/** The whole chart as a matrix in TYPES order, for the Beastiary or debugging. */
export function chartMatrix(): number[][] {
  return TYPES.map((a) => TYPES.map((d) => typeMultiplier(a, d)))
}
