/**
 * The saved game: everything that persists between sessions, as plain JSON
 * in localStorage. `writeGame` / `readGame` handle versions and bad data.
 */
import type { Critter } from '../battle/types'
import type { DisplayMode } from '../engine/palettes'
import type { ItemId } from '../data/items'
import type { SpeciesId } from '../data/species'

export type Facing = 'up' | 'down' | 'left' | 'right'

export interface Options {
  /** 0 slow, 1 mid, 2 fast. */
  textSpeed: 0 | 1 | 2
  /** Move animations in battle. */
  animations: boolean
  /** SHIFT offers a switch when a trainer sends out a new critter; SET doesn't. */
  battleStyle: 'shift' | 'set'
  display: DisplayMode
  music: number
  sfx: number
}

export const DEFAULT_OPTIONS: Options = {
  textSpeed: 1,
  animations: true,
  battleStyle: 'shift',
  display: 'COLOR',
  music: 0.7,
  sfx: 0.8,
}

export interface Place {
  map: string
  x: number
  y: number
}

export const BOX_COUNT = 8
export const BOX_SIZE = 20

export interface SaveData {
  version: 1
  name: string
  rival: string
  /** Trainer ID number, 0–65535. */
  id: number
  money: number
  party: Critter[]
  boxes: Critter[][]
  box: number
  bag: Partial<Record<ItemId, number>>
  /** Story flags, beaten trainers (`beat:<id>`), picked-up items (`item:<id>`). */
  flags: Record<string, boolean>
  /** ALMANAC: species seen and caught. */
  seen: SpeciesId[]
  caught: SpeciesId[]
  /** Medals won, by arena number 1–8. */
  medals: number[]
  /** Towns visited, for SOAR. */
  visited: string[]
  /** Where you are. */
  at: Place
  face: Facing
  /** Where you wake up after blacking out: the last CLINIC used. */
  heal: Place
  /** Steps left on a SHOO SPRAY. */
  repel: number
  /** Riding, swimming, walking. */
  mode: 'walk' | 'bike' | 'swim'
  playSeconds: number
  options: Options
  /** The starter chosen: decides the rival's. */
  starter: SpeciesId | null
  /** Seed for everything random that should stay put (hidden items, the rival's critters). */
  seed: number
}

export function newSave(name: string, rival: string, seed = Math.floor(Math.random() * 0x7fffffff)): SaveData {
  return {
    version: 1,
    name,
    rival,
    id: seed % 65536,
    money: 3000,
    party: [],
    boxes: Array.from({ length: BOX_COUNT }, () => []),
    box: 0,
    bag: {},
    flags: {},
    seen: [],
    caught: [],
    medals: [],
    visited: ['farthing'],
    at: { map: 'home2f', x: 3, y: 4 },
    face: 'down',
    heal: { map: 'home1f', x: 4, y: 5 },
    repel: 0,
    mode: 'walk',
    playSeconds: 0,
    options: { ...DEFAULT_OPTIONS },
    starter: null,
    seed,
  }
}

const KEY = 'capsule-critters-save'
const OPTIONS_KEY = 'capsule-critters-options'

/** Storage that may be missing or throw (private browsing, Node tests). */
function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function writeGame(s: SaveData): boolean {
  try {
    store()?.setItem(KEY, JSON.stringify(s))
    return true
  } catch {
    return false
  }
}

export function hasGame(): boolean {
  return !!readGame()
}

export function readGame(): SaveData | null {
  try {
    const raw = store()?.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as SaveData
    if (!s || s.version !== 1 || !Array.isArray(s.party)) return null
    s.options = { ...DEFAULT_OPTIONS, ...s.options }
    return s
  } catch {
    return null
  }
}

/** Options are kept outside the save too, so the title screen remembers them. */
export function readOptions(): Options {
  try {
    const raw = store()?.getItem(OPTIONS_KEY)
    return raw ? { ...DEFAULT_OPTIONS, ...(JSON.parse(raw) as Partial<Options>) } : { ...DEFAULT_OPTIONS }
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

export function writeOptions(o: Options): void {
  try {
    store()?.setItem(OPTIONS_KEY, JSON.stringify(o))
  } catch {
    // Not worth bothering anyone about.
  }
}

// ─── Bag helpers ──────────────────────────────────────────────────────────

export function itemCount(s: SaveData, id: ItemId): number {
  return s.bag[id] ?? 0
}

export function addItem(s: SaveData, id: ItemId, n = 1): void {
  s.bag[id] = Math.min(99, (s.bag[id] ?? 0) + n)
}

export function removeItem(s: SaveData, id: ItemId, n = 1): void {
  const left = (s.bag[id] ?? 0) - n
  if (left > 0) s.bag[id] = left
  else delete s.bag[id]
}

// ─── Almanac helpers ──────────────────────────────────────────────────────

export function markSeen(s: SaveData, id: SpeciesId): void {
  if (!s.seen.includes(id)) s.seen.push(id)
}

export function markCaught(s: SaveData, id: SpeciesId): void {
  markSeen(s, id)
  if (!s.caught.includes(id)) s.caught.push(id)
}

/** Adds a critter to the party, or the current box when the party is full. Returns where it went, or null if everything is full. */
export function stowCritter(s: SaveData, c: Critter): 'party' | number | null {
  if (s.party.length < 6) {
    s.party.push(c)
    return 'party'
  }
  for (let k = 0; k < BOX_COUNT; k++) {
    const b = (s.box + k) % BOX_COUNT
    if (s.boxes[b].length < BOX_SIZE) {
      s.boxes[b].push(c)
      return b
    }
  }
  return null
}
