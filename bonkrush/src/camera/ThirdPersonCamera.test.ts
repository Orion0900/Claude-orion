import * as THREE from 'three'
import type { GameContext, InputState } from '../game/types'
import { createMoveState, stepMovement, wrapAngle, type Terrain } from '../player/movement'
import { AUTO_MAX_RATE, DEFAULT_PITCH, MIN_BOOM } from './cameraMath'
import { ThirdPersonCamera } from './ThirdPersonCamera'

const DT = 1 / 60
const PARAMS = { moveSpeed: 1, jumpHeight: 1, extraJumps: 0 }

function world(height: (x: number, z: number) => number): Terrain {
  return {
    heightAt: height,
    normalAt(x, z, out) {
      const e = 0.05
      const dx = (height(x + e, z) - height(x - e, z)) / (2 * e)
      const dz = (height(x, z + e) - height(x, z - e)) / (2 * e)
      return out.set(-dx, 1, -dz).normalize()
    },
  }
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
/** The map's rim along +Z, shaped like world/terrain.ts: rising from 78 m to 108 m by about 26 m. */
const RIM = world((_x, z) => Math.pow(smoothstep(78, 108, z), 1.5) * 26)
const FLAT = world(() => 0)

/** A camera over a stand-in player driven by the real movement step. */
function rig(terrain: Terrain, isTouch: boolean, at = new THREE.Vector3()) {
  const move = createMoveState(new THREE.Vector3(at.x, terrain.heightAt(at.x, at.z), at.z))
  move.onGround = true
  move.jumped = false
  const state: InputState = {
    move: { x: 0, y: 0 },
    look: { yaw: 0, pitch: 0 },
    jumpPressed: false,
    jumpHeld: false,
    slideHeld: false,
    interactPressed: false,
    pausePressed: false,
    tabHeld: false,
  }
  const input = { isTouch, looking: false, state }
  const player = { pos: move.pos, vel: move.vel, alive: true, sliding: false, yaw: 0 }
  const ctx = { player, input, world: terrain, fx: { shakeOffset: new THREE.Vector3() } } as unknown as GameContext
  const camera = new ThirdPersonCamera(ctx, new THREE.PerspectiveCamera())
  const step = () => {
    stepMovement(move, { moveX: state.move.x, moveY: state.move.y, yaw: camera.yaw, jumpPressed: false, slideHeld: false }, PARAMS, terrain, DT)
    camera.update(DT)
    state.look.yaw = 0
    state.look.pitch = 0
  }
  /** Distance from the camera to the point it looks at. */
  const boom = () => camera.camera.position.distanceTo(new THREE.Vector3(move.pos.x, move.pos.y + 1.4, move.pos.z))
  return { camera, move, state, input, step, boom }
}

describe('ThirdPersonCamera', () => {
  it('lifts the view over the rim instead of pulling into the character', () => {
    // Standing near the wall facing the middle of the map puts the camera toward the rim.
    for (const z of [84, 88, 92, 96]) {
      const r = rig(RIM, false, new THREE.Vector3(0, 0, z))
      r.camera.snap()
      for (let i = 0; i < 60; i++) r.step()
      expect(r.boom()).toBeGreaterThan(5.5)
      expect(r.camera.pitch).toBeGreaterThan(DEFAULT_PITCH)
      const cam = r.camera.camera.position
      expect(cam.y).toBeGreaterThan(RIM.heightAt(cam.x, cam.z))
    }
  })

  it('never lets the boom get shorter than the minimum', () => {
    const wall = world((_x, z) => (z > 1 ? 60 : 0))
    const r = rig(wall, false)
    r.camera.snap()
    for (let i = 0; i < 30; i++) r.step()
    expect(r.boom()).toBeGreaterThanOrEqual(MIN_BOOM - 1e-6)
  })

  it('rises smoothly and settles back once the ground is clear', () => {
    const r = rig(RIM, false, new THREE.Vector3(0, 0, 70))
    r.camera.snap()
    expect(r.camera.pitch).toBeCloseTo(DEFAULT_PITCH, 5)
    // Walk backwards toward the rim (the camera leads into it).
    r.state.move.y = -1
    let prev = r.camera.pitch
    let biggestJump = 0
    for (let i = 0; i < 240; i++) {
      r.step()
      biggestJump = Math.max(biggestJump, Math.abs(r.camera.pitch - prev))
      prev = r.camera.pitch
    }
    expect(r.move.pos.z).toBeGreaterThan(88)
    expect(r.camera.pitch).toBeGreaterThan(DEFAULT_PITCH + 0.2)
    expect(biggestJump).toBeLessThan(0.05)
    // Back to open ground: the player's own pitch returns.
    r.move.pos.set(0, 0, 0)
    for (let i = 0; i < 240; i++) r.step()
    expect(r.camera.pitch).toBeCloseTo(DEFAULT_PITCH, 2)
  })

  it('answers vertical look at once on open ground, with no dead range and no drift', () => {
    const r = rig(FLAT, false)
    r.camera.snap()
    // Push far past the lowest view the ground allows.
    r.state.look.pitch = -2
    r.step()
    const lowest = r.camera.pitch
    expect(lowest).toBeLessThan(DEFAULT_PITCH)
    for (let i = 0; i < 30; i++) r.step()
    expect(r.camera.pitch).toBeCloseTo(lowest, 6)
    // The first nudge back up shows straight away, all of it.
    r.state.look.pitch = 0.3
    r.step()
    expect(r.camera.pitch).toBeCloseTo(lowest + 0.3, 6)
    for (let i = 0; i < 120; i++) r.step()
    expect(r.camera.pitch).toBeCloseTo(lowest + 0.3, 6)
  })

  it('works from the view the rim holds up, and hands the player their pitch back after', () => {
    const r = rig(RIM, false, new THREE.Vector3(0, 0, 90))
    r.camera.snap()
    for (let i = 0; i < 60; i++) r.step()
    const held = r.camera.pitch
    expect(held).toBeGreaterThan(DEFAULT_PITCH + 0.2)
    // Lowering into the rim does nothing, now or later.
    r.state.look.pitch = -0.2
    r.step()
    expect(r.camera.pitch).toBeCloseTo(held, 3)
    for (let i = 0; i < 60; i++) r.step()
    expect(r.camera.pitch).toBeCloseTo(held, 3)
    r.move.pos.set(0, 0, 0)
    for (let i = 0; i < 240; i++) r.step()
    expect(r.camera.pitch).toBeCloseTo(DEFAULT_PITCH, 3)

    // Raising at the rim moves the view at once and it stays put.
    const s = rig(RIM, false, new THREE.Vector3(0, 0, 90))
    s.camera.snap()
    for (let i = 0; i < 60; i++) s.step()
    const before = s.camera.pitch
    s.state.look.pitch = 0.1
    s.step()
    expect(s.camera.pitch).toBeCloseTo(before + 0.1, 3)
    for (let i = 0; i < 60; i++) s.step()
    expect(s.camera.pitch).toBeCloseTo(before + 0.1, 3)
  })

  it('does not spin a touch player holding the stick sideways', () => {
    const r = rig(FLAT, true)
    r.state.move.x = 1
    const start = r.camera.yaw
    for (let i = 0; i < 600; i++) r.step()
    expect(Math.abs(wrapAngle(r.camera.yaw - start))).toBeLessThan(1e-9)
    // Ten seconds of strafing is a straight line, as on desktop.
    expect(Math.hypot(r.move.pos.x, r.move.pos.z)).toBeGreaterThan(65)
  })

  it('drifts a nearly-forward touch run gently, never faster than 40°/s', () => {
    const r = rig(FLAT, true)
    const ang = (12 * Math.PI) / 180
    r.state.move.x = Math.sin(ang)
    r.state.move.y = Math.cos(ang)
    let prev = r.camera.yaw
    let total = 0
    for (let i = 0; i < 600; i++) {
      r.step()
      const d = wrapAngle(r.camera.yaw - prev)
      expect(Math.abs(d)).toBeLessThanOrEqual(AUTO_MAX_RATE * DT + 1e-9)
      total += d
      prev = r.camera.yaw
    }
    const degPerSec = Math.abs(total) / 10 / (Math.PI / 180)
    expect(degPerSec).toBeGreaterThan(1)
    expect(degPerSec).toBeLessThan(15)
  })

  it('holds still while a thumb rests on the look zone', () => {
    const r = rig(FLAT, true)
    r.state.move.x = Math.sin(0.2)
    r.state.move.y = Math.cos(0.2)
    r.input.looking = true
    const start = r.camera.yaw
    for (let i = 0; i < 300; i++) r.step()
    expect(r.camera.yaw).toBe(start)
  })
})
