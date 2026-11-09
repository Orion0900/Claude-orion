/**
 * Seams between the overworld and the rest of the game. The overworld calls
 * these; src/game/field.ts fills them in at boot, so the world code never
 * imports the battle scene or the menus directly.
 */
import type { Outcome } from '../battle/types'
import type { SpeciesId } from '../data/species'
import type { TrainerDef } from './mapTypes'
import type { Overworld } from './Overworld'
import type { Script, WildOptions } from './script'

export interface Hooks {
  /** START: the pause menu. */
  startMenu: Script
  /** SELECT: the quick item (the bicycle). */
  select: Script
  /** A pressed facing terrain with nobody there: PCs, shelves, water, bushes. */
  facing: Script
  trainerBattle(ow: Overworld, t: TrainerDef): Promise<'win' | 'lose'>
  wildBattle(ow: Overworld, species: SpeciesId, level: number, o: WildOptions): Promise<Outcome>
  giveCritter(ow: Overworld, species: SpeciesId, level: number, nickname: boolean): Promise<boolean>
  healParty(ow: Overworld): Promise<void>
}

const nothing: Script = async () => {}

export const hooks: Hooks = {
  startMenu: nothing,
  select: nothing,
  facing: nothing,
  trainerBattle: async () => 'win',
  wildBattle: async () => 'fled',
  giveCritter: async () => true,
  healParty: async () => {},
}
