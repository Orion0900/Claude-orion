/**
 * Chase camera orbiting behind the player. Look input turns it instantly
 * (no mouse smoothing); only the follow point, boom length and FOV ease.
 * Movement input is relative to its yaw.
 */
import * as THREE from 'three'
import type { CameraApi, GameContext } from '../game/types'
import { wrapAngle, yawOf } from '../player/movement'
import {
  BASE_DISTANCE,
  DEFAULT_PITCH,
  SPEED_DISTANCE,
  approach,
  boomDirection,
  clampPitch,
  clearBoom,
  fovFor,
  speedFactor,
} from './cameraMath'

/** Look-at point above the feet; the player sits a little below screen centre. */
const LOOK_HEIGHT = 1.4
/** How far the view drops while sliding. */
const SLIDE_DROP = 0.55
const CLEARANCE = 0.45
const MIN_BOOM = 1.2
const FOLLOW_RATE = 16
/** Vertical follow is lazier so jumps don't bob the whole view. */
const FOLLOW_RATE_Y = 9
/** The boom snaps in when the ground intrudes and relaxes back out at this rate. */
const BOOM_RELAX = 4
/** Further than this from the player, the follow point jumps rather than glides (stage change). */
const SNAP_DISTANCE = 20
const DEAD_ORBIT = 0.3
const DEAD_PITCH = 0.6
/** Touch: seconds after the last look drag before auto-turning starts, its rate, and the widest turn it attempts. */
const AUTO_DELAY = 0.6
const AUTO_RATE = 1.1
const AUTO_MAX_ANGLE = 2.4

export class ThirdPersonCamera implements CameraApi {
  readonly camera: THREE.PerspectiveCamera
  private readonly ctx: GameContext
  private _yaw = 0
  private _pitch = DEFAULT_PITCH
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

  get pitch(): number {
    return this._pitch
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
      if (look.yaw !== 0 || look.pitch !== 0) this.sinceLook = 0
      else this.sinceLook += step

      if (player.alive) {
        this._yaw = wrapAngle(this._yaw - look.yaw)
        this._pitch = clampPitch(this._pitch + look.pitch)
        // Touch players steer with one thumb, so the view drifts round to where they're running.
        if (input.isTouch && this.sinceLook > AUTO_DELAY && speed > 2) {
          const diff = wrapAngle(yawOf(v.x, v.z) - this._yaw)
          if (Math.abs(diff) < AUTO_MAX_ANGLE) {
            this._yaw = wrapAngle(this._yaw + diff * (1 - Math.exp(-AUTO_RATE * Math.min(1, speed / 7) * step)))
          }
        }
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
    this.place(0)
  }

  private realStep(): number {
    const now = performance.now()
    const step = this.lastReal > 0 ? Math.min(0.1, (now - this.lastReal) / 1000) : 0
    this.lastReal = now
    return step
  }

  private place(dt: number): void {
    const t = this.target.set(this.focus.x, this.focus.y + LOOK_HEIGHT - this.drop, this.focus.z)
    const dir = boomDirection(this._yaw, this._pitch, this.dir)
    const allowed = clearBoom(t, dir, BASE_DISTANCE + SPEED_DISTANCE * this.speedT, this.heightAt, CLEARANCE, MIN_BOOM)
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
