/**
 * The player: movement (see `movement.ts`), health, shield and the
 * animated model. Other systems reach it through `ctx.player`.
 */
import * as THREE from 'three'
import type { Rng } from '../core/rng'
import type { GameContext, InputApi, PlayerApi, StageDef, Vec3 } from '../game/types'
import { StepClock, choosePose, computePose, createPose } from './animation'
import {
  applyImpulse,
  createMoveEvents,
  createMoveState,
  resetAirState,
  stepMovement,
  wrapAngle,
  yawOf,
  type MoveEvents,
  type MoveInput,
  type MoveParams,
  type MoveState,
} from './movement'
import { createCharacterModel, type CharacterRig } from './PlayerModel'
import { IFRAMES, STOPWATCH_IFRAMES, knockbackSpeed, rechargeShield, resolveHeal, resolveHit } from './vitals'

const RADIUS = 0.5
/** How fast the body turns to face where it's going (per second, exponential). */
const TURN_RATE = 14
/** Landing faster than this (m/s down) thumps. A normal jump lands at 10. */
const HARD_LANDING = 13
const DUST_INTERVAL = 0.07
const DEATH_FALL_TIME = 0.5
/** A position change bigger than this between frames is a teleport, not movement. */
const TELEPORT_DISTANCE = 6
const BLINK_RATE = 16

/** Our `Input` shows its touch Interact button only while something is in reach. */
interface InteractHint {
  setInteractHint(visible: boolean): void
}

function hasInteractHint(input: InputApi): input is InputApi & InteractHint {
  return typeof (input as Partial<InteractHint> & InputApi).setInteractHint === 'function'
}

const UP = new THREE.Vector3(0, 1, 0)
const WHITE = new THREE.Color('#ffffff')

export class Player implements PlayerApi {
  readonly radius = RADIUS
  hp: number
  shield: number

  private readonly ctx: GameContext
  private readonly rng: Rng
  private readonly move: MoveState
  private readonly moveInput: MoveInput = { moveX: 0, moveY: 0, yaw: 0, jumpPressed: false, slideHeld: false }
  private readonly moveParams: MoveParams = { moveSpeed: 1, jumpHeight: 1, extraJumps: 0 }
  private readonly moveEvents: MoveEvents = createMoveEvents()
  private facing = 0
  private dead = false
  private iframes = 0
  /** Stopwatch save: nothing at all hurts, falls included, so the save can't be undone a frame later. */
  private invulnerable = 0
  private sinceHit = 99
  /** Blink only after real hits; a dodge's i-frames stay invisible. */
  private blink = false
  private flashOn = false
  private lastMaxHp: number
  private lastShieldStat: number
  private rig: CharacterRig
  private rigFor: string
  private readonly clock = new StepClock()
  private readonly pose = createPose()
  private runPhase = 0
  private deathTime = 0
  private dustTimer = 0
  private dustColor = '#efe3c8'
  private dustStage: StageDef | null = null
  private readonly lastPos = new THREE.Vector3()
  private hintShown = false
  private readonly shadow: THREE.Mesh
  private readonly shadowMaterial: THREE.MeshBasicMaterial
  private readonly offStats: () => void
  /** Scratch vectors for fx positions; a small ring so fx that keep a reference briefly stay correct. */
  private readonly fxPos = Array.from({ length: 8 }, () => new THREE.Vector3())
  private fxIndex = 0
  private readonly normal = new THREE.Vector3()

  constructor(ctx: GameContext) {
    this.ctx = ctx
    this.rng = ctx.rng.fork(0x9a7e1)
    const start = ctx.world.spots.playerStart
    this.move = createMoveState(start)
    this.lastPos.copy(start)
    // Face the middle of the map, where the action starts.
    if (Math.hypot(start.x, start.z) > 1) this.facing = yawOf(-start.x, -start.z)

    const stats = ctx.progression.stats
    this.hp = stats.maxHp
    this.shield = stats.shield
    this.lastMaxHp = stats.maxHp
    this.lastShieldStat = stats.shield

    this.rig = createCharacterModel(ctx.character)
    this.rigFor = ctx.character.id
    ctx.scene.add(this.rig.root)

    this.shadowMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.shadow = new THREE.Mesh(createBlobGeometry(0.62), this.shadowMaterial)
    this.shadow.renderOrder = 1
    ctx.scene.add(this.shadow)

    this.offStats = ctx.events.on('statsChanged', () => this.syncStats())
    this.placeModel()
  }

  get pos(): Vec3 {
    return this.move.pos
  }

  get vel(): Vec3 {
    return this.move.vel
  }

  get yaw(): number {
    return this.facing
  }

  get onGround(): boolean {
    return this.move.onGround
  }

  get sliding(): boolean {
    return this.move.sliding
  }

  get alive(): boolean {
    return !this.dead
  }

  // ─────────────────────────── health ───────────────────────────

  hurt(amount: number, source: string, from?: Vec3): number {
    return this.takeDamage(amount, source, from, true)
  }

  heal(amount: number): void {
    if (this.dead || !(amount > 0)) return
    const stats = this.ctx.progression.stats
    const r = resolveHeal(this.hp, stats.maxHp, this.shield, amount, stats.overheal)
    this.hp = r.hp
    this.shield = r.shield
    if (r.healed <= 0 && r.shieldGained <= 0) return
    this.ctx.events.emit('playerHealed', { amount: r.healed })
    if (r.healed >= 0.5) this.ctx.fx.number(this.headPos(), `+${Math.round(r.healed)}`, 'heal')
  }

  refresh(): void {
    this.syncStats()
    if (this.rigFor !== this.ctx.character.id) {
      this.rig.dispose()
      this.rig = createCharacterModel(this.ctx.character)
      this.rigFor = this.ctx.character.id
      this.ctx.scene.add(this.rig.root)
      this.flashOn = false
    }
    // Game calls this right after moving us to a new stage's start.
    this.checkTeleport(0.01)
    this.placeModel()
  }

  // ─────────────────────────── frame ───────────────────────────

  update(dt: number): void {
    if (!(dt > 0)) return
    const ctx = this.ctx
    const stats = ctx.progression.stats
    if (stats.maxHp !== this.lastMaxHp || stats.shield !== this.lastShieldStat || !Number.isFinite(this.hp)) this.syncStats()
    this.checkTeleport(TELEPORT_DISTANCE)

    this.iframes = Math.max(0, this.iframes - dt)
    this.invulnerable = Math.max(0, this.invulnerable - dt)
    this.sinceHit += dt
    if (!this.dead) {
      if (stats.regen > 0 && this.hp < stats.maxHp) this.hp = Math.min(stats.maxHp, this.hp + stats.regen * dt)
      this.shield = rechargeShield(this.shield, stats.shield, this.sinceHit, dt)
    }

    const input = ctx.input.state
    const mi = this.moveInput
    const alive = !this.dead
    mi.moveX = alive ? input.move.x : 0
    mi.moveY = alive ? input.move.y : 0
    mi.jumpPressed = alive && input.jumpPressed
    mi.slideHeld = alive && input.slideHeld
    // The camera is built after the player; until its first update, face-relative input is fine.
    mi.yaw = ctx.camera?.yaw ?? this.facing
    this.moveParams.moveSpeed = stats.moveSpeed
    this.moveParams.jumpHeight = stats.jumpHeight
    this.moveParams.extraJumps = stats.extraJumps

    const ev = stepMovement(this.move, mi, this.moveParams, ctx.world, dt, RADIUS, this.moveEvents)
    this.lastPos.copy(this.move.pos)
    if (alive) this.react(ev, dt)

    this.turn(dt)
    this.animate(dt)
    this.updateHint()
  }

  dispose(): void {
    this.offStats()
    this.rig.dispose()
    this.ctx.scene.remove(this.shadow)
    this.shadow.geometry.dispose()
    this.shadowMaterial.dispose()
    if (this.hintShown && hasInteractHint(this.ctx.input)) this.ctx.input.setInteractHint(false)
    this.hintShown = false
  }

  // ─────────────────────────── internals ───────────────────────────

  private takeDamage(amount: number, source: string, from: Vec3 | undefined, dodgeable: boolean): number {
    const ctx = this.ctx
    if (this.dead || !(amount > 0) || this.invulnerable > 0) return 0
    if (dodgeable && this.iframes > 0) return 0
    const stats = ctx.progression.stats
    if (dodgeable && stats.evasion > 0 && this.rng.chance(stats.evasion)) {
      // A dodge also grants i-frames, or a crowd would re-roll evasion every frame.
      this.iframes = IFRAMES
      this.blink = false
      ctx.events.emit('playerDodged', {})
      ctx.fx.number(this.headPos(), 'DODGE', 'info')
      return 0
    }

    const hit = resolveHit(amount, stats.armor, this.shield)
    this.shield -= hit.absorbed
    this.sinceHit = 0
    if (dodgeable) {
      this.iframes = IFRAMES
      this.blink = true
    }
    if (from) this.knockback(from, hit.total)

    if (hit.toHp >= this.hp) {
      if (ctx.progression.tryCheatDeath()) {
        this.hp = 1
        this.invulnerable = STOPWATCH_IFRAMES
        this.blink = true
      } else {
        this.hp = 0
        ctx.fx.flash('#ff2a2a', 0.5)
        ctx.fx.shake(0.6)
        this.die()
        return hit.total
      }
    } else {
      this.hp -= hit.toHp
    }
    ctx.events.emit('playerDamaged', { amount: hit.total, source })
    ctx.fx.flash('#ff2a2a', 0.35)
    ctx.fx.shake(0.4)
    ctx.audio.play('hurt')
    ctx.fx.number(this.headPos(), String(Math.max(1, Math.round(hit.total))), 'player')
    return hit.total
  }

  private knockback(from: Vec3, damage: number): void {
    let dx = this.move.pos.x - from.x
    let dz = this.move.pos.z - from.z
    let d = Math.hypot(dx, dz)
    if (d < 1e-4) {
      // Hit from dead centre: get shoved backwards.
      dx = Math.sin(this.facing)
      dz = Math.cos(this.facing)
      d = 1
    }
    const kb = knockbackSpeed(damage)
    applyImpulse(this.move, (dx / d) * kb, kb >= 8 ? 4 : 0, (dz / d) * kb)
  }

  private die(): void {
    if (this.dead) return
    this.dead = true
    this.iframes = 0
    this.invulnerable = 0
    this.deathTime = 0
    // Game plays the death sting when it hears this.
    this.ctx.events.emit('playerDied', {})
  }

  private react(ev: MoveEvents, dt: number): void {
    const ctx = this.ctx
    if (ev.jumped) {
      ctx.events.emit('playerJumped', { airJump: ev.airJump })
      ctx.audio.play('jump', { pitch: ev.airJump ? 1.25 : 1 })
      if (ev.airJump) {
        ctx.fx.ring(this.move.pos.clone(), 1.4, '#ffffff', 0.35)
        ctx.fx.burst(this.feetPos(), '#ffffff', 8, 3, 0.25)
      }
    }
    if (ev.slideStarted) {
      ctx.events.emit('playerSlid', {})
      ctx.audio.play('slide')
    }
    if (ev.landed) {
      // Brief hops over bumps aren't landings anyone cares about.
      if (ev.airTime > 0.15 || ev.landSpeed > 6) ctx.events.emit('playerLanded', { speed: ev.landSpeed })
      if (ev.landSpeed > HARD_LANDING) {
        ctx.audio.play('land', { volume: Math.min(1, ev.landSpeed / 25) })
        ctx.fx.burst(this.feetPos(), this.dust(), 10, 4, 0.35)
        ctx.fx.shake(Math.min(0.5, (ev.landSpeed - HARD_LANDING) * 0.04))
      }
      if (ev.fallDamage > 0) this.takeDamage(ev.fallDamage, 'fall', undefined, false)
    }

    const speed = Math.hypot(this.move.vel.x, this.move.vel.z)
    if (this.move.sliding && speed > 4) {
      this.dustTimer -= dt
      if (this.dustTimer <= 0) {
        this.dustTimer = DUST_INTERVAL
        ctx.fx.burst(this.feetPos(), this.dust(), 2, 1.5 + speed * 0.05, 0.22)
      }
    } else {
      this.dustTimer = 0
    }
  }

  private turn(dt: number): void {
    if (this.dead) return
    const v = this.move.vel
    const speed = Math.hypot(v.x, v.z)
    let target = this.facing
    if (speed > 0.8) {
      target = yawOf(v.x, v.z)
    } else {
      const mi = this.moveInput
      if (Math.abs(mi.moveX) + Math.abs(mi.moveY) > 0.1) {
        const sin = Math.sin(mi.yaw)
        const cos = Math.cos(mi.yaw)
        target = yawOf(cos * mi.moveX - sin * mi.moveY, -sin * mi.moveX - cos * mi.moveY)
      }
    }
    const diff = wrapAngle(target - this.facing)
    this.facing = wrapAngle(this.facing + diff * (1 - Math.exp(-TURN_RATE * dt)))
  }

  private animate(dt: number): void {
    const m = this.move
    const speed = Math.hypot(m.vel.x, m.vel.z)
    // Stride rate follows speed but tops out, so a fast slide-hop doesn't blur the legs.
    this.runPhase = (this.runPhase + Math.min(speed * 0.36, 3.4) * dt) % 1
    if (this.dead) this.deathTime += dt
    if (this.clock.tick(dt)) {
      const name = choosePose(!this.dead, m.onGround, m.sliding, m.airTime, speed)
      computePose(name, this.runPhase, this.ctx.time, m.vel.y, this.pose)
      this.rig.applyPose(this.pose)
      // Tipping over steps with the pose, like the rest of the stop-motion.
      const t = Math.min(1, this.deathTime / DEATH_FALL_TIME)
      this.rig.tilt.rotation.x = this.dead ? -t * t * (Math.PI / 2) : 0
    }

    const safe = Math.max(this.iframes, this.invulnerable)
    const flash = this.blink && safe > 0 && Math.floor(safe * BLINK_RATE) % 2 === 0
    if (flash !== this.flashOn) {
      this.flashOn = flash
      this.rig.material.emissive.setScalar(flash ? 0.6 : 0)
    }
    this.placeModel()
  }

  private placeModel(): void {
    const p = this.move.pos
    this.rig.root.position.copy(p)
    // The model's front is +Z; yaw 0 faces -Z.
    this.rig.root.rotation.y = this.facing + Math.PI

    const world = this.ctx.world
    const ground = world.heightAt(p.x, p.z)
    world.normalAt(p.x, p.z, this.normal)
    this.shadow.position.set(p.x, ground + 0.04, p.z)
    this.shadow.quaternion.setFromUnitVectors(UP, this.normal)
    const lift = Math.max(0, p.y - ground)
    const k = 1 / (1 + lift * 0.2)
    this.shadow.scale.setScalar(k * (this.move.sliding ? 1.25 : 1))
    this.shadowMaterial.opacity = k
  }

  private syncStats(): void {
    const s = this.ctx.progression.stats
    if (s.maxHp !== this.lastMaxHp) {
      if (s.maxHp > this.lastMaxHp && !this.dead) this.hp += s.maxHp - this.lastMaxHp
      this.lastMaxHp = s.maxHp
    }
    if (s.shield !== this.lastShieldStat) {
      if (s.shield > this.lastShieldStat && !this.dead) this.shield += s.shield - this.lastShieldStat
      this.lastShieldStat = s.shield
    }
    if (!Number.isFinite(this.hp)) this.hp = this.dead ? 0 : s.maxHp
    if (!Number.isFinite(this.shield)) this.shield = 0
    this.hp = Math.min(this.hp, s.maxHp)
  }

  /**
   * Game moves us between stages by writing `pos`; a move we didn't make
   * forgets the old air state so it can't turn into fall damage.
   */
  private checkTeleport(threshold: number): void {
    const p = this.move.pos
    if (p.distanceToSquared(this.lastPos) > threshold * threshold) {
      resetAirState(this.move)
      this.lastPos.copy(p)
    }
  }

  private updateHint(): void {
    const input = this.ctx.input
    if (!hasInteractHint(input)) return
    // A charge shrine's progress is only information: there's nothing to tap.
    const prompt = this.ctx.interactables.prompt
    const show = !this.dead && prompt !== null && !prompt.passive
    if (show === this.hintShown) return
    this.hintShown = show
    input.setInteractHint(show)
  }

  private dust(): string {
    const stage = this.ctx.stage
    if (stage !== this.dustStage) {
      this.dustStage = stage
      this.dustColor = `#${new THREE.Color(stage.palette.groundHigh).lerp(WHITE, 0.45).getHexString()}`
    }
    return this.dustColor
  }

  private feetPos(): THREE.Vector3 {
    const v = this.fxPos[(this.fxIndex = (this.fxIndex + 1) % this.fxPos.length)]
    return v.copy(this.move.pos).setY(this.move.pos.y + 0.1)
  }

  /** Floating text may keep its position for its whole life, so it gets its own vector (hits are rare). */
  private headPos(): THREE.Vector3 {
    return new THREE.Vector3(this.move.pos.x, this.move.pos.y + this.rig.height + 0.2, this.move.pos.z)
  }
}

/** A soft round shadow: dark in the middle, fading to nothing at the rim (alpha in the vertex colours). */
function createBlobGeometry(radius: number): THREE.BufferGeometry {
  const segments = 20
  const rings: Array<[number, number]> = [
    [0, 0.5],
    [0.55, 0.38],
    [1, 0],
  ]
  const positions: number[] = []
  const colors: number[] = []
  for (const [r, a] of rings) {
    const count = r === 0 ? 1 : segments
    for (let i = 0; i < count; i++) {
      const t = (i / segments) * Math.PI * 2
      positions.push(Math.cos(t) * r * radius, 0, Math.sin(t) * r * radius)
      colors.push(0.04, 0.02, 0.08, a)
    }
  }
  const index: number[] = []
  for (let i = 0; i < segments; i++) {
    const a = 1 + i
    const b = 1 + ((i + 1) % segments)
    index.push(0, b, a)
    const c = a + segments
    const d = b + segments
    index.push(a, b, d, a, d, c)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4))
  geo.setIndex(index)
  return geo
}
