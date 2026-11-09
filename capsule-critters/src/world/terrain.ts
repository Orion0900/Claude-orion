/**
 * Every kind of map cell and how it behaves. Maps are grids of these; the
 * art in src/art/world draws each one, and the overworld reads the flags
 * here for collision, encounters, surfing and ledges.
 */
export type Dir = 'up' | 'down' | 'left' | 'right'

export const TERRAIN_KINDS = [
  // Outdoors
  'grass',
  'tall',
  'flowers',
  'path',
  'sand',
  'water',
  'ledgeS',
  'ledgeE',
  'ledgeW',
  'tree',
  'bush',
  'rock',
  'fence',
  'sign',
  'mailbox',
  'stairs',
  'bridgeH',
  'bridgeV',
  'pier',
  'caveEntrance',
  'hedge',
  'lamp',
  'snow',
  'ash',
  'lava',
  'graves',
  // Caves
  'caveFloor',
  'caveWall',
  'caveRock',
  'ladderUp',
  'ladderDown',
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
  'statue',
  'pillar',
  'arenaFloor',
  'void',
] as const

export type TerrainKind = (typeof TERRAIN_KINDS)[number]

export interface TerrainInfo {
  /** Can be walked onto. */
  walk: boolean
  /** Can be crossed while swimming. */
  swim?: boolean
  /** Which encounter table stepping here rolls against. */
  encounter?: 'grass' | 'water' | 'cave'
  /** A one-way ledge: moving this way onto it hops down past it. */
  ledge?: Dir
  /** Drawn over the lower half of whoever stands in it (tall grass). */
  overlay?: boolean
  /** Talking to it reads the map's sign text. */
  readable?: boolean
  /** Fishing works facing it. */
  fish?: boolean
  /** CHOP clears it. */
  cut?: boolean
  /** A PC to use. */
  pc?: boolean
}

export const TERRAIN: Readonly<Record<TerrainKind, TerrainInfo>> = {
  grass: { walk: true },
  tall: { walk: true, encounter: 'grass', overlay: true },
  flowers: { walk: true },
  path: { walk: true },
  sand: { walk: true },
  water: { walk: false, swim: true, encounter: 'water', fish: true },
  ledgeS: { walk: false, ledge: 'down' },
  ledgeE: { walk: false, ledge: 'right' },
  ledgeW: { walk: false, ledge: 'left' },
  tree: { walk: false },
  bush: { walk: false, cut: true },
  rock: { walk: false },
  fence: { walk: false },
  sign: { walk: false, readable: true },
  mailbox: { walk: false, readable: true },
  stairs: { walk: true },
  bridgeH: { walk: true },
  bridgeV: { walk: true },
  pier: { walk: true },
  caveEntrance: { walk: true },
  hedge: { walk: false },
  lamp: { walk: false },
  snow: { walk: true },
  ash: { walk: true, encounter: 'grass' },
  lava: { walk: false },
  graves: { walk: false, readable: true },
  caveFloor: { walk: true, encounter: 'cave' },
  caveWall: { walk: false },
  caveRock: { walk: false },
  ladderUp: { walk: true },
  ladderDown: { walk: true },
  caveWater: { walk: false, swim: true, encounter: 'water', fish: true },
  floor: { walk: true },
  floorTile: { walk: true },
  wall: { walk: false },
  window: { walk: false },
  mat: { walk: true },
  rug: { walk: true },
  stairsUp: { walk: true },
  stairsDown: { walk: true },
  table: { walk: false },
  bed: { walk: false },
  tv: { walk: false, readable: true },
  bookshelf: { walk: false, readable: true },
  plant: { walk: false },
  counter: { walk: false },
  pc: { walk: false, pc: true },
  healer: { walk: false },
  shelf: { walk: false },
  machine: { walk: false, readable: true },
  crate: { walk: false },
  statue: { walk: false, readable: true },
  pillar: { walk: false },
  arenaFloor: { walk: true },
  void: { walk: false },
}

/** Buildings drawn as one piece over several cells. */
export const BUILDING_KINDS = ['house', 'bigHouse', 'clinic', 'shop', 'lab', 'arena', 'tower', 'store', 'gate', 'hall'] as const
export type BuildingKind = (typeof BUILDING_KINDS)[number]

/** Footprint in cells and where the door is, from the top-left. */
export const BUILDING_SIZE: Readonly<Record<BuildingKind, { w: number; h: number; door: { x: number; y: number } }>> = {
  house: { w: 4, h: 4, door: { x: 1, y: 3 } },
  bigHouse: { w: 6, h: 4, door: { x: 2, y: 3 } },
  clinic: { w: 5, h: 4, door: { x: 2, y: 3 } },
  shop: { w: 4, h: 4, door: { x: 2, y: 3 } },
  lab: { w: 6, h: 4, door: { x: 3, y: 3 } },
  arena: { w: 6, h: 5, door: { x: 3, y: 4 } },
  tower: { w: 4, h: 6, door: { x: 2, y: 5 } },
  store: { w: 6, h: 5, door: { x: 2, y: 4 } },
  gate: { w: 4, h: 3, door: { x: 1, y: 2 } },
  hall: { w: 8, h: 5, door: { x: 4, y: 4 } },
}

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** The legend every map shares; maps may add or override characters. */
export const LEGEND: Readonly<Record<string, TerrainKind>> = {
  '.': 'grass',
  ',': 'tall',
  '*': 'flowers',
  '=': 'path',
  ':': 'sand',
  '~': 'water',
  v: 'ledgeS',
  '>': 'ledgeE',
  '<': 'ledgeW',
  T: 'tree',
  b: 'bush',
  o: 'rock',
  f: 'fence',
  S: 'sign',
  M: 'mailbox',
  '^': 'stairs',
  '-': 'bridgeH',
  '|': 'bridgeV',
  p: 'pier',
  E: 'caveEntrance',
  h: 'hedge',
  i: 'lamp',
  '"': 'snow',
  a: 'ash',
  '%': 'lava',
  g: 'graves',
  _: 'caveFloor',
  W: 'caveWall',
  r: 'caveRock',
  L: 'ladderUp',
  l: 'ladderDown',
  w: 'caveWater',
  x: 'floor',
  X: 'floorTile',
  H: 'wall',
  n: 'window',
  m: 'mat',
  R: 'rug',
  U: 'stairsUp',
  D: 'stairsDown',
  t: 'table',
  B: 'bed',
  V: 'tv',
  K: 'bookshelf',
  Y: 'plant',
  c: 'counter',
  Q: 'pc',
  '+': 'healer',
  s: 'shelf',
  Z: 'machine',
  k: 'crate',
  A: 'statue',
  I: 'pillar',
  F: 'arenaFloor',
  ' ': 'void',
}
