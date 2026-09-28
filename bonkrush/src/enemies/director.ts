/**
 * The wave director's numbers: how fast things spawn, what spawns, how tough
 * it is and when the set pieces happen. Pure, so every formula in the design
 * doc is pinned by tests and the Spawner only decides *where*.
 */
import type { EnemyBehavior, Settings } from '../game/types'

/** Stage-time (seconds) at which roster[i] starts appearing. */
export const ROSTER_UNLOCKS: readonly number[] = [0, 45, 105, 180, 270, 360]

/** Spawn ring around the player, metres. */
export const SPAWN_RING_MIN = 28
export const SPAWN_RING_MAX = 40
/** Normals further than this are fair game for recycling when the map is full. */
export const RECYCLE_DISTANCE = 45
/** Normals further than this are recycled even below the cap, so a sliding player never loses the horde. */
export const STRAGGLER_DISTANCE = 75
export const WAVE_INTERVAL = 60
export const SWARM_RATE = 14

/** Final-swarm ghost tiers: normal, purple (+3:00) and red (+6:00). */
export type GhostTier = 0 | 1 | 2
export const GHOST_TIER_START: readonly number[] = [0, 180, 360]
export const GHOST_TIER_MULT: readonly number[] = [1, 2.5, 6]
/** Instance tint per ghost tier (multiplies the ghost's near-white vertex colours). */
export const GHOST_TIER_TINT: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 1],
  [0.78, 0.42, 1.45],
  [1.55, 0.28, 0.3],
]

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Difficulty stat plus the stage's curse; never so negative that scales hit zero. */
export function effectiveDifficulty(statDifficulty: number, curse: number): number {
  const d = (statDifficulty || 0) + (curse || 0)
  return Math.max(-0.5, d)
}

export function aliveCap(quality: Settings['quality']): number {
  return quality === 'low' ? 180 : 300
}

/** Spawns per second: min(12, 1 + 0.55 × min^1.25) × (1 + difficulty × 0.6). */
export function spawnRate(stageTime: number, difficulty: number): number {
  const m = Math.max(0, stageTime) / 60
  return Math.min(12, 1 + 0.55 * Math.pow(m, 1.25)) * (1 + difficulty * 0.6)
}

/** Final-swarm ghosts per second. */
export function swarmRate(difficulty: number): number {
  return SWARM_RATE * (1 + difficulty * 0.6)
}

/** When roster[i] unlocks; a roster longer than the table keeps adding one every 90 s. */
export function unlockTime(i: number): number {
  const last = ROSTER_UNLOCKS.length - 1
  return i <= last ? ROSTER_UNLOCKS[i] : ROSTER_UNLOCKS[last] + 90 * (i - last)
}

/** How many roster entries are unlocked at this stage time (at least one). */
export function unlockedCount(stageTime: number, rosterLength: number): number {
  let n = rosterLength > 0 ? 1 : 0
  for (let i = 1; i < rosterLength; i++) if (stageTime >= unlockTime(i)) n = i + 1
  return n
}

/** Spawn-mix weight by behavior: tanks and specialists are spice, not the meal. */
export function behaviorSpawnWeight(behavior: EnemyBehavior): number {
  switch (behavior) {
    case 'swarmer':
      return 1.1
    case 'flier':
      return 0.9
    case 'ranged':
      return 0.7
    case 'charger':
      return 0.6
    case 'exploder':
      return 0.6
    case 'tank':
      return 0.35
    case 'boss':
      return 0
    default:
      return 1
  }
}

/**
 * Roster weights at this time, written into `out` (locked entries get 0).
 * The newest few types are favoured, and a freshly unlocked type ramps in
 * over 40 s so it trickles in rather than flooding the screen.
 */
export function rosterWeights(stageTime: number, rosterLength: number, out: number[]): number[] {
  out.length = rosterLength
  const k = unlockedCount(stageTime, rosterLength)
  for (let i = 0; i < rosterLength; i++) {
    if (i >= k) {
      out[i] = 0
      continue
    }
    const rank = k - 1 - i
    const base = rank === 0 ? 2.4 : rank === 1 ? 1.8 : rank === 2 ? 1.3 : 0.7
    const ramp = i === 0 ? 1 : clamp01((stageTime - unlockTime(i)) / 40)
    out[i] = base * (0.35 + 0.65 * ramp)
  }
  return out
}

/** Normal-enemy HP scale: (1 + 0.10 × min)^1.35 × stage scale × (1 + difficulty). */
export function hpScale(stageTime: number, enemyScale: number, difficulty: number): number {
  const m = Math.max(0, stageTime) / 60
  return Math.pow(1 + 0.1 * m, 1.35) * enemyScale * (1 + difficulty)
}

/** Normal-enemy damage scale: (1 + 0.06 × min) × stage scale^0.6 × (1 + difficulty × 0.5). */
export function damageScale(stageTime: number, enemyScale: number, difficulty: number): number {
  const m = Math.max(0, stageTime) / 60
  return (1 + 0.06 * m) * Math.pow(enemyScale, 0.6) * (1 + difficulty * 0.5)
}

/**
 * Minibosses' base HP already climbs stage by stage, so only time and
 * difficulty scale them; the second one of a stage is noticeably tougher.
 */
export function minibossHpScale(stageTime: number, difficulty: number): number {
  const m = Math.max(0, stageTime) / 60
  return Math.pow(1 + 0.1 * m, 1.35) * (1 + difficulty)
}

/** Boss HP scales with how late it is summoned: (1 + t/60 × 0.35) × (1 + difficulty). */
export function bossHpScale(stageTime: number, difficulty: number): number {
  return (1 + (Math.max(0, stageTime) / 60) * 0.35) * (1 + difficulty)
}

/** Boss and miniboss hits: their base damage is already per stage. */
export function bossDamageScale(difficulty: number): number {
  return 1 + difficulty * 0.5
}

/** Chance that a spawn is an elite: 0.006 + 0.01 × minutes, capped at 6%. */
export function eliteChance(stageTime: number): number {
  return Math.min(0.06, 0.006 + 0.01 * (Math.max(0, stageTime) / 60))
}

export function ghostTier(swarmSeconds: number): GhostTier {
  if (swarmSeconds >= GHOST_TIER_START[2]) return 2
  if (swarmSeconds >= GHOST_TIER_START[1]) return 1
  return 0
}

/** Ghost HP on top of the normal scale: +25% per 30 s of swarm, times the tier. */
export function swarmHpMultiplier(swarmSeconds: number): number {
  const s = Math.max(0, swarmSeconds)
  return (1 + 0.25 * Math.floor(s / 30)) * GHOST_TIER_MULT[ghostTier(s)]
}

export function swarmDamageMultiplier(swarmSeconds: number): number {
  return GHOST_TIER_MULT[ghostTier(Math.max(0, swarmSeconds))]
}

/**
 * Stage times (seconds since the stage began) when the two minibosses
 * arrive: at 7:00 and 2:00 left, or 6:30 and 3:00 left on stage 3.
 */
export function minibossTimes(stageIndex: number, duration: number): [number, number] {
  const left = stageIndex >= 2 ? [390, 180] : [420, 120]
  return [Math.max(0, duration - left[0]), Math.max(0, duration - left[1])]
}

/** Which 60 s wave slot a stage time falls in; a wave fires when this goes up (never at 0). */
export function waveIndex(stageTime: number): number {
  return Math.floor(Math.max(0, stageTime) / WAVE_INTERVAL)
}

/** A themed wave: 20–40 of one type, bigger later, thinner for heavy types. */
export function waveCount(stageTime: number, behavior: EnemyBehavior, roll: number): number {
  const m = Math.max(0, stageTime) / 60
  const base = 20 + Math.min(1, m / 8) * 14 + clamp01(roll) * 6
  const thin = behavior === 'tank' ? 0.3 : behavior === 'charger' || behavior === 'exploder' || behavior === 'ranged' ? 0.6 : 1
  return Math.max(4, Math.min(40, Math.round(base * thin)))
}

/** Clumps are 3–8 enemies. */
export function clumpSize(roll: number): number {
  return 3 + Math.min(5, Math.floor(clamp01(roll) * 6))
}

/** 0..1 for music and UI: time into the stage and crowd size; a boss or the swarm push it up. */
export function intensityFor(
  stageTime: number,
  duration: number,
  alive: number,
  cap: number,
  bossAlive: boolean,
  finalSwarm: boolean,
): number {
  if (finalSwarm) return 1
  const time = clamp01(stageTime / Math.max(1, duration))
  const crowd = clamp01(alive / Math.max(1, cap))
  let v = 0.1 + 0.45 * time + 0.45 * crowd
  if (bossAlive) v = Math.max(v, 0.85)
  return clamp01(v)
}
