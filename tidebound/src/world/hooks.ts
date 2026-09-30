import type { Outcome } from '../battle/types'
import type { SpeciesId } from '../data/dex'
import type { SaveData } from '../game/state'
import type { Actor } from './Actor'
import type { TrainerDef } from './mapTypes'
import type { Overworld } from './Overworld'
import type { Script, ScriptCtx, WildOptions } from './script'
import type { TerrainInfo } from './terrain'

/**
 * The overworld's links to the rest of the game — menus, battles, the
 * party — filled in at boot by src/game/field.ts. Keeping them here lets the
 * world code load (and be tested) without pulling in every scene.
 */
export const overworldHooks = {
  startMenu: (async () => {}) as Script,
  select: (async () => {}) as Script,
  use: async (_s: ScriptCtx, _ow: Overworld, _what: NonNullable<TerrainInfo['interact']>): Promise<void> => {},
  giveBeast: async (_s: ScriptCtx, _ow: Overworld, _species: SpeciesId, _level: number, _place: string): Promise<void> => {},
  healParty: (_save: SaveData): void => {},
  trainerBattle: async (_s: ScriptCtx, _ow: Overworld, _t: TrainerDef, _npc?: Actor): Promise<boolean> => false,
  wildBattle: async (_s: ScriptCtx, _ow: Overworld, _species: SpeciesId, _level: number, _o?: WildOptions): Promise<Outcome> => 'fled',
}
