import type { Facing } from '../art/look'
import type { EmoteKind } from '../art/world'
import type { JingleId, SfxId, TrackId } from '../audio/api'
import type { Outcome } from '../battle/types'
import type { SpeciesId } from '../data/dex'
import type { ItemId } from '../data/items'
import type { Game } from '../game/Game'
import type { SaveData } from '../game/state'
import type { Actor } from './Actor'
import type { TrainerDef } from './mapTypes'

/**
 * A cutscene or conversation: an async function that drives the overworld
 * through a ScriptCtx. While one runs, the player can't move.
 */
export type Script = (s: ScriptCtx) => Promise<void>

export interface WildOptions {
  shiny?: boolean
  noRun?: boolean
  music?: TrackId
}

/** What a script can do. Text may use {PLAYER} and {RIVAL}. */
export interface ScriptCtx {
  readonly game: Game
  readonly save: SaveData
  readonly player: Actor
  /** A person on the current map, by id. */
  npc(id: string): Actor
  say(text: string): Promise<void>
  ask(text: string): Promise<boolean>
  /** A menu of options with a prompt; returns the index (or `cancel` on B). */
  choose(prompt: string, items: readonly string[], cancel?: number | null): Promise<number>
  /**
   * Walks an actor along a path such as "uu3rd": letters u/d/l/r, each
   * optionally followed by a count. Scripts are trusted: no collision.
   */
  walk(actor: Actor, path: string, run?: boolean): Promise<void>
  face(actor: Actor, dir: Facing): void
  /** Turns two actors toward each other. */
  faceEach(a: Actor, b: Actor): void
  emote(actor: Actor, kind: EmoteKind): Promise<void>
  wait(frames: number): Promise<void>
  flag(f: string): boolean
  setFlag(f: string): void
  /** Gives an item with the fanfare and "{PLAYER} received X!". */
  give(item: ItemId, qty?: number): Promise<void>
  /** Gives a beast at a level: to the party, or storage if full. */
  giveBeast(species: SpeciesId, level: number, place?: string): Promise<void>
  /** Restores the whole party. */
  heal(): void
  /** A trainer battle; resolves true on a win. Losing blacks out and returns false. */
  battle(trainer: TrainerDef, npc?: Actor): Promise<boolean>
  wild(species: SpeciesId, level: number, o?: WildOptions): Promise<Outcome>
  music(id: TrackId | null): void
  sfx(id: SfxId): void
  jingle(id: JingleId): Promise<void>
  warp(map: string, x: number, y: number, face?: Facing): Promise<void>
  /** Hides or shows a person (they stay hidden until the map reloads). */
  hide(actor: Actor): void
  show(actor: Actor): void
  money(delta: number): void
}

/** Replaces {PLAYER} and {RIVAL} in dialog. */
export function fillText(text: string, save: SaveData | null): string {
  return text.replaceAll('{PLAYER}', save?.name ?? 'YOU').replaceAll('{RIVAL}', RIVAL_NAME)
}

export const RIVAL_NAME = 'SKYE'

/** Parses "uu3rd" into single steps. */
export function parsePath(path: string): Facing[] {
  const out: Facing[] = []
  const map: Record<string, Facing> = { u: 'up', d: 'down', l: 'left', r: 'right' }
  let i = 0
  while (i < path.length) {
    const ch = path[i++]
    const dir = map[ch.toLowerCase()]
    if (!dir) continue
    let num = ''
    while (i < path.length && /[0-9]/.test(path[i])) num += path[i++]
    const n = num ? parseInt(num, 10) : 1
    for (let k = 0; k < n; k++) out.push(dir)
  }
  return out
}

/** The way back along a path: "ul5" becomes "rrrrrd". */
export function reversePath(path: string): string {
  const back: Record<Facing, string> = { up: 'd', down: 'u', left: 'r', right: 'l' }
  return parsePath(path)
    .reverse()
    .map((d) => back[d])
    .join('')
}
