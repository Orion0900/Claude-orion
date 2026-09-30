import type { Facing } from '../art/look'
import type { Creature } from '../battle/types'
import type { SpeciesId } from '../data/dex'
import { ITEM_IDS, type ItemId } from '../data/items'

export interface Options {
  /** 0 slow, 1 mid, 2 fast. */
  textSpeed: 0 | 1 | 2
  battleAnims: boolean
  music: number
  sfx: number
  frame: number
}

/** Everything that makes up a saved game. Plain JSON. */
export interface SaveData {
  version: 1
  name: string
  /** Index into PLAYER_LOOKS. */
  lookIndex: number
  trainerId: number
  money: number
  map: string
  x: number
  y: number
  facing: Facing
  surfing: boolean
  party: Creature[]
  box: Creature[]
  bag: Partial<Record<ItemId, number>>
  flags: Record<string, true>
  vars: Record<string, number>
  seen: SpeciesId[]
  caught: SpeciesId[]
  crests: string[]
  playSeconds: number
  /** Where a blackout sends you: in front of the last Haven's counter. */
  lastHaven: { map: string; x: number; y: number }
  repel: number
  options: Options
  /** Advances with every roll so reloads don't replay the same encounters. */
  seed: number
}

export const DEFAULT_OPTIONS: Options = { textSpeed: 1, battleAnims: true, music: 0.7, sfx: 0.8, frame: 0 }

export const MAX_PARTY = 6
export const BOX_CAPACITY = 60

export function newGame(name: string, lookIndex: number, seed: number): SaveData {
  return {
    version: 1,
    name,
    lookIndex,
    trainerId: 10000 + (seed % 89999),
    money: 3000,
    map: 'home2f',
    x: 3,
    y: 4,
    facing: 'down',
    surfing: false,
    party: [],
    box: [],
    bag: {},
    flags: {},
    vars: {},
    seen: [],
    caught: [],
    crests: [],
    playSeconds: 0,
    lastHaven: { map: 'home1f', x: 4, y: 5 },
    repel: 0,
    options: { ...DEFAULT_OPTIONS },
    seed: seed >>> 0 || 1,
  }
}

export function hasFlag(s: SaveData, f: string): boolean {
  return s.flags[f] === true
}

export function setFlag(s: SaveData, f: string): void {
  s.flags[f] = true
}

export function itemCount(s: SaveData, id: ItemId): number {
  return s.bag[id] ?? 0
}

export function addItem(s: SaveData, id: ItemId, n = 1): void {
  s.bag[id] = Math.min(999, (s.bag[id] ?? 0) + n)
}

export function removeItem(s: SaveData, id: ItemId, n = 1): void {
  const left = (s.bag[id] ?? 0) - n
  if (left > 0) s.bag[id] = left
  else delete s.bag[id]
}

export function markSeen(s: SaveData, id: SpeciesId): void {
  if (!s.seen.includes(id)) s.seen.push(id)
}

export function markCaught(s: SaveData, id: SpeciesId): void {
  markSeen(s, id)
  if (!s.caught.includes(id)) s.caught.push(id)
}

/** A fresh roll seed from the save's running seed. */
export function nextSeed(s: SaveData): number {
  s.seed = (Math.imul(s.seed ^ (s.seed >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0 || 1
  return s.seed
}

/** Party beasts still able to fight. */
export function healthyCount(s: SaveData): number {
  return s.party.filter((c) => c.hp > 0).length
}

const KEY = 'tidebound.save.v1'

function storage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function hasSave(store: Pick<Storage, 'getItem'> | undefined = storage()): boolean {
  try {
    return !!store?.getItem(KEY)
  } catch {
    return false
  }
}

/**
 * Reads the save, or null when there isn't a usable one. Missing fields are
 * filled from a fresh game so an older save still loads.
 */
export function loadGame(store: Pick<Storage, 'getItem'> | undefined = storage()): SaveData | null {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as Partial<SaveData>
    if (!data || typeof data !== 'object' || typeof data.name !== 'string' || !Array.isArray(data.party)) return null
    const fresh = newGame(data.name, data.lookIndex ?? 0, data.seed ?? 1)
    const bag: SaveData['bag'] = {}
    for (const id of ITEM_IDS) {
      const n = data.bag?.[id]
      if (typeof n === 'number' && n > 0) bag[id] = Math.floor(n)
    }
    return {
      ...fresh,
      ...data,
      bag,
      options: { ...DEFAULT_OPTIONS, ...(data.options ?? {}) },
      flags: { ...(data.flags ?? {}) },
      vars: { ...(data.vars ?? {}) },
      version: 1,
    }
  } catch {
    return null
  }
}

export function writeGame(s: SaveData, store: Pick<Storage, 'setItem'> | undefined = storage()): boolean {
  try {
    store?.setItem(KEY, JSON.stringify(s))
    return !!store
  } catch {
    return false
  }
}

/** Options survive even without a saved game (set on the title screen). */
const OPTIONS_KEY = 'tidebound.options.v1'

export function loadOptions(store: Pick<Storage, 'getItem'> | undefined = storage()): Options {
  try {
    const raw = store?.getItem(OPTIONS_KEY)
    return raw ? { ...DEFAULT_OPTIONS, ...(JSON.parse(raw) as Partial<Options>) } : { ...DEFAULT_OPTIONS }
  } catch {
    return { ...DEFAULT_OPTIONS }
  }
}

export function writeOptions(o: Options, store: Pick<Storage, 'setItem'> | undefined = storage()): void {
  try {
    store?.setItem(OPTIONS_KEY, JSON.stringify(o))
  } catch {
    // Storage full or blocked: options last for this session.
  }
}
