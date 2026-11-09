/**
 * Everything about one critter outside the turn loop: making one, its stats,
 * experience and levels, moves, medicine and evolution.
 */
import { Rng } from '../core/rng'
import { item as itemData, type ItemId } from '../data/items'
import { movesAtLevel, movesLearnedAt } from '../data/learn'
import { move as moveData, type MoveId } from '../data/moves'
import { species, type SpeciesId } from '../data/species'
import { calcHpStat, calcStat, hpDv, levelForXp, MAX_LEVEL, MAX_STAT_EXP, xpForLevel, type Dvs } from './formulas'
import type { Critter, CritterView, MoveSlot, StatKey, Stats } from './types'

export const SHINY_ODDS = 1 / 1024

let uidCounter = 0

export function newUid(rng?: Rng): string {
  uidCounter = (uidCounter + 1) % 1e6
  const r = rng ? rng.int(0, 0xffffff) : Math.floor(Math.random() * 0xffffff)
  return `${Date.now().toString(36)}${uidCounter.toString(36)}${r.toString(36)}`
}

export interface MakeOptions {
  rng: Rng
  ot?: string
  otId?: number
  metPlace?: string
  moves?: MoveId[]
  dvs?: Dvs
  shiny?: boolean
  nickname?: string | null
}

export const NO_SX: Stats = { hp: 0, atk: 0, def: 0, spd: 0, spc: 0 }

/** A fresh critter at full health with the moves it would know at this level. */
export function makeCritter(id: SpeciesId, level: number, o: MakeOptions): Critter {
  const s = species(id)
  const rng = o.rng
  const dvs = o.dvs ?? { atk: rng.int(0, 15), def: rng.int(0, 15), spd: rng.int(0, 15), spc: rng.int(0, 15) }
  const lv = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)))
  const moves = (o.moves ?? movesAtLevel(id, lv)).slice(0, 4).map((m) => ({ id: m, pp: moveData(m).pp, ups: 0 }))
  const c: Critter = {
    uid: newUid(rng),
    species: id,
    nickname: o.nickname ?? null,
    level: lv,
    xp: xpForLevel(s.growth, lv),
    hp: 1,
    status: null,
    sleep: 0,
    moves,
    dvs,
    sx: { ...NO_SX },
    shiny: o.shiny ?? (!s.legend && rng.chance(SHINY_ODDS)),
    ot: o.ot ?? '',
    otId: o.otId ?? 0,
    metLevel: lv,
    metPlace: o.metPlace ?? '',
  }
  c.hp = maxHp(c)
  return c
}

export function calcStats(c: Critter): Stats {
  const b = species(c.species).base
  return {
    hp: calcHpStat(b.hp, hpDv(c.dvs), c.sx.hp, c.level),
    atk: calcStat(b.atk, c.dvs.atk, c.sx.atk, c.level),
    def: calcStat(b.def, c.dvs.def, c.sx.def, c.level),
    spd: calcStat(b.spd, c.dvs.spd, c.sx.spd, c.level),
    spc: calcStat(b.spc, c.dvs.spc, c.sx.spc, c.level),
  }
}

export function maxHp(c: Critter): number {
  return calcStats(c).hp
}

export function displayName(c: Critter): string {
  return c.nickname ?? species(c.species).name
}

export function maxPp(slot: MoveSlot): number {
  const base = moveData(slot.id).pp
  return base + Math.floor(base / 5) * slot.ups
}

export function fainted(c: Critter): boolean {
  return c.hp <= 0
}

/** Progress through the current level, 0–1. */
export function xpFraction(c: Critter): number {
  if (c.level >= MAX_LEVEL) return 1
  const g = species(c.species).growth
  const lo = xpForLevel(g, c.level)
  const hi = xpForLevel(g, c.level + 1)
  return Math.max(0, Math.min(1, (c.xp - lo) / Math.max(1, hi - lo)))
}

export function xpToNext(c: Critter): number {
  if (c.level >= MAX_LEVEL) return 0
  return Math.max(0, xpForLevel(species(c.species).growth, c.level + 1) - c.xp)
}

export function view(c: Critter): CritterView {
  const s = species(c.species)
  return {
    species: c.species,
    name: displayName(c),
    level: c.level,
    hp: c.hp,
    maxHp: maxHp(c),
    status: c.status,
    shiny: c.shiny,
    types: s.types,
    xpFraction: xpFraction(c),
  }
}

/** Full heal, as at a CLINIC. */
export function restore(c: Critter): void {
  c.hp = maxHp(c)
  c.status = null
  c.sleep = 0
  for (const m of c.moves) m.pp = maxPp(m)
}

export interface LevelStep {
  level: number
  before: Stats
  after: Stats
  /** Moves this level teaches (they still have to be learned). */
  moves: MoveId[]
}

/**
 * Adds experience and returns each level gained, in order. Max HP grows with
 * the level and current HP grows by the same amount.
 */
export function gainXp(c: Critter, amount: number): LevelStep[] {
  if (c.level >= MAX_LEVEL) return []
  const g = species(c.species).growth
  c.xp = Math.min(xpForLevel(g, MAX_LEVEL), c.xp + Math.max(0, Math.floor(amount)))
  const steps: LevelStep[] = []
  const target = levelForXp(g, c.xp)
  while (c.level < target) steps.push(levelUp(c))
  return steps
}

/** Raises one level (GOLD TOFFEE, or the XP loop). */
export function levelUp(c: Critter): LevelStep {
  const before = calcStats(c)
  c.level = Math.min(MAX_LEVEL, c.level + 1)
  const g = species(c.species).growth
  if (c.xp < xpForLevel(g, c.level)) c.xp = xpForLevel(g, c.level)
  const after = calcStats(c)
  if (c.hp > 0) c.hp = Math.min(after.hp, c.hp + (after.hp - before.hp))
  return { level: c.level, before, after, moves: movesLearnedAt(c.species, c.level) }
}

/** Adds stat experience for defeating a species, capped per stat. */
export function gainStatExp(c: Critter, defeated: SpeciesId): void {
  const b = species(defeated).base
  for (const k of ['hp', 'atk', 'def', 'spd', 'spc'] as StatKey[]) c.sx[k] = Math.min(MAX_STAT_EXP, c.sx[k] + b[k])
}

export function knows(c: Critter, m: MoveId): boolean {
  return c.moves.some((s) => s.id === m)
}

/** Teaches a move into a free slot; false when all four are taken (or it's known). */
export function learnFree(c: Critter, m: MoveId): boolean {
  if (knows(c, m) || c.moves.length >= 4) return false
  c.moves.push({ id: m, pp: moveData(m).pp, ups: 0 })
  return true
}

/** Replaces the move in `slot` with `m`. */
export function replaceMove(c: Critter, slot: number, m: MoveId): void {
  c.moves[slot] = { id: m, pp: moveData(m).pp, ups: 0 }
}

/** The species a critter would evolve into now (by level, or with `withItem`). */
export function evolutionFor(c: Critter, withItem?: ItemId): SpeciesId | null {
  for (const e of species(c.species).evolves ?? []) {
    if (withItem) {
      if (e.item === withItem) return e.to
    } else if (e.level !== undefined && c.level >= e.level) return e.to
  }
  return null
}

/** Turns a critter into its evolved species, keeping its HP lost. */
export function evolve(c: Critter, to: SpeciesId): void {
  const lost = maxHp(c) - c.hp
  const wasNamed = c.nickname !== null && c.nickname !== species(c.species).name
  c.species = to
  if (!wasNamed) c.nickname = null
  c.hp = Math.max(c.hp > 0 ? 1 : 0, maxHp(c) - lost)
}

export type ItemUse = { ok: true; text: string } | { ok: false; text: string }

const CURE_TEXT: Record<string, string> = {
  psn: 'was cured of poison!',
  tox: 'was cured of poison!',
  brn: 'is no longer burned!',
  frz: 'thawed out!',
  par: 'can move freely again!',
  slp: 'woke up!',
}

/** Whether medicine would do anything for this critter. */
export function itemWouldWork(c: Critter, id: ItemId, moveSlot?: number): boolean {
  const e = itemData(id).effect
  switch (e.kind) {
    case 'heal':
      return c.hp > 0 && (c.hp < maxHp(c) || (!!e.cure && c.status !== null))
    case 'cure':
      return c.hp > 0 && c.status !== null && (e.status === 'all' || c.status === e.status || (e.status === 'psn' && c.status === 'tox'))
    case 'revive':
      return c.hp <= 0
    case 'pp':
      if (e.all) return c.moves.some((m) => m.pp < maxPp(m))
      return moveSlot !== undefined && !!c.moves[moveSlot] && c.moves[moveSlot].pp < maxPp(c.moves[moveSlot])
    case 'vitamin':
      return c.hp > 0 && c.sx[e.stat] < 25600
    case 'level':
      return c.level < MAX_LEVEL
    case 'ppUp':
      return moveSlot !== undefined && !!c.moves[moveSlot] && c.moves[moveSlot].ups < 3 && moveData(c.moves[moveSlot].id).pp >= 5
    case 'evolve':
      return evolutionFor(c, id) !== null
    default:
      return false
  }
}

/**
 * Applies medicine or a training item to a critter (not capsules, drinks or
 * key items). The bag count is the caller's business.
 */
export function applyItem(c: Critter, id: ItemId, moveSlot?: number): ItemUse {
  const name = displayName(c)
  if (!itemWouldWork(c, id, moveSlot)) return { ok: false, text: 'It won\'t have any effect.' }
  const e = itemData(id).effect
  switch (e.kind) {
    case 'heal': {
      const before = c.hp
      c.hp = e.hp === 'full' ? maxHp(c) : Math.min(maxHp(c), c.hp + e.hp)
      if (e.cure) {
        c.status = null
        c.sleep = 0
      }
      const gained = c.hp - before
      return { ok: true, text: gained > 0 ? `${name} recovered ${gained} HP!` : `${name} is healthy again!` }
    }
    case 'cure': {
      const was = c.status!
      c.status = null
      c.sleep = 0
      return { ok: true, text: `${name} ${CURE_TEXT[was]}` }
    }
    case 'revive':
      c.hp = e.full ? maxHp(c) : Math.max(1, Math.floor(maxHp(c) / 2))
      c.status = null
      c.sleep = 0
      return { ok: true, text: `${name} is revived!` }
    case 'pp': {
      const slots = e.all ? c.moves : [c.moves[moveSlot!]]
      for (const s of slots) s.pp = e.amount === 'full' ? maxPp(s) : Math.min(maxPp(s), s.pp + e.amount)
      return { ok: true, text: e.all ? 'PP was restored!' : `${moveData(slots[0].id).name}'s PP was restored!` }
    }
    case 'vitamin': {
      c.sx[e.stat] = Math.min(MAX_STAT_EXP, c.sx[e.stat] + 2560)
      const label = { hp: 'HP', atk: 'ATTACK', def: 'DEFENSE', spd: 'SPEED', spc: 'SPECIAL' }[e.stat]
      const before = maxHp(c)
      if (e.stat === 'hp') c.hp += maxHp(c) - before
      return { ok: true, text: `${name}'s ${label} rose!` }
    }
    case 'ppUp': {
      const s = c.moves[moveSlot!]
      s.ups++
      return { ok: true, text: `${moveData(s.id).name}'s PP rose!` }
    }
    case 'level':
    case 'evolve':
      // Handled by the caller, which runs the level-up and evolution scenes.
      return { ok: true, text: '' }
    default:
      return { ok: false, text: 'It won\'t have any effect.' }
  }
}

/** A seeded wild critter, as met in grass, caves or water. */
export function wildCritter(id: SpeciesId, level: number, seed: number, place: string): Critter {
  return makeCritter(id, level, { rng: new Rng(seed), metPlace: place })
}
