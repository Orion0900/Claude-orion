/**
 * Every enemy on the map: spawning, AI, movement, damage, death and drops,
 * and drawing them (through EnemyRenderer). Other systems reach it as
 * `ctx.enemies`; per-stage, so it is rebuilt on each stage change.
 *
 * Enemy objects are pooled, but a dead one waits a few seconds before reuse
 * (and never gets its old uid back), so a weapon holding a stale reference
 * sees `alive === false` rather than a different enemy. Enemies other
 * systems track for longer (challenge elites, bosses) are never reused.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import { MINIBOSSES, SWARM_ENEMY } from '../data/stages'
import type { DamageOptions, Enemy, EnemyApi, EnemyDef, GameContext, Vec3 } from '../game/types'
import { PLAY_LIMIT } from '../world/colliders'
import {
  CHARGE_DASH,
  CHARGE_RECOVER,
  CHARGE_WINDUP,
  CHARGER,
  EXPLODE_ARMED,
  EXPLODER,
  FLIER_KEEP,
  RANGED_KEEP,
  chase,
  flank,
  keepDistance,
  stepCharger,
  stepExploder,
  turnTowards,
  yawTowards,
  type Steer,
} from './behaviors'
import { WARN, hasPattern, initBoss, updateBoss, updateSweep, type BossHost } from './bosses'
import {
  ELITE_DAMAGE_MULT,
  ELITE_HP_MULT,
  ELITE_SCALE,
  bossDamageScale,
  bossHpScale,
  damageScale,
  effectiveDifficulty,
  hpScale,
  minibossHpScale,
} from './director'
import { BOMB_DAMAGE, HEALTH_VALUE, emptyDrops, pieceCount, rollDrops } from './drops'
import { ENEMIES, tierOf } from './enemyDefs'
import { DEATH_FLING, DEATH_NONE, DEATH_TOPPLE, EnemyEntity } from './entity'
import { EnemyProjectiles, LOB_GRAVITY, SHAPE_DART, SHAPE_ORB } from './EnemyProjectiles'
import { EnemyRenderer } from './EnemyRenderer'
import { SpatialHash } from './spatialHash'
import { Telegraphs } from './Telegraphs'

/** Hard ceiling on live enemies, above the spawner's cap so summons and challenge elites still fit. */
export const MAX_ENEMIES = 420
/** Seconds a dead enemy's object rests before the pool hands it out again. */
const QUARANTINE = 4
/** Enemies overlap a little before separation pushes them apart; packs look denser. */
const SEPARATION = 0.85
const MAX_NEIGHBOURS = 10
const TURN_RATE = 9
const BOSS_TURN_RATE = 3
const AIM_TIME = 0.35
const KNOCKBACK_DECAY = 7
const MAX_KNOCKBACK = 25
/** Ghosts in the final swarm send the player flying. */
const GHOST_SHOVE = 14
const LOBBERS: ReadonlySet<string> = new Set(['shroom'])
/**
 * Bodies wider than this (elite tanks, and every boss and miniboss) are
 * "big": they are checked one by one instead of padding every hash query by
 * their radius, which would triple the broadphase for the whole crowd.
 * Everything else, plain tanks included, pads the query by at most this.
 */
const BIG_RADIUS = 1.3
/** How tall the player is to enemy contact and shots, standing and sliding. */
const PLAYER_HEIGHT = 1.7
const SLIDE_HEIGHT = 0.9
/** Melee fliers swoop to about head height, so a slide ducks under them. */
const FLIER_BITE_HEIGHT = 1.0
/** Straight shots aim at the chest of a standing player (a slide ducks under) or the body of a sliding one. */
const AIM_HEIGHT = 1.3
const AIM_HEIGHT_SLIDING = 0.45
/** Death animations: a flung normal's seconds in the air and its gravity; a boss's topple. */
const FLING_TIME = 0.45
const FLING_GRAVITY = 24
const TOPPLE_TIME = 1.1

const BURN: DamageOptions = { source: 'burn', noProcs: true }
const THORNS: DamageOptions = { source: 'thorns', noProcs: true }

/** Unique for the whole session, so certainly for the run, even across stages. */
let nextUid = 1

interface Timed {
  at: number
  e: EnemyEntity
  uid: number
  fn: () => void
}

interface Shockwave {
  x: number
  y: number
  z: number
  r: number
  to: number
  speed: number
  damage: number
  source: string
  hit: boolean
}

const _v = new THREE.Vector3()
const _drop = new THREE.Vector3()
/** Reused sound options: damage() runs for every hit, so it shouldn't allocate. */
const _sound: { pitch: number; volume: number; pos?: Vec3 } = { pitch: 1, volume: 1 }
/** Where a hit on the player came from; separate so nested damage (item hooks) can't move it. */
const _from = new THREE.Vector3()

export class EnemyManager implements EnemyApi, BossHost {
  readonly ctx: GameContext
  readonly rng: Rng
  readonly telegraphs: Telegraphs
  readonly shots: EnemyProjectiles
  private readonly renderer: EnemyRenderer
  private readonly hash: SpatialHash
  private readonly entities: EnemyEntity[] = []
  private readonly pool: EnemyEntity[] = []
  private readonly resting: EnemyEntity[] = []
  private readonly perDef = new Map<string, number>()
  private pending: Timed[] = []
  private readonly due: Timed[] = []
  private readonly waves: Shockwave[] = []
  private readonly neighbours: number[] = []
  private readonly found: number[] = []
  /** Indices (into `entities`) of big bodies, rebuilt with the hash. */
  private readonly big: number[] = []
  /** Killed enemies still playing their death fling or topple. */
  private readonly dying: EnemyEntity[] = []
  private readonly steer: Steer = { x: 0, z: 0 }
  /** Running separation sum for the enemy being moved. */
  private readonly push = { x: 0, z: 0, seen: 0 }
  private readonly drops = emptyDrops()
  private living = 0
  private bossRef: EnemyEntity | null = null
  private maxRadius = 0.5
  private lastKillSound = -1
  private excluded: ReadonlySet<number> | null = null

  constructor(ctx: GameContext) {
    this.ctx = ctx
    this.rng = ctx.rng.fork(0xe4e417)
    this.renderer = new EnemyRenderer(ctx.scene, MAX_ENEMIES + 16)
    this.telegraphs = new Telegraphs(ctx.scene)
    this.shots = new EnemyProjectiles(ctx.scene)
    this.hash = new SpatialHash(ctx.world.halfSize + 8, 3, 512)
    // Build this stage's meshes now so the first spawn of each type doesn't hitch.
    const ids = [...ctx.stage.roster, MINIBOSSES[ctx.stage.index], ctx.stage.bossId, SWARM_ENEMY]
    for (const id of ids) {
      const def = id ? ENEMIES[id] : undefined
      if (def) this.renderer.prepare(def, capacityFor(def))
    }
  }

  // ─────────────────────────────── EnemyApi ───────────────────────────────

  get list(): readonly Enemy[] {
    return this.entities
  }

  get aliveCount(): number {
    return this.living
  }

  get boss(): Enemy | null {
    return this.bossRef && this.bossRef.alive ? this.bossRef : null
  }

  spawn(defId: string, pos: Vec3, opts: { elite?: boolean; boss?: boolean; hpScale?: number } = {}): Enemy | null {
    const def = ENEMIES[defId]
    if (!def || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return null
    const tier = tierOf(def)
    const isBoss = !!opts.boss || tier === 'boss'
    if (this.living >= MAX_ENEMIES && !isBoss) return null
    this.renderer.prepare(def, capacityFor(def))
    const live = this.perDef.get(def.id) ?? 0
    if (live >= this.renderer.capacityOf(def.id)) return null

    const e = this.pool.pop() ?? new EnemyEntity(def)
    e.reset(def)
    e.uid = nextUid++
    e.tier = isBoss ? 'boss' : tier
    e.boss = isBoss
    e.elite = !!opts.elite && e.tier === 'normal'
    e.setBody(def, e.elite ? ELITE_SCALE : 1)
    e.bigBody = isBigBody(e)

    const run = this.ctx.run
    const t = run.stageTime
    const diff = this.difficulty()
    const enemyScale = this.ctx.stage.enemyScale
    let hpMul = opts.hpScale
    if (hpMul === undefined) {
      hpMul = isBoss ? bossHpScale(t, diff) : e.tier === 'miniboss' ? minibossHpScale(t, diff) : hpScale(t, enemyScale, diff)
    }
    if (!(hpMul > 0)) hpMul = 1
    e.maxHp = e.hp = Math.max(1, def.hp * hpMul * (e.elite ? ELITE_HP_MULT : 1))
    e.damageScale = (e.tier === 'normal' ? damageScale(t, enemyScale, diff) : bossDamageScale(diff)) * (e.elite ? ELITE_DAMAGE_MULT : 1)

    e.phase = Math.random()
    e.side = this.rng.chance(0.5) ? 1 : -1
    e.hover = e.flier ? 2 + this.rng.next() : 0
    e.fireT = def.projectile ? def.projectile.cooldown * (0.4 + this.rng.next() * 0.8) : 0
    const ground = this.ctx.world.heightAt(pos.x, pos.z)
    e.pos.set(pos.x, ground + e.hover, pos.z)
    e.groundY = ground
    const p = this.ctx.player.pos
    e.yaw = yawTowards(p.x - pos.x, p.z - pos.z)
    e.alive = true
    if (e.tier !== 'normal') {
      initBoss(e)
      e.recyclable = false
    }

    this.entities.push(e)
    this.living++
    this.perDef.set(def.id, live + 1)
    if (!e.bigBody && e.radius > this.maxRadius) this.maxRadius = e.radius
    if (isBoss) {
      this.bossRef = e
      this.ctx.events.emit('bossSpawned', { enemy: e })
    }
    return e
  }

  queryRadius(center: Vec3, radius: number, out: Enemy[]): Enemy[] {
    out.length = 0
    if (!(radius >= 0)) return out
    const ids = this.hash.query(center.x, center.z, radius + this.maxRadius, this.found)
    const vertical = Math.max(radius, 2)
    for (let k = 0; k < ids.length; k++) {
      const e = this.entities[ids[k]]
      // Big bodies can sit outside the padded query; they get their own pass below.
      if (!e || e.bigBody) continue
      if (inReach(e, center, radius, vertical)) out.push(e)
    }
    for (let k = 0; k < this.big.length; k++) {
      const e = this.entities[this.big[k]]
      if (e && inReach(e, center, radius, vertical)) out.push(e)
    }
    return out
  }

  /** Removes a live enemy without a kill: no drops, no events (the final swarm clears old enemies this way). */
  remove(enemy: Enemy): void {
    if (enemy instanceof EnemyEntity) this.despawn(enemy)
  }

  nearest(pos: Vec3, maxDist: number, exclude?: ReadonlySet<number>): Enemy | null {
    this.excluded = exclude ?? null
    const id = this.hash.nearest(pos.x, pos.z, maxDist, this.acceptNearest)
    this.excluded = null
    return id >= 0 ? this.entities[id] : null
  }

  damage(enemy: Enemy, amount: number, opts: DamageOptions): void {
    if (!enemy.alive || !(amount > 0)) return
    const e = enemy as EnemyEntity
    const ctx = this.ctx
    e.hp -= amount
    e.hitFlash = 0
    const crit = !!opts.crit
    if (ctx.settings.showDamageNumbers) {
      ctx.fx.number(_v.set(e.pos.x, e.pos.y + e.height + 0.25, e.pos.z), String(Math.max(1, Math.round(amount))), crit ? 'crit' : 'damage')
    }
    _sound.pitch = 0.9 + Math.random() * 0.25
    _sound.volume = opts.noProcs ? 0.4 : 0.8
    _sound.pos = undefined
    ctx.audio.play(crit ? 'crit' : 'bonk', _sound)
    const kb = opts.knockback
    if (kb && e.freeze <= 0 && Number.isFinite(kb.x) && Number.isFinite(kb.z)) {
      const k = 1 - Math.min(1, e.def.weight + (e.elite ? 0.15 : 0))
      e.kbX += kb.x * k
      e.kbZ += kb.z * k
      const m = Math.hypot(e.kbX, e.kbZ)
      if (m > MAX_KNOCKBACK) {
        e.kbX *= MAX_KNOCKBACK / m
        e.kbZ *= MAX_KNOCKBACK / m
      }
    }
    ctx.events.emit('enemyHit', { enemy: e, amount, crit, source: opts.source, procs: !opts.noProcs })
    if (e.alive && e.hp <= 0) this.kill(e, opts.source, kb)
  }

  applySlow(enemy: Enemy, seconds: number): void {
    if (!enemy.alive || !(seconds > 0)) return
    enemy.slow = Math.max(enemy.slow, seconds)
  }

  applyBurn(enemy: Enemy, dps: number, seconds: number): void {
    if (!enemy.alive || !(dps > 0) || !(seconds > 0)) return
    if (enemy.burn <= 0 || dps >= enemy.burnDps) enemy.burnDps = dps
    enemy.burn = Math.max(enemy.burn, seconds)
  }

  applyFreeze(enemy: Enemy, seconds: number): void {
    if (!enemy.alive || !(seconds > 0)) return
    const e = enemy as EnemyEntity
    // Bosses and minibosses shrug freezes off into a slow.
    if (e.boss || e.tier !== 'normal') return this.applySlow(e, seconds)
    e.freeze = Math.max(e.freeze, seconds)
    e.windup = false
  }

  clear(includeBoss = false): void {
    for (const e of this.entities) {
      if (e.alive && (includeBoss || !e.boss)) this.despawn(e)
    }
    this.shots.clear()
    this.waves.length = 0
    if (includeBoss) {
      this.telegraphs.clear()
      this.pending = []
    }
  }

  update(dt: number): void {
    const ctx = this.ctx
    const now = ctx.time
    this.compact(now)
    this.buildHash()

    const player = ctx.player
    const px = player.pos.x
    const py = player.pos.y
    const pz = player.pos.z
    const n = this.entities.length
    for (let i = 0; i < n; i++) {
      const e = this.entities[i]
      if (!e.alive) continue
      this.tickStatus(e, dt)
      if (!e.alive) continue
      const dx = px - e.pos.x
      const dz = pz - e.pos.z
      const dist = Math.hypot(dx, dz)
      if (e.freeze > 0) {
        e.moveX = e.moveZ = 0
      } else {
        this.think(e, dt, dx, dz, dist, now)
        if (!e.alive) continue
      }
      this.move(e, dt, i, px, py, pz, dist)
      if (player.alive && e.freeze <= 0) this.touch(e, px, py, pz)
    }

    this.runPending(now)
    this.updateShockwaves(dt)
    this.shots.update(dt, ctx, now)
    this.updateDeaths(dt)
    this.buildHash()
    this.renderer.render(this.entities, this.dying, now)
    this.telegraphs.update(dt)
  }

  dispose(): void {
    this.renderer.dispose()
    this.telegraphs.dispose()
    this.shots.dispose()
    this.entities.length = 0
    this.pool.length = 0
    this.resting.length = 0
    this.dying.length = 0
    this.big.length = 0
    this.pending = []
    this.waves.length = 0
    this.perDef.clear()
    this.bossRef = null
    this.living = 0
  }

  // ─────────────────────────────── BossHost ───────────────────────────────

  after(e: EnemyEntity, delay: number, fn: () => void): void {
    this.pending.push({ at: this.ctx.time + Math.max(0, delay), e, uid: e.uid, fn })
  }

  blast(e: EnemyEntity, x: number, z: number, radius: number, damage: number, color: string, clearance: number): void {
    const ctx = this.ctx
    const y = ctx.world.heightAt(x, z)
    _v.set(x, y + 0.1, z)
    ctx.fx.ring(_v, radius, color, 0.45)
    ctx.fx.burst(_v, color, 18, 6, 0.3)
    const player = ctx.player
    if (!player.alive) return
    const dx = player.pos.x - x
    const dz = player.pos.z - z
    const d = Math.hypot(dx, dz)
    if (d > radius + player.radius) return
    const feet = player.pos.y - ctx.world.heightAt(player.pos.x, player.pos.z)
    if (feet > clearance) return
    if (player.hurt(damage, e.def.id, _from.set(x, y, z)) > 0) this.shove(dx, dz, d, 9, 5)
  }

  shockwave(e: EnemyEntity, x: number, z: number, from: number, to: number, speed: number, damage: number): void {
    this.waves.push({ x, y: this.ctx.world.heightAt(x, z), z, r: from, to, speed, damage, source: e.def.id, hit: false })
  }

  summon(defId: string, x: number, z: number): void {
    const e = this.spawn(defId, _v.set(x, 0, z))
    if (e) this.ctx.fx.burst(e.pos, e.def.color, 10, 4, 0.2)
  }

  // ─────────────────────────────── AI ───────────────────────────────

  private think(e: EnemyEntity, dt: number, dx: number, dz: number, dist: number, now: number): void {
    const steer = this.steer
    const def = e.def
    const slowMul = e.slow > 0 ? 0.5 : 1
    const speed = def.speed * slowMul

    if (e.tier !== 'normal' && hasPattern(def.id)) {
      updateBoss(this, e, dt, dx, dz, dist, steer)
      if (e.dashT > 0) {
        e.dashT -= dt
        e.moveX = e.dirX * e.dashSpeed * slowMul
        e.moveZ = e.dirZ * e.dashSpeed * slowMul
        if (e.dashT <= 0) e.contactMult = 1
      } else if (e.sweepT > 0) {
        updateSweep(this, e, dt)
      } else if (e.busy <= 0) {
        e.yaw = turnTowards(e.yaw, yawTowards(dx, dz), BOSS_TURN_RATE * dt)
      }
      return
    }

    const weave = Math.sin(now * 1.3 + e.phase * 6.283)
    let face = true
    switch (def.behavior) {
      case 'swarmer':
        flank(dx, dz, dist, speed, e.side, steer)
        break
      case 'flier':
        if (def.projectile) {
          keepDistance(dx, dz, dist, FLIER_KEEP, speed, e.side, steer)
          this.aimAndShoot(e, dt, dx, dz, dist)
        } else chase(dx, dz, dist, speed, weave * 0.6, steer)
        break
      case 'ranged':
        keepDistance(dx, dz, dist, RANGED_KEEP, speed, e.side, steer)
        this.aimAndShoot(e, dt, dx, dz, dist)
        break
      case 'charger':
        face = this.charger(e, dt, dx, dz, dist, speed, slowMul)
        break
      case 'exploder':
        if (stepExploder(e, dt, dist)) {
          this.explode(e)
          return
        }
        if (e.state === EXPLODE_ARMED) {
          e.windup = true
          steer.x = steer.z = 0
        } else chase(dx, dz, dist, speed, weave * 0.5, steer)
        break
      default:
        // chaser, tank
        if (dist < e.radius + this.ctx.player.radius) steer.x = steer.z = 0
        else chase(dx, dz, dist, speed, def.behavior === 'tank' ? weave * 0.3 : weave, steer)
    }
    if (e.windup && def.behavior !== 'charger') steer.x = steer.z = 0
    e.moveX = steer.x
    e.moveZ = steer.z
    if (face) e.yaw = turnTowards(e.yaw, yawTowards(dx, dz), TURN_RATE * dt)
  }

  /** Returns whether it should keep turning toward the player (not while dashing). */
  private charger(e: EnemyEntity, dt: number, dx: number, dz: number, dist: number, speed: number, slowMul: number): boolean {
    const before = e.state
    const state = stepCharger(e, dt, dist)
    const steer = this.steer
    if (state === CHARGE_WINDUP) {
      if (before !== CHARGE_WINDUP) {
        // Lock the lane now, leading the player a little.
        const v = this.ctx.player.vel
        const tx = dx + v.x * 0.35
        const tz = dz + v.z * 0.35
        const l = Math.hypot(tx, tz) || 1
        e.dirX = tx / l
        e.dirZ = tz / l
      }
      e.windup = true
      steer.x = steer.z = 0
      e.yaw = turnTowards(e.yaw, yawTowards(e.dirX, e.dirZ), TURN_RATE * 2 * dt)
      return false
    }
    e.windup = false
    if (state === CHARGE_DASH) {
      steer.x = e.dirX * CHARGER.dashSpeed * slowMul
      steer.z = e.dirZ * CHARGER.dashSpeed * slowMul
      e.contactMult = 1.25
      return false
    }
    e.contactMult = 1
    if (state === CHARGE_RECOVER) {
      steer.x = steer.z = 0
      return true
    }
    chase(dx, dz, dist, speed, 0, steer)
    return true
  }

  /** Ranged enemies stop, blink for a beat, then fire at where the player is heading. */
  private aimAndShoot(e: EnemyEntity, dt: number, dx: number, dz: number, dist: number): void {
    const proj = e.def.projectile
    if (!proj) return
    if (e.state === 1) {
      e.t += dt
      e.windup = true
      if (e.t < AIM_TIME) return
      e.state = 0
      e.windup = false
      e.fireT = proj.cooldown * (0.85 + this.rng.next() * 0.3)
      this.fireAt(e, dx, dz, dist)
      return
    }
    e.fireT -= dt
    if (e.fireT <= 0 && dist <= proj.range) {
      e.state = 1
      e.t = 0
    }
  }

  private fireAt(e: EnemyEntity, dx: number, dz: number, dist: number): void {
    const proj = e.def.projectile
    if (!proj) return
    const player = this.ctx.player
    const ox = e.pos.x
    const oy = e.pos.y + e.height * 0.6
    const oz = e.pos.z
    const damage = proj.damage * e.damageScale
    const lead = Math.min(1, dist / proj.speed) * 0.5
    const tx = dx + player.vel.x * lead
    const tz = dz + player.vel.z * lead
    if (LOBBERS.has(e.def.id)) {
      // Lobs drop onto the player from above, so they aim at the middle of the body.
      const ty = player.pos.y + 0.9 - oy
      const flat = Math.max(1, Math.hypot(tx, tz))
      const time = flat / proj.speed
      const vy = (ty + 0.5 * LOB_GRAVITY * time * time) / time
      this.shots.fire(ox, oy, oz, tx / time, vy, tz / time, damage, time + 0.8, proj.color, SHAPE_ORB, 0.28, LOB_GRAVITY, e.def.id)
    } else {
      const ty = player.pos.y + (player.sliding ? AIM_HEIGHT_SLIDING : AIM_HEIGHT) - oy
      const l = Math.hypot(tx, ty, tz) || 1
      const s = proj.speed / l
      const shape = e.flier ? SHAPE_ORB : SHAPE_DART
      this.shots.fire(ox, oy, oz, tx * s, ty * s, tz * s, damage, proj.range / proj.speed, proj.color, shape, 0.28, 0, e.def.id)
    }
    _sound.pitch = 1.2 + Math.random() * 0.2
    _sound.volume = 0.35
    _sound.pos = e.pos
    this.ctx.audio.play('shoot', _sound)
  }

  private explode(e: EnemyEntity): void {
    const ctx = this.ctx
    const radius = EXPLODER.radius * (e.elite ? 1.35 : 1)
    _v.set(e.pos.x, e.pos.y + 0.3, e.pos.z)
    ctx.fx.ring(_v, radius, e.def.accent, 0.4)
    ctx.fx.burst(_v, e.def.color, 22, 8, 0.3)
    ctx.fx.burst(_v, '#ffd23f', 10, 6, 0.25)
    ctx.fx.shake(0.25)
    ctx.audio.play('explode', { pos: e.pos })
    const player = ctx.player
    if (player.alive) {
      const dx = player.pos.x - e.pos.x
      const dz = player.pos.z - e.pos.z
      const d = Math.hypot(dx, dz)
      if (d <= radius + player.radius && Math.abs(player.pos.y - e.pos.y) < radius) {
        if (player.hurt(e.def.damage * e.damageScale, e.def.id, _from.copy(e.pos)) > 0) this.shove(dx, dz, d, 8, 4)
      }
    }
    // Blowing itself up is not a kill: no drops, no kill credit.
    this.despawn(e)
  }

  // ─────────────────────────────── movement ───────────────────────────────

  private move(e: EnemyEntity, dt: number, index: number, px: number, py: number, pz: number, dist: number): void {
    const world = this.ctx.world
    const decay = Math.exp(-KNOCKBACK_DECAY * dt)
    e.kbX *= decay
    e.kbZ *= decay
    if (e.freeze > 0) {
      e.vel.set(0, 0, 0)
      return
    }
    const vx = e.moveX + e.kbX
    const vz = e.moveZ + e.kbZ
    e.pos.x += vx * dt
    e.pos.z += vz * dt
    if (!Number.isFinite(e.pos.x) || !Number.isFinite(e.pos.z)) {
      // Something fed us NaN; drop the enemy rather than poison every query.
      this.despawn(e)
      return
    }
    this.separate(e, index)

    // Keep out of the player's body, so crowds ring them instead of stacking inside.
    const player = this.ctx.player
    const pr = player.radius
    const ox = e.pos.x - px
    const oz = e.pos.z - pz
    const rr = e.radius + pr
    const d2 = ox * ox + oz * oz
    if (d2 < rr * rr && d2 > 1e-8 && py < e.pos.y + e.height && py + playerHeight(player) > e.pos.y) {
      const d = Math.sqrt(d2)
      e.pos.x = px + (ox / d) * rr
      e.pos.z = pz + (oz / d) * rr
    }

    // The walls: nothing flies or shoulders its way out of the walkable square.
    const limit = Math.min(PLAY_LIMIT, world.halfSize) - e.radius
    let vy = 0
    if (e.flier) {
      e.pos.x = clamp(e.pos.x, -limit, limit)
      e.pos.z = clamp(e.pos.z, -limit, limit)
      const ground = world.heightAt(e.pos.x, e.pos.z)
      // Fliers hover, then swoop down to head height when close enough to bite.
      let target = ground + e.hover
      if (!e.def.projectile && dist < 3.5) target = Math.max(ground + 0.3, py + FLIER_BITE_HEIGHT)
      const before = e.pos.y
      e.pos.y += (target - e.pos.y) * Math.min(1, dt * 3)
      if (e.pos.y < ground + 0.3) e.pos.y = ground + 0.3
      vy = dt > 0 ? (e.pos.y - before) / dt : 0
      e.groundY = ground
    } else {
      if (e.tier === 'normal') world.collide(e.pos, e.radius)
      else {
        // Bosses shoulder through props; only the walls stop them.
        e.pos.x = clamp(e.pos.x, -limit, limit)
        e.pos.z = clamp(e.pos.z, -limit, limit)
      }
      e.groundY = e.pos.y = world.heightAt(e.pos.x, e.pos.z)
    }
    e.vel.set(vx, vy, vz)
  }

  /** Pushes an enemy out of its neighbours, heavier ones yielding less. */
  private separate(e: EnemyEntity, index: number): void {
    const push = this.push
    push.x = push.z = 0
    push.seen = 0
    const mi = massOf(e)
    // Big bodies first, so a crowd never walks into a boss because its neighbour budget ran out.
    for (let k = 0; k < this.big.length; k++) {
      const j = this.big[k]
      if (j !== index) this.pushApart(e, mi, this.entities[j])
    }
    const ids = this.hash.query(e.pos.x, e.pos.z, e.radius * SEPARATION + this.maxRadius * SEPARATION, this.neighbours)
    for (let k = 0; k < ids.length && push.seen < MAX_NEIGHBOURS; k++) {
      const j = ids[k]
      if (j === index) continue
      const o = this.entities[j]
      if (o && !o.bigBody) this.pushApart(e, mi, o)
    }
    if (push.seen === 0) return
    let sx = push.x * 0.5
    let sz = push.z * 0.5
    const m = Math.hypot(sx, sz)
    if (m > 0.35) {
      sx *= 0.35 / m
      sz *= 0.35 / m
    }
    e.pos.x += sx
    e.pos.z += sz
  }

  /** Adds `o`'s push on `e` (of mass `mi`) to the running separation sum, if they overlap. */
  private pushApart(e: EnemyEntity, mi: number, o: EnemyEntity | undefined): void {
    if (!o || !o.alive || o.flier !== e.flier) return
    const dx = e.pos.x - o.pos.x
    const dz = e.pos.z - o.pos.z
    const rr = (e.radius + o.radius) * SEPARATION
    const d2 = dx * dx + dz * dz
    if (d2 >= rr * rr) return
    const push = this.push
    push.seen++
    const mo = massOf(o)
    const share = mo / (mi + mo)
    if (d2 < 1e-8) {
      // Exactly stacked: split along a direction unique to this enemy.
      const a = e.phase * 6.283
      push.x += Math.cos(a) * rr * 0.5 * share
      push.z += Math.sin(a) * rr * 0.5 * share
      return
    }
    const d = Math.sqrt(d2)
    const amount = (rr - d) * share
    push.x += (dx / d) * amount
    push.z += (dz / d) * amount
  }

  // ─────────────────────────────── combat ───────────────────────────────

  private tickStatus(e: EnemyEntity, dt: number): void {
    e.age += dt
    e.hitFlash += dt
    if (e.slow > 0) e.slow = Math.max(0, e.slow - dt)
    if (e.freeze > 0) e.freeze = Math.max(0, e.freeze - dt)
    if (e.burn > 0) {
      e.burn -= dt
      e.burnTick += dt
      if (e.burnTick >= 0.5) {
        e.burnTick -= 0.5
        this.damage(e, e.burnDps * 0.5, BURN)
      }
      if (e.burn <= 0) {
        e.burn = 0
        e.burnDps = 0
        e.burnTick = 0
      }
    }
  }

  /** Contact damage; the player's own i-frames keep this from ticking every frame. */
  private touch(e: EnemyEntity, px: number, py: number, pz: number): void {
    if (e.def.behavior === 'exploder' && e.tier === 'normal') return
    const player = this.ctx.player
    const dx = px - e.pos.x
    const dz = pz - e.pos.z
    const reach = e.radius + player.radius + 0.15
    const d2 = dx * dx + dz * dz
    if (d2 > reach * reach) return
    if (py > e.pos.y + e.height || py + playerHeight(player) < e.pos.y) return
    const dealt = player.hurt(e.def.damage * e.damageScale * e.contactMult, e.def.id, e.pos)
    if (!(dealt > 0)) return
    const thorns = this.ctx.progression.stats.thorns
    if (thorns > 0) this.damage(e, thorns, THORNS)
    const d = Math.sqrt(d2)
    if (e.def.id === SWARM_ENEMY) this.shove(dx, dz, d, GHOST_SHOVE, 5)
    else if (e.tier !== 'normal') this.shove(dx, dz, d, 8, 4)
  }

  /** Pushes the player away along (dx, dz). */
  private shove(dx: number, dz: number, d: number, strength: number, up: number): void {
    const v = this.ctx.player.vel
    const l = d > 1e-4 ? d : 1
    v.x += (dx / l) * strength
    v.z += (dz / l) * strength
    v.y = Math.max(v.y, up)
  }

  private kill(e: EnemyEntity, source: string, blow?: Vec3): void {
    const ctx = this.ctx
    this.retire(e)
    this.startDeath(e, blow)
    const now = ctx.time
    const big = e.tier !== 'normal'
    _v.set(e.pos.x, e.pos.y + e.height * 0.5, e.pos.z)
    ctx.fx.burst(_v, e.def.color, big ? 46 : e.elite ? 20 : 9, big ? 10 : 5, big ? 0.45 : 0.22 * e.scale)
    ctx.fx.burst(_v, e.def.accent, big ? 24 : 4, big ? 8 : 4, big ? 0.35 : 0.16)
    if (big) {
      ctx.fx.ring(_v, e.radius * 2.5, e.def.accent, 0.6)
      ctx.fx.shake(e.boss ? 1 : 0.5)
      ctx.audio.play('explode', { pos: e.pos, pitch: 0.5 })
    }
    if (big || e.elite || now - this.lastKillSound > 0.08) {
      this.lastKillSound = now
      _sound.pitch = 0.9 + Math.random() * 0.25
      _sound.volume = 1
      _sound.pos = e.pos
      ctx.audio.play('kill', _sound)
    }
    this.dropLoot(e)
    ctx.events.emit('enemyKilled', { enemy: e, source })
    if (e.boss) ctx.events.emit('bossKilled', { enemy: e })
  }

  /**
   * Bonks a killed enemy off the screen: launched away from the blow, up and
   * back, tumbling, for a moment. Bosses and minibosses keel over instead.
   * Purely visual; the body is already dead.
   */
  private startDeath(e: EnemyEntity, blow: Vec3 | undefined): void {
    e.deathT = 0
    e.deathX = e.pos.x
    e.deathY = e.pos.y
    e.deathZ = e.pos.z
    e.deathVX = e.deathVY = e.deathVZ = 0
    e.deathPitch = e.deathRoll = 0
    if (e.tier !== 'normal') {
      e.death = DEATH_TOPPLE
      e.deathTime = TOPPLE_TIME
      this.dying.push(e)
      return
    }
    // Away from the blow: the knockback it just took, else straight away from the player.
    const p = this.ctx.player.pos
    let dx = blow ? blow.x : 0
    let dz = blow ? blow.z : 0
    let l = Math.hypot(dx, dz)
    const strength = Number.isFinite(l) ? l : 0
    if (!(l > 0.5)) {
      dx = e.pos.x - p.x
      dz = e.pos.z - p.z
      l = Math.hypot(dx, dz)
    }
    if (!(l > 1e-4)) {
      const a = e.phase * 6.283
      dx = Math.cos(a)
      dz = Math.sin(a)
      l = 1
    }
    // 6–12 m/s all told; harder blows fling further, elites are heavier.
    const speed = (6 + Math.min(3, strength * 0.2) + Math.random() * 1.5) * (e.elite ? 0.7 : 1)
    e.deathVX = (dx / l) * speed
    e.deathVZ = (dz / l) * speed
    e.deathVY = 5 + Math.random() * 2.5
    // Face the blow and flip over backwards, with a little twist.
    e.yaw = yawTowards(-dx, -dz)
    e.deathPitch = -(9 + Math.random() * 6)
    e.deathRoll = (Math.random() - 0.5) * 8
    e.death = DEATH_FLING
    e.deathTime = FLING_TIME
    this.dying.push(e)
  }

  /** Moves the flung bodies; ends each death animation when its time is up. */
  private updateDeaths(dt: number): void {
    const world = this.ctx.world
    let w = 0
    for (let i = 0; i < this.dying.length; i++) {
      const e = this.dying[i]
      // alive again means the pool handed the object out (it can't happen within the animation, but be safe).
      if (e.alive || e.death === DEATH_NONE) continue
      e.deathT += dt
      e.hitFlash += dt
      if (e.deathT >= e.deathTime) {
        e.death = DEATH_NONE
        continue
      }
      if (e.death === DEATH_FLING) {
        e.deathVY -= FLING_GRAVITY * dt
        e.deathX += e.deathVX * dt
        e.deathY += e.deathVY * dt
        e.deathZ += e.deathVZ * dt
        const ground = world.heightAt(e.deathX, e.deathZ)
        if (e.deathY < ground) {
          // Skid off a hillside rather than sink into it.
          e.deathY = ground
          if (e.deathVY < 0) e.deathVY *= -0.35
          e.deathVX *= 0.6
          e.deathVZ *= 0.6
        }
      }
      this.dying[w++] = e
    }
    this.dying.length = w
  }

  private dropLoot(e: EnemyEntity): void {
    const d = rollDrops(this.rng, e.def, e.tier, e.elite, this.drops, this.difficulty(), this.ctx.stage.index)
    const pickups = this.ctx.pickups
    const spread = e.radius + 0.5
    this.spray('xp', d.xp, e.boss ? 60 : 25, e.boss ? 16 : 10, e, spread)
    this.spray('gold', d.gold, 10, 10, e, spread)
    if (d.health) pickups.spawn('health', this.scatter(e, spread), HEALTH_VALUE)
    if (d.magnet) pickups.spawn('magnet', this.scatter(e, spread), 1)
    if (d.bomb) pickups.spawn('bomb', this.scatter(e, spread), BOMB_DAMAGE)
    if (d.chest) {
      const x = e.pos.x
      const z = e.pos.z
      this.ctx.interactables.spawnChest(new THREE.Vector3(x, this.ctx.world.heightAt(x, z), z), true)
    }
  }

  /** Splits a reward into whole pieces sprayed around the body. */
  private spray(kind: 'xp' | 'gold', total: number, pieceSize: number, maxPieces: number, e: EnemyEntity, spread: number): void {
    const n = pieceCount(total, pieceSize, maxPieces)
    if (n === 0) return
    const each = Math.floor(total / n)
    const extra = total - each * n
    for (let k = 0; k < n; k++) {
      const value = each + (k === 0 ? extra : 0)
      if (value > 0) this.ctx.pickups.spawn(kind, this.scatter(e, n > 1 ? spread : 0.2), value)
    }
  }

  private scatter(e: EnemyEntity, spread: number): Vec3 {
    const x = e.pos.x + (Math.random() - 0.5) * 2 * spread
    const z = e.pos.z + (Math.random() - 0.5) * 2 * spread
    return _drop.set(x, this.ctx.world.heightAt(x, z) + 0.4, z)
  }

  /** Removes an enemy without a kill (self-destruct, stage clear). */
  private despawn(e: EnemyEntity): void {
    if (!e.alive) return
    this.retire(e)
  }

  private retire(e: EnemyEntity): void {
    e.alive = false
    e.windup = false
    e.dashT = 0
    e.sweepT = 0
    e.diedAt = this.ctx.time
    this.living--
    this.perDef.set(e.def.id, Math.max(0, (this.perDef.get(e.def.id) ?? 1) - 1))
    if (e.tier !== 'normal') this.telegraphs.removeOwner(e.uid)
    if (e === this.bossRef) this.bossRef = null
  }

  private updateShockwaves(dt: number): void {
    const player = this.ctx.player
    const world = this.ctx.world
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      w.r += w.speed * dt
      this.telegraphs.wave(w.x, w.y, w.z, w.r, WARN)
      if (!w.hit && player.alive) {
        const dx = player.pos.x - w.x
        const dz = player.pos.z - w.z
        const d = Math.hypot(dx, dz)
        const feet = player.pos.y - world.heightAt(player.pos.x, player.pos.z)
        if (Math.abs(d - w.r) < 0.7 + player.radius && feet < 0.6) {
          w.hit = true
          if (player.hurt(w.damage, w.source, player.pos) > 0) this.shove(dx, dz, d, 8, 6)
        }
      }
      if (w.r >= w.to) {
        this.waves[i] = this.waves[this.waves.length - 1]
        this.waves.pop()
      }
    }
  }

  private runPending(now: number): void {
    if (this.pending.length === 0) return
    const due = this.due
    due.length = 0
    let w = 0
    for (const p of this.pending) {
      if (p.at <= now) due.push(p)
      else this.pending[w++] = p
    }
    this.pending.length = w
    for (const p of due) if (p.e.alive && p.e.uid === p.uid) p.fn()
    due.length = 0
  }

  // ─────────────────────────────── bookkeeping ───────────────────────────────

  /** Drops the dead from the live list and returns rested objects to the pool. */
  private compact(now: number): void {
    let w = 0
    for (const e of this.entities) {
      if (e.alive) this.entities[w++] = e
      else this.resting.push(e)
    }
    this.entities.length = w
    for (let i = this.resting.length - 1; i >= 0; i--) {
      const e = this.resting[i]
      if (now - e.diedAt < QUARANTINE) continue
      this.resting[i] = this.resting[this.resting.length - 1]
      this.resting.pop()
      if (e.recyclable && this.pool.length < MAX_ENEMIES) this.pool.push(e)
    }
  }

  /**
   * Every live body goes in the hash, but only small ones set the query pad;
   * big ones (at most a handful) are listed apart and checked one by one.
   */
  private buildHash(): void {
    const hash = this.hash
    hash.clear()
    this.big.length = 0
    let maxR = 0.5
    for (let i = 0; i < this.entities.length; i++) {
      const e = this.entities[i]
      if (!e.alive) continue
      hash.insert(i, e.pos.x, e.pos.z)
      if (e.bigBody) this.big.push(i)
      else if (e.radius > maxR) maxR = e.radius
    }
    hash.build()
    this.maxRadius = maxR
  }

  /** The difficulty stat; greed and curse shrines are already in it. */
  private difficulty(): number {
    return effectiveDifficulty(this.ctx.progression.stats.difficulty)
  }

  private readonly acceptNearest = (i: number): boolean => {
    const e = this.entities[i]
    return !!e && e.alive && !(this.excluded && this.excluded.has(e.uid))
  }
}

function capacityFor(def: EnemyDef): number {
  const tier = tierOf(def)
  return tier === 'boss' ? 3 : tier === 'miniboss' ? 4 : MAX_ENEMIES
}

function isBigBody(e: EnemyEntity): boolean {
  return e.tier !== 'normal' || e.radius > BIG_RADIUS
}

/** Whether `e` is alive and within `radius` (plus its own) of `center`, with at most `vertical` m of height gap. */
function inReach(e: EnemyEntity, center: Vec3, radius: number, vertical: number): boolean {
  if (!e.alive) return false
  const dx = e.pos.x - center.x
  const dz = e.pos.z - center.z
  const rr = radius + e.radius
  if (dx * dx + dz * dz > rr * rr) return false
  const top = e.pos.y + e.height
  const gap = center.y < e.pos.y ? e.pos.y - center.y : center.y > top ? center.y - top : 0
  return gap <= vertical
}

/** The player's body height for contact: a slide ducks under swoops and shots. */
function playerHeight(player: { readonly sliding: boolean }): number {
  return player.sliding ? SLIDE_HEIGHT : PLAYER_HEIGHT
}

/** Bosses barely budge; otherwise bigger bodies push smaller ones aside. */
function massOf(e: EnemyEntity): number {
  if (e.tier !== 'normal') return 400
  return e.radius * e.radius * (1 + e.def.weight * 3)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
