/**
 * Attack patterns for minibosses and bosses. Every attack starts with a
 * telegraph of at least 0.8 s (a filling circle or lane on the ground and a
 * shaking, blinking wind-up), then lands exactly where it was shown.
 *
 * Patterns cycle through a list with a cooldown between attacks; below half
 * HP the cooldown shortens. Attacks talk to the world through `BossHost`,
 * which the EnemyManager implements.
 */
import type { Rng } from '../core/rng'
import type { GameContext } from '../game/types'
import { keepDistance, yawTowards, type Steer } from './behaviors'
import type { EnemyEntity } from './entity'
import { SHAPE_DART, SHAPE_ORB, type EnemyProjectiles } from './EnemyProjectiles'
import type { Telegraphs } from './Telegraphs'

export const WARN = '#ff3b3b'
/** Boss volleys skim the ground at chest height: they cross hills and a jump clears them. */
const SHOT_HEIGHT = 1.0
const WARN_DASH = '#ff8a2a'
const WARN_SUMMON = '#c86bff'

export interface BossHost {
  readonly ctx: GameContext
  readonly telegraphs: Telegraphs
  readonly shots: EnemyProjectiles
  readonly rng: Rng
  /** Runs `fn` after `delay` seconds if `e` is still the same living enemy. */
  after(e: EnemyEntity, delay: number, fn: () => void): void
  /** Hurts the player within `radius` of (x, z) unless they are more than `clearance` m above the ground. */
  blast(e: EnemyEntity, x: number, z: number, radius: number, damage: number, color: string, clearance: number): void
  /** A ground ring expanding from `from` to `to` metres; jump over it. */
  shockwave(e: EnemyEntity, x: number, z: number, from: number, to: number, speed: number, damage: number): void
  /** A normal enemy arriving at (x, z) with the current scaling. */
  summon(defId: string, x: number, z: number): void
}

/** Returns how long the boss stays busy (standing, dashing or sweeping). */
type Attack = (h: BossHost, e: EnemyEntity) => number

interface Pattern {
  attacks: Attack[]
  /** Seconds between the end of one attack and the start of the next. */
  cooldown: number
  /** Preferred distance from the player; 0 walks right up to them. */
  keep: number
  /** Only attacks when the player is this close. */
  reach: number
}

// ─────────────────────────────── attacks ───────────────────────────────

function projectileDamage(e: EnemyEntity): number {
  return (e.def.projectile?.damage ?? e.def.damage * 0.6) * e.damageScale
}

function hitDamage(e: EnemyEntity, mult: number): number {
  return e.def.damage * e.damageScale * mult
}

function aimAt(h: BossHost, e: EnemyEntity): number {
  const p = h.ctx.player.pos
  return Math.atan2(p.x - e.pos.x, p.z - e.pos.z)
}

/** A slam around itself; optionally sends a jumpable shockwave out from the edge. */
function slam(radius: number, windup: number, mult: number, wave?: { to: number; speed: number; mult: number }): Attack {
  return (h, e) => {
    const x = e.pos.x
    const z = e.pos.z
    h.telegraphs.circle(x, e.groundY, z, radius, windup, WARN, e.uid)
    e.windup = true
    h.after(e, windup, () => {
      e.windup = false
      h.blast(e, x, z, radius, hitDamage(e, mult), e.def.accent, 1.1)
      h.ctx.fx.shake(0.4)
      h.ctx.audio.play('explode', { pos: e.pos, pitch: 0.55, volume: 0.9 })
      if (wave) h.shockwave(e, x, z, radius, wave.to, wave.speed, hitDamage(e, wave.mult))
    })
    return windup + 0.45
  }
}

/** Projectiles in every direction; each volley is rotated half a step so the gaps move. */
function ringShot(count: number, volleys: number, gap: number, windup: number, shape: number, safeLane = 0): Attack {
  return (h, e) => {
    h.telegraphs.circle(e.pos.x, e.groundY, e.pos.z, e.radius + 1.2, windup, WARN, e.uid)
    e.windup = true
    const base = h.rng.next() * Math.PI * 2
    const safe = aimAt(h, e) + (h.rng.next() - 0.5) * 1.2
    const proj = e.def.projectile
    const speed = proj?.speed ?? 11
    const life = (proj?.range ?? 24) / speed
    for (let v = 0; v < volleys; v++) {
      h.after(e, windup + v * gap, () => {
        e.windup = false
        for (let i = 0; i < count; i++) {
          const a = base + ((i + (v % 2) * 0.5) / count) * Math.PI * 2
          // Leave a lane open toward (roughly) the player so there's a way through.
          if (safeLane > 0 && Math.abs(wrap(a - safe)) < safeLane) continue
          const sx = Math.sin(a)
          const sz = Math.cos(a)
          h.shots.fire(
            e.pos.x + sx * e.radius, e.groundY + SHOT_HEIGHT, e.pos.z + sz * e.radius,
            sx * speed, 0, sz * speed,
            projectileDamage(e), life, proj?.color ?? '#ffffff', shape, shape === SHAPE_DART ? 0.4 : 0.3, 0, e.def.id, SHOT_HEIGHT,
          )
        }
        h.ctx.audio.play('shoot', { pos: e.pos, pitch: 0.6 })
      })
    }
    return windup + (volleys - 1) * gap + 0.4
  }
}

/** Fans of darts at the player; every volley's lanes are shown up front. */
function fan(count: number, spreadDeg: number, volleys: number, windup: number, gap: number): Attack {
  return (h, e) => {
    const proj = e.def.projectile
    const speed = proj?.speed ?? 16
    const range = proj?.range ?? 24
    const aim = aimAt(h, e)
    const spread = (spreadDeg * Math.PI) / 180
    e.windup = true
    for (let v = 0; v < volleys; v++) {
      const offset = volleys > 1 ? ((v % 2 ? 1 : -1) * spread) / (count * 2) : 0
      const delay = windup + v * gap
      for (let i = 0; i < count; i++) {
        const a = aim + offset + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0)
        h.telegraphs.lane(e.pos.x, e.groundY, e.pos.z, Math.sin(a), Math.cos(a), range, 0.6, delay, WARN, e.uid)
      }
      h.after(e, delay, () => {
        e.windup = false
        for (let i = 0; i < count; i++) {
          const a = aim + offset + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0)
          const sx = Math.sin(a)
          const sz = Math.cos(a)
          h.shots.fire(
            e.pos.x + sx * e.radius * 0.8, e.groundY + SHOT_HEIGHT, e.pos.z + sz * e.radius * 0.8,
            sx * speed, 0, sz * speed,
            projectileDamage(e), range / speed, proj?.color ?? '#ffffff', SHAPE_DART, 0.4, 0, e.def.id, SHOT_HEIGHT,
          )
        }
        h.ctx.audio.play('shoot', { pos: e.pos, pitch: 0.8 })
      })
    }
    return windup + (volleys - 1) * gap + 0.35
  }
}

/** A telegraphed dash along a locked lane; optionally bursts where it stops. */
function charge(speed: number, maxDist: number, windup: number, recover: number, endBlast = 0): Attack {
  return (h, e) => {
    const p = h.ctx.player.pos
    const a = aimAt(h, e)
    const dist = Math.min(maxDist, Math.hypot(p.x - e.pos.x, p.z - e.pos.z) + 5)
    const dx = Math.sin(a)
    const dz = Math.cos(a)
    const time = dist / speed
    h.telegraphs.lane(e.pos.x, e.groundY, e.pos.z, dx, dz, dist + e.radius, e.radius * 1.7, windup, WARN_DASH, e.uid)
    const ex = e.pos.x + dx * dist
    const ez = e.pos.z + dz * dist
    if (endBlast > 0) h.telegraphs.circle(ex, h.ctx.world.heightAt(ex, ez), ez, endBlast, windup + time, WARN, e.uid)
    e.windup = true
    e.dirX = dx
    e.dirZ = dz
    e.yaw = yawTowards(dx, dz)
    h.after(e, windup, () => {
      e.windup = false
      e.dashT = time
      e.dashSpeed = speed
      e.contactMult = 1.4
      h.ctx.audio.play('bossRoar', { pos: e.pos, pitch: 1.3, volume: 0.5 })
    })
    if (endBlast > 0) {
      h.after(e, windup + time, () => {
        h.blast(e, e.pos.x, e.pos.z, endBlast, hitDamage(e, 1.1), e.def.accent, 1.1)
        h.ctx.fx.shake(0.3)
      })
    }
    return windup + time + recover
  }
}

/** Minions rise from marked spots around the boss or around the player. */
function summon(defId: string, count: number, radius: number, around: 'self' | 'player', windup: number): Attack {
  return (h, e) => {
    const center = around === 'self' ? e.pos : h.ctx.player.pos
    const limit = h.ctx.world.halfSize - 3
    const n = e.hp < e.maxHp * 0.5 ? Math.ceil(count * 1.5) : count
    const base = h.rng.next() * Math.PI * 2
    const spots: number[] = []
    for (let i = 0; i < n; i++) {
      const a = base + (i / n) * Math.PI * 2
      const x = clamp(center.x + Math.sin(a) * radius, -limit, limit)
      const z = clamp(center.z + Math.cos(a) * radius, -limit, limit)
      spots.push(x, z)
      h.telegraphs.circle(x, h.ctx.world.heightAt(x, z), z, 1.3, windup, WARN_SUMMON, e.uid)
    }
    e.windup = true
    h.after(e, windup, () => {
      e.windup = false
      for (let i = 0; i < spots.length; i += 2) h.summon(defId, spots[i], spots[i + 1])
      h.ctx.audio.play('bossRoar', { pos: e.pos, pitch: 1.6, volume: 0.4 })
    })
    return windup + 0.4
  }
}

/** Vanishes in a puff and lands next to the player with a blast. */
function teleport(radius: number, windup: number): Attack {
  return (h, e) => {
    const p = h.ctx.player.pos
    const limit = h.ctx.world.halfSize - e.radius - 2
    const a = h.rng.next() * Math.PI * 2
    const x = clamp(p.x + Math.sin(a) * 2.5, -limit, limit)
    const z = clamp(p.z + Math.cos(a) * 2.5, -limit, limit)
    h.telegraphs.circle(x, h.ctx.world.heightAt(x, z), z, radius, windup, WARN, e.uid)
    e.windup = true
    h.after(e, windup, () => {
      e.windup = false
      h.ctx.fx.burst(e.pos, e.def.accent, 24, 6, 0.3)
      const y = h.ctx.world.heightAt(x, z)
      e.pos.set(x, y, z)
      e.groundY = y
      e.kbX = e.kbZ = 0
      h.ctx.fx.burst(e.pos, e.def.accent, 30, 8, 0.35)
      h.blast(e, x, z, radius, hitDamage(e, 1.1), e.def.accent, 1.1)
      h.ctx.audio.play('zap', { pos: e.pos, pitch: 0.6 })
    })
    return windup + 0.6
  }
}

/** Soul beams reach this far and hit anyone whose feet are lower than this above the ground. */
export const BEAM_LENGTH = 24
const BEAM_WIDTH = 1.3
const BEAM_CLEARANCE = 1.1

/** A long beam that sweeps an arc; the whole arc is shown first, and a jump clears it. */
function soulBeam(length: number, sweepDeg: number, windup: number, sweepTime: number): Attack {
  return (h, e) => {
    const sweep = (sweepDeg * Math.PI) / 180
    const dir = h.rng.chance(0.5) ? 1 : -1
    const start = aimAt(h, e) - (dir * sweep) / 2
    const lanes = 6
    for (let i = 0; i <= lanes; i++) {
      const a = start + dir * sweep * (i / lanes)
      h.telegraphs.lane(e.pos.x, e.groundY, e.pos.z, Math.sin(a), Math.cos(a), length, i === 0 ? 1.6 : 0.7, windup, WARN, e.uid)
    }
    e.windup = true
    e.yaw = yawTowards(Math.sin(start), Math.cos(start))
    h.after(e, windup, () => {
      e.windup = false
      e.sweepT = sweepTime
      e.sweepAngle = start
      e.sweepSpeed = (dir * sweep) / sweepTime
      h.ctx.audio.play('zap', { pos: e.pos, pitch: 0.4, volume: 1 })
    })
    return windup + sweepTime + 0.4
  }
}

// ─────────────────────────────── patterns ───────────────────────────────

const PATTERNS: Record<string, Pattern> = {
  stone_golem: { attacks: [slam(5, 1.0, 1.3)], cooldown: 2.6, keep: 0, reach: 9 },
  scorpion_king: {
    attacks: [fan(5, 55, 1, 0.9, 0), fan(5, 55, 2, 0.9, 0.45), charge(16, 16, 0.9, 0.8)],
    cooldown: 1.6,
    keep: 9,
    reach: 22,
  },
  bone_colossus: { attacks: [slam(5.5, 1.0, 1.3), ringShot(14, 2, 0.45, 0.9, SHAPE_DART)], cooldown: 2.2, keep: 0, reach: 16 },
  barkzilla: {
    attacks: [slam(4.2, 1.1, 1.4, { to: 18, speed: 11, mult: 0.8 }), ringShot(18, 2, 0.4, 0.9, SHAPE_ORB), charge(17, 22, 1.0, 0.9)],
    cooldown: 1.8,
    keep: 0,
    reach: 24,
  },
  jackal_pharaoh: {
    attacks: [
      fan(5, 40, 3, 0.9, 0.3),
      charge(22, 20, 0.9, 0.6, 3.5),
      summon('scarab', 6, 5, 'self', 1.0),
      fan(5, 40, 3, 0.9, 0.3),
      charge(22, 20, 0.9, 0.6, 3.5),
    ],
    cooldown: 1.6,
    keep: 6,
    reach: 26,
  },
  grave_warden: {
    attacks: [ringShot(22, 2, 0.5, 1.0, SHAPE_DART, 0.45), teleport(3.5, 1.0), soulBeam(BEAM_LENGTH, 110, 1.1, 2.4), summon('skeleton', 5, 7, 'player', 1.1)],
    cooldown: 1.5,
    keep: 5,
    reach: 26,
  },
}

export function hasPattern(defId: string): boolean {
  return defId in PATTERNS
}

/**
 * One frame of a boss or miniboss: follow its pattern, or walk toward the
 * player (keeping its preferred distance) while the next attack cools down.
 * Writes the steering into e.moveX/moveZ; dashes and sweeps are moved and
 * drawn by the manager.
 */
export function updateBoss(h: BossHost, e: EnemyEntity, dt: number, dx: number, dz: number, dist: number, steer: Steer): void {
  const pattern = PATTERNS[e.def.id]
  e.moveX = 0
  e.moveZ = 0
  if (!pattern) return
  if (e.busy > 0) {
    e.busy -= dt
    return
  }
  const speed = e.def.speed * (e.slow > 0 ? 0.5 : 1)
  if (pattern.keep > 0) keepDistance(dx, dz, dist, pattern.keep, speed, e.side, steer)
  // Walk right into the player: contact damage is part of the fight.
  else if (dist > e.radius + 0.2) {
    steer.x = (dx / dist) * speed
    steer.z = (dz / dist) * speed
  } else steer.x = steer.z = 0
  e.moveX = steer.x
  e.moveZ = steer.z

  e.attackCd -= dt
  if (e.attackCd > 0 || dist > pattern.reach) return
  const attack = pattern.attacks[e.attackIdx % pattern.attacks.length]
  e.attackIdx++
  e.busy = attack(h, e)
  e.moveX = e.moveZ = 0
  const enraged = e.hp < e.maxHp * 0.5
  e.attackCd = pattern.cooldown * (enraged ? 0.65 : 1)
}

/** Moves a sweeping beam on, draws it and hurts the player standing in it. */
export function updateSweep(h: BossHost, e: EnemyEntity, dt: number): void {
  e.sweepT -= dt
  e.sweepAngle += e.sweepSpeed * dt
  const dx = Math.sin(e.sweepAngle)
  const dz = Math.cos(e.sweepAngle)
  e.yaw = yawTowards(dx, dz)
  const ox = e.pos.x + dx * e.radius * 0.6
  const oz = e.pos.z + dz * e.radius * 0.6
  h.telegraphs.beam(ox, e.groundY + 0.1, oz, dx, dz, BEAM_LENGTH, BEAM_WIDTH, BEAM_CLEARANCE, e.def.accent)
  const player = h.ctx.player
  if (!player.alive) return
  const rx = player.pos.x - ox
  const rz = player.pos.z - oz
  const along = rx * dx + rz * dz
  const across = Math.abs(rx * dz - rz * dx)
  if (along < 0 || along > BEAM_LENGTH || across > BEAM_WIDTH / 2 + player.radius) return
  const feet = player.pos.y - h.ctx.world.heightAt(player.pos.x, player.pos.z)
  if (feet < BEAM_CLEARANCE) player.hurt(hitDamage(e, 0.7), e.def.id, e.pos)
}

/** First attack comes a moment after arriving, so the entrance reads. */
export function initBoss(e: EnemyEntity): void {
  e.attackCd = e.boss ? 2.5 : 1.5
  e.attackIdx = 0
  e.busy = 0
}

function wrap(a: number): number {
  return a - Math.PI * 2 * Math.floor((a + Math.PI) / (Math.PI * 2))
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
