/**
 * World art: the public face of src/art/world. Tiles, buildings, people, the
 * battle stage and the small sprites around them, all generated in code.
 *
 * CONTRACT — the rest of the game calls only these functions. Every function
 * is pure and deterministic (same arguments, same pixels), so the engine can
 * cache results.
 */
import type { Pixels } from '../../core/pixels'
import type { ItemId } from '../../data/items'
import type { BuildingKind, TerrainKind } from '../../world/terrain'
import type { Facing, Look } from '../look'
import { drawTile, framesOf, overlayOf } from './tiles'
import { person } from './people'
import { building } from './buildings'
import { background, platform } from './battle'
import { emote as drawEmote, fieldEffect as drawEffect, groundItem, orb } from './sprites'
import { icon } from './icons'
import { back, portrait } from './portrait'
import { surf } from './surf'
import { title } from './title'

export const TILE = 16

/** Neighbour order for `terrainTile`: N, NE, E, SE, S, SW, W, NW. Null is off the map. */
export type Neighbors = readonly (TerrainKind | null)[]

/** How many animation frames a terrain kind cycles through (1 = still). */
export function terrainFrames(kind: TerrainKind): number {
  return framesOf(kind)
}

/**
 * One 16×16 map cell, fully opaque. `n` gives the eight neighbours so edges
 * can blend (shorelines, path borders, cliff rims, fence runs). (x, y) is the
 * cell's map position, for deterministic variety such as the odd flower or
 * pebble. `frame` is in [0, terrainFrames(kind)).
 */
export function terrainTile(kind: TerrainKind, n: Neighbors, x: number, y: number, frame: number): Pixels {
  return drawTile(kind, n, x, y, frame)
}

/**
 * What is drawn over a character standing on this cell — the front blades
 * of tall grass. 16×16 with transparency, or null when nothing overlaps.
 */
export function terrainOverlay(kind: TerrainKind, frame: number): Pixels | null {
  return overlayOf(kind, frame)
}

/**
 * A building, BUILDING_SIZE[kind].w×16 by .h×16, with transparency where the
 * ground shows through. `variant` picks a roof colour for houses and huts
 * (0 red, 1 blue, 2 green, 3 violet) and the Warden for halls (0 stone,
 * 1 volt, 2 tide).
 */
export function buildingSprite(kind: BuildingKind, variant: number): Pixels {
  return building(kind, variant)
}

/**
 * An overworld person, 16×32, transparent, feet on the bottom row, drawn to
 * stand on one 16×16 cell with the head reaching into the cell above.
 * Frames: 0 standing, 1 left foot forward, 2 right foot forward.
 */
export function characterSprite(look: Look, facing: Facing, frame: 0 | 1 | 2): Pixels {
  return person(look, facing, frame)
}

/** The player riding a generic sea beast while surfing, 32×32, frames 0–1 bob. */
export function surfSprite(look: Look, facing: Facing, frame: 0 | 1): Pixels {
  return surf(look, facing, frame)
}

/** A trainer's 64×64 battle portrait, facing the player, from the waist up or full body. */
export function trainerPortrait(look: Look): Pixels {
  return portrait(look)
}

/**
 * The player seen from behind at the start of a battle, 64×64: frame 0
 * standing, 1–3 winding up and throwing an orb.
 */
export function playerBack(look: Look, frame: 0 | 1 | 2 | 3): Pixels {
  return back(look, frame)
}

export type EmoteKind = 'exclaim' | 'question' | 'heart' | 'note' | 'dots' | 'angry'

/** A 16×16 speech-bubble icon shown above a character's head. */
export function emote(kind: EmoteKind): Pixels {
  return drawEmote(kind)
}

export type FieldEffect = 'grassRustle' | 'splash' | 'shadow' | 'dust' | 'ripple' | 'sparkle'

/** Small overworld effects, 16×16: grass shaking, water splash, jump shadow. */
export function fieldEffect(kind: FieldEffect, frame: number): Pixels {
  return drawEffect(kind, frame)
}

export const FIELD_EFFECT_FRAMES: Record<FieldEffect, number> = {
  grassRustle: 3,
  splash: 3,
  shadow: 1,
  dust: 3,
  ripple: 3,
  sparkle: 4,
}

export type BattleBg = 'grass' | 'cave' | 'beach' | 'water' | 'indoor' | 'wreck' | 'night'

/** The battle backdrop behind both beasts, 240×112, fully opaque. */
export function battleBackground(kind: BattleBg): Pixels {
  return background(kind)
}

/**
 * The oval ground a beast stands on, transparent around it: 128×32 for the
 * player's side, 96×24 for the foe's.
 */
export function battlePlatform(kind: BattleBg, side: 'player' | 'foe'): Pixels {
  return platform(kind, side)
}

export type OrbKind = 'orb' | 'superOrb' | 'hyperOrb' | 'tideOrb' | 'duskOrb'

/**
 * A capture orb, 16×16. Frames: 0 closed, 1 opening (burst), 2 tilted left,
 * 3 tilted right, 4 caught (dimmed, with a click star).
 */
export function orbSprite(kind: OrbKind, frame: 0 | 1 | 2 | 3 | 4): Pixels {
  return orb(kind, frame)
}

/** A 24×24 bag icon for an item. */
export function itemIcon(id: ItemId): Pixels {
  return icon(id)
}

/** The item ball lying on the ground in the overworld, 16×16. */
export function groundItemSprite(): Pixels {
  return groundItem()
}

/**
 * Title screen art: `logo` is the TIDEBOUND wordmark (at most 224×64,
 * transparent) and `backdrop` a 240×160 opaque seascape behind it.
 */
export function titleArt(): { logo: Pixels; backdrop: Pixels } {
  return title()
}
