import type { MapDef } from '../mapTypes'
import { BEACON_MAPS } from './beacon'
import { DRIFTWOOD_MAPS } from './driftwood'
import { LAGOONA_MAPS } from './lagoona'
import { ROUTE1_MAPS } from './route1'
import { ROUTE2_MAPS } from './route2'
import { ROUTE3_MAPS } from './route3'
import { ROUTE4_MAPS } from './route4'

/** Every map in the game, by id. */
export const ALL_MAPS: readonly MapDef[] = [
  ...DRIFTWOOD_MAPS,
  ...ROUTE1_MAPS,
  ...ROUTE2_MAPS,
  ...ROUTE3_MAPS,
  ...ROUTE4_MAPS,
  ...LAGOONA_MAPS,
  ...BEACON_MAPS,
]

export const MAPS: ReadonlyMap<string, MapDef> = new Map(ALL_MAPS.map((m) => [m.id, m]))
