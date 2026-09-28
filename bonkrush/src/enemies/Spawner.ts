/**
 * Decides where and when enemies arrive, following the director's numbers:
 * clumps on a ring around the player, minibosses and waves on schedule, the
 * final swarm when the clock runs out, and the boss when the altar is used.
 * Per-stage, like the EnemyManager it spawns into.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import { MINIBOSSES, SWARM_ENEMY } from '../data/stages'
import type { Enemy, GameContext, SpawnerApi, Vec3 } from '../game/types'
import {
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
import { circlePoint, clampToSquare, ringPoint, type Point2 } from './placement'

/** Spawns never get closer to the wall than this. */
const EDGE_MARGIN = 6
const CLUMP_SPREAD = 5
const WAVE_RADIUS = 30
const CHALLENGE_RADIUS = 9
const BOSS_DISTANCE = 14
/** Spawn budget can't pile up past this while the map is full. */
const MAX_BUDGET = 24

export class Spawner implements SpawnerApi {
  private readonly ctx: GameContext
  private readonly rng: Rng
  private budget = 0
  private nextClump = 5
  private lastWave = 0
  private readonly minibossDone = [false, false]
  private swarm = false
  private swarmTier: GhostTier = 0
  private bossSummoned = false
  private straggleTimer = 1
  private level = 0
  private readonly weights: number[] = []
  private readonly spot: Point2 = { x: 0, z: 0 }
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
          this.checkWaves(t, diff, cap)
        }
        this.budget += spawnRate(t, diff) * dt
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
    const limit = ctx.world.halfSize - def.radius - 2
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
    const limit = ctx.world.halfSize - EDGE_MARGIN
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
    this.budget = 0
    this.nextClump = clumpSize(this.rng.next())
    this.lastWave = waveIndex(run.stageTime)
    const times = minibossTimes(this.ctx.stage.index, run.stageDuration)
    this.minibossDone[0] = run.stageTime > times[0]
    this.minibossDone[1] = run.stageTime > times[1]
    this.swarm = false
    this.swarmTier = 0
    this.bossSummoned = false
    this.straggleTimer = 1
    this.level = 0
  }

  // ─────────────────────────────── spawning ───────────────────────────────

  private startSwarm(): void {
    const ctx = this.ctx
    this.swarm = true
    this.swarmTier = 0
    ctx.events.emit('finalSwarm', {})
    ctx.ui.banner('FINAL SWARM', 'Find the portal — or survive', '#ff3b3b')
    ctx.audio.play('bossRoar', { pitch: 0.7 })
    ctx.fx.shake(0.4)
    // The first ghosts arrive at once.
    this.budget = Math.max(this.budget, 12)
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
    ringPoint(this.rng, p.x, p.z, 20, 26, ctx.world.halfSize - EDGE_MARGIN, this.spot)
    const e = ctx.enemies.spawn(def.id, this.settle(this.spot.x, this.spot.z, def.radius))
    if (!e) return
    ctx.ui.banner('MINIBOSS', def.name, '#ff9a3d')
    ctx.audio.play('bossRoar', { pitch: 1.15 })
    ctx.fx.shake(0.3)
  }

  private checkWaves(t: number, diff: number, cap: number): void {
    const idx = waveIndex(t)
    if (idx <= this.lastWave) return
    this.lastWave = idx
    const id = this.pickRoster(t)
    if (!id) return
    const ctx = this.ctx
    const p = ctx.player.pos
    const n = waveCount(t, ENEMIES[id].behavior, this.rng.next())
    const offset = this.rng.next() * Math.PI * 2
    const limit = ctx.world.halfSize - EDGE_MARGIN
    for (let i = 0; i < n; i++) {
      circlePoint(i, n, WAVE_RADIUS + (this.rng.next() - 0.5) * 4, p.x, p.z, offset, this.spot)
      clampToSquare(this.spot, limit)
      if (!this.place(id, this.spot.x, this.spot.z, t, diff, cap)) break
    }
  }

  /** A clump of 3–8 at one spot on the ring, mostly of one type. */
  private spawnClump(size: number, t: number, diff: number, cap: number): boolean {
    const ctx = this.ctx
    const p = ctx.player.pos
    ringPoint(this.rng, p.x, p.z, SPAWN_RING_MIN, SPAWN_RING_MAX, ctx.world.halfSize - EDGE_MARGIN, this.spot)
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
    const pos = this.settle(x, z, def.radius)
    if (ctx.enemies.aliveCount >= cap) return this.recycleTo(pos)
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

  /** Normals left far behind (a long slide) come back around to the ring. */
  private recycleStragglers(max: number): void {
    const ctx = this.ctx
    const p = ctx.player.pos
    const far2 = STRAGGLER_DISTANCE * STRAGGLER_DISTANCE
    const limit = ctx.world.halfSize - EDGE_MARGIN
    let moved = 0
    for (const e of ctx.enemies.list) {
      if (moved >= max) break
      if (!recyclable(e)) continue
      const dx = e.pos.x - p.x
      const dz = e.pos.z - p.z
      if (dx * dx + dz * dz < far2) continue
      ringPoint(this.rng, p.x, p.z, SPAWN_RING_MIN, SPAWN_RING_MAX, limit, this.spot)
      const pos = this.settle(this.spot.x, this.spot.z, e.def.radius)
      relocate(e, pos.x, pos.y, pos.z)
      moved++
    }
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

  /** Clamps inside the map, pushes out of props and drops onto the ground. */
  private settle(x: number, z: number, radius: number): Vec3 {
    const world = this.ctx.world
    const limit = world.halfSize - EDGE_MARGIN
    const at = this.at.set(clamp(x, -limit, limit), 0, clamp(z, -limit, limit))
    world.collide(at, radius)
    at.y = world.heightAt(at.x, at.z)
    return at
  }

  private difficulty(): number {
    return effectiveDifficulty(this.ctx.progression.stats.difficulty, this.ctx.run.curse)
  }
}

function recyclable(e: Enemy): boolean {
  return e.alive && !e.elite && !e.boss && tierOf(e.def) === 'normal'
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
