/**
 * Every enemy in Bonkrush, straight from the design doc's table. The director
 * scales HP and damage by time, stage and difficulty; these are the base
 * numbers. `model` names a preset in `EnemyModels.ts`.
 */
import type { EnemyDef } from '../game/types'
import { MINIBOSSES } from '../data/stages'

/** Normals: a 25% chance of 1–2 gold (elites always drop 8–15; the manager handles that). */
const COMMON_GOLD = { chance: 0.25, min: 1, max: 2 }

type Base = Omit<EnemyDef, 'id' | 'gold' | 'model'> & Partial<Pick<EnemyDef, 'gold' | 'model'>>

function def(id: string, d: Base): EnemyDef {
  return { id, gold: COMMON_GOLD, model: id, ...d }
}

const LIST: EnemyDef[] = [
  // ── Greenwood ──
  def('sprout', {
    name: 'Sprout', behavior: 'chaser', hp: 8, damage: 6, speed: 4.2, radius: 0.45, height: 0.95, xp: 1,
    color: '#9be05a', accent: '#3f9e3a', weight: 0.05,
  }),
  def('goblin', {
    name: 'Goblin', behavior: 'chaser', hp: 16, damage: 8, speed: 4.6, radius: 0.5, height: 1.25, xp: 1,
    color: '#62c24c', accent: '#8a5a2b', weight: 0.15,
  }),
  def('bat', {
    name: 'Bat', behavior: 'flier', hp: 7, damage: 5, speed: 6.5, radius: 0.4, height: 0.6, xp: 1,
    color: '#7a55b0', accent: '#ff4f7a', weight: 0,
  }),
  def('shroom', {
    name: 'Shroom', behavior: 'ranged', hp: 20, damage: 7, speed: 3, radius: 0.55, height: 1.1, xp: 2,
    color: '#e8453a', accent: '#f6ead0', weight: 0.2,
    projectile: { damage: 7, speed: 10, cooldown: 2.5, range: 18, color: '#c77bff' },
  }),
  def('boar', {
    name: 'Boar', behavior: 'charger', hp: 34, damage: 12, speed: 3.8, radius: 0.7, height: 1.05, xp: 3,
    color: '#8c5a3a', accent: '#f6eed6', weight: 0.45,
  }),
  def('treant', {
    name: 'Treant', behavior: 'tank', hp: 110, damage: 16, speed: 2.4, radius: 1.1, height: 3.0, xp: 6,
    color: '#7a5230', accent: '#58b83c', weight: 0.85,
  }),
  // ── Sunscorch Dunes ──
  def('scarab', {
    name: 'Scarab', behavior: 'swarmer', hp: 10, damage: 6, speed: 7, radius: 0.4, height: 0.5, xp: 1,
    color: '#26a69a', accent: '#ffd23f', weight: 0.05,
  }),
  def('mummy', {
    name: 'Mummy', behavior: 'chaser', hp: 30, damage: 10, speed: 3.8, radius: 0.55, height: 1.75, xp: 2,
    color: '#eadfc4', accent: '#3fd8ff', weight: 0.25,
  }),
  def('vulture', {
    name: 'Vulture', behavior: 'flier', hp: 16, damage: 8, speed: 7, radius: 0.55, height: 0.85, xp: 2,
    color: '#5e4838', accent: '#ff9aa2', weight: 0.1,
  }),
  def('scorpion', {
    name: 'Scorpion', behavior: 'ranged', hp: 36, damage: 10, speed: 3.2, radius: 0.7, height: 0.85, xp: 3,
    color: '#e0862e', accent: '#7a3a1a', weight: 0.4,
    projectile: { damage: 10, speed: 14, cooldown: 2, range: 20, color: '#b8ff3b' },
  }),
  def('cactoid', {
    name: 'Cactoid', behavior: 'exploder', hp: 20, damage: 25, speed: 5.5, radius: 0.55, height: 1.35, xp: 2,
    color: '#3fae4a', accent: '#ff5aa0', weight: 0.2,
  }),
  def('sand_golem', {
    name: 'Sand Golem', behavior: 'tank', hp: 220, damage: 22, speed: 2.4, radius: 1.3, height: 3.0, xp: 8,
    color: '#dcb66e', accent: '#a8742f', weight: 0.9,
  }),
  // ── Hollow Crypt ──
  def('skeleton', {
    name: 'Skeleton', behavior: 'chaser', hp: 44, damage: 12, speed: 4.4, radius: 0.5, height: 1.75, xp: 2,
    color: '#f0ead8', accent: '#ff4a3a', weight: 0.2,
  }),
  def('ghoul', {
    name: 'Ghoul', behavior: 'swarmer', hp: 30, damage: 10, speed: 7.2, radius: 0.45, height: 1.35, xp: 2,
    color: '#86a870', accent: '#ff3b3b', weight: 0.15,
  }),
  def('wisp', {
    name: 'Wisp', behavior: 'flier', hp: 36, damage: 10, speed: 5.5, radius: 0.45, height: 0.95, xp: 3,
    color: '#5affd6', accent: '#eafff9', weight: 0.1,
    projectile: { damage: 12, speed: 15, cooldown: 1.8, range: 18, color: '#7afff0' },
  }),
  def('pumpkin_bomb', {
    name: 'Pumpkin Bomb', behavior: 'exploder', hp: 40, damage: 34, speed: 6, radius: 0.6, height: 1.05, xp: 3,
    color: '#ff8a1f', accent: '#ffe45a', weight: 0.25,
  }),
  def('gargoyle', {
    name: 'Gargoyle', behavior: 'charger', hp: 90, damage: 20, speed: 4.5, radius: 0.8, height: 1.85, xp: 5,
    color: '#8d93a8', accent: '#ff4a3a', weight: 0.5,
  }),
  def('crypt_knight', {
    name: 'Crypt Knight', behavior: 'tank', hp: 380, damage: 30, speed: 2.8, radius: 1.1, height: 2.7, xp: 10,
    color: '#5a6378', accent: '#9dff6a', weight: 0.9,
  }),
  // ── Final swarm ──
  def('ghost', {
    name: 'Ghost', behavior: 'chaser', hp: 60, damage: 18, speed: 7.5, radius: 0.55, height: 1.5, xp: 1,
    color: '#eef3ff', accent: '#2a2440', weight: 0.3,
  }),
  // ── Minibosses ──
  def('stone_golem', {
    name: 'Stone Golem', behavior: 'tank', hp: 900, damage: 24, speed: 3.2, radius: 1.6, height: 3.8, xp: 60,
    color: '#9ca3ab', accent: '#7dff9a', weight: 0.95, gold: { chance: 1, min: 40, max: 40 },
  }),
  def('scorpion_king', {
    name: 'Scorpion King', behavior: 'ranged', hp: 2200, damage: 30, speed: 3.6, radius: 1.6, height: 2.4, xp: 120,
    color: '#b8452a', accent: '#ffd23f', weight: 0.95, gold: { chance: 1, min: 40, max: 40 },
    projectile: { damage: 22, speed: 16, cooldown: 2.4, range: 26, color: '#c8ff3b' },
  }),
  def('bone_colossus', {
    name: 'Bone Colossus', behavior: 'tank', hp: 5000, damage: 40, speed: 3.4, radius: 1.8, height: 4.4, xp: 220,
    color: '#ebe3cb', accent: '#9a63ff', weight: 0.97, gold: { chance: 1, min: 40, max: 40 },
    projectile: { damage: 26, speed: 11, cooldown: 3.2, range: 26, color: '#f3ecd2' },
  }),
  // ── Bosses ──
  def('barkzilla', {
    name: 'Barkzilla', behavior: 'boss', hp: 6000, damage: 30, speed: 3.4, radius: 2.6, height: 7.2, xp: 500,
    color: '#6b4424', accent: '#ffcf3a', weight: 1, gold: { chance: 1, min: 100, max: 100 },
    projectile: { damage: 18, speed: 11, cooldown: 2.2, range: 28, color: '#a6e85a' },
  }),
  def('jackal_pharaoh', {
    name: 'Jackal Pharaoh', behavior: 'boss', hp: 16000, damage: 42, speed: 4, radius: 2.4, height: 6.2, xp: 900,
    color: '#2b2b3d', accent: '#ffc83a', weight: 1, gold: { chance: 1, min: 100, max: 100 },
    projectile: { damage: 26, speed: 20, cooldown: 2.2, range: 30, color: '#ffd76a' },
  }),
  def('grave_warden', {
    name: 'Grave Warden', behavior: 'boss', hp: 40000, damage: 55, speed: 4, radius: 2.6, height: 6.6, xp: 1500,
    color: '#3b2f58', accent: '#6affb0', weight: 1, gold: { chance: 1, min: 100, max: 100 },
    projectile: { damage: 32, speed: 12, cooldown: 2, range: 28, color: '#d8fff0' },
  }),
]

export const ENEMIES: Readonly<Record<string, EnemyDef>> = Object.freeze(
  Object.fromEntries(LIST.map((d) => [d.id, d])),
)

export type EnemyTier = 'normal' | 'miniboss' | 'boss'

/** Minibosses are listed per stage in `data/stages.ts`; bosses have the 'boss' behavior. */
export function tierOf(def: EnemyDef): EnemyTier {
  if (def.behavior === 'boss') return 'boss'
  return MINIBOSSES.includes(def.id) ? 'miniboss' : 'normal'
}
