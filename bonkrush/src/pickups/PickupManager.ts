/**
 * XP gems, coins, snacks and powerups on the ground. Every pickup is a pooled
 * record drawn by one InstancedMesh per look, so thousands cost a handful of
 * draw calls. Pickups hop out when spawned, rest on the terrain, and home in
 * on the player once inside the magnet radius.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import type { Enemy, GameContext, PickupApi, PickupKind } from '../game/types'
import {
  attractRange,
  COLLECT_RADIUS,
  HOMING_START_SPEED,
  homingSpeedCap,
  homingStep,
  nearestIndex,
  PickupChain,
  popScale,
  valueScale,
  xpTier,
} from './attraction'
import { flatMaterial, flush, instanced } from './modelKit'
import { bombGeometry, coinGeometry, gemGeometry, healthGeometry, keyGeometry, magnetGeometry } from './pickupModels'

const enum State {
  Hop,
  Rest,
  Home,
}

interface Pickup {
  kind: PickupKind
  value: number
  /** Index into the visuals table (xp tier, coin, …). */
  look: number
  pos: THREE.Vector3
  vel: THREE.Vector3
  state: State
  speed: number
  age: number
  /** Cosmetic spin/bob offset so neighbours don't move in lockstep. */
  phase: number
}

interface Look {
  /** Mesh name suffix, handy in the inspector and tests. */
  name: string
  capacity: number
  /** Height the model floats above the ground at rest. */
  rest: number
  spin: number
  bob: number
  scale: number
}

// Looks in draw order: three gem tiers, then one per other kind.
const XP_BLUE = 0
const XP_GREEN = 1
const XP_RED = 2
const LOOKS: readonly Look[] = [
  { name: 'xp0', capacity: 1500, rest: 0.5, spin: 1.3, bob: 0.1, scale: 1 },
  { name: 'xp1', capacity: 1500, rest: 0.55, spin: 1.1, bob: 0.1, scale: 1.3 },
  { name: 'xp2', capacity: 1500, rest: 0.65, spin: 0.9, bob: 0.12, scale: 1.7 },
  { name: 'gold', capacity: 600, rest: 0.48, spin: 3.2, bob: 0.06, scale: 1 },
  { name: 'silver', capacity: 150, rest: 0.48, spin: 3.2, bob: 0.06, scale: 1 },
  { name: 'health', capacity: 60, rest: 0.45, spin: 1.6, bob: 0.1, scale: 1 },
  { name: 'magnet', capacity: 24, rest: 0.55, spin: 2, bob: 0.14, scale: 1 },
  { name: 'bomb', capacity: 24, rest: 0.4, spin: 1.2, bob: 0.08, scale: 1 },
  { name: 'chestKey', capacity: 24, rest: 0.55, spin: 2.2, bob: 0.12, scale: 1 },
]
const LOOK_OF: Record<Exclude<PickupKind, 'xp'>, number> = {
  gold: 3,
  silver: 4,
  health: 5,
  magnet: 6,
  bomb: 7,
  chestKey: 8,
}
/** Most pickups of one kind on the map; spawns beyond this merge into the nearest one. */
const KIND_CAP: Record<PickupKind, number> = {
  xp: 1500,
  gold: 600,
  silver: 150,
  health: 60,
  magnet: 24,
  bomb: 24,
  chestKey: 24,
}
const GEM_COLORS = ['#35a4ff', '#4be04e', '#ff3b47']

const GRAVITY = 24
const HOP_TIME_BEFORE_HOMING = 0.25
/** Height of the player's centre above their feet; pickups fly here. */
const PLAYER_CENTER = 0.9
const BOMB_RADIUS = 10
const BOMB_DAMAGE = 200

const UP = new THREE.Vector3(0, 1, 0)

function lookFor(kind: PickupKind, value: number): number {
  if (kind === 'xp') return xpTier(value) === 2 ? XP_RED : xpTier(value) === 1 ? XP_GREEN : XP_BLUE
  return LOOK_OF[kind]
}

function isVacuumed(kind: PickupKind): boolean {
  return kind === 'xp' || kind === 'gold' || kind === 'silver'
}

export class PickupManager implements PickupApi {
  private readonly rng: Rng
  private readonly root = new THREE.Group()
  private readonly meshes: THREE.InstancedMesh[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly active: Pickup[] = []
  private readonly pool: Pickup[] = []
  private readonly perKind: Record<PickupKind, number> = {
    xp: 0,
    gold: 0,
    silver: 0,
    health: 0,
    magnet: 0,
    bomb: 0,
    chestKey: 0,
  }
  private readonly lookCounts = new Int32Array(LOOKS.length)
  private readonly xpChain = new PickupChain()
  private readonly goldChain = new PickupChain(0.45, 0.06, 0.03, 16)
  private readonly hits: Enemy[] = []

  // Scratch objects reused every frame.
  private readonly target = new THREE.Vector3()
  private readonly at = new THREE.Vector3()
  private readonly quat = new THREE.Quaternion()
  private readonly scale = new THREE.Vector3()
  private readonly matrix = new THREE.Matrix4()
  private mergeKind: PickupKind = 'xp'
  private readonly acceptMerge = (p: Pickup) => p.kind === this.mergeKind && p.state !== State.Home

  constructor(private readonly ctx: GameContext) {
    this.rng = ctx.rng.fork(0x71c4 + ctx.stage.index * 131)
    this.root.name = 'pickups'

    const gem = gemGeometry()
    const gold = coinGeometry('#d49a1c', '#ffd84a')
    const silver = coinGeometry('#8f9aa8', '#eef3f8')
    const health = healthGeometry()
    const magnet = magnetGeometry()
    const bomb = bombGeometry()
    const key = keyGeometry()
    this.geometries.push(gem, gold, silver, health, magnet, bomb, key)

    const gemMats = GEM_COLORS.map((hex) => {
      const c = new THREE.Color(hex)
      return new THREE.MeshLambertMaterial({
        vertexColors: true,
        flatShading: true,
        color: c,
        emissive: c.clone().multiplyScalar(0.45),
      })
    })
    const solid = flatMaterial(0x1c1a14)
    this.materials.push(...gemMats, solid)

    const geoOf = [gem, gem, gem, gold, silver, health, magnet, bomb, key]
    LOOKS.forEach((look, i) => {
      const mat = i < 3 ? gemMats[i] : solid
      const mesh = instanced(geoOf[i], mat, look.capacity)
      mesh.name = `pickup:${look.name}`
      this.meshes.push(mesh)
      this.root.add(mesh)
    })
    ctx.scene.add(this.root)
  }

  get count(): number {
    return this.active.length
  }

  spawn(kind: PickupKind, pos: THREE.Vector3, value: number): void {
    if (!Number.isFinite(value) || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return
    if (value <= 0 && isVacuumed(kind)) return
    const world = this.ctx.world

    if (this.perKind[kind] >= KIND_CAP[kind]) {
      this.mergeInto(kind, pos, value)
      return
    }

    const p = this.pool.pop() ?? this.makePickup()
    p.kind = kind
    p.value = value
    p.look = lookFor(kind, value)
    p.state = State.Hop
    p.speed = 0
    p.age = 0
    p.phase = Math.random() * Math.PI * 2

    const edge = world.halfSize - 1
    const x = Math.min(edge, Math.max(-edge, pos.x))
    const z = Math.min(edge, Math.max(-edge, pos.z))
    const ground = world.heightAt(x, z)
    p.pos.set(x, Math.max(Number.isFinite(pos.y) ? pos.y : ground, ground) + 0.3, z)

    // A little hop in a random direction so drops fan out instead of stacking.
    const angle = this.rng.next() * Math.PI * 2
    const out = this.rng.range(0.8, 2.6)
    p.vel.set(Math.cos(angle) * out, this.rng.range(5, 7.5), Math.sin(angle) * out)

    this.active.push(p)
    this.perKind[kind]++
  }

  magnetAll(): void {
    for (const p of this.active) {
      if (!isVacuumed(p.kind) || p.state === State.Home) continue
      p.state = State.Home
      p.speed = Math.max(p.speed, HOMING_START_SPEED * 2)
    }
  }

  clear(): void {
    for (const p of this.active) this.pool.push(p)
    this.active.length = 0
    for (const k of Object.keys(this.perKind) as PickupKind[]) this.perKind[k] = 0
    for (const mesh of this.meshes) flush(mesh, 0)
  }

  update(dt: number): void {
    const ctx = this.ctx
    const world = ctx.world
    const player = ctx.player
    const alive = player.alive
    const target = this.target.set(player.pos.x, player.pos.y + PLAYER_CENTER, player.pos.z)
    const range = attractRange(ctx.progression.stats.pickupRange)
    const range2 = range * range
    const collect2 = COLLECT_RADIUS * COLLECT_RADIUS
    const cap = homingSpeedCap(Math.hypot(player.vel.x, player.vel.z))
    const edge = world.halfSize - 0.5

    // Backwards so removals (swap with last) never skip a live pickup.
    for (let i = this.active.length - 1; i >= 0; i--) {
      // A bomb's kills can spawn or clear pickups mid-loop.
      if (i >= this.active.length) continue
      const p = this.active[i]
      p.age += dt

      if (p.state === State.Home && alive) {
        p.speed = homingStep(p.pos, target, p.speed, dt, cap)
        const floor = world.heightAt(p.pos.x, p.pos.z) + 0.2
        if (p.pos.y < floor) p.pos.y = floor
      } else if (p.state === State.Hop) {
        p.vel.y -= GRAVITY * dt
        p.pos.addScaledVector(p.vel, dt)
        p.pos.x = Math.min(edge, Math.max(-edge, p.pos.x))
        p.pos.z = Math.min(edge, Math.max(-edge, p.pos.z))
        const rest = LOOKS[p.look].rest
        const ground = world.heightAt(p.pos.x, p.pos.z)
        if (p.vel.y < 0 && p.pos.y <= ground + rest) {
          world.collide(p.pos, 0.25)
          p.pos.y = world.heightAt(p.pos.x, p.pos.z) + rest
          p.vel.set(0, 0, 0)
          p.state = State.Rest
        }
      }

      if (!alive) continue
      const dx = p.pos.x - target.x
      const dy = p.pos.y - target.y
      const dz = p.pos.z - target.z
      const d2 = dx * dx + dy * dy + dz * dz

      if (d2 <= collect2 && p.age > 0.1) {
        this.collect(i)
        continue
      }
      if (p.state !== State.Home && d2 < range2 && (p.state === State.Rest || p.age > HOP_TIME_BEFORE_HOMING)) {
        p.state = State.Home
        p.speed = Math.max(HOMING_START_SPEED, p.vel.length() * 0.5)
      }
    }

    this.draw()
  }

  dispose(): void {
    this.ctx.scene.remove(this.root)
    for (const mesh of this.meshes) mesh.dispose()
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    this.meshes.length = 0
    this.active.length = 0
    this.pool.length = 0
  }

  // ─────────────────────────── internals ───────────────────────────

  private makePickup(): Pickup {
    return {
      kind: 'xp',
      value: 0,
      look: XP_BLUE,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      state: State.Hop,
      speed: 0,
      age: 0,
      phase: 0,
    }
  }

  /** Over the cap: the value joins the nearest resting pickup of the same kind (any, if all are flying). */
  private mergeInto(kind: PickupKind, pos: THREE.Vector3, value: number): void {
    this.mergeKind = kind
    let i = nearestIndex(this.active, pos.x, pos.z, this.acceptMerge)
    if (i < 0) {
      for (let j = 0; j < this.active.length; j++) if (this.active[j].kind === kind) i = j
      if (i < 0) return
    }
    const p = this.active[i]
    if (isVacuumed(kind) || kind === 'health') p.value += value
    p.look = lookFor(kind, p.value)
    // Replay the pop so the merge is visible.
    p.age = Math.min(p.age, 0.05)
  }

  private collect(index: number): void {
    const p = this.active[index]
    const kind = p.kind
    const value = p.value
    this.release(index)

    const ctx = this.ctx
    switch (kind) {
      case 'xp': {
        ctx.progression.addXp(value)
        const pitch = this.xpChain.collect(ctx.time)
        if (pitch > 0) ctx.audio.play('xp', { pitch, volume: 0.55 })
        break
      }
      case 'gold': {
        ctx.addGold(value)
        const pitch = this.goldChain.collect(ctx.time)
        if (pitch > 0) ctx.audio.play('gold', { pitch, volume: 0.7 })
        break
      }
      case 'silver': {
        ctx.run.silver += value * ctx.progression.stats.silverGain
        const pitch = this.goldChain.collect(ctx.time)
        if (pitch > 0) ctx.audio.play('gold', { pitch: pitch * 1.35, volume: 0.7 })
        break
      }
      case 'health':
        ctx.player.heal(value)
        ctx.audio.play('heal')
        break
      case 'magnet':
        this.magnetAll()
        ctx.ui.toast('Magnet!', '#4aa8ff')
        ctx.audio.play('shrine', { pitch: 1.4 })
        break
      case 'bomb':
        this.detonate()
        break
      case 'chestKey':
        ctx.audio.play('gold', { pitch: 0.8 })
        break
    }
    ctx.events.emit('pickup', { kind, value })
  }

  private detonate(): void {
    const ctx = this.ctx
    const center = ctx.player.pos.clone()
    this.hits.length = 0
    const hits = ctx.enemies.queryRadius(center, BOMB_RADIUS, this.hits)
    for (const enemy of hits) {
      if (!enemy.alive) continue
      const push = new THREE.Vector3(enemy.pos.x - center.x, 0, enemy.pos.z - center.z)
      const len = push.length()
      if (len > 1e-3) push.multiplyScalar(14 / len)
      ctx.enemies.damage(enemy, BOMB_DAMAGE, { source: 'bomb', noProcs: true, knockback: push })
    }
    this.hits.length = 0
    ctx.fx.ring(center, BOMB_RADIUS, '#ff8a3d', 0.6)
    ctx.fx.ring(center, BOMB_RADIUS * 0.6, '#ffe066', 0.4)
    ctx.fx.burst(center.clone().setY(center.y + 1), '#ffb347', 40, 12, 0.4)
    ctx.fx.flash('#ffd9a0', 0.35)
    ctx.fx.shake(0.7)
    ctx.audio.play('explode', { volume: 1 })
  }

  /** Swap-removes the pickup at `index` and returns it to the pool. */
  private release(index: number): void {
    const p = this.active[index]
    const last = this.active.pop()!
    if (index < this.active.length) this.active[index] = last
    this.perKind[p.kind]--
    this.pool.push(p)
  }

  private draw(): void {
    const time = this.ctx.time
    const counts = this.lookCounts
    counts.fill(0)
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i]
      const look = LOOKS[p.look]
      const slot = counts[p.look]
      if (slot >= look.capacity) continue
      counts[p.look] = slot + 1

      this.at.copy(p.pos)
      if (p.state === State.Rest) this.at.y += Math.sin(time * 2.6 + p.phase) * look.bob
      this.quat.setFromAxisAngle(UP, time * look.spin + p.phase)
      let s = look.scale * popScale(p.age)
      if (p.kind === 'gold' || p.kind === 'silver') s *= valueScale(p.value)
      this.scale.setScalar(s)
      this.meshes[p.look].setMatrixAt(slot, this.matrix.compose(this.at, this.quat, this.scale))
    }
    for (let i = 0; i < this.meshes.length; i++) flush(this.meshes[i], counts[i])
  }
}
