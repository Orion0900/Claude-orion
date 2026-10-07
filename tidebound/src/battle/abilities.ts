import type { SpeciesId } from '../data/dex'
import type { TypeId } from '../data/types'
import type { Creature } from './types'

/**
 * Abilities: a quiet trait every beast has, decided by its species. The
 * battle engine checks them at the moments named in each description.
 * Names and effects are the game's own.
 */
export const ABILITY_IDS = [
  'thicket',
  'flashpoint',
  'undertow',
  'hivemind',
  'blubber',
  'dewdrinker',
  'sharpsight',
  'wakeful',
  'sparkskin',
  'steadfast',
  'hardshell',
  'venomspines',
  'grit',
  'soakup',
  'hover',
  'tiderider',
  'menace',
  'steelnerve',
  'quickening',
  'stormcaller',
] as const

export type AbilityId = (typeof ABILITY_IDS)[number]

export interface AbilityData {
  id: AbilityId
  /** Upper-case display name, eleven characters at most. */
  name: string
  /** What it does, short enough for two lines of the summary. */
  desc: string
  /** For the pinch abilities: moves of this type hit 1.5× at a third of max HP or less. */
  pinch?: TypeId
}

const LIST: readonly AbilityData[] = [
  { id: 'thicket', name: 'THICKET', pinch: 'leaf', desc: 'Powers up LEAF moves when its HP runs low.' },
  { id: 'flashpoint', name: 'FLASHPOINT', pinch: 'flame', desc: 'Powers up FLAME moves when its HP runs low.' },
  { id: 'undertow', name: 'UNDERTOW', pinch: 'tide', desc: 'Powers up TIDE moves when its HP runs low.' },
  { id: 'hivemind', name: 'HIVEMIND', pinch: 'bug', desc: 'Powers up BUG moves when its HP runs low.' },
  { id: 'blubber', name: 'BLUBBER', desc: 'Thick fat halves FLAME and FROST damage.' },
  { id: 'dewdrinker', name: 'DEWDRINKER', desc: 'Slowly regains HP while it rains.' },
  { id: 'sharpsight', name: 'SHARPSIGHT', desc: 'Keen eyes make its moves more accurate.' },
  { id: 'wakeful', name: 'WAKEFUL', desc: 'Never dozes off, so it cannot be put to sleep.' },
  { id: 'sparkskin', name: 'SPARKSKIN', desc: 'Touching it may leave the attacker paralysed.' },
  { id: 'steadfast', name: 'STEADFAST', desc: 'At full HP it holds on with 1 HP after any hit.' },
  { id: 'hardshell', name: 'HARDSHELL', desc: 'A hard shell turns away lucky strikes.' },
  { id: 'venomspines', name: 'VENOMSPINES', desc: 'Touching its spines may poison the attacker.' },
  { id: 'grit', name: 'GRIT', desc: 'A status problem makes its ATTACK stronger.' },
  { id: 'soakup', name: 'SOAKUP', desc: 'TIDE moves heal it instead of hurting it.' },
  { id: 'hover', name: 'HOVER', desc: "Floats, so EARTH moves can't touch it." },
  { id: 'tiderider', name: 'TIDERIDER', desc: 'Doubles its SPEED while it rains.' },
  { id: 'menace', name: 'MENACE', desc: "Cows the foe on entry, lowering its ATTACK." },
  { id: 'steelnerve', name: 'STEELNERVE', desc: 'Foes cannot lower its stats.' },
  { id: 'quickening', name: 'QUICKENING', desc: 'Its SPEED rises at the end of every turn.' },
  { id: 'stormcaller', name: 'STORMCALLER', desc: 'Brings rain the moment it enters battle.' },
]

const BY_ID = new Map<AbilityId, AbilityData>(LIST.map((a) => [a.id, a]))

export function ability(id: AbilityId): AbilityData {
  const a = BY_ID.get(id)
  if (!a) throw new Error(`unknown ability ${id}`)
  return a
}

export const ALL_ABILITIES: readonly AbilityData[] = LIST

/** Each species' ability; evolution lines mostly share one. */
export const SPECIES_ABILITY: Record<SpeciesId, AbilityId> = {
  leafolin: 'thicket',
  frondolin: 'thicket',
  canopangol: 'thicket',
  kindlet: 'flashpoint',
  cinderam: 'flashpoint',
  volcaram: 'flashpoint',
  narlet: 'undertow',
  narwhelm: 'undertow',
  tidelance: 'undertow',
  tubbara: 'blubber',
  capybaron: 'dewdrinker',
  pufflet: 'sharpsight',
  puffinaut: 'sharpsight',
  twigling: 'hivemind',
  timberwalk: 'hivemind',
  lumigrub: 'wakeful',
  lanterwing: 'wakeful',
  zappet: 'sparkskin',
  lemurge: 'sparkskin',
  pebblit: 'steadfast',
  cragoyle: 'steadfast',
  wombit: 'hardshell',
  wombastion: 'hardshell',
  spinefin: 'venomspines',
  lionspire: 'venomspines',
  jabshrimp: 'grit',
  clobberclaw: 'grit',
  clionette: 'soakup',
  serafin: 'soakup',
  tatterling: 'hover',
  sailwraith: 'hover',
  murkeel: 'tiderider',
  moraynight: 'tiderider',
  dugling: 'dewdrinker',
  manatide: 'dewdrinker',
  cocrab: 'hardshell',
  coconclaw: 'hardshell',
  brandger: 'menace',
  sawfry: 'steelnerve',
  sawbladon: 'steelnerve',
  driftwyrm: 'quickening',
  tempestwyrm: 'stormcaller',
  atollus: 'steadfast',
}

export function abilityOf(c: Pick<Creature, 'species'>): AbilityId {
  return SPECIES_ABILITY[c.species]
}
