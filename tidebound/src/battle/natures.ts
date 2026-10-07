import type { Creature, StatKey } from './types'

/**
 * Every beast has a nature that nudges its stats: one stat 10% higher and
 * another 10% lower, or neither for the five even-tempered ones. The nature
 * comes from the beast's uid, so it is fixed at birth and older saves get
 * one too. Names are the game's own.
 */

export type NatureStat = Exclude<StatKey, 'hp'>

export interface Nature {
  /** Upper-case display name. */
  name: string
  /** The stat raised by 10%, or null for an even nature. */
  up: NatureStat | null
  /** The stat lowered by 10%, or null for an even nature. */
  down: NatureStat | null
}

const ORDER: readonly NatureStat[] = ['atk', 'def', 'spa', 'spd', 'spe']

/** Names by [raised][lowered], in ORDER; the diagonal is even-tempered. */
const NAMES: readonly (readonly string[])[] = [
  ['STEADY', 'RECKLESS', 'BRAWNY', 'BRASH', 'STUBBORN'],
  ['MEEK', 'EVEN', 'STURDY', 'GRUFF', 'STOLID'],
  ['BOOKISH', 'DREAMY', 'PLAIN', 'FIERY', 'PATIENT'],
  ['KINDLY', 'TENDER', 'WARY', 'MELLOW', 'SERENE'],
  ['SKITTISH', 'RESTLESS', 'PLAYFUL', 'FLIGHTY', 'BREEZY'],
]

export const NATURES: readonly Nature[] = NAMES.flatMap((row, u) =>
  row.map((name, d) => ({ name, up: u === d ? null : ORDER[u], down: u === d ? null : ORDER[d] })),
)

/** A stable number from a uid (12 hex digits), or a string hash for anything else. */
function uidNumber(uid: string): number {
  if (/^[0-9a-f]{1,12}$/i.test(uid)) return parseInt(uid, 16)
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (Math.imul(h, 31) + uid.charCodeAt(i)) >>> 0
  return h
}

export function natureOf(c: Pick<Creature, 'uid'>): Nature {
  return NATURES[uidNumber(c.uid) % NATURES.length]
}

/** 1.1, 0.9 or 1 for `stat` under this nature. */
export function natureMultiplier(n: Nature, stat: StatKey): number {
  if (stat === n.up) return 1.1
  if (stat === n.down) return 0.9
  return 1
}
