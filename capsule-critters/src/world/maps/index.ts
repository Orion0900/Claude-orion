import type { MapDef } from '../mapTypes'
import { World } from '../WorldMap'
import { FARTHING_MAPS } from './farthing'
import { ROUTE1_MAPS } from './route1'

/** Every map in the game, by id. */
export const MAP_DEFS: ReadonlyMap<string, MapDef> = new Map([...FARTHING_MAPS, ...ROUTE1_MAPS].map((m) => [m.id, m]))

export function makeWorld(): World {
  return new World(MAP_DEFS)
}
