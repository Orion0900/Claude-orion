/**
 * Decides where and when enemies arrive, following the director's numbers:
 * clumps on a ring around the player, minibosses, waves and encirclements on
 * schedule, the final swarm when the clock runs out, and the boss when the
 * altar is used. Per-stage, like the EnemyManager it spawns into.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import { MINIBOSSES, SWARM_ENEMY } from '../data/stages'
import type { Enemy, EnemyApi, GameContext, SpawnerApi, Vec3 } from '../game/types'
import { PLAY_LIMIT } from '../world/colliders'
import {
  ENCIRCLE_RADIUS,
  ENCIRCLE_WARNING,
  GHOST_TIER_TINT,
  RECYCLE_DISTANCE,
  SPAWN_RING_MAX,
  SPAWN_RING_MIN,
  STRAGGLER_DISTANCE,
  aliveCap,
  behaviorSpawnWeight,
  bossHpScale,
  clumpSize,
  effectiveDifficulty,
  eliteChance,
  encircleCount,
  encircleTimes,
  ghostTier,
  hpScale,
  intensityFor,
  minibossTimes,
  rosterWeights,
  spawnRate,
  swarmDamageMultiplier,
  swarmHpMultiplier,
  swarmRate,
  waveCount,
  waveIndex,
  type GhostTier,
} from './director'
import { ENEMIES, tierOf } from './enemyDefs'
import { pin, relocate, setVariant } from './entity'
import { circlePoint, clampToSquare, ringPoint, ringSpots, type Point2 } from './placement'

/** Spawns stay this far inside the walls (the walkable square is ±PLAY_LIMIT). */
const EDGE_MARGIN = 4
const CLUMP_SPREAD = 5
const WAVE_RADIUS = 30
const CHALLENGE_RADIUS = 9
const BOSS_DISTANCE = 14
/** Spawn budget can't pile up past this while the map is full. */
const MAX_BUDGET = 24
/** Waves may push the crowd this far over the alive cap when nothing far off can make room. */
const SET_PIECE_OVERFLOW = 1.35
/**
 * In the final swarm at the cap, the furthest old-roster enemy gives way to
 * each arriving ghost; only the ones already in the player's face stay put.
 */
const SWARM_REPLACE_DISTANCE = 8
const MIST = '#e8e8ff'
/** Seconds late after which a scheduled encirclement is skipped. */
const ENCIRCLE_STALE = 3
const WARN = '#ff3b3b'

/** EnemyManager.remove: a despawn with no kill. Not on the EnemyApi contract, so it is looked up. */
interface Remover {
  remove(enemy: Enemy): void
}

function removerOf(api: EnemyApi): Remover | null {
  return typeof (api as Partial<Remover>).remove === 'function' ? (api as unknown as Remover) : null
}

export class Spawner implements SpawnerApi {
  private readonly ctx: GameContext
  private readonly rng: Rng
  private budget = 0
  private nextClump = 5
  private lastWave = 0
  private readonly minibossDone = [false, false]
  private readonly encircleWarned = [false, false]
  private readonly encircleDone = [false, false]
  private swarm = false
  private swarmTier: GhostTier = 0
  private bossSummoned = false
  private straggleTimer = 1
  private level = 0
  private readonly weights: number[] = []
  private readonly spot: Point2 = { x: 0, z: 0 }
  private readonly ring: Point2[] = []
  private readonly at = new THREE.Vector3()

  constructor(ctx: GameContext) {
    this.ctx = ctx
    this.rng = ctx.rng.fork(0x5b0a1)
    this.reset()
  }

  get intensity(): number {
    return this.level
  }

  get finalSwarm(): boolean {
    return this.swarm
  }

  update(dt: number): void {
    const ctx = this.ctx
    const run = ctx.run
    const t = run.stageTime
    if (ctx.player.alive) {
      const diff = this.difficulty()
      const cap = aliveCap(ctx.settings.quality)

      this.straggleTimer -= dt
      if (this.straggleTimer <= 0) {
        this.straggleTimer = 1
        this.recycleStragglers(8)
      }

      if (!this.swarm && t >= run.stageDuration) this.startSwarm()

      if (this.swarm) {
        const tier = ghostTier(t - run.stageDuration)
        if (tier > this.swarmTier) {
          this.swarmTier = tier
          ctx.ui.toast(tier === 1 ? 'The dead grow restless…' : 'The dead are furious!', tier === 1 ? '#c86bff' : '#ff3b3b')
        }
        this.budget += swarmRate(diff) * dt
      } else {
        // Beating the boss skips the clock; don't dump every skipped set piece at once.
        if (!run.bossDefeated) {
          this.checkMinibosses(t)
          this.checkEncirclements(t)
          this.checkWaves(t, cap)
        }
        this.budget += spawnRate(t, diff, ctx.stage.index, !!ctx.enemies.boss) * dt
      }

      this.budget = Math.min(this.budget, MAX_BUDGET)
      while (this.budget >= this.nextClump) {
        const size = this.nextClump
        this.budget -= size
        this.nextClump = clumpSize(this.rng.next())
        if (!this.spawnClump(size, t, diff, cap)) break
      }
    }

    const target = intensityFor(t, run.stageDuration, ctx.enemies.aliveCount, aliveCap(ctx.settings.quality), !!ctx.enemies.boss, this.swarm)
    this.level += (target - this.level) * Math.min(1, dt * 1.5)
  }

  summonBoss(): void {
    const ctx = this.ctx
    const run = ctx.run
    if (this.bossSummoned || run.bossSpawned || run.bossDefeated) return
    const def = ENEMIES[ctx.stage.bossId]
    if (!def) return
    const p = ctx.player.pos
    const yaw = ctx.player.yaw
    // In front of the player (yaw 0 faces -Z); the altar if that's off the map.
    let x = p.x - Math.sin(yaw) * BOSS_DISTANCE
    let z = p.z - Math.cos(yaw) * BOSS_DISTANCE
    const limit = this.limit(def.radius + 2)
    if (Math.abs(x) > limit || Math.abs(z) > limit) {
      const altar = ctx.world.spots.altar
      x = altar.x
      z = altar.z
    }
    const pos = this.settle(x, z, def.radius)
    const e = ctx.enemies.spawn(def.id, pos, { boss: true, hpScale: bossHpScale(run.stageTime, this.difficulty()) })
    if (!e) return
    pin(e)
    this.bossSummoned = true
    ctx.ui.banner('BOSS', def.name, '#ff3b3b')
    ctx.audio.play('bossRoar')
    ctx.fx.shake(0.7)
    ctx.fx.burst(e.pos, def.accent, 40, 10, 0.4)
  }

  spawnChallenge(count: number, center: Vec3): Enemy[] {
    const ctx = this.ctx
    const out: Enemy[] = []
    const n = Math.max(0, Math.floor(count || 0))
    const offset = this.rng.next() * Math.PI * 2
    const limit = this.limit()
    for (let i = 0; i < n; i++) {
      const id = this.pickRoster(ctx.run.stageTime)
      if (!id) break
      circlePoint(i, n, CHALLENGE_RADIUS, center.x, center.z, offset, this.spot)
      clampToSquare(this.spot, limit)
      const e = ctx.enemies.spawn(id, this.settle(this.spot.x, this.spot.z, ENEMIES[id].radius), { elite: true })
      if (!e) continue
      pin(e)
      ctx.fx.burst(e.pos, '#c86bff', 12, 5, 0.25)
      out.push(e)
    }
    return out
  }

  reset(): void {
    const run = this.ctx.run
    const index = this.ctx.stage.index
    this.budget = 0
    this.nextClump = clumpSize(this.rng.next())
    this.lastWave = waveIndex(run.stageTime)
    const times = minibossTimes(index, run.stageDuration)
    this.minibossDone[0] = run.stageTime > times[0]
    this.minibossDone[1] = run.stageTime > times[1]
    const rings = encircleTimes(index, run.stageDuration)
    for (let k = 0; k < rings.length; k++) this.encircleDone[k] = this.encircleWarned[k] = run.stageTime > rings[k]
    this.swarm = false
    this.swarmTier = 0
    this.bossSummoned = false
    this.straggleTimer = 1
    this.level = 0
  }

  // ─────────────────────────────── set pieces ───────────────────────────────

  private startSwarm(): void {
    const ctx = this.ctx
    this.swarm = true
    this.swarmTier = 0
    ctx.events.emit('finalSwarm', {})
    ctx.ui.banner('FINAL SWARM', this.swarmHint(), '#ff3b3b')
    ctx.audio.play('bossRoar', { pitch: 0.7 })
    ctx.fx.shake(0.4)
    // The regulars out in the fog make way at once; the rest give way as the ghosts arrive.
    this.retireAll(RECYCLE_DISTANCE)
    // The first ghosts arrive at once.
    this.budget = Math.max(this.budget, 12)
  }

  /** What the swarm banner tells the player to do: the portal only exists once the boss is dead. */
  private swarmHint(): string {
    if (this.ctx.run.portalOpen) return 'Take the portal — or survive'
    if (this.ctx.enemies.boss) return 'Defeat the boss to open the portal'
    return 'Summon the boss at the skull altar ☠'
  }

  private checkMinibosses(t: number): void {
    const times = minibossTimes(this.ctx.stage.index, this.ctx.run.stageDuration)
    for (let k = 0; k < times.length; k++) {
      if (this.minibossDone[k] || t < times[k]) continue
      this.minibossDone[k] = true
      this.spawnMiniboss()
    }
  }

  private spawnMiniboss(): void {
    const ctx = this.ctx
    const id = MINIBOSSES[Math.min(ctx.stage.index, MINIBOSSES.length - 1)]
    const def = id ? ENEMIES[id] : undefined
    if (!def) return
    const p = ctx.player.pos
    ringPoint(this.rng, p.x, p.z, 20, 26, this.limit(), this.spot)
    const e = ctx.enemies.spawn(def.id, this.settle(this.spot.x, this.spot.z, def.radius))
    if (!e) return
    ctx.ui.banner('MINIBOSS', def.name, '#ff9a3d')
    ctx.audio.play('bossRoar', { pitch: 1.15 })
    ctx.fx.shake(0.3)
  }

  /** Twice a stage a ring of the stage's first enemy closes in around the player, a second after a warning. */
  private checkEncirclements(t: number): void {
    const times = encircleTimes(this.ctx.stage.index, this.ctx.run.stageDuration)
    for (let k = 0; k < times.length; k++) {
      if (this.encircleDone[k]) continue
      // One the clock jumped past (a debug skip, a test) is dropped, not sprung late.
      if (t > times[k] + ENCIRCLE_STALE) {
        this.encircleDone[k] = this.encircleWarned[k] = true
        continue
      }
      if (!this.encircleWarned[k] && t >= times[k] - ENCIRCLE_WARNING) {
        this.encircleWarned[k] = true
        this.warnEncircle()
      }
      if (t >= times[k]) {
        this.encircleDone[k] = true
        this.encircle()
      }
    }
  }

  private warnEncircle(): void {
    const ctx = this.ctx
    const p = ctx.player.pos
    ctx.ui.banner('SURROUNDED!', 'Break out of the ring', WARN)
    // A low drum hit, and a red ring showing where they'll stand.
    ctx.audio.play('explode', { pitch: 0.45, volume: 0.5 })
    ctx.fx.ring(this.at.set(p.x, ctx.world.heightAt(p.x, p.z) + 0.1, p.z), ENCIRCLE_RADIUS, WARN, ENCIRCLE_WARNING)
  }

  private encircle(): void {
    const ctx = this.ctx
    const id = ctx.stage.roster.find((r) => ENEMIES[r])
    if (!id) return
    const p = ctx.player.pos
    const n = ringSpots(encircleCount(ctx.stage.index), ENCIRCLE_RADIUS, p.x, p.z, this.rng.next() * Math.PI * 2, this.limit(), this.ring)
    let placed = 0
    // The ring is the point: it ignores the alive cap (far-off enemies still make room first).
    for (let k = 0; k < n; k++) if (this.placeSetPiece(id, this.ring[k].x, this.ring[k].z, Infinity, false)) placed++
    if (placed === 0) return
    ctx.audio.play('explode', { pitch: 0.6, volume: 0.4 })
    ctx.events.emit('wave', { defId: id, count: placed, encircle: true })
  }

  /** Every 60 s a themed burst of one roster type arrives together in a ring. */
  private checkWaves(t: number, cap: number): void {
    const idx = waveIndex(t)
    if (idx <= this.lastWave) return
    this.lastWave = idx
    const id = this.pickRoster(t)
    if (!id) return
    const ctx = this.ctx
    const p = ctx.player.pos
    const count = waveCount(t, ENEMIES[id].behavior, this.rng.next())
    const radius = WAVE_RADIUS + (this.rng.next() - 0.5) * 4
    const n = ringSpots(count, radius, p.x, p.z, this.rng.next() * Math.PI * 2, this.limit(), this.ring)
    const overflow = Math.floor(cap * SET_PIECE_OVERFLOW)
    let placed = 0
    for (let k = 0; k < n; k++) {
      if (this.placeSetPiece(id, this.ring[k].x, this.ring[k].z, overflow, this.rng.chance(eliteChance(t)))) placed++
    }
    if (placed > 0) ctx.events.emit('wave', { defId: id, count: placed, encircle: false })
  }

  /**
   * One member of a wave or encirclement. Set pieces don't wait for room:
   * at the cap a far-off normal is retired to make some, and failing that
   * the set piece goes over the cap, up to `limit` alive.
   */
  private placeSetPiece(id: string, x: number, z: number, limit: number, elite: boolean): Enemy | null {
    const def = ENEMIES[id]
    if (!def) return null
    const ctx = this.ctx
    const cap = aliveCap(ctx.settings.quality)
    if (ctx.enemies.aliveCount >= cap && !this.retireFurthest(RECYCLE_DISTANCE, false) && ctx.enemies.aliveCount >= limit) return null
    return ctx.enemies.spawn(id, this.settle(x, z, def.radius), { elite })
  }

  // ─────────────────────────────── spawning ───────────────────────────────

  /** A clump of 3–8 at one spot on the ring, mostly of one type. */
  private spawnClump(size: number, t: number, diff: number, cap: number): boolean {
    const ctx = this.ctx
    const p = ctx.player.pos
    ringPoint(this.rng, p.x, p.z, SPAWN_RING_MIN, SPAWN_RING_MAX, this.limit(), this.spot)
    const cx = this.spot.x
    const cz = this.spot.z
    const main = this.swarm ? SWARM_ENEMY : this.pickRoster(t)
    if (!main) return false
    let placed = 0
    for (let i = 0; i < size; i++) {
      const id = this.swarm || this.rng.chance(0.65) ? main : this.pickRoster(t) ?? main
      const x = cx + (this.rng.next() - 0.5) * CLUMP_SPREAD
      const z = cz + (this.rng.next() - 0.5) * CLUMP_SPREAD
      if (!this.place(id, x, z, t, diff, cap)) break
      placed++
    }
    return placed > 0
  }

  /** Spawns one enemy here, or at the cap moves a far-off normal here instead. */
  private place(id: string, x: number, z: number, t: number, diff: number, cap: number): boolean {
    const ctx = this.ctx
    const def = ENEMIES[id]
    if (!def) return false
    if (ctx.enemies.aliveCount >= cap) {
      // In the swarm the ghosts take the old horde's place instead of waiting for room.
      const room = this.swarm && id === SWARM_ENEMY && this.retireFurthest(SWARM_REPLACE_DISTANCE, true)
      if (!room) return this.recycleTo(this.settle(x, z, def.radius))
    }
    const pos = this.settle(x, z, def.radius)
    if (this.swarm) {
      const swarmT = Math.max(0, t - ctx.run.stageDuration)
      const hp = hpScale(t, ctx.stage.enemyScale, diff) * swarmHpMultiplier(swarmT)
      const e = ctx.enemies.spawn(id, pos, { hpScale: hp })
      if (!e) return false
      setVariant(e, swarmDamageMultiplier(swarmT), GHOST_TIER_TINT[ghostTier(swarmT)])
      return true
    }
    return !!ctx.enemies.spawn(id, pos, { elite: this.rng.chance(eliteChance(t)) })
  }

  /** Moves the furthest recyclable enemy (a normal over 45 m away) to `pos`. */
  private recycleTo(pos: Vec3): boolean {
    const p = this.ctx.player.pos
    let best: Enemy | null = null
    let bestD2 = RECYCLE_DISTANCE * RECYCLE_DISTANCE
    for (const e of this.ctx.enemies.list) {
      if (!recyclable(e)) continue
      const dx = e.pos.x - p.x
      const dz = e.pos.z - p.z
      const d2 = dx * dx + dz * dz
      if (d2 > bestD2) {
        bestD2 = d2
        best = e
      }
    }
    if (!best) return false
    relocate(best, pos.x, pos.y, pos.z)
    return true
  }

  /**
   * Normals left far behind (a long slide) come back around to the ring.
   * In the final swarm the old roster doesn't come back: it's retired.
   */
  private recycleStragglers(max: number): void {
    const ctx = this.ctx
    const p = ctx.player.pos
    const far2 = STRAGGLER_DISTANCE * STRAGGLER_DISTANCE
    const limit = this.limit()
    let moved = 0
    for (const e of ctx.enemies.list) {
      if (moved >= max) break
      if (!recyclable(e)) continue
      const dx = e.pos.x - p.x
      const dz = e.pos.z - p.z
      if (dx * dx + dz * dz < far2) continue
      moved++
      if (this.swarm && e.def.id !== SWARM_ENEMY && this.retire(e, false)) continue
      ringPoint(this.rng, p.x, p.z, SPAWN_RING_MIN, SPAWN_RING_MAX, limit, this.spot)
      const pos = this.settle(this.spot.x, this.spot.z, e.def.radius)
      relocate(e, pos.x, pos.y, pos.z)
    }
  }

  /**
   * Retires the furthest recyclable normal more than `minDist` from the
   * player (only non-ghosts if `oldRosterOnly`), in a puff of mist, with no
   * kill and no drops. Returns whether one went.
   */
  private retireFurthest(minDist: number, oldRosterOnly: boolean): boolean {
    const p = this.ctx.player.pos
    let best: Enemy | null = null
    let bestD2 = minDist * minDist
    for (const e of this.ctx.enemies.list) {
      if (!recyclable(e) || (oldRosterOnly && e.def.id === SWARM_ENEMY)) continue
      const dx = e.pos.x - p.x
      const dz = e.pos.z - p.z
      const d2 = dx * dx + dz * dz
      if (d2 > bestD2) {
        bestD2 = d2
        best = e
      }
    }
    // Out in the fog nobody sees them go; closer in they vanish in a puff of mist.
    return !!best && this.retire(best, bestD2 < RECYCLE_DISTANCE * RECYCLE_DISTANCE)
  }

  /** Retires every old-roster normal further than `minDist` (the swarm clearing the map). */
  private retireAll(minDist: number): void {
    const p = this.ctx.player.pos
    const min2 = minDist * minDist
    for (const e of this.ctx.enemies.list) {
      if (!recyclable(e) || e.def.id === SWARM_ENEMY) continue
      const dx = e.pos.x - p.x
      const dz = e.pos.z - p.z
      if (dx * dx + dz * dz > min2) this.retire(e, false)
    }
  }

  /** Despawns an enemy with no kill and no drops. False if the enemy system can't. */
  private retire(e: Enemy, puff: boolean): boolean {
    const remover = removerOf(this.ctx.enemies)
    if (!remover) return false
    if (puff) this.ctx.fx.burst(e.pos, MIST, 6, 3, 0.2)
    remover.remove(e)
    return true
  }

  /** Weighted pick from the unlocked roster; null only for an empty roster. */
  private pickRoster(t: number): string | null {
    const roster = this.ctx.stage.roster
    rosterWeights(t, roster.length, this.weights)
    let total = 0
    for (let i = 0; i < roster.length; i++) {
      const def = ENEMIES[roster[i]]
      this.weights[i] = def ? this.weights[i] * behaviorSpawnWeight(def.behavior) : 0
      total += this.weights[i]
    }
    if (!(total > 0)) return roster.find((id) => ENEMIES[id]) ?? null
    let roll = this.rng.next() * total
    for (let i = 0; i < roster.length; i++) {
      roll -= this.weights[i]
      if (roll < 0 && this.weights[i] > 0) return roster[i]
    }
    for (let i = roster.length - 1; i >= 0; i--) if (this.weights[i] > 0) return roster[i]
    return null
  }

  /** How far out spawns may go: `margin` inside the walls of the walkable square. */
  private limit(margin = EDGE_MARGIN): number {
    return Math.min(PLAY_LIMIT, this.ctx.world.halfSize) - margin
  }

  /** Clamps inside the walls, pushes out of props and drops onto the ground. */
  private settle(x: number, z: number, radius: number): Vec3 {
    const world = this.ctx.world
    const limit = this.limit()
    const at = this.at.set(clamp(x, -limit, limit), 0, clamp(z, -limit, limit))
    world.collide(at, radius)
    at.y = world.heightAt(at.x, at.z)
    return at
  }

  /** The difficulty stat; greed and curse shrines are already in it. */
  private difficulty(): number {
    return effectiveDifficulty(this.ctx.progression.stats.difficulty)
  }
}

function recyclable(e: Enemy): boolean {
  return e.alive && !e.elite && !e.boss && tierOf(e.def) === 'normal'
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
