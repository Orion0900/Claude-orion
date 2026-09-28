/**
 * Content lookups for the UI. The tables belong to the weapons and
 * progression folders; they are indexed lazily and accept an array, an
 * id-keyed record or a Map, so the UI keeps working whichever shape they take.
 */
import type { GameContext, ItemDef, TomeDef, WeaponDef } from '../game/types'
import { ITEMS } from '../progression/itemDefs'
import { TOMES } from '../progression/tomeDefs'
import { WEAPON_BY_ID } from '../weapons/weaponDefs'
import type { DefLookups } from './format'

function index<T extends { id: string }>(table: unknown): Map<string, T> {
  if (table instanceof Map) return table as Map<string, T>
  const out = new Map<string, T>()
  const list = Array.isArray(table) ? table : table && typeof table === 'object' ? Object.values(table) : []
  for (const def of list as T[]) if (def && typeof def.id === 'string') out.set(def.id, def)
  return out
}

let weapons: Map<string, WeaponDef> | null = null
let tomes: Map<string, TomeDef> | null = null
let items: Map<string, ItemDef> | null = null

export function weaponDef(id: string): WeaponDef | undefined {
  weapons ??= index<WeaponDef>(WEAPON_BY_ID as unknown)
  return weapons.get(id)
}

export function tomeDef(id: string): TomeDef | undefined {
  tomes ??= index<TomeDef>(TOMES as unknown)
  return tomes.get(id)
}

export function itemDef(id: string): ItemDef | undefined {
  items ??= index<ItemDef>(ITEMS as unknown)
  return items.get(id)
}

/** Lookups for `describeOffer`, reading levels and stacks from the live run. */
export function runLookups(ctx: GameContext): DefLookups {
  return {
    weapon: weaponDef,
    tome: tomeDef,
    item: itemDef,
    weaponLevel: (id) => ctx.weapons.owned.find((w) => w.def.id === id)?.level ?? 0,
    tomeLevel: (id) => ctx.progression.tomes.find((t) => t.def.id === id)?.level ?? 0,
    itemStacks: (id) => ctx.progression.items.get(id) ?? 0,
  }
}
