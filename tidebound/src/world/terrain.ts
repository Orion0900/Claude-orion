/**
 * Every kind of map cell and how it behaves. Maps are grids of these; the
 * art in src/art/world draws each one, and the overworld reads the flags
 * here for collision, encounters, surfing and ledges.
 */
export const TERRAIN_KINDS = [
  // Outdoors
  'grass',
  'tallgrass',
  'flowers',
  'path',
  'sand',
  'water',
  'ledgeS',
  'ledgeE',
  'ledgeW',
  'tree',
  'palm',
  'bush',
  'rock',
  'fence',
  'sign',
  'mailbox',
  'cliff',
  'stairs',
  'bridgeH',
  'bridgeV',
  'pier',
  'waterRock',
  'caveEntrance',
  // Caves
  'caveFloor',
  'caveWall',
  'caveRock',
  'caveLadder',
  'caveWater',
  // Indoors
  'floor',
  'floorTile',
  'wall',
  'window',
  'mat',
  'rug',
  'stairsUp',
  'stairsDown',
  'table',
  'bed',
  'tv',
  'bookshelf',
  'plant',
  'counter',
  'pc',
  'healer',
  'shelf',
  'machine',
  'crate',
  'barrel',
  'statue',
  'void',
  // The old wreck
  'deck',
  'hull',
] as const

export type TerrainKind = (typeof TERRAIN_KINDS)[number]

export type Dir = 'up' | 'down' | 'left' | 'right'

export interface TerrainInfo {
  /** Can be walked onto. */
  walk: boolean
  /** Can be crossed while surfing. */
  surf?: boolean
  /** Which encounter table stepping here rolls against. */
  encounter?: 'grass' | 'water' | 'cave'
  /** A one-way ledge: step onto it moving this way to hop down past it. */
  ledge?: Dir
  /** Tall grass: its front blades are drawn over the feet of whoever stands in it. */
  overlay?: boolean
  /** Stepping here warps (doors in cliffs, stairs, doormats). */
  warp?: boolean
  /** Press A facing it to read or use it. */
  interact?: 'sign' | 'pc' | 'healer' | 'tv' | 'bookshelf' | 'machine' | 'mailbox' | 'water'
  /** Talk across it to whoever stands behind (shop and Haven counters). */
  counter?: boolean
}

const WALK: TerrainInfo = { walk: true }
const BLOCK: TerrainInfo = { walk: false }

export const TERRAIN: Record<TerrainKind, TerrainInfo> = {
  grass: WALK,
  tallgrass: { walk: true, encounter: 'grass', overlay: true },
  flowers: WALK,
  path: WALK,
  sand: WALK,
  water: { walk: false, surf: true, encounter: 'water', interact: 'water' },
  ledgeS: { walk: false, ledge: 'down' },
  ledgeE: { walk: false, ledge: 'right' },
  ledgeW: { walk: false, ledge: 'left' },
  tree: BLOCK,
  palm: BLOCK,
  bush: BLOCK,
  rock: BLOCK,
  fence: BLOCK,
  sign: { walk: false, interact: 'sign' },
  mailbox: { walk: false, interact: 'mailbox' },
  cliff: BLOCK,
  stairs: WALK,
  bridgeH: WALK,
  bridgeV: WALK,
  pier: WALK,
  waterRock: BLOCK,
  caveEntrance: { walk: true, warp: true },
  caveFloor: { walk: true, encounter: 'cave' },
  caveWall: BLOCK,
  caveRock: BLOCK,
  caveLadder: { walk: true, warp: true },
  caveWater: { walk: false, surf: true, encounter: 'water', interact: 'water' },
  floor: WALK,
  floorTile: WALK,
  wall: BLOCK,
  window: BLOCK,
  mat: { walk: true, warp: true },
  rug: WALK,
  stairsUp: { walk: true, warp: true },
  stairsDown: { walk: true, warp: true },
  table: BLOCK,
  bed: BLOCK,
  tv: { walk: false, interact: 'tv' },
  bookshelf: { walk: false, interact: 'bookshelf' },
  plant: BLOCK,
  counter: { walk: false, counter: true },
  pc: { walk: false, interact: 'pc' },
  healer: { walk: false, interact: 'healer' },
  shelf: BLOCK,
  machine: { walk: false, interact: 'machine' },
  crate: BLOCK,
  barrel: BLOCK,
  statue: BLOCK,
  void: BLOCK,
  deck: { walk: true, encounter: 'cave' },
  hull: BLOCK,
}

/**
 * Buildings are drawn as one sprite over a block of cells. Every cell they
 * cover is solid except the door, which warps inside. Sizes are in tiles;
 * `door` is relative to the building's top-left cell.
 */
export const BUILDING_KINDS = ['house', 'hut', 'haven', 'market', 'lab', 'bigHouse', 'hall', 'lighthouse', 'wreck', 'shrine'] as const

export type BuildingKind = (typeof BUILDING_KINDS)[number]

export const BUILDING_SIZE: Record<BuildingKind, { w: number; h: number; door: { x: number; y: number } }> = {
  house: { w: 5, h: 4, door: { x: 2, y: 3 } },
  hut: { w: 3, h: 3, door: { x: 1, y: 2 } },
  haven: { w: 7, h: 5, door: { x: 3, y: 4 } },
  market: { w: 5, h: 4, door: { x: 2, y: 3 } },
  lab: { w: 7, h: 5, door: { x: 3, y: 4 } },
  bigHouse: { w: 7, h: 5, door: { x: 2, y: 4 } },
  hall: { w: 9, h: 6, door: { x: 4, y: 5 } },
  lighthouse: { w: 3, h: 8, door: { x: 1, y: 7 } },
  wreck: { w: 9, h: 5, door: { x: 4, y: 4 } },
  shrine: { w: 3, h: 3, door: { x: 1, y: 2 } },
}
