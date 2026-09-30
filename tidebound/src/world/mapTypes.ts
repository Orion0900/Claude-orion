import type { Facing, Look } from '../art/look'
import type { BattleBg } from '../art/world'
import type { TrackId } from '../audio/api'
import type { SpeciesId } from '../data/dex'
import type { ItemId } from '../data/items'
import type { SaveData } from '../game/state'
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
  party: readonly { species: SpeciesId; level: number }[]
  /** Shells per level of their last beast. */
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
  /** Portrait for scripted battles with no person on the map. */
  look?: Look
  /** Losing doesn't black out (the first rival battle); the party is healed after. */
  canLose?: boolean
}

export type NpcMove = 'still' | 'look' | 'wander'

export interface NpcDef {
  id: string
  x: number
  y: number
  face?: Facing
  look: Look
  move?: NpcMove
  /** What they say when spoken to. */
  text?: string
  /** Or a script, for anything more. */
  script?: Script
  trainer?: TrainerDef
  /** How far a trainer sees along the way they face (default 4). */
  sight?: number
  /** Only present while this holds. */
  when?: (s: SaveData) => boolean
  /**
   * An object rather than a person: 'orb' draws a capture orb (the starters
   * on the lab table), 'hidden' draws nothing. Props never turn to face you.
   */
  prop?: 'orb' | 'hidden'
}

export interface ItemBallDef {
  /** Unique; picking it up sets the flag `item:<id>`. */
  id: string
  x: number
  y: number
  item: ItemId
  qty?: number
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
  variant?: number
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

export interface MapDef {
  id: string
  /** Shown in the popup on arrival and in the summary's met place. */
  name: string
  music: TrackId
  bg: BattleBg
  /** One string per row, one legend character per cell. */
  rows: readonly string[]
  /** Extra or overriding legend characters for this map. */
  legend?: Readonly<Record<string, TerrainKind>>
  /** Drawn beyond the edges where there is no connection. */
  border: TerrainKind
  indoor?: boolean
  /** Caves and the wreck: DUSK ORB works and RETURN WING can be used. */
  dark?: boolean
  connections?: Partial<Record<Side, Connection>>
  buildings?: readonly BuildingDef[]
  warps?: readonly WarpDef[]
  npcs?: readonly NpcDef[]
  items?: readonly ItemBallDef[]
  signs?: readonly SignDef[]
  triggers?: readonly TriggerDef[]
  encounters?: { grass?: EncounterTable; water?: EncounterTable; cave?: EncounterTable; fish?: EncounterTable }
  /** Runs every time the map is entered. */
  onEnter?: Script
  /** In a Haven: where a blacked-out player wakes up. */
  haven?: { x: number; y: number }
  /** Where RETURN WING takes you from this dungeon. */
  escape?: { map: string; x: number; y: number }
}
