import type { TypeId } from './types'

/**
 * Every item in the game. `use` says what an item does; the battle engine
 * applies it in battle and src/game applies it in the field, both reading
 * this one table.
 */
export const ITEM_IDS = [
  'salve',
  'superSalve',
  'hyperSalve',
  'fullSalve',
  'remedy',
  'revivalSeed',
  'ppDrop',
  'muskSpray',
  'returnWing',
  'orb',
  'superOrb',
  'hyperOrb',
  'tideOrb',
  'duskOrb',
  'reefBerry',
  'sunBerry',
  'mintBerry',
  'zestBerry',
  'shareShell',
  'mossWrap',
  'cinderstone',
  'tidePearl',
  'seedPod',
  'sprintShoes',
  'driftRod',
  'tideCharm',
  'labParcel',
  'wreckKey',
] as const

export type ItemId = (typeof ITEM_IDS)[number]

export type Pocket = 'items' | 'orbs' | 'berries' | 'key'

export type ItemUse =
  /** Restores `hp` HP, or all of it when `hp` is 0. `cure` also clears status. */
  | { kind: 'heal'; hp: number; cure?: boolean }
  /** Cures any status condition. */
  | { kind: 'cure' }
  /** Brings a fainted beast back with this fraction of its max HP. */
  | { kind: 'revive'; fraction: number }
  /** Restores `pp` PP to every move. */
  | { kind: 'pp'; pp: number }
  /**
   * A capture orb. `rate` multiplies the catch roll; `bonus` multiplies it
   * again against beasts of those types, or at night-dark places for `dark`.
   */
  | { kind: 'orb'; rate: number; bonus?: { types?: readonly TypeId[]; dark?: boolean; mult: number } }
  /** Keeps weaker wild beasts away for this many steps. */
  | { kind: 'repel'; steps: number }
  /** Returns you to the last Haven you visited, from a cave or dungeon. */
  | { kind: 'escape' }
  /** A key item; the field decides what it does. */
  | { kind: 'key' }
  /** Does nothing from the bag; it only works held. */
  | { kind: 'held' }

/** What an item does while a beast holds it (berries are eaten once). */
export type HoldEffect =
  /** Eaten at half HP or less: restores `hp` HP. */
  | { kind: 'berryHeal'; hp: number }
  /** Eaten as soon as a status problem strikes: cures it. */
  | { kind: 'berryCure' }
  /** Eaten at a quarter HP or less: raises ATTACK one stage. */
  | { kind: 'berryAttack' }
  /** The holder gets a share of the experience from every battle, even sitting out. */
  | { kind: 'share' }
  /** Restores 1/16 of max HP at the end of every turn. */
  | { kind: 'regen' }
  /** Moves of `type` hit 10% harder. */
  | { kind: 'boost'; type: TypeId }

export interface ItemData {
  id: ItemId
  /** Upper-case display name, twelve characters at most. */
  name: string
  pocket: Pocket
  /** Market price in shells; 0 means it can't be bought or sold. */
  price: number
  /** Bag description, about three short lines. */
  desc: string
  use: ItemUse
  /** Usable from the bag in battle. */
  battle: boolean
  /** What it does when held; items without this can't be held. */
  hold?: HoldEffect
}

const ITEMS: readonly ItemData[] = [
  { id: 'salve', name: 'SALVE', pocket: 'items', price: 200, battle: true, desc: 'A soothing balm. Restores 20 HP to one beast.', use: { kind: 'heal', hp: 20 } },
  { id: 'superSalve', name: 'SUPER SALVE', pocket: 'items', price: 600, battle: true, desc: 'A stronger balm. Restores 60 HP to one beast.', use: { kind: 'heal', hp: 60 } },
  { id: 'hyperSalve', name: 'HYPER SALVE', pocket: 'items', price: 1100, battle: true, desc: 'A potent balm. Restores 150 HP to one beast.', use: { kind: 'heal', hp: 150 } },
  { id: 'fullSalve', name: 'FULL SALVE', pocket: 'items', price: 2800, battle: true, desc: 'Fully restores HP and cures any status problem.', use: { kind: 'heal', hp: 0, cure: true } },
  { id: 'remedy', name: 'REMEDY', pocket: 'items', price: 300, battle: true, desc: 'Herbal drops that cure any status problem.', use: { kind: 'cure' } },
  { id: 'revivalSeed', name: 'REVIVAL SEED', pocket: 'items', price: 1500, battle: true, desc: 'Revives a fainted beast with half its HP.', use: { kind: 'revive', fraction: 0.5 } },
  { id: 'ppDrop', name: 'PP DROP', pocket: 'items', price: 1200, battle: true, desc: 'Restores 10 PP to every move of one beast.', use: { kind: 'pp', pp: 10 } },
  { id: 'muskSpray', name: 'MUSK SPRAY', pocket: 'items', price: 350, battle: false, desc: 'A strong scent. Weak wild beasts keep away for 100 steps.', use: { kind: 'repel', steps: 100 } },
  { id: 'returnWing', name: 'RETURN WING', pocket: 'items', price: 550, battle: false, desc: 'A feather that carries you back to the entrance of a cave.', use: { kind: 'escape' } },
  { id: 'orb', name: 'ORB', pocket: 'orbs', price: 200, battle: true, desc: 'A capture orb for catching wild beasts.', use: { kind: 'orb', rate: 1 } },
  { id: 'superOrb', name: 'SUPER ORB', pocket: 'orbs', price: 600, battle: true, desc: 'A better orb, more likely to catch a beast.', use: { kind: 'orb', rate: 1.5 } },
  { id: 'hyperOrb', name: 'HYPER ORB', pocket: 'orbs', price: 1200, battle: true, desc: 'A high-grade orb. Very likely to catch a beast.', use: { kind: 'orb', rate: 2 } },
  { id: 'tideOrb', name: 'TIDE ORB', pocket: 'orbs', price: 1000, battle: true, desc: 'Works well on TIDE and BUG beasts.', use: { kind: 'orb', rate: 1, bonus: { types: ['tide', 'bug'], mult: 3 } } },
  { id: 'duskOrb', name: 'DUSK ORB', pocket: 'orbs', price: 1000, battle: true, desc: 'Works well in caves and other dark places.', use: { kind: 'orb', rate: 1, bonus: { dark: true, mult: 3.5 } } },
  { id: 'reefBerry', name: 'REEF BERRY', pocket: 'berries', price: 120, battle: true, hold: { kind: 'berryHeal', hp: 10 }, desc: 'A salty berry. Restores 10 HP; held, eaten at half HP.', use: { kind: 'heal', hp: 10 } },
  { id: 'sunBerry', name: 'SUN BERRY', pocket: 'berries', price: 450, battle: true, hold: { kind: 'berryHeal', hp: 30 }, desc: 'A sweet berry. Restores 30 HP; held, eaten at half HP.', use: { kind: 'heal', hp: 30 } },
  { id: 'mintBerry', name: 'MINT BERRY', pocket: 'berries', price: 300, battle: true, hold: { kind: 'berryCure' }, desc: 'A cool berry. Cures any status; held, eaten at once.', use: { kind: 'cure' } },
  { id: 'zestBerry', name: 'ZEST BERRY', pocket: 'berries', price: 0, battle: false, hold: { kind: 'berryAttack' }, desc: 'A sharp berry. Held, eaten at low HP to raise ATTACK.', use: { kind: 'held' } },
  { id: 'shareShell', name: 'SHARE SHELL', pocket: 'items', price: 0, battle: false, hold: { kind: 'share' }, desc: 'Held, its beast shares the experience from every battle.', use: { kind: 'held' } },
  { id: 'mossWrap', name: 'MOSS WRAP', pocket: 'items', price: 0, battle: false, hold: { kind: 'regen' }, desc: 'Damp moss. Held, it restores a little HP every turn.', use: { kind: 'held' } },
  { id: 'cinderstone', name: 'CINDERSTONE', pocket: 'items', price: 0, battle: false, hold: { kind: 'boost', type: 'flame' }, desc: 'Still warm. Held, it powers up FLAME moves.', use: { kind: 'held' } },
  { id: 'tidePearl', name: 'TIDE PEARL', pocket: 'items', price: 0, battle: false, hold: { kind: 'boost', type: 'tide' }, desc: 'A sea-blue pearl. Held, it powers up TIDE moves.', use: { kind: 'held' } },
  { id: 'seedPod', name: 'SEED POD', pocket: 'items', price: 0, battle: false, hold: { kind: 'boost', type: 'leaf' }, desc: 'A lively pod. Held, it powers up LEAF moves.', use: { kind: 'held' } },
  { id: 'sprintShoes', name: 'SPRINT SHOES', pocket: 'key', price: 0, battle: false, desc: 'Hold B while walking to run.', use: { kind: 'key' } },
  { id: 'driftRod', name: 'DRIFT ROD', pocket: 'key', price: 0, battle: false, desc: 'A fishing rod. Use it facing water to fish for beasts.', use: { kind: 'key' } },
  { id: 'tideCharm', name: 'TIDE CHARM', pocket: 'key', price: 0, battle: false, desc: 'Lets a TIDE beast carry you across water. Face the water and press A.', use: { kind: 'key' } },
  { id: 'labParcel', name: 'LAB PARCEL', pocket: 'key', price: 0, battle: false, desc: 'A parcel for PROF. MARIS.', use: { kind: 'key' } },
  { id: 'wreckKey', name: 'WRECK KEY', pocket: 'key', price: 0, battle: false, desc: 'A rusty key found on the old wreck.', use: { kind: 'key' } },
]

const BY_ID = new Map<ItemId, ItemData>(ITEMS.map((i) => [i.id, i]))

export function item(id: ItemId): ItemData {
  const d = BY_ID.get(id)
  if (!d) throw new Error(`unknown item ${id}`)
  return d
}

export const ALL_ITEMS: readonly ItemData[] = ITEMS
