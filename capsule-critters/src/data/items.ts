/**
 * Items: what they cost, which bag pocket they go in, and what they do.
 * The effects themselves are applied in src/battle/creature.ts (on a critter)
 * and by the field and battle code (capsules, sprays, ropes, key items).
 */
import type { MoveId } from './moves'
import type { StageKey, StatusId } from './moves'

export type Pocket = 'items' | 'capsules' | 'discs' | 'key'

export type ItemEffect =
  /** Restores HP: an amount, or 'full'. */
  | { kind: 'heal'; hp: number | 'full'; cure?: boolean }
  /** Cures one status, or all of them. */
  | { kind: 'cure'; status: StatusId | 'all' }
  /** Brings back a fainted critter with half (or all) of its HP. */
  | { kind: 'revive'; full: boolean }
  /** Restores PP: to one move or all four, by an amount or fully. */
  | { kind: 'pp'; all: boolean; amount: number | 'full' }
  /** Raises a stat's training (stat experience) a lot. */
  | { kind: 'vitamin'; stat: 'hp' | 'atk' | 'def' | 'spd' | 'spc' }
  /** +1 level. */
  | { kind: 'level' }
  /** Raises one move's max PP by a fifth of its base. */
  | { kind: 'ppUp' }
  /** Battle only: raises a stat stage, or the critical-hit rate. */
  | { kind: 'battleStat'; stat: StageKey | 'crit' }
  /** Throw at a wild critter. `rate` multiplies the catch chance; 0 never fails. */
  | { kind: 'capsule'; rate: number }
  /** Keeps weak wild critters away for this many steps. */
  | { kind: 'repel'; steps: number }
  /** Leads you out of a cave or building to its entrance. */
  | { kind: 'escape' }
  /** Evolves certain critters. */
  | { kind: 'evolve' }
  /** Teaches a move. */
  | { kind: 'disc'; move: MoveId; field?: boolean }
  /** Only used by the story or the field. */
  | { kind: 'key' }

export interface ItemData {
  readonly id: ItemId
  readonly name: string
  readonly pocket: Pocket
  /** 0: can't be bought or sold. */
  readonly price: number
  readonly effect: ItemEffect
  readonly desc: string
}

type Def = Omit<ItemData, 'id'>

const RAW = {
  // ─── Capsules ──────────────────────────────────────────
  capsule: { name: 'CAPSULE', pocket: 'capsules', price: 200, effect: { kind: 'capsule', rate: 1 }, desc: 'A capsule for catching wild critters.' },
  fineCapsule: { name: 'FINE CAPSULE', pocket: 'capsules', price: 600, effect: { kind: 'capsule', rate: 1.5 }, desc: 'A better capsule, with a stronger seal.' },
  primeCapsule: { name: 'PRIME CAPSULE', pocket: 'capsules', price: 1200, effect: { kind: 'capsule', rate: 2 }, desc: 'A top-grade capsule. Hard to break out of.' },
  omniCapsule: { name: 'OMNI CAPSULE', pocket: 'capsules', price: 0, effect: { kind: 'capsule', rate: 0 }, desc: 'A prototype. It never fails to catch.' },

  // ─── Medicine ──────────────────────────────────────────
  tonic: { name: 'TONIC', pocket: 'items', price: 300, effect: { kind: 'heal', hp: 20 }, desc: 'Restores 20 HP.' },
  superTonic: { name: 'SUPER TONIC', pocket: 'items', price: 700, effect: { kind: 'heal', hp: 50 }, desc: 'Restores 50 HP.' },
  hyperTonic: { name: 'HYPER TONIC', pocket: 'items', price: 1500, effect: { kind: 'heal', hp: 200 }, desc: 'Restores 200 HP.' },
  fullTonic: { name: 'FULL TONIC', pocket: 'items', price: 2500, effect: { kind: 'heal', hp: 'full' }, desc: 'Restores all HP.' },
  fullCure: { name: 'FULL CURE', pocket: 'items', price: 3000, effect: { kind: 'heal', hp: 'full', cure: true }, desc: 'Restores all HP and heals any status.' },
  antidote: { name: 'ANTIDOTE', pocket: 'items', price: 100, effect: { kind: 'cure', status: 'psn' }, desc: 'Cures poison.' },
  burnSalve: { name: 'BURN SALVE', pocket: 'items', price: 250, effect: { kind: 'cure', status: 'brn' }, desc: 'Soothes a burn.' },
  thawSalt: { name: 'THAW SALT', pocket: 'items', price: 250, effect: { kind: 'cure', status: 'frz' }, desc: 'Thaws a frozen critter.' },
  nerveSalve: { name: 'NERVE SALVE', pocket: 'items', price: 200, effect: { kind: 'cure', status: 'par' }, desc: 'Cures paralysis.' },
  wakeBell: { name: 'WAKE BELL', pocket: 'items', price: 250, effect: { kind: 'cure', status: 'slp' }, desc: 'Rings a sleeping critter awake.' },
  cureAll: { name: 'CURE-ALL', pocket: 'items', price: 600, effect: { kind: 'cure', status: 'all' }, desc: 'Heals any status.' },
  reviver: { name: 'REVIVER', pocket: 'items', price: 1500, effect: { kind: 'revive', full: false }, desc: 'Revives a fainted critter with half its HP.' },
  fullReviver: { name: 'FULL REVIVER', pocket: 'items', price: 0, effect: { kind: 'revive', full: true }, desc: 'Revives a fainted critter with all its HP.' },
  mintTea: { name: 'MINT TEA', pocket: 'items', price: 0, effect: { kind: 'pp', all: false, amount: 10 }, desc: 'Restores 10 PP to one move.' },
  mintBrew: { name: 'MINT BREW', pocket: 'items', price: 0, effect: { kind: 'pp', all: true, amount: 'full' }, desc: 'Restores all PP to every move.' },

  // ─── Training ──────────────────────────────────────────
  healthRoot: { name: 'HEALTH ROOT', pocket: 'items', price: 9800, effect: { kind: 'vitamin', stat: 'hp' }, desc: 'Raises the base HP of one critter.' },
  powerRoot: { name: 'POWER ROOT', pocket: 'items', price: 9800, effect: { kind: 'vitamin', stat: 'atk' }, desc: 'Raises the base ATTACK of one critter.' },
  guardRoot: { name: 'GUARD ROOT', pocket: 'items', price: 9800, effect: { kind: 'vitamin', stat: 'def' }, desc: 'Raises the base DEFENSE of one critter.' },
  swiftRoot: { name: 'SWIFT ROOT', pocket: 'items', price: 9800, effect: { kind: 'vitamin', stat: 'spd' }, desc: 'Raises the base SPEED of one critter.' },
  witRoot: { name: 'WIT ROOT', pocket: 'items', price: 9800, effect: { kind: 'vitamin', stat: 'spc' }, desc: 'Raises the base SPECIAL of one critter.' },
  goldToffee: { name: 'GOLD TOFFEE', pocket: 'items', price: 0, effect: { kind: 'level' }, desc: 'A rich sweet that raises a critter by one level.' },
  ppPlus: { name: 'PP PLUS', pocket: 'items', price: 0, effect: { kind: 'ppUp' }, desc: 'Raises the most PP a move can have.' },

  // ─── Battle drinks ─────────────────────────────────────
  powerDrink: { name: 'POWER DRINK', pocket: 'items', price: 500, effect: { kind: 'battleStat', stat: 'atk' }, desc: 'Raises ATTACK during a battle.' },
  guardDrink: { name: 'GUARD DRINK', pocket: 'items', price: 550, effect: { kind: 'battleStat', stat: 'def' }, desc: 'Raises DEFENSE during a battle.' },
  speedDrink: { name: 'SPEED DRINK', pocket: 'items', price: 350, effect: { kind: 'battleStat', stat: 'spd' }, desc: 'Raises SPEED during a battle.' },
  witDrink: { name: 'WIT DRINK', pocket: 'items', price: 350, effect: { kind: 'battleStat', stat: 'spc' }, desc: 'Raises SPECIAL during a battle.' },
  aimDrink: { name: 'AIM DRINK', pocket: 'items', price: 950, effect: { kind: 'battleStat', stat: 'acc' }, desc: 'Raises accuracy during a battle.' },
  focusDrink: { name: 'FOCUS DRINK', pocket: 'items', price: 650, effect: { kind: 'battleStat', stat: 'crit' }, desc: 'Raises the critical-hit rate during a battle.' },

  // ─── Field ─────────────────────────────────────────────
  shooSpray: { name: 'SHOO SPRAY', pocket: 'items', price: 350, effect: { kind: 'repel', steps: 100 }, desc: 'Keeps weak wild critters away for 100 steps.' },
  superShoo: { name: 'SUPER SHOO', pocket: 'items', price: 500, effect: { kind: 'repel', steps: 200 }, desc: 'Keeps weak wild critters away for 200 steps.' },
  maxShoo: { name: 'MAX SHOO', pocket: 'items', price: 700, effect: { kind: 'repel', steps: 250 }, desc: 'Keeps weak wild critters away for 250 steps.' },
  exitCord: { name: 'EXIT CORD', pocket: 'items', price: 550, effect: { kind: 'escape' }, desc: 'Leads you back to the entrance of a cave or building.' },

  // ─── Coins ─────────────────────────────────────────────
  moonCoin: { name: 'MOON COIN', pocket: 'items', price: 2100, effect: { kind: 'evolve' }, desc: 'A pale old coin. Some critters evolve when it is used on them.' },
  tideCoin: { name: 'TIDE COIN', pocket: 'items', price: 2100, effect: { kind: 'evolve' }, desc: 'A sea-worn coin. Some critters evolve when it is used on them.' },
  sparkCoin: { name: 'SPARK COIN', pocket: 'items', price: 2100, effect: { kind: 'evolve' }, desc: 'A coin that tingles. Some critters evolve when it is used on them.' },
  sunCoin: { name: 'SUN COIN', pocket: 'items', price: 2100, effect: { kind: 'evolve' }, desc: 'A warm golden coin. Some critters evolve when it is used on them.' },
  nugget: { name: 'GOLD NUGGET', pocket: 'items', price: 10000, effect: { kind: 'key' }, desc: 'A lump of pure gold. Sells for a lot.' },

  // ─── Skill discs ───────────────────────────────────────
  disc01: { name: 'DISC01', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'pumpUp' }, desc: '' },
  disc02: { name: 'DISC02', pocket: 'discs', price: 1000, effect: { kind: 'disc', move: 'ram' }, desc: '' },
  disc03: { name: 'DISC03', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'flatten' }, desc: '' },
  disc04: { name: 'DISC04', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'seeker' }, desc: '' },
  disc05: { name: 'DISC05', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'overdrive' }, desc: '' },
  disc06: { name: 'DISC06', pocket: 'discs', price: 1000, effect: { kind: 'disc', move: 'blur' }, desc: '' },
  disc07: { name: 'DISC07', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'stampede' }, desc: '' },
  disc08: { name: 'DISC08', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'flameJet' }, desc: '' },
  disc09: { name: 'DISC09', pocket: 'discs', price: 5000, effect: { kind: 'disc', move: 'inferno' }, desc: '' },
  disc10: { name: 'DISC10', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'froth' }, desc: '' },
  disc11: { name: 'DISC11', pocket: 'discs', price: 5000, effect: { kind: 'disc', move: 'deluge' }, desc: '' },
  disc12: { name: 'DISC12', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'arcBolt' }, desc: '' },
  disc13: { name: 'DISC13', pocket: 'discs', price: 5000, effect: { kind: 'disc', move: 'lightning' }, desc: '' },
  disc14: { name: 'DISC14', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'static' }, desc: '' },
  disc15: { name: 'DISC15', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'frostRay' }, desc: '' },
  disc16: { name: 'DISC16', pocket: 'discs', price: 5000, effect: { kind: 'disc', move: 'whiteout' }, desc: '' },
  disc17: { name: 'DISC17', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'siphon' }, desc: '' },
  disc18: { name: 'DISC18', pocket: 'discs', price: 5000, effect: { kind: 'disc', move: 'sunbeam' }, desc: '' },
  disc19: { name: 'DISC19', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'bodyThrow' }, desc: '' },
  disc20: { name: 'DISC20', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'suplex' }, desc: '' },
  disc21: { name: 'DISC21', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'noxious' }, desc: '' },
  disc22: { name: 'DISC22', pocket: 'discs', price: 5000, effect: { kind: 'disc', move: 'quake' }, desc: '' },
  disc23: { name: 'DISC23', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'burrow' }, desc: '' },
  disc24: { name: 'DISC24', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'rockfall' }, desc: '' },
  disc25: { name: 'DISC25', pocket: 'discs', price: 5000, effect: { kind: 'disc', move: 'mindBlast' }, desc: '' },
  disc26: { name: 'DISC26', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'nap' }, desc: '' },
  disc27: { name: 'DISC27', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'guardWall' }, desc: '' },
  disc28: { name: 'DISC28', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'mindWall' }, desc: '' },
  disc29: { name: 'DISC29', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'shadeBolt' }, desc: '' },
  disc30: { name: 'DISC30', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'wyrmRage' }, desc: '' },
  disc31: { name: 'DISC31', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'spiralBeak' }, desc: '' },
  disc32: { name: 'DISC32', pocket: 'discs', price: 3000, effect: { kind: 'disc', move: 'kaboom' }, desc: '' },
  disc33: { name: 'DISC33', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'fang' }, desc: '' },
  disc34: { name: 'DISC34', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'mend' }, desc: '' },
  disc35: { name: 'DISC35', pocket: 'discs', price: 2000, effect: { kind: 'disc', move: 'swirlGaze' }, desc: '' },
  field1: { name: 'FIELD DISC 1', pocket: 'discs', price: 0, effect: { kind: 'disc', move: 'chop', field: true }, desc: '' },
  field2: { name: 'FIELD DISC 2', pocket: 'discs', price: 0, effect: { kind: 'disc', move: 'paddle', field: true }, desc: '' },
  field3: { name: 'FIELD DISC 3', pocket: 'discs', price: 0, effect: { kind: 'disc', move: 'heave', field: true }, desc: '' },
  field4: { name: 'FIELD DISC 4', pocket: 'discs', price: 0, effect: { kind: 'disc', move: 'glow', field: true }, desc: '' },
  field5: { name: 'FIELD DISC 5', pocket: 'discs', price: 0, effect: { kind: 'disc', move: 'soar', field: true }, desc: '' },

  // ─── Key items ─────────────────────────────────────────
  almanac: { name: 'ALMANAC', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'Records every critter you see and catch.' },
  parcel: { name: 'PARCEL', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'A parcel for PROF. STERLING from the shop.' },
  bicycle: { name: 'BICYCLE', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'A folding bicycle. Twice as fast as walking.' },
  twigRod: { name: 'TWIG ROD', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'A twig with a line. Fish where the water is.' },
  reelRod: { name: 'REEL ROD', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'A decent rod with a reel.' },
  proRod: { name: 'PRO ROD', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'The best rod money can buy.' },
  regionMap: { name: 'REGION MAP', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'A map of the ARGENT region.' },
  coinDetector: { name: 'COIN FINDER', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'Beeps when hidden items are nearby.' },
  ferryTicket: { name: 'FERRY TICKET', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'A ticket for the ferry to DOUBLOON ISLE.' },
  spiritLens: { name: 'SPIRIT LENS', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'Shows the true shape of restless spirits.' },
  shareCharm: { name: 'SHARE CHARM', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'Shares battle experience with the whole team.' },
  vaultKey: { name: 'VAULT KEY', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'Opens the vault doors in CROWN TOWER.' },
  liftKey: { name: 'LIFT KEY', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'Works the lift in the GILDED HAND hideout.' },
  forgeKey: { name: 'FORGE KEY', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'Opens the ARENA door on DOUBLOON ISLE.' },
  jawFossil: { name: 'JAW FOSSIL', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'The fossil of an ancient armoured fish.' },
  oldCoin: { name: 'OLD COIN', pocket: 'key', price: 0, effect: { kind: 'key' }, desc: 'A strange coin stamped with a crown. It feels warm.' },
} satisfies Record<string, Def>

export type ItemId = keyof typeof RAW

export const ITEMS: Readonly<Record<ItemId, ItemData>> = Object.fromEntries(
  Object.entries(RAW).map(([id, d]) => [id, { id, ...d }]),
) as unknown as Record<ItemId, ItemData>

export const ITEM_IDS = Object.keys(RAW) as ItemId[]

export function item(id: ItemId): ItemData {
  const it = ITEMS[id]
  if (!it) throw new Error(`unknown item ${id}`)
  return it
}

export function isItemId(id: string): id is ItemId {
  return id in RAW
}

/** The disc that teaches a move, if any. */
export function discFor(move: MoveId): ItemId | null {
  for (const id of ITEM_IDS) {
    const e = ITEMS[id].effect
    if (e.kind === 'disc' && e.move === move) return id
  }
  return null
}
