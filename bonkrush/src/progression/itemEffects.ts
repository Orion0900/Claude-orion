/**
 * What the effect items actually do. Item defs are static, so the per-run
 * state their hooks need (cooldowns, buffs, souls, clouds, the stopwatch
 * charge, the proc rng) lives in an `ItemRuntime` looked up by context.
 * All item damage is `noProcs`, and Soul Reaper ignores its own kills, so
 * items never trigger each other in a loop.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import { tierOf } from '../enemies/enemyDefs'
import type { Enemy, GameContext, ItemHooks, SfxId, StatMod } from '../game/types'
import { ItemVfx } from './itemVfx'
import { procChance, soulCount, vacuumInterval } from './itemMath'

const SOUL_SPEED = 16
const SOUL_LIFE = 5
const SOUL_RANGE = 30
const SOUL_DAMAGE = 20
const CLOUD_TICK = 0.5
const SHROUD_SECONDS = 3
const STOPWATCH_RADIUS = 30
const STOPWATCH_SECONDS = 2

const FORWARD = new THREE.Vector3(0, 0, 1)
const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _s = new THREE.Vector3()
const _v = new THREE.Vector3()
const _aim = new THREE.Vector3()
const _identity = new THREE.Quaternion()

/** Kills by souls must not release more souls, or one kill chains through the whole horde. */
const SOUL_SOURCE = 'item:soul_reaper'

/**
 * `ItemHooks` whose `onKill` also gets the kill's damage source, so an item
 * can ignore kills it made itself. Plain `ItemHooks` fit it as they are.
 */
export interface KillAwareHooks extends ItemHooks {
  onKill?(ctx: GameContext, enemy: Enemy, stacks: number, source?: string): void
}

/** Bosses and minibosses: never executed, and slowed where others would be frozen. */
export function isBossClass(enemy: Enemy): boolean {
  return enemy.boss || tierOf(enemy.def) !== 'normal'
}

/**
 * Scratch space for radius queries, one frame per nesting level: a kill in
 * the middle of one blast can set off another item before the loop ends.
 */
interface Scratch {
  list: Enemy[]
  center: THREE.Vector3
  kb: THREE.Vector3
}
const scratch: Scratch[] = []
let depth = 0
function enter(): Scratch {
  const s = (scratch[depth] ??= { list: [], center: new THREE.Vector3(), kb: new THREE.Vector3() })
  depth++
  return s
}
function leave(s: Scratch): void {
  s.list.length = 0
  depth--
}

interface Soul {
  active: boolean
  pos: THREE.Vector3
  vel: THREE.Vector3
  target: Enemy | null
  uid: number
  life: number
  damage: number
  seek: number
}

interface Cloud {
  active: boolean
  pos: THREE.Vector3
  radius: number
  life: number
  maxLife: number
  tick: number
  dps: number
}

/** Per-run item state and the effects that outlive a single event. */
export class ItemRuntime {
  /** Proc and lifesteal rolls; forked so combat luck never shifts offer rolls. */
  readonly rng: Rng
  demonicCooldown = 0
  /** Seconds the player has stood still (Idle Juice). */
  stillSeconds = 0
  /** Phantom Shroud buff time left and the stacks it was granted with. */
  shroudTime = 0
  shroudStacks = 0
  stopwatchUsed = false
  vacuumTimer = 0
  /** Temporary stat mods (the Phantom Shroud speed boost) folded into the player's stats. */
  readonly buffMods: StatMod[] = []

  private vfx: ItemVfx | null = null
  private disposed = false
  private readonly souls: Soul[] = []
  private readonly clouds: Cloud[] = []
  private readonly chainSeen = new Set<number>()
  private chaining = false
  private readonly sfxAt = new Map<SfxId, number>()

  constructor(readonly ctx: GameContext) {
    this.rng = ctx.rng.fork(0x17e3)
    // Built now, hidden, so the stage-start shader prewarm compiles them
    // instead of the first soul or spike hitching the frame.
    this.vfx = new ItemVfx(ctx.scene)
  }

  /** Rolls an item's per-stack proc chance with the player's luck. */
  roll(base: number, stacks: number): boolean {
    return this.rng.chance(procChance(base, stacks, this.ctx.progression.stats.luck))
  }

  /** Sound with a floor on how often it repeats, so a proc storm doesn't turn into noise. */
  sfx(id: SfxId, volume = 0.6, pitch = 1, minGap = 0.08): void {
    const now = this.ctx.time
    if (now - (this.sfxAt.get(id) ?? -Infinity) < minGap) return
    this.sfxAt.set(id, now)
    this.ctx.audio.play(id, { volume, pitch })
  }

  // ───────────────────────────── effects ─────────────────────────────

  /** Damages every enemy within `radius` of `pos`, with a ring and a burst. */
  blast(pos: THREE.Vector3, radius: number, damage: number, source: string, color: string, push = 0): void {
    const s = enter()
    try {
      s.center.copy(pos)
      this.ctx.enemies.queryRadius(s.center, radius, s.list)
      for (let i = 0; i < s.list.length; i++) {
        const e = s.list[i]
        if (!e.alive) continue
        if (push > 0) {
          s.kb.set(e.pos.x - s.center.x, 0, e.pos.z - s.center.z)
          const len = s.kb.length()
          if (len > 1e-4) s.kb.multiplyScalar(push / len)
          else s.kb.set(0, 0, 0)
          this.ctx.enemies.damage(e, damage, { source, noProcs: true, knockback: s.kb })
        } else this.ctx.enemies.damage(e, damage, { source, noProcs: true })
      }
      const fx = this.ctx.fx
      fx.ring(s.center, radius, color, 0.35)
      fx.burst(s.center, color, 10, 6, 0.3)
    } finally {
      leave(s)
    }
  }

  /** Pocket Cactus: eight spikes burst out from the player. */
  spikes(stacks: number): void {
    const p = this.ctx.player
    if (!p) return
    const stats = this.ctx.progression.stats
    const reach = 4.5 * Math.sqrt(stats.size)
    const damage = (15 * stacks + stats.thorns) * stats.damage
    const s = enter()
    try {
      s.center.copy(p.pos)
      s.center.y += 0.9
      this.visuals()?.addSpikes(s.center, 8, reach)
      this.ctx.enemies.queryRadius(p.pos, reach + 0.5, s.list)
      for (let i = 0; i < s.list.length; i++) {
        const e = s.list[i]
        if (!e.alive) continue
        s.kb.set(e.pos.x - s.center.x, 0, e.pos.z - s.center.z)
        const len = s.kb.length()
        if (len > 1e-4) s.kb.multiplyScalar(6 / len)
        else s.kb.set(0, 0, 0)
        this.ctx.enemies.damage(e, damage, { source: 'item:cactus', noProcs: true, knockback: s.kb })
      }
    } finally {
      leave(s)
    }
    this.sfx('swing', 0.5, 1.4)
  }

  /** Storm Orb: a bolt from the sky onto `enemy`, then chains to its nearest neighbours. */
  lightning(enemy: Enemy, damage: number, chains: number): void {
    if (this.chaining) return
    this.chaining = true
    const s = enter()
    try {
      const vfx = this.visuals()
      const seen = this.chainSeen
      seen.clear()
      seen.add(enemy.uid)
      centerOf(enemy, s.center)
      _v.copy(s.center)
      _v.y += 14
      vfx?.addLightning(_v, s.center, 0.3)
      this.ctx.fx.burst(s.center, '#fff27a', 8, 5, 0.25)
      if (enemy.alive) this.ctx.enemies.damage(enemy, damage, { source: 'item:storm_orb', noProcs: true })
      for (let i = 0; i < chains; i++) {
        const next = this.ctx.enemies.nearest(s.center, 8, seen)
        if (!next) break
        seen.add(next.uid)
        centerOf(next, s.kb)
        vfx?.addLightning(s.center, s.kb, 0.2)
        s.center.copy(s.kb)
        this.ctx.enemies.damage(next, damage, { source: 'item:storm_orb', noProcs: true })
      }
    } finally {
      leave(s)
      this.chaining = false
    }
    this.sfx('zap', 0.6)
  }

  /** Toxic Barrel: a poison dome where the player stands. */
  spawnCloud(pos: THREE.Vector3, radius: number, dps: number, seconds: number): void {
    if (!this.visuals()) return
    let cloud = firstInactive(this.clouds)
    if (!cloud) {
      if (this.clouds.length < vfxMax(this.vfx, 'clouds')) {
        cloud = { active: false, pos: new THREE.Vector3(), radius: 0, life: 0, maxLife: 0, tick: 0, dps: 0 }
        this.clouds.push(cloud)
      } else {
        // All in use: the one closest to fading makes way.
        cloud = this.clouds[0]
        for (const c of this.clouds) if (c.life < cloud.life) cloud = c
      }
    }
    cloud.active = true
    cloud.pos.set(pos.x, this.ctx.world.heightAt(pos.x, pos.z), pos.z)
    cloud.radius = radius
    cloud.life = cloud.maxLife = seconds
    cloud.tick = 0.1
    cloud.dps = dps
  }

  /** Soul Reaper: homing souls rise from a kill. */
  spawnSouls(from: THREE.Vector3, count: number, damage: number): void {
    if (!this.visuals()) return
    for (let i = 0; i < count; i++) {
      let soul = firstInactive(this.souls)
      if (!soul) {
        if (this.souls.length >= vfxMax(this.vfx, 'souls')) return
        soul = { active: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), target: null, uid: -1, life: 0, damage: 0, seek: 0 }
        this.souls.push(soul)
      }
      soul.active = true
      soul.pos.copy(from)
      soul.pos.y += 1
      const a = this.rng.range(0, Math.PI * 2)
      soul.vel.set(Math.cos(a) * 3, 6, Math.sin(a) * 3)
      soul.target = null
      soul.uid = -1
      soul.life = SOUL_LIFE
      soul.damage = damage
      soul.seek = 0.12
    }
  }

  /** Phantom Shroud: a dodge starts (or refreshes) the damage and speed buff. */
  onDodge(stacks: number): void {
    if (stacks <= 0) return
    const wasActive = this.shroudTime > 0
    this.shroudTime = SHROUD_SECONDS
    if (wasActive && stacks === this.shroudStacks) return
    this.shroudStacks = stacks
    this.buffMods.length = 0
    this.buffMods.push({ stat: 'moveSpeed', op: 'add', value: 0.3 * stacks })
    this.ctx.progression.recompute()
    const p = this.ctx.player
    if (p && !wasActive) {
      this.ctx.fx.burst(p.pos, '#b58cff', 14, 5, 0.3)
      this.ctx.fx.number(p.pos, 'PHANTOM!', 'info')
    }
  }

  /** Stopwatch: survive a fatal hit at 1 HP and freeze everything nearby. */
  triggerStopwatch(): void {
    this.stopwatchUsed = true
    const p = this.ctx.player
    if (!p) return
    p.hp = Math.max(p.hp, 1)
    const s = enter()
    try {
      this.ctx.enemies.queryRadius(p.pos, STOPWATCH_RADIUS, s.list)
      for (let i = 0; i < s.list.length; i++) {
        const e = s.list[i]
        if (isBossClass(e)) this.ctx.enemies.applySlow(e, STOPWATCH_SECONDS)
        else this.ctx.enemies.applyFreeze(e, STOPWATCH_SECONDS)
      }
    } finally {
      leave(s)
    }
    const fx = this.ctx.fx
    fx.flash('#bfefff', 0.7)
    fx.ring(p.pos, 12, '#9fe8ff', 0.6)
    fx.burst(p.pos, '#e8fbff', 24, 7, 0.35)
    this.ctx.ui.banner('STOPWATCH!', 'Death postponed', '#9fe8ff')
    this.ctx.audio.play('shrine', { pitch: 0.6 })
  }

  // ───────────────────────────── lifecycle ─────────────────────────────

  update(dt: number): void {
    if (this.demonicCooldown > 0) this.demonicCooldown -= dt
    if (this.shroudTime > 0) {
      this.shroudTime -= dt
      if (this.shroudTime <= 0) {
        this.shroudTime = 0
        this.buffMods.length = 0
        this.ctx.progression.recompute()
      }
    }
    const vfx = this.vfx
    if (!vfx) return
    this.updateSouls(vfx, dt)
    this.updateClouds(vfx, dt)
    vfx.update(dt)
  }

  /** Stage change: old enemies are gone, and the stopwatch charges again. */
  resetStage(): void {
    this.stopwatchUsed = false
    for (const s of this.souls) {
      s.active = false
      s.target = null
    }
    for (const c of this.clouds) c.active = false
    this.vfx?.clear()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.vfx?.dispose()
    this.vfx = null
    for (const s of this.souls) s.target = null
    if (latest === this) latest = null
  }

  /** The VFX pools; null once disposed. */
  private visuals(): ItemVfx | null {
    return this.disposed ? null : this.vfx
  }

  private updateSouls(vfx: ItemVfx, dt: number): void {
    const pool = vfx.souls
    pool.begin()
    const pulse = 1 + 0.15 * Math.sin(this.ctx.time * 18)
    for (let i = 0; i < this.souls.length; i++) {
      const s = this.souls[i]
      if (!s.active) continue
      s.life -= dt
      if (s.life <= 0) {
        s.active = false
        s.target = null
        continue
      }
      let t = s.target
      if (t && (!t.alive || t.uid !== s.uid)) {
        t = s.target = null
        s.seek = 0
      }
      if (!t) {
        s.seek -= dt
        if (s.seek <= 0) {
          s.seek = 0.2
          t = s.target = this.ctx.enemies.nearest(s.pos, SOUL_RANGE)
          if (t) s.uid = t.uid
        }
      }
      if (t) {
        centerOf(t, _aim)
        _v.subVectors(_aim, s.pos)
        const dist = _v.length()
        if (dist <= t.def.radius * t.scale + 0.4) {
          s.active = false
          s.target = null
          this.ctx.enemies.damage(t, s.damage, { source: SOUL_SOURCE, noProcs: true })
          this.ctx.fx.burst(_aim, '#aefcff', 6, 4, 0.2)
          continue
        }
        _v.multiplyScalar(SOUL_SPEED / Math.max(dist, 1e-3))
        s.vel.lerp(_v, Math.min(1, dt * 6))
      } else {
        s.vel.multiplyScalar(1 - Math.min(1, dt * 2))
        s.vel.y += dt * 2
      }
      s.pos.addScaledVector(s.vel, dt)
      const speed = s.vel.length()
      if (speed > 1e-3) _q.setFromUnitVectors(FORWARD, _v.copy(s.vel).multiplyScalar(1 / speed))
      else _q.identity()
      _s.set(pulse, pulse, pulse)
      pool.push(_m.compose(s.pos, _q, _s))
    }
    pool.end()
  }

  private updateClouds(vfx: ItemVfx, dt: number): void {
    const pool = vfx.clouds
    pool.begin()
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i]
      if (!c.active) continue
      c.life -= dt
      if (c.life <= 0) {
        c.active = false
        continue
      }
      c.tick -= dt
      if (c.tick <= 0) {
        c.tick += CLOUD_TICK
        this.poison(c)
      }
      const age = c.maxLife - c.life
      const k = c.radius * Math.min(1, age / 0.25) * Math.min(1, c.life / 0.4)
      const wobble = 1 + 0.05 * Math.sin(this.ctx.time * 6 + i)
      _s.set(k * wobble, k * 0.6, k * wobble)
      pool.push(_m.compose(c.pos, _identity, _s))
    }
    pool.end()
  }

  private poison(c: Cloud): void {
    const s = enter()
    try {
      this.ctx.enemies.queryRadius(c.pos, c.radius, s.list)
      const dmg = c.dps * CLOUD_TICK
      for (let i = 0; i < s.list.length; i++) {
        const e = s.list[i]
        if (e.alive) this.ctx.enemies.damage(e, dmg, { source: 'item:toxic_barrel', noProcs: true })
      }
    } finally {
      leave(s)
    }
  }
}

function firstInactive<T extends { active: boolean }>(list: T[]): T | null {
  for (let i = 0; i < list.length; i++) if (!list[i].active) return list[i]
  return null
}

/** Live effects never outnumber the instances their pool can draw. */
function vfxMax(vfx: ItemVfx | null, kind: 'souls' | 'clouds'): number {
  return vfx ? vfx[kind].max : 0
}

/** Where to aim at an enemy: the middle of its body, not its feet. */
function centerOf(e: Enemy, out: THREE.Vector3): THREE.Vector3 {
  out.copy(e.pos)
  out.y += e.def.height * e.scale * 0.5
  return out
}

const runtimes = new WeakMap<GameContext, ItemRuntime>()
let latest: ItemRuntime | null = null

/**
 * The item runtime for a run, created with its Progression. Should a run
 * end without Progression.dispose(), the next run cleans up its pools.
 */
export function itemRuntime(ctx: GameContext): ItemRuntime {
  // Hooks look this up on every hit; the current run is almost always the one asked for.
  if (latest && latest.ctx === ctx) return latest
  let rt = runtimes.get(ctx)
  if (!rt) {
    latest?.dispose()
    rt = new ItemRuntime(ctx)
    runtimes.set(ctx, rt)
    latest = rt
  }
  return rt
}

// ───────────────────────────── hooks ─────────────────────────────

/**
 * Item hooks by item id. Numbers follow docs/DESIGN.md, and item damage also
 * scales with the damage stat. Stacking: when a proc has a size (burn, blast,
 * bolt) extra stacks make it bigger; when it doesn't (freeze, execute, drop)
 * extra stacks make it likelier.
 */
export const ITEM_HOOKS = {
  moldy_cheese: {
    onHit(ctx, enemy, damage, _crit, stacks) {
      if (!enemy.alive || !itemRuntime(ctx).roll(0.12, 1)) return
      ctx.enemies.applyBurn(enemy, damage * 0.25 * stacks, 3 * ctx.progression.stats.duration)
    },
  },
  burger: {
    onKill(ctx, enemy, stacks) {
      if (itemRuntime(ctx).roll(0.02, stacks)) ctx.pickups.spawn('health', enemy.pos.clone(), 25)
    },
  },
  cactus: {
    onPlayerDamaged(ctx, _amount, stacks) {
      itemRuntime(ctx).spikes(stacks)
    },
  },
  toxic_barrel: {
    onPlayerDamaged(ctx, _amount, stacks) {
      const stats = ctx.progression.stats
      itemRuntime(ctx).spawnCloud(ctx.player.pos, 3 * Math.sqrt(stats.size), 10 * stacks * stats.damage, 4 * stats.duration)
    },
  },
  demonic_blood: {
    onHit(ctx, enemy, _damage, _crit, stacks) {
      const rt = itemRuntime(ctx)
      if (rt.demonicCooldown > 0) return
      rt.demonicCooldown = 8
      const stats = ctx.progression.stats
      ctx.player.heal(stats.maxHp * 0.075 * stacks)
      rt.blast(enemy.pos, 4 * Math.sqrt(stats.size), 40 * stacks * stats.damage, 'item:demonic_blood', '#d4143a', 5)
      rt.sfx('explode', 0.5, 0.8)
    },
  },
  ice_cube: {
    onHit(ctx, enemy, _damage, _crit, stacks) {
      if (!enemy.alive || !itemRuntime(ctx).roll(0.1, stacks)) return
      const seconds = 1.5 * ctx.progression.stats.duration
      if (isBossClass(enemy)) ctx.enemies.applySlow(enemy, seconds)
      else ctx.enemies.applyFreeze(enemy, seconds)
    },
  },
  spicy_meatball: {
    onHit(ctx, enemy, damage, _crit, stacks) {
      const rt = itemRuntime(ctx)
      if (!rt.roll(0.2, 1)) return
      const stats = ctx.progression.stats
      rt.blast(enemy.pos, 2.5 * Math.sqrt(stats.size), damage * 0.65 * stacks, 'item:spicy_meatball', '#ff7a1a', 3)
      rt.sfx('explode', 0.35, 1.2, 0.12)
    },
  },
  soul_reaper: {
    onKill(ctx, enemy, stacks, source?: string) {
      if (source === SOUL_SOURCE) return
      itemRuntime(ctx).spawnSouls(enemy.pos, soulCount(stacks), SOUL_DAMAGE * ctx.progression.stats.damage)
    },
  },
  vacuum: {
    update(ctx, dt, stacks) {
      const rt = itemRuntime(ctx)
      rt.vacuumTimer += dt
      if (rt.vacuumTimer < vacuumInterval(stacks)) return
      rt.vacuumTimer = 0
      ctx.pickups.magnetAll()
      ctx.fx.ring(ctx.player.pos, 8, '#4aa8ff', 0.5)
      rt.sfx('xp', 0.5, 0.7)
    },
  },
  reaper_dagger: {
    onHit(ctx, enemy, _damage, _crit, stacks) {
      if (!enemy.alive || isBossClass(enemy)) return
      if (!itemRuntime(ctx).roll(0.01, stacks)) return
      ctx.fx.number(enemy.pos, 'EXECUTE', 'info')
      ctx.fx.burst(enemy.pos, '#7a2cff', 12, 5, 0.3)
      ctx.enemies.damage(enemy, enemy.hp, { source: 'item:reaper_dagger', noProcs: true })
    },
  },
  storm_orb: {
    onHit(ctx, enemy, damage, _crit, stacks) {
      const rt = itemRuntime(ctx)
      if (rt.roll(0.08, 1)) rt.lightning(enemy, damage * 0.5 * stacks, 2)
    },
  },
  idle_juice: {
    update(ctx, dt) {
      const rt = itemRuntime(ctx)
      const p = ctx.player
      const v = p.vel
      const still = p.onGround && v.x * v.x + v.z * v.z < 0.16
      rt.stillSeconds = still ? rt.stillSeconds + dt : 0
    },
  },
} satisfies Record<string, KillAwareHooks>

/** Big Bonk's odds per hit, per stack. */
export const BIG_BONK_CHANCE = 0.02
export const BIG_BONK_MULT = 20
