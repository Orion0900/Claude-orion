/**
 * Helpers for beasts outside the turn loop: creating them, their stats and
 * experience, learning moves, evolving, healing and using items in the field.
 * Everything that rolls dice takes an Rng, so results replay from a seed.
 */
import type { Rng } from '../core/rng'
import { dex, type SpeciesId } from '../data/dex'
import { item as itemData, type ItemId } from '../data/items'
import { move as moveData } from '../data/moves'
import { species } from '../data/species'
import type { TypeId } from '../data/types'
import { hpStat, MAX_LEVEL, otherStat, xpForLevel } from './formulas'
import type { Creature, CreatureView, MoveId, Stats, StatusId } from './types'

export interface CreateOptions {
  /** Original trainer's name. */
  ot?: string
  /** Where it was caught or received, e.g. "ROUTE 1". */
  metPlace?: string
  /** Force shiny (or not); otherwise 1 in 1024. */
  shiny?: boolean
  nickname?: string | null
  /** A fixed moveset (e.g. a Warden's), instead of the last four learnable moves. */
  moves?: readonly MoveId[]
  /** Fixed IVs for some or all stats, instead of rolls. */
  ivs?: Partial<Stats>
}

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const

function hex6(rng: Rng): string {
  return rng.int(0, 0xffffff).toString(16).padStart(6, '0')
}

/**
 * A new beast at `level`: random IVs, the last four moves it could have
 * learned by that level, full HP and PP, and a 1 in 1024 shiny roll. The
 * rolls are always made in the same order (uid, IVs, shiny), so the same rng
 * state gives the same beast whatever the options.
 */
export function createCreature(id: SpeciesId, level: number, rng: Rng, opts: CreateOptions = {}): Creature {
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)))
  const uid = hex6(rng) + hex6(rng)
  const rolled = {} as Stats
  for (const k of STAT_KEYS) rolled[k] = rng.int(0, 31)
  const shinyRoll = rng.chance(1 / 1024)
  const ivs = { ...rolled }
  for (const k of STAT_KEYS) {
    const v = opts.ivs?.[k]
    if (v !== undefined) ivs[k] = Math.max(0, Math.min(31, Math.floor(v)))
  }
  const c: Creature = {
    uid,
    species: id,
    nickname: opts.nickname ?? null,
    level: lv,
    xp: xpForLevel(species(id).growth, lv),
    hp: 0,
    status: null,
    sleepTurns: 0,
    moves: [],
    ivs,
    shiny: opts.shiny ?? shinyRoll,
    ot: opts.ot ?? '',
    metLevel: lv,
    metPlace: opts.metPlace ?? '',
  }
  const moves = opts.moves && opts.moves.length ? opts.moves.slice(0, 4) : defaultMoves(id, lv)
  c.moves = moves.map((m) => ({ id: m, pp: moveData(m).pp }))
  c.hp = maxHp(c)
  return c
}

/** The last four distinct moves a species learns by `level`, oldest first. */
export function defaultMoves(id: SpeciesId, level: number): MoveId[] {
  const list: MoveId[] = []
  for (const e of species(id).learnset) {
    if (e.level > level) break
    const i = list.indexOf(e.move)
    if (i >= 0) list.splice(i, 1)
    list.push(e.move)
  }
  return list.slice(-4)
}

/** Moves a species learns on reaching exactly `level`. */
export function movesLearnedAt(id: SpeciesId, level: number): MoveId[] {
  const out: MoveId[] = []
  for (const e of species(id).learnset) if (e.level === level && !out.includes(e.move)) out.push(e.move)
  return out
}

/** All six stats from species, level and IVs. */
export function calcStats(c: Creature): Stats {
  const b = species(c.species).base
  return {
    hp: hpStat(b.hp, c.ivs.hp, c.level),
    atk: otherStat(b.atk, c.ivs.atk, c.level),
    def: otherStat(b.def, c.ivs.def, c.level),
    spa: otherStat(b.spa, c.ivs.spa, c.level),
    spd: otherStat(b.spd, c.ivs.spd, c.level),
    spe: otherStat(b.spe, c.ivs.spe, c.level),
  }
}

export function maxHp(c: Creature): number {
  return hpStat(species(c.species).base.hp, c.ivs.hp, c.level)
}

/** Progress through the current level, 0–1 (0 at the level cap). */
export function xpFraction(c: Creature): number {
  if (c.level >= MAX_LEVEL) return 0
  const g = species(c.species).growth
  const lo = xpForLevel(g, c.level)
  const hi = xpForLevel(g, c.level + 1)
  if (hi <= lo) return 0
  return Math.max(0, Math.min(1, (c.xp - lo) / (hi - lo)))
}

/** Experience still needed for the next level (0 at the cap). */
export function xpToNextLevel(c: Creature): number {
  if (c.level >= MAX_LEVEL) return 0
  return Math.max(0, xpForLevel(species(c.species).growth, c.level + 1) - c.xp)
}

export function typesOf(c: Creature): readonly TypeId[] {
  return dex(c.species).types
}

/** The nickname, or the species name. */
export function displayName(c: Creature): string {
  return c.nickname ? c.nickname : dex(c.species).name
}

/** What the battle HUD shows for a beast. */
export function creatureView(c: Creature, withXp = true): CreatureView {
  return {
    species: c.species,
    name: displayName(c),
    level: c.level,
    hp: c.hp,
    maxHp: maxHp(c),
    status: c.status,
    shiny: c.shiny,
    types: typesOf(c),
    xpFraction: withXp ? xpFraction(c) : 0,
  }
}

export interface LevelUp {
  /** The new level. */
  level: number
  before: Stats
  after: Stats
  /** Moves the species learns at this level (not yet learned). */
  moves: MoveId[]
}

/**
 * Raises the level by one. Current HP rises by as much as max HP did (a
 * fainted beast stays at 0). Experience is topped up to the new level's
 * minimum if needed.
 */
export function levelUp(c: Creature): LevelUp {
  const before = calcStats(c)
  if (c.level < MAX_LEVEL) c.level++
  const after = calcStats(c)
  if (c.hp > 0) c.hp = Math.min(after.hp, c.hp + Math.max(0, after.hp - before.hp))
  c.xp = Math.max(c.xp, xpForLevel(species(c.species).growth, c.level))
  return { level: c.level, before, after, moves: movesLearnedAt(c.species, c.level) }
}

/**
 * Adds experience (capped at level 100) and applies every level gained.
 * Moves are not learned here; the caller decides (see learnMove). The battle
 * engine does its own version with events and prompts.
 */
export function giveXp(c: Creature, amount: number): LevelUp[] {
  const ups: LevelUp[] = []
  if (amount <= 0 || c.level >= MAX_LEVEL) return ups
  const g = species(c.species).growth
  c.xp = Math.min(xpForLevel(g, MAX_LEVEL), c.xp + Math.floor(amount))
  while (c.level < MAX_LEVEL && c.xp >= xpForLevel(g, c.level + 1)) ups.push(levelUp(c))
  return ups
}

/**
 * Teaches a move: added when there is room, otherwise it replaces the move
 * in `forgetSlot`. Fails if the move is already known or there is no room.
 */
export function learnMove(c: Creature, id: MoveId, forgetSlot?: number): { ok: boolean; forgot?: MoveId } {
  if (c.moves.some((s) => s.id === id)) return { ok: false }
  const pp = moveData(id).pp
  if (c.moves.length < 4) {
    c.moves.push({ id, pp })
    return { ok: true }
  }
  if (forgetSlot === undefined || !Number.isInteger(forgetSlot) || forgetSlot < 0 || forgetSlot >= c.moves.length) return { ok: false }
  const forgot = c.moves[forgetSlot].id
  c.moves[forgetSlot] = { id, pp }
  return { ok: true, forgot }
}

/** The species this beast is ready to evolve into at its level, or null. */
export function evolutionFor(c: Creature): SpeciesId | null {
  const e = dex(c.species).evolves
  return e && c.level >= e.level ? e.into : null
}

export interface EvolveResult {
  from: SpeciesId
  into: SpeciesId
  /** Moves the new form learns at its current level that it doesn't know yet. */
  newMoves: MoveId[]
}

/**
 * Evolves the beast into `into` (by default its dex evolution, whatever its
 * level): stats are recomputed and damage taken is kept. Returns null when
 * there is nothing to evolve into.
 */
export function evolve(c: Creature, into?: SpeciesId): EvolveResult | null {
  const target = into ?? dex(c.species).evolves?.into
  if (!target) return null
  const from = c.species
  const damage = maxHp(c) - c.hp
  c.species = target
  if (c.hp > 0) c.hp = Math.max(1, maxHp(c) - damage)
  const newMoves = movesLearnedAt(target, c.level).filter((m) => !c.moves.some((s) => s.id === m))
  return { from, into: target, newMoves }
}

/** Restores HP, PP and status, as at a Haven. */
export function healFull(c: Creature): void {
  c.hp = maxHp(c)
  c.status = null
  c.sleepTurns = 0
  for (const s of c.moves) s.pp = moveData(s.id).pp
}

/** How the text names the cure of each status. */
export function cureText(name: string, status: StatusId): string {
  switch (status) {
    case 'psn':
    case 'tox':
      return `${name} was cured of poison.`
    case 'brn':
      return `${name}'s burn was healed.`
    case 'par':
      return `${name} was cured of paralysis.`
    case 'slp':
      return `${name} woke up.`
    case 'frz':
      return `${name} thawed out.`
  }
}

export const NO_EFFECT = "It won't have any effect."

export interface ItemResult {
  ok: boolean
  text: string
}

/**
 * Applies a heal, cure, revive or PP item to a beast, in or out of battle.
 * Nothing changes when it would have no effect. `name` overrides how the
 * text names the beast (the battle says "Foe X"). The bag is not touched.
 */
export function applyItem(c: Creature, id: ItemId, name = displayName(c)): ItemResult {
  const use = itemData(id).use
  const max = maxHp(c)
  switch (use.kind) {
    case 'heal': {
      if (c.hp <= 0) return { ok: false, text: NO_EFFECT }
      const cure = !!use.cure && c.status !== null
      if (c.hp >= max && !cure) return { ok: false, text: NO_EFFECT }
      const gain = use.hp <= 0 ? max - c.hp : Math.min(use.hp, max - c.hp)
      c.hp += gain
      const parts: string[] = []
      if (gain > 0) parts.push(`${name} recovered ${gain} HP!`)
      if (cure && c.status) {
        parts.push(cureText(name, c.status))
        c.status = null
        c.sleepTurns = 0
      }
      return { ok: true, text: parts.join(' ') }
    }
    case 'cure': {
      if (c.hp <= 0 || !c.status) return { ok: false, text: NO_EFFECT }
      const text = cureText(name, c.status)
      c.status = null
      c.sleepTurns = 0
      return { ok: true, text }
    }
    case 'revive': {
      if (c.hp > 0) return { ok: false, text: NO_EFFECT }
      c.hp = Math.max(1, Math.floor(max * use.fraction))
      c.status = null
      c.sleepTurns = 0
      return { ok: true, text: `${name} was revived!` }
    }
    case 'pp': {
      let gained = false
      for (const s of c.moves) {
        const top = moveData(s.id).pp
        if (s.pp < top) {
          s.pp = Math.min(top, s.pp + use.pp)
          gained = true
        }
      }
      if (!gained) return { ok: false, text: NO_EFFECT }
      return { ok: true, text: `${name}'s PP was restored.` }
    }
    default:
      return { ok: false, text: NO_EFFECT }
  }
}

/** Whether applyItem would do anything, without changing the beast. */
export function itemWouldWork(c: Creature, id: ItemId): boolean {
  const copy: Creature = { ...c, moves: c.moves.map((s) => ({ ...s })) }
  return applyItem(copy, id).ok
}

/**
 * Uses a heal, cure, revive or PP item on a beast from the bag outside
 * battle. On `ok` the caller removes one from the bag and shows `text`.
 */
export function useItemInField(c: Creature, id: ItemId): ItemResult {
  const use = itemData(id).use
  if (use.kind !== 'heal' && use.kind !== 'cure' && use.kind !== 'revive' && use.kind !== 'pp') {
    return { ok: false, text: "That can't be used on a beast." }
  }
  return applyItem(c, id)
}
