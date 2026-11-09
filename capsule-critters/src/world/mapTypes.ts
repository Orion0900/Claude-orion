import type { TrackId } from '../audio/api'
import type { PalId } from '../engine/palettes'
import type { ItemId } from '../data/items'
import type { MoveId } from '../data/moves'
import type { SpeciesId } from '../data/species'
import type { Facing, SaveData } from '../game/state'
import type { PersonId } from '../art/world/people'
import type { BuildingKind, TerrainKind } from './terrain'
import type { Script } from './script'

export type Side = 'north' | 'south' | 'east' | 'west'

/**
 * A seamless edge into another map. For north/south, `offset` is where the
 * other map's left column sits in this map's columns; for east/west, where
 * its top row sits in this map's rows.
 */
export interface Connection {
  map: string
  offset: number
}

export interface EncounterSlot {
  species: SpeciesId
  min: number
  max: number
  weight: number
}

export interface EncounterTable {
  /** Percent chance per step (or per cast, for fishing). */
  rate: number
  slots: readonly EncounterSlot[]
}

export interface TrainerDef {
  /** Unique; beating the trainer sets the flag `beat:<id>`. */
  id: string
  className: string
  name: string
  party: readonly { species: SpeciesId; level: number; moves?: MoveId[] }[]
  /** Shells (¤) per level of their last critter. */
  prize: number
  /** Said on spotting you, before the battle. */
  intro: string
  /** Said in battle when they lose. */
  lose: string
  /** Said if you talk to them afterwards. */
  after: string
  ai?: 'basic' | 'smart'
  items?: ItemId[]
  music?: TrackId
  /** Losing doesn't black out (the first rival battle). */
  canLose?: boolean
}

export type NpcMove = 'still' | 'look' | 'wander' | 'spin'

export interface NpcDef {
  id: string
  x: number
  y: number
  face?: Facing
  look: PersonId
  move?: NpcMove
  /** What they say when spoken to. */
  text?: string | ((s: SaveData) => string)
  /** Or a script, for anything more. */
  script?: Script
  trainer?: TrainerDef
  /** How far a trainer sees along the way they face (default 4). */
  sight?: number
  /** Only present while this holds. */
  when?: (s: SaveData) => boolean
  /** Not a person: 'capsule' (the starters on the lab table), 'boulder' (pushable), 'hidden' (nothing drawn). */
  prop?: 'capsule' | 'boulder' | 'hidden' | 'critter'
  /** For prop 'critter': which one stands there. */
  critter?: SpeciesId
}

export interface ItemBallDef {
  /** Unique; picking it up sets the flag `item:<id>`. */
  id: string
  x: number
  y: number
  item: ItemId
  qty?: number
  /** Hidden items need searching for (A facing the spot). */
  hidden?: boolean
}

export interface SignDef {
  x: number
  y: number
  text: string
}

export interface WarpDef {
  x: number
  y: number
  to: string
  tx: number
  ty: number
  face?: Facing
}

export interface BuildingDef {
  kind: BuildingKind
  x: number
  y: number
  /** Where the door leads. Without it the door is locked. */
  to?: { map: string; x: number; y: number }
  /** Said when the door is locked. */
  locked?: string
}

export interface TriggerDef {
  x: number
  y: number
  w?: number
  h?: number
  when?: (s: SaveData) => boolean
  script: Script
}

export type MapKind = 'town' | 'route' | 'indoor' | 'cave' | 'dungeon'

/** Which backdrop the battle screen uses on this map. */
export type BattleBg = 'grass' | 'cave' | 'water' | 'indoor' | 'arena'

export interface MapDef {
  id: string
  /** Shown on arrival and as a critter's met place. */
  name: string
  kind: MapKind
  music: TrackId
  /** One string per row, one legend character per cell. */
  rows: readonly string[]
  legend?: Readonly<Record<string, TerrainKind>>
  /** Drawn beyond the edges where there is no connection. */
  border: TerrainKind
  /** Palette overrides for the overworld slots (see SLOT in art/world/tiles). */
  palette?: Partial<Record<number, PalId>>
  /** Caves too dark to see without GLOW. */
  dark?: boolean
  connections?: Partial<Record<Side, Connection>>
  buildings?: readonly BuildingDef[]
  warps?: readonly WarpDef[]
  npcs?: readonly NpcDef[]
  items?: readonly ItemBallDef[]
  signs?: readonly SignDef[]
  triggers?: readonly TriggerDef[]
  encounters?: {
    grass?: EncounterTable
    water?: EncounterTable
    cave?: EncounterTable
    fishTwig?: EncounterTable
    fishReel?: EncounterTable
    fishPro?: EncounterTable
  }
  /** Runs every time the map is entered. */
  onEnter?: Script
  /** In a CLINIC: where a blacked-out player wakes up. */
  clinic?: { x: number; y: number }
  /** Where EXIT CORD takes you from this dungeon. */
  escape?: { map: string; x: number; y: number }
  /** Towns you can SOAR to: where you land. */
  soar?: { x: number; y: number }
  bg?: BattleBg
}
