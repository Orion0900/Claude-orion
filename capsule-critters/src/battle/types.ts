/**
 * The battle contract. The engine in src/battle resolves turns and reports
 * what happened as a list of events; the battle scene in src/scenes animates
 * them one by one and asks the player for choices when a prompt comes up.
 * Nothing here touches the DOM, so every rule can be unit tested.
 */
import type { ItemId } from '../data/items'
import type { MoveId, StageKey, StatusId } from '../data/moves'
import type { SpeciesId } from '../data/species'
import type { TypeId } from '../data/types'
import type { Dvs } from './formulas'

export type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'spc'
export type Stats = Record<StatKey, number>

export interface MoveSlot {
  id: MoveId
  pp: number
  /** PP PLUS boosts applied, 0–3. */
  ups: number
}

/**
 * A critter the player owns (party or storage), or a foe's. Plain JSON, so it
 * goes straight into the save file. Max HP and the other stats are derived
 * from species, level, DVs and stat experience whenever needed.
 */
export interface Critter {
  /** Unique id, stable for the life of the critter. */
  uid: string
  species: SpeciesId
  nickname: string | null
  level: number
  /** Total experience earned. */
  xp: number
  /** Current HP; 0 means fainted. */
  hp: number
  status: StatusId | null
  /** Turns of sleep left while asleep. */
  sleep: number
  moves: MoveSlot[]
  /** Determinant values, 0–15. */
  dvs: Dvs
  /** Stat experience earned by battling, 0–65535 each. */
  sx: Stats
  /** The rare colouring. */
  shiny: boolean
  /** Original trainer and their ID number. */
  ot: string
  otId: number
  metLevel: number
  metPlace: string
}

export type BattleKind = 'wild' | 'trainer'

export interface TrainerInfo {
  /** e.g. "HIKER", "ARENA MASTER". */
  className: string
  name: string
  /** Shells (¤) per level of their last critter. */
  prize: number
  /** 'basic' picks sensible moves; 'smart' also heals with items. */
  ai: 'basic' | 'smart'
  /** Healing items the trainer may use, each once. */
  items?: ItemId[]
  /** Said when the player wins, before the prize. */
  loseText: string
}

/** What the player's bag looks like to the battle. */
export interface BattleBag {
  count(id: ItemId): number
  remove(id: ItemId, n?: number): void
}

export interface BattleSetup {
  kind: BattleKind
  playerName: string
  /** The player's party, in order. The engine mutates these objects. */
  party: Critter[]
  bag: BattleBag
  /** The foe's party: one critter for a wild battle. */
  foes: Critter[]
  trainer?: TrainerInfo
  /** No running (the legends). */
  noRun?: boolean
  /** The SHARE CHARM: experience for the whole party. */
  shareCharm?: boolean
  /** The player's money, so a loss can say what was dropped. */
  playerMoney?: number
  seed: number
}

export type Side = 'player' | 'foe'

/** What the HUD shows for one critter. */
export interface CritterView {
  species: SpeciesId
  name: string
  level: number
  hp: number
  maxHp: number
  status: StatusId | null
  shiny: boolean
  types: readonly TypeId[]
  /** Progress through the current level, 0–1. */
  xpFraction: number
}

export type BattleEvent =
  /** A line of text to read. */
  | { t: 'msg'; text: string }
  /** A critter appears: from a capsule, or (wild) already there. */
  | { t: 'send'; side: Side; partyIndex: number; view: CritterView }
  /** A critter is called back into its capsule. */
  | { t: 'recall'; side: Side }
  /** The active critter on `side` uses a move: animate it. */
  | { t: 'move'; side: Side; move: MoveId }
  /** HP slides from `from` to `to`. `eff`/`crit` are set for damage from a move. */
  | { t: 'hp'; side: Side; from: number; to: number; maxHp: number; eff?: number; crit?: boolean }
  | { t: 'miss'; side: Side }
  | { t: 'status'; side: Side; status: StatusId | null }
  | { t: 'stat'; side: Side; stat: StageKey; delta: number }
  /** A charging or flying critter vanishes or comes back. */
  | { t: 'hide'; side: Side; hidden: boolean }
  | { t: 'faint'; side: Side }
  /** The XP bar fills from `from` to `to` (fractions of `level`). */
  | { t: 'xp'; partyIndex: number; from: number; to: number; level: number }
  | { t: 'level'; partyIndex: number; level: number; before: Stats; after: Stats }
  | { t: 'learned'; partyIndex: number; move: MoveId }
  /** A capsule flies: it shakes `shakes` times then catches or bursts open. */
  | { t: 'capsule'; item: ItemId; shakes: number; caught: boolean }
  /** An item was used. */
  | { t: 'item'; side: Side; item: ItemId }
  /** The trainer's party, shown as capsules: true for each critter still able to fight. */
  | { t: 'trainerParty'; side: Side; alive: boolean[] }
  | { t: 'prompt'; prompt: Prompt }

export type Outcome = 'win' | 'lose' | 'fled' | 'caught'

export type Prompt =
  /** FIGHT / ITEM / CRITTERS / RUN. */
  | { kind: 'action' }
  /** Pick a party critter to send in. `forced` after a faint. */
  | { kind: 'switch'; forced: boolean }
  /** A critter with four moves wants to learn `move`. */
  | { kind: 'learn'; partyIndex: number; move: MoveId }
  /**
   * The battle is over. `money` is won (or, negative, lost). `caught` is the
   * new critter. `leveled` lists party indexes that levelled up, to check
   * for evolution afterwards.
   */
  | { kind: 'end'; outcome: Outcome; money: number; caught?: Critter; leveled: number[] }

export type Choice =
  | { kind: 'move'; slot: number }
  | { kind: 'switch'; partyIndex: number }
  /** `partyIndex` targets medicine; `moveSlot` the move for MINT TEA. Capsules target the foe. */
  | { kind: 'item'; item: ItemId; partyIndex?: number; moveSlot?: number }
  | { kind: 'run' }
  /** Answer to 'learn': forget the move in this slot, or null to give up. */
  | { kind: 'learn'; forgetSlot: number | null }

export interface MoveView {
  id: MoveId
  name: string
  type: TypeId
  pp: number
  maxPp: number
}

export interface BattleViewState {
  player: CritterView
  foe: CritterView
  /** The player's active party index. */
  active: number
  moves: MoveView[]
  canRun: boolean
  canCatch: boolean
  /** The player's critter is locked into a move (charging, recharging, rampaging). */
  locked: boolean
}

export interface BattleApi {
  start(): BattleEvent[]
  choose(choice: Choice): BattleEvent[]
  view(): BattleViewState
}
