/**
 * Pure text helpers for the UI: times, counts, and what an offer card says.
 * Nothing here touches the DOM, so every string the player reads is tested.
 */
import type {
  ItemDef,
  Offer,
  Rarity,
  RunState,
  StatId,
  StatMod,
  TomeDef,
  WeaponDef,
  WeaponStatKey,
  WeaponStats,
} from '../game/types'
import { RARITY_MULT } from '../progression/rarity'
import { STAT_INFO, describeMod, scaleMod } from '../progression/stats'

// ─────────────────────────────── numbers ───────────────────────────────

/** "9:05"; hours appear only past an hour. Negative and NaN read as 0:00. */
export function formatTime(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = pad2(s % 60)
  return h > 0 ? `${h}:${pad2(m)}:${ss}` : `${m}:${ss}`
}

const COUNT_UNITS = ['k', 'M', 'B', 'T']

/**
 * Compact counts for the HUD: 999, 1.5k, 12.3k, 123k, 4.5M. Rounds down, so a
 * gold total never reads as more than the player can spend.
 */
export function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '0'
  const sign = n < 0 ? '-' : ''
  let x = Math.abs(n)
  if (x < 1000) return sign + Math.floor(x + 1e-9)
  let unit = -1
  while (x >= 1000 && unit < COUNT_UNITS.length - 1) {
    x /= 1000
    unit++
  }
  const shown = x < 100 ? Math.floor(x * 10 + 1e-9) / 10 : Math.floor(x + 1e-9)
  return sign + (Number.isInteger(shown) ? String(shown) : shown.toFixed(1)) + COUNT_UNITS[unit]
}

/** A plain number for cards: at most two decimals, no trailing zeros, ∞ for Infinity. */
export function formatNumber(v: number): string {
  if (v === Infinity) return '∞'
  if (v === -Infinity) return '-∞'
  if (!Number.isFinite(v)) return '0'
  const r = Math.round(v * 100) / 100
  return String(Object.is(r, -0) ? 0 : r)
}

/** Share of a bar, clamped to 0..1; a zero or broken maximum reads as empty. */
export function fraction(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value / max))
}

// ─────────────────────────────── HUD text ───────────────────────────────

/**
 * The countdown as one integer that changes once per displayed second, so the
 * HUD can skip DOM work until it does. Positive: whole seconds left, rounded
 * up so the clock starts at 10:00 and hits 0:00 exactly at the swarm.
 * Zero or negative: -(seconds into the final swarm) - 1.
 */
export function timerKey(stageTime: number, duration: number): number {
  const remaining = duration - stageTime
  if (!Number.isFinite(remaining)) return 0
  if (remaining > 0) return Math.ceil(remaining)
  return -1 - Math.floor(-remaining)
}

export interface TimerLabel {
  text: string
  /** Swarm elapsed time, or '' before the swarm. */
  sub: string
  swarm: boolean
  /** The last half minute before the swarm. */
  urgent: boolean
}

export function timerLabel(key: number): TimerLabel {
  if (key > 0) return { text: formatTime(key), sub: '', swarm: false, urgent: key <= 30 }
  return { text: 'FINAL SWARM', sub: `+${formatTime(-key - 1)}`, swarm: true, urgent: false }
}

/** "E — Open chest · 34 🪙", or "Tap ✋ — …" on touch; unaffordable when the cost beats the gold. */
export function promptLabel(
  prompt: { text: string; cost?: number },
  isTouch: boolean,
  gold: number,
): { text: string; affordable: boolean } {
  const key = isTouch ? 'Tap ✋' : 'E'
  const cost = prompt.cost
  const hasCost = cost !== undefined && Number.isFinite(cost) && cost > 0
  return {
    text: `${key} — ${prompt.text}${hasCost ? ` · ${formatCount(cost)} 🪙` : ''}`,
    affordable: !hasCost || Math.floor(gold) >= cost,
  }
}

/** The stage-start banner's line: what a new player is here to do. */
export const STAGE_GOAL = 'Find the ☠ altar to summon the boss'

export interface Objective {
  text: string
  kind: 'altar' | 'boss' | 'portal'
}

/**
 * The standing hint under the stage name: summon the boss at the altar, beat
 * it, then leave through the portal it opens.
 */
export function objectiveLabel(run: Pick<RunState, 'bossSpawned' | 'portalOpen'>): Objective {
  if (run.portalOpen) return { text: 'Portal open!', kind: 'portal' }
  if (run.bossSpawned) return { text: 'Beat the boss to open the portal', kind: 'boss' }
  return { text: '☠ Altar: summon the boss', kind: 'altar' }
}

/** The controls line on the title and pause screens (DESIGN.md, Controls). */
export function controlsHint(touch: boolean): string {
  return touch
    ? 'Left thumb: move · Drag right: look · ⤒ jump · ⤓ slide · ✋ interact'
    : 'WASD move · Mouse look · Space jump · Shift / C / right mouse slide · E interact · Tab stats · Esc pause'
}

// ─────────────────────────────── weapons ───────────────────────────────

export const WEAPON_STAT_LABEL: Record<WeaponStatKey, string> = {
  damage: 'Damage',
  cooldown: 'Cooldown',
  count: 'Projectiles',
  size: 'Size',
  speed: 'Speed',
  duration: 'Duration',
  pierce: 'Pierce',
  bounces: 'Bounces',
  range: 'Range',
  knockback: 'Knockback',
  critChance: 'Crit Chance',
}

/** The order changes read in, most important first. */
const WEAPON_STAT_ORDER: readonly WeaponStatKey[] = [
  'damage',
  'count',
  'cooldown',
  'size',
  'speed',
  'duration',
  'pierce',
  'bounces',
  'range',
  'knockback',
  'critChance',
]

function weaponValue(key: WeaponStatKey, v: number): string {
  if (key === 'critChance') return `${formatNumber(v * 100)}%`
  if (key === 'cooldown' || key === 'duration') return `${formatNumber(v)}s`
  return formatNumber(v)
}

/** One upgrade step as a card reads it: "+3 Damage", "-0.08s Cooldown", "+4% Crit Chance". */
export function describeWeaponChange(key: WeaponStatKey, value: number): string {
  const sign = value < 0 ? '-' : '+'
  return `${sign}${weaponValue(key, Math.abs(value))} ${WEAPON_STAT_LABEL[key]}`
}

export function weaponChangeLines(changes: Partial<WeaponStats>): string[] {
  const out: string[] = []
  for (const key of WEAPON_STAT_ORDER) {
    const v = changes[key]
    if (v === undefined || v === 0 || Number.isNaN(v)) continue
    out.push(describeWeaponChange(key, v))
  }
  return out
}

/** Label/value rows for a weapon's numbers (tooltips and new-weapon cards). Zero rows are left out. */
export function weaponStatRows(stats: WeaponStats): Array<[string, string]> {
  const rows: Array<[string, string]> = []
  for (const key of WEAPON_STAT_ORDER) {
    const v = stats[key]
    if (!v || Number.isNaN(v)) continue
    rows.push([WEAPON_STAT_LABEL[key], weaponValue(key, v)])
  }
  return rows
}

/** The headline numbers of a weapon nobody owns yet. */
function newWeaponLines(base: WeaponStats): string[] {
  const lines = [`${formatNumber(base.damage)} Damage`, `${formatNumber(base.cooldown)}s Cooldown`]
  if (base.count > 1) lines.push(`×${formatNumber(base.count)} Projectiles`)
  return lines
}

// ─────────────────────────────── stats ───────────────────────────────

export const STAT_ICON: Record<StatId, string> = {
  maxHp: '❤️',
  regen: '💗',
  overheal: '💖',
  shield: '🛡️',
  armor: '🪨',
  evasion: '💨',
  lifesteal: '🩸',
  thorns: '🌵',
  damage: '💪',
  critChance: '🎯',
  critDamage: '💥',
  attackSpeed: '⚡',
  projectiles: '➕',
  bounces: '🔁',
  size: '🔷',
  projectileSpeed: '🏹',
  duration: '⏳',
  eliteDamage: '👑',
  knockback: '👊',
  moveSpeed: '👟',
  extraJumps: '🦘',
  jumpHeight: '🪽',
  luck: '🍀',
  difficulty: '😈',
  pickupRange: '🧲',
  xpGain: '📘',
  goldGain: '🪙',
  silverGain: '🥈',
}

/**
 * Folds a list of mods into one per stat and op (adds summed, muls
 * multiplied), keeping first-seen order: a tome's ten levels read as one line.
 */
export function sumMods(mods: readonly StatMod[]): StatMod[] {
  const out: StatMod[] = []
  for (const m of mods) {
    const same = out.find((o) => o.stat === m.stat && o.op === m.op)
    if (!same) out.push({ ...m })
    else if (m.op === 'add') same.value += m.value
    else same.value *= m.value
  }
  return out
}

// ─────────────────────────────── offers ───────────────────────────────

/** What the offer text needs to know about content and the player's inventory. */
export interface DefLookups {
  weapon(id: string): Pick<WeaponDef, 'name' | 'icon' | 'description' | 'base'> | undefined
  tome(id: string): Pick<TomeDef, 'name' | 'icon' | 'description' | 'perLevel'> | undefined
  item(id: string): Pick<ItemDef, 'name' | 'icon' | 'description'> | undefined
  /** 0 when not owned. */
  weaponLevel(id: string): number
  tomeLevel(id: string): number
  itemStacks(id: string): number
}

export type OfferKind = 'weapon' | 'tome' | 'item' | 'stat' | 'gold' | 'heal'

/** Everything an offer card shows. */
export interface OfferView {
  kind: OfferKind
  icon: string
  name: string
  rarity: Rarity
  /** "NEW!", "Lv 3 → 4", "×2", "Boon" or ''. */
  tag: string
  isNew: boolean
  /** Exact effect lines. */
  lines: string[]
  /** Flavour or rules text; may be empty. */
  description: string
}

function levelTag(level: number): string {
  return level > 0 ? `Lv ${level} → ${level + 1}` : 'Upgrade'
}

function tomeLines(perLevel: readonly StatMod[], rarity: Rarity): string[] {
  const mult = RARITY_MULT[rarity] ?? 1
  return perLevel.map((m) => describeMod(scaleMod(m, mult)))
}

export function describeOffer(offer: Offer, look: DefLookups): OfferView {
  switch (offer.type) {
    case 'newWeapon': {
      const def = look.weapon(offer.id)
      const lines = def ? newWeaponLines(def.base) : []
      return {
        kind: 'weapon',
        icon: def?.icon ?? '⚔️',
        name: def?.name ?? offer.id,
        rarity: offer.rarity,
        tag: 'NEW!',
        isNew: true,
        lines,
        description: def?.description ?? '',
      }
    }
    case 'weaponUpgrade': {
      const def = look.weapon(offer.id)
      return {
        kind: 'weapon',
        icon: def?.icon ?? '⚔️',
        name: def?.name ?? offer.id,
        rarity: offer.rarity,
        tag: levelTag(look.weaponLevel(offer.id)),
        isNew: false,
        lines: weaponChangeLines(offer.changes),
        description: '',
      }
    }
    case 'newTome':
    case 'tomeUpgrade': {
      const def = look.tome(offer.id)
      const lines = def ? tomeLines(def.perLevel, offer.rarity) : []
      const isNew = offer.type === 'newTome'
      return {
        kind: 'tome',
        icon: def?.icon ?? '📕',
        name: def?.name ?? offer.id,
        rarity: offer.rarity,
        tag: isNew ? 'NEW!' : levelTag(look.tomeLevel(offer.id)),
        isNew,
        lines,
        // A tome with no fixed mods (chaos) explains itself in its description.
        description: lines.length === 0 ? (def?.description ?? '') : '',
      }
    }
    case 'stat': {
      const first = offer.mods[0]
      return {
        kind: 'stat',
        icon: first ? STAT_ICON[first.stat] : '✨',
        name: boonName(offer.mods),
        rarity: offer.rarity,
        tag: 'Boon',
        isNew: false,
        lines: offer.mods.map(describeMod),
        description: '',
      }
    }
    case 'item': {
      const def = look.item(offer.id)
      const stacks = look.itemStacks(offer.id)
      return {
        kind: 'item',
        icon: def?.icon ?? '🎁',
        name: def?.name ?? offer.id,
        rarity: offer.rarity,
        tag: stacks > 1 ? `×${stacks}` : 'NEW!',
        isNew: stacks <= 1,
        lines: [],
        description: def?.description ?? '',
      }
    }
    case 'gold':
      return {
        kind: 'gold',
        icon: '🪙',
        name: 'Pile of Gold',
        rarity: offer.rarity,
        tag: '',
        isNew: false,
        lines: [`+${formatCount(offer.amount)} Gold`],
        description: '',
      }
    case 'heal':
      return {
        kind: 'heal',
        icon: '🍖',
        name: 'Hearty Snack',
        rarity: offer.rarity,
        tag: '',
        isNew: false,
        lines: [`Heal ${formatCount(offer.amount)} HP`],
        description: '',
      }
  }
}

/**
 * A shrine boon is named after the stat it raises, like a tome card; its
 * lines carry the numbers (the offer's own label repeats those lines).
 */
function boonName(mods: readonly StatMod[]): string {
  const labels = [...new Set(mods.map((m) => STAT_INFO[m.stat]?.label ?? m.stat))]
  if (labels.length === 0) return 'Boon'
  return labels.length <= 2 ? labels.join(' & ') : 'Mixed Boon'
}

/** The chest sting climbs with rarity so a legendary sounds like one. */
export const RARITY_PITCH: Record<Rarity, number> = {
  common: 0.9,
  uncommon: 1,
  rare: 1.12,
  epic: 1.26,
  legendary: 1.45,
}

/** Bar lengths for the damage-by-weapon list: each value over the largest, 0 if nothing was dealt. */
export function barShares(values: readonly number[]): number[] {
  let max = 0
  for (const v of values) if (Number.isFinite(v) && v > max) max = v
  return values.map((v) => (max > 0 && Number.isFinite(v) ? Math.max(0, v) / max : 0))
}

/** "3 of 5" style pip text for limited charges, never negative. */
export function charges(n: number): string {
  return String(Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)))
}

/** The best stage as the records screen says it; `bestStage` counts stages cleared. */
export function bestStageLabel(bestStage: number, stageCount: number, runs: number): string {
  if (runs <= 0) return '—'
  if (bestStage >= stageCount) return 'Victory!'
  return `Stage ${Math.max(0, Math.floor(bestStage)) + 1}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}
