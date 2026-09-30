/**
 * The battle rules, in one import: the contract types, the engine, the type
 * chart, the formulas and the creature helpers. Move and species data are
 * re-exported for convenience.
 */
export * from './types'
export { Battle, statusImmune } from './Battle'
export { typeMultiplier, effectiveness, chartMatrix } from './typechart'
export * from './formulas'
export * from './creature'
export { move, MOVES, STRUGGLE, isMove } from '../data/moves'
export type { MoveData, MoveEffect, MoveFx, MoveCategory, MoveTarget } from '../data/moves'
export { species, SPECIES, baseStatTotal } from '../data/species'
export type { SpeciesData, Growth, LearnsetEntry } from '../data/species'
