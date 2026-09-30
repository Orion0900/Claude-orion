/**
 * Every piece of art the game draws goes through here: it memoises the
 * generated pixels so each sprite is made once, and if a generator ever
 * throws it hands back a plain placeholder instead of crashing the game.
 */
import { createPixels, fillRect, hex, type Pixels } from '../core/pixels'
import * as creatures from '../art/creatures'
import * as world from '../art/world'
import type { Facing, Look } from '../art/look'
import type { SpeciesId } from '../data/dex'
import { dex } from '../data/dex'
import type { ItemId } from '../data/items'
import type { BuildingKind, TerrainKind } from '../world/terrain'
import { BUILDING_SIZE } from '../world/terrain'

const memo = new Map<string, Pixels | null>()
let failures = 0

function cached(key: string, make: () => Pixels | null, fallback: () => Pixels | null): Pixels | null {
  if (memo.has(key)) return memo.get(key)!
  let p: Pixels | null
  try {
    p = make()
  } catch (e) {
    if (failures++ < 5) console.warn(`art: ${key} failed, using a placeholder`, e)
    p = fallback()
  }
  memo.set(key, p)
  return p
}

function box(w: number, h: number, color: string, border = '#303030'): Pixels {
  const p = createPixels(w, h)
  fillRect(p, 0, 0, w, h, hex(border))
  fillRect(p, 1, 1, w - 2, h - 2, hex(color))
  return p
}

const PLACEHOLDER_TILE: Partial<Record<TerrainKind, string>> = {
  grass: '#68c050',
  tallgrass: '#3c9838',
  flowers: '#78c858',
  path: '#e0c890',
  sand: '#f4e4a8',
  water: '#4890f0',
  caveWater: '#3870c0',
  tree: '#306830',
  palm: '#48a040',
  caveFloor: '#a08868',
  caveWall: '#584838',
  floor: '#c8a070',
  floorTile: '#e0e0d8',
  wall: '#a8b8c8',
  void: '#000000',
  deck: '#907048',
  hull: '#503820',
}

function key(look: Look): string {
  return JSON.stringify(look)
}

export const Art = {
  /** One map cell, not memoised: maps bake these once into a canvas. */
  tile(kind: TerrainKind, n: world.Neighbors, x: number, y: number, frame: number): Pixels {
    try {
      return world.terrainTile(kind, n, x, y, frame)
    } catch (e) {
      if (failures++ < 5) console.warn(`art: tile ${kind} failed, using a placeholder`, e)
      const p = createPixels(16, 16)
      fillRect(p, 0, 0, 16, 16, hex(PLACEHOLDER_TILE[kind] ?? '#b0b0b0'))
      return p
    }
  },

  /**
   * A memoised tile for cells drawn every frame (the border, animated water),
   * where x and y only vary the pattern, so a few variants cover every cell.
   */
  tileLoose(kind: TerrainKind, n: world.Neighbors, x: number, y: number, frame: number): Pixels {
    const lx = x & 3
    const ly = y & 3
    return cached(`t:${kind}:${n.join(',')}:${lx}:${ly}:${frame}`, () => Art.tile(kind, n, lx, ly, frame), () => null)!
  },

  frames(kind: TerrainKind): number {
    try {
      return Math.max(1, world.terrainFrames(kind))
    } catch {
      return 1
    }
  },

  overlay(kind: TerrainKind, frame: number): Pixels | null {
    return cached(`o:${kind}:${frame}`, () => world.terrainOverlay(kind, frame), () => null)
  },

  building(kind: BuildingKind, variant: number): Pixels {
    return cached(
      `b:${kind}:${variant}`,
      () => world.buildingSprite(kind, variant),
      () => box(BUILDING_SIZE[kind].w * 16, BUILDING_SIZE[kind].h * 16, '#d8c0a0'),
    )!
  },

  person(look: Look, facing: Facing, frame: 0 | 1 | 2): Pixels {
    return cached(
      `p:${key(look)}:${facing}:${frame}`,
      () => world.characterSprite(look, facing, frame),
      () => box(14, 24, look.top),
    )!
  },

  surf(look: Look, facing: Facing, frame: 0 | 1): Pixels {
    return cached(`s:${key(look)}:${facing}:${frame}`, () => world.surfSprite(look, facing, frame), () => box(28, 20, '#58a0e8'))!
  },

  portrait(look: Look): Pixels {
    return cached(`tp:${key(look)}`, () => world.trainerPortrait(look), () => box(40, 60, look.top))!
  },

  playerBack(look: Look, frame: 0 | 1 | 2 | 3): Pixels {
    return cached(`pb:${key(look)}:${frame}`, () => world.playerBack(look, frame), () => box(48, 56, look.top))!
  },

  emote(kind: world.EmoteKind): Pixels {
    return cached(`e:${kind}`, () => world.emote(kind), () => box(10, 12, '#ffffff'))!
  },

  effect(kind: world.FieldEffect, frame: number): Pixels | null {
    return cached(`fx:${kind}:${frame}`, () => world.fieldEffect(kind, frame), () => null)
  },

  battleBg(kind: world.BattleBg): Pixels {
    return cached(
      `bg:${kind}`,
      () => world.battleBackground(kind),
      () => {
        const p = createPixels(240, 112)
        fillRect(p, 0, 0, 240, 112, hex('#c8e8f8'))
        fillRect(p, 0, 70, 240, 42, hex('#a8d890'))
        return p
      },
    )!
  },

  platform(kind: world.BattleBg, side: 'player' | 'foe'): Pixels {
    return cached(`pf:${kind}:${side}`, () => world.battlePlatform(kind, side), () => box(side === 'player' ? 128 : 96, side === 'player' ? 32 : 24, '#88c070'))!
  },

  orb(kind: world.OrbKind, frame: 0 | 1 | 2 | 3 | 4): Pixels {
    return cached(`orb:${kind}:${frame}`, () => world.orbSprite(kind, frame), () => box(10, 10, '#e04040'))!
  },

  item(id: ItemId): Pixels {
    return cached(`it:${id}`, () => world.itemIcon(id), () => box(20, 20, '#f0d060'))!
  },

  groundItem(): Pixels {
    return cached('gi', () => world.groundItemSprite(), () => box(12, 12, '#e04040'))!
  },

  title(): { logo: Pixels; backdrop: Pixels } {
    let t: { logo: Pixels; backdrop: Pixels } | null = null
    const logo = cached(
      'title-logo',
      () => (t ??= world.titleArt()).logo,
      () => box(160, 40, '#2868c8'),
    )!
    const backdrop = cached(
      'title-bg',
      () => (t ??= world.titleArt()).backdrop,
      () => {
        const p = createPixels(240, 160)
        fillRect(p, 0, 0, 240, 90, hex('#88c8f8'))
        fillRect(p, 0, 90, 240, 70, hex('#2868c8'))
        return p
      },
    )!
    return { logo, backdrop }
  },

  front(id: SpeciesId, shiny = false): Pixels {
    return cached(`cf:${id}:${shiny}`, () => creatures.creatureFront(id, shiny), () => beastPlaceholder(id, 44))!
  },

  back(id: SpeciesId, shiny = false): Pixels {
    return cached(`cb:${id}:${shiny}`, () => creatures.creatureBack(id, shiny), () => beastPlaceholder(id, 52))!
  },

  icon(id: SpeciesId, frame: 0 | 1): Pixels {
    return cached(`ci:${id}:${frame}`, () => creatures.creatureIcon(id, frame), () => beastPlaceholder(id, 20, 32))!
  },
}

function beastPlaceholder(id: SpeciesId, size: number, frame = 64): Pixels {
  const p = createPixels(frame, frame)
  const colors = dex(id).colors
  const o = Math.floor((frame - size) / 2)
  fillRect(p, o, frame - size - 2, size, size, hex('#303030'))
  fillRect(p, o + 1, frame - size - 1, size - 2, size - 2, hex(colors[1] ?? '#c0c0c0'))
  return p
}

/**
 * Draws every beast's sprites a few at a time while the game idles, so the
 * first sight of one in battle doesn't stall a frame. `first` go to the
 * front of the queue (the party, the beasts on this map).
 */
export function warmUpCreatures(ids: readonly SpeciesId[], first: readonly SpeciesId[] = []): void {
  const queue = [...new Set([...first, ...ids])]
  const step = () => {
    const id = queue.shift()
    if (!id) return
    Art.front(id)
    Art.back(id)
    Art.icon(id, 0)
    Art.icon(id, 1)
    schedule(step)
  }
  schedule(step)
}

function schedule(f: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback
  if (ric) ric(f, { timeout: 500 })
  else setTimeout(f, 16)
}
