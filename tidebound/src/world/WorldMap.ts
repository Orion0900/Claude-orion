import { BUILDING_SIZE, TERRAIN, type Dir, type TerrainKind } from './terrain'
import type { BuildingDef, MapDef, Side, WarpDef } from './mapTypes'

/** The legend every map shares; maps may add or override characters. */
export const LEGEND: Readonly<Record<string, TerrainKind>> = {
  '.': 'grass',
  ',': 'tallgrass',
  '*': 'flowers',
  '=': 'path',
  ':': 'sand',
  '~': 'water',
  v: 'ledgeS',
  '>': 'ledgeE',
  '<': 'ledgeW',
  T: 'tree',
  P: 'palm',
  b: 'bush',
  o: 'rock',
  f: 'fence',
  S: 'sign',
  M: 'mailbox',
  C: 'cliff',
  '^': 'stairs',
  '-': 'bridgeH',
  '|': 'bridgeV',
  p: 'pier',
  O: 'waterRock',
  E: 'caveEntrance',
  _: 'caveFloor',
  W: 'caveWall',
  r: 'caveRock',
  L: 'caveLadder',
  w: 'caveWater',
  x: 'floor',
  X: 'floorTile',
  H: 'wall',
  h: 'window',
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
  n: 'barrel',
  A: 'statue',
  ' ': 'void',
  d: 'deck',
  l: 'hull',
}

export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
}

export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' }

/** One map, parsed: terrain per cell, building footprints, doors and warps. */
export class WorldMap {
  readonly w: number
  readonly h: number
  private readonly cells: TerrainKind[]
  /** Building index + 1 covering each cell, 0 for none. */
  private readonly covered: Int16Array

  constructor(readonly def: MapDef) {
    this.h = def.rows.length
    this.w = def.rows[0]?.length ?? 0
    const legend = { ...LEGEND, ...(def.legend ?? {}) }
    this.cells = []
    def.rows.forEach((row, y) => {
      if (row.length !== this.w) throw new Error(`${def.id}: row ${y} is ${row.length} wide, expected ${this.w}`)
      for (const ch of row) {
        const kind = legend[ch]
        if (!kind) throw new Error(`${def.id}: unknown map character '${ch}' in row ${y}`)
        this.cells.push(kind)
      }
    })
    this.covered = new Int16Array(this.w * this.h)
    ;(def.buildings ?? []).forEach((b, i) => {
      const size = BUILDING_SIZE[b.kind]
      for (let y = b.y; y < b.y + size.h; y++)
        for (let x = b.x; x < b.x + size.w; x++) if (this.inside(x, y)) this.covered[y * this.w + x] = i + 1
    })
  }

  get id(): string {
    return this.def.id
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h
  }

  /** Terrain at a cell, or null off the map. */
  kind(x: number, y: number): TerrainKind | null {
    return this.inside(x, y) ? this.cells[y * this.w + x] : null
  }

  building(x: number, y: number): BuildingDef | null {
    if (!this.inside(x, y)) return null
    const i = this.covered[y * this.w + x]
    return i ? this.def.buildings![i - 1] : null
  }

  /** The building whose door is at this cell. */
  doorAt(x: number, y: number): BuildingDef | null {
    const b = this.building(x, y)
    if (!b) return null
    const d = BUILDING_SIZE[b.kind].door
    return b.x + d.x === x && b.y + d.y === y ? b : null
  }

  warpAt(x: number, y: number): WarpDef | null {
    return this.def.warps?.find((w) => w.x === x && w.y === y) ?? null
  }

  /** Solid for walking: terrain that can't be walked on, or a building (doors included). */
  solid(x: number, y: number): boolean {
    const k = this.kind(x, y)
    if (k === null) return true
    if (this.building(x, y)) return true
    return !TERRAIN[k].walk
  }
}

/** Where a cell in one map's coordinates really lives, following connections. */
export interface Located {
  map: WorldMap
  x: number
  y: number
}

/**
 * All maps, and the seams between them. Coordinates outside a map resolve
 * into whichever connected map covers them, so movement and drawing can
 * cross edges without a loading screen.
 */
export class World {
  private readonly maps = new Map<string, WorldMap>()

  constructor(private readonly defs: ReadonlyMap<string, MapDef>) {}

  map(id: string): WorldMap {
    let m = this.maps.get(id)
    if (!m) {
      const def = this.defs.get(id)
      if (!def) throw new Error(`unknown map ${id}`)
      m = new WorldMap(def)
      this.maps.set(id, m)
    }
    return m
  }

  has(id: string): boolean {
    return this.defs.has(id)
  }

  /** The connected map on `side` and its origin in `from`'s coordinates. */
  neighbor(from: WorldMap, side: Side): { map: WorldMap; ox: number; oy: number } | null {
    const c = from.def.connections?.[side]
    if (!c || !this.defs.has(c.map)) return null
    const m = this.map(c.map)
    switch (side) {
      case 'north':
        return { map: m, ox: c.offset, oy: -m.h }
      case 'south':
        return { map: m, ox: c.offset, oy: from.h }
      case 'west':
        return { map: m, ox: -m.w, oy: c.offset }
      case 'east':
        return { map: m, ox: from.w, oy: c.offset }
    }
  }

  /** Resolves (x, y) in `from`'s coordinates to the map that owns it, or null (border). */
  locate(from: WorldMap, x: number, y: number): Located | null {
    if (from.inside(x, y)) return { map: from, x, y }
    const side: Side | null = y < 0 ? 'north' : y >= from.h ? 'south' : x < 0 ? 'west' : x >= from.w ? 'east' : null
    if (!side) return null
    const n = this.neighbor(from, side)
    if (!n) return null
    const lx = x - n.ox
    const ly = y - n.oy
    return n.map.inside(lx, ly) ? { map: n.map, x: lx, y: ly } : null
  }

  /** Terrain at (x, y) in `from`'s coordinates, with the border beyond any edge. */
  kindAt(from: WorldMap, x: number, y: number): TerrainKind {
    const at = this.locate(from, x, y)
    return at ? (at.map.kind(at.x, at.y) as TerrainKind) : from.def.border
  }
}
