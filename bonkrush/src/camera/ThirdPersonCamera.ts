/**
 * Chase camera orbiting behind the player. Look input turns it instantly
 * (no mouse smoothing); only the follow point, boom length, terrain floor
 * and FOV ease. Movement input is relative to its yaw.
 */
import * as THREE from 'three'
import type { CameraApi, GameContext } from '../game/types'
import { wrapAngle } from '../player/movement'
import {
  BASE_DISTANCE,
  DEFAULT_PITCH,
  MIN_BOOM,
  PITCH_MAX,
  PITCH_MIN,
  SPEED_DISTANCE,
  approach,
  autoFollowTurn,
  boomDirection,
  clampPitch,
  clearBoom,
  clearPitch,
  fovFor,
  speedFactor,
} from './cameraMath'

/** Look-at point above the feet; the player sits a little below screen centre. */
const LOOK_HEIGHT = 1.4
/** How far the view drops while sliding. */
const SLIDE_DROP = 0.55
const CLEARANCE = 0.45
/**
 * The terrain floor aims for this much extra clearance, so the view rises a
 * little before the ground actually reaches the boom rather than after.
 */
const FLOOR_MARGIN = 0.35
/** How fast the floor rises over rising ground, and settles back once it's clear (per second). */
const FLOOR_RATE = 5
const FLOOR_RELAX = 2
const FOLLOW_RATE = 16
/** Vertical follow is lazier so jumps don't bob the whole view. */
const FOLLOW_RATE_Y = 9
/** The boom snaps in when the ground intrudes and relaxes back out at this rate. */
const BOOM_RELAX = 4
/** Further than this from the player, the follow point jumps rather than glides (stage change). */
const SNAP_DISTANCE = 20
const DEAD_ORBIT = 0.3
const DEAD_PITCH = 0.6

export class ThirdPersonCamera implements CameraApi {
  readonly camera: THREE.PerspectiveCamera
  private readonly ctx: GameContext
  private _yaw = 0
  /** The player's own pitch. The view never goes below `floor`, but terrain alone never changes this. */
  private _pitch = DEFAULT_PITCH
  /**
   * The lowest pitch whose boom clears the ground behind the player, eased.
   * An absolute floor rather than an offset, so look input above it is
   * instant and nothing drifts back afterwards.
   */
  private floor = PITCH_MIN
  private readonly focus = new THREE.Vector3()
  private readonly target = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private boom = BASE_DISTANCE
  private speedT = 0
  private drop = 0
  private sinceLook = 99
  private lastReal = 0
  private readonly heightAt: (x: number, z: number) => number

  constructor(ctx: GameContext, camera: THREE.PerspectiveCamera) {
    this.ctx = ctx
    this.camera = camera
    // Looks the world up on every call: it is replaced between stages.
    this.heightAt = (x, z) => this.ctx.world.heightAt(x, z)
    this.snap()
  }

  get yaw(): number {
    return this._yaw
  }

  /** The pitch the view actually has, terrain floor included. */
  get pitch(): number {
    return Math.min(PITCH_MAX, Math.max(this._pitch, this.floor))
  }

  update(dt: number): void {
    const { player, input } = this.ctx
    const v = player.vel
    const speed = player.alive ? Math.hypot(v.x, v.z) : 0
    // The game pauses behind the game-over screen; the camera keeps circling the body on real time.
    if (player.alive) this.lastReal = 0
    const step = player.alive ? dt : this.realStep()

    if (step > 0) {
      const look = input.state.look
      // A thumb resting on the look zone is holding the view even while it doesn't move.
      if (look.yaw !== 0 || look.pitch !== 0 || (input.isTouch && input.looking)) this.sinceLook = 0
      else this.sinceLook += step

      if (player.alive) {
        this._yaw = wrapAngle(this._yaw - look.yaw)
        this.turnPitch(look.pitch)
        // Touch players steer with one thumb, so the view eases in behind where they're running.
        if (input.isTouch) this._yaw = wrapAngle(this._yaw + autoFollowTurn(this._yaw, v, input.state.move, this.sinceLook, step))
      } else {
        this._yaw = wrapAngle(this._yaw + DEAD_ORBIT * step)
        this._pitch = approach(this._pitch, DEAD_PITCH, 1, step)
      }

      const p = player.pos
      if (this.focus.distanceToSquared(p) > SNAP_DISTANCE * SNAP_DISTANCE) {
        this.focus.copy(p)
      } else {
        this.focus.x = approach(this.focus.x, p.x, FOLLOW_RATE, step)
        this.focus.z = approach(this.focus.z, p.z, FOLLOW_RATE, step)
        this.focus.y = approach(this.focus.y, p.y, FOLLOW_RATE_Y, step)
      }
      this.speedT = approach(this.speedT, speedFactor(speed), 3, step)
      this.drop = approach(this.drop, player.sliding ? SLIDE_DROP : 0, 10, step)
    }
    this.place(step)
  }

  /**
   * Vertical look works on the view the player sees: raising starts from the
   * floor when the ground is holding the view up, and lowering stops at the
   * floor instead of banking input that would show up later.
   */
  private turnPitch(d: number): void {
    if (d > 0) this._pitch = clampPitch(Math.max(this._pitch, this.floor) + d)
    else if (d < 0) this._pitch = clampPitch(Math.max(this._pitch + d, Math.min(this._pitch, this.floor)))
  }

  snap(): void {
    const player = this.ctx.player
    this.lastReal = 0
    this._yaw = wrapAngle(player.yaw)
    this._pitch = DEFAULT_PITCH
    this.focus.copy(player.pos)
    this.speedT = 0
    this.drop = 0
    this.sinceLook = 99
    this.boom = BASE_DISTANCE + SPEED_DISTANCE
    this.place(0, true)
  }

  private realStep(): number {
    const now = performance.now()
    const step = this.lastReal > 0 ? Math.min(0.1, (now - this.lastReal) / 1000) : 0
    this.lastReal = now
    return step
  }

  private place(dt: number, snap = false): void {
    const t = this.target.set(this.focus.x, this.focus.y + LOOK_HEIGHT - this.drop, this.focus.z)
    const len = BASE_DISTANCE + SPEED_DISTANCE * this.speedT
    // Rising ground behind the player lifts the view over it first; the boom
    // only shortens (down to MIN_BOOM) once even the steepest view is blocked.
    const want = clearPitch(t, this._yaw, PITCH_MIN, len, this.heightAt, CLEARANCE + FLOOR_MARGIN)
    if (snap) this.floor = want
    else if (dt > 0) this.floor = approach(this.floor, want, want > this.floor ? FLOOR_RATE : FLOOR_RELAX, dt)
    const dir = boomDirection(this._yaw, this.pitch, this.dir)
    const allowed = clearBoom(t, dir, len, this.heightAt, CLEARANCE, MIN_BOOM)
    // Pull in at once so the ground never hides the player; ease back out.
    if (allowed < this.boom) this.boom = allowed
    else if (dt > 0) this.boom = approach(this.boom, allowed, BOOM_RELAX, dt)

    const cam = this.camera
    cam.position.set(t.x + dir.x * this.boom, t.y + dir.y * this.boom, t.z + dir.z * this.boom)
    const floor = this.heightAt(cam.position.x, cam.position.z) + CLEARANCE
    if (cam.position.y < floor) cam.position.y = floor
    cam.lookAt(t)
    // Shake moves the view without turning it.
    cam.position.add(this.ctx.fx.shakeOffset)

    const fov = fovFor(this.speedT)
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  }
}
