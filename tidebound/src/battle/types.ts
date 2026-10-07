/**
 * The battle contract. The engine in src/battle resolves turns and reports
 * what happened as a list of events; the battle scene in src/scenes animates
 * those events one by one and asks the player for choices when a prompt
 * comes up. Nothing here touches the DOM, so every rule can be unit tested.
 */
import type { SpeciesId } from '../data/dex'
import type { ItemId } from '../data/items'
import type { TypeId } from '../data/types'

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export type Stats = Record<StatKey, number>

/** Stats that battle stages can raise or lower, plus accuracy and evasion. */
export type StageKey = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'acc' | 'eva'

/** Poison, bad poison, burn, paralysis, sleep, freeze. */
export type StatusId = 'psn' | 'tox' | 'brn' | 'par' | 'slp' | 'frz'

/** Move ids are defined in src/data/moves.ts. */
export type MoveId = string

export interface MoveSlot {
  id: MoveId
  pp: number
}

/**
 * A beast the player owns (party or storage), or a foe's. Plain JSON, so it
 * goes straight into the save file. Max HP and the other stats are derived
 * from species, level, IVs, effort and nature whenever needed (see calcStats).
 */
export interface Creature {
  /** Unique id, stable for the life of the beast. */
  uid: string
  species: SpeciesId
  nickname: string | null
  level: number
  /** Total experience earned. */
  xp: number
  /** Current HP; 0 means fainted. */
  hp: number
  status: StatusId | null
  /** Turns of sleep left while status is 'slp'. */
  sleepTurns: number
  /** One to four moves. */
  moves: MoveSlot[]
  /** Individual values, 0–31 each. */
  ivs: Stats
  /** Effort points earned by battling, 0–255 each and 510 in all. */
  evs: Stats
  /** The item it holds, if any. */
  item: ItemId | null
  shiny: boolean
  /** Original trainer's name. */
  ot: string
  metLevel: number
  /** Where it was caught or received, e.g. "ROUTE 1". */
  metPlace: string
}

export type BattleKind = 'wild' | 'trainer'

export interface TrainerInfo {
  /** e.g. "SAILOR", "WARDEN", "RIVAL". */
  className: string
  /** e.g. "HECTOR". */
  name: string
  /** Shells paid out on a win; the UI shows it. */
  prize: number
  /** 'basic' picks sensibly; 'smart' also uses items and status moves well. */
  ai: 'basic' | 'smart'
  /** Healing items the trainer may use, each once. */
  items?: ItemId[]
  /** Said when the player wins, shown in battle before the prize. */
  loseText: string
}

/** What the player's bag looks like to the battle: counts in, removals out. */
export interface BattleBag {
  count(id: ItemId): number
  remove(id: ItemId, n?: number): void
}

export interface BattleSetup {
  kind: BattleKind
  playerName: string
  /** The player's party, in order. The engine mutates these objects in place. */
  party: Creature[]
  bag: BattleBag
  /** The foe's party: one beast for a wild battle. */
  foes: Creature[]
  trainer?: TrainerInfo
  /** Orbs get the dark-place bonus here (caves, the wreck, night). */
  dark?: boolean
  /** Some battles can't be run from even when wild (the legendary). */
  noRun?: boolean
  /** Seed for every roll in this battle. */
  seed: number
  /**
   * The player's shells before the battle (optional). When given, a loss
   * reports −⌊playerMoney/2⌋ as the end prompt's `money` and the engine says
   * "…has no beasts left…" and "…dropped ¤N…" itself; the caller still
   * applies the money. When absent, a loss reports 0 with no text, and the
   * caller tells the blackout its own way.
   */
  playerMoney?: number
}

export type Side = 'player' | 'foe'

/** Weather on the field: rain powers up TIDE moves and dampens FLAME; sun does the reverse. */
export type Weather = 'rain' | 'sun'

/** What the HUD shows for one beast. */
export interface CreatureView {
  species: SpeciesId
  name: string
  level: number
  hp: number
  maxHp: number
  status: StatusId | null
  shiny: boolean
  types: readonly TypeId[]
  /** Experience progress through the current level, 0–1. Player side only. */
  xpFraction: number
}

export type Effectiveness = 0 | 0.25 | 0.5 | 1 | 2 | 4

export type BattleEvent =
  /** Show a line of text and wait for the player (or a short beat). */
  | { t: 'msg'; text: string }
  /** A beast comes out: from an orb, or appears (wild). */
  | { t: 'send'; side: Side; partyIndex: number; view: CreatureView }
  /** A beast returns to its orb. */
  | { t: 'recall'; side: Side }
  /** The active beast on `side` uses a move: play its animation. */
  | { t: 'move'; side: Side; move: MoveId }
  /**
   * HP changes on `side`'s active beast: the bar slides from `from` to `to`.
   * `eff` and `crit` are set for damage from a move, to pick the hit sound.
   */
  | { t: 'hp'; side: Side; from: number; to: number; maxHp: number; eff?: Effectiveness; crit?: boolean }
  /** The move missed or failed. */
  | { t: 'miss'; side: Side }
  /** Status set or cleared on `side`'s active beast. */
  | { t: 'status'; side: Side; status: StatusId | null }
  /** A stat stage changed (the arrows animation), `delta` in stages. */
  | { t: 'stat'; side: Side; stat: StageKey; delta: number }
  /** `side`'s active beast faints. */
  | { t: 'faint'; side: Side }
  /** A party beast gains experience: its bar fills from `from` to `to` (0–1 fractions within `level`). */
  | { t: 'xp'; partyIndex: number; from: number; to: number; level: number }
  /** A party beast reached `level`: show the stat window. */
  | { t: 'level'; partyIndex: number; level: number; before: Stats; after: Stats }
  /** A party beast learned a move outright. */
  | { t: 'learned'; partyIndex: number; move: MoveId }
  /** The player throws an orb: it shakes `shakes` times (0–3) then catches or breaks free. */
  | { t: 'orb'; item: ItemId; shakes: number; caught: boolean }
  /** An item was used on a party beast or the foe trainer's beast. */
  | { t: 'item'; side: Side; item: ItemId }
  /** The foe trainer sends out their next beast soon; show the trainer's party balls. */
  | { t: 'trainerParty'; remaining: number }
  /** The weather changed: rain or sun on the field, or clear skies (null). */
  | { t: 'weather'; weather: Weather | null }
  | { t: 'prompt'; prompt: Prompt }

export type Outcome = 'win' | 'lose' | 'fled' | 'caught'

export type Prompt =
  /** Choose FIGHT / BAG / BEASTS / RUN for the active beast. */
  | { kind: 'action' }
  /** Choose a party beast to send in. `forced` after a faint (no cancel). */
  | { kind: 'switch'; forced: boolean }
  /** A beast with four moves wants to learn `move`: choose one to forget, or give up. */
  | { kind: 'learn'; partyIndex: number; move: MoveId }
  /**
   * The battle is over. `money` is shells won (or lost, as a negative, on a
   * loss). `caught` is the new beast when one was caught; the engine never
   * adds it to the party itself. `leveled` lists party indexes that gained a
   * level this battle, to check for evolution afterwards.
   */
  | { kind: 'end'; outcome: Outcome; money: number; caught?: Creature; leveled: number[] }

export type Choice =
  /** Use the move in this slot (0–3). A beast with no PP left struggles. */
  | { kind: 'move'; slot: number }
  /** Send in this party beast (answer to 'action' or 'switch'). */
  | { kind: 'switch'; partyIndex: number }
  /** Use an item from the bag; `partyIndex` targets healing items. Orbs target the foe. */
  | { kind: 'item'; item: ItemId; partyIndex?: number }
  | { kind: 'run' }
  /** Answer to 'learn': forget the move in this slot, or null to not learn. */
  | { kind: 'learn'; forgetSlot: number | null }

/**
 * One battle. `start()` returns the opening events; each `choose()` resolves
 * as far as it can and returns the events up to and including the next
 * prompt. The last event of every batch is a prompt.
 */
export interface BattleApi {
  start(): BattleEvent[]
  choose(choice: Choice): BattleEvent[]
  /** The current state for the HUD and menus (after all events so far). */
  view(): BattleViewState
}

export interface BattleViewState {
  player: CreatureView
  foe: CreatureView
  /** The player's active party index. */
  active: number
  /** Moves of the player's active beast, for the FIGHT menu. */
  moves: { id: MoveId; name: string; type: TypeId; pp: number; maxPp: number }[]
  /** Whether RUN is allowed at all (never in trainer battles). */
  canRun: boolean
  /** Whether orbs may be thrown (wild battles only). */
  canCatch: boolean
}
