/**
 * Cutscenes and NPC behaviour are async scripts that read top to bottom:
 *
 *   async (s) => {
 *     await s.say('Hey! Wait up!')
 *     await s.walk('rival', 'd3l1')
 *     if (await s.battle(RIVAL_1) === 'win') s.set('beatRival1')
 *   }
 *
 * The overworld provides the context; this file holds the contract and the
 * little route language for walking.
 */
import type { TrackId, SfxId, JingleId } from '../audio/api'
import type { Outcome } from '../battle/types'
import type { ItemId } from '../data/items'
import type { SpeciesId } from '../data/species'
import type { Game } from '../game/Game'
import type { Facing, SaveData } from '../game/state'
import type { Actor } from './Actor'
import type { TrainerDef } from './mapTypes'
import type { Dir } from './terrain'

/** Who a script line acts on: the player, or an NPC by id. */
export type Who = 'player' | string

export interface WildOptions {
  /** No running away. */
  noRun?: boolean
  music?: TrackId
}

export interface ScriptCtx {
  readonly game: Game
  readonly save: SaveData
  say(text: string): Promise<void>
  ask(text: string, careful?: boolean): Promise<boolean>
  choose(items: readonly string[], prompt?: string): Promise<number>
  wait(frames: number): Promise<void>
  /** Walks along a route like 'u3r2' (up 3, right 2). */
  walk(who: Who, route: string, run?: boolean): Promise<void>
  face(who: Who, dir: Facing): void
  /** Turns an NPC and the player toward each other. */
  faceEachOther(who: Who): void
  actor(who: Who): Actor | null
  /** Shows a hidden NPC at (x, y), or hides one. */
  show(id: string, x?: number, y?: number, face?: Facing): void
  hide(id: string): void
  /** The "!" over someone's head. */
  emote(who: Who): Promise<void>
  battle(t: TrainerDef): Promise<'win' | 'lose'>
  wild(species: SpeciesId, level: number, o?: WildOptions): Promise<Outcome>
  /** Gives an item with the found-it jingle; false if the bag is somehow full. */
  give(item: ItemId, qty?: number, quiet?: boolean): Promise<void>
  /** Gives a critter (to the party, or the PC if it's full). */
  giveCritter(species: SpeciesId, level: number, nickname?: boolean): Promise<boolean>
  /** Heals the party with the healing jingle. */
  heal(): Promise<void>
  flag(name: string): boolean
  set(name: string): void
  clear(name: string): void
  warp(map: string, x: number, y: number, face?: Facing): Promise<void>
  music(id: TrackId): void
  jingle(id: JingleId): Promise<void>
  sfx(id: SfxId): void
  fadeOut(white?: boolean): Promise<void>
  fadeIn(): Promise<void>
  /** Brings NPC visibility up to date with flags. */
  refresh(): void
}

export type Script = (s: ScriptCtx) => Promise<void>

/** Parses a route like 'u3r2d' into directions, one per step. */
export function parseRoute(route: string): Dir[] {
  const out: Dir[] = []
  const re = /([udlr])(\d*)/g
  const names: Record<string, Dir> = { u: 'up', d: 'down', l: 'left', r: 'right' }
  let m: RegExpExecArray | null
  let consumed = 0
  while ((m = re.exec(route))) {
    if (m.index !== consumed) throw new Error(`bad route "${route}"`)
    consumed = m.index + m[0].length
    const n = m[2] === '' ? 1 : Number(m[2])
    for (let i = 0; i < n; i++) out.push(names[m[1]])
  }
  if (consumed !== route.length) throw new Error(`bad route "${route}"`)
  return out
}
